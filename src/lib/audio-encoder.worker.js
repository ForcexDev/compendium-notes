import { Mp3Encoder } from '@breezystack/lamejs';

self.onmessage = (e) => {
    const { pcmData, sampleRate } = e.data;

    if (!pcmData) return;

    try {
        const mp3Data = encodeMp3(pcmData, sampleRate);
        self.postMessage({ type: 'complete', mp3Data });
    } catch (err) {
        self.postMessage({ type: 'error', error: err.message });
    }
};

function encodeMp3(samples, sampleRate) {
    const encoder = new Mp3Encoder(1, sampleRate, 64); // 64kbps mono
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
