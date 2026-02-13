import React, { useEffect, useRef, useState } from 'react';
import { motion } from 'framer-motion';
import { Loader2, Shrink, AudioLines, Check, Upload } from 'lucide-react';
import { useAppStore } from '../../lib/store';
import { processAudioForUpload } from '../../lib/audio-processor';
import { transcribeAudio } from '../../lib/groq';
import { transcribeWithGemini } from '../../lib/gemini';

type Stage = 'compressing' | 'uploading' | 'transcribing';

export default function TranscriptionProgress() {
    const {
        file, apiKey, geminiKey, provider,
        setTranscription, setStep, setError, locale
    } = useAppStore();
    const started = useRef(false);
    const [stage, setStage] = useState<Stage>(provider === 'gemini' ? 'uploading' : 'compressing');
    const [progress, setProgress] = useState(0);
    const [compressionInfo, setCompressionInfo] = useState<string>('');

    useEffect(() => {
        if (started.current || !file) return;
        const activeKey = provider === 'gemini' ? geminiKey : apiKey;
        if (!activeKey) return;
        started.current = true;

        if (provider === 'gemini') {
            runGeminiFlow(activeKey);
        } else {
            runGroqFlow(activeKey);
        }
    }, [file, apiKey, geminiKey, provider]);

    const runGeminiFlow = async (key: string) => {
        try {
            setStage('uploading');
            const text = await transcribeWithGemini(file!, key, (p) => {
                if (p < 0.5) {
                    setStage('uploading');
                } else {
                    setStage('transcribing');
                }
                setProgress(p);
            });
            setTranscription(text);
            setStep('ai-processing');
        } catch (err: any) {
            setError(err.message);
            setStep('upload');
        }
    };

    const runGroqFlow = async (key: string) => {
        try {
            // Step 1: Process (compress + maybe chunk)
            setStage('compressing');
            const processed = await processAudioForUpload(file!, (_stage, p) => {
                setProgress(p);
            });

            if (processed.wasCompressed) {
                const saved = Math.round((1 - processed.compressedSize / processed.originalSize) * 100);
                const sizeStr = (processed.compressedSize / (1024 * 1024)).toFixed(1);
                setCompressionInfo(
                    locale === 'es'
                        ? `Comprimido: ${sizeStr}MB (-${saved}%)${processed.wasChunked ? ` · ${processed.chunks.length} fragmentos` : ''}`
                        : `Compressed: ${sizeStr}MB (-${saved}%)${processed.wasChunked ? ` · ${processed.chunks.length} chunks` : ''}`
                );
            }

            // Step 2: Transcribe
            setStage('transcribing');
            setProgress(0);
            const text = await transcribeAudio(processed.chunks, key, (p) => setProgress(p));

            setTranscription(text);
            setStep('ai-processing');
        } catch (err: any) {
            setError(err.message);
            setStep('upload');
        }
    };

    const pct = Math.round(progress * 100);

    const stageConfig: Record<Stage, { title: string; desc: string; icon: typeof Loader2 }> = {
        compressing: {
            title: locale === 'es' ? 'Comprimiendo audio...' : 'Compressing audio...',
            desc: locale === 'es' ? 'Reduciendo a 16kHz mono para optimizar' : 'Reducing to 16kHz mono for optimization',
            icon: Shrink,
        },
        uploading: {
            title: locale === 'es' ? 'Subiendo a Gemini...' : 'Uploading to Gemini...',
            desc: locale === 'es' ? 'Enviando audio para procesamiento' : 'Sending audio for processing',
            icon: Upload,
        },
        transcribing: {
            title: locale === 'es'
                ? (provider === 'gemini' ? 'Transcribiendo con Gemini...' : 'Transcribiendo...')
                : (provider === 'gemini' ? 'Transcribing with Gemini...' : 'Transcribing...'),
            desc: locale === 'es'
                ? (provider === 'gemini' ? 'Procesando con Gemini Flash 2.0' : 'Procesando con Whisper V3 Turbo')
                : (provider === 'gemini' ? 'Processing with Gemini Flash 2.0' : 'Processing with Whisper V3 Turbo'),
            icon: AudioLines,
        },
    };

    const current = stageConfig[stage];
    const Icon = current.icon;

    // Steps depend on provider
    const steps = provider === 'gemini'
        ? [
            { key: 'uploading', label: locale === 'es' ? 'Subir' : 'Upload' },
            { key: 'transcribing', label: locale === 'es' ? 'Transcribir' : 'Transcribe' },
        ]
        : [
            { key: 'compressing', label: locale === 'es' ? 'Comprimir' : 'Compress' },
            { key: 'transcribing', label: locale === 'es' ? 'Transcribir' : 'Transcribe' },
        ];

    const currentIdx = steps.findIndex(s => s.key === stage);

    return (
        <div className="text-center space-y-6">
            {/* Stage indicator */}
            <div className="flex items-center justify-center gap-4 mb-2">
                {steps.map((s, i) => (
                    <React.Fragment key={s.key}>
                        {i > 0 && <div className="w-8 h-px" style={{ background: 'var(--border-subtle)' }}></div>}
                        <div className="flex items-center gap-2">
                            <div className="w-6 h-6 rounded-full flex items-center justify-center" style={{
                                background: i <= currentIdx ? 'var(--accent)' : 'var(--bg-tertiary)',
                            }}>
                                {i < currentIdx ? (
                                    <Check size={12} className="text-white" />
                                ) : i === currentIdx ? (
                                    <motion.div animate={{ rotate: 360 }} transition={{ duration: 1.5, repeat: Infinity, ease: 'linear' }}>
                                        <Loader2 size={12} className="text-white" />
                                    </motion.div>
                                ) : (
                                    <span className="text-[10px] font-mono" style={{ color: 'var(--text-muted)' }}>{i + 1}</span>
                                )}
                            </div>
                            <span className="text-xs" style={{ color: i <= currentIdx ? 'var(--text-secondary)' : 'var(--text-muted)' }}>
                                {s.label}
                            </span>
                        </div>
                    </React.Fragment>
                ))}
            </div>

            {/* Icon */}
            <div className="w-14 h-14 rounded-2xl mx-auto flex items-center justify-center" style={{ background: 'var(--accent-subtle)' }}>
                <Icon size={22} style={{ color: 'var(--accent)' }} />
            </div>

            {/* Text */}
            <div>
                <h2 className="text-lg font-semibold mb-1" style={{ color: 'var(--text-primary)', letterSpacing: '-0.02em' }}>
                    {current.title}
                </h2>
                <p className="text-sm" style={{ color: 'var(--text-muted)' }}>
                    {current.desc}
                </p>
            </div>

            {/* Progress bar */}
            <div className="max-w-xs mx-auto">
                <div className="w-full h-1.5 rounded-full overflow-hidden" style={{ background: 'var(--bg-tertiary)' }}>
                    <motion.div
                        className="h-full rounded-full"
                        style={{ background: 'var(--accent)' }}
                        initial={{ width: '0%' }}
                        animate={{ width: `${Math.max(pct, 3)}%` }}
                        transition={{ duration: 0.3, ease: 'easeOut' }}
                    />
                </div>
                <p className="text-xs mt-2 font-mono" style={{ color: 'var(--text-muted)' }}>{pct}%</p>
            </div>

            {/* Compression result badge (Groq only) */}
            {compressionInfo && (
                <motion.div initial={{ opacity: 0, y: 4 }} animate={{ opacity: 1, y: 0 }}>
                    <div className="inline-flex items-center gap-2 text-xs px-3 py-1.5 rounded-md" style={{
                        background: 'rgba(16,185,129,0.08)', border: '1px solid rgba(16,185,129,0.2)', color: '#34d399',
                    }}>
                        <Check size={12} />
                        {compressionInfo}
                    </div>
                </motion.div>
            )}

            {/* Provider + file info */}
            <div className="flex flex-wrap items-center justify-center gap-2">
                <div className="inline-flex items-center gap-1.5 text-xs px-3 py-1.5 rounded-md" style={{
                    background: 'var(--accent-subtle)', border: '1px solid var(--accent)', color: 'var(--accent)',
                }}>
                    {provider === 'gemini' ? 'Gemini Flash' : 'Groq Whisper'}
                </div>
                {file && (
                    <div className="inline-flex items-center gap-2 text-xs px-3 py-1.5 rounded-md" style={{
                        background: 'var(--bg-secondary)', border: '1px solid var(--border-subtle)', color: 'var(--text-muted)',
                    }}>
                        <span className="truncate max-w-[200px]">{file.name}</span>
                        <span>·</span>
                        <span>{(file.size / (1024 * 1024)).toFixed(1)} MB</span>
                    </div>
                )}
            </div>
        </div>
    );
}
