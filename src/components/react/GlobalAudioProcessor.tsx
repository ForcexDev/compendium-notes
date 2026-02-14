import { useEffect, useRef } from 'react';
import { useAppStore } from '../../lib/store';
import { processAudioForUpload } from '../../lib/audio-processor';
import { transcribeAudio, organizeNotes } from '../../lib/groq';
import { t } from '../../lib/i18n';
import { transcribeWithGemini, organizeNotesWithGemini } from '../../lib/gemini';
import { updateProjectState, db } from '../../lib/db'; // Import DB

export default function GlobalAudioProcessor() {
    const {
        file, apiKey, geminiKey, provider, locale,
        processingState, setProcessingState,
        setProcessingProgress, setCompressionInfo,
        setTranscription, setStep, setError,
        setOrganizedNotes, setAiStep, setTitle,
        currentProjectId, restoreSession,
        activeKey // Get the async getter
    } = useAppStore();

    // Restore session on mount
    useEffect(() => {
        restoreSession();
    }, []);

    const processingRef = useRef(false);
    const abortControllerRef = useRef<AbortController | null>(null);

    // Effect for cancellation only (File change or Unmount)
    useEffect(() => {
        return () => {
            // Only abort if the component is truly destroying or file changed significantly
            // But since this component is persistent, unmount only happens on full nav/refresh
            console.log('[GlobalAudioProcessor] Cleaning up/Unmounting...');
            abortControllerRef.current?.abort();
        };
    }, []);

    useEffect(() => {
        // Create a new controller if starting
        if (file && processingState === 'compressing' && !processingRef.current) {
            abortControllerRef.current = new AbortController();
        }
    }, [file, processingState]);

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

            // Decrypt key on demand
            const key = await activeKey();

            if (!key) {
                setError('Falta API Key');
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
                if (isCancelled()) return;
                console.error(err);
                setError(err.message);
                setProcessingState('error');
                setStep('upload');
            } finally {
                if (!isCancelled()) processingRef.current = false;
            }
        };

        run();

        // NO CLEANUP FUNCTION HERE that cancels the process
        // Cancellation is handled by the dedicated effect or user action
    }, [file, processingState, apiKey, geminiKey, provider]);

    const runGeminiFlow = async (key: string, isCancelled: () => boolean) => {
        try {
            // Step 1: Process (extract audio/compress)
            // processingState is already 'compressing'
            const processed = await processAudioForUpload(file!, (_stage, p) => {
                if (!isCancelled()) {
                    setProcessingProgress(p);
                    if (currentProjectId) updateProjectState(currentProjectId, { step: 'upload', subStep: 'compressing', progress: p });
                }
            });
            if (isCancelled()) return;

            if (processed.wasCompressed) {
                const saved = Math.round((1 - processed.compressedSize / processed.originalSize) * 100);
                const sizeStr = (processed.compressedSize / (1024 * 1024)).toFixed(1);

                const label = file!.type.startsWith('video/')
                    ? t('notif.audio_extracted', locale)
                    : t('notif.audio_optimized', locale);

                setCompressionInfo(
                    `${label}: ${sizeStr}MB (-${saved}%)`
                );
            }

            // Step 2: Upload to Gemini
            setProcessingState('uploading');
            setProcessingProgress(0);

            const text = await transcribeWithGemini(processed.chunks[0], key, (p) => {
                if (isCancelled()) return;
                if (p < 0.5) {
                    setProcessingState('uploading');
                    if (currentProjectId) updateProjectState(currentProjectId, { step: 'upload', subStep: 'uploading', progress: p });
                } else {
                    setProcessingState('transcribing');
                    if (currentProjectId) updateProjectState(currentProjectId, { step: 'transcribing', subStep: 'transcribing', progress: p });
                }
                setProcessingProgress(p);
            });
            if (isCancelled()) return;

            setTranscription(text);
            if (currentProjectId) updateProjectState(currentProjectId, { transcription: text });

            // Step 3: Analyze / Organize
            setProcessingState('analyzing');
            setStep('ai-processing');
            setAiStep(0);

            const organizeKey = key;
            // We use organizeNotesWithGemini directly
            const notes = await organizeNotesWithGemini(text, organizeKey, (s) => {
                if (!isCancelled()) {
                    setAiStep(s);
                    if (currentProjectId) updateProjectState(currentProjectId, { step: 'ai-processing', progress: s / 5 });
                }
            });

            if (isCancelled()) return;

            // Extract Title
            let cleanNotes = notes;
            const titleMatch = notes.match(/^## Título\s*\n(.+)/m);
            if (titleMatch) {
                const extractedTitle = titleMatch[1].trim().replace(/\*\*/g, '');
                setTitle(extractedTitle);
                cleanNotes = notes.replace(/^## Título\s*\n.+\n*/m, '').trim();
            }

            setOrganizedNotes(cleanNotes);
            setProcessingState('done');

            // Mark DB as done
            if (currentProjectId) {
                updateProjectState(currentProjectId, {
                    step: 'editor',
                    subStep: 'done',
                    progress: 1,
                    organizedNotes: cleanNotes
                });
                db.projects.update(currentProjectId, { status: 'done', title: cleanNotes.match(/^## Título\s*\n(.+)/m)?.[1]?.trim() || 'Untitled Note' });
            }

            setStep('editor');

        } catch (err: any) {
            // Error handling is now done in the useEffect's run function
            throw err;
        }
    };

    const runGroqFlow = async (key: string, isCancelled: () => boolean) => {
        try {
            // Step 1: Process (compress + maybe chunk)
            setProcessingState('compressing');
            const processed = await processAudioForUpload(file!, (_stage, p) => {
                if (!isCancelled()) {
                    setProcessingProgress(p);
                    if (currentProjectId) updateProjectState(currentProjectId, { step: 'upload', subStep: 'compressing', progress: p });
                }
            });
            if (isCancelled()) return;

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

            // Step 2: Transcribe
            setProcessingState('transcribing');
            setProcessingProgress(0.05); // Start with some progress
            if (currentProjectId) updateProjectState(currentProjectId, { step: 'transcribing', subStep: 'initializing', progress: 0.05 });
            console.log('[GlobalAudioProcessor] Starting Groq transcription...');

            const text = await transcribeAudio(processed.chunks, key, (p) => {
                if (!isCancelled()) {
                    console.log(`[GlobalAudioProcessor] Progress: ${Math.round(p * 100)}%`);
                    setProcessingProgress(p);
                    if (currentProjectId) updateProjectState(currentProjectId, { step: 'transcribing', progress: p });
                }
            });

            if (isCancelled()) return;

            console.log('[GlobalAudioProcessor] Transcription complete. Length:', text.length);

            if (!text || text.trim().length === 0) {
                throw new Error(locale === 'es'
                    ? 'La transcripción está vacía.'
                    : 'Transcription is empty.');
            }

            setTranscription(text);
            if (currentProjectId) updateProjectState(currentProjectId, { transcription: text });

            // Step 3: Analyze / Organize Notes
            setProcessingState('analyzing');
            setStep('ai-processing'); // Ensure UI is on the right screen

            // We use the same callback pattern for progress
            const organize = provider === 'gemini' ? organizeNotesWithGemini : organizeNotes;
            const organizeKey = key; // Use the decrypted key we already have

            if (!organizeKey) throw new Error('No API Key for organization');

            // Reset AI step
            setAiStep(0);

            const notes = await organize(text, organizeKey, (s) => {
                if (!isCancelled()) {
                    setAiStep(s);
                    if (currentProjectId) updateProjectState(currentProjectId, { step: 'ai-processing', progress: s / 5 });
                }
            });

            if (isCancelled()) return;

            // Extract Title
            let cleanNotes = notes;
            const titleMatch = notes.match(/^## Título\s*\n(.+)/m);
            if (titleMatch) {
                const extractedTitle = titleMatch[1].trim().replace(/\*\*/g, '');
                setTitle(extractedTitle);
                cleanNotes = notes.replace(/^## Título\s*\n.+\n*/m, '').trim();
            }

            setOrganizedNotes(cleanNotes);
            setProcessingState('done');

            // Mark DB as done
            if (currentProjectId) {
                updateProjectState(currentProjectId, {
                    step: 'editor',
                    subStep: 'done',
                    progress: 1,
                    organizedNotes: cleanNotes
                });
                db.projects.update(currentProjectId, { status: 'done', title: cleanNotes.match(/^## Título\s*\n(.+)/m)?.[1]?.trim() || 'Untitled Note' });
            }

            setStep('editor');

        } catch (err: any) {
            console.error('[GlobalAudioProcessor] Error:', err);
            // Error handling is now done in the useEffect's run function
            throw err;
        }
    };

    return null; // Headless component
}
