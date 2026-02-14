import React, { useEffect, useRef } from 'react';
import { motion } from 'framer-motion';
import { Check, Loader2 } from 'lucide-react';
import { useAppStore } from '../../lib/store';
import { t } from '../../lib/i18n';
import { organizeNotes } from '../../lib/groq';
import { organizeNotesWithGemini } from '../../lib/gemini';

export default function AIProcessing() {
    const {
        transcription, apiKey, geminiKey, provider,
        aiStep, setAiStep,
        setOrganizedNotes, setStep, setError, locale,
        setTitle // Import setTitle
    } = useAppStore();
    const started = useRef(false);

    const steps = [
        t('app.ai.step1', locale),
        t('app.ai.step2', locale),
        t('app.ai.step3', locale),
        t('app.ai.step4', locale),
        t('app.ai.step5', locale),
    ];

    useEffect(() => {
        // This component is now just a viewer.
        // The GlobalAudioProcessor handles the logic.
        // We only need to check if we are done (idempotency/refresh handling)

        const currentNotes = useAppStore.getState().organizedNotes;
        if (currentNotes) {
            // Already done?
            setAiStep(steps.length - 1);
            setTimeout(() => setStep('editor'), 100);
        }
    }, []);

    return (
        <div className="text-center space-y-8">
            {/* Header */}
            <div>
                <h2 className="text-lg font-semibold mb-1" style={{ color: 'var(--text-primary)', letterSpacing: '-0.02em' }}>
                    {t('app.ai.title', locale)}
                </h2>
                <p className="text-sm" style={{ color: 'var(--text-muted)' }}>
                    {provider === 'gemini'
                        ? (locale === 'es' ? 'Gemini Flash 2.0 está creando tus apuntes' : 'Gemini Flash 2.0 is creating your notes')
                        : t('app.ai.desc', locale)
                    }
                </p>
            </div>

            {/* Steps */}
            <div className="max-w-xs mx-auto space-y-1 text-left">
                {steps.map((label, i) => {
                    const isComplete = i < aiStep;
                    const isActive = i === aiStep;

                    return (
                        <div
                            key={i}
                            className="flex items-center gap-3 py-2.5 px-3 rounded-lg transition-all"
                            style={{
                                background: isActive ? 'var(--accent-subtle)' : 'transparent',
                                opacity: !isComplete && !isActive ? 0.4 : 1,
                            }}
                        >
                            <div className="w-6 h-6 rounded-full flex items-center justify-center flex-shrink-0" style={{
                                background: isComplete ? 'var(--accent)' : isActive ? 'var(--accent-subtle)' : 'var(--bg-tertiary)',
                            }}>
                                {isComplete ? (
                                    <Check size={12} className="text-white" />
                                ) : isActive ? (
                                    <motion.div animate={{ rotate: 360 }} transition={{ duration: 1.5, repeat: Infinity, ease: 'linear' }}>
                                        <Loader2 size={12} style={{ color: 'var(--accent)' }} />
                                    </motion.div>
                                ) : (
                                    <span className="text-[10px] font-mono" style={{ color: 'var(--text-muted)' }}>{i + 1}</span>
                                )}
                            </div>
                            <span className="text-sm" style={{ color: isActive ? 'var(--text-primary)' : isComplete ? 'var(--text-secondary)' : 'var(--text-muted)' }}>
                                {label}
                            </span>
                        </div>
                    );
                })}
            </div>

            {/* Provider badge */}
            <div className="inline-flex items-center gap-1.5 text-xs px-3 py-1.5 rounded-md" style={{
                background: 'var(--accent-subtle)', border: '1px solid var(--accent)', color: 'var(--accent)',
            }}>
                {provider === 'gemini' ? 'Gemini Flash 2.0' : 'Llama 3.3 70B'}
            </div>
        </div>
    );
}
