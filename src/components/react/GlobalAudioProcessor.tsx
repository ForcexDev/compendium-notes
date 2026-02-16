import { useEffect, useRef } from 'react';
import { useAppStore } from '../../lib/store';
import { processAudioForUpload } from '../../lib/audio-processor';
import { transcribeAudio, organizeNotes } from '../../lib/groq';
import { t } from '../../lib/i18n';
import { transcribeWithGemini, organizeNotesWithGemini, transcribeWithGeminiChunked, DURATION_THRESHOLD_CHUNKING } from '../../lib/gemini';
import { updateProjectState, db } from '../../lib/db';

export default function GlobalAudioProcessor() {
    const {
        file, apiKey, geminiKey, provider, locale,
        processingState, setProcessingState,
        setProcessingProgress, setCompressionInfo,
        setTranscription, setStep, setError,
        setOrganizedNotes, setAiStep, setTitle,
        currentProjectId, restoreSession,
        activeKey
    } = useAppStore();

    // Restaurar sesión al montar
    useEffect(() => {
        restoreSession();
    }, []);

    const processingRef = useRef(false);
    const abortControllerRef = useRef<AbortController | null>(null);

    // Cleanup al desmontar
    useEffect(() => {
        return () => {
            console.log('[Processor] Unmounting, aborting pending operations');
            abortControllerRef.current?.abort();
        };
    }, []);

    // Crear AbortController cuando inicia procesamiento
    useEffect(() => {
        if (file && processingState === 'compressing' && !processingRef.current) {
            abortControllerRef.current = new AbortController();
        }
    }, [file, processingState]);

    // Efecto principal de procesamiento
    useEffect(() => {
        if (!file || processingState !== 'compressing') {
            if (processingState === 'idle') {
                processingRef.current = false;
            }
            return;
        }

        if (processingRef.current) return;
        processingRef.current = true;

        const run = async () => {
            const signal = abortControllerRef.current?.signal;
            const isCancelled = () => signal?.aborted ?? false;

            // Obtener API key desencriptada
            const key = await activeKey();

            if (!key) {
                setError(locale === 'es' ? 'Falta API Key' : 'API Key missing');
                setProcessingState('error');
                setStep('upload');
                processingRef.current = false;
                return;
            }

            try {
                if (provider === 'gemini') {
                    await runGeminiFlow(key, isCancelled);
                } else {
                    await runGroqFlow(key, isCancelled);
                }
            } catch (err: any) {
                if (isCancelled()) {
                    console.log('[Processor] Process cancelled by user');
                    return;
                }
                console.error('[Processor] Error:', err);
                setError(err.message);
                setProcessingState('error');
                setStep('upload');
            } finally {
                processingRef.current = false;
                abortControllerRef.current = null;
            }
        };

        run();
    }, [file, processingState, apiKey, geminiKey, provider]);

    const runGeminiFlow = async (key: string, isCancelled: () => boolean) => {
        const flowStartTime = Date.now();

        try {
            console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
            console.log('[Gemini Flow] 🚀 Starting');
            console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');

            // PASO 1: Procesar audio
            const processingStart = Date.now();
            const processed = await processAudioForUpload(file!, (_stage, p) => {
                if (!isCancelled()) {
                    setProcessingProgress(p);
                    if (currentProjectId) {
                        updateProjectState(currentProjectId, {
                            step: 'upload',
                            subStep: 'compressing',
                            progress: p
                        });
                    }
                }
            }, {
                provider: 'gemini',
                forceCompression: file!.type.startsWith('video/')
            });

            const processingTime = ((Date.now() - processingStart) / 1000).toFixed(1);
            console.log(`[Gemini Flow] ✅ Audio processed (${processingTime}s)`);

            if (isCancelled()) return;

            // Mostrar info de compresión si aplica
            if (processed.wasCompressed) {
                const saved = Math.round((1 - processed.compressedSize / processed.originalSize) * 100);
                const sizeStr = (processed.compressedSize / (1024 * 1024)).toFixed(1);
                const label = file!.type.startsWith('video/')
                    ? t('notif.audio_extracted', locale)
                    : t('notif.audio_optimized', locale);
                setCompressionInfo(`${label}: ${sizeStr}MB (-${saved}%)`);
            }

            const durationMinutes = (processed.duration || 0) / 60;
            console.log(`[Gemini Flow] Duration: ${durationMinutes.toFixed(1)} min`);

            // PASO 2: Transcribir (con o sin chunking)
            const transcriptionStart = Date.now();
            setProcessingState('uploading');
            setProcessingProgress(0);

            let transcriptionResult: { text: string; tokensUsed: number };

            // 🎯 DECISIÓN DE RUTA: >= 20 min usa chunking
            if (durationMinutes >= DURATION_THRESHOLD_CHUNKING) {
                console.log(`[Gemini Flow] Using CHUNKED strategy (>= ${DURATION_THRESHOLD_CHUNKING} min)`);

                transcriptionResult = await transcribeWithGeminiChunked(
                    processed.wasChunked ? processed.chunks : processed.chunks[0],
                    key,
                    (p) => {
                        if (isCancelled()) return;
                        setProcessingState('transcribing');
                        if (currentProjectId) {
                            updateProjectState(currentProjectId, {
                                step: 'transcribing',
                                subStep: 'transcribing',
                                progress: p
                            });
                        }
                        setProcessingProgress(p);
                    },
                    processed.duration,
                    processed.chunkMetadata
                );
            } else {
                console.log(`[Gemini Flow] Using STANDARD strategy (< ${DURATION_THRESHOLD_CHUNKING} min)`);

                transcriptionResult = await transcribeWithGemini(
                    processed.chunks[0],
                    key,
                    (p) => {
                        if (isCancelled()) return;

                        if (p < 0.5) {
                            setProcessingState('uploading');
                            if (currentProjectId) {
                                updateProjectState(currentProjectId, {
                                    step: 'upload',
                                    subStep: 'uploading',
                                    progress: p
                                });
                            }
                        } else {
                            setProcessingState('transcribing');
                            if (currentProjectId) {
                                updateProjectState(currentProjectId, {
                                    step: 'transcribing',
                                    subStep: 'transcribing',
                                    progress: p
                                });
                            }
                        }
                        setProcessingProgress(p);
                    },
                    processed.duration || 0
                );
            }

            const transcriptionTime = ((Date.now() - transcriptionStart) / 1000).toFixed(1);
            console.log(`[Gemini Flow] ✅ Transcription (${transcriptionTime}s)`);

            if (isCancelled()) return;

            const text = transcriptionResult.text;

            if (!text || text.trim().length === 0) {
                throw new Error(locale === 'es'
                    ? 'La transcripción está vacía.'
                    : 'Transcription is empty.');
            }

            setTranscription(text);
            if (currentProjectId) {
                updateProjectState(currentProjectId, { transcription: text });
            }

            // PASO 3: Organizar notas
            const organizationStart = Date.now();
            setProcessingState('analyzing');
            setStep('ai-processing');
            setAiStep(0);

            const organizationResult = await organizeNotesWithGemini(text, key, (s) => {
                if (!isCancelled()) {
                    setAiStep(s);
                    if (currentProjectId) {
                        updateProjectState(currentProjectId, {
                            step: 'ai-processing',
                            progress: s / 5
                        });
                    }
                }
            });

            const organizationTime = ((Date.now() - organizationStart) / 1000).toFixed(1);
            console.log(`[Gemini Flow] ✅ Organization (${organizationTime}s)`);

            if (isCancelled()) return;

            const notes = organizationResult.notes;

            // Extraer título
            let cleanNotes = notes;
            const titleMatch = notes.match(/^#\s+(.+)/m);
            if (titleMatch) {
                const extractedTitle = titleMatch[1].trim();
                setTitle(extractedTitle);
                cleanNotes = notes.replace(/^#\s+.+\n+/, '').trim();
            }

            setOrganizedNotes(cleanNotes);
            setProcessingState('done');

            // Actualizar DB
            if (currentProjectId) {
                updateProjectState(currentProjectId, {
                    step: 'editor',
                    subStep: 'done',
                    progress: 1,
                    organizedNotes: cleanNotes,
                    metadata: {
                        processingMode: durationMinutes >= DURATION_THRESHOLD_CHUNKING ? 'chunked-transcription' : 'standard-transcription',
                        durationMinutes: durationMinutes.toFixed(1)
                    }
                });
                db.projects.update(currentProjectId, {
                    status: 'done',
                    title: titleMatch?.[1]?.trim() || 'Untitled Note'
                });
            }

            setStep('editor');

            const totalTime = ((Date.now() - flowStartTime) / 1000).toFixed(1);
            const totalTokens = transcriptionResult.tokensUsed + organizationResult.tokensUsed;

            // LOG FINAL CON RESUMEN DE TOKENS
            console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
            console.log('[Gemini Flow] ✅ COMPLETE');
            console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
            console.log(`[Gemini Flow] Total time: ${totalTime}s`);
            console.log(`[Gemini Flow] Breakdown:`);
            console.log(`  • Processing: ${processingTime}s`);
            console.log(`  • Transcription: ${transcriptionTime}s`);
            console.log(`  • Organization: ${organizationTime}s`);
            console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
            console.log(`[Gemini Flow] 🎯 TOTAL OUTPUT TOKENS: ${totalTokens.toLocaleString()}`);
            console.log(`  • Transcription: ${transcriptionResult.tokensUsed.toLocaleString()}`);
            console.log(`  • Organization: ${organizationResult.tokensUsed.toLocaleString()}`);
            console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');

        } catch (err: any) {
            throw err;
        }
    };

    const runGroqFlow = async (key: string, isCancelled: () => boolean) => {
        try {
            console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
            console.log('[Groq Flow] 🚀 Starting');
            console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');

            // PASO 1: Procesar audio (comprimir y chunkear si es necesario)
            setProcessingState('compressing');
            const processed = await processAudioForUpload(file!, (_stage, p) => {
                if (!isCancelled()) {
                    setProcessingProgress(p);
                    if (currentProjectId) {
                        updateProjectState(currentProjectId, {
                            step: 'upload',
                            subStep: 'compressing',
                            progress: p
                        });
                    }
                }
            }, {
                provider: 'groq',
                forceCompression: file!.type.startsWith('video/')
            });

            if (isCancelled()) return;

            // Mostrar info de compresión
            if (processed.wasCompressed) {
                const saved = Math.round((1 - processed.compressedSize / processed.originalSize) * 100);
                const sizeStr = (processed.compressedSize / (1024 * 1024)).toFixed(1);
                const label = file!.type.startsWith('video/')
                    ? t('notif.audio_extracted', locale)
                    : t('notif.audio_optimized', locale);
                const fragmentsLabel = t('notif.chunks', locale);

                setCompressionInfo(
                    `${label}: ${sizeStr}MB (-${saved}%)${processed.wasChunked ? ` · ${processed.chunks.length} ${fragmentsLabel}` : ''}`
                );
            }

            // PASO 2: Transcribir con Groq (Whisper)
            setProcessingState('transcribing');
            setProcessingProgress(0.05);
            if (currentProjectId) {
                updateProjectState(currentProjectId, {
                    step: 'transcribing',
                    subStep: 'initializing',
                    progress: 0.05
                });
            }

            const text = await transcribeAudio(processed.chunks, key, (p) => {
                if (!isCancelled()) {
                    setProcessingProgress(p);
                    if (currentProjectId) {
                        updateProjectState(currentProjectId, {
                            step: 'transcribing',
                            progress: p
                        });
                    }
                }
            });

            if (isCancelled()) return;

            console.log('[Groq Flow] Transcription complete:', text.length, 'chars');

            if (!text || text.trim().length === 0) {
                throw new Error(locale === 'es'
                    ? 'La transcripción está vacía.'
                    : 'Transcription is empty.');
            }

            setTranscription(text);
            if (currentProjectId) {
                updateProjectState(currentProjectId, { transcription: text });
            }

            // PASO 3: Organizar notas con Groq
            setProcessingState('analyzing');
            setStep('ai-processing');
            setAiStep(0);

            const notes = await organizeNotes(text, key, (s) => {
                if (!isCancelled()) {
                    setAiStep(s);
                    if (currentProjectId) {
                        updateProjectState(currentProjectId, {
                            step: 'ai-processing',
                            progress: s / 5
                        });
                    }
                }
            });

            if (isCancelled()) return;

            // Extraer título
            let cleanNotes = notes;
            const titleMatch = notes.match(/^## Título\s*\n(.+)/m);
            if (titleMatch) {
                const extractedTitle = titleMatch[1].trim().replace(/\*\*/g, '');
                setTitle(extractedTitle);
                cleanNotes = notes.replace(/^## Título\s*\n.+\n*/m, '').trim();
            }

            setOrganizedNotes(cleanNotes);
            setProcessingState('done');

            // Actualizar DB
            if (currentProjectId) {
                updateProjectState(currentProjectId, {
                    step: 'editor',
                    subStep: 'done',
                    progress: 1,
                    organizedNotes: cleanNotes
                });
                db.projects.update(currentProjectId, {
                    status: 'done',
                    title: titleMatch?.[1]?.trim() || 'Untitled Note'
                });
            }

            setStep('editor');
            console.log('[Groq Flow] ✅ Complete');
            console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');

        } catch (err: any) {
            console.error('[Groq Flow] Error:', err);
            throw err;
        }
    };

    return null; // Headless component
}