import React, { useState, useRef, useEffect } from 'react';
import { motion } from 'framer-motion';
import { Mic, Square, Trash2, Clock } from 'lucide-react';
import { t } from '../../lib/i18n';
import { useAppStore } from '../../lib/store';

interface AudioRecorderProps {
    onRecordingComplete: (file: File) => void;
    onCancel: () => void;
}

export default function AudioRecorder({ onRecordingComplete, onCancel }: AudioRecorderProps) {
    const { locale } = useAppStore();
    const [isRecording, setIsRecording] = useState(false);
    const [duration, setDuration] = useState(0);
    const [audioLevel, setAudioLevel] = useState(0);

    const mediaRecorderRef = useRef<MediaRecorder | null>(null);
    const chunksRef = useRef<Blob[]>([]);
    const timerRef = useRef<number | null>(null);
    const animationFrameRef = useRef<number | null>(null);
    const analyserRef = useRef<AnalyserNode | null>(null);
    const canvasRef = useRef<HTMLCanvasElement>(null);

    useEffect(() => {
        startRecording();
        return () => stopRecordingCleanup();
    }, []);

    const startRecording = async () => {
        try {
            const stream = await navigator.mediaDevices.getUserMedia({ audio: true });

            // Setup Audio Context for visualization
            const audioContext = new (window.AudioContext || (window as any).webkitAudioContext)();
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

            mediaRecorder.start(100); // 100ms chunks
            setIsRecording(true);

            // Timer
            const startTime = Date.now();
            timerRef.current = window.setInterval(() => {
                setDuration(Math.floor((Date.now() - startTime) / 1000));
            }, 1000);

            // Visualizer Loop
            const updateAudioLevel = () => {
                if (!analyserRef.current) return;
                const dataArray = new Uint8Array(analyserRef.current.frequencyBinCount);
                analyserRef.current.getByteFrequencyData(dataArray);

                // Average level
                const average = dataArray.reduce((acc, val) => acc + val, 0) / dataArray.length;
                setAudioLevel(average); // 0-255

                animationFrameRef.current = requestAnimationFrame(updateAudioLevel);
            };
            updateAudioLevel();

        } catch (err) {
            console.error('Error accessing microphone:', err);
            onCancel();
        }
    };

    const stopRecordingCleanup = () => {
        if (timerRef.current) clearInterval(timerRef.current);
        if (animationFrameRef.current) cancelAnimationFrame(animationFrameRef.current);

        if (mediaRecorderRef.current && mediaRecorderRef.current.state !== 'inactive') {
            mediaRecorderRef.current.stop();
            mediaRecorderRef.current.stream.getTracks().forEach(track => track.stop());
        }
    };

    const getSupportedMimeType = () => {
        const types = ['audio/webm', 'audio/mp4', 'audio/ogg', 'audio/wav'];
        for (const type of types) {
            if (MediaRecorder.isTypeSupported(type)) return type;
        }
        return 'audio/webm'; // Fallback
    };

    const handleStop = () => {
        stopRecordingCleanup();

        // Wait a tiny bit for last chunk
        setTimeout(() => {
            const mimeType = getSupportedMimeType();
            let extension = 'webm';
            if (mimeType.includes('mp4')) extension = 'm4a';
            else if (mimeType.includes('ogg')) extension = 'ogg';
            else if (mimeType.includes('wav')) extension = 'wav';

            const blob = new Blob(chunksRef.current, { type: mimeType });
            const file = new File([blob], `recording_${new Date().toISOString()}.${extension}`, { type: mimeType });
            onRecordingComplete(file);
        }, 200);
    };

    const formatTime = (sec: number) => {
        const m = Math.floor(sec / 60);
        const s = sec % 60;
        return `${m}:${s.toString().padStart(2, '0')}`;
    };

    useEffect(() => {
        if (!analyserRef.current || !canvasRef.current || !isRecording) return;

        const canvas = canvasRef.current;
        const ctx = canvas.getContext('2d');
        if (!ctx) return;

        const analyser = analyserRef.current;
        const bufferLength = analyser.frequencyBinCount;
        const dataArray = new Uint8Array(bufferLength);

        const draw = () => {
            animationFrameRef.current = requestAnimationFrame(draw);
            analyser.getByteFrequencyData(dataArray);

            ctx.clearRect(0, 0, canvas.width, canvas.height);

            const barWidth = (canvas.width / bufferLength) * 2.5;
            let barHeight;
            let x = 0;

            // Gradient for the bars (Purple to Indigo)
            const gradient = ctx.createLinearGradient(0, 0, 0, canvas.height);
            gradient.addColorStop(0, 'rgba(167, 139, 250, 0.8)'); // accent-hover
            gradient.addColorStop(1, 'rgba(139, 92, 246, 1)'); // accent

            ctx.fillStyle = gradient;

            for (let i = 0; i < bufferLength; i++) {
                barHeight = (dataArray[i] / 255) * canvas.height;

                // Draw rounded bars manually or with roundRect
                ctx.beginPath();
                if (typeof ctx.roundRect === 'function') {
                    ctx.roundRect(x, canvas.height - barHeight, barWidth, barHeight, [4, 4, 0, 0]);
                } else {
                    ctx.fillRect(x, canvas.height - barHeight, barWidth, barHeight);
                }
                ctx.fill();

                x += barWidth + 2; // Spacing
            }
        };

        draw();
    }, [isRecording]);

    return (
        <div className="flex flex-col items-center justify-center gap-6 py-6 w-full animate-in fade-in zoom-in duration-300">
            {/* Minimalist Timer & Status */}
            <div className="text-center space-y-2">
                <div className="flex items-center justify-center gap-3 text-4xl font-mono font-medium tracking-tight" style={{ color: 'var(--text-primary)' }}>
                    <div className="w-3 h-3 rounded-full bg-red-500 animate-pulse shadow-[0_0_12px_rgba(239,68,68,0.6)]" />
                    {formatTime(duration)}
                </div>
                <div className="text-[10px] font-bold uppercase tracking-[0.2em] opacity-60" style={{ color: 'var(--text-muted)' }}>
                    {t('app.record.recording', locale)}
                </div>
            </div>

            {/* Clean Waveform Visualizer */}
            <div className="w-[calc(100%-2rem)] sm:w-full max-w-md h-24 flex items-center justify-center overflow-hidden relative opacity-90 rounded-xl bg-[var(--bg-tertiary)]/30 border border-[var(--border-subtle)]/50 mx-auto">
                <canvas
                    ref={canvasRef}
                    width={600}
                    height={120}
                    className="w-full h-full object-cover"
                />
            </div>

            {/* Controls */}
            <div className="flex items-center gap-3 mt-4 w-full max-w-xs">
                <button
                    onClick={onCancel}
                    className="btn-ghost w-full justify-center text-xs py-3 rounded-lg flex items-center gap-2 hover:bg-red-500/10 hover:text-red-400 hover:border-red-500/20"
                    title={t('app.record.cancel', locale)}
                >
                    <Trash2 size={16} />
                    {t('app.record.cancel', locale)}
                </button>

                <button
                    onClick={handleStop}
                    className="btn-filled w-full justify-center text-xs py-3 rounded-lg flex items-center gap-2 shadow-lg shadow-red-500/20 hover:shadow-red-500/30 active:scale-[0.98]"
                    style={{ background: '#ef4444' }}
                >
                    <Square size={16} fill="currentColor" />
                    <span>{t('app.record.stop', locale)}</span>
                </button>
            </div>
        </div>
    );
}
