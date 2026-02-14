import React, { useCallback, useState, useRef, useEffect } from 'react';
import { useAppStore } from '../../lib/store';
import { motion, AnimatePresence } from 'framer-motion';
import { Upload, FileAudio, FileVideo, Mic, Loader2, AlertCircle, CheckCircle, Clock, Volume2, ArrowRight, Sparkles, Zap, BrainCircuit, Info } from 'lucide-react';
import { t } from '../../lib/i18n';

import AudioRecorder from './AudioRecorder';

const ACCEPTED = [
    'audio/mpeg', 'audio/mp3', 'audio/mp4', 'audio/wav', 'audio/ogg', 'audio/flac',
    'audio/webm', 'audio/x-m4a', 'audio/m4a', 'audio/aac', 'audio/x-aac',
    'video/mp4', 'video/quicktime', 'video/webm'
];
const MAX_SIZE = 200 * 1024 * 1024; // 200MB

export default function UploadZone() {
    const { setFile, startProcessing, setError, apiKey, geminiKey, provider, setConfigOpen, locale, file, processingState } = useAppStore();
    const [isDragging, setIsDragging] = useState(false);
    const [isRecording, setIsRecording] = useState(false);
    const inputRef = useRef<HTMLInputElement>(null);

    const validate = useCallback((f: File): boolean => {
        const isSupportedType = f.type && ACCEPTED.includes(f.type);
        const isSupportedExtension = f.name.match(/\.(mp3|m4a|wav|ogg|flac|webm|mp4|mov|aac)$/i);

        if (!isSupportedType && !isSupportedExtension) {
            setError(locale === 'es'
                ? 'Formato no soportado. Usa MP3, M4A, WAV, MP4 o MOV.'
                : 'Unsupported format. Use MP3, M4A, WAV, MP4 or MOV.');
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
        if (file) startProcessing(file);
    };

    const handleRecordingComplete = (f: File) => {
        setIsRecording(false);
        handleFile(f);
    };

    const formatSize = (b: number) => b < 1024 * 1024 ? `${(b / 1024).toFixed(0)} KB` : `${(b / (1024 * 1024)).toFixed(1)} MB`;

    if (isRecording) {
        return (
            <div className="rounded-xl border border-[var(--border-subtle)] bg-[var(--bg-secondary)] overflow-hidden">
                <AudioRecorder
                    onRecordingComplete={handleRecordingComplete}
                    onCancel={() => setIsRecording(false)}
                />
            </div>
        );
    }

    return (
        <div className="space-y-8">
            <div className="text-center mb-2">
                <h1 className="text-xl font-semibold mb-1" style={{ color: 'var(--text-primary)', letterSpacing: '-0.02em' }}>
                    {t('app.upload.title', locale)}
                </h1>
                <p className="text-sm" style={{ color: 'var(--text-muted)' }}>
                    {t('app.upload.subtitle', locale)}
                </p>
            </div>

            {/* Drop zone */}
            <div
                onDragOver={(e) => { e.preventDefault(); setIsDragging(true); }}
                onDragLeave={() => setIsDragging(false)}
                onDrop={handleDrop}
                onClick={() => !file && inputRef.current?.click()}
                className="relative rounded-xl p-8 sm:p-10 text-center cursor-pointer transition-all duration-200 group"
                style={{
                    background: isDragging ? 'var(--accent-subtle)' : 'var(--bg-secondary)',
                    border: `1px ${isDragging ? 'solid' : 'dashed'} ${isDragging ? 'var(--accent)' : 'var(--border-default)'}`,
                }}
            >
                <input
                    ref={inputRef}
                    type="file"
                    accept="audio/*,video/*,.mp3,.m4a,.wav,.ogg,.flac,.webm,.mp4,.mov"
                    className="hidden"
                    onChange={(e) => e.target.files?.[0] && handleFile(e.target.files[0])}
                />

                {!file ? (
                    <div className="space-y-6">
                        <div className="w-12 h-12 rounded-xl mx-auto flex items-center justify-center mb-4 transition-colors group-hover:bg-[var(--bg-tertiary)]" style={{ background: 'var(--accent-subtle)' }}>
                            <Upload size={20} style={{ color: 'var(--accent)' }} />
                        </div>
                        <div>
                            <p className="text-base font-medium mb-1" style={{ color: 'var(--text-primary)' }}>
                                {isDragging ? t('app.upload.dropping', locale) : t('app.upload.drop', locale)}
                            </p>
                            <p className="text-xs" style={{ color: 'var(--text-muted)' }}>
                                {t('app.upload.formats', locale)}
                            </p>
                        </div>
                        <div className="flex items-center justify-center gap-3">
                            <button
                                onClick={(e) => { e.stopPropagation(); inputRef.current?.click(); }}
                                className="btn-filled text-xs px-5 py-2.5 rounded-lg"
                            >
                                {t('app.upload.select', locale)}
                            </button>
                            <button
                                onClick={(e) => { e.stopPropagation(); setIsRecording(true); }}
                                className="btn-ghost text-xs px-5 py-2.5 rounded-lg flex items-center gap-2"
                            >
                                <Mic size={14} />
                                {t('app.record.start', locale)}
                            </button>
                        </div>
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
                        {processingState === 'idle' && (
                            <button
                                onClick={() => setFile(null)}
                                className="text-xs px-2 py-1 rounded transition-colors"
                                style={{ color: 'var(--text-muted)' }}
                                title={t('app.upload.remove', locale) || 'Remove file'}
                            >
                                ✕
                            </button>
                        )}
                    </div>
                )}
            </div>

            {/* Start button */}
            {file && processingState === 'idle' && (
                <motion.div
                    initial={{ opacity: 0, y: 10 }}
                    animate={{ opacity: 1, y: 0 }}
                    className="mt-6"
                >
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
                            <span className="text-xs font-semibold uppercase tracking-wider">Whisper + Llama</span>
                        </div>
                        <p className="text-xs leading-relaxed" style={{ color: 'var(--text-secondary)' }}>
                            {locale === 'es'
                                ? 'Ideal para clases estándar (< 1h). Muy rápido y preciso con timestamps exactos. Usa Whisper V3 Turbo + Llama 4 Scout.'
                                : 'Ideal for standard lectures (< 1h). Very fast and precise with exact timestamps. Uses Whisper V3 Turbo + Llama 4 Scout.'}
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
