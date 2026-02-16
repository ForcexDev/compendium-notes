import { Mp3Encoder } from '@breezystack/lamejs';

self.onmessage = (e) => {
    // Default bitrate 64kbps if not provided
    const { pcmData, sampleRate, bitrate = 64 } = e.data;

    if (!pcmData) return;

    try {
        const mp3BufferList = encodeMp3(pcmData, sampleRate, bitrate);
        self.postMessage({ type: 'complete', mp3Data: mp3BufferList });
    } catch (err) {
        self.postMessage({ type: 'error', error: err.message });
    }
};

function encodeMp3(samples, sampleRate, bitrate) {
    // 1 channel (mono), sampleRate, bitrate (kbps)
    const encoder = new Mp3Encoder(1, sampleRate, bitrate);
    const blockSize = 1152;
    const mp3Data = [];
    const totalBlocks = Math.ceil(samples.length / blockSize);

    for (let i = 0; i < samples.length; i += blockSize) {
        const block = samples.subarray(i, Math.min(i + blockSize, samples.length));
        const encoded = encoder.encodeBuffer(block);
        if (encoded.length > 0) {
            mp3Data.push(new Uint8Array(encoded.buffer, encoded.byteOffset, encoded.byteLength));
        }

        // Report progress every ~1%
        if (i % (blockSize * 100) === 0) {
            const progress = i / samples.length;
            self.postMessage({ type: 'progress', progress });
        }
    }

    const flushed = encoder.flush();
    if (flushed.length > 0) {
        mp3Data.push(new Uint8Array(flushed.buffer, flushed.byteOffset, flushed.byteLength));
    }

    return mp3Data;
}
