import { db } from './db';

const ALGORITHM = 'AES-GCM';
const KEY_NAME = 'master-key';

// Generate a random IV for each encryption
const generateIV = () => window.crypto.getRandomValues(new Uint8Array(12));

async function getMasterKey(): Promise<CryptoKey> {
    // Try to get from DB first
    const stored = await db.secrets.get(KEY_NAME);

    if (stored && stored.value) {
        // Import the raw key back to CryptoKey
        return await window.crypto.subtle.importKey(
            'jwk',
            stored.value,
            { name: ALGORITHM, length: 256 },
            true, // extractable (we need to export it to save, though we just imported it)
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
}

// Convert ArrayBuffer to Base64
function bufferToBase64(buffer: ArrayBufferLike): string {
    const bytes = new Uint8Array(buffer);
    let binary = '';
    for (let i = 0; i < bytes.byteLength; i++) {
        binary += String.fromCharCode(bytes[i]);
    }
    return window.btoa(binary);
}

// Convert Base64 to Uint8Array
function base64ToBuffer(base64: string): Uint8Array {
    const binary = window.atob(base64);
    const bytes = new Uint8Array(binary.length);
    for (let i = 0; i < binary.length; i++) {
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
            { name: ALGORITHM, iv: iv },
            key,
            data
        );

        const decoder = new TextDecoder();
        return decoder.decode(decrypted);
    } catch (e) {
        console.error('Decryption failed (key mismatch or corrupt):', e);
        return '';
    }
}
