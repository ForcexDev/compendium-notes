import { useState, useEffect } from 'react';
import { AnimatePresence, motion } from 'framer-motion';
import { useAppStore } from '../../lib/store';

const wordsES = ['clases', 'reuniones', 'podcasts', 'entrevistas', 'conferencias'];
const wordsEN = ['lectures', 'meetings', 'podcasts', 'interviews', 'conferences'];

export default function HeroTextRotator() {
    const { locale, setLocale } = useAppStore();
    const words = locale === 'en' ? wordsEN : wordsES;
    const [index, setIndex] = useState(0);

    // Listen for language changes from the Astro i18n system
    useEffect(() => {
        const handleLangChange = (e: any) => {
            if (e.detail && (e.detail === 'es' || e.detail === 'en')) {
                setLocale(e.detail);
                setIndex(0); // Reset to first word on language change
            }
        };
        window.addEventListener('scn-lang-change', handleLangChange);
        return () => window.removeEventListener('scn-lang-change', handleLangChange);
    }, [setLocale]);

    // Sync locale from localStorage on mount (landing page doesn't have AppMain)
    useEffect(() => {
        const stored = localStorage.getItem('scn-lang');
        if (stored === 'en' || stored === 'es') {
            setLocale(stored);
        }
    }, []);

    useEffect(() => {
        const interval = setInterval(() => {
            setIndex((prev) => (prev + 1) % words.length);
        }, 2800);
        return () => clearInterval(interval);
    }, [words.length]);

    return (
        <AnimatePresence mode="wait">
            <motion.span
                key={`${locale}-${index}`}
                initial={{ y: 20, opacity: 0, filter: 'blur(4px)' }}
                animate={{ y: 0, opacity: 1, filter: 'blur(0px)' }}
                exit={{ y: -20, opacity: 0, filter: 'blur(4px)' }}
                transition={{ duration: 0.4, ease: [0.16, 1, 0.3, 1] }}
                style={{
                    display: 'inline-block',
                    paddingBottom: '0.1em',
                    background: 'linear-gradient(135deg, var(--accent), #a78bfa)',
                    WebkitBackgroundClip: 'text',
                    WebkitTextFillColor: 'transparent',
                    backgroundClip: 'text',
                }}
            >
                {words[index]}
            </motion.span>
        </AnimatePresence>
    );
}
