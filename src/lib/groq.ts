const GROQ_API_URL = 'https://api.groq.com/openai/v1';
import { getLanguageNameEn } from './languages';

/**
 * Transcribe a single audio file (must be ≤ 25MB)
 */
async function transcribeSingleFile(
    file: File,
    apiKey: string,
): Promise<string> {
    const fileSizeMB = file.size / (1024 * 1024);
    console.log(`[Groq] Iniciando transcripción de ${file.name} (${fileSizeMB.toFixed(2)}MB)`);

    // Timeout dinámico: 2min base + 30s por cada 5MB adicionales
    const baseSizeMB = 5;
    const baseTimeout = 120000; // 2 min
    const extraTimePerChunk = 30000; // 30s por cada 5MB
    const timeout = baseTimeout + Math.max(0, Math.ceil((fileSizeMB - baseSizeMB) / baseSizeMB)) * extraTimePerChunk;

    console.log(`[Groq] Timeout: ${(timeout / 1000).toFixed(0)}s for ${fileSizeMB.toFixed(1)}MB file`);

    const formData = new FormData();
    formData.append('file', file);
    formData.append('model', 'whisper-large-v3-turbo');
    formData.append('response_format', 'verbose_json');
    formData.append('timestamp_granularities[]', 'segment');

    try {
        const controller = new AbortController();
        const timeoutId = setTimeout(() => controller.abort(), timeout);

        const response = await fetch(`${GROQ_API_URL}/audio/transcriptions`, {
            method: 'POST',
            headers: { 'Authorization': `Bearer ${apiKey}` },
            body: formData,
            signal: controller.signal,
        });
        clearTimeout(timeoutId);

        if (!response.ok) {
            const errorData = await response.json().catch(() => ({}));
            console.error('[Groq] Error API:', response.status, errorData);
            if (response.status === 401) {
                throw new Error('API Key inválida. Verifica tu key de Groq.');
            }
            if (response.status === 413) {
                throw new Error('Archivo demasiado grande para Groq (límite 25MB).');
            }
            if (response.status === 429) {
                throw new Error('Límite de Groq alcanzado. Espera un momento.');
            }
            throw new Error(errorData?.error?.message || `Error del servidor (${response.status})`);
        }

        const data = await response.json();
        console.log('[Groq] Transcripción completada');

        if (data.segments && data.segments.length > 0) {
            return data.segments
                .map((seg: any) => {
                    const mins = Math.floor(seg.start / 60);
                    const secs = Math.floor(seg.start % 60);
                    const timestamp = `[${String(mins).padStart(2, '0')}:${String(secs).padStart(2, '0')}]`;
                    return `${timestamp} ${seg.text.trim()}`;
                })
                .join('\n');
        }

        return data.text || '';
    } catch (err: any) {
        if (err.name === 'AbortError') {
            throw new Error('La transcripción tardó demasiado (timeout). Intenta con un archivo más corto o comprimido.');
        }
        throw err;
    }
}

/**
 * Transcribe one or multiple chunks sequentially
 */
export async function transcribeAudio(
    chunks: File[],
    apiKey: string,
    onProgress?: (progress: number) => void
): Promise<string> {
    if (!apiKey) throw new Error('API Key no configurada');
    if (!chunks.length) throw new Error('No hay archivos para transcribir');

    const results: string[] = [];
    const total = chunks.length;

    console.log(`[Groq] Iniciando procesamiento de ${total} fragmentos`);

    for (let i = 0; i < total; i++) {
        // Start minimal progress (5%) + chunk progress
        onProgress?.(Math.min(0.95, ((i / total) * 0.9) + 0.05));

        const text = await transcribeSingleFile(chunks[i], apiKey);
        results.push(text);

        onProgress?.(((i + 1) / total) * 0.9);
    }

    onProgress?.(1);
    return results.join('\n\n');
}

// ~4 chars per token on average. Groq free tier = 30k TPM for Llama 4 scout and 500k TPD
// whisper large v3 turbo 20 RPM 28.8k Audio seconds per day 7.2K Audio seconds per hour
const MAX_CHARS_PER_CHUNK = 28000;
const DELAY_BETWEEN_CHUNKS_MS = 6000; // avoid rate limits

import type { SummaryLevel } from './store';

export async function organizeNotes(
    transcription: string,
    apiKey: string,
    onStep?: (step: number) => void,
    summaryLevel: SummaryLevel = 'short',
    outputLanguage: string = 'auto'
): Promise<string> {
    if (!apiKey) throw new Error('API Key no configurada');
    if (!transcription) throw new Error('No hay transcripción para organizar');

    onStep?.(1);

    // Split transcription into manageable chunks
    const chunks = splitTranscription(transcription, MAX_CHARS_PER_CHUNK);

    if (chunks.length === 1) {
        // Single chunk — full format
        const result = await callLlama(chunks[0], apiKey, 'full', undefined, summaryLevel, outputLanguage);
        onStep?.(4);
        if (!result) throw new Error('La IA no generó contenido. Intenta de nuevo.');
        onStep?.(5);
        return result;
    }

    // Multiple chunks — process each, then merge
    onStep?.(2);
    const partResults: string[] = [];

    for (let i = 0; i < chunks.length; i++) {
        const isFirst = i === 0;
        const partLabel = `Parte ${i + 1}/${chunks.length}`;
        const result = await callLlama(
            chunks[i],
            apiKey,
            isFirst ? 'first' : 'continuation',
            partLabel,
            summaryLevel,
            outputLanguage
        );
        if (result) partResults.push(result);

        // Delay between chunks to avoid TPM limits
        if (i < chunks.length - 1) {
            await new Promise(r => setTimeout(r, DELAY_BETWEEN_CHUNKS_MS));
        }
        onStep?.(2 + Math.floor(((i + 1) / chunks.length) * 2));
    }

    onStep?.(5);
    return partResults.join('\n\n---\n\n');
}

function splitTranscription(text: string, maxChars: number): string[] {
    if (text.length <= maxChars) return [text];

    const chunks: string[] = [];
    const lines = text.split('\n');
    let current = '';

    for (const line of lines) {
        if (current.length + line.length + 1 > maxChars && current.length > 0) {
            chunks.push(current.trim());
            current = '';
        }
        current += line + '\n';
    }
    if (current.trim()) chunks.push(current.trim());

    return chunks;
}

async function callLlama(
    transcriptionChunk: string,
    apiKey: string,
    mode: 'full' | 'first' | 'continuation',
    partLabel?: string,
    summaryLevel: SummaryLevel = 'short',
    outputLanguage: string = 'auto'
): Promise<string | null> {
    const langInstructions = outputLanguage === 'auto'
        ? 'Write ALL notes strictly in the EXACT SAME LANGUAGE as the original audio. Do NOT translate anything.'
        : `TRANSLATE the Title, Summary, Key Concepts, and Definitions strictly into ${getLanguageNameEn(outputLanguage)}.`;

    const translationRule = outputLanguage === 'auto'
        ? '- Keep everything in the original spoken language of the audio.'
        : `- CRITICAL: Translate ONLY the Title, Summary, Concepts, and Definitions into ${getLanguageNameEn(outputLanguage).toUpperCase()}. The content blocks under ### [MM:SS] MUST REMAIN IN THE ORIGINAL SPOKEN LANGUAGE and must NOT be translated.`;

    // SHORT prompt
    const shortPrompt = `You are an expert assistant specialized in creating structured academic notes. Your task is to organize an audio transcript into clear and professional notes ${langInstructions}

OUTPUT FORMAT (Markdown):

## Title
[Brief and descriptive title of the main topic]

## Summary
- [Point 1: max 2 lines]
- [Point 2: max 2 lines]
- [Point 3: max 2 lines]
(3-5 bullets)

## Key Concepts
**Term 1**: Brief explanation
**Term 2**: Brief explanation

## Definitions
> **[Concept]**: [Textual definition from the audio]

## Content

### [00:00] Introduction
[Translated and organized main points of this section]

### [MM:SS] [Section Title]
[Translated and organized main points of this section]

IMPORTANT INSTRUCTIONS:
- Maintain an academic but clear language
- Highlight technical terms with **bold**
- Timestamps must be in [MM:SS] format
- Divide into logical sections approximately every 3-5 minutes
- Correct grammatical errors from the transcription
- Remove filler words and unnecessary repetitions
- If there are no clear definitions in the audio, omit the Definitions section
${translationRule}`;

    // MEDIUM prompt
    const mediumPrompt = `You are an expert assistant specialized in creating structured and detailed academic notes. Your task is to organize an audio transcript into professional notes ${langInstructions}

OUTPUT FORMAT (Markdown):

# [Descriptive Title of the Topic]

## Summary
[3-5 paragraphs synthesizing the complete content. Each paragraph 3-4 lines.]

## Key Concepts
- **Concept 1**: 2-3 line explanation
- **Concept 2**: 2-3 line explanation
(8-12 concepts)

## Definitions
> **[Term]**: [Complete definition based on the audio]

## Content Development

### [MM:SS] [Section Title]
[2-4 paragraphs of translated and organized content developing this section]

### [MM:SS] [Next section]
[2-4 paragraphs with examples and details]

## Review Questions
1. **Q:** [Conceptual question]
   **A:** [2-3 line answer]
(5-10 questions)

INSTRUCTIONS:
- Academic but clear language
- Highlight technical terms with **bold**
- Timestamps in [MM:SS] format
- Correct grammatical errors
- Remove filler words
- Develop each section with sufficient detail
${translationRule}`;

    // LONG prompt
    const longPrompt = `You are an expert assistant specialized in creating EXHAUSTIVE and professional academic notes ${langInstructions}

CRITICAL OBJECTIVE:
Transform the transcript into an academic document SO COMPLETE that it eliminates the need to listen to the audio again.

EXHAUSTIVENESS RULE:
- DO NOT mention the word exhaustive or any similar word in the content.
- USE ALL AVAILABLE TOKENS
- DO NOT summarize too much - DEVELOP each concept COMPLETELY
- If the transcript is long, the notes MUST be proportionally long
- Each section must have MULTIPLE dense paragraphs

STRUCTURE:

# [Professional Descriptive Title]

## 1. Summary
[3-6 DENSE paragraphs. Each paragraph 4-6 lines minimum.]

## 2. Key Concepts
- **Concept**: Detailed explanation
(8-15 concepts)

## 3. Content Development
### [MM:SS] [Subtitle]
[4-8 paragraphs of translated and organized content per section: context, theoretical explanation, examples, implications]

## 4. Definitions and Terminology
> **Term**: Complete definition

## 5. Examples and Case Studies
[All mentioned examples, fully developed]

## 6. Connections and Synthesis
[3-5 paragraphs connecting concepts]

## 7. Review Questions
1. **Q:** [Deep question]
   **A:** [3-5 line answer]
(10-20 questions)

INSTRUCTIONS:
- NO emojis
- Clean and professional Markdown
- Highlight terms with **bold**
- Timestamps [MM:SS]
- Correct grammatical errors
- Remove filler words
- GENERATE AS MUCH CONTENT AS POSSIBLE
${translationRule}`;

    const continuationPrompt = `You are an expert assistant specialized in creating academic notes. This is a CONTINUATION of a long transcript. Organize ONLY this part into content sections (do not repeat Synthesis or Key Concepts) ${langInstructions}

OUTPUT FORMAT (Markdown):
### [MM:SS] [Section Title]
[Organized content]

INSTRUCTIONS:
- Maintain an academic but clear language
- Highlight technical terms with **bold**
- Use timestamps [MM:SS]
- Correct grammatical errors
- Remove filler words
${translationRule}`;

    let systemPrompt: string;
    if (mode === 'continuation') {
        systemPrompt = continuationPrompt;
    } else {
        switch (summaryLevel) {
            case 'medium': systemPrompt = mediumPrompt; break;
            case 'long': systemPrompt = longPrompt; break;
            default: systemPrompt = shortPrompt; break;
        }
    }

    const userContent = partLabel
        ? `${partLabel} — TRANSCRIBED AUDIO:\n\n${transcriptionChunk}\n\nOrganize this part of the transcription.`
        : `TRANSCRIBED AUDIO:\n\n${transcriptionChunk}\n\nOrganize this transcription into structured notes following the indicated format.`;

    const response = await fetch(`${GROQ_API_URL}/chat/completions`, {
        method: 'POST',
        headers: {
            'Authorization': `Bearer ${apiKey}`,
            'Content-Type': 'application/json',
        },
        body: JSON.stringify({
            model: 'meta-llama/llama-4-scout-17b-16e-instruct',
            messages: [
                { role: 'system', content: systemPrompt },
                { role: 'user', content: userContent },
            ],
            temperature: 0.3,
            max_tokens: 4000,
        }),
    });

    if (!response.ok) {
        const errorData = await response.json().catch(() => ({}));
        if (response.status === 429) {
            // Wait and retry once
            await new Promise(r => setTimeout(r, 10000));
            return callLlama(transcriptionChunk, apiKey, mode, partLabel);
        }
        throw new Error(errorData?.error?.message || `Error del servidor (${response.status})`);
    }

    const data = await response.json();
    return data.choices?.[0]?.message?.content || null;
}
// ... existing code ...

export async function validateGroqKey(apiKey: string): Promise<boolean> {
    try {
        const response = await fetch(`${GROQ_API_URL}/models`, {
            method: 'GET',
            headers: { 'Authorization': `Bearer ${apiKey}` },
        });
        return response.ok;
    } catch (e) {
        console.error('Groq validation error:', e);
        return false;
    }
}