import { create } from 'zustand';
import { persist } from 'zustand/middleware';

export type AppStep = 'upload' | 'transcribing' | 'ai-processing' | 'editor';
export type PdfStyle = 'minimalista' | 'academico' | 'cornell';
export type Locale = 'es' | 'en';
export type Provider = 'groq' | 'gemini';
export type ProcessingState = 'idle' | 'compressing' | 'uploading' | 'transcribing' | 'analyzing' | 'done' | 'error';

interface AppState {
    // Language
    locale: Locale;
    setLocale: (locale: Locale) => void;

    // Provider
    provider: Provider;
    setProvider: (provider: Provider) => void;

    // API Keys (one per provider)
    apiKey: string;       // Groq
    setApiKey: (key: string) => void;
    geminiKey: string;    // Gemini
    setGeminiKey: (key: string) => void;

    // Active key helper
    activeKey: () => string;

    // App step
    step: AppStep;
    setStep: (step: AppStep) => void;

    // File
    file: File | null;
    setFile: (file: File | null) => void;

    // Transcription
    transcription: string;
    setTranscription: (text: string) => void;
    transcriptionProgress: number;
    setTranscriptionProgress: (p: number) => void;

    // AI Processing
    aiStep: number;
    setAiStep: (step: number) => void;
    title: string; // Smart Title
    setTitle: (title: string) => void;
    organizedNotes: string;
    setOrganizedNotes: (notes: string) => void;

    // Editor
    editedNotes: string;
    setEditedNotes: (notes: string) => void;

    // PDF
    pdfStyle: PdfStyle;
    setPdfStyle: (style: PdfStyle) => void;

    // Config
    configOpen: boolean;
    setConfigOpen: (open: boolean) => void;

    // Error
    error: string | null;
    setError: (err: string | null) => void;

    // Global Processing State
    processingState: ProcessingState;
    setProcessingState: (state: ProcessingState) => void;
    processingProgress: number; // 0-1
    setProcessingProgress: (p: number) => void;
    compressionInfo: string;
    setCompressionInfo: (info: string) => void;

    // Actions
    startProcessing: (file: File) => void;
    cancelProcessing: () => void;

    // Reset
    reset: () => void;
}

function getInitialLocale(): Locale {
    if (typeof window === 'undefined') return 'es';
    const stored = localStorage.getItem('scn-lang');
    if (stored === 'en' || stored === 'es') return stored;
    return navigator.language.startsWith('en') ? 'en' : 'es';
}

function getInitialProvider(): Provider {
    if (typeof window === 'undefined') return 'groq';
    const stored = localStorage.getItem('scn-provider');
    if (stored === 'groq' || stored === 'gemini') return stored;
    return 'groq';
}

export const useAppStore = create<AppState>()(
    persist(
        (set, get) => ({
            locale: getInitialLocale(),
            setLocale: (locale) => {
                if (typeof window !== 'undefined') localStorage.setItem('scn-lang', locale);
                set({ locale });
            },

            provider: getInitialProvider(),
            setProvider: (provider) => {
                if (typeof window !== 'undefined') localStorage.setItem('scn-provider', provider);
                set({ provider });
            },

            apiKey: typeof window !== 'undefined' ? localStorage.getItem('scn-api-key') || '' : '',
            setApiKey: (apiKey) => {
                if (typeof window !== 'undefined') localStorage.setItem('scn-api-key', apiKey);
                set({ apiKey });
            },

            geminiKey: typeof window !== 'undefined' ? localStorage.getItem('scn-gemini-key') || '' : '',
            setGeminiKey: (geminiKey) => {
                if (typeof window !== 'undefined') localStorage.setItem('scn-gemini-key', geminiKey);
                set({ geminiKey });
            },

            activeKey: () => {
                const state = get();
                return state.provider === 'gemini' ? state.geminiKey : state.apiKey;
            },

            step: 'upload',
            setStep: (step) => set({ step }),

            file: null,
            setFile: (file) => set({ file }),

            transcription: '',
            setTranscription: (transcription) => set({ transcription }),
            transcriptionProgress: 0,
            setTranscriptionProgress: (transcriptionProgress) => set({ transcriptionProgress }),

            aiStep: 0,
            setAiStep: (aiStep) => set({ aiStep }),
            organizedNotes: '',
            setOrganizedNotes: (organizedNotes) => set({ organizedNotes, editedNotes: organizedNotes }),

            editedNotes: '',
            setEditedNotes: (editedNotes) => set({ editedNotes }),

            pdfStyle: 'minimalista',
            setPdfStyle: (pdfStyle) => set({ pdfStyle }),

            title: '',
            setTitle: (title) => set({ title }),

            configOpen: false,
            setConfigOpen: (configOpen) => set({ configOpen }),

            error: null,
            setError: (error) => set({ error }),

            processingState: 'idle',
            setProcessingState: (processingState) => set({ processingState }),
            processingProgress: 0,
            setProcessingProgress: (processingProgress) => set({ processingProgress }),
            compressionInfo: '',
            setCompressionInfo: (compressionInfo) => set({ compressionInfo }),

            startProcessing: (file) => set({ file, processingState: 'compressing', processingProgress: 0, step: 'transcribing', compressionInfo: '' }),
            cancelProcessing: () => set({ processingState: 'idle', processingProgress: 0, file: null, step: 'upload' }),

            reset: () => {
                // Clear persisted storage for content
                set({
                    step: 'upload',
                    file: null,
                    transcription: '',
                    transcriptionProgress: 0,
                    aiStep: 0,
                    organizedNotes: '',
                    editedNotes: '',
                    title: '',
                    error: null,
                    processingState: 'idle',
                    processingProgress: 0,
                    compressionInfo: '',
                    // Keep keys, provider, locale, style
                });
            },
        }),
        {
            name: 'scn-storage', // unique name
            partialize: (state) => ({
                // Let's persist EVERYTHING that matters for state restoration.
                step: state.step,
                transcription: state.transcription,
                organizedNotes: state.organizedNotes,
                editedNotes: state.editedNotes,
                title: state.title,
                pdfStyle: state.pdfStyle,
                // Persist processing state so we can recover on refresh/navigation?
                // For now, let's persist it to be safe, but file objects don't persist well in JSON storage.
                // We'll rely on the GlobalProcessor being alive for SPA nav. If full reload, we lose the File object anyway.
                // Keys/Provider/Locale are manually synced for now, let's keep it that way to avoid conflict
                // or migrate them to persist?
                // Manual sync is fine. Persist handles the big data.
            }),
            // Use custom storage to merge with manual keys? No, just let it be independent.
        }
    )
);
