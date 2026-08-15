#!/usr/bin/env node
/**
 * ¿Por qué Gemini nos dice 503 si a otros prompts les contesta?
 *
 * Un 503 no distingue entre "el modelo está caído" y "esta petición concreta
 * no la puedo servir ahora". Si los prompts de texto se responden y los
 * nuestros no, la diferencia está en LO QUE PEDIMOS, y este script la aísla
 * cambiando una variable cada vez:
 *
 *   1. texto            · generateContent          ← lo que ya sabemos que va
 *   2. texto            · streamGenerateContent    ← ¿es el streaming?
 *   3. audio            · generateContent          ← ¿es el audio?
 *   4. audio            · streamGenerateContent    ← ¿es la combinación?
 *   5. audio + payload real de la app               ← ¿es algo de nuestro body?
 *   6. audio × N a la vez                           ← ¿es la simultaneidad?
 *
 * El audio se fabrica aquí (un WAV de tono puro), así que no hace falta subir
 * nada personal. Con `--file ruta.m4a` se usa un audio real, que es lo que de
 * verdad manda la app.
 *
 * Uso:
 *   GEMINI_API_KEY=... node scripts/diagnose-gemini.mjs
 *   GEMINI_API_KEY=... node scripts/diagnose-gemini.mjs --file "Clase 2 Cripto.m4a" --model gemini-3.5-flash-lite
 */

import { readFile } from 'node:fs/promises';
import { basename } from 'node:path';

const API = 'https://generativelanguage.googleapis.com/v1beta';
const UPLOAD = 'https://generativelanguage.googleapis.com/upload/v1beta';

const args = process.argv.slice(2);
const arg = (name, fallback) => {
    const i = args.indexOf(`--${name}`);
    return i >= 0 && args[i + 1] ? args[i + 1] : fallback;
};

const KEY = process.env.GEMINI_API_KEY || arg('key');
const MODEL = arg('model', 'gemini-3.5-flash-lite');
const FILE = arg('file');
const PARALLEL = Number(arg('parallel', '4'));

if (!KEY) {
    console.error('Falta la API key: GEMINI_API_KEY=... node scripts/diagnose-gemini.mjs');
    process.exit(1);
}

// --------------------------------------------------------------------- audio

/** WAV de 16 kHz mono con un tono suave. Sirve de audio válido sin subir nada real. */
function toneWav(seconds = 8) {
    const rate = 16000;
    const samples = rate * seconds;
    const buf = Buffer.alloc(44 + samples * 2);

    buf.write('RIFF', 0);
    buf.writeUInt32LE(36 + samples * 2, 4);
    buf.write('WAVE', 8);
    buf.write('fmt ', 12);
    buf.writeUInt32LE(16, 16);
    buf.writeUInt16LE(1, 20);          // PCM
    buf.writeUInt16LE(1, 22);          // mono
    buf.writeUInt32LE(rate, 24);
    buf.writeUInt32LE(rate * 2, 28);
    buf.writeUInt16LE(2, 32);
    buf.writeUInt16LE(16, 34);
    buf.write('data', 36);
    buf.writeUInt32LE(samples * 2, 40);

    for (let i = 0; i < samples; i++) {
        const v = Math.sin((2 * Math.PI * 440 * i) / rate) * 8000;
        buf.writeInt16LE(v | 0, 44 + i * 2);
    }
    return { bytes: buf, mime: 'audio/wav', name: 'tono.wav' };
}

async function loadAudio() {
    if (!FILE) return toneWav();
    const bytes = await readFile(FILE);
    const name = basename(FILE);
    const ext = name.split('.').pop().toLowerCase();
    const mime = { m4a: 'audio/mp4', mp4: 'audio/mp4', mp3: 'audio/mpeg', wav: 'audio/wav', webm: 'audio/webm', ogg: 'audio/ogg' }[ext] || 'audio/mpeg';
    return { bytes, mime, name };
}

/** Sube por la Files API, igual que la app. */
async function upload({ bytes, mime, name }) {
    const start = await fetch(`${UPLOAD}/files?key=${KEY}`, {
        method: 'POST',
        headers: {
            'X-Goog-Upload-Protocol': 'resumable',
            'X-Goog-Upload-Command': 'start',
            'X-Goog-Upload-Header-Content-Length': String(bytes.length),
            'X-Goog-Upload-Header-Content-Type': mime,
            'Content-Type': 'application/json',
        },
        body: JSON.stringify({ file: { displayName: name } }),
    });
    if (!start.ok) throw new Error(`inicio de subida ${start.status}: ${await start.text()}`);

    const url = start.headers.get('x-goog-upload-url');
    const put = await fetch(url, {
        method: 'POST',
        headers: { 'X-Goog-Upload-Offset': '0', 'X-Goog-Upload-Command': 'upload, finalize' },
        body: bytes,
    });
    if (!put.ok) throw new Error(`subida ${put.status}: ${await put.text()}`);

    const { file } = await put.json();
    for (let i = 0; i < 60; i++) {
        const st = await (await fetch(`${API}/${file.name}?key=${KEY}`)).json();
        if (st.state === 'ACTIVE') return file.uri;
        if (st.state === 'FAILED') throw new Error('el fichero no se pudo procesar');
        await new Promise((r) => setTimeout(r, 2000));
    }
    throw new Error('el fichero no llegó a estar ACTIVE');
}

// -------------------------------------------------------------------- pruebas

const SAFETY = ['HARM_CATEGORY_HARASSMENT', 'HARM_CATEGORY_HATE_SPEECH', 'HARM_CATEGORY_SEXUALLY_EXPLICIT', 'HARM_CATEGORY_DANGEROUS_CONTENT']
    .map((category) => ({ category, threshold: 'BLOCK_NONE' }));

async function call({ stream, parts, generationConfig, safetySettings }) {
    const endpoint = stream
        ? `${API}/models/${MODEL}:streamGenerateContent?alt=sse&key=${KEY}`
        : `${API}/models/${MODEL}:generateContent?key=${KEY}`;

    const body = { contents: [{ parts }] };
    if (generationConfig) body.generationConfig = generationConfig;
    if (safetySettings) body.safetySettings = safetySettings;

    const t0 = Date.now();
    const res = await fetch(endpoint, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
    });
    const ms = Date.now() - t0;
    const text = await res.text();
    return { ok: res.ok, status: res.status, ms, text };
}

const results = [];

async function probe(name, opts) {
    process.stdout.write(`· ${name} … `);
    try {
        const r = await call(opts);
        const veredicto = r.ok ? 'OK' : `HTTP ${r.status}`;
        console.log(`${veredicto} (${r.ms} ms)`);
        if (!r.ok) {
            const msg = (() => { try { return JSON.parse(r.text).error?.message; } catch { return r.text.slice(0, 200); } })();
            console.log(`    ↳ ${msg}`);
        }
        results.push({ name, ok: r.ok, status: r.status });
        return r;
    } catch (e) {
        console.log(`fallo de red: ${e.message}`);
        results.push({ name, ok: false, status: 'red' });
    }
}

const main = async () => {
    console.log(`\nModelo: ${MODEL}`);

    const audio = await loadAudio();
    console.log(`Audio:  ${audio.name} (${(audio.bytes.length / 1024 / 1024).toFixed(2)} MB, ${audio.mime})\n`);

    const texto = [{ text: 'Responde solamente: hola.' }];

    await probe('1. texto  · sin streaming', { stream: false, parts: texto });
    await probe('2. texto  · con streaming', { stream: true, parts: texto });

    console.log('\nSubiendo el audio a la Files API…');
    let uri;
    try {
        uri = await upload(audio);
        console.log(`Subido: ${uri}\n`);
    } catch (e) {
        console.error(`La subida falló: ${e.message}`);
        console.error('Si esto falla, el problema está en la Files API, no en el modelo.\n');
        process.exit(1);
    }

    const conAudio = [{ fileData: { mimeType: audio.mime, fileUri: uri } }, { text: 'Transcribe este audio.' }];

    await probe('3. audio  · sin streaming', { stream: false, parts: conAudio });
    await probe('4. audio  · con streaming', { stream: true, parts: conAudio });
    await probe('5. audio  · payload exacto de la app', {
        stream: true,
        parts: conAudio,
        generationConfig: { temperature: 0.1, maxOutputTokens: 4500 },
        safetySettings: SAFETY,
    });

    console.log(`\n· 6. ${PARALLEL} peticiones de audio a la vez …`);
    const tanda = await Promise.all(Array.from({ length: PARALLEL }, () =>
        call({ stream: true, parts: conAudio }).catch((e) => ({ ok: false, status: e.message }))));
    const bien = tanda.filter((r) => r.ok).length;
    console.log(`    ↳ ${bien}/${PARALLEL} correctas` +
        (bien < PARALLEL ? ` · códigos: ${tanda.filter(r => !r.ok).map(r => r.status).join(', ')}` : ''));
    results.push({ name: `6. ${PARALLEL} en paralelo`, ok: bien === PARALLEL, status: `${bien}/${PARALLEL}` });

    // ------------------------------------------------------------ conclusión
    const by = (n) => results.find((r) => r.name.startsWith(n));
    console.log('\n─── Conclusión ─────────────────────────────');

    if (!by('1').ok && !by('2').ok) {
        console.log('Ni siquiera el texto funciona: la caída es general (o la clave no vale).');
    } else if (by('1').ok && !by('2').ok) {
        console.log('El TEXTO va sin streaming y falla CON streaming.');
        console.log('→ El problema es el endpoint de streaming. La app debe pedirlo sin streaming.');
    } else if (by('2').ok && !by('3').ok && !by('4').ok) {
        console.log('El texto va (con y sin streaming) pero el AUDIO no, de ninguna forma.');
        console.log('→ Es la capacidad de audio del modelo, no nuestra petición. Toca esperar o usar Groq.');
    } else if (by('3').ok && !by('4').ok) {
        console.log('El audio va SIN streaming y falla CON streaming.');
        console.log('→ La app debe volver a generateContent para el audio.');
    } else if (by('4').ok && !by('5').ok) {
        console.log('El audio va con una petición simple y falla con el payload de la app.');
        console.log('→ El problema está en generationConfig / safetySettings. Hay que ir quitando campos.');
    } else if (by('5').ok && !by('6').ok) {
        console.log('Las peticiones sueltas van; varias a la vez, no.');
        console.log('→ Es la simultaneidad: baja "Fragmentos a la vez" a 1 o 2 en Configuración.');
    } else if (results.every((r) => r.ok)) {
        console.log('Todo responde ahora mismo. El 503 era pasajero: vuelve a intentarlo en la app.');
    } else {
        console.log('Resultado mixto — el servicio va y viene. Mira la tabla de arriba.');
    }
    console.log('────────────────────────────────────────────\n');
};

main().catch((e) => { console.error(e); process.exit(1); });
