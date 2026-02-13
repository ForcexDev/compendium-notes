import React, { useEffect, useCallback } from 'react';
import { AnimatePresence, motion } from 'framer-motion';
import { Settings, X, Globe } from 'lucide-react';
import { useAppStore } from '../../lib/store';
import { t } from '../../lib/i18n';
import UploadZone from './UploadZone';
import ConfigModal from './ConfigModal';
import TranscriptionProgress from './TranscriptionProgress';
import AIProcessing from './AIProcessing';
import NotesEditor from './NotesEditor';

export default function AppMain() {
    const { step, configOpen, setConfigOpen, error, setError, apiKey, geminiKey, provider, locale, setLocale } = useAppStore();

    const isConnected = provider === 'gemini' ? !!geminiKey : !!apiKey;
    const providerLabel = provider === 'gemini' ? 'Gemini' : 'Groq';

    const handleKeyDown = useCallback((e: KeyboardEvent) => {
        if (e.key === 'k' && (e.metaKey || e.ctrlKey)) {
            e.preventDefault();
            setConfigOpen(!configOpen);
        }
    }, [configOpen, setConfigOpen]);

    useEffect(() => {
        window.addEventListener('keydown', handleKeyDown);
        return () => window.removeEventListener('keydown', handleKeyDown);
    }, [handleKeyDown]);

    // Auto-dismiss errors after 5s
    useEffect(() => {
        if (error) {
            const timer = setTimeout(() => setError(null), 5000);
            return () => clearTimeout(timer);
        }
    }, [error, setError]);

    // Browser navigation (History API)
    useEffect(() => {
        // Initial state
        if (!history.state) {
            history.replaceState({ step: 'upload' }, '', '#upload');
        }

        const handlePopState = (e: PopStateEvent) => {
            const s = e.state?.step;
            if (s) {
                // If we are going back to upload, reset file to avoid stuck state? 
                // No, keeps state. Just change view.
                useAppStore.setState({ step: s });
            } else {
                // Default to upload if no state
                useAppStore.setState({ step: 'upload' });
            }
        };

        window.addEventListener('popstate', handlePopState);
        return () => window.removeEventListener('popstate', handlePopState);
    }, []);

    // Sync step to history
    useEffect(() => {
        const currentRec = history.state?.step;
        if (currentRec !== step) {
            // If dragging slider or step checks, usage might trigger rapid updates? 
            // Step only changes on major transitions.
            if (step === 'upload') {
                // If going back to upload explicitly, maybe replace?
                // For now, push.
                history.pushState({ step }, '', `#${step}`);
            } else {
                history.pushState({ step }, '', `#${step}`);
            }
        }
    }, [step]);

    const toggleLocale = () => {
        const next = locale === 'es' ? 'en' : 'es';
        setLocale(next);
        // Also sync with Astro pages
        if (typeof window !== 'undefined') localStorage.setItem('scn-lang', next);
    };

    return (
        <div className="min-h-screen flex flex-col" style={{ background: 'var(--bg-primary)', color: 'var(--text-primary)' }}>
            {/* Nav */}
            <nav className="h-14 border-b flex items-center px-4 sm:px-6" style={{ borderColor: 'var(--border-subtle)', background: 'rgba(9,9,11,0.8)', backdropFilter: 'blur(16px)' }}>
                <a href="/" className="flex items-center gap-2.5 no-underline mr-auto">
                    <div className="w-7 h-7 rounded-md flex items-center justify-center text-white font-semibold text-xs" style={{ background: 'var(--accent)' }}>S</div>
                    <span className="text-sm font-medium hidden sm:block" style={{ color: 'var(--text-primary)' }}>Smart Class Notes</span>
                </a>

                <div className="flex items-center gap-2">
                    {isConnected && (
                        <span className="text-xs px-2 py-1 rounded-md flex items-center gap-1.5" style={{ background: 'rgba(16,185,129,0.1)', color: '#34d399', border: '1px solid rgba(16,185,129,0.2)' }}>
                            <span className="w-1.5 h-1.5 rounded-full bg-emerald-400"></span>
                            {providerLabel}
                        </span>
                    )}
                    <button
                        onClick={toggleLocale}
                        className="text-xs px-2.5 py-1.5 rounded-md transition-colors"
                        style={{ color: 'var(--text-muted)', border: '1px solid var(--border-subtle)' }}
                    >
                        {locale === 'es' ? 'EN' : 'ES'}
                    </button>
                    <button
                        onClick={() => setConfigOpen(true)}
                        className="p-2 rounded-md transition-colors"
                        style={{ color: 'var(--text-muted)' }}
                        title={`${t('nav.config', locale)} (Ctrl+K)`}
                    >
                        <Settings size={16} />
                    </button>
                </div>
            </nav>

            {/* Main content */}
            <main className="flex-1 flex items-center justify-center p-4 sm:p-6 pb-32">
                <AnimatePresence mode="wait">
                    {step === 'upload' && (
                        <motion.div key="upload" initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -8 }} transition={{ duration: 0.25 }} className="w-full max-w-2xl">
                            <UploadZone />
                        </motion.div>
                    )}
                    {step === 'transcribing' && (
                        <motion.div key="transcribing" initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -8 }} transition={{ duration: 0.25 }} className="w-full max-w-lg">
                            <TranscriptionProgress />
                        </motion.div>
                    )}
                    {step === 'ai-processing' && (
                        <motion.div key="ai" initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -8 }} transition={{ duration: 0.25 }} className="w-full max-w-lg">
                            <AIProcessing />
                        </motion.div>
                    )}
                    {step === 'editor' && (
                        <motion.div key="editor" initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -8 }} transition={{ duration: 0.25 }} className="w-full max-w-6xl h-[calc(100vh-7rem)]">
                            <NotesEditor />
                        </motion.div>
                    )}
                </AnimatePresence>
            </main>

            {/* Error toast */}
            <AnimatePresence>
                {error && (
                    <motion.div
                        initial={{ opacity: 0, y: 20 }}
                        animate={{ opacity: 1, y: 0 }}
                        exit={{ opacity: 0, y: 20 }}
                        className="fixed bottom-6 left-1/2 -translate-x-1/2 z-50 flex items-center gap-3 px-4 py-3 rounded-lg text-sm max-w-md"
                        style={{ background: 'var(--bg-elevated)', border: '1px solid rgba(239,68,68,0.3)', color: '#fca5a5' }}
                    >
                        <span className="flex-1">{error}</span>
                        <button onClick={() => setError(null)} className="p-0.5" style={{ color: 'var(--text-muted)' }}>
                            <X size={14} />
                        </button>
                    </motion.div>
                )}
            </AnimatePresence>

            {/* Config modal */}
            <AnimatePresence>
                {configOpen && <ConfigModal />}
            </AnimatePresence>
        </div>
    );
}
