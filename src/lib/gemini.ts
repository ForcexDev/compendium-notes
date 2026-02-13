const GEMINI_API_URL = 'https://generativelanguage.googleapis.com/v1beta';
const GEMINI_UPLOAD_URL = 'https://generativelanguage.googleapis.com/upload/v1beta';

/**
 * Upload a file to Gemini Files API and wait until it's active
 */
async function uploadToGemini(file: File, apiKey: string, onProgress?: (p: number) => void): Promise<string> {
    onProgress?.(0.1);

    // Step 1: Start resumable upload
    const startRes = await fetch(`${GEMINI_UPLOAD_URL}/files?key=${apiKey}`, {
        method: 'POST',
        headers: {
            'X-Goog-Upload-Protocol': 'resumable',
            'X-Goog-Upload-Command': 'start',
            'X-Goog-Upload-Header-Content-Length': String(file.size),
            'X-Goog-Upload-Header-Content-Type': file.type || 'audio/mpeg',
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

    // Step 2: Upload the file bytes
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

    // Step 3: Poll until file state is ACTIVE
    let attempts = 0;
    while (attempts < 30) {
        const statusRes = await fetch(`${GEMINI_API_URL}/${fileName}?key=${apiKey}`);
        const statusData = await statusRes.json();

        if (statusData.state === 'ACTIVE') {
            onProgress?.(0.5);
            return fileUri;
        }
        if (statusData.state === 'FAILED') {
            throw new Error('El procesamiento del archivo falló en Gemini');
        }

        await new Promise(r => setTimeout(r, 2000));
        attempts++;
        onProgress?.(0.4 + (attempts / 30) * 0.1);
    }

    throw new Error('Timeout esperando que Gemini procese el archivo');
}

/**
 * Transcribe audio using Gemini's multimodal capabilities
 */
export async function transcribeWithGemini(
    file: File,
    apiKey: string,
    onProgress?: (progress: number) => void
): Promise<string> {
    if (!apiKey) throw new Error('Gemini API Key no configurada');

    // Upload file
    const fileUri = await uploadToGemini(file, apiKey, (p) => onProgress?.(p * 0.5));

    onProgress?.(0.5);

    // Transcribe with Gemini
    const response = await fetch(
        `${GEMINI_API_URL}/models/gemini-2.0-flash:generateContent?key=${apiKey}`,
        {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                contents: [{
                    parts: [
                        {
                            fileData: {
                                mimeType: file.type || 'audio/mpeg',
                                fileUri,
                            },
                        },
                        {
                            text: `Transcribe this audio recording accurately in its original language. Include timestamps in [MM:SS] format for each section or paragraph of speech. Output only the transcription, no additional commentary.`,
                        },
                    ],
                }],
                generationConfig: {
                    temperature: 0.1,
                    maxOutputTokens: 8192,
                },
            }),
        }
    );

    onProgress?.(0.85);

    if (!response.ok) {
        const err = await response.json().catch(() => ({}));
        throw new Error(err?.error?.message || `Error de Gemini (${response.status})`);
    }

    const data = await response.json();
    const text = data.candidates?.[0]?.content?.parts?.[0]?.text;

    if (!text) throw new Error('Gemini no generó transcripción');

    onProgress?.(1);
    return text;
}

/**
 * Organize notes using Gemini (text-only, no file needed)
 */
export async function organizeNotesWithGemini(
    transcription: string,
    apiKey: string,
    onStep?: (step: number) => void
): Promise<string> {
    if (!apiKey) throw new Error('Gemini API Key no configurada');
    if (!transcription) throw new Error('No hay transcripción para organizar');

    onStep?.(1);

    const prompt = `Eres un asistente experto en crear apuntes académicos estructurados. Organiza la siguiente transcripción de audio en apuntes profesionales y claros.

FORMATO DE SALIDA (Markdown):

## Resumen
- [Punto 1: máximo 2 líneas]
- [Punto 2: máximo 2 líneas]
- [Punto 3: máximo 2 líneas]
(3-5 bullets)

## Conceptos Clave
**Término 1**: Breve explicación
**Término 2**: Breve explicación

## Definiciones
> **[Concepto]**: [Definición textual del audio]

## Contenido

### [00:00] Introducción
[Transcripción de esta sección organizada y limpia]

### [MM:SS] [Título de sección]
[Transcripción de esta sección organizada y limpia]

INSTRUCCIONES IMPORTANTES:
- Mantén el lenguaje académico pero claro
- Resalta términos técnicos con **bold**
- Los timestamps deben estar en formato [MM:SS]
- Divide en secciones lógicas cada 3-5 minutos aproximadamente
- Corrige errores gramaticales
- Elimina muletillas y repeticiones innecesarias
- Si no hay definiciones claras, omite la sección de Definiciones

AUDIO TRANSCRITO:

${transcription}

Organiza esta transcripción en apuntes estructurados.`;

    onStep?.(2);

    const response = await fetch(
        `${GEMINI_API_URL}/models/gemini-2.0-flash:generateContent?key=${apiKey}`,
        {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                contents: [{ parts: [{ text: prompt }] }],
                generationConfig: {
                    temperature: 0.3,
                    maxOutputTokens: 8192,
                },
            }),
        }
    );

    onStep?.(3);

    if (!response.ok) {
        const err = await response.json().catch(() => ({}));
        if (response.status === 429) {
            await new Promise(r => setTimeout(r, 5000));
            return organizeNotesWithGemini(transcription, apiKey, onStep);
        }
        throw new Error(err?.error?.message || `Error de Gemini (${response.status})`);
    }

    const data = await response.json();
    onStep?.(4);

    const content = data.candidates?.[0]?.content?.parts?.[0]?.text;
    if (!content) throw new Error('Gemini no generó contenido');

    onStep?.(5);
    return content;
}
