export interface Language {
    code: string;
    name: string; // Native or localized name
    nameEn: string; // English name for API prompting
}

export const LANGUAGES: Language[] = [
    { code: 'es', name: 'Español', nameEn: 'Spanish' },
    { code: 'en', name: 'English', nameEn: 'English' },
    { code: 'fr', name: 'Français', nameEn: 'French' },
    { code: 'de', name: 'Deutsch', nameEn: 'German' },
    { code: 'it', name: 'Italiano', nameEn: 'Italian' },
    { code: 'pt', name: 'Português', nameEn: 'Portuguese' },
    { code: 'ru', name: 'Русский', nameEn: 'Russian' },
    { code: 'zh', name: '中文', nameEn: 'Chinese' },
    { code: 'ja', name: '日本語', nameEn: 'Japanese' },
    { code: 'ko', name: '한국어', nameEn: 'Korean' },
    { code: 'ar', name: 'العربية', nameEn: 'Arabic' },
    { code: 'hi', name: 'हिन्दी', nameEn: 'Hindi' },
    { code: 'bn', name: 'বাংলা', nameEn: 'Bengali' },
    { code: 'tr', name: 'Türkçe', nameEn: 'Turkish' },
    { code: 'nl', name: 'Nederlands', nameEn: 'Dutch' },
    { code: 'pl', name: 'Polski', nameEn: 'Polish' },
    { code: 'sv', name: 'Svenska', nameEn: 'Swedish' },
    { code: 'da', name: 'Dansk', nameEn: 'Danish' },
    { code: 'no', name: 'Norsk', nameEn: 'Norwegian' },
    { code: 'fi', name: 'Suomi', nameEn: 'Finnish' },
    { code: 'el', name: 'Ελληνικά', nameEn: 'Greek' },
    { code: 'he', name: 'עברית', nameEn: 'Hebrew' },
    { code: 'id', name: 'Bahasa Indonesia', nameEn: 'Indonesian' },
    { code: 'ms', name: 'Bahasa Melayu', nameEn: 'Malay' },
    { code: 'th', name: 'ไทย', nameEn: 'Thai' },
    { code: 'vi', name: 'Tiếng Việt', nameEn: 'Vietnamese' },
    { code: 'uk', name: 'Українська', nameEn: 'Ukrainian' },
    { code: 'cs', name: 'Čeština', nameEn: 'Czech' },
    { code: 'hu', name: 'Magyar', nameEn: 'Hungarian' },
    { code: 'ro', name: 'Română', nameEn: 'Romanian' },
    { code: 'sk', name: 'Slovenčina', nameEn: 'Slovak' }
];

export function getLanguageName(code: string): string {
    return LANGUAGES.find(l => l.code === code)?.name || code;
}

export function getLanguageNameEn(code: string): string {
    return LANGUAGES.find(l => l.code === code)?.nameEn || code;
}
