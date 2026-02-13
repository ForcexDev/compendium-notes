import React, { useState, useEffect, useRef } from 'react';
import { motion } from 'framer-motion';
import { X, Eye, EyeOff, Clipboard, ExternalLink, Check } from 'lucide-react';
import { useAppStore } from '../../lib/store';
import { t } from '../../lib/i18n';

export default function ConfigModal() {
    const {
        apiKey, setApiKey, geminiKey, setGeminiKey,
        provider, setProvider, setConfigOpen,
        pdfStyle, setPdfStyle, locale
    } = useAppStore();

    const [groqInput, setGroqInput] = useState(apiKey);
    const [geminiInput, setGeminiInput] = useState(geminiKey);
    const [showGroq, setShowGroq] = useState(false);
    const [showGemini, setShowGemini] = useState(false);
    const [saved, setSaved] = useState(false);
    const inputRef = useRef<HTMLInputElement>(null);

    useEffect(() => {
        inputRef.current?.focus();
    }, []);

    const handleSave = () => {
        setApiKey(groqInput.trim());
        setGeminiKey(geminiInput.trim());
        setSaved(true);
        setTimeout(() => setSaved(false), 1500);
    };

    const handlePaste = async (target: 'groq' | 'gemini') => {
        try {
            const text = await navigator.clipboard.readText();
            if (target === 'groq') setGroqInput(text.trim());
            else setGeminiInput(text.trim());
        } catch { }
    };

    return (
        <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 z-50 flex items-center justify-center p-4"
            style={{ background: 'rgba(0,0,0,0.6)', backdropFilter: 'blur(4px)' }}
            onClick={() => setConfigOpen(false)}
        >
            <motion.div
                initial={{ opacity: 0, scale: 0.97, y: 8 }}
                animate={{ opacity: 1, scale: 1, y: 0 }}
                exit={{ opacity: 0, scale: 0.97, y: 8 }}
                transition={{ duration: 0.2 }}
                className="w-full max-w-md rounded-xl overflow-hidden max-h-[90vh] overflow-y-auto custom-scrollbar"
                style={{ background: 'var(--bg-secondary)', border: '1px solid var(--border-default)' }}
                onClick={(e) => e.stopPropagation()}
            >
                {/* Header */}
                <div className="flex items-center justify-between px-5 py-4 sticky top-0 z-10" style={{ borderBottom: '1px solid var(--border-subtle)', background: 'var(--bg-secondary)' }}>
                    <h2 className="text-sm font-semibold" style={{ color: 'var(--text-primary)' }}>
                        {t('app.config.title', locale)}
                    </h2>
                    <button onClick={() => setConfigOpen(false)} className="p-1 rounded-md transition-colors" style={{ color: 'var(--text-muted)' }}>
                        <X size={16} />
                    </button>
                </div>

                <div className="p-5 space-y-5">
                    {/* Provider Toggle */}
                    <div>
                        <label className="text-xs font-medium mb-2 block" style={{ color: 'var(--text-secondary)' }}>
                            {locale === 'es' ? 'Proveedor de IA' : 'AI Provider'}
                        </label>
                        <div className="grid grid-cols-2 gap-2">
                            <button
                                onClick={() => setProvider('groq')}
                                className="py-2.5 px-3 rounded-lg text-xs font-medium transition-all"
                                style={{
                                    background: provider === 'groq' ? 'var(--accent-subtle)' : 'var(--bg-primary)',
                                    border: `1px solid ${provider === 'groq' ? 'var(--accent)' : 'var(--border-default)'}`,
                                    color: provider === 'groq' ? 'var(--accent)' : 'var(--text-muted)',
                                }}
                            >
                                <span className="block font-semibold mb-0.5">Groq</span>
                                <span className="block text-[10px] opacity-70">Whisper + Llama 3.3</span>
                            </button>
                            <button
                                onClick={() => setProvider('gemini')}
                                className="py-2.5 px-3 rounded-lg text-xs font-medium transition-all"
                                style={{
                                    background: provider === 'gemini' ? 'var(--accent-subtle)' : 'var(--bg-primary)',
                                    border: `1px solid ${provider === 'gemini' ? 'var(--accent)' : 'var(--border-default)'}`,
                                    color: provider === 'gemini' ? 'var(--accent)' : 'var(--text-muted)',
                                }}
                            >
                                <span className="block font-semibold mb-0.5">Gemini</span>
                                <span className="block text-[10px] opacity-70">Flash 2.0</span>
                            </button>
                        </div>
                    </div>

                    {/* Groq API Key */}
                    {provider === 'groq' && (
                        <div>
                            <label className="text-xs font-medium mb-2 block" style={{ color: 'var(--text-secondary)' }}>
                                Groq API Key
                            </label>
                            <div className="flex gap-2">
                                <div className="flex-1 flex items-center rounded-lg px-3" style={{ background: 'var(--bg-primary)', border: '1px solid var(--border-default)' }}>
                                    <input
                                        ref={inputRef}
                                        type={showGroq ? 'text' : 'password'}
                                        value={groqInput}
                                        onChange={(e) => setGroqInput(e.target.value)}
                                        placeholder="gsk_..."
                                        className="flex-1 bg-transparent border-none outline-none text-sm py-2.5 font-mono"
                                        style={{ color: 'var(--text-primary)' }}
                                    />
                                    <button onClick={() => setShowGroq(!showGroq)} className="p-1 ml-1" style={{ color: 'var(--text-muted)' }}>
                                        {showGroq ? <EyeOff size={14} /> : <Eye size={14} />}
                                    </button>
                                </div>
                                <button onClick={() => handlePaste('groq')} className="px-3 rounded-lg text-xs transition-colors" style={{ background: 'var(--bg-tertiary)', border: '1px solid var(--border-default)', color: 'var(--text-secondary)' }}>
                                    <Clipboard size={14} />
                                </button>
                            </div>
                            <a href="https://console.groq.com/keys" target="_blank" rel="noopener noreferrer" className="inline-flex items-center gap-1 text-xs mt-2 no-underline transition-colors" style={{ color: 'var(--accent)' }}>
                                {locale === 'es' ? 'Obtener API Key de Groq' : 'Get Groq API Key'}
                                <ExternalLink size={11} />
                            </a>
                        </div>
                    )}

                    {/* Gemini API Key */}
                    {provider === 'gemini' && (
                        <div>
                            <label className="text-xs font-medium mb-2 block" style={{ color: 'var(--text-secondary)' }}>
                                Gemini API Key
                            </label>
                            <div className="flex gap-2">
                                <div className="flex-1 flex items-center rounded-lg px-3" style={{ background: 'var(--bg-primary)', border: '1px solid var(--border-default)' }}>
                                    <input
                                        type={showGemini ? 'text' : 'password'}
                                        value={geminiInput}
                                        onChange={(e) => setGeminiInput(e.target.value)}
                                        placeholder="AIza..."
                                        className="flex-1 bg-transparent border-none outline-none text-sm py-2.5 font-mono"
                                        style={{ color: 'var(--text-primary)' }}
                                    />
                                    <button onClick={() => setShowGemini(!showGemini)} className="p-1 ml-1" style={{ color: 'var(--text-muted)' }}>
                                        {showGemini ? <EyeOff size={14} /> : <Eye size={14} />}
                                    </button>
                                </div>
                                <button onClick={() => handlePaste('gemini')} className="px-3 rounded-lg text-xs transition-colors" style={{ background: 'var(--bg-tertiary)', border: '1px solid var(--border-default)', color: 'var(--text-secondary)' }}>
                                    <Clipboard size={14} />
                                </button>
                            </div>
                            <a href="https://aistudio.google.com/apikey" target="_blank" rel="noopener noreferrer" className="inline-flex items-center gap-1 text-xs mt-2 no-underline transition-colors" style={{ color: 'var(--accent)' }}>
                                {locale === 'es' ? 'Obtener API Key de Gemini' : 'Get Gemini API Key'}
                                <ExternalLink size={11} />
                            </a>
                        </div>
                    )}

                    {/* Privacy note */}
                    <p className="text-xs leading-relaxed" style={{ color: 'var(--text-muted)' }}>
                        {t('app.config.privacy', locale)}
                    </p>

                    {/* PDF Style Selector */}
                    <div>
                        <label className="text-xs font-medium mb-2 block" style={{ color: 'var(--text-secondary)' }}>
                            {t('app.config.pdfstyle', locale)}
                        </label>
                        <div className="grid grid-cols-3 gap-2">
                            {(['minimalista', 'academico', 'cornell'] as const).map((style) => (
                                <button
                                    key={style}
                                    onClick={() => setPdfStyle(style)}
                                    className="py-2 px-3 rounded-lg text-xs font-medium transition-all capitalize"
                                    style={{
                                        background: pdfStyle === style ? 'var(--accent-subtle)' : 'var(--bg-primary)',
                                        border: `1px solid ${pdfStyle === style ? 'var(--accent)' : 'var(--border-default)'}`,
                                        color: pdfStyle === style ? 'var(--accent)' : 'var(--text-muted)',
                                    }}
                                >
                                    {style}
                                </button>
                            ))}
                        </div>
                    </div>

                    {/* Save button */}
                    <button
                        onClick={handleSave}
                        className="w-full py-2.5 rounded-lg text-sm font-medium text-white transition-colors flex items-center justify-center gap-2"
                        style={{ background: saved ? '#10b981' : 'var(--accent)' }}
                    >
                        {saved ? <><Check size={14} /> {t('app.config.saved', locale)}</> : t('app.config.save', locale)}
                    </button>
                </div>
            </motion.div>
        </motion.div>
    );
}
