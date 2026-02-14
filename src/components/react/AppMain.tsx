import React, { useEffect, useCallback } from 'react';
import { AnimatePresence, motion } from 'framer-motion';
import { Settings, X, Globe, Sun, Moon } from 'lucide-react';
import { useAppStore } from '../../lib/store';
import { t } from '../../lib/i18n';
import UploadZone from './UploadZone';
import ConfigModal from './ConfigModal';
import TranscriptionProgress from './TranscriptionProgress';
import AIProcessing from './AIProcessing';
import NotesEditor from './NotesEditor';

// --- AJUSTE DE POSICIÓN VERTICAL ---
// Modifica estos valores para subir o bajar el contenido:
// Valores positivos bajan el contenido, valores negativos lo suben.
const PC_VERTICAL_OFFSET = "-80px";    // Ajuste para ordenador (ej: "-40px", "0px", "20px")
const MOBILE_VERTICAL_OFFSET = "-60px"; // Ajuste para teléfono
// ------------------------------------

export default function AppMain() {
    const { step, configOpen, setConfigOpen, error, setError, apiKey, geminiKey, provider, locale, setLocale, processingState, theme, toggleTheme } = useAppStore();

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
        if (isProcessing) {
            // Force redirect if we are on upload step or have no meaningful step
            if (currentStep === 'upload' || !currentStep) {
                const target = processingSt === 'done' ? 'ai-processing' : 'transcribing';
                useAppStore.setState({ step: target });
                history.replaceState({ step: target }, '', `#${target}`);
                return;
            }
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
        if ((window as any).toggleLang) {
            (window as any).toggleLang();
        } else {
            const next = locale === 'es' ? 'en' : 'es';
            setLocale(next);
            if ((window as any).applyLang) (window as any).applyLang(next);
        }
    };

    // Sync with external theme changes
    useEffect(() => {
        const handleThemeChange = (e: any) => {
            if (e.detail && (e.detail === 'light' || e.detail === 'dark')) {
                useAppStore.setState({ theme: e.detail });
            }
        };
        window.addEventListener('scn-theme-change' as any, handleThemeChange);
        return () => window.removeEventListener('scn-theme-change' as any, handleThemeChange);
    }, []);

    // Sync Provider badge with Global Navbar
    useEffect(() => {
        const label = document.getElementById('provider-label');
        if (label) label.textContent = provider === 'gemini' ? 'Gemini' : 'Groq';
    }, [provider]);

    // Handle open config from Global Navbar
    useEffect(() => {
        const handleOpenConfig = () => setConfigOpen(true);
        window.addEventListener('scn-open-config' as any, handleOpenConfig);
        return () => window.removeEventListener('scn-open-config' as any, handleOpenConfig);
    }, [setConfigOpen]);

    return (
        <div className="min-h-screen flex flex-col pt-14" style={{ background: 'var(--bg-primary)', color: 'var(--text-primary)' }}>
            {/* Main content */}
            <main className="flex-1 flex items-center justify-center p-4 sm:p-6">
                <div className="w-full flex flex-col items-center">
                    {/* Estilos para el ajuste de posición vertical (Solo aplica a los pasos iniciales) */}
                    <style>{`
                        .vertical-offset-container {
                            margin-top: ${MOBILE_VERTICAL_OFFSET};
                        }
                        @media (min-width: 1024px) {
                            .vertical-offset-container {
                                margin-top: ${PC_VERTICAL_OFFSET};
                            }
                        }
                    `}</style>

                    <AnimatePresence mode="wait">
                        {step === 'upload' && (
                            <motion.div key="upload" initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -8 }} transition={{ duration: 0.25 }} className="w-full max-w-2xl vertical-offset-container">
                                <UploadZone />
                            </motion.div>
                        )}
                        {step === 'transcribing' && (
                            <motion.div key="transcribing" initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -8 }} transition={{ duration: 0.25 }} className="w-full max-w-lg vertical-offset-container">
                                <TranscriptionProgress />
                            </motion.div>
                        )}
                        {step === 'ai-processing' && (
                            <motion.div key="ai" initial={{ opacity: 0, scale: 0.98 }} animate={{ opacity: 1, scale: 1 }} exit={{ opacity: 0, scale: 0.98 }} transition={{ duration: 0.3 }} className="w-full max-w-lg vertical-offset-container">
                                <AIProcessing />
                            </motion.div>
                        )}
                        {step === 'editor' && (
                            <motion.div key="editor" initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -8 }} transition={{ duration: 0.25 }} className="w-full max-w-6xl h-[calc(100vh-7rem)]">
                                <NotesEditor />
                            </motion.div>
                        )}
                    </AnimatePresence>
                </div>
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
