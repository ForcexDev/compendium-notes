import React from 'react';
import { motion } from 'framer-motion';
import { Loader2, Shrink, AudioLines, Check, Upload } from 'lucide-react';
import { useAppStore } from '../../lib/store';

// NOTE: Logic moved to GlobalAudioProcessor. This component just renders state.
type Stage = 'compressing' | 'uploading' | 'transcribing' | 'done' | 'error' | 'idle';

export default function TranscriptionProgress() {
    const {
        file, provider, locale,
        processingState, processingProgress, compressionInfo
    } = useAppStore();

    // Map internal store processingState to UI stage (simplify "done" and "idle" as fallback)
    const stage = processingState === 'idle' || processingState === 'done' || processingState === 'error'
        ? 'compressing' // Default visual state if weird stuff happens
        : processingState;

    const pct = Math.round(processingProgress * 100);

    const stageConfig: Record<string, { title: string; desc: string; icon: typeof Loader2 }> = {
        compressing: {
            title: locale === 'es'
                ? (file?.type.startsWith('video/') ? 'Extrayendo audio...' : 'Optimizando audio...')
                : (file?.type.startsWith('video/') ? 'Extracting audio...' : 'Optimizing audio...'),
            desc: locale === 'es'
                ? (file?.type.startsWith('video/') ? 'Separando pista de audio' : 'Reduciendo tamaño para subir más rápido')
                : (file?.type.startsWith('video/') ? 'Separating audio track' : 'Reducing size for faster upload'),
            icon: file?.type.startsWith('video/') ? AudioLines : Shrink,
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
                ? (provider === 'gemini' ? 'Procesando con Gemini Flash 2.0' : 'Procesando con Whisper V3 y Llama 3.3')
                : (provider === 'gemini' ? 'Processing with Gemini Flash 2.0' : 'Processing with Whisper V3 and Llama 3.3'),
            icon: AudioLines,
        },
    };

    // Safe fallback
    const current = stageConfig[stage] || stageConfig['compressing'];
    const Icon = current.icon;

    // Unified steps
    const steps = [
        {
            key: 'compressing',
            label: locale === 'es'
                ? (file?.type.startsWith('video/') ? 'Extraer' : 'Optimizar')
                : (file?.type.startsWith('video/') ? 'Extract' : 'Optimize')
        },
        { key: 'uploading', label: locale === 'es' ? 'Subir' : 'Upload' }, // Only visible for Gemini mainly
        { key: 'transcribing', label: locale === 'es' ? 'Transcribir' : 'Transcribe' },
    ];

    const visibleSteps = provider === 'gemini'
        ? steps
        : [steps[0], steps[2]];

    const currentIdx = steps.findIndex(s => s.key === stage);

    return (
        <div className="text-center space-y-6">
            {/* Stage indicator */}
            <div className="flex items-center justify-center gap-4 mb-2">
                {visibleSteps.map((s, i) => (
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
                    {provider === 'gemini' ? 'Gemini Flash' : 'Llama 4 Scout'}
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
