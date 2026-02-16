const GROQ_API_URL = 'https://api.groq.com/openai/v1';

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
    formData.append('language', 'es');
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

export async function organizeNotes(
    transcription: string,
    apiKey: string,
    onStep?: (step: number) => void
): Promise<string> {
    if (!apiKey) throw new Error('API Key no configurada');
    if (!transcription) throw new Error('No hay transcripción para organizar');

    onStep?.(1);

    // Split transcription into manageable chunks
    const chunks = splitTranscription(transcription, MAX_CHARS_PER_CHUNK);

    if (chunks.length === 1) {
        // Single chunk — full format
        const result = await callLlama(chunks[0], apiKey, 'full');
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
            partLabel
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
): Promise<string | null> {
    const systemPrompt = mode === 'full' || mode === 'first'
        ? `Eres un asistente experto en crear apuntes académicos estructurados. Tu tarea es organizar una transcripción de audio en apuntes profesionales y claros en el idioma original de la transcripción.

FORMATO DE SALIDA (Markdown):

## Título
[Título breve y descriptivo del tema principal]

## Resumen
- [Punto 1: máximo 2 líneas]
- [Punto 2: máximo 2 líneas]
- [Punto 3: máximo 2 líneas]
(3-5 bullets)

## Conceptos Clave
**Término 1**: Breve explicación
**Término 2**: Breve explicación

## Definiciones
> **[Concepto]**: [Definición textual del audio]

## Contenido

### [00:00] Introducción
[Transcripción de esta sección organizada y limpia]

### [MM:SS] [Título de sección]
[Transcripción de esta sección organizada y limpia]

INSTRUCCIONES IMPORTANTES:
- Responde en el mismo idioma que la transcripción.
- Mantén el lenguaje académico pero claro
- Resalta términos técnicos con **bold**
- Los timestamps deben estar en formato [MM:SS]
- Divide en secciones lógicas cada 3-5 minutos aproximadamente
- Corrige errores gramaticales de la transcripción
- Elimina muletillas y repeticiones innecesarias
- Si no hay definiciones claras en el audio, omite la sección de Definiciones`
        : `Eres un asistente experto en crear apuntes académicos. Esta es una CONTINUACIÓN de una transcripción larga. Organiza SOLO esta parte en secciones del contenido (no repitas el Resumen ni Conceptos Clave).

FORMATO DE SALIDA (Markdown):
### [MM:SS] [Título de sección]
[Contenido organizado]

INSTRUCCIONES:
- Mantén el lenguaje académico pero claro
- Resalta términos técnicos con **bold**
- Usa timestamps [MM:SS]
- Corrige errores gramaticales
- Elimina muletillas
- Mantén el idioma original de la transcripción`;

    const userContent = partLabel
        ? `${partLabel} — AUDIO TRANSCRITO:\n\n${transcriptionChunk}\n\nOrganiza esta parte de la transcripción.`
        : `AUDIO TRANSCRITO:\n\n${transcriptionChunk}\n\nOrganiza esta transcripción en apuntes estructurados siguiendo el formato indicado.`;

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