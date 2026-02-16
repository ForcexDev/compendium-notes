import { FFmpeg } from '@ffmpeg/ffmpeg';
import { fetchFile, toBlobURL } from '@ffmpeg/util';

/**
 * Módulo de Chunking Temporal con FFmpeg.wasm
 * Corta archivos de audio/video por TIEMPO (no bytes) para preservar estructura
 * Soporta: M4A, MP4, MKV, WEBM, OPUS, FLAC, WAV, etc.
 */

let ffmpegInstance: FFmpeg | null = null;
let isLoaded = false;

/**
 * Cargar FFmpeg.wasm (primera vez descarga ~30MB, luego cachea)
 */
async function loadFFmpeg(onProgress?: (message: string, ratio: number) => void): Promise<FFmpeg> {
    if (ffmpegInstance && isLoaded) {
        return ffmpegInstance;
    }

    if (!ffmpegInstance) {
        ffmpegInstance = new FFmpeg();
    }

    if (!isLoaded) {
        onProgress?.('Cargando FFmpeg.wasm...', 0);

        // Configurar logging
        ffmpegInstance.on('log', ({ message }) => {
            console.log('[FFmpeg]', message);
        });

        // Configurar progreso
        ffmpegInstance.on('progress', ({ progress, time }) => {
            onProgress?.(`Procesando... ${Math.round(progress * 100)}%`, progress);
        });

        // Cargar WASM localmente (evita problemas de COEP con CDNs externos)
        const baseURL = window.location.origin + '/ffmpeg';

        await ffmpegInstance.load({
            coreURL: `${baseURL}/ffmpeg-core.js`,
            wasmURL: `${baseURL}/ffmpeg-core.wasm`,
        });

        isLoaded = true;
        onProgress?.('FFmpeg cargado', 1);
    }

    return ffmpegInstance;
}

/**
 * Información de un chunk generado
 */
export interface ChunkInfo {
    file: File;
    startTime: number;  // segundos
    endTime: number;    // segundos
    index: number;
}

/**
 * Resultado del chunking temporal
 */
export interface TemporalChunkingResult {
    chunks: ChunkInfo[];
    totalDuration: number;
    format: string;
}

/**
 * Determinar extensión de salida según tipo MIME
 */
function getOutputExtension(mimeType: string, fileName: string): string {
    // Priorizar extensión del archivo
    const fileExt = fileName.match(/\.([^.]+)$/)?.[1]?.toLowerCase();

    if (fileExt && ['m4a', 'mp4', 'webm', 'opus', 'flac', 'wav', 'ogg'].includes(fileExt)) {
        return fileExt;
    }

    // Fallback por MIME type
    const mimeMap: Record<string, string> = {
        'audio/mp4': 'm4a',
        'audio/x-m4a': 'm4a',
        'audio/m4a': 'm4a',
        'audio/aac': 'm4a',
        'audio/mpeg': 'mp3',
        'audio/mp3': 'mp3',
        'audio/webm': 'webm',
        'audio/opus': 'opus',
        'audio/ogg': 'ogg',
        'audio/flac': 'flac',
        'audio/wav': 'wav',
        'video/mp4': 'mp4',
        'video/quicktime': 'mp4',
        'video/webm': 'webm',
    };

    return mimeMap[mimeType] || 'm4a';
}

/**
 * Determinar codec de salida para -c copy
 * Algunos formatos necesitan recodificación ligera
 */
function needsReencoding(extension: string): boolean {
    // Estos formatos suelen tener problemas con -c copy en segmentos temporales directos
    // Quitamos 'flac' de aquí porque soporta stream copy perfectamente bien.
    const problematicFormats = ['opus', 'avi'];
    return problematicFormats.includes(extension);
}

/**
 * Chunking temporal de archivo de audio/video
 * 
 * @param file Archivo original (M4A, MP4, WEBM, etc.)
 * @param totalDuration Duración total del archivo en segundos (obtenida con Web Audio API)
 * @param chunkDurationMinutes Duración de cada chunk en minutos (default: 20)
 * @param overlapSeconds Overlap entre chunks para evitar cortes de palabras (default: 30)
 * @param onProgress Callback de progreso
 * @returns Array de chunks con metadata
 */
export async function chunkFileTemporally(
    file: File,
    totalDuration: number,
    chunkDurationMinutes: number = 20,
    overlapSeconds: number = 30,
    onProgress?: (stage: string, progress: number) => void
): Promise<TemporalChunkingResult> {
    console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
    console.log('[FFmpeg Chunker] 🎬 Starting Temporal Chunking');
    console.log(`[FFmpeg Chunker] File: ${file.name} (${(file.size / 1024 / 1024).toFixed(1)}MB)`);
    console.log(`[FFmpeg Chunker] Chunk size: ${chunkDurationMinutes} min`);
    console.log(`[FFmpeg Chunker] Overlap: ${overlapSeconds}s`);
    console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');

    if (totalDuration <= 0) {
        throw new Error('Invalid duration provided');
    }

    const startTime = Date.now();

    // 1. Cargar FFmpeg
    const ffmpeg = await loadFFmpeg((msg, ratio) => {
        onProgress?.(`loading`, ratio * 0.1); // 0-10%
    });

    // 2. Escribir archivo en sistema virtual de FFmpeg
    onProgress?.('preparing', 0.1);
    const inputFileName = 'input.' + getOutputExtension(file.type, file.name);
    await ffmpeg.writeFile(inputFileName, await fetchFile(file));

    // 3. Usar duración provista
    onProgress?.('chunking', 0.15);

    // SAFETY CHECK: If duration is Infinity or NaN, we can't chunk temporally.
    if (!Number.isFinite(totalDuration) || totalDuration <= 0) {
        console.warn('[FFmpeg Chunker] ⚠️ Invalid duration (Infinity/NaN). Falling back to direct pass.');
        // Cleanup and exit early with a single chunk
        await ffmpeg.deleteFile(inputFileName);
        const chunkBlob = new Blob([await file.arrayBuffer()], { type: file.type });
        const singleFile = new File([chunkBlob], file.name, { type: file.type });
        return {
            chunks: [{ file: singleFile, startTime: 0, endTime: 0, index: 0 }],
            totalDuration: 0,
            format: getOutputExtension(file.type, file.name)
        };
    }

    const duration = totalDuration;
    const durationMinutes = duration / 60;
    console.log(`[FFmpeg Chunker] Total duration: ${durationMinutes.toFixed(1)} min (${duration.toFixed(1)}s)`);

    // 4. Calcular chunks
    const chunkDurationSeconds = chunkDurationMinutes * 60;
    const chunks: ChunkInfo[] = [];
    const extension = getOutputExtension(file.type, file.name);
    let finalExtension = extension;
    let finalMime = file.type;

    const shouldReencode = needsReencoding(extension);

    // Si recodificamos, forzamos formato universal AAC/M4A
    if (shouldReencode) {
        finalExtension = 'm4a';
        finalMime = 'audio/mp4';
    }

    let currentTime = 0;
    let chunkIndex = 0;
    const MAX_CHUNKS = 100; // Hard limit to prevent infinite loops

    while (currentTime < duration && chunkIndex < MAX_CHUNKS) {
        const startSeconds = currentTime;
        const endSeconds = Math.min(currentTime + chunkDurationSeconds + overlapSeconds, duration);
        const chunkDuration = endSeconds - startSeconds;

        const outputFileName = `chunk_${chunkIndex}.${finalExtension}`;

        // Progreso: 15% + (chunk actual / total chunks) * 80%
        const estimatedChunks = Math.ceil(duration / chunkDurationSeconds);
        const chunkProgress = chunkIndex / estimatedChunks;
        onProgress?.('chunking', 0.15 + (chunkProgress * 0.8));

        console.log(`[FFmpeg Chunker] ✂️  Chunk ${chunkIndex + 1}: ${(startSeconds / 60).toFixed(1)}-${(endSeconds / 60).toFixed(1)} min`);

        // FFmpeg command
        let exitCode: number;
        if (shouldReencode) {
            // Recodificación ligera para formatos problemáticos
            exitCode = await ffmpeg.exec([
                '-i', inputFileName,
                '-ss', startSeconds.toString(),
                '-t', chunkDuration.toString(),
                '-c:a', 'aac',        // Codec universal
                '-b:a', '128k',       // Calidad decente
                '-y',
                outputFileName
            ]);
        } else {
            // Stream copy (super rápido, sin recodificación)
            exitCode = await ffmpeg.exec([
                '-i', inputFileName,
                '-ss', startSeconds.toString(),
                '-t', chunkDuration.toString(),
                '-c', 'copy',         // No recodificar
                '-y',
                outputFileName
            ]);
        }

        if (exitCode !== 0) {
            throw new Error(`FFmpeg failed with exit code ${exitCode} while processing chunk ${chunkIndex}`);
        }

        // Leer chunk generado
        const chunkData = await ffmpeg.readFile(outputFileName);

        // CORRECCIÓN CRÍTICA: FFmpeg usa SharedArrayBuffer, que Blob no acepta directamente en algunos contextos
        // Hacemos una copia profunda a un ArrayBuffer estándar
        const dataArray = chunkData as Uint8Array;
        const standardBuffer = new Uint8Array(dataArray.length);
        standardBuffer.set(dataArray);

        const chunkBlob = new Blob([standardBuffer], { type: finalMime });
        const chunkFile = new File(
            [chunkBlob],
            `${file.name.replace(/\.[^.]+$/, '')}_part${chunkIndex}.${finalExtension}`,
            { type: finalMime }
        );

        chunks.push({
            file: chunkFile,
            startTime: startSeconds,
            endTime: endSeconds,
            index: chunkIndex
        });

        console.log(`[FFmpeg Chunker]    Size: ${(chunkFile.size / 1024 / 1024).toFixed(1)}MB`);

        // Limpiar archivo temporal
        await ffmpeg.deleteFile(outputFileName);

        currentTime += chunkDurationSeconds;
        chunkIndex++;
    }

    // 5. Limpiar archivo original
    await ffmpeg.deleteFile(inputFileName);

    const totalTime = ((Date.now() - startTime) / 1000).toFixed(1);

    console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
    console.log('[FFmpeg Chunker] ✅ Chunking Complete');
    console.log(`[FFmpeg Chunker] Time: ${totalTime}s`);
    console.log(`[FFmpeg Chunker] Created ${chunks.length} chunks`);
    console.log(`[FFmpeg Chunker] Strategy: ${shouldReencode ? 'Re-encode (AAC)' : 'Stream Copy'}`);
    console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');

    onProgress?.('done', 1);

    return {
        chunks,
        totalDuration: duration,
        format: extension
    };
}

/**
 * Verificar si un formato necesita chunking temporal (no soporta chunking binario)
 */
export function needsTemporalChunking(fileName: string, mimeType: string): boolean {
    // Formatos contenedor (necesitan chunking temporal)
    const containerFormats = [
        'm4a', 'mp4', 'mov',           // MPEG-4 contenedor
        'webm', 'mkv',                 // WebM/Matroska
        'ogg', 'opus',                 // Ogg contenedor
        'flac',                        // FLAC tiene headers complejos
    ];

    const extension = fileName.match(/\.([^.]+)$/)?.[1]?.toLowerCase();

    if (extension && containerFormats.includes(extension)) {
        return true;
    }

    // Verificar por MIME type
    const containerMimes = [
        'audio/mp4', 'audio/x-m4a', 'audio/m4a',
        'video/mp4', 'video/quicktime',
        'audio/webm', 'video/webm',
        'audio/ogg', 'audio/opus',
        'audio/flac', 'audio/x-flac',
    ];

    return containerMimes.includes(mimeType);
}

/**
 * Validar si FFmpeg.wasm está disponible en el navegador
 */
export function isFFmpegSupported(): boolean {
    const hasSharedArrayBuffer = typeof SharedArrayBuffer !== 'undefined';
    const hasWebAssembly = typeof WebAssembly !== 'undefined';

    console.log('[FFmpeg Support Check]');
    console.log(' - SharedArrayBuffer:', hasSharedArrayBuffer ? '✅ OK' : '❌ MISSING (Blocked by Browser/Headers)');
    console.log(' - WebAssembly:', hasWebAssembly ? '✅ OK' : '❌ MISSING');

    // FFmpeg.wasm requiere SharedArrayBuffer y WASM
    return hasSharedArrayBuffer && hasWebAssembly;
}
