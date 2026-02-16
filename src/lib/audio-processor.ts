import { Mp3Encoder } from '@breezystack/lamejs';
import { chunkFileTemporally, needsTemporalChunking, isFFmpegSupported } from './ffmpeg-chunker';


// Configuración por proveedor
const GROQ_SAMPLE_RATE = 16000;   // 16kHz - Óptimo para Whisper
const GROQ_BITRATE = 64;          // 64kbps - Suficiente para voz
const GROQ_MAX_SIZE = 25 * 1024 * 1024;    // 25MB - Límite Whisper API
const GROQ_CHUNK_SIZE = 20 * 1024 * 1024;  // 20MB por chunk

const GEMINI_SAMPLE_RATE = 44100; // 44.1kHz - Alta calidad
const GEMINI_BITRATE = 128;       // 128kbps - Alta calidad

// Umbral para activar chunking (minutos)
const CHUNKING_THRESHOLD_MINUTES = 20;

export interface CompressionResult {
    file: File;
    originalSize: number;
    compressedSize: number;
    ratio: number;
    duration: number; // Duración del audio resultante en segundos
}

export interface ProcessedAudio {
    chunks: File[];
    originalSize: number;
    compressedSize: number;
    wasCompressed: boolean;
    wasChunked: boolean;
    duration?: number; // Duración en segundos
    chunkingMethod?: 'temporal-ffmpeg' | 'binary' | 'none'; // Método de chunking usado
    chunkMetadata?: { startTime: number; endTime: number; index: number }[]; // Info de tiempos por chunk
}

/**
 * Obtener duración de un archivo multimedia (audio/video)
 */
export async function getMediaDuration(file: File): Promise<number> {
    return new Promise(async (resolve) => {
        const url = URL.createObjectURL(file);
        const media = file.type.startsWith('video/')
            ? document.createElement('video')
            : document.createElement('audio');

        media.onloadedmetadata = async () => {
            let duration = media.duration;
            URL.revokeObjectURL(url);

            // WebM recordings often report Infinity. If it's small, we decode it to get the real duration.
            if (!Number.isFinite(duration) && file.size < 10 * 1024 * 1024) {
                try {
                    const ctx = new (window.AudioContext || (window as any).webkitAudioContext)();
                    const buffer = await ctx.decodeAudioData(await file.arrayBuffer());
                    duration = buffer.duration;
                    await ctx.close();
                } catch (e) {
                    console.warn('[AudioProcessor] Could not decode for duration fallback');
                }
            }
            resolve(duration);
        };

        media.onerror = () => {
            URL.revokeObjectURL(url);
            console.warn('[AudioProcessor] ⚠️  Could not read media duration');
            resolve(0);
        };

        media.src = url;
    });
}

/**
 * Detectar si un archivo ya está comprimido (evitar doble compresión)
 */
function isAlreadyCompressed(file: File): boolean {
    const compressedFormats = [
        'audio/mpeg', 'audio/mp3', 'audio/mp4', 'audio/m4a',
        'audio/aac', 'audio/ogg', 'audio/webm'
    ];
    if (compressedFormats.includes(file.type)) return true;

    const compressedExtensions = ['.mp3', '.m4a', '.aac', '.ogg', '.webm'];
    return compressedExtensions.some(ext => file.name.toLowerCase().endsWith(ext));
}

/**
 * Procesar audio para subir - Estrategia adaptativa por proveedor
 */
export async function processAudioForUpload(
    file: File,
    onProgress?: (stage: string, progress: number) => void,
    options: {
        provider?: 'groq' | 'gemini';
        compressionThreshold?: number;
        chunkingThreshold?: number;
        forceCompression?: boolean;
    } = {}
): Promise<ProcessedAudio> {
    const originalSize = file.size;
    const provider = options.provider || 'groq';
    const duration = await getMediaDuration(file);

    console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
    console.log(`[AudioProcessor] Processing for ${provider.toUpperCase()}`);
    console.log('[AudioProcessor] File:', file.name);
    console.log('[AudioProcessor] Size:', (originalSize / 1024 / 1024).toFixed(2), 'MB');
    console.log('[AudioProcessor] Type:', file.type || 'unknown');
    if (duration > 0) {
        console.log('[AudioProcessor] Duration:', (duration / 60).toFixed(1), 'minutes');
    } else {
        console.log('[AudioProcessor] ⚠️  Duration: Could not detect (will estimate)');
    }
    console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');

    if (provider === 'gemini') {
        return processForGemini(file, duration, onProgress);
    } else {
        return processForGroq(file, duration, onProgress, options);
    }
}

/**
 * Procesar para GEMINI
 * NUEVA ESTRATEGIA CON FFMPEG:
 * - Audio corto (<20 min): Paso directo
 * - Audio largo (>=20 min):
 *   - Si es formato contenedor (M4A, WEBM, etc.): Chunking temporal con FFmpeg
 *   - Si es MP3/WAV: Paso directo (chunking binario se hace en gemini.ts)
 * - Video: Extraer audio @ 44.1kHz 128kbps
 */
async function processForGemini(
    file: File,
    duration: number,
    onProgress?: (stage: string, progress: number) => void
): Promise<ProcessedAudio> {
    const isVideo = file.type.startsWith('video/');
    const minutes = duration / 60;

    // AUDIO: Analizar estrategia
    if (!isVideo) {
        // ✅ CASO 1: Audio corto (<20 min) o archivo pequeño (<20MB)
        const isSmallFile = file.size < 20 * 1024 * 1024;
        const isShortDuration = Number.isFinite(minutes) && minutes < CHUNKING_THRESHOLD_MINUTES;
        const isLikelyShort = isSmallFile || isShortDuration;

        if (isLikelyShort) {
            console.log(isSmallFile
                ? `[AudioProcessor] ✅ Small file (${(file.size / 1024 / 1024).toFixed(2)}MB): Direct Pass`
                : '[AudioProcessor] ✅ Normal file < 20min: Direct Pass');
            console.log('[AudioProcessor] Strategy: Upload as-is to Gemini');
            console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
            return {
                chunks: [file],
                originalSize: file.size,
                compressedSize: file.size,
                wasCompressed: false,
                wasChunked: false,
                chunkingMethod: 'none',
                duration,
            };
        }

        // ✅ CASO 2: Audio largo (>=20 min) con formato contenedor
        if (needsTemporalChunking(file.name, file.type)) {
            // Verificar soporte de FFmpeg
            if (!isFFmpegSupported()) {
                console.warn('[AudioProcessor] ⚠️ FFmpeg not supported, falling back to MP3 conversion');
                return await fallbackToMP3Conversion(file, duration, onProgress);
            }

            console.log('[AudioProcessor] 🎯 Long container format detected (>=20min)');
            console.log('[AudioProcessor] 🔧 Using FFmpeg temporal chunking (NO re-encoding)');
            console.log('[AudioProcessor] Target: Preserve original format with valid chunks');

            try {
                onProgress?.('chunking', 0);

                const result = await chunkFileTemporally(
                    file,
                    duration, // Pasar duración desde Web Audio API
                    CHUNKING_THRESHOLD_MINUTES,
                    30, // 30s overlap
                    (stage, p) => onProgress?.('chunking', p)
                );

                console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
                console.log('[AudioProcessor] ✅ FFmpeg Temporal Chunking Complete');
                console.log(`[AudioProcessor] Created ${result.chunks.length} chunks`);
                console.log(`[AudioProcessor] Format: ${result.format} (preserved)`);
                console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');

                return {
                    chunks: result.chunks.map(c => c.file),
                    originalSize: file.size,
                    compressedSize: result.chunks.reduce((sum, c) => sum + c.file.size, 0),
                    wasCompressed: false, // No recodificamos
                    wasChunked: true,
                    chunkingMethod: 'temporal-ffmpeg',
                    duration: result.totalDuration,
                    chunkMetadata: result.chunks.map(c => ({
                        startTime: c.startTime,
                        endTime: c.endTime,
                        index: c.index
                    }))
                };

            } catch (e) {
                console.error('[AudioProcessor] FFmpeg chunking failed:', e);
                console.warn('[AudioProcessor] Falling back to MP3 conversion...');
                return await fallbackToMP3Conversion(file, duration, onProgress);
            }
        }

        // ✅ CASO 3: Audio largo (>=20 min) MP3/WAV - Paso directo
        // El chunking binario se hará en gemini.ts
        console.log('[AudioProcessor] ✅ Long MP3/WAV file: Direct Pass');
        console.log('[AudioProcessor] Strategy: Binary chunking in Gemini layer');
        console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
        return {
            chunks: [file],
            originalSize: file.size,
            compressedSize: file.size,
            wasCompressed: false,
            wasChunked: false,
            chunkingMethod: 'none', // Se chunkeará binariamente después
            duration,
        };


    }

    // VIDEO: Extraer audio en alta calidad
    console.log('[AudioProcessor] 🎬 Video file: Extracting HQ audio');
    console.log('[AudioProcessor] Target: 44.1kHz @ 128kbps MP3');
    onProgress?.('compressing', 0);

    const extracted = await compressAudio(
        file,
        (p) => onProgress?.('compressing', p),
        GEMINI_SAMPLE_RATE,
        GEMINI_BITRATE,
        'Gemini HQ'
    );

    console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');

    return {
        chunks: [extracted.file],
        originalSize: file.size,
        compressedSize: extracted.compressedSize,
        wasCompressed: true,
        wasChunked: false,
        chunkingMethod: 'none',
        duration: extracted.duration,
    };
}

/**
 * Fallback: Convertir a MP3 para permitir chunking binario
 * (usado cuando FFmpeg falla o no está disponible)
 */
async function fallbackToMP3Conversion(
    file: File,
    duration: number,
    onProgress?: (stage: string, progress: number) => void
): Promise<ProcessedAudio> {
    console.log('[AudioProcessor] 🔄 Fallback: Converting to MP3 for safe chunking');
    console.log('[AudioProcessor] Target: 44.1kHz @ 128kbps MP3');

    const converted = await compressAudio(
        file,
        (p) => onProgress?.('compressing', p),
        GEMINI_SAMPLE_RATE,
        GEMINI_BITRATE,
        'Gemini Safe-Chunking'
    );

    return {
        chunks: [converted.file],
        originalSize: file.size,
        compressedSize: converted.compressedSize,
        wasCompressed: true,
        wasChunked: false,
        chunkingMethod: 'none',
        duration: converted.duration,
    };
}

/**
 * Procesar para GROQ
 * - Audio < 25MB: Paso directo
 * - Audio > 25MB o Video: Comprimir @ 16kHz 64kbps
 * - Si resultado > 20MB: Chunkear
 */
async function processForGroq(
    file: File,
    duration: number,
    onProgress?: (stage: string, progress: number) => void,
    options: any = {}
): Promise<ProcessedAudio> {
    const isVideo = file.type.startsWith('video/');
    const forceCompression = options.forceCompression ?? false;
    const needsCompression = file.size > GROQ_MAX_SIZE || isVideo || forceCompression;

    // Paso 1: ¿Necesita compresión?
    if (!needsCompression) {
        console.log('[AudioProcessor] ✅ Audio < 25MB: Direct Pass');
        console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
        return {
            chunks: [file],
            originalSize: file.size,
            compressedSize: file.size,
            wasCompressed: false,
            wasChunked: false,
            chunkingMethod: 'none',
            duration,
        };
    }

    // Paso 2: Comprimir/Extraer
    const action = isVideo ? 'Extracting audio' : 'Compressing';
    console.log(`[AudioProcessor] 📦 ${action} for Groq`);
    console.log('[AudioProcessor] Target: 16kHz @ 64kbps MP3 (Whisper optimized)');
    onProgress?.('compressing', 0);

    const compressed = await compressAudio(
        file,
        (p) => onProgress?.('compressing', p),
        GROQ_SAMPLE_RATE,
        GROQ_BITRATE,
        'Groq Whisper'
    );

    let currentFile = compressed.file;
    let currentDuration = compressed.duration;

    // Paso 3: ¿Necesita chunking?
    if (currentFile.size <= GROQ_CHUNK_SIZE) {
        console.log('[AudioProcessor] ✅ No chunking needed');
        console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
        return {
            chunks: [currentFile],
            originalSize: file.size,
            compressedSize: currentFile.size,
            wasCompressed: true,
            wasChunked: false,
            chunkingMethod: 'none',
            duration: currentDuration,
        };
    }

    // Paso 4: Chunkear (binario - MP3 lo soporta)
    console.log('[AudioProcessor] ✂️  File > 20MB: Binary Chunking');
    onProgress?.('chunking', 0);
    const chunks = chunkFile(currentFile, GROQ_CHUNK_SIZE);
    onProgress?.('chunking', 1);

    console.log('[AudioProcessor] Created', chunks.length, 'chunks');
    console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');

    return {
        chunks,
        originalSize: file.size,
        compressedSize: currentFile.size,
        wasCompressed: true,
        wasChunked: true,
        chunkingMethod: 'binary',
        duration: currentDuration,
    };
}

/**
 * Comprimir/Extraer audio con logging detallado
 */
async function compressAudio(
    file: File,
    onProgress?: (progress: number) => void,
    targetSampleRate: number = GROQ_SAMPLE_RATE,
    targetBitrate: number = GROQ_BITRATE,
    label: string = 'Audio'
): Promise<CompressionResult> {
    const startTime = Date.now();
    const arrayBuffer = await file.arrayBuffer();
    onProgress?.(0.1);

    // Decodificar audio a PCM
    const audioCtx = new (window.AudioContext || (window as any).webkitAudioContext)({
        sampleRate: targetSampleRate,
    });

    let audioBuffer: AudioBuffer;
    try {
        audioBuffer = await audioCtx.decodeAudioData(arrayBuffer);
    } catch (decodeError: any) {
        await audioCtx.close();
        throw new Error(`Failed to decode audio: ${decodeError.message}. The file may be corrupted or in an unsupported codec.`);
    }

    await audioCtx.close();
    onProgress?.(0.3);

    // Calcular duración del audio extraído
    const extractedDuration = audioBuffer.length / audioBuffer.sampleRate;

    // Obtener datos mono
    const monoData = getMono(audioBuffer);
    onProgress?.(0.4);

    // Codificar a MP3
    const mp3Data = await encodeMp3(monoData, targetSampleRate, targetBitrate, onProgress);

    const mp3Blob = new Blob(mp3Data as unknown as BlobPart[], { type: 'audio/mpeg' });
    const mp3File = new File(
        [mp3Blob],
        file.name.replace(/\.[^.]+$/, '') + '_processed.mp3',
        { type: 'audio/mpeg' }
    );

    const totalTime = ((Date.now() - startTime) / 1000).toFixed(1);

    // Logs detallados
    console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
    console.log(`[AudioProcessor] ✅ ${label} Processing Complete`);
    console.log('[AudioProcessor] Original:', file.name);
    console.log('[AudioProcessor] Original size:', (file.size / 1024 / 1024).toFixed(2), 'MB');
    console.log('[AudioProcessor] Duration:', (extractedDuration / 60).toFixed(1), 'minutes (', extractedDuration.toFixed(1), 's )');
    console.log('[AudioProcessor] Quality:', targetSampleRate, 'Hz @', targetBitrate, 'kbps');
    console.log('[AudioProcessor] Output size:', (mp3File.size / 1024 / 1024).toFixed(2), 'MB');
    console.log('[AudioProcessor] Compression ratio:', (mp3File.size / file.size * 100).toFixed(1), '%');
    console.log('[AudioProcessor] Processing time:', totalTime, 's');

    return {
        file: mp3File,
        originalSize: file.size,
        compressedSize: mp3File.size,
        ratio: mp3File.size / file.size,
        duration: extractedDuration,
    };
}

/**
 * Mezclar buffer de audio a mono Int16Array
 */
function getMono(buffer: AudioBuffer): Int16Array {
    const channels = buffer.numberOfChannels;
    const length = buffer.length;
    const output = new Int16Array(length);

    if (channels === 1) {
        const data = buffer.getChannelData(0);
        for (let i = 0; i < length; i++) {
            output[i] = Math.max(-32768, Math.min(32767, Math.round(data[i] * 32767)));
        }
    } else {
        // Mezclar todos los canales
        const left = buffer.getChannelData(0);
        const right = buffer.getChannelData(1);
        for (let i = 0; i < length; i++) {
            const mixed = (left[i] + right[i]) / 2;
            output[i] = Math.max(-32768, Math.min(32767, Math.round(mixed * 32767)));
        }
    }

    return output;
}

/**
 * Codificar Int16Array PCM a MP3 usando Web Worker
 */
function encodeMp3(
    samples: Int16Array,
    sampleRate: number,
    bitrate: number,
    onProgress?: (progress: number) => void
): Promise<Uint8Array[]> {
    return new Promise((resolve, reject) => {
        const worker = new Worker(new URL('./audio-encoder.worker.js', import.meta.url), { type: 'module' });

        worker.onmessage = (e) => {
            const { type, progress, mp3Data, error } = e.data;

            if (type === 'progress') {
                onProgress?.(0.4 + progress * 0.6);
            } else if (type === 'complete') {
                worker.terminate();
                resolve(mp3Data);
            } else if (type === 'error') {
                worker.terminate();
                reject(new Error(error));
            }
        };

        worker.onerror = (err) => {
            worker.terminate();
            reject(err);
        };

        worker.postMessage({ pcmData: samples, sampleRate, bitrate });
    });
}

/**
 * Dividir archivo en chunks (binario - solo para MP3/WAV)
 */
function chunkFile(file: File, chunkSize: number = GROQ_CHUNK_SIZE): File[] {
    if (file.size <= chunkSize) return [file];

    const chunks: File[] = [];
    let offset = 0;
    let index = 0;

    while (offset < file.size) {
        const end = Math.min(offset + chunkSize, file.size);
        const blob = file.slice(offset, end);
        const chunkFile = new File(
            [blob],
            `${file.name.replace(/\.[^.]+$/, '')}_part${index + 1}.mp3`,
            { type: file.type }
        );
        chunks.push(chunkFile);
        offset = end;
        index++;
    }

    return chunks;
}