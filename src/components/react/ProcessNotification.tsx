import React, { useEffect, useRef, useState } from 'react';
import { motion, AnimatePresence, useReducedMotion } from 'framer-motion';
import { useAppStore } from '../../lib/store';
import type { ProcessingState } from '../../lib/store';
import { t } from '../../lib/i18n';
import { Loader2, CheckCircle, AlertCircle, ArrowRight } from 'lucide-react';

const ACTIVE_STATES: ProcessingState[] = ['compressing', 'uploading', 'transcribing', 'analyzing'];
const isActiveState = (state: ProcessingState) => ACTIVE_STATES.includes(state);

// Cada etapa ocupa un tramo fijo del 0-100% global. El progreso que publica
// el store es local a la etapa, así que sin este mapeo la barra retrocedía
// cada vez que el proceso cambiaba de fase.
const STAGE_RANGE: Record<string, [number, number]> = {
    compressing: [0, 0.25],
    uploading: [0.25, 0.4],
    transcribing: [0.4, 0.85],
    analyzing: [0.85, 1],
};

const clamp01 = (n: number) => Math.min(1, Math.max(0, n));

function globalProgress(state: ProcessingState, progress: number, aiStep: number): number {
    const range = STAGE_RANGE[state];
    if (!range) return 0;
    const [from, to] = range;
    // 'analyzing' no emite processingProgress: avanza por aiStep (0-5), la
    // misma convención que GlobalAudioProcessor usa para persistir progreso.
    const raw = state === 'analyzing' ? clamp01(aiStep / 5) : clamp01(progress);
    return from + (to - from) * raw;
}

export default function ProcessNotification() {
    // Selectores individuales: sin ellos el componente se re-renderizaba con
    // cualquier cambio del store (transcripción, notas, título...), no sólo
    // con el progreso que muestra.
    const processingState = useAppStore((s) => s.processingState);
    const processingProgress = useAppStore((s) => s.processingProgress);
    const aiStep = useAppStore((s) => s.aiStep);
    const locale = useAppStore((s) => s.locale);

    const reduceMotion = useReducedMotion();

    const [visible, setVisible] = useState(false);
    const [isAppPage, setIsAppPage] = useState(false);
    const [percentage, setPercentage] = useState(0);

    // processingState se queda pegado en 'done'/'error' hasta que el usuario
    // pulsa "Nuevo Documento", así que hace falta recordar que el aviso ya se
    // consumió; si no, reaparecía en cada vuelta a la landing.
    const doneAckRef = useRef(false);
    const errorAckRef = useRef(false);
    const wasActiveRef = useRef(false);

    const isComplete = processingState === 'done';
    const isError = processingState === 'error';

    useEffect(() => {
        const checkPath = () => {
            const path = window.location.pathname;
            // Only hide on actual app route
            setIsAppPage(path === '/app' || path.startsWith('/app/'));
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
        if (processingState === 'idle') {
            setVisible(false);
            return;
        }

        if (isActiveState(processingState)) {
            // Un proceso nuevo vuelve a habilitar los avisos finales.
            doneAckRef.current = false;
            errorAckRef.current = false;
            setVisible(!isAppPage);
            return;
        }

        if (isError) {
            // Fijo hasta que el usuario llega a /app, que es donde está el
            // detalle del fallo. Auto-ocultarlo lo volvería invisible otra vez.
            if (isAppPage) {
                errorAckRef.current = true;
                setVisible(false);
                return;
            }
            setVisible(!errorAckRef.current);
            return;
        }

        // 'done': se anuncia una sola vez por proceso completado.
        if (isAppPage) {
            // Ya está viendo el resultado en la app, el aviso sobra.
            doneAckRef.current = true;
            setVisible(false);
            return;
        }
        if (doneAckRef.current) {
            setVisible(false);
            return;
        }

        setVisible(true);
        const timer = setTimeout(() => {
            doneAckRef.current = true;
            setVisible(false);
        }, 8000);
        return () => clearTimeout(timer);
    }, [processingState, isAppPage, isError]);

    useEffect(() => {
        if (!isActiveState(processingState)) {
            if (processingState === 'done') setPercentage(100);
            else if (processingState === 'idle') setPercentage(0);
            wasActiveRef.current = false;
            return;
        }

        const value = Math.round(globalProgress(processingState, processingProgress, aiStep) * 100);
        const isNewRun = !wasActiveRef.current;
        wasActiveRef.current = true;
        // Nunca retrocede dentro de una misma ejecución.
        setPercentage((prev) => (isNewRun ? value : Math.max(prev, value)));
    }, [processingState, processingProgress, aiStep]);

    const getStatusText = () => {
        switch (processingState) {
            case 'done': return t('notif.done', locale);
            case 'error': return t('notif.error', locale);
            case 'compressing': return t('notif.compressing', locale);
            case 'uploading': return t('notif.uploading', locale);
            case 'transcribing': return t('notif.transcribing', locale);
            case 'analyzing': return t('notif.analyzing', locale);
            default: return t('notif.processing', locale);
        }
    };

    const statusText = getStatusText();
    const actionText = isError ? t('notif.click_detail', locale) : t('notif.click_view', locale);

    const accentBorder = isError
        ? 'rgba(239, 68, 68, 0.5)'
        : isComplete
            ? 'rgba(16, 185, 129, 0.5)'
            : 'var(--border-subtle)';

    const iconBg = isError ? 'rgba(239, 68, 68, 0.12)' : 'var(--accent-subtle)';
    const iconColor = isError ? '#ef4444' : 'var(--accent)';

    // Anuncio para lectores de pantalla. Vive fuera de AnimatePresence y
    // siempre montado: una live region que aparece a la vez que su contenido
    // no llega a anunciarse.
    const announcement = processingState === 'idle' ? '' : statusText;

    return (
        <>
            {!isAppPage && (
                <div
                    className="sr-only"
                    role={isError ? 'alert' : 'status'}
                    aria-live={isError ? 'assertive' : 'polite'}
                    aria-atomic="true"
                >
                    {announcement}
                </div>
            )}

            <AnimatePresence>
                {visible && (
                    <motion.div
                        initial={reduceMotion ? { opacity: 0 } : { opacity: 0, y: 20, scale: 0.95 }}
                        animate={reduceMotion ? { opacity: 1 } : { opacity: 1, y: 0, scale: 1 }}
                        exit={reduceMotion ? { opacity: 0 } : { opacity: 0, y: 20, scale: 0.95 }}
                        transition={reduceMotion
                            ? { duration: 0.15 }
                            : { type: 'spring', stiffness: 300, damping: 30 }}
                        className="fixed bottom-4 right-4 sm:top-24 sm:right-8 sm:bottom-auto z-50 group max-w-[calc(100vw-2rem)]"
                    >
                        <a href="/app" className="block relative" aria-label={`${statusText}. ${actionText}`}>
                            {/* El contenido visual duplica lo que ya anuncia la live region */}
                            <div aria-hidden="true"
                                className="flex items-center gap-3 sm:gap-4 px-4 py-3 sm:px-5 sm:py-3.5 rounded-xl sm:rounded-2xl shadow-2xl border transition-all motion-safe:hover:scale-[1.02] motion-safe:active:scale-[0.98]"
                                style={{
                                    background: 'var(--bg-secondary)',
                                    backdropFilter: 'blur(12px)',
                                    borderColor: accentBorder,
                                    boxShadow: '0 8px 32px rgba(0, 0, 0, 0.2)'
                                }}
                            >
                                {/* Status Icon */}
                                <div className="w-8 h-8 sm:w-10 sm:h-10 rounded-lg sm:rounded-xl flex items-center justify-center transition-colors"
                                    style={{ background: iconBg, color: iconColor }}
                                >
                                    {isError ? (
                                        <AlertCircle className="w-4 h-4 sm:w-5 sm:h-5" />
                                    ) : isComplete ? (
                                        <CheckCircle className="w-4 h-4 sm:w-5 sm:h-5" />
                                    ) : reduceMotion ? (
                                        <Loader2 className="w-4 h-4 sm:w-[18px] sm:h-[18px]" />
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
                                            {statusText}
                                        </span>
                                        {!isComplete && !isError && (
                                            <span className="text-[9px] sm:text-[10px] font-mono" style={{ color: 'var(--text-muted)' }}>
                                                {percentage}%
                                            </span>
                                        )}
                                    </div>

                                    {!isComplete && !isError ? (
                                        <div className="w-full h-1 rounded-full overflow-hidden" style={{ background: 'var(--bg-tertiary)' }}>
                                            <motion.div
                                                className="h-full rounded-full"
                                                style={{ background: 'var(--accent)' }}
                                                initial={{ width: 0 }}
                                                animate={{ width: `${Math.max(percentage, 5)}%` }}
                                                transition={{ duration: reduceMotion ? 0 : 0.4, ease: "easeOut" }}
                                            />
                                        </div>
                                    ) : (
                                        <span className="text-[9px] sm:text-[10px] font-medium" style={{ color: isError ? '#ef4444' : 'var(--accent)' }}>
                                            {actionText}
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
        </>
    );
}
