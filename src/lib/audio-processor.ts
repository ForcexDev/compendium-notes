import { Mp3Encoder } from '@breezystack/lamejs';

const TARGET_SAMPLE_RATE = 16000;
const TARGET_BITRATE = 64; // kbps — good enough for speech
const MAX_DIRECT_SIZE = 25 * 1024 * 1024; // 25MB
const CHUNK_SIZE = 20 * 1024 * 1024; // 20MB per chunk

export interface CompressionResult {
    file: File;
    originalSize: number;
    compressedSize: number;
    ratio: number;
}

export interface ProcessedAudio {
    chunks: File[];
    originalSize: number;
    compressedSize: number;
    wasCompressed: boolean;
    wasChunked: boolean;
}

/**
 * Full pipeline: Compress → Check size → Chunk if needed
 */
export async function processAudioForUpload(
    file: File,
    onProgress?: (stage: string, progress: number) => void
): Promise<ProcessedAudio> {
    const originalSize = file.size;

    // If already small enough, skip everything
    if (originalSize <= MAX_DIRECT_SIZE) {
        return {
            chunks: [file],
            originalSize,
            compressedSize: originalSize,
            wasCompressed: false,
            wasChunked: false,
        };
    }

    // Step 1: Compress
    onProgress?.('compressing', 0);
    const compressed = await compressAudio(file, (p) => onProgress?.('compressing', p));

    // Step 2: Check if compression was enough
    if (compressed.file.size <= MAX_DIRECT_SIZE) {
        return {
            chunks: [compressed.file],
            originalSize,
            compressedSize: compressed.compressedSize,
            wasCompressed: true,
            wasChunked: false,
        };
    }

    // Step 3: Still too big — chunk the compressed file
    onProgress?.('chunking', 0);
    const chunks = chunkFile(compressed.file);
    onProgress?.('chunking', 1);

    return {
        chunks,
        originalSize,
        compressedSize: compressed.compressedSize,
        wasCompressed: true,
        wasChunked: true,
    };
}

/**
 * Compress audio to 16kHz mono MP3 at 64kbps using Web Audio API + lamejs
 */
async function compressAudio(
    file: File,
    onProgress?: (progress: number) => void
): Promise<CompressionResult> {
    const arrayBuffer = await file.arrayBuffer();
    onProgress?.(0.1);

    // Decode audio to PCM
    const audioCtx = new (window.AudioContext || (window as any).webkitAudioContext)({
        sampleRate: TARGET_SAMPLE_RATE,
    });

    let audioBuffer: AudioBuffer;
    try {
        audioBuffer = await audioCtx.decodeAudioData(arrayBuffer);
    } finally {
        await audioCtx.close();
    }
    onProgress?.(0.3);

    // Get mono channel data (mix down if stereo)
    const monoData = getMono(audioBuffer);
    onProgress?.(0.4);

    // Encode to MP3
    const mp3Data = encodeMp3(monoData, TARGET_SAMPLE_RATE, TARGET_BITRATE, onProgress);

    const mp3Blob = new Blob(mp3Data as unknown as BlobPart[], { type: 'audio/mpeg' });
    const mp3File = new File([mp3Blob], file.name.replace(/\.[^.]+$/, '') + '_compressed.mp3', {
        type: 'audio/mpeg',
    });

    return {
        file: mp3File,
        originalSize: file.size,
        compressedSize: mp3File.size,
        ratio: mp3File.size / file.size,
    };
}

/**
 * Mix audio buffer down to mono Int16Array
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
        // Mix all channels
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
 * Encode Int16Array PCM to MP3 using lamejs
 */
function encodeMp3(
    samples: Int16Array,
    sampleRate: number,
    bitrate: number,
    onProgress?: (progress: number) => void
): Uint8Array[] {
    const encoder = new Mp3Encoder(1, sampleRate, bitrate);
    const blockSize = 1152;
    const mp3Data: Uint8Array[] = [];
    const totalBlocks = Math.ceil(samples.length / blockSize);

    for (let i = 0; i < samples.length; i += blockSize) {
        const block = samples.subarray(i, Math.min(i + blockSize, samples.length));
        const encoded = encoder.encodeBuffer(block);
        if (encoded.length > 0) {
            mp3Data.push(new Uint8Array(encoded.buffer, encoded.byteOffset, encoded.byteLength));
        }

        // Progress: 0.4 → 0.95
        if (onProgress && i % (blockSize * 100) === 0) {
            const blockProgress = (i / blockSize) / totalBlocks;
            onProgress(0.4 + blockProgress * 0.55);
        }
    }

    const flushed = encoder.flush();
    if (flushed.length > 0) {
        mp3Data.push(new Uint8Array(flushed.buffer, flushed.byteOffset, flushed.byteLength));
    }

    onProgress?.(1);
    return mp3Data;
}

/**
 * Split a file into chunks of ~20MB
 */
function chunkFile(file: File): File[] {
    if (file.size <= MAX_DIRECT_SIZE) return [file];

    const chunks: File[] = [];
    let offset = 0;
    let index = 0;

    while (offset < file.size) {
        const end = Math.min(offset + CHUNK_SIZE, file.size);
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
