import React, { useState, useRef, useEffect } from 'react';
import { Mic, Square, Trash2, Pause, Play, Check, MicOff, RefreshCw, Volume2, VolumeX, Download, Clock } from 'lucide-react';
import { t } from '../../lib/i18n';
import { useAppStore } from '../../lib/store';

export interface AudioRecorderProps {
    onRecordingComplete: (file: File) => void;
    onCancel: () => void;
}

type RecorderState = 'idle' | 'starting' | 'recording' | 'paused' | 'review' | 'denied';

export default function AudioRecorder({ onRecordingComplete, onCancel }: AudioRecorderProps) {
    const { locale } = useAppStore();
    const [state, setState] = useState<RecorderState>('starting');
    const [duration, setDuration] = useState(0);
    const [audioLevel, setAudioLevel] = useState(0);
    const [reviewUrl, setReviewUrl] = useState<string | null>(null);
    const [isPlaying, setIsPlaying] = useState(false);
    const [volume, setVolume] = useState(1);
    const [playbackTime, setPlaybackTime] = useState(0);
    const [playbackDuration, setPlaybackDuration] = useState(0);
    const reviewAudioRef = useRef<HTMLAudioElement | null>(null);

    const mediaRecorderRef = useRef<MediaRecorder | null>(null);
    const chunksRef = useRef<Blob[]>([]);
    const timerRef = useRef<number | null>(null);
    const animationFrameRef = useRef<number | null>(null);
    const analyserRef = useRef<AnalyserNode | null>(null);
    const audioContextRef = useRef<AudioContext | null>(null);
    const streamRef = useRef<MediaStream | null>(null);
    const canvasRef = useRef<HTMLCanvasElement>(null);
    const recordedBlobRef = useRef<Blob | null>(null);
    const elapsedBeforePauseRef = useRef(0);
    const resumeTimeRef = useRef(0);

    useEffect(() => {
        if (state === 'starting') {
            startRecording();
        }
    }, [state]);

    useEffect(() => {
        return () => fullCleanup();
    }, []);

    const startRecording = async () => {
        try {
            const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
            streamRef.current = stream;

            // Setup Audio Context for visualization
            const audioContext = new (window.AudioContext || (window as any).webkitAudioContext)();
            audioContextRef.current = audioContext;
            const source = audioContext.createMediaStreamSource(stream);
            const analyser = audioContext.createAnalyser();
            analyser.fftSize = 256;
            source.connect(analyser);
            analyserRef.current = analyser;

            // Setup Recorder
            const mimeType = getSupportedMimeType();
            const mediaRecorder = new MediaRecorder(stream, { mimeType });
            mediaRecorderRef.current = mediaRecorder;
            chunksRef.current = [];

            mediaRecorder.ondataavailable = (e) => {
                if (e.data.size > 0) chunksRef.current.push(e.data);
            };

            mediaRecorder.start(100);
            setState('recording');
            elapsedBeforePauseRef.current = 0;
            resumeTimeRef.current = Date.now();

            // Timer
            timerRef.current = window.setInterval(() => {
                const now = Date.now();
                const elapsed = elapsedBeforePauseRef.current + Math.floor((now - resumeTimeRef.current) / 1000);
                setDuration(elapsed);
            }, 250);

            // Visualizer
            startVisualizer();

        } catch (err: any) {
            console.error('Error accessing microphone:', err);
            if (err.name === 'NotAllowedError' || err.name === 'PermissionDeniedError') {
                setState('denied');
            } else {
                onCancel();
            }
        }
    };

    const startVisualizer = () => {
        const update = () => {
            if (!analyserRef.current) return;
            const dataArray = new Uint8Array(analyserRef.current.frequencyBinCount);
            analyserRef.current.getByteFrequencyData(dataArray);
            const average = dataArray.reduce((acc, val) => acc + val, 0) / dataArray.length;
            setAudioLevel(average);
            animationFrameRef.current = requestAnimationFrame(update);
        };
        update();
    };

    const handlePause = () => {
        if (!mediaRecorderRef.current || mediaRecorderRef.current.state !== 'recording') return;
        mediaRecorderRef.current.pause();
        // Save elapsed time
        elapsedBeforePauseRef.current += Math.floor((Date.now() - resumeTimeRef.current) / 1000);
        if (timerRef.current) clearInterval(timerRef.current);
        if (animationFrameRef.current) cancelAnimationFrame(animationFrameRef.current);
        setState('paused');
    };

    const handleResume = () => {
        if (!mediaRecorderRef.current || mediaRecorderRef.current.state !== 'paused') return;
        mediaRecorderRef.current.resume();
        resumeTimeRef.current = Date.now();

        // Resume timer
        timerRef.current = window.setInterval(() => {
            const elapsed = elapsedBeforePauseRef.current + Math.floor((Date.now() - resumeTimeRef.current) / 1000);
            setDuration(elapsed);
        }, 250);

        // Resume visualizer
        startVisualizer();
        setState('recording');
    };

    const handleStop = () => {
        if (timerRef.current) clearInterval(timerRef.current);
        if (animationFrameRef.current) cancelAnimationFrame(animationFrameRef.current);

        if (mediaRecorderRef.current && mediaRecorderRef.current.state !== 'inactive') {
            mediaRecorderRef.current.stop();
        }

        // Wait for last chunk, then enter review
        setTimeout(() => {
            const mimeType = getSupportedMimeType();
            const blob = new Blob(chunksRef.current, { type: mimeType });
            recordedBlobRef.current = blob;

            const url = URL.createObjectURL(blob);
            setReviewUrl(url);
            setState('review');

            // Stop mic stream
            streamRef.current?.getTracks().forEach(track => track.stop());
            if (audioContextRef.current && audioContextRef.current.state !== 'closed') {
                audioContextRef.current.close().catch(console.error);
            }
        }, 200);
    };

    const handleUseRecording = () => {
        if (!recordedBlobRef.current) return;
        const mimeType = getSupportedMimeType();
        let extension = 'webm';
        if (mimeType.includes('mp4')) extension = 'm4a';
        else if (mimeType.includes('ogg')) extension = 'ogg';
        else if (mimeType.includes('wav')) extension = 'wav';

        const file = new File(
            [recordedBlobRef.current],
            `recording_${new Date().toISOString()}.${extension}`,
            { type: mimeType }
        );
        fullCleanup();
        onRecordingComplete(file);
    };

    const handleDiscard = () => {
        fullCleanup();
        onCancel();
    };

    const handleRetry = () => {
        setState('starting');
    };

    const fullCleanup = () => {
        if (timerRef.current) clearInterval(timerRef.current);
        if (animationFrameRef.current) cancelAnimationFrame(animationFrameRef.current);

        streamRef.current?.getTracks().forEach(track => track.stop());
        if (audioContextRef.current && audioContextRef.current.state !== 'closed') {
            audioContextRef.current.close().catch(console.error);
        }
        if (reviewUrl) URL.revokeObjectURL(reviewUrl);
    };

    const getSupportedMimeType = () => {
        const types = [
            'audio/webm;codecs=opus',
            'audio/mp4',
            'audio/ogg;codecs=opus',
            'audio/webm',
            'audio/wav'
        ];
        for (const type of types) {
            if (MediaRecorder.isTypeSupported(type)) return type;
        }
        return 'audio/webm';
    };

    const formatTime = (sec: number) => {
        const m = Math.floor(sec / 60);
        const s = Math.floor(sec % 60);
        return `${m}:${s.toString().padStart(2, '0')}`;
    };

    // Canvas visualizer effect
    useEffect(() => {
        if (!analyserRef.current || !canvasRef.current || state !== 'recording') return;

        const canvas = canvasRef.current;
        const ctx = canvas.getContext('2d');
        if (!ctx) return;

        let animationId: number;
        const analyser = analyserRef.current;
        const bufferLength = analyser.frequencyBinCount;
        const dataArray = new Uint8Array(bufferLength);

        const draw = () => {
            animationId = requestAnimationFrame(draw);
            analyser.getByteFrequencyData(dataArray);

            ctx.clearRect(0, 0, canvas.width, canvas.height);

            const barWidth = (canvas.width / bufferLength) * 2.5;
            let x = 0;

            const gradient = ctx.createLinearGradient(0, 0, 0, canvas.height);
            gradient.addColorStop(0, 'rgba(167, 139, 250, 0.8)');
            gradient.addColorStop(1, 'rgba(139, 92, 246, 1)');
            ctx.fillStyle = gradient;

            for (let i = 0; i < bufferLength; i++) {
                const barHeight = (dataArray[i] / 255) * canvas.height;
                ctx.beginPath();
                if (typeof ctx.roundRect === 'function') {
                    ctx.roundRect(x, canvas.height - barHeight, barWidth, barHeight, [4, 4, 0, 0]);
                } else {
                    ctx.fillRect(x, canvas.height - barHeight, barWidth, barHeight);
                }
                ctx.fill();
                x += barWidth + 2;
            }
        };

        draw();

        return () => {
            if (animationId) cancelAnimationFrame(animationId);
        };
    }, [state]);

    // --- DENIED STATE ---
    if (state === 'denied') {
        return (
            <div className="flex flex-col items-center justify-center gap-5 py-8 w-full animate-in fade-in duration-300">
                <div className="w-16 h-16 rounded-full flex items-center justify-center" style={{ background: 'rgba(239, 68, 68, 0.1)' }}>
                    <MicOff size={28} style={{ color: '#ef4444' }} />
                </div>
                <div className="text-center space-y-1">
                    <p className="text-sm font-medium" style={{ color: 'var(--text-primary)' }}>
                        {t('app.record.denied', locale)}
                    </p>
                    <p className="text-xs" style={{ color: 'var(--text-muted)' }}>
                        {locale === 'es'
                            ? 'Permite el acceso al micrófono en la configuración del navegador'
                            : 'Allow microphone access in browser settings'}
                    </p>
                </div>
                <div className="flex items-center gap-3 w-full max-w-xs">
                    <button
                        onClick={handleDiscard}
                        className="btn-ghost w-full justify-center text-xs py-3 rounded-lg flex items-center gap-2"
                    >
                        <Trash2 size={16} />
                        {t('app.record.cancel', locale)}
                    </button>
                    <button
                        onClick={handleRetry}
                        className="btn-filled w-full justify-center text-xs py-3 rounded-lg flex items-center gap-2"
                    >
                        <RefreshCw size={16} />
                        {t('app.record.retry', locale)}
                    </button>
                </div>
            </div>
        );
    }

    // Smooth playback progress sync
    useEffect(() => {
        let frameId: number;
        const updateProgress = () => {
            if (reviewAudioRef.current) setPlaybackTime(reviewAudioRef.current.currentTime);
            if (isPlaying) frameId = requestAnimationFrame(updateProgress);
        };
        if (isPlaying && state === 'review') {
            frameId = requestAnimationFrame(updateProgress);
        }
        return () => {
            if (frameId) cancelAnimationFrame(frameId);
        };
    }, [isPlaying, state]);

    // --- REVIEW STATE ---
    if (state === 'review' && reviewUrl) {
        const togglePlayback = () => {
            const audio = reviewAudioRef.current;
            if (!audio) return;

            if (isPlaying) {
                audio.pause();
                setIsPlaying(false);
            } else {
                audio.play().then(() => {
                    setIsPlaying(true);
                }).catch((err: any) => {
                    console.error('Play failed:', err);
                });
            }
        };

        const handleSeek = (e: React.MouseEvent<HTMLDivElement>) => {
            if (!reviewAudioRef.current || !playbackDuration) return;
            const rect = e.currentTarget.getBoundingClientRect();
            const pct = Math.max(0, Math.min(1, (e.clientX - rect.left) / rect.width));
            reviewAudioRef.current.currentTime = pct * playbackDuration;
            setPlaybackTime(pct * playbackDuration);
        };

        const handleAudioLoadedMetadata = () => {
            const audio = reviewAudioRef.current;
            if (!audio) return;
            if (audio.duration === Infinity || isNaN(audio.duration)) {
                audio.currentTime = 1e10; // Forced calculation
                audio.ontimeupdate = () => {
                    audio.ontimeupdate = null;
                    setPlaybackDuration(audio.duration);
                    audio.currentTime = 0;
                };
            } else {
                setPlaybackDuration(audio.duration);
            }
        };

        const pct = playbackDuration > 0 ? (playbackTime / playbackDuration) * 100 : 0;

        return (
            <div className="flex flex-col items-center justify-center gap-5 py-6 w-full animate-in fade-in duration-300">
                <div className="text-center space-y-1">
                    <p className="text-sm font-medium" style={{ color: 'var(--text-primary)' }}>
                        {t('app.record.review', locale)}
                    </p>
                </div>

                {/* Custom Audio Player */}
                <div className="w-full max-w-sm px-4">
                    <div
                        className="flex items-center gap-3 p-3 rounded-xl"
                        style={{ background: 'var(--bg-primary)', border: '1px solid var(--border-subtle)' }}
                    >
                        {/* Play/Pause */}
                        <button
                            onClick={togglePlayback}
                            className="w-9 h-9 rounded-full flex items-center justify-center flex-shrink-0 transition-colors"
                            style={{ background: 'var(--accent)', color: '#fff' }}
                        >
                            {isPlaying ? <Pause size={16} fill="currentColor" /> : <Play size={16} fill="currentColor" style={{ marginLeft: 2 }} />}
                        </button>

                        {/* Progress + Time */}
                        <div className="flex-1 min-w-0">
                            {/* Progress bar */}
                            <div
                                className="h-1.5 rounded-full cursor-pointer relative overflow-hidden"
                                style={{ background: 'var(--bg-tertiary)' }}
                                onClick={handleSeek}
                            >
                                <div
                                    className="absolute inset-y-0 left-0 rounded-full transition-all duration-100"
                                    style={{ width: `${pct}%`, background: 'var(--accent)' }}
                                />
                            </div>
                            {/* Time */}
                            <div className="flex justify-between mt-1.5">
                                <span className="text-[10px] font-mono" style={{ color: 'var(--text-muted)' }}>
                                    {formatTime(Math.floor(playbackTime))}
                                </span>
                                <span className="text-[10px] font-mono" style={{ color: 'var(--text-muted)' }}>
                                    {formatTime(playbackDuration > 0 ? Math.floor(playbackDuration) : duration)}
                                </span>
                            </div>
                        </div>

                        {/* Volume Slider */}
                        <div className="flex items-center gap-1.5 flex-shrink-0 group">
                            {volume === 0 ? <VolumeX size={14} style={{ color: 'var(--text-muted)' }} /> : <Volume2 size={14} style={{ color: 'var(--text-muted)' }} />}
                            <input
                                type="range"
                                min="0" max="1" step="0.01"
                                value={volume}
                                onChange={(e) => {
                                    const v = parseFloat(e.target.value);
                                    setVolume(v);
                                    if (reviewAudioRef.current) reviewAudioRef.current.volume = v;
                                }}
                                className="w-12 sm:w-16 h-1 rounded-full appearance-none bg-[var(--bg-tertiary)] [&::-webkit-slider-thumb]:appearance-none [&::-webkit-slider-thumb]:w-2.5 [&::-webkit-slider-thumb]:h-2.5 [&::-webkit-slider-thumb]:rounded-full [&::-webkit-slider-thumb]:bg-[var(--accent)] cursor-pointer"
                            />
                        </div>
                    </div>
                </div>

                <audio
                    ref={reviewAudioRef}
                    src={reviewUrl}
                    className="hidden"
                    onLoadedMetadata={handleAudioLoadedMetadata}
                    onEnded={() => {
                        setIsPlaying(false);
                        setPlaybackTime(0);
                    }}
                />

                {/* Actions */}
                <div className="grid grid-cols-2 sm:flex sm:flex-row items-center gap-3 w-full max-w-sm mt-2">
                    <button
                        onClick={() => {
                            reviewAudioRef.current?.pause();
                            handleDiscard();
                        }}
                        className="btn-ghost justify-center text-xs py-2.5 rounded-lg flex items-center gap-2 hover:bg-red-500/10 hover:text-red-400"
                    >
                        <Trash2 size={15} />
                        {t('app.record.discard', locale)}
                    </button>
                    <a
                        href={reviewUrl}
                        download={`audio_recording_${new Date().getTime()}.webm`}
                        className="btn-ghost justify-center text-xs py-2.5 rounded-lg flex items-center gap-2"
                    >
                        <Download size={15} />
                        {locale === 'es' ? 'Descargar' : 'Download'}
                    </a>
                    <button
                        onClick={() => {
                            reviewAudioRef.current?.pause();
                            handleUseRecording();
                        }}
                        className="btn-filled col-span-2 sm:flex-1 justify-center text-xs py-2.5 rounded-lg flex items-center gap-2"
                        style={{ background: 'var(--accent)', color: '#fff' }}
                    >
                        <Check size={16} />
                        {t('app.record.use', locale)}
                    </button>
                </div>
            </div>
        );
    }

    // --- RECORDING / PAUSED STATE ---

    return (
        <div className="flex flex-col items-center justify-center gap-6 py-6 w-full animate-in fade-in zoom-in duration-300">
            {/* Minimalist Timer & Status */}
            <div className="text-center space-y-2">
                <div className="flex items-center justify-center gap-3 text-4xl font-mono font-medium tracking-tight" style={{ color: 'var(--text-primary)' }}>
                    <div
                        className={`w-3 h-3 rounded-full ${state === 'paused' ? 'bg-yellow-500' : 'bg-red-500 animate-pulse shadow-[0_0_12px_rgba(239,68,68,0.6)]'}`}
                    />
                    {formatTime(duration)}
                </div>
                <div className="text-[10px] font-bold uppercase tracking-[0.2em] opacity-60" style={{ color: 'var(--text-muted)' }}>
                    {state === 'paused'
                        ? t('app.record.paused', locale)
                        : t('app.record.recording', locale)}
                </div>
            </div>

            {/* Waveform Visualizer */}
            <div className="w-[calc(100%-2rem)] sm:w-full max-w-md h-24 flex items-center justify-center overflow-hidden relative opacity-90 rounded-xl bg-[var(--bg-tertiary)]/30 border border-[var(--border-subtle)]/50 mx-auto">
                {state === 'paused' ? (
                    <div className="flex items-center gap-1.5">
                        <Pause size={16} style={{ color: 'var(--text-muted)' }} />
                        <span className="text-xs" style={{ color: 'var(--text-muted)' }}>
                            {t('app.record.paused', locale)}
                        </span>
                    </div>
                ) : (
                    <canvas
                        ref={canvasRef}
                        width={600}
                        height={120}
                        className="w-full h-full object-cover"
                    />
                )}
            </div>

            {/* Controls */}
            <div className="flex items-center gap-3 mt-4 w-full max-w-sm">
                <button
                    onClick={handleDiscard}
                    className="btn-ghost flex-1 justify-center text-xs py-3 rounded-lg flex items-center gap-2 hover:bg-red-500/10 hover:text-red-400 hover:border-red-500/20"
                    title={t('app.record.cancel', locale)}
                >
                    <Trash2 size={16} />
                    {t('app.record.cancel', locale)}
                </button>

                <button
                    onClick={state === 'paused' ? handleResume : handlePause}
                    className="btn-ghost flex-1 justify-center text-xs py-3 rounded-lg flex items-center gap-2"
                    title={state === 'paused' ? t('app.record.resume', locale) : t('app.record.paused', locale)}
                >
                    {state === 'paused' ? <Play size={16} /> : <Pause size={16} />}
                    {state === 'paused' ? t('app.record.resume', locale) : (locale === 'es' ? 'Pausar' : 'Pause')}
                </button>

                <button
                    onClick={handleStop}
                    className="btn-filled flex-1 justify-center text-xs py-3 rounded-lg flex items-center gap-2 shadow-lg shadow-red-500/20 active:scale-[0.98]"
                    style={{ background: '#ef4444' }}
                >
                    <Square size={16} fill="currentColor" />
                    <span>{t('app.record.stop', locale)}</span>
                </button>
            </div>
        </div>
    );
}
