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
    const { step, configOpen, setConfigOpen, error, setError, apiKey, geminiKey, provider, locale, setLocale, processingState } = useAppStore();

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

    // Browser navigation (History API) & Guards
    useEffect(() => {
        // Guard 1: Redirect to upload if no data but trying to access processing/editor
        // Guard 2: Redirect to editor if we have data but are in upload

        const currentStep = useAppStore.getState().step;
        const hasData = !!useAppStore.getState().editedNotes;
        const hasTrans = !!useAppStore.getState().transcription;
        const processingSt = useAppStore.getState().processingState;
        const isProcessing = ['compressing', 'uploading', 'transcribing'].includes(processingSt);

        // Guard: If processing, always show progress (unless we have data/editor)
        if (isProcessing && currentStep === 'upload') {
            const target = processingSt === 'done' ? 'ai-processing' : 'transcribing';
            useAppStore.setState({ step: target });
            history.replaceState({ step: target }, '', `#${target}`);
            return;
        }

        // Initial check on load
        if (hasData && currentStep === 'upload') {
            // User has data but is at upload? Maybe they want to see their work.
            useAppStore.setState({ step: 'editor' });
            history.replaceState({ step: 'editor' }, '', '#editor');
        } else if (!hasData && !hasTrans && !isProcessing && (currentStep === 'ai-processing' || currentStep === 'editor' || currentStep === 'transcribing')) {
            // Invalid state (reload on processing step without data)
            useAppStore.setState({ step: 'upload' });
            history.replaceState({ step: 'upload' }, '', '#upload');
        } else if (!history.state) {
            history.replaceState({ step: currentStep }, '', `#${currentStep}`);
        }

        const handlePopState = (e: PopStateEvent) => {
            const s = e.state?.step;
            const currentStoreStep = useAppStore.getState().step;
            const storeHasData = !!useAppStore.getState().editedNotes;

            if (s) {
                // Guard: If we have generated notes, block going back to 'transcribing' or 'ai-processing'
                if (storeHasData && (s === 'transcribing' || s === 'ai-processing')) {
                    // Force stay on editor
                    history.pushState({ step: 'editor' }, '', '#editor');
                    useAppStore.setState({ step: 'editor' });
                    return;
                }

                // Guard: If we are going to editor but have no notes?
                if (s === 'editor' && !storeHasData) {
                    history.replaceState({ step: 'upload' }, '', '#upload');
                    useAppStore.setState({ step: 'upload' });
                    return;
                }

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

    // Sync with external language changes (from Navbar.astro if present on same page, or just for consistency)
    useEffect(() => {
        const handleLangChange = (e: any) => {
            if (e.detail && (e.detail === 'es' || e.detail === 'en')) {
                setLocale(e.detail);
            }
        };
        window.addEventListener('scn-lang-change' as any, handleLangChange);
        return () => window.removeEventListener('scn-lang-change' as any, handleLangChange);
    }, [setLocale]);

    const toggleLocale = () => {
        const next = locale === 'es' ? 'en' : 'es';
        setLocale(next);

        // Sync with Astro components (like the Footer)
        if (typeof window !== 'undefined') {
            localStorage.setItem('scn-lang', next);
            if ((window as any).applyLang) {
                (window as any).applyLang(next);
            }
        }
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
