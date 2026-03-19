const GEMINI_API_URL = 'https://generativelanguage.googleapis.com/v1beta';
const GEMINI_UPLOAD_URL = 'https://generativelanguage.googleapis.com/upload/v1beta';

import { getLanguageNameEn } from './languages';

// ---------------------------------------------------------------------------
// Modelos y sus límites reales de output tokens
// Actualiza estos valores si los modelos cambian sus límites
// ---------------------------------------------------------------------------

/**
 * Tokens máximos de OUTPUT para cada modelo en operaciones de ORGANIZACIÓN.
 * Se usa el máximo real declarado por la API para aprovechar al máximo el modelo.
 * Si un modelo no está en el mapa, se usa 8192 como valor conservador por defecto.
 */
export const ORGANIZATION_MAX_OUTPUT_TOKENS: Record<string, number> = {
    'gemini-3-flash-preview': 65536,  // 64K
    'gemini-3.1-flash-lite-preview': 8192,  // 8K  ← límite real del modelo
    'gemini-2.5-flash-lite': 65536,  // 64K
    'gemini-2.5-flash': 65536,  // 64K
};

/**
 * Tokens máximos de OUTPUT para TRANSCRIPCIÓN — fijo en 8192 para todos los modelos.
 * Los chunks son de 20 min máximo (~3000-5000 palabras = ~4000-6500 tokens),
 * así que 8192 da margen suficiente en cualquier modelo de la cadena de fallback.
 */
export const TRANSCRIPTION_MAX_OUTPUT_TOKENS = 8192;

/**
 * Cadenas de fallback por tipo de operación.
 * El orden importa: primary → fallback1 → fallback2
 *
 * Transcripción: prioriza modelos con alto TPM (250K)
 *   - 3.1 Flash Lite Preview: 15 RPM · 250K TPM · 500 RPD  ← primario
 *   - 2.5 Flash Lite:         10 RPM · 250K TPM · 20 RPD   ← fallback 1
 *   - 2.5 Flash:               5 RPM · 250K TPM · 20 RPD   ← fallback 2
 *
 * Organización: prioriza calidad; si se agota el RPD diario, baja al siguiente
 *   - 3 Flash Preview:         5 RPM · 250K TPM · 20 RPD   ← primario  (65K output)
 *   - 3.1 Flash Lite Preview: 15 RPM · 250K TPM · 500 RPD  ← fallback 1 (8K output)
 *   - 2.5 Flash Lite:         10 RPM · 250K TPM · 20 RPD   ← fallback 2 (64K output)
 */
export const TRANSCRIPTION_FALLBACK_MODELS = [
    'gemini-3.1-flash-lite-preview',
    'gemini-2.5-flash-lite',
    'gemini-2.5-flash',
] as const;

export const ORGANIZATION_FALLBACK_MODELS = [
    'gemini-3-flash-preview',
    'gemini-3.1-flash-lite-preview',
    'gemini-2.5-flash-lite',
] as const;

/**
 * Umbral de duración para decidir la estrategia de transcripción:
 *   ≤ 20 min → transcribeWithGemini       (1 chunk, 1 request directo)
 *   > 20 min → transcribeWithGeminiChunked (N chunks de 20 min en paralelo)
 */
export const DURATION_THRESHOLD_CHUNKING = 20;

/**
 * Ajustar todos los timestamps en una transcripción sumando un offset en minutos
 */
function adjustTimestamps(text: string, offsetMinutes: number): string {
    if (offsetMinutes === 0) return text;

    const timestampPattern = /\[(\d{1,2}):(\d{2})(?::(\d{2}))?\]/g;

    return text.replace(timestampPattern, (match, part1, part2, part3) => {
        let totalSeconds: number;

        if (part3 !== undefined) {
            // Formato HH:MM:SS
            const hours = parseInt(part1, 10);
            const minutes = parseInt(part2, 10);
            const seconds = parseInt(part3, 10);
            totalSeconds = hours * 3600 + minutes * 60 + seconds;
        } else {
            // Formato MM:SS
            const minutes = parseInt(part1, 10);
            const seconds = parseInt(part2, 10);
            totalSeconds = minutes * 60 + seconds;
        }

        // Sumar offset
        totalSeconds += offsetMinutes * 60;

        // Convertir de vuelta
        const finalHours = Math.floor(totalSeconds / 3600);
        const finalMinutes = Math.floor((totalSeconds % 3600) / 60);
        const finalSeconds = totalSeconds % 60;

        if (finalHours > 0) {
            return `[${finalHours.toString().padStart(2, '0')}:${finalMinutes.toString().padStart(2, '0')}:${finalSeconds.toString().padStart(2, '0')}]`;
        } else {
            return `[${finalMinutes.toString().padStart(2, '0')}:${finalSeconds.toString().padStart(2, '0')}]`;
        }
    });
}

/**
 * Extraer segmentos (timestamp + contenido) de una transcripción
 */
interface TranscriptSegment {
    timestamp: string;
    content: string;
}

function extractSegments(text: string): TranscriptSegment[] {
    const segments: TranscriptSegment[] = [];
    const timestampPattern = /\[(\d{1,2}:\d{2}(?::\d{2})?)\]/g;

    let match;
    let lastIndex = 0;
    let lastTimestamp = '';

    while ((match = timestampPattern.exec(text)) !== null) {
        // Guardar segmento anterior si existe
        if (lastTimestamp) {
            const content = text.substring(lastIndex, match.index).trim();
            if (content) {
                segments.push({ timestamp: lastTimestamp, content });
            }
        }

        lastTimestamp = match[1];
        lastIndex = match.index + match[0].length;
    }

    // Último segmento
    if (lastTimestamp && lastIndex < text.length) {
        const content = text.substring(lastIndex).trim();
        if (content) {
            segments.push({ timestamp: lastTimestamp, content });
        }
    }

    return segments;
}

/**
 * Normalizar texto para comparación (minúsculas, sin puntuación extra)
 */
function normalizeForComparison(text: string): string {
    return text.toLowerCase()
        .replace(/[.,!?;:]/g, '')
        .replace(/\s+/g, ' ')
        .trim();
}

/**
 * Detectar y eliminar duplicación exacta entre chunks
 * Estrategia: Comparar últimos segmentos del chunk anterior con primeros del siguiente
 */
function detectAndRemoveOverlap(chunks: Array<{ text: string; index: number; offsetMinutes: number }>): string {
    if (chunks.length === 0) return '';
    if (chunks.length === 1) return chunks[0].text;

    const results: string[] = [];

    for (let i = 0; i < chunks.length; i++) {
        let chunkText = chunks[i].text;

        // Si no es el primer chunk, buscar duplicación con el anterior
        if (i > 0) {
            const prevChunk = chunks[i - 1].text;
            const prevSegments = extractSegments(prevChunk);
            const currSegments = extractSegments(chunkText);

            if (prevSegments.length === 0 || currSegments.length === 0) {
                results.push(chunkText);
                continue;
            }

            // Tomar los últimos 3-5 segmentos del chunk anterior
            const lastSegmentsCount = Math.min(5, prevSegments.length);
            const lastSegments = prevSegments.slice(-lastSegmentsCount);

            // Tomar los primeros 3-5 segmentos del chunk actual
            const firstSegmentsCount = Math.min(5, currSegments.length);
            const firstSegments = currSegments.slice(0, firstSegmentsCount);

            // Buscar coincidencias
            let overlapFound = false;
            let removeUpToIndex = 0;

            for (let j = 0; j < lastSegments.length && !overlapFound; j++) {
                const lastContent = normalizeForComparison(lastSegments[j].content);

                for (let k = 0; k < firstSegments.length; k++) {
                    const firstContent = normalizeForComparison(firstSegments[k].content);

                    // Si hay coincidencia de al menos 20 caracteres
                    if (lastContent.length > 20 && firstContent.length > 20) {
                        const similarity = calculateSimilarity(lastContent, firstContent);

                        if (similarity > 0.85) { // 85% de similitud
                            // Encontramos duplicación - eliminar desde el inicio hasta después de este segmento
                            overlapFound = true;
                            removeUpToIndex = k + 1;
                            console.log(`[Timestamp Processor] 🧹 Detected ${Math.round(similarity * 100)}% overlap at chunk ${i}`);
                            console.log(`[Timestamp Processor]   Prev: "${lastSegments[j].content.substring(0, 60)}..."`);
                            console.log(`[Timestamp Processor]   Curr: "${firstSegments[k].content.substring(0, 60)}..."`);
                            break;
                        }
                    }
                }
            }

            // Si encontramos overlap, eliminar segmentos duplicados
            if (overlapFound && removeUpToIndex > 0) {
                const remainingSegments = currSegments.slice(removeUpToIndex);
                chunkText = remainingSegments
                    .map(s => `[${s.timestamp}] ${s.content}`)
                    .join('\n');
                console.log(`[Timestamp Processor] ✂️  Removed ${removeUpToIndex} duplicate segments from chunk ${i}`);
            }
        }

        results.push(chunkText);
    }

    return results.join('\n\n');
}

/**
 * Calcular similitud entre dos textos (Levenshtein ratio simplificado)
 */
function calculateSimilarity(text1: string, text2: string): number {
    // Si son idénticos
    if (text1 === text2) return 1.0;

    // Si uno contiene al otro con alta fidelidad
    if (text1.includes(text2) || text2.includes(text1)) {
        const shorter = Math.min(text1.length, text2.length);
        const longer = Math.max(text1.length, text2.length);
        return shorter / longer;
    }

    // Comparación por palabras
    const words1 = text1.split(' ');
    const words2 = text2.split(' ');

    let matches = 0;
    const maxLength = Math.max(words1.length, words2.length);

    for (let i = 0; i < Math.min(words1.length, words2.length); i++) {
        if (words1[i] === words2[i]) {
            matches++;
        }
    }

    return matches / maxLength;
}

/**
 * Helper central para llamadas a Gemini con fallback automático de modelos.
 *
 * Lógica de reintentos:
 *  - 429 TPM/RPM (temporal): espera exponencial con jitter, reintenta el MISMO modelo (hasta 3 veces)
 *  - 429 RPD (cuota diaria agotada) o >3 reintentos: pasa al SIGUIENTE modelo de la cadena
 *  - Cualquier otro error HTTP: lanza inmediatamente
 */
async function geminiGenerateWithFallback(
    models: readonly string[],
    apiKey: string,
    buildBody: (model: string) => object,  // body builder — recibe el modelo activo y retorna el body completo
    label: string = 'Gemini',
    startModelIndex: number = 0
): Promise<{ data: any; modelUsed: string; modelIndex: number }> {
    const MAX_RETRIES_PER_MODEL = 3;

    for (let mi = startModelIndex; mi < models.length; mi++) {
        const model = models[mi];
        let attempt = 0;

        while (attempt < MAX_RETRIES_PER_MODEL) {
            const response = await fetch(
                `${GEMINI_API_URL}/models/${model}:generateContent?key=${apiKey}`,
                {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify(buildBody(model)),
                }
            );

            if (response.ok) {
                if (mi > startModelIndex) console.log(`[${label}] ✅ Success with fallback model: ${model}`);
                return { data: await response.json(), modelUsed: model, modelIndex: mi };
            }

            if (response.status === 429) {
                const err = await response.json().catch(() => ({}));
                const message = (err?.error?.message || '').toLowerCase();

                // RPD agotado → cambiar modelo ya
                const isRPD =
                    message.includes('per day') ||
                    message.includes('daily') ||
                    message.includes('quota exceeded for') ||
                    attempt >= MAX_RETRIES_PER_MODEL - 1;

                if (isRPD) {
                    const nextModel = models[mi + 1];
                    if (nextModel) {
                        console.warn(`[${label}] ⚠️  ${model} quota exhausted → switching to ${nextModel}`);
                    } else {
                        console.error(`[${label}] ❌ All models exhausted`);
                    }
                    break; // sale del while, pasa al siguiente modelo
                }

                // TPM/RPM → espera exponencial con jitter y reintenta mismo modelo
                const waitMs = Math.pow(2, attempt + 1) * 1000 + Math.random() * 1500;
                console.log(`[${label}] ⏳ Rate limited on ${model} (attempt ${attempt + 1}/${MAX_RETRIES_PER_MODEL}), waiting ${(waitMs / 1000).toFixed(1)}s...`);
                await new Promise(r => setTimeout(r, waitMs));
                attempt++;
                continue;
            }

            // Otro error HTTP → lanzar inmediatamente
            const err = await response.json().catch(() => ({}));
            throw new Error(err?.error?.message || `Error (${response.status})`);
        }
    }

    throw new Error('Todos los modelos de Gemini alcanzaron su límite de cuota. Intenta en unos minutos.');
}

/**
 * Subir archivo a Gemini Files API
 */
async function uploadToGemini(file: File, apiKey: string, onProgress?: (p: number) => void): Promise<string> {
    onProgress?.(0.1);

    // Normalizar MIME type para el upload también
    let mimeType = file.type || 'audio/mpeg';
    if (mimeType === 'audio/x-m4a') mimeType = 'audio/mp4';
    if (mimeType === 'audio/x-wav') mimeType = 'audio/wav';

    // Paso 1: Iniciar upload resumable
    const startRes = await fetch(`${GEMINI_UPLOAD_URL}/files?key=${apiKey}`, {
        method: 'POST',
        headers: {
            'X-Goog-Upload-Protocol': 'resumable',
            'X-Goog-Upload-Command': 'start',
            'X-Goog-Upload-Header-Content-Length': String(file.size),
            'X-Goog-Upload-Header-Content-Type': mimeType,
            'Content-Type': 'application/json',
        },
        body: JSON.stringify({
            file: { displayName: file.name },
        }),
    });

    if (!startRes.ok) {
        const err = await startRes.text();
        throw new Error(`Error al iniciar upload: ${err}`);
    }

    const uploadUrl = startRes.headers.get('X-Goog-Upload-URL');
    if (!uploadUrl) throw new Error('No se pudo obtener URL de upload');

    onProgress?.(0.2);

    // Paso 2: Subir bytes
    const uploadRes = await fetch(uploadUrl, {
        method: 'POST',
        headers: {
            'X-Goog-Upload-Offset': '0',
            'X-Goog-Upload-Command': 'upload, finalize',
            'Content-Length': String(file.size),
        },
        body: file,
    });

    if (!uploadRes.ok) {
        const err = await uploadRes.text();
        throw new Error(`Error al subir archivo: ${err}`);
    }

    const uploadData = await uploadRes.json();
    const fileUri = uploadData.file?.uri;
    const fileName = uploadData.file?.name;

    if (!fileUri) throw new Error('No se recibió URI del archivo');

    onProgress?.(0.4);

    // Paso 3: Esperar a que esté ACTIVE
    let attempts = 0;
    console.log(`[Gemini Upload] Waiting for file processing...`);

    while (attempts < 120) {
        const statusRes = await fetch(`${GEMINI_API_URL}/${fileName}?key=${apiKey}`);
        const statusData = await statusRes.json();

        if (statusData.state === 'ACTIVE') {
            console.log('[Gemini Upload] ✅ File ready');
            onProgress?.(0.5);
            return fileUri;
        }
        if (statusData.state === 'FAILED') {
            throw new Error(`Procesamiento falló: ${statusData.error?.message || 'Error desconocido'}`);
        }

        await new Promise(r => setTimeout(r, 2000));
        attempts++;

        if (attempts % 10 === 0) {
            console.log(`[Gemini Upload] Still waiting... (${attempts}/120)`);
        }

        onProgress?.(0.4 + (attempts / 120) * 0.1);
    }

    throw new Error('Timeout esperando procesamiento (4 minutos)');
}

/**
 * Interfaz para retornar transcripción con metadata de tokens
 */
interface TranscriptionResult {
    text: string;
    tokensUsed: number;
}

/**
 * 🎵 RUTA ESTÁNDAR: Transcribir audio sin chunking (<20 min)
 * Transcripción literal palabra por palabra
 */
export async function transcribeWithGemini(
    file: File,
    apiKey: string,
    onProgress?: (progress: number) => void,
    duration?: number,
    startModelIndex: number = 0
): Promise<TranscriptionResult & { modelIndex: number }> {
    if (!apiKey) throw new Error('Gemini API Key no configurada');

    // Validar duración
    let durationSeconds = duration || 0;

    if (durationSeconds === 0) {
        console.warn('[Gemini] ⚠️  Duration not provided - estimating');
        const estimatedMinutes = file.size / (1024 * 1024);
        durationSeconds = estimatedMinutes * 60;
    }

    const minutes = durationSeconds / 60;

    console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
    console.log('[Gemini Transcribe] 🎵 Starting standard transcription');
    console.log(`[Gemini Transcribe] File: ${file.name} (${(file.size / 1024 / 1024).toFixed(1)}MB)`);
    console.log(`[Gemini Transcribe] Duration: ${minutes.toFixed(1)} min | Max tokens: ${TRANSCRIPTION_MAX_OUTPUT_TOKENS}`);
    console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');

    const startTime = Date.now();

    // Upload
    const fileUri = await uploadToGemini(file, apiKey, (p) => onProgress?.(p * 0.5));
    onProgress?.(0.5);

    // Normalizar MIME type (Gemini puede rechazar audio/x-m4a)
    let mimeType = file.type || 'audio/mpeg';
    if (mimeType === 'audio/x-m4a') mimeType = 'audio/mp4';
    if (mimeType === 'audio/x-wav') mimeType = 'audio/wav';

    // Prompt de transcripción (simple - no intentar contextualizar)
    const transcriptionPrompt = `Transcribe this audio accurately in its original language.

TIMESTAMP RULES:
- Format: [MM:SS] or [HH:MM:SS]
- Place at start of new topics/sections only
- Never mid-sentence
- Maintain chronological order

Example:

[00:00] Introduction...
[05:30] Main concept...

Output: transcription with timestamps. No commentary.`;

    // Transcribir con fallback automático de modelos.
    // maxOutputTokens es fijo (8192) para todos los modelos — correcto para chunks de ≤20 min.
    const { data, modelUsed, modelIndex } = await geminiGenerateWithFallback(
        TRANSCRIPTION_FALLBACK_MODELS,
        apiKey,
        (_model) => ({
            contents: [{
                parts: [
                    { fileData: { mimeType: mimeType, fileUri } },
                    { text: transcriptionPrompt }
                ]
            }],
            generationConfig: {
                temperature: 0.1,
                maxOutputTokens: TRANSCRIPTION_MAX_OUTPUT_TOKENS,
            },
            safetySettings: [
                { category: 'HARM_CATEGORY_HARASSMENT', threshold: 'BLOCK_NONE' },
                { category: 'HARM_CATEGORY_HATE_SPEECH', threshold: 'BLOCK_NONE' },
                { category: 'HARM_CATEGORY_SEXUALLY_EXPLICIT', threshold: 'BLOCK_NONE' },
                { category: 'HARM_CATEGORY_DANGEROUS_CONTENT', threshold: 'BLOCK_NONE' },
            ],
        }),
        'Gemini Transcribe',
        startModelIndex
    );

    onProgress?.(0.85);
    const candidate = data.candidates?.[0];
    const text = candidate?.content?.parts?.[0]?.text;

    if (!text) {
        console.error('[Gemini Transcribe] Finish Reason:', candidate?.finishReason);
        throw new Error(`No se generó transcripción. Razón: ${candidate?.finishReason || 'Desconocida'}`);
    }

    // Limpiar espacios dentro de los timestamps: [ 00:13:19] -> [00:13:19]
    let cleanText = text.replace(/\[\s+(\d)/g, '[$1');

    // POST-PROCESSING: Limpiar artifacts si llegó a MAX_TOKENS
    if (candidate?.finishReason === 'MAX_TOKENS') {
        console.warn('[Gemini Transcribe] ⚠️  Hit MAX_TOKENS - Cleaning artifacts...');
        cleanText = cleanText.replace(/(\b\w{1,4}\b)(?:\s+\1){5,}$/gi, '');
        cleanText += '\n\n[⚠️ Transcripción cortada por límite de tokens]';
    }

    const finalText = cleanText;
    const tokensUsed = data.usageMetadata?.candidatesTokenCount || 0;
    const totalTime = ((Date.now() - startTime) / 1000).toFixed(1);

    // Logs finales
    console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
    console.log('[Gemini Transcribe] ✅ Complete');
    console.log(`[Gemini Transcribe] Model: ${modelUsed} | Time: ${totalTime}s | Finish: ${candidate?.finishReason}`);
    console.log(`[Gemini Transcribe] Tokens: ${tokensUsed}/${TRANSCRIPTION_MAX_OUTPUT_TOKENS} (${((tokensUsed / TRANSCRIPTION_MAX_OUTPUT_TOKENS) * 100).toFixed(0)}%)`);
    console.log(`[Gemini Transcribe] Output: ${finalText.length} chars, ${finalText.split(/\s+/).length} words`);
    console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');

    onProgress?.(1);
    return { text: finalText, tokensUsed, modelIndex };
}

/**
 * RUTA CHUNKING: Transcripción paralela para audios >= 20 min
 * Corta el audio en chunks de 20 min y los transcribe en paralelo
 */
const CHUNK_SIZE_MINUTES = 20;
const CHUNK_OVERLAP_SECONDS = 30;

export async function transcribeWithGeminiChunked(
    file: File | File[],
    apiKey: string,
    onProgress?: (progress: number) => void,
    duration?: number,
    chunkMetadata?: { startTime: number; endTime: number; index: number }[]
): Promise<TranscriptionResult> {
    if (!apiKey) throw new Error('Gemini API Key no configurada');

    // 1. Preparar Chunks
    console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
    console.log('[Gemini Chunked] 🧩 Starting PARALLEL CHUNKING');

    let chunks: { blob: Blob | File, start: number, end: number, index: number, fileName: string }[] = [];
    const isPreChunked = Array.isArray(file);

    if (isPreChunked && chunkMetadata) {
        // ✅ CASO A: Ya vienen los chunks (ej: desde FFmpeg en audio-processor.ts)
        console.log(`[Gemini Chunked] Using ${file.length} pre-existing temporal chunks`);
        chunks = file.map((f, i) => ({
            blob: f,
            start: chunkMetadata[i].startTime,
            end: chunkMetadata[i].endTime,
            index: i,
            fileName: f.name
        }));
    } else {
        // ❌ CASO B: Es un solo archivo (MP3/WAV) - Hacer chunking binario (safe)
        const singleFile = Array.isArray(file) ? file[0] : file;

        const durationSeconds = duration || await new Promise<number>((resolve) => {
            const audio = document.createElement('audio');
            audio.src = URL.createObjectURL(singleFile);
            audio.onloadedmetadata = () => resolve(audio.duration);
        });

        const durationMinutes = durationSeconds / 60;
        console.log(`[Gemini Chunked] Duration: ${durationMinutes.toFixed(1)} min`);
        console.log(`[Gemini Chunked] Chunk size: ${CHUNK_SIZE_MINUTES} min (Binary Splicing)`);

        const bytesPerSecond = singleFile.size / durationSeconds;
        const chunkSizeBytes = bytesPerSecond * (CHUNK_SIZE_MINUTES * 60);
        const overlapBytes = bytesPerSecond * CHUNK_OVERLAP_SECONDS;

        let offset = 0;
        let index = 0;

        while (offset < singleFile.size) {
            let end = Math.min(offset + chunkSizeBytes, singleFile.size);
            if (end < singleFile.size) {
                end = Math.min(end + overlapBytes, singleFile.size);
            }

            const blob = singleFile.slice(offset, end);
            chunks.push({
                blob: blob,
                start: offset / bytesPerSecond,
                end: end / bytesPerSecond,
                index,
                fileName: singleFile.name
            });

            console.log(`[Gemini Chunked] ✂️  Chunk ${index + 1}: ${(chunks[index].start / 60).toFixed(1)}-${(chunks[index].end / 60).toFixed(1)} min (${(blob.size / 1024 / 1024).toFixed(1)}MB)`);

            offset += chunkSizeBytes;
            index++;
        }
    }

    console.log(`[Gemini Chunked] Ready to transcribe ${chunks.length} chunks`);
    console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');

    // 2. Transcribir en Paralelo con índice de modelo compartido
    // Si un chunk descubre que el modelo primario está agotado (RPD),
    // actualiza sharedModelIndex para que los chunks siguientes
    // arranquen directamente desde el modelo que sí funciona.
    let completedChunks = 0;
    let sharedModelIndex = 0; // índice compartido de la cadena TRANSCRIPTION_FALLBACK_MODELS

    const updateProgress = () => {
        completedChunks++;
        const p = completedChunks / chunks.length;
        onProgress?.(p);
    };

    const startTime = Date.now();

    const chunkPromises = chunks.map(async (chunk) => {
        // Normalizar MIME type para el chunk - CRÍTICO para M4A
        const originalType = isPreChunked ? (file as File[])[0].type : (file as File).type;
        const originalName = isPreChunked ? (file as File[])[0].name : (file as File).name;

        let chunkType = chunk.blob.type || originalType;
        if (!chunkType || chunkType === 'audio/x-m4a' || chunkType === '') {
            chunkType = 'audio/mp4';
        }
        if (chunkType === 'audio/x-wav') chunkType = 'audio/wav';

        console.log(`[Gemini Chunked] Chunk ${chunk.index} type: ${chunkType} (Original: ${originalType})`);

        const chunkFile = new File([chunk.blob], `${originalName}_part${chunk.index}`, { type: chunkType });
        const chunkDuration = chunk.end - chunk.start;

        // Usar el índice de modelo compartido; si este chunk sube de modelo,
        // actualizar el shared para que los chunks que aún no empezaron
        // no repitan el ciclo de fallo.
        const startIdx = sharedModelIndex;
        const result = await transcribeWithGemini(chunkFile, apiKey, undefined, chunkDuration, startIdx);

        if (result.modelIndex > sharedModelIndex) {
            console.log(`[Gemini Chunked] 🔀 Updating shared model index: ${sharedModelIndex} → ${result.modelIndex}`);
            sharedModelIndex = result.modelIndex;
        }

        updateProgress();
        return {
            index: chunk.index,
            text: result.text,
            tokens: result.tokensUsed,
            offsetMinutes: Math.floor(chunk.start / 60)
        };
    });

    const results = await Promise.all(chunkPromises);

    // 3. Post-procesamiento: Ajustar timestamps y eliminar duplicación
    console.log('[Gemini Chunked] 🔧 Post-processing...');
    console.log('[Gemini Chunked]   • Adjusting timestamps');
    console.log('[Gemini Chunked]   • Detecting overlap');
    console.log('[Gemini Chunked]   • Removing duplication');

    results.sort((a, b) => a.index - b.index);

    // Ajustar timestamps de cada chunk
    const chunksWithAdjustedTimestamps = results.map(r => ({
        ...r,
        text: adjustTimestamps(r.text, r.offsetMinutes)
    }));

    // Detectar y eliminar duplicación entre chunks
    const cleanedText = detectAndRemoveOverlap(chunksWithAdjustedTimestamps);

    const totalTokens = results.reduce((sum, r) => sum + r.tokens, 0);

    const totalTime = ((Date.now() - startTime) / 1000).toFixed(1);

    console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
    console.log('[Gemini Chunked] ✅ Complete');
    console.log(`[Gemini Chunked] Time: ${totalTime}s | Chunks: ${chunks.length}`);
    console.log(`[Gemini Chunked] Total tokens: ${totalTokens}`);
    console.log(`[Gemini Chunked] Output: ${cleanedText.length} chars`);
    console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');

    onProgress?.(1);
    return { text: cleanedText, tokensUsed: totalTokens };
}

import type { SummaryLevel } from './store';

export async function organizeNotesWithGemini(
    transcription: string,
    apiKey: string,
    onStep?: (step: number) => void,
    summaryLevel: SummaryLevel = 'short',
    outputLanguage: string = 'auto'
): Promise<{ notes: string, tokensUsed: number }> {
    if (!apiKey) throw new Error('Gemini API Key missing');
    if (!transcription) throw new Error('Missing transcription to organize');

    onStep?.(1);

    console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
    console.log('[Gemini Organize] 📚 Starting organization');
    console.log(`[Gemini Organize] Input: ${transcription.length} chars | Level: ${summaryLevel}`);
    console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');


    const langInstructions = outputLanguage === 'auto'
        ? 'in the same language as the audio'
        : `entirely in ${getLanguageNameEn(outputLanguage)}`;

    const translationRule = outputLanguage === 'auto'
        ? '- Use the same language as the original audio throughout the entire response.'
        : `- MANDATORY: Write the ENTIRE response in ${getLanguageNameEn(outputLanguage).toUpperCase()} only. This includes the title, all section headings, summaries, key concepts, definitions, content paragraphs under every ### timestamp heading, and review questions. Do NOT mix languages or leave any part in the original language.`;

    // Bloque MANDATORY OUTPUT FORMAT — language-aware
    const mandatoryFormatBlock = outputLanguage === 'auto'
        ? `MANDATORY OUTPUT FORMAT:
Your response MUST begin IMMEDIATELY with # followed by the title in the audio's language.
Do NOT include introductory phrases.
The first line of your response MUST be the title in Markdown format.`
        : `MANDATORY OUTPUT FORMAT:
Your response MUST begin IMMEDIATELY with # followed by the title IN ${getLanguageNameEn(outputLanguage).toUpperCase()}.
Do NOT include introductory phrases.
The first line MUST be: # [descriptive title written in ${getLanguageNameEn(outputLanguage)}]`;

    // Bloque LANGUAGE RULE dedicado — se inserta justo antes del OUTPUT STRUCTURE
    // para que el modelo lo tenga fresco cuando empieza a generar el primer token (#título)
    const langRuleBlock = outputLanguage === 'auto'
        ? `LANGUAGE RULE:
- Your FIRST token MUST be the # title line. Do NOT skip it.
- Write the entire output in the same language as the audio. Do not translate anything.
- The section headings shown in OUTPUT STRUCTURE (Summary, Key Concepts, Content, Definitions, Review Questions, etc.) are TEMPLATES written in English for reference only. Translate ALL of them into the audio's language.`
        : `LANGUAGE RULE:
The target output language is: ${getLanguageNameEn(outputLanguage).toUpperCase()}
- Your FIRST token is the # title. That title MUST be in ${getLanguageNameEn(outputLanguage)}.
- ALL text in the response MUST be in ${getLanguageNameEn(outputLanguage)}: title, ALL ## and ### section headings, ALL bullet points, ALL paragraphs, ALL definitions, ALL review questions.
- The section headings shown in OUTPUT STRUCTURE (Summary, Key Concepts, Content, Definitions, etc.) are TEMPLATES written in English for reference only. Translate ALL of them into ${getLanguageNameEn(outputLanguage)}.
- Zero exceptions. Not a single heading or sentence should remain in any other language.`;

    // Placeholder del título con idioma explícito incrustado
    const titlePlaceholder = outputLanguage === 'auto'
        ? '# [Professional Descriptive Title of the Topic]'
        : `# [Professional Descriptive Title — WRITTEN IN ${getLanguageNameEn(outputLanguage).toUpperCase()}]`;

    // Recordatorio al pie — refuerza el idioma del título justo después de la transcripción
    const footerTitleReminder = outputLanguage === 'auto'
        ? 'Your response MUST begin IMMEDIATELY with # followed by the title in the audio\'s language.'
        : `Your response MUST begin IMMEDIATELY with # followed by the title IN ${getLanguageNameEn(outputLanguage).toUpperCase()}.`;

    // SHORT prompt
    const shortPrompt = `You are an expert assistant specialized in creating concise academic notes ${langInstructions}

${mandatoryFormatBlock}

CRITICAL OBJECTIVE:
Produce a compact but complete reference document. Every word must earn its place.

FORMATTING RULES:
1. NO emojis
2. Clean and professional Markdown
3. Correct oral transcription errors
4. Use **bold** for important technical terms
5. If code is mentioned, use code blocks

${langRuleBlock}

OUTPUT STRUCTURE:

${titlePlaceholder}

## 1. Summary

[3-5 bullet points capturing the most critical ideas. Each bullet: 1-2 lines maximum, direct and informative. No padding.]

## 2. Key Concepts

[5-8 concepts that are essential to understand the content]
- **Concept 1**: One precise explanatory line
- **Concept 2**: One precise explanatory line
- ...

## 3. Content

[Organize the audio into logical sections. For each section:]

### [MM:SS] [Descriptive Section Title]

[2-3 focused paragraphs covering:
- The main idea of this section
- Key points and arguments made
- Any specific examples or data mentioned]

[Repeat this pattern for every distinct topic in the audio]

## 4. Definitions

[Include only the terms that are explicitly defined or would be unclear without definition]

> **Term 1**: Clear, context-based definition.

> **Term 2**: Clear, context-based definition.

---

TRANSCRIPTION:
${transcription}

IMPORTANT: Be concise but complete. Do not omit key ideas — compress them efficiently.
${footerTitleReminder}
${translationRule}`;

    // MEDIUM prompt
    const mediumPrompt = `You are an expert assistant specialized in creating detailed academic notes ${langInstructions}

${mandatoryFormatBlock}

CRITICAL OBJECTIVE:
Transform the transcript into a well-structured academic document that captures all important ideas with sufficient detail to understand them without listening to the audio.

FORMATTING RULES:
1. NO emojis
2. Clean and professional Markdown
3. Correct oral transcription errors
4. Use **bold** for important technical terms
5. If code is mentioned, use code blocks

${langRuleBlock}

OUTPUT STRUCTURE:

${titlePlaceholder}

## 1. Summary

[3-5 paragraphs synthesizing the full content. Each paragraph must be 3-4 lines. Cover the main argument, key findings, and conclusions.]

## 2. Key Concepts
- **Concept 1**: 2-line explanation covering what it is and why it matters
- **Concept 2**: 2-line explanation covering what it is and why it matters
- ...

## 3. Content Development

[THIS IS THE CORE SECTION — develop each topic thoroughly]

### [MM:SS] [Descriptive Section Title]

[2-4 paragraphs per section that develop:
- The context and why this point is being made
- The detailed explanation of the idea
- Any examples, data, or evidence mentioned
- Connections to other concepts in the audio]

[Repeat this pattern for ALL distinct topics in the audio]

## 4. Definitions and Terminology

[Include all terms that are defined or require clarification]

> **Term 1**: Complete definition based on how it is used in context.

> **Term 2**: Complete definition based on how it is used in context.

## 5. Review Questions

[Generate 5-10 questions that test understanding of the material]

1. **Q:** [Conceptual question about a key idea]
   **A:** [2-3 line answer that explains the concept clearly]

2. **Q:** [Question about a specific example or application]
   **A:** [Answer referencing the content from the audio]

[Continue until the main concepts are covered]

---

TRANSCRIPTION:
${transcription}

IMPORTANT: Develop ideas with enough depth that the document stands alone without the audio. Do not list-ify everything — use real paragraphs.
${footerTitleReminder}
${translationRule}`;

    // LONG prompt
    const longPrompt = `You are an expert assistant specialized in creating EXHAUSTIVE and professional academic notes ${langInstructions}

${mandatoryFormatBlock}

CRITICAL OBJECTIVE:
Transform the transcript into an academic document SO COMPLETE that it eliminates the need to listen to the audio again.

DEPTH RULES:
- DO NOT use the word exhaustive or any similar word in the content.
- USE ALL AVAILABLE TOKENS
- DO NOT over-summarize — DEVELOP each concept COMPLETELY
- If the transcript is long, the notes MUST be proportionally long
- Each section must have MULTIPLE dense paragraphs
- Include ALL relevant content, not only the most important parts

FORMATTING RULES:
1. NO emojis
2. Clean and professional Markdown
3. Correct oral transcription errors
4. If code is mentioned, use code blocks
5. Use **bold** for important technical terms

${langRuleBlock}

OUTPUT STRUCTURE:

${titlePlaceholder}

## 1. Summary

[3-6 DENSE paragraphs synthesizing the complete essence of the content. Do not skimp on details. Each paragraph must be a minimum of 4-6 lines.]

## 2. Key Concepts

[List of 8-15 main concepts, with one explanatory line for each]
- **Concept 1**: Brief explanation
- **Concept 2**: Brief explanation
- ...

## 3. Content Development

[THIS IS THE MOST IMPORTANT SECTION — Must be VERY extensive]

### [Descriptive Subtitle of First Section]

[Multiple paragraphs (4-8) COMPLETELY developing this section:
- Context and introduction
- Detailed theoretical explanation
- Examples mentioned
- Implications and applications
- Connections with other concepts]

### [Next Subtitle]

[Continue with the same level of depth...]

[Repeat this pattern for ALL main sections of the audio]

## 4. Definitions and Terminology

> **Term 1**: Complete and accurate definition based on context.

> **Term 2**: Detailed technical definition.

[Include ALL definitions mentioned]

## 5. Examples, Case Studies and Applications

[Develop ALL mentioned examples with full detail. Do not summarize them — explain them completely.]

## 6. Connections and Synthesis

[Explain how the concepts relate to each other. This section must have 3-5 paragraphs.]

## 7. Review Questions

[Generate 10-20 questions depending on content length]

1. **Q: [Deep conceptual question]**
   **A:** [Complete 3-5 line answer]

2. **Q: [Practical application question]**
   **A:** [Answer with detailed example]

[Continue until all important concepts are covered]

---

TRANSCRIPTION:
${transcription}

IMPORTANT: Generate EXTENSIVE notes. USE ALL AVAILABLE TOKENS. More detail = better document.
${footerTitleReminder}
DO NOT use the word exhaustive or any similar word in the content.
${translationRule}`;

    let prompt: string;
    switch (summaryLevel) {
        case 'short': prompt = shortPrompt; break;
        case 'medium': prompt = mediumPrompt; break;
        default: prompt = longPrompt; break;
    }

    onStep?.(2);

    const startTime = Date.now();

    const { data, modelUsed } = await geminiGenerateWithFallback(
        ORGANIZATION_FALLBACK_MODELS,
        apiKey,
        (model) => ({
            contents: [{ parts: [{ text: prompt }] }],
            generationConfig: {
                temperature: 0.2,
                // Usa el máximo real del modelo activo; conservador por defecto si no está en el mapa
                maxOutputTokens: ORGANIZATION_MAX_OUTPUT_TOKENS[model] ?? 8192,
            },
            safetySettings: [
                { category: 'HARM_CATEGORY_HARASSMENT', threshold: 'BLOCK_NONE' },
                { category: 'HARM_CATEGORY_HATE_SPEECH', threshold: 'BLOCK_NONE' },
                { category: 'HARM_CATEGORY_SEXUALLY_EXPLICIT', threshold: 'BLOCK_NONE' },
                { category: 'HARM_CATEGORY_DANGEROUS_CONTENT', threshold: 'BLOCK_NONE' },
            ],
        }),
        'Gemini Organize'
    );

    onStep?.(3);
    const candidate = data.candidates?.[0];
    const content = candidate?.content?.parts?.[0]?.text;

    const totalTime = ((Date.now() - startTime) / 1000).toFixed(1);
    const tokensUsed = data.usageMetadata?.candidatesTokenCount || 0;
    const modelMaxTokens = ORGANIZATION_MAX_OUTPUT_TOKENS[modelUsed] ?? 8192;
    const efficiency = tokensUsed > 0 ? ((tokensUsed / modelMaxTokens) * 100).toFixed(0) : 'N/A';

    console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
    console.log('[Gemini Organize] ✅ Complete');
    console.log(`[Gemini Organize] Model: ${modelUsed} | Time: ${totalTime}s | Finish: ${candidate?.finishReason}`);
    console.log(`[Gemini Organize] Tokens: ${tokensUsed}/${modelMaxTokens} (${efficiency}%)`);
    console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');

    if (!content) {
        console.error('[Gemini] Finish Reason:', candidate?.finishReason);
        throw new Error(`No se generaron apuntes. Razón: ${candidate?.finishReason || 'Desconocida'}`);
    }

    onStep?.(4);
    onStep?.(5);
    return { notes: content, tokensUsed };
}

/**
 * Validar Gemini API Key
 */
export async function validateGeminiKey(apiKey: string): Promise<boolean> {
    try {
        const response = await fetch(`${GEMINI_API_URL}/models?key=${apiKey}&pageSize=1`);
        return response.ok;
    } catch (e) {
        console.error('Gemini validation error:', e);
        return false;
    }
}