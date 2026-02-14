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
    setApiKey: (key: string) => Promise<void>;
    geminiKey: string;    // Gemini (Encrypted)
    setGeminiKey: (key: string) => Promise<void>;

    // Active key helper
    activeKey: () => Promise<string>;

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

    // Persistence (ID only)
    currentProjectId: number | null;
    setCurrentProjectId: (id: number | null) => void;

    // Actions
    startProcessing: (file: File) => void;
    cancelProcessing: () => void;
    restoreSession: () => Promise<void>; // New Action

    // Theme
    theme: 'light' | 'dark';
    toggleTheme: () => void;

    // Reset
    reset: () => void;
}

function getInitialTheme(): 'light' | 'dark' {
    if (typeof window === 'undefined') return 'dark';
    const stored = localStorage.getItem('scn-theme');
    if (stored === 'light' || stored === 'dark') return stored;
    return window.matchMedia('(prefers-color-scheme: light)').matches ? 'light' : 'dark';
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

// Import DB dynamically to avoid SSR issues if store is used there (though unlikely in standard React usage)
import { db, createProject, saveAudioSource, getActiveProject } from './db';
import { encryptData, decryptData } from './crypto';

export const useAppStore = create<AppState>()(
    persist(
        (set, get) => ({
            theme: getInitialTheme(),
            toggleTheme: () => {
                const current = get().theme;
                const next = current === 'dark' ? 'light' : 'dark';
                if (typeof window !== 'undefined') {
                    localStorage.setItem('scn-theme', next);
                    document.documentElement.classList.toggle('dark', next === 'dark');
                }
                set({ theme: next });
            },

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
            setApiKey: async (apiKey) => {
                if (typeof window !== 'undefined') {
                    if (!apiKey) {
                        localStorage.removeItem('scn-api-key');
                        set({ apiKey: '' });
                        return;
                    }
                    // Encrypt before storing
                    const encrypted = await encryptData(apiKey);
                    localStorage.setItem('scn-api-key', encrypted);
                    set({ apiKey: encrypted }); // Store encrypted in state too (UI should decode if needed, but usually we just need it for requests)
                }
            },

            geminiKey: typeof window !== 'undefined' ? localStorage.getItem('scn-gemini-key') || '' : '',
            setGeminiKey: async (geminiKey) => {
                if (typeof window !== 'undefined') {
                    if (!geminiKey) {
                        localStorage.removeItem('scn-gemini-key');
                        set({ geminiKey: '' });
                        return;
                    }
                    const encrypted = await encryptData(geminiKey);
                    localStorage.setItem('scn-gemini-key', encrypted);
                    set({ geminiKey: encrypted });
                }
            },

            activeKey: async () => {
                const state = get();
                const encrypted = state.provider === 'gemini' ? state.geminiKey : state.apiKey;
                if (!encrypted) return '';

                // Decrypt on demand
                try {
                    return await decryptData(encrypted);
                } catch (e) {
                    console.error('Failed to decrypt key', e);
                    return '';
                }
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

            currentProjectId: null,
            setCurrentProjectId: (id) => set({ currentProjectId: id }),

            startProcessing: async (file) => {
                // Initialize DB Project
                try {
                    const id = await createProject(file.name);
                    await saveAudioSource(id, file);
                    // Explicitly mark as processing so restoreSession knows to resume it
                    await db.projects.update(id, { status: 'processing' });

                    set({
                        currentProjectId: id,
                        file,
                        processingState: 'compressing',
                        processingProgress: 0,
                        step: 'transcribing',
                        compressionInfo: ''
                    });
                } catch (e) {
                    console.error('DB Error:', e);
                    // Fallback to memory
                    set({
                        file,
                        processingState: 'compressing',
                        processingProgress: 0,
                        step: 'transcribing',
                        compressionInfo: ''
                    });
                }
            },

            cancelProcessing: () => set({
                processingState: 'idle',
                processingProgress: 0,
                file: null,
                step: 'upload',
                currentProjectId: null,
                transcription: '',
                organizedNotes: ''
            }),

            restoreSession: async () => {
                if (typeof window === 'undefined') return;
                try {
                    const active = await getActiveProject();
                    if (active && active.project.status !== 'done') {
                        // Found a pending session
                        console.log('Restoring session:', active.project.title);

                        // Rehydrate File
                        if (active.audio) {
                            const restoredFile = new File([active.audio.file], active.audio.name, { type: active.audio.type });
                            set({ file: restoredFile });
                        }

                        set({ currentProjectId: active.project.id });

                        // Note: The rest of the state (transcription, notes) is handled by zustand persist
                        // But we might need to nudge the GlobalAudioProcessor to resume if state was mid-process
                        if (active.project.status === 'processing') {
                            console.log('Auto-resuming interrupted process...');
                            set({
                                processingState: 'compressing',
                                step: 'transcribing' // Force UI to show progress, not upload
                            });
                        }
                    }
                } catch (e) {
                    console.error('Failed to restore session:', e);
                }
            },

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
                    currentProjectId: null
                    // Keep keys, provider, locale, style, theme
                });
            },
        }),
        {
            name: 'scn-storage', // unique name
            partialize: (state) => ({
                step: state.step,
                transcription: state.transcription,
                organizedNotes: state.organizedNotes,
                editedNotes: state.editedNotes,
                title: state.title,
                pdfStyle: state.pdfStyle,
                // Don't persist file or big blobs here
            }),
        }
    )
);
