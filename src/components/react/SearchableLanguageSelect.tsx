import React, { useState, useRef, useEffect, useMemo } from 'react';
import { useAppStore } from '../../lib/store';
import { LANGUAGES, getLanguageName } from '../../lib/languages';
import { Search, ChevronDown, Check } from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';
import { t } from '../../lib/i18n';

export default function SearchableLanguageSelect({ disabled = false }: { disabled?: boolean }) {
    const { outputLanguage, setOutputLanguage, locale } = useAppStore();
    const [isOpen, setIsOpen] = useState(false);
    const [searchQuery, setSearchQuery] = useState('');
    const dropdownRef = useRef<HTMLDivElement>(null);

    // Close on click outside
    useEffect(() => {
        const handleClickOutside = (event: MouseEvent) => {
            if (dropdownRef.current && !dropdownRef.current.contains(event.target as Node)) {
                setIsOpen(false);
            }
        };
        document.addEventListener('mousedown', handleClickOutside);
        return () => document.removeEventListener('mousedown', handleClickOutside);
    }, []);

    const filteredLanguages = useMemo(() => {
        if (!searchQuery) return LANGUAGES;
        const q = searchQuery.toLowerCase();
        return LANGUAGES.filter(l => 
            l.name.toLowerCase().includes(q) || 
            l.nameEn.toLowerCase().includes(q)
        );
    }, [searchQuery]);

    return (
        <div className="relative w-full" ref={dropdownRef}>
            <button
                type="button"
                disabled={disabled}
                onClick={() => {
                    setIsOpen(!isOpen);
                    setSearchQuery('');
                }}
                className={`w-full flex items-center justify-between py-2.5 px-3 rounded-lg text-sm font-medium transition-all text-left ${disabled ? 'opacity-50 cursor-not-allowed' : ''}`}
                style={{
                    background: 'var(--bg-secondary)',
                    border: isOpen && !disabled ? '1px solid var(--accent)' : '1px solid var(--border-default)',
                    color: outputLanguage !== 'auto' ? 'var(--text-primary)' : 'var(--text-muted)'
                }}
            >
                <div className="flex flex-col">
                    <span className="block font-semibold" style={{ color: outputLanguage !== 'auto' ? 'var(--accent)' : 'inherit' }}>
                        {outputLanguage === 'auto' ? t('app.lang.auto', locale) : getLanguageName(outputLanguage)}
                    </span>
                    {outputLanguage === 'auto' && (
                        <span className="block text-[10px] opacity-70 mt-0.5">{t('app.lang.auto.desc', locale)}</span>
                    )}
                </div>
                <ChevronDown size={16} className={`transition-transform ${isOpen ? 'rotate-180' : ''}`} style={{ color: 'var(--text-muted)' }} />
            </button>

            <AnimatePresence>
                {isOpen && (
                    <motion.div
                        initial={{ opacity: 0, y: -5 }}
                        animate={{ opacity: 1, y: 0 }}
                        exit={{ opacity: 0, y: -5 }}
                        transition={{ duration: 0.15 }}
                        className="absolute z-50 w-full mt-2 rounded-xl shadow-lg overflow-hidden flex flex-col"
                        style={{
                            background: 'var(--bg-primary)',
                            border: '1px solid var(--border-subtle)',
                            maxHeight: '320px'
                        }}
                    >
                        <div className="p-2 border-b" style={{ borderColor: 'var(--border-subtle)' }}>
                            <div className="relative">
                                <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2" style={{ color: 'var(--text-muted)' }} />
                                <input
                                    type="text"
                                    autoFocus
                                    placeholder={locale === 'es' ? 'Buscar idioma...' : 'Search language...'}
                                    value={searchQuery}
                                    onChange={(e) => setSearchQuery(e.target.value)}
                                    className="w-full bg-transparent text-sm py-2 pl-9 pr-3 rounded-md outline-none"
                                    style={{ color: 'var(--text-primary)' }}
                                />
                            </div>
                        </div>

                        <div className="overflow-y-auto flex-1 p-2 space-y-1 custom-scrollbar">
                            {!searchQuery && (
                                <button
                                    onClick={() => {
                                        setOutputLanguage('auto');
                                        setIsOpen(false);
                                    }}
                                    className="w-full flex items-center justify-between py-2 px-3 rounded-md text-sm transition-colors text-left hover:bg-[var(--bg-secondary)]"
                                    style={{
                                        background: outputLanguage === 'auto' ? 'var(--accent-subtle)' : 'transparent',
                                        color: outputLanguage === 'auto' ? 'var(--accent)' : 'var(--text-primary)'
                                    }}
                                >
                                    <div className="flex flex-col">
                                        <span className="font-medium">{t('app.lang.auto', locale)}</span>
                                        <span className="text-[10px] opacity-70 mt-0.5">{t('app.lang.auto.desc', locale)}</span>
                                    </div>
                                    {outputLanguage === 'auto' && <Check size={16} />}
                                </button>
                            )}

                            {filteredLanguages.length === 0 ? (
                                <div className="py-4 text-center text-xs" style={{ color: 'var(--text-muted)' }}>
                                    {locale === 'es' ? 'No se encontraron idiomas.' : 'No languages found.'}
                                </div>
                            ) : (
                                filteredLanguages.map((lang) => (
                                    <button
                                        key={lang.code}
                                        onClick={() => {
                                            setOutputLanguage(lang.code);
                                            setIsOpen(false);
                                        }}
                                        className="w-full flex items-center justify-between py-2 px-3 rounded-md text-sm transition-colors text-left hover:bg-[var(--bg-secondary)]"
                                        style={{
                                            background: outputLanguage === lang.code ? 'var(--accent-subtle)' : 'transparent',
                                            color: outputLanguage === lang.code ? 'var(--accent)' : 'var(--text-primary)'
                                        }}
                                    >
                                        <span>{lang.name} <span className="opacity-50 ml-1 text-xs">({lang.nameEn})</span></span>
                                        {outputLanguage === lang.code && <Check size={16} />}
                                    </button>
                                ))
                            )}
                        </div>
                    </motion.div>
                )}
            </AnimatePresence>
        </div>
    );
}
