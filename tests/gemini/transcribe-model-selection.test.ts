import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { transcribeWithGemini, transcribeWithGeminiChunked, GEMINI_MODEL_CHAIN, GEMINI_TRANSCRIPTION_MODELS } from '../../src/lib/gemini';
import { progress } from '../../src/lib/progress';
import { useAppStore } from '../../src/lib/store';
import {
    installMocks, geminiStream, fakeTranscript, audioFile,
    rateLimit, dailyQuota, overloaded, fourChunks, transcriptFor, countGaps
} from '../helpers/mock-gemini';

describe('selector de modelo de transcripción', () => {
    beforeEach(() => {
        progress.resetIdle();
        useAppStore.setState({ transcriptionModel: 'auto' });
    });
    afterEach(() => vi.unstubAllGlobals());

    describe('modo auto (comportamiento por defecto con fallback)', () => {
        it('inicia con el modelo base de la cadena (3.5 Flash Lite)', async () => {
            const ctx = installMocks(() => geminiStream(fakeTranscript(0, 300)));
            const r = await transcribeWithGemini(audioFile(), 'KEY', undefined, 300, 0, 'auto');

            expect(r.text).toContain('[00:00]');
            expect(ctx.calls[0].model).toBe(GEMINI_MODEL_CHAIN[0]);
        });

        it('hace fallback al siguiente modelo si la cuota diaria está agotada', async () => {
            const ctx = installMocks((c) =>
                c.model === GEMINI_MODEL_CHAIN[0] ? dailyQuota() : geminiStream(fakeTranscript(0, 300)));
            const r = await transcribeWithGemini(audioFile(), 'KEY', undefined, 300, 0, 'auto');

            expect(r.text).toContain('[00:00]');
            expect(ctx.calls[0].model).toBe(GEMINI_MODEL_CHAIN[0]);
            expect(ctx.calls[1].model).toBe(GEMINI_MODEL_CHAIN[1]);
        });

        it('hace fallback al siguiente modelo si se agotan los reintentos por saturación', async () => {
            let n = 0;
            const ctx = installMocks(() => (++n <= 3 ? rateLimit(1) : geminiStream(fakeTranscript(0, 300))));
            await transcribeWithGemini(audioFile(), 'KEY', undefined, 300, 0, 'auto');

            const modelos = [...new Set(ctx.calls.map(c => c.model))];
            expect(modelos.length).toBeGreaterThan(1);
            expect(modelos[0]).toBe(GEMINI_MODEL_CHAIN[0]);
            expect(modelos[1]).toBe(GEMINI_MODEL_CHAIN[1]);
        });
    });

    describe('modo modelo elegido: primero ese, pero no sólo ese', () => {
        it('utiliza exclusivamente el modelo seleccionado en transcripción estándar', async () => {
            const fixedModel = 'gemini-3.1-flash-lite';
            const ctx = installMocks(() => geminiStream(fakeTranscript(0, 300)));
            const r = await transcribeWithGemini(audioFile(), 'KEY', undefined, 300, 0, fixedModel);

            expect(r.text).toContain('[00:00]');
            expect(ctx.calls).toHaveLength(1);
            expect(ctx.calls[0].model).toBe(fixedModel);
        });

        it('reintenta con el mismo modelo fijo ante un 429 temporal y triunfa si el reintento responde', async () => {
            const fixedModel = 'gemini-3.1-flash-lite';
            let n = 0;
            const ctx = installMocks(() => (++n === 1 ? rateLimit(1) : geminiStream(fakeTranscript(0, 300))));
            const r = await transcribeWithGemini(audioFile(), 'KEY', undefined, 300, 0, fixedModel);

            expect(r.text).toContain('[00:00]');
            expect(ctx.calls).toHaveLength(2);
            expect(ctx.calls[0].model).toBe(fixedModel);
            expect(ctx.calls[1].model).toBe(fixedModel);
        });

        it('agotados los reintentos, sigue por la cadena en vez de morir', async () => {
            // El contrato cambió a conciencia. Antes, un modelo fijo con 429
            // persistente mataba la ejecución sin tocar los otros cinco: medido
            // contra una tormenta de 503, en automático el audio salía entero y
            // con modelo fijo no salía nada. Un 503 es del servidor, no del
            // modelo elegido.
            const fixedModel = 'gemini-3.1-flash-lite';
            const ctx = installMocks((c) =>
                c.model === fixedModel ? rateLimit(1) : geminiStream(fakeTranscript(0, 300)));

            const r = await transcribeWithGemini(audioFile(), 'KEY', undefined, 300, 0, fixedModel);

            expect(r.text).toContain('[00:00]');
            // El elegido va primero y agota SUS reintentos antes que nadie.
            expect(ctx.calls.slice(0, 3).every(c => c.model === fixedModel)).toBe(true);
            expect(ctx.calls[3].model).not.toBe(fixedModel);
        });

        it('deja constancia en el registro de que cambió de modelo', async () => {
            progress.resetIdle();
            const fixedModel = 'gemini-3.1-flash-lite';
            installMocks((c) =>
                c.model === fixedModel ? overloaded(503) : geminiStream(fakeTranscript(0, 300)));

            await transcribeWithGemini(audioFile(), 'KEY', undefined, 300, 0, fixedModel);

            // Cambiar de modelo a espaldas del usuario sería justo lo contrario
            // de lo que pidió al fijarlo: se dice, y se dice una sola vez.
            const avisos = progress.getSnapshot().events.filter(e => e.kind === 'warn');
            const cambio = avisos.filter(e => e.text.includes(fixedModel) && /continúa|continuing/i.test(e.text));
            expect(cambio).toHaveLength(1);
        });

        it('con la cuota diaria agotada pasa al siguiente en vez de rendirse', async () => {
            const fixedModel = 'gemini-3.1-flash-lite';
            const ctx = installMocks((c) =>
                c.model === fixedModel ? dailyQuota() : geminiStream(fakeTranscript(0, 300)));

            const r = await transcribeWithGemini(audioFile(), 'KEY', undefined, 300, 0, fixedModel);

            expect(r.text).toContain('[00:00]');
            // Esperar no arregla una cuota diaria: se salta sin gastar reintentos.
            expect(ctx.calls[0].model).toBe(fixedModel);
            expect(ctx.calls.filter(c => c.model === fixedModel)).toHaveLength(1);
        });

        it('si de verdad falla todo, sigue fallando y lo dice', async () => {
            const fixedModel = 'gemini-3.1-flash-lite';
            installMocks(() => overloaded(503));

            await expect(transcribeWithGemini(audioFile(), 'KEY', undefined, 300, 0, fixedModel))
                .rejects.toThrow(/saturad/i);
        });

        it('en transcripción por fragmentos (chunked), todos los fragmentos usan el modelo fijo', async () => {
            const fixedModel = 'gemini-3.1-flash-lite';
            const { files, metadata, duration } = fourChunks();
            const ctx = installMocks((call) => geminiStream(transcriptFor(call)));

            const r = await transcribeWithGeminiChunked(files, 'KEY', undefined, duration, metadata, fixedModel);

            expect(r.text).toContain('[00:00]');
            expect(ctx.calls.length).toBeGreaterThan(0);
            expect(ctx.calls.every(c => c.model === fixedModel)).toBe(true);
        });

        it('en chunked, un modelo elegido que se satura no se lleva el audio por delante', async () => {
            const fixedModel = 'gemini-3.1-flash-lite';
            const { files, metadata, duration } = fourChunks();
            const ctx = installMocks((c) =>
                c.model === fixedModel ? overloaded(503) : geminiStream(transcriptFor(c)));

            const r = await transcribeWithGeminiChunked(files, 'KEY', undefined, duration, metadata, fixedModel);

            expect(r.text.length).toBeGreaterThan(0);
            expect(countGaps(r.text)).toBe(0);
            expect(ctx.calls.some(c => c.model !== fixedModel)).toBe(true);
        });

        it('en chunked, si todos los modelos están caídos sí falla', async () => {
            const { files, metadata, duration } = fourChunks();
            installMocks(() => overloaded(503));

            await expect(transcribeWithGeminiChunked(files, 'KEY', undefined, duration, metadata, 'gemini-3.1-flash-lite'))
                .rejects.toThrow();
        }, 60000);
    });

    describe('store & modelos exportados', () => {
        it('sólo ofrece Flash Lite para transcribir: es lo único con cuota para ello', () => {
            expect(GEMINI_TRANSCRIPTION_MODELS[0].id).toBe('auto');
            expect(GEMINI_TRANSCRIPTION_MODELS.length).toBeGreaterThan(1);
            expect(GEMINI_TRANSCRIPTION_MODELS.every(m => m.id === 'auto' || m.id.includes('lite'))).toBe(true);
        });

        it('permite cambiar el modelo de transcripción en el store', () => {
            useAppStore.getState().setTranscriptionModel('gemini-3.1-flash-lite');
            expect(useAppStore.getState().transcriptionModel).toBe('gemini-3.1-flash-lite');

            useAppStore.getState().setTranscriptionModel('auto');
            expect(useAppStore.getState().transcriptionModel).toBe('auto');
        });
    });
});
