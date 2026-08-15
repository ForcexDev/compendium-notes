import React, { useState, useRef, useEffect } from 'react';
import { useAppStore } from '../../lib/store';
import { processAudioForUpload } from '../../lib/audio-processor';
import { transcribeAudio, organizeNotes } from '../../lib/groq';
import { transcribeWithGemini, transcribeWithGeminiChunked, organizeNotesWithGemini, DURATION_THRESHOLD_CHUNKING, GEMINI_TRANSCRIPTION_MODELS, GEMINI_ASSEMBLY_CHAIN, GEMINI_NOTES_FALLBACK_CHAIN } from '../../lib/gemini';
import { resolveTranscriptionModel } from '../../lib/models';
import { progress } from '../../lib/progress';

export default function DebugMode() {
    const store = useAppStore();

    const [provider, setProvider] = useState<'gemini' | 'groq'>(store.provider || 'gemini');
    const [apiKey, setApiKey] = useState<string>('');
    const [model, setModel] = useState<string>('auto');
    const [summaryLevel, setSummaryLevel] = useState<'short' | 'medium' | 'long'>('medium');
    const [outputLanguage, setOutputLanguage] = useState<string>('es');
    const [file, setFile] = useState<File | null>(null);
    const [isRunning, setIsRunning] = useState<boolean>(false);
    const [logs, setLogs] = useState<string[]>([]);

    const logRef = useRef<HTMLPreElement>(null);

    // Auto-scroll logs
    useEffect(() => {
        if (logRef.current) {
            logRef.current.scrollTop = logRef.current.scrollHeight;
        }
    }, [logs]);

    // Cargar API Key activa del store al inicio
    useEffect(() => {
        const initKey = async () => {
            try {
                const key = await store.activeKey();
                if (key) {
                    setApiKey(key);
                }
            } catch (e) {
                // ignore
            }
        };
        initKey();
    }, [provider]);

    const appendLog = (message: string) => {
        const timestamp = new Date().toISOString();
        const logLine = `[${timestamp}] ${message}`;
        setLogs((prev) => [...prev, logLine]);
    };

    const handleClearLogs = () => {
        setLogs([]);
    };

    const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
        if (e.target.files && e.target.files[0]) {
            const f = e.target.files[0];
            setFile(f);
            appendLog(`FILE SELECTED: "${f.name}", type: ${f.type || 'unknown'}, weight: ${f.size} bytes (${(f.size / (1024 * 1024)).toFixed(2)} MB), lastModified: ${new Date(f.lastModified).toISOString()}`);
        }
    };

    const runDebugPipeline = async () => {
        if (!file) {
            appendLog('ERROR: No file selected for upload.');
            return;
        }

        const activeKey = apiKey.trim();
        if (!activeKey) {
            appendLog('ERROR: API Key is empty.');
            return;
        }

        setIsRunning(true);
        appendLog('================================================================================');
        appendLog(`DEBUG SESSION STARTED at ${new Date().toISOString()} (${Date.now()} ms)`);
        appendLog(`PROVIDER: ${provider.toUpperCase()}`);
        appendLog(`TARGET MODEL: ${model}`);
        appendLog(`API KEY (first/last 4): ${activeKey.slice(0, 4)}...${activeKey.slice(-4)} (length: ${activeKey.length})`);
        appendLog(`FILE: "${file.name}" | Size: ${file.size} bytes (${(file.size / (1024 * 1024)).toFixed(3)} MB) | MIME: ${file.type || 'unknown'}`);
        appendLog('================================================================================');

        // Hook progress listener to capture internal events / retries
        let lastEventCount = 0;
        const unsubscribeProgress = progress.subscribe(() => {
            try {
                const snapshot = progress.getSnapshot();
                if (snapshot && Array.isArray(snapshot.events) && snapshot.events.length > lastEventCount) {
                    for (let i = lastEventCount; i < snapshot.events.length; i++) {
                        const ev = snapshot.events[i];
                        if (ev) {
                            appendLog(`[INTERNAL PROGRESS EVENT - ${ev.kind.toUpperCase()}]: ${ev.text}`);
                        }
                    }
                    lastEventCount = snapshot.events.length;
                }
            } catch (e) {
                // ignore
            }
        });

        // Intercept global window.fetch to log EVERY raw HTTP request and response
        const originalFetch = window.fetch;
        let reqCounter = 0;

        window.fetch = async (input: RequestInfo | URL, init?: RequestInit) => {
            reqCounter++;
            const currentReqId = reqCounter;
            const url = typeof input === 'string' ? input : input instanceof URL ? input.toString() : (input as Request).url;
            const method = init?.method || (typeof input === 'object' && 'method' in input ? input.method : 'GET');
            const sanitizedUrl = url.replace(/key=([^&]+)/, 'key=HIDDEN_API_KEY');
            const startTime = Date.now();

            // Extract body weight & details
            let bodySummary = 'None';
            let parsedBody: any = null;
            if (init?.body) {
                if (typeof init.body === 'string') {
                    bodySummary = `${init.body.length} characters (~${(init.body.length / 1024).toFixed(2)} KB)`;
                    try {
                        parsedBody = JSON.parse(init.body);
                    } catch {
                        parsedBody = init.body.slice(0, 500) + '...';
                    }
                } else if (init.body instanceof FormData) {
                    const entries: string[] = [];
                    init.body.forEach((val, key) => {
                        if (val instanceof File) {
                            entries.push(`${key}: File("${val.name}", size=${val.size} bytes, type=${val.type})`);
                        } else {
                            entries.push(`${key}: "${String(val).slice(0, 100)}"`);
                        }
                    });
                    bodySummary = `FormData [${entries.join(', ')}]`;
                } else if (init.body instanceof Blob) {
                    bodySummary = `Blob (${init.body.size} bytes, type=${init.body.type})`;
                }
            }

            appendLog(`--------------------------------------------------------------------------------
>>> HTTP REQUEST #${currentReqId} SENT:
- URL: ${sanitizedUrl}
- Method: ${method}
- When: ${new Date().toISOString()} (${startTime} ms)
- Headers: ${JSON.stringify(init?.headers || {}, null, 2)}
- Payload Weight / Info: ${bodySummary}
${parsedBody ? `- Payload Preview:\n${JSON.stringify(parsedBody, null, 2)}` : ''}
--------------------------------------------------------------------------------`);

            try {
                const response = await originalFetch(input, init);
                const latency = Date.now() - startTime;
                
                // Clone response to read body without consuming stream for caller
                const responseClone = response.clone();
                let responseBodyText = '';
                try {
                    responseBodyText = await responseClone.text();
                } catch (readErr: any) {
                    responseBodyText = `[Failed to read response body: ${readErr?.message}]`;
                }

                const headersObj: Record<string, string> = {};
                response.headers.forEach((val, key) => {
                    headersObj[key] = val;
                });

                appendLog(`--------------------------------------------------------------------------------
<<< HTTP RESPONSE #${currentReqId} RECEIVED:
- URL: ${sanitizedUrl}
- HTTP Status: ${response.status} ${response.statusText} ${response.status === 503 ? '⚠️ [503 SERVICE UNAVAILABLE / MODEL OVERLOADED]' : response.status === 429 ? '⚠️ [429 RATE LIMIT]' : response.ok ? '✅ [OK]' : '❌ [HTTP ERROR]'}
- When: ${new Date().toISOString()} (Latency: ${latency} ms)
- Response Headers: ${JSON.stringify(headersObj, null, 2)}
- Response Body:
${responseBodyText}
--------------------------------------------------------------------------------`);

                return response;
            } catch (networkErr: any) {
                const latency = Date.now() - startTime;
                appendLog(`--------------------------------------------------------------------------------
<<< HTTP NETWORK ERROR #${currentReqId}:
- URL: ${sanitizedUrl}
- When: ${new Date().toISOString()} (Failed after ${latency} ms)
- Error: ${networkErr?.name}: ${networkErr?.message}
--------------------------------------------------------------------------------`);
                throw networkErr;
            }
        };

        try {
            // -------------------------------------------------------------
            // STEP 1: AUDIO PROCESSING & WEIGHT ANALYSIS
            // -------------------------------------------------------------
            appendLog('--- [STEP 1: AUDIO PROCESSING & ANALYSIS] ---');
            const procStart = Date.now();
            appendLog(`REQUEST SENT: Audio processor start | Input weight: ${file.size} bytes`);
            
            const processed = await processAudioForUpload(
                file,
                (stage, p) => {
                    appendLog(`[AudioProcessor Progress] Stage: ${stage} | Progress: ${(p * 100).toFixed(1)}%`);
                },
                {
                    provider,
                    forceCompression: file.type.startsWith('video/')
                }
            );

            const procDuration = Date.now() - procStart;
            appendLog(`RESPONSE RECEIVED: Audio processed in ${procDuration}ms`);
            appendLog(`PROCESSED AUDIO DETAILS:
- Original size: ${processed.originalSize} bytes (${(processed.originalSize / 1024 / 1024).toFixed(2)} MB)
- Compressed size: ${processed.compressedSize} bytes (${(processed.compressedSize / 1024 / 1024).toFixed(2)} MB)
- Was compressed: ${processed.wasCompressed}
- Was chunked: ${processed.wasChunked}
- Number of chunks: ${processed.chunks.length}
- Duration: ${processed.duration} seconds (${((processed.duration || 0) / 60).toFixed(2)} minutes)
- Chunk metadata: ${JSON.stringify(processed.chunkMetadata || [], null, 2)}`);

            // -------------------------------------------------------------
            // STEP 2: TRANSCRIPTION REQUEST
            // -------------------------------------------------------------
            appendLog('--- [STEP 2: TRANSCRIPTION REQUEST] ---');
            const durationSec = processed.duration || 0;
            const durationMin = durationSec / 60;
            const resolvedModel = resolveTranscriptionModel(provider, model);

            let transcriptionText = '';

            if (provider === 'gemini') {
                const isChunkedStrategy = durationMin >= DURATION_THRESHOLD_CHUNKING;
                const endpoint = 'https://generativelanguage.googleapis.com/v1beta/models/' + (resolvedModel || 'gemini-3.5-flash-lite') + ':streamGenerateContent?alt=sse';
                const uploadEndpoint = 'https://generativelanguage.googleapis.com/upload/v1beta/files';
                
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

                appendLog(`REQUEST SENT (TRANSCRIPTION):
- When: ${new Date().toISOString()} (${Date.now()} ms)
- To what model: ${resolvedModel} (Provider: Google Gemini)
- API Endpoint: ${endpoint}
- Upload Endpoint: ${uploadEndpoint}
- Method: ${isChunkedStrategy ? 'CHUNKED PIPELINE (transcribeWithGeminiChunked)' : 'STANDARD PIPELINE (transcribeWithGemini)'}
- Strategy threshold: >= ${DURATION_THRESHOLD_CHUNKING} min (Current: ${durationMin.toFixed(2)} min)
- Payload / Chunks: ${processed.chunks.length} chunk(s)
- Weight sent: ${processed.chunks.reduce((acc, c) => acc + c.size, 0)} bytes total
- Expected Response: Raw string transcription with chronological [MM:SS] timestamps
- Prompt Sent:
--------------------------------------------------
${transcriptionPrompt}
--------------------------------------------------
- Parameters:
  * temperature: 0.1
  * safetySettings: BLOCK_NONE across all categories
  * duration: ${durationSec}s`);

                const transStart = Date.now();
                if (isChunkedStrategy) {
                    const result = await transcribeWithGeminiChunked(
                        processed.wasChunked ? processed.chunks : processed.chunks[0],
                        activeKey,
                        (p) => {
                            appendLog(`[Gemini Chunked Progress Callback]: ${(p * 100).toFixed(1)}%`);
                        },
                        processed.duration,
                        processed.chunkMetadata,
                        resolvedModel
                    );
                    transcriptionText = result.text;
                    const transDuration = Date.now() - transStart;
                    appendLog(`ANY FINAL TRANSCRIPTION RESPONSE (Gemini Chunked):
- When: ${new Date().toISOString()}
- Latency / Duration: ${transDuration}ms
- Tokens Used: ${result.tokensUsed}
- Raw Transcript Length: ${transcriptionText.length} characters
- Full Transcript:
--------------------------------------------------
${transcriptionText}
--------------------------------------------------`);
                } else {
                    const result = await transcribeWithGemini(
                        processed.chunks[0],
                        activeKey,
                        (p) => {
                            appendLog(`[Gemini Progress Callback]: ${(p * 100).toFixed(1)}%`);
                        },
                        processed.duration || 0,
                        0,
                        resolvedModel
                    );
                    transcriptionText = result.text;
                    const transDuration = Date.now() - transStart;
                    appendLog(`ANY FINAL TRANSCRIPTION RESPONSE (Gemini Standard):
- When: ${new Date().toISOString()}
- Latency / Duration: ${transDuration}ms
- Model Index Used: ${result.modelIndex}
- Tokens Used: ${result.tokensUsed}
- Raw Transcript Length: ${transcriptionText.length} characters
- Full Transcript:
--------------------------------------------------
${transcriptionText}
--------------------------------------------------`);
                }
            } else {
                // GROQ
                const groqEndpoint = 'https://api.groq.com/openai/v1/audio/transcriptions';
                appendLog(`REQUEST SENT (TRANSCRIPTION):
- When: ${new Date().toISOString()} (${Date.now()} ms)
- To what model: ${resolvedModel} (Provider: Groq Whisper)
- API Endpoint: ${groqEndpoint}
- Method: Multipart FormData POST with response_format=verbose_json
- Payload Chunks: ${processed.chunks.length} chunk(s)
- Weight sent: ${processed.chunks.reduce((acc, c) => acc + c.size, 0)} bytes
- Expected Response: JSON verbose_json with text and segment timestamps`);

                const transStart = Date.now();
                transcriptionText = await transcribeAudio(
                    processed.chunks,
                    activeKey,
                    (p) => {
                        appendLog(`[Groq Progress Callback]: ${(p * 100).toFixed(1)}%`);
                    },
                    processed.chunkMetadata?.map((c) => c.endTime - c.startTime),
                    resolvedModel,
                );
                const transDuration = Date.now() - transStart;
                appendLog(`ANY FINAL TRANSCRIPTION RESPONSE (Groq Transcription):
- When: ${new Date().toISOString()}
- Latency / Duration: ${transDuration}ms
- Raw Transcript Length: ${transcriptionText.length} characters
- Full Transcript:
--------------------------------------------------
${transcriptionText}
--------------------------------------------------`);
            }

            // -------------------------------------------------------------
            // STEP 3: NOTE ORGANIZATION / AI SUMMARY REQUEST
            // -------------------------------------------------------------
            appendLog('--- [STEP 3: NOTE ORGANIZATION / SYNTHESIS] ---');
            // Redactar no usa el modelo de transcripción: en Gemini entra la
            // cadena de Flash (una sola petición grande) y, si están sin cuota,
            // se cae a Flash Lite.
            const orgModel = provider === 'gemini'
                ? `${[...GEMINI_ASSEMBLY_CHAIN, ...GEMINI_NOTES_FALLBACK_CHAIN].join(' → ')}`
                : 'llama-3.3-70b-versatile';
            const orgStart = Date.now();

            appendLog(`REQUEST SENT (ORGANIZATION):
- When: ${new Date().toISOString()} (${Date.now()} ms)
- To what model: ${orgModel} (Provider: ${provider.toUpperCase()})
- Method: ${provider === 'gemini' ? 'organizeNotesWithGemini (geminiGenerateWithFallback)' : 'organizeNotes (Groq Chat Completion)'}
- Weight / Input Payload: ${transcriptionText.length} characters (~${Math.round(transcriptionText.length / 4)} tokens)
- Summary Level: ${summaryLevel}
- Output Language: ${outputLanguage}
- Expected Response: Structured Markdown notes with titles, key takeaways, detailed sections, and action items`);

            let notesResult: any;
            if (provider === 'gemini') {
                notesResult = await organizeNotesWithGemini(
                    transcriptionText,
                    activeKey,
                    (step: number) => {
                        appendLog(`[Gemini Organize Step]: ${step}`);
                    },
                    summaryLevel,
                    outputLanguage,
                );
            } else {
                notesResult = await organizeNotes(
                    transcriptionText,
                    activeKey,
                    (step: number) => {
                        appendLog(`[Groq Organize Step]: ${step}`);
                    },
                    summaryLevel,
                    outputLanguage,
                );
            }

            const orgDuration = Date.now() - orgStart;
            appendLog(`ANY FINAL NOTE ORGANIZATION RESPONSE:
- When: ${new Date().toISOString()}
- Latency / Duration: ${orgDuration}ms
- Result Type: ${typeof notesResult}
- Result Content:
--------------------------------------------------
${typeof notesResult === 'string' ? notesResult : JSON.stringify(notesResult, null, 2)}
--------------------------------------------------`);

            appendLog('================================================================================');
            appendLog(`DEBUG SESSION COMPLETED SUCCESSFULLY at ${new Date().toISOString()}`);
            appendLog('================================================================================');

        } catch (err: any) {
            appendLog('================================================================================');
            appendLog(`ANY RESPONSE [ERROR ENCOUNTERED]:
- When: ${new Date().toISOString()} (${Date.now()} ms)
- Error Name: ${err?.name || 'Error'}
- Error Message: ${err?.message || String(err)}
- Error Stack:
${err?.stack || 'No stack trace available'}
- Full Error Object:
${JSON.stringify(err, Object.getOwnPropertyNames(err), 2)}`);
            appendLog('================================================================================');
        } finally {
            window.fetch = originalFetch;
            unsubscribeProgress();
            setIsRunning(false);
        }
    };

    return (
        <div style={{ padding: '20px', fontFamily: 'monospace', fontSize: '13px', background: '#0a0a0a', color: '#e0e0e0', minHeight: '100vh', boxSizing: 'border-box' }}>
            <h1 style={{ margin: '0 0 10px 0', fontSize: '18px', fontWeight: 'bold', color: '#00ff66' }}>
                DEBUG MODE - PURE REQUEST/RESPONSE CONSOLE (WITH RAW HTTP WIRE DUMP)
            </h1>
            <p style={{ margin: '0 0 15px 0', color: '#888' }}>
                Direct upload and execution of the processing pipeline with 100% full wire inspection: every HTTP request, status code (503, 429, 500), response body, retry, and fallback.
            </p>

            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))', gap: '10px', marginBottom: '15px', background: '#141414', padding: '12px', border: '1px solid #333' }}>
                <div>
                    <label style={{ display: 'block', marginBottom: '4px', fontWeight: 'bold' }}>PROVIDER:</label>
                    <select
                        value={provider}
                        onChange={(e) => setProvider(e.target.value as any)}
                        disabled={isRunning}
                        style={{ width: '100%', padding: '6px', background: '#222', color: '#fff', border: '1px solid #444', fontFamily: 'monospace' }}
                    >
                        <option value="gemini">Google Gemini</option>
                        <option value="groq">Groq</option>
                    </select>
                </div>

                <div>
                    <label style={{ display: 'block', marginBottom: '4px', fontWeight: 'bold' }}>API KEY:</label>
                    <input
                        type="password"
                        value={apiKey}
                        onChange={(e) => setApiKey(e.target.value)}
                        placeholder={`Enter ${provider} API Key`}
                        disabled={isRunning}
                        style={{ width: '100%', padding: '6px', background: '#222', color: '#fff', border: '1px solid #444', fontFamily: 'monospace', boxSizing: 'border-box' }}
                    />
                </div>

                <div>
                    <label style={{ display: 'block', marginBottom: '4px', fontWeight: 'bold' }}>MODEL:</label>
                    <select
                        value={model}
                        onChange={(e) => setModel(e.target.value)}
                        disabled={isRunning}
                        style={{ width: '100%', padding: '6px', background: '#222', color: '#fff', border: '1px solid #444', fontFamily: 'monospace' }}
                    >
                        {provider === 'gemini' ? (
                            <>
                                <option value="auto">Auto (3.5 Flash Lite + Fallbacks)</option>
                                <option value="gemini-3.5-flash-lite">gemini-3.5-flash-lite</option>
                                <option value="gemini-3.1-flash-lite">gemini-3.1-flash-lite</option>
                                <option value="gemini-3.7-flash">gemini-3.7-flash</option>
                                <option value="gemini-3.6-flash">gemini-3.6-flash</option>
                                <option value="gemini-3.5-flash">gemini-3.5-flash</option>
                                <option value="gemini-3-flash-preview">gemini-3-flash-preview</option>
                            </>
                        ) : (
                            <>
                                <option value="auto">Auto (whisper-large-v3)</option>
                                <option value="whisper-large-v3">whisper-large-v3</option>
                                <option value="whisper-large-v3-turbo">whisper-large-v3-turbo</option>
                            </>
                        )}
                    </select>
                </div>

                <div>
                    <label style={{ display: 'block', marginBottom: '4px', fontWeight: 'bold' }}>SUMMARY LEVEL:</label>
                    <select
                        value={summaryLevel}
                        onChange={(e) => setSummaryLevel(e.target.value as any)}
                        disabled={isRunning}
                        style={{ width: '100%', padding: '6px', background: '#222', color: '#fff', border: '1px solid #444', fontFamily: 'monospace' }}
                    >
                        <option value="short">Short</option>
                        <option value="medium">Medium</option>
                        <option value="long">Long</option>
                    </select>
                </div>

                <div>
                    <label style={{ display: 'block', marginBottom: '4px', fontWeight: 'bold' }}>OUTPUT LANG:</label>
                    <input
                        type="text"
                        value={outputLanguage}
                        onChange={(e) => setOutputLanguage(e.target.value)}
                        placeholder="es, en, fr..."
                        disabled={isRunning}
                        style={{ width: '100%', padding: '6px', background: '#222', color: '#fff', border: '1px solid #444', fontFamily: 'monospace', boxSizing: 'border-box' }}
                    />
                </div>
            </div>

            <div style={{ marginBottom: '15px', background: '#141414', padding: '12px', border: '1px solid #333' }}>
                <label style={{ display: 'block', marginBottom: '6px', fontWeight: 'bold' }}>UPLOAD FILE:</label>
                <input
                    type="file"
                    onChange={handleFileChange}
                    disabled={isRunning}
                    style={{ display: 'block', marginBottom: '10px', color: '#fff', fontFamily: 'monospace' }}
                />

                <div style={{ display: 'flex', gap: '10px' }}>
                    <button
                        onClick={runDebugPipeline}
                        disabled={isRunning || !file}
                        style={{
                            padding: '8px 16px',
                            background: isRunning ? '#444' : '#00aa44',
                            color: '#fff',
                            border: 'none',
                            cursor: isRunning ? 'not-allowed' : 'pointer',
                            fontWeight: 'bold',
                            fontFamily: 'monospace'
                        }}
                    >
                        {isRunning ? 'RUNNING DEBUG PIPELINE...' : 'START UPLOAD & DEBUG RUN'}
                    </button>

                    <button
                        onClick={handleClearLogs}
                        disabled={isRunning}
                        style={{
                            padding: '8px 16px',
                            background: '#333',
                            color: '#fff',
                            border: 'none',
                            cursor: 'pointer',
                            fontFamily: 'monospace'
                        }}
                    >
                        CLEAR CONSOLE
                    </button>

                    <a
                        href="/app"
                        style={{
                            padding: '8px 16px',
                            background: '#222',
                            color: '#aaa',
                            border: '1px solid #444',
                            textDecoration: 'none',
                            display: 'inline-block',
                            fontFamily: 'monospace'
                        }}
                    >
                        &lt; BACK TO MAIN APP
                    </a>
                </div>
            </div>

            <div>
                <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '6px' }}>
                    <span style={{ fontWeight: 'bold', color: '#00ff66' }}>RAW HTTP &amp; DEBUG OUTPUT STREAM:</span>
                    <span style={{ color: '#888' }}>Lines: {logs.length}</span>
                </div>
                <pre
                    ref={logRef}
                    style={{
                        background: '#050505',
                        color: '#d4d4d4',
                        border: '1px solid #222',
                        padding: '12px',
                        minHeight: '450px',
                        maxHeight: '70vh',
                        overflowY: 'auto',
                        whiteSpace: 'pre-wrap',
                        wordBreak: 'break-word',
                        margin: 0,
                        fontSize: '12px',
                        lineHeight: '1.4'
                    }}
                >
                    {logs.length === 0 ? 'No logs yet. Select file and click "START UPLOAD & DEBUG RUN".' : logs.join('\n')}
                </pre>
            </div>
        </div>
    );
}
