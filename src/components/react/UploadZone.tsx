import React, { useCallback, useRef, useState } from 'react';
import { motion } from 'framer-motion';
import { Upload, Mic, FileAudio, ArrowRight, Info, Zap, BrainCircuit } from 'lucide-react';
import { useAppStore } from '../../lib/store';
import { t } from '../../lib/i18n';

const ACCEPTED = ['audio/mpeg', 'audio/mp4', 'audio/wav', 'audio/ogg', 'audio/flac', 'audio/webm', 'audio/x-m4a', 'video/mp4'];
const MAX_SIZE = 200 * 1024 * 1024; // 200MB — compression + chunking handles the rest

export default function UploadZone() {
    const { setFile, setStep, setError, apiKey, geminiKey, provider, setConfigOpen, locale, file } = useAppStore();
    const [isDragging, setIsDragging] = useState(false);
    const inputRef = useRef<HTMLInputElement>(null);

    const validate = useCallback((f: File): boolean => {
        if (!ACCEPTED.includes(f.type) && !f.name.match(/\.(mp3|m4a|wav|ogg|flac|webm|mp4)$/i)) {
            setError(locale === 'es' ? 'Formato no soportado. Usa MP3, M4A, WAV, OGG o FLAC.' : 'Unsupported format. Use MP3, M4A, WAV, OGG or FLAC.');
            return false;
        }
        if (f.size > MAX_SIZE) {
            setError(locale === 'es' ? 'El archivo supera los 200MB.' : 'File exceeds 200MB.');
            return false;
        }
        return true;
    }, [setError, locale]);

    const handleFile = useCallback((f: File) => {
        if (validate(f)) setFile(f);
    }, [validate, setFile]);

    const handleDrop = useCallback((e: React.DragEvent) => {
        e.preventDefault();
        setIsDragging(false);
        const f = e.dataTransfer.files[0];
        if (f) handleFile(f);
    }, [handleFile]);

    const handleStart = () => {
        const activeKey = provider === 'gemini' ? geminiKey : apiKey;
        if (!activeKey) {
            setConfigOpen(true);
            setError(t('app.error.apikey', locale));
            return;
        }
        if (file) setStep('transcribing');
    };

    const formatSize = (b: number) => b < 1024 * 1024 ? `${(b / 1024).toFixed(0)} KB` : `${(b / (1024 * 1024)).toFixed(1)} MB`;

    return (
        <div className="space-y-8">
            <div className="text-center mb-2">
                <h1 className="text-xl font-semibold mb-1" style={{ color: 'var(--text-primary)', letterSpacing: '-0.02em' }}>
                    {t('app.upload.title', locale)}
                </h1>
                <p className="text-sm" style={{ color: 'var(--text-muted)' }}>
                    {locale === 'es'
                        ? 'Soporta Whisper V3 (Groq) y Gemini Flash 2.0 para todo tipo de audios.'
                        : 'Supports Whisper V3 (Groq) and Gemini Flash 2.0 for all audio types.'}
                </p>
            </div>

            {/* Drop zone */}
            <div
                onDragOver={(e) => { e.preventDefault(); setIsDragging(true); }}
                onDragLeave={() => setIsDragging(false)}
                onDrop={handleDrop}
                onClick={() => !file && inputRef.current?.click()}
                className="relative rounded-xl p-8 sm:p-12 text-center cursor-pointer transition-all duration-200"
                style={{
                    background: isDragging ? 'var(--accent-subtle)' : 'var(--bg-secondary)',
                    border: `1px ${isDragging ? 'solid' : 'dashed'} ${isDragging ? 'var(--accent)' : 'var(--border-default)'}`,
                }}
            >
                <input
                    ref={inputRef}
                    type="file"
                    accept=".mp3,.m4a,.wav,.ogg,.flac,.webm,.mp4"
                    className="hidden"
                    onChange={(e) => e.target.files?.[0] && handleFile(e.target.files[0])}
                />

                {!file ? (
                    <div className="space-y-4">
                        <div className="w-12 h-12 rounded-xl mx-auto flex items-center justify-center" style={{ background: 'var(--accent-subtle)' }}>
                            {isDragging ? <Upload size={20} style={{ color: 'var(--accent)' }} /> : <Mic size={20} style={{ color: 'var(--accent)' }} />}
                        </div>
                        <div>
                            <p className="text-sm font-medium mb-1" style={{ color: 'var(--text-primary)' }}>
                                {isDragging ? t('app.upload.dropping', locale) : t('app.upload.drop', locale)}
                            </p>
                            <p className="text-xs" style={{ color: 'var(--text-muted)' }}>
                                {t('app.upload.formats', locale)}
                            </p>
                        </div>
                        <button
                            onClick={(e) => { e.stopPropagation(); inputRef.current?.click(); }}
                            className="text-xs font-medium px-4 py-2 rounded-lg transition-colors"
                            style={{ background: 'var(--bg-tertiary)', color: 'var(--text-secondary)', border: '1px solid var(--border-default)' }}
                        >
                            {t('app.upload.select', locale)}
                        </button>
                    </div>
                ) : (
                    <div className="flex items-center gap-4 text-left" onClick={(e) => e.stopPropagation()}>
                        <div className="w-11 h-11 rounded-lg flex items-center justify-center flex-shrink-0" style={{ background: 'var(--accent-subtle)' }}>
                            <FileAudio size={18} style={{ color: 'var(--accent)' }} />
                        </div>
                        <div className="flex-1 min-w-0">
                            <p className="text-sm font-medium truncate" style={{ color: 'var(--text-primary)' }}>{file.name}</p>
                            <p className="text-xs" style={{ color: 'var(--text-muted)' }}>{formatSize(file.size)}</p>
                        </div>
                        <button
                            onClick={() => setFile(null)}
                            className="text-xs px-2 py-1 rounded transition-colors"
                            style={{ color: 'var(--text-muted)' }}
                        >
                            ✕
                        </button>
                    </div>
                )}
            </div>

            {/* Start button */}
            {file && (
                <motion.div initial={{ opacity: 0, y: 4 }} animate={{ opacity: 1, y: 0 }}>
                    <button
                        onClick={handleStart}
                        className="w-full flex items-center justify-center gap-2 py-3 rounded-lg text-sm font-medium text-white transition-colors"
                        style={{ background: 'var(--accent)' }}
                    >
                        {t('app.upload.transcribe', locale)}
                        <ArrowRight size={15} />
                    </button>
                </motion.div>
            )}

            {/* Best Practices Guide */}
            {!file && (
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 mt-8">
                    <div className="p-4 rounded-xl border transition-colors hover:bg-[var(--bg-secondary)]" style={{ borderColor: 'var(--border-subtle)' }}>
                        <div className="flex items-center gap-2 mb-2" style={{ color: '#34d399' }}>
                            <Zap size={16} />
                            <span className="text-xs font-semibold uppercase tracking-wider">Groq + Whisper</span>
                        </div>
                        <p className="text-xs leading-relaxed" style={{ color: 'var(--text-secondary)' }}>
                            {locale === 'es'
                                ? 'Ideal para clases estándar (< 1h). Muy rápido y preciso con timestamps exactos. Usa compresión inteligente.'
                                : 'Ideal for standard lectures (< 1h). Very fast and precise with exact timestamps. Uses smart compression.'}
                        </p>
                    </div>

                    <div className="p-4 rounded-xl border transition-colors hover:bg-[var(--bg-secondary)]" style={{ borderColor: 'var(--border-subtle)' }}>
                        <div className="flex items-center gap-2 mb-2" style={{ color: '#60a5fa' }}>
                            <BrainCircuit size={16} />
                            <span className="text-xs font-semibold uppercase tracking-wider">Gemini Flash 2.0</span>
                        </div>
                        <p className="text-xs leading-relaxed" style={{ color: 'var(--text-secondary)' }}>
                            {locale === 'es'
                                ? 'Perfecto para audios muy largos (> 1h), archivos pesados o contenido complejo que requiere razonamiento profundo.'
                                : 'Perfect for very long audios (> 1h), large files, or complex content requiring deep reasoning.'}
                        </p>
                    </div>
                </div>
            )}
        </div>
    );
}
