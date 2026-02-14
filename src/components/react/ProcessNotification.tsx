import React, { useEffect, useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { useAppStore } from '../../lib/store';
import { t } from '../../lib/i18n';
import { Loader2, CheckCircle, ArrowRight } from 'lucide-react';

export default function ProcessNotification() {
    const { processingState, processingProgress, locale } = useAppStore();
    const [visible, setVisible] = useState(false);
    const [isComplete, setIsComplete] = useState(false);
    const [isAppPage, setIsAppPage] = useState(false);

    useEffect(() => {
        const checkPath = () => {
            const path = window.location.pathname;
            // Only hide on actual app route
            if (path === '/app' || path.startsWith('/app/')) {
                setIsAppPage(true);
            } else {
                setIsAppPage(false);
            }
        };

        // Check on mount
        checkPath();

        // Check on navigation (Astro View Transitions)
        document.addEventListener('astro:page-load', checkPath);
        document.addEventListener('astro:after-swap', checkPath); // Extra safety

        return () => {
            document.removeEventListener('astro:page-load', checkPath);
            document.removeEventListener('astro:after-swap', checkPath);
        };
    }, []);

    useEffect(() => {
        // Don't show on app page
        if (isAppPage) {
            setVisible(false);
            return;
        }

        // Initial check: If state is processing, show immediately
        if (processingState === 'idle' || processingState === 'error') {
            setVisible(false);
            setIsComplete(false);
            return;
        }

        if (processingState === 'done') {
            setIsComplete(true);
            setVisible(true);
            // Hide after 8 seconds of completion
            const timer = setTimeout(() => {
                setVisible(false);
            }, 8000);
            return () => clearTimeout(timer);
        }

        // Active states
        setIsComplete(false);
        setVisible(true);

    }, [processingState, isAppPage]);

    if (isAppPage) return null;

    const getStatusText = () => {
        if (isComplete) return t('notif.done', locale);
        switch (processingState) {
            case 'compressing': return t('notif.compressing', locale);
            case 'uploading': return t('notif.uploading', locale);
            case 'transcribing': return t('notif.transcribing', locale);
            case 'analyzing': return t('notif.analyzing', locale);
            default: return t('notif.processing', locale);
        }
    };

    const percentage = Math.round(processingProgress * 100);

    return (
        <AnimatePresence>
            {visible && (
                <motion.div
                    initial={{ opacity: 0, y: 20, scale: 0.95 }}
                    animate={{ opacity: 1, y: 0, scale: 1 }}
                    exit={{ opacity: 0, y: 20, scale: 0.95 }}
                    transition={{ type: 'spring', stiffness: 300, damping: 30 }}
                    className="fixed bottom-4 right-4 sm:top-24 sm:right-8 sm:bottom-auto z-50 group max-w-[calc(100vw-2rem)]"
                >
                    <a href="/app" className="block relative">
                        <div className="flex items-center gap-3 sm:gap-4 px-4 py-3 sm:px-5 sm:py-3.5 rounded-xl sm:rounded-2xl shadow-2xl border transition-all hover:scale-[1.02] active:scale-[0.98]"
                            style={{
                                background: 'var(--bg-secondary)',
                                backdropFilter: 'blur(12px)',
                                borderColor: isComplete ? 'rgba(16, 185, 129, 0.5)' : 'var(--border-subtle)',
                                boxShadow: '0 8px 32px rgba(0, 0, 0, 0.2)'
                            }}
                        >
                            {/* Status Icon */}
                            <div className="w-8 h-8 sm:w-10 sm:h-10 rounded-lg sm:rounded-xl flex items-center justify-center transition-colors"
                                style={{ background: 'var(--accent-subtle)', color: 'var(--accent)' }}
                            >
                                {isComplete ? (
                                    <CheckCircle className="w-4 h-4 sm:w-5 sm:h-5" />
                                ) : (
                                    <motion.div animate={{ rotate: 360 }} transition={{ duration: 2, repeat: Infinity, ease: "linear" }}>
                                        <Loader2 className="w-4 h-4 sm:w-[18px] sm:h-[18px]" />
                                    </motion.div>
                                )}
                            </div>

                            {/* Content */}
                            <div className="flex flex-col min-w-[140px] sm:min-w-[180px]">
                                <div className="flex items-center justify-between mb-1 sm:mb-1.5 gap-2 sm:gap-3">
                                    <span className="text-[11px] sm:text-xs font-semibold tracking-wide whitespace-nowrap" style={{ color: 'var(--text-primary)' }}>
                                        {getStatusText()}
                                    </span>
                                    {!isComplete && (
                                        <span className="text-[9px] sm:text-[10px] font-mono" style={{ color: 'var(--text-muted)' }}>
                                            {percentage}%
                                        </span>
                                    )}
                                </div>

                                {!isComplete ? (
                                    <div className="w-full h-1 rounded-full overflow-hidden" style={{ background: 'var(--bg-tertiary)' }}>
                                        <motion.div
                                            className="h-full rounded-full"
                                            style={{ background: 'var(--accent)' }}
                                            initial={{ width: 0 }}
                                            animate={{ width: `${Math.max(percentage, 5)}%` }}
                                            transition={{ ease: "easeOut" }}
                                        />
                                    </div>
                                ) : (
                                    <span className="text-[9px] sm:text-[10px] font-medium" style={{ color: 'var(--accent)' }}>
                                        {t('notif.click_view', locale)}
                                    </span>
                                )}
                            </div>

                            {/* Arrow */}
                            <div className="transition-colors pl-1 sm:pl-2" style={{ color: 'var(--text-muted)' }}>
                                <ArrowRight className="w-3.5 h-3.5 sm:w-4 sm:h-4" />
                            </div>
                        </div>
                    </a>
                </motion.div>
            )}
        </AnimatePresence>
    );
}
