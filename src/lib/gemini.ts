const GEMINI_API_URL = 'https://generativelanguage.googleapis.com/v1beta';
const GEMINI_UPLOAD_URL = 'https://generativelanguage.googleapis.com/upload/v1beta';

import { getLanguageNameEn } from './languages';

// Constantes de Modelos
export const GEMINI_FLASH_MODEL = 'gemini-2.0-flash';
export const GEMINI_FLASH_LONG_CONTEXT = 'gemini-2.5-flash';
export const GEMINI_PRO_MODEL = 'gemini-2.5-pro';

/**
 * LÍMITES CRÍTICOS DE DURACIÓN
 * Estas constantes definen las estrategias por duración de audio
 */
const DURATION_THRESHOLD_SHORT = 30;  // 30 minutos - usa Flash 2.0 (rápido)
export const DURATION_THRESHOLD_LONG = 120;  // 2 horas - límite para transcripción completa
export const DURATION_THRESHOLD_CHUNKING = 20;  // 20 minutos - umbral para chunking paralelo

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
 * Constantes de Modelos
/**
 * Configuración de tokens por duración de audio
 * OPTIMIZADO para evitar MAX_TOKENS y desperdiciar recursos
 * 
 * Flash 2.0: Max 8K tokens
 * Flash 2.5: Max 64K tokens
 */
function getTranscriptionTokens(durationSeconds: number): number {
    const minutes = durationSeconds / 60;

    // Flash 2.0: Máxima velocidad (≤30 min)
    if (minutes <= 35) {
        return 8192;
    }

    // Flash 2.5: Escalado progresivo hasta 64K
    if (minutes <= 60) {
        return 32768;
    }

    if (minutes <= 80) {
        return 49152;
    }

    // Máximo para audios muy largos (hasta 2h)
    return 65536;
}

/**
 * Configuración de tokens para organización
 * MEJORADO: Usa más tokens para contenido extenso
 */
function getOrganizationTokens(transcriptionLength: number): number {
    // Estimación más realista: ~100 chars/min de transcripción densa
    const estimatedMinutes = transcriptionLength / 100;

    if (estimatedMinutes < 20) {
        return 8192;
    }
    if (estimatedMinutes < 40) {
        return 16384;
    }
    if (estimatedMinutes < 80) {
        return 32768;
    }

    return 65536;
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
    duration?: number
): Promise<TranscriptionResult> {
    if (!apiKey) throw new Error('Gemini API Key no configurada');

    // Validar duración
    let durationSeconds = duration || 0;

    if (durationSeconds === 0) {
        console.warn('[Gemini] ⚠️  Duration not provided - estimating');
        const estimatedMinutes = file.size / (1024 * 1024);
        durationSeconds = estimatedMinutes * 60;
    }

    const minutes = durationSeconds / 60;

    // Selección de modelo
    let model = GEMINI_FLASH_MODEL;
    if (minutes > DURATION_THRESHOLD_SHORT) {
        model = GEMINI_FLASH_LONG_CONTEXT;
    }

    const maxOutputTokens = getTranscriptionTokens(durationSeconds);

    console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
    console.log('[Gemini Transcribe] 🎵 Starting standard transcription');
    console.log(`[Gemini Transcribe] File: ${file.name} (${(file.size / 1024 / 1024).toFixed(1)}MB)`);
    console.log(`[Gemini Transcribe] Duration: ${minutes.toFixed(1)} min | Model: ${model}`);
    console.log(`[Gemini Transcribe] Max tokens: ${maxOutputTokens}`);
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

    // Transcribir
    const response = await fetch(
        `${GEMINI_API_URL}/models/${model}:generateContent?key=${apiKey}`,
        {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                contents: [{
                    parts: [
                        { fileData: { mimeType: mimeType, fileUri } },
                        { text: transcriptionPrompt }
                    ]
                }],
                generationConfig: {
                    temperature: 0.1,
                    maxOutputTokens: maxOutputTokens,
                },
                safetySettings: [
                    { category: 'HARM_CATEGORY_HARASSMENT', threshold: 'BLOCK_NONE' },
                    { category: 'HARM_CATEGORY_HATE_SPEECH', threshold: 'BLOCK_NONE' },
                    { category: 'HARM_CATEGORY_SEXUALLY_EXPLICIT', threshold: 'BLOCK_NONE' },
                    { category: 'HARM_CATEGORY_DANGEROUS_CONTENT', threshold: 'BLOCK_NONE' },
                ],
            }),
        }
    );

    onProgress?.(0.85);

    if (!response.ok) {
        const err = await response.json().catch(() => ({}));
        throw new Error(err?.error?.message || `Error de Gemini (${response.status})`);
    }

    const data = await response.json();
    const candidate = data.candidates?.[0];
    const text = candidate?.content?.parts?.[0]?.text;

    if (!text) {
        console.error('[Gemini] Finish Reason:', candidate?.finishReason);
        throw new Error(`No se generó transcripción. Razón: ${candidate?.finishReason || 'Desconocida'}`);
    }

    // Limpiar espacios dentro de los timestamps: [ 00:13:19] -> [00:13:19]
    let cleanText = text.replace(/\[\s+(\d)/g, '[$1');

    // POST-PROCESSING: Limpiar artifacts si llegó a MAX_TOKENS
    if (candidate?.finishReason === 'MAX_TOKENS') {
        console.warn('[Gemini] ⚠️  Hit MAX_TOKENS - Cleaning artifacts...');
        cleanText = cleanText.replace(/(\b\w{1,4}\b)(?:\s+\1){5,}$/gi, '');
        cleanText += '\n\n[⚠️ Transcripción cortada por límite de tokens]';
    }

    const finalText = cleanText;
    const tokensUsed = data.usageMetadata?.candidatesTokenCount || 0;
    const totalTime = ((Date.now() - startTime) / 1000).toFixed(1);

    // Logs finales
    console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
    console.log('[Gemini Transcribe] ✅ Complete');
    console.log(`[Gemini Transcribe] Time: ${totalTime}s | Finish: ${candidate?.finishReason}`);
    console.log(`[Gemini Transcribe] Tokens: ${tokensUsed}/${maxOutputTokens} (${((tokensUsed / maxOutputTokens) * 100).toFixed(0)}%)`);
    console.log(`[Gemini Transcribe] Output: ${finalText.length} chars, ${finalText.split(/\s+/).length} words`);
    console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');

    onProgress?.(1);
    return { text: finalText, tokensUsed };
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

    // 2. Transcribir en Paralelo
    let completedChunks = 0;
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

        // Transcribir (Gemini siempre empieza en 00:00, ajustaremos después)
        const result = await transcribeWithGemini(chunkFile, apiKey, undefined, chunkDuration);

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

/**
 * Organizar transcripción en apuntes (PROMPT MEJORADO)
 * Usa 2.5 Pro para máxima calidad
 */
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

    // Adjust tokens based on summary level
    const levelTokenMultiplier = summaryLevel === 'short' ? 0.3 : summaryLevel === 'medium' ? 0.6 : 1;
    const baseTokens = getOrganizationTokens(transcription.length);
    const maxOutputTokens = Math.max(4096, Math.round(baseTokens * levelTokenMultiplier));

    console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
    console.log('[Gemini Organize] 📚 Starting organization');
    console.log(`[Gemini Organize] Input: ${transcription.length} chars`);
    console.log(`[Gemini Organize] Max tokens: ${maxOutputTokens}`);
    console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');

    const langInstructions = outputLanguage === 'auto'
        ? 'Write ALL notes strictly in the EXACT SAME LANGUAGE as the original audio. Do NOT translate anything.'
        : `TRANSLATE the Title, Summary, Key Concepts, and Definitions strictly into ${getLanguageNameEn(outputLanguage)}.`;

    const translationRule = outputLanguage === 'auto'
        ? '- Keep everything in the original spoken language of the audio.'
        : `- CRITICAL: Translate ONLY the Title, Summary, Concepts, and Definitions into ${getLanguageNameEn(outputLanguage).toUpperCase()}. The content blocks under ### [MM:SS] MUST REMAIN IN THE ORIGINAL SPOKEN LANGUAGE and must NOT be translated.`;

    // SHORT prompt
    const shortPrompt = `You are an expert assistant specialized in creating structured academic notes. Organize the transcript into concise notes ${langInstructions}

Your response MUST begin IMMEDIATELY with # followed by the title.

STRUCTURE:

# [Descriptive Title]

## Summary
- [3-5 key points, max 2 lines each]

## Key Concepts
**Term 1**: Brief explanation
**Term 2**: Brief explanation

## Definitions
> **[Concept]**: [Definition from audio]

## Content
### [MM:SS] [Section Title]
[Translated and organized main points of this section]

INSTRUCTIONS:
- NO emojis
- Clean Markdown
- Highlight terms in **bold**
- Timestamps [MM:SS]
- Fix grammatical errors
- Remove filler words
${translationRule}

---

TRANSCRIPTION:
${transcription}

Your response MUST begin IMMEDIATELY with # followed by the title.`;

    // MEDIUM prompt
    const mediumPrompt = `You are an expert assistant specialized in creating detailed academic notes. Organize the transcript into a comprehensive document ${langInstructions}

Your response MUST begin IMMEDIATELY with # followed by the title.

STRUCTURE:

# [Descriptive Title of the Topic]

## Summary
[3-5 paragraphs summarizing the content. Each paragraph 3-4 lines.]

## Key Concepts
- **Concept**: 2-3 line explanation
(8-12 concepts)

## Definitions
> **[Term]**: [Complete definition]

## Content Development
### [MM:SS] [Section Title]
[2-4 paragraphs of translated and organized content per section with examples and details]

## Review Questions
1. **Q:** [Question]
   **A:** [2-3 line answer]
(5-10 questions)

INSTRUCTIONS:
- NO emojis
- Clean and professional Markdown
- Highlight terms in **bold**
- Timestamps [MM:SS]
- Fix grammatical errors
- Remove filler words
${translationRule}

---

TRANSCRIPTION:
${transcription}

Your response MUST begin IMMEDIATELY with # followed by the title.`;

    // LONG prompt (current exhaustive - unchanged format, translated to English)
    const longPrompt = `You are an expert assistant specialized in creating EXHAUSTIVE and professional academic notes ${langInstructions}

MANDATORY OUTPUT FORMAT:
Your response MUST begin IMMEDIATELY with # followed by the title.
Do NOT include introductory phrases.
The first line of your response MUST be the title in Markdown format.

CRITICAL OBJECTIVE:
Transform the transcript into an academic document SO COMPLETE that it eliminates the need to listen to the audio again.

EXHAUSTIVENESS RULE:
- DO NOT mention the word exhaustive or any similar word in the content.
- USE ALL AVAILABLE TOKENS
- DO NOT summarize too much - DEVELOP each concept COMPLETELY
- If the transcript is long, the notes MUST be proportionally long
- Each section must have MULTIPLE dense paragraphs
- Include ALL relevant content, not just the most important

FORMATTING RULES:
1. NO emojis
2. Use clean and professional Markdown
3. Correct oral transcription errors
4. If code is mentioned, use code blocks
5. Use **bold** for important technical terms

OUTPUT STRUCTURE:

# [Professional Descriptive Title of the Topic]

## 1. Summary

[3-6 DENSE paragraphs synthesizing the complete essence of the content. Do not skimp on details. Each paragraph must have a minimum of 4-6 lines.]

## 2. Key Concepts

[List of 8-15 main concepts, with an explanatory line for each]
- **Concept 1**: Brief explanation
- **Concept 2**: Brief explanation
- ...

## 3. Content Development

[THIS IS THE MOST IMPORTANT SECTION - Must be VERY extensive]

### Descriptive Subtitle of First Section

[Multiple paragraphs (4-8) COMPLETELY developing this section:
- Context and introduction
- Detailed theoretical explanation
- Examples mentioned
- Implications and applications
- Connections with other concepts]

### Next Subtitle

[Continue with the same level of exhaustive detail...]

[Repeat this pattern for ALL main sections of the audio]

## 4. Definitions and Terminology

> **Term 1**: Complete and accurate definition based on context.

> **Term 2**: Detailed technical definition.

[Include ALL definitions mentioned]

## 5. Examples, Case Studies and Applications

[Develop ALL mentioned examples with complete detail. Do not summarize them, explain them completely.]

## 6. Connections and Synthesis

[Explain how concepts relate to each other. This section should have 3-5 paragraphs.]

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

IMPORTANT: Generate EXTENSIVE and EXHAUSTIVE notes. USE ALL AVAILABLE TOKENS. More details = better document.
Your response MUST begin IMMEDIATELY with # followed by the title.
DO NOT mention the word exhaustive or any similar word in the content.
${translationRule}`;

    let prompt: string;
    switch (summaryLevel) {
        case 'short': prompt = shortPrompt; break;
        case 'medium': prompt = mediumPrompt; break;
        default: prompt = longPrompt; break;
    }

    onStep?.(2);

    const startTime = Date.now();

    const response = await fetch(
        `${GEMINI_API_URL}/models/gemini-2.5-pro:generateContent?key=${apiKey}`,
        {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                contents: [{ parts: [{ text: prompt }] }],
                generationConfig: {
                    temperature: 0.2,
                    maxOutputTokens: maxOutputTokens,
                },
                safetySettings: [
                    { category: 'HARM_CATEGORY_HARASSMENT', threshold: 'BLOCK_NONE' },
                    { category: 'HARM_CATEGORY_HATE_SPEECH', threshold: 'BLOCK_NONE' },
                    { category: 'HARM_CATEGORY_SEXUALLY_EXPLICIT', threshold: 'BLOCK_NONE' },
                    { category: 'HARM_CATEGORY_DANGEROUS_CONTENT', threshold: 'BLOCK_NONE' },
                ],
            }),
        }
    );

    onStep?.(3);

    if (!response.ok) {
        const err = await response.json().catch(() => ({}));

        if (response.status === 429) {
            console.log('[Gemini Organize] Rate limit, retrying in 5s...');
            await new Promise(r => setTimeout(r, 5000));
            return organizeNotesWithGemini(transcription, apiKey, onStep);
        }

        throw new Error(err?.error?.message || `Error (${response.status})`);
    }

    const data = await response.json();
    const candidate = data.candidates?.[0];
    const content = candidate?.content?.parts?.[0]?.text;

    const totalTime = ((Date.now() - startTime) / 1000).toFixed(1);
    const tokensUsed = data.usageMetadata?.candidatesTokenCount || 0;
    const efficiency = tokensUsed > 0 ? ((tokensUsed / maxOutputTokens) * 100).toFixed(0) : 'N/A';

    console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
    console.log('[Gemini Organize] ✅ Complete');
    console.log(`[Gemini Organize] Time: ${totalTime}s | Finish: ${candidate?.finishReason}`);
    console.log(`[Gemini Organize] Tokens: ${tokensUsed}/${maxOutputTokens} (${efficiency}%)`);
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