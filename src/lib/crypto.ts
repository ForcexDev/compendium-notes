import { db } from './db';

const ALGORITHM = 'AES-GCM';
const KEY_NAME = 'master-key';

// Singleton lock to prevent race conditions during key generation/retrieval
let keyGenerationPromise: Promise<CryptoKey> | null = null;

// Generate a random IV for each encryption
const generateIV = () => window.crypto.getRandomValues(new Uint8Array(12));

async function getMasterKey(): Promise<CryptoKey> {
    // If a request is already in progress, return that promise (Singleton pattern)
    if (keyGenerationPromise) return keyGenerationPromise;

    keyGenerationPromise = (async () => {
        try {
            // Try to get from DB first
            const stored = await db.secrets.get(KEY_NAME);

            if (stored && stored.value) {
                // Import the raw key back to CryptoKey
                return await window.crypto.subtle.importKey(
                    'jwk',
                    stored.value,
                    { name: ALGORITHM, length: 256 },
                    true, // extractable
                    ['encrypt', 'decrypt']
                );
            }

            // Generate new key
            const key = await window.crypto.subtle.generateKey(
                { name: ALGORITHM, length: 256 },
                true,
                ['encrypt', 'decrypt']
            );

            // Export to JWK to store in Dexie (IndexedDB)
            const exported = await window.crypto.subtle.exportKey('jwk', key);
            await db.secrets.put({ key: KEY_NAME, value: exported });

            return key;
        } finally {
            // Reset the promise after completion (or error) so subsequent calls 
            // can retry or fetch fresh if needed, though usually the key is static.
            // keeping it null forces a re-check of DB/memory next time, which is safer 
            // than caching a potentially stale error, but slightly less performant.
            // Given the race condition is usually only on startup, this is fine.
            keyGenerationPromise = null;
        }
    })();

    return keyGenerationPromise;
}

// Convert ArrayBuffer to Base64 (Chunked to prevent Stack Overflow on large files)
function bufferToBase64(buffer: ArrayBufferLike): string {
    const bytes = new Uint8Array(buffer);
    let binary = '';
    const len = bytes.byteLength;
    const CHUNK_SIZE = 0x8000; // 32KB chunks

    for (let i = 0; i < len; i += CHUNK_SIZE) {
        const chunk = bytes.subarray(i, Math.min(i + CHUNK_SIZE, len));
        // Use apply with strict chunk size to avoid stack overflow
        binary += String.fromCharCode.apply(null, Array.from(chunk));
    }
    return window.btoa(binary);
}

// Convert Base64 to Uint8Array
function base64ToBuffer(base64: string): Uint8Array {
    const binary = window.atob(base64);
    const len = binary.length;
    const bytes = new Uint8Array(len);
    for (let i = 0; i < len; i++) {
        bytes[i] = binary.charCodeAt(i);
    }
    return bytes;
}

export async function encryptData(text: string): Promise<string> {
    if (!text) return '';
    try {
        const key = await getMasterKey();
        const iv = generateIV();
        const encoder = new TextEncoder();
        const data = encoder.encode(text);

        const encrypted = await window.crypto.subtle.encrypt(
            { name: ALGORITHM, iv: iv },
            key,
            data
        );

        // Return combined IV + Data as string
        // Format: iv_base64:data_base64
        return `${bufferToBase64(iv.buffer)}:${bufferToBase64(encrypted)}`;
    } catch (e) {
        console.error('Encryption failed:', e);
        return ''; // Fail safe
    }
}

export async function decryptData(cipherText: string): Promise<string> {
    if (!cipherText || !cipherText.includes(':')) return '';
    try {
        const [ivB64, dataB64] = cipherText.split(':');
        const key = await getMasterKey();
        const iv = base64ToBuffer(ivB64);
        const data = base64ToBuffer(dataB64);

        const decrypted = await window.crypto.subtle.decrypt(
            { name: ALGORITHM, iv: iv } as any,
            key,
            data as any
        );

        const decoder = new TextDecoder();
        return decoder.decode(decrypted);
    } catch (e) {
        console.error('Decryption failed (key mismatch or corrupt):', e);
        return '';
    }
}
