import { describe, it, expect, beforeEach } from 'vitest';
import { progress, formatEta, formatClock, setProgressLocale } from '../../src/lib/progress';

/**
 * El motor de progreso es lo que el usuario mira mientras espera. Las
 * propiedades que importan: nunca retrocede, el porcentaje global está
 * ponderado por tiempo esperado (no por número de etapas) y siempre hay una
 * señal de vida reciente.
 */
describe('motor de progreso', () => {
    beforeEach(() => {
        progress.resetIdle();
        setProgressLocale('es');
    });

    const arrancar = (stages: any[] = ['prepare', 'upload', 'transcribe', 'organize']) =>
        progress.start({
            provider: 'gemini',
            fileName: 'clase.m4a',
            fileSize: 40 * 1024 * 1024,
            durationSeconds: 4800,
            stages,
            locale: 'es',
        });

    it('empieza en cero con todas las etapas pendientes', () => {
        arrancar();
        const s = progress.getSnapshot();
        expect(s.active).toBe(true);
        expect(s.global).toBe(0);
        expect(s.stages).toHaveLength(4);
        expect(s.stages.every(x => x.status === 'pending')).toBe(true);
    });

    it('pondera por duración esperada, no a partes iguales', () => {
        arrancar();
        progress.beginStage('prepare');
        progress.finishStage('prepare');
        // Si el reparto fuera uniforme, terminar 1 de 4 daría exactamente 25%.
        const global = progress.getSnapshot().global;
        expect(global).toBeGreaterThan(0);
        expect(global).not.toBeCloseTo(0.25, 2);
    });

    it('nunca retrocede', () => {
        arrancar();
        progress.beginStage('transcribe');
        progress.setStage('transcribe', 0.8);
        const alto = progress.getSnapshot().global;
        progress.setStage('transcribe', 0.1);
        expect(progress.getSnapshot().global).toBe(alto);
        expect(progress.getSnapshot().stages.find(s => s.id === 'transcribe')!.progress).toBe(0.8);
    });

    it('llega exactamente a 1 al terminar', () => {
        arrancar();
        progress.finish();
        const s = progress.getSnapshot();
        expect(s.global).toBe(1);
        expect(s.etaMs).toBe(0);
        expect(s.active).toBe(false);
    });

    describe('tablero de fragmentos', () => {
        beforeEach(() => {
            arrancar(['prepare', 'transcribe', 'organize']);
            progress.beginStage('transcribe');
            progress.initChunks([0, 1, 2, 3].map(i => ({ startSec: i * 1200, endSec: (i + 1) * 1200 })));
        });

        it('agrega los segundos cubiertos, incluidos los parciales', () => {
            progress.setChunk(0, 'done');
            progress.setChunk(1, 'active', 0.5);
            const s = progress.getSnapshot();
            // 20 min + la mitad de otros 20 = 30 min de 80.
            expect(s.counters.audioDoneSec).toBeCloseTo(1800, 0);
            expect(s.stages.find(x => x.id === 'transcribe')!.progress).toBeCloseTo(0.375, 3);
        });

        it('describe en qué fragmento va', () => {
            progress.setChunk(0, 'done');
            expect(progress.getSnapshot().detail).toBe('Fragmento 2 de 4');
        });

        it('un fragmento en error no borra lo cubierto', () => {
            progress.setChunk(0, 'done');
            const antes = progress.getSnapshot().counters.audioDoneSec;
            progress.setChunk(1, 'error');
            expect(progress.getSnapshot().counters.audioDoneSec).toBe(antes);
        });
    });

    describe('esperas y señal de vida', () => {
        it('marca la etapa como en espera y guarda el motivo', () => {
            arrancar();
            progress.beginStage('transcribe');
            progress.beginWait(Date.now() + 12_000, 'Modelo saturado');
            const s = progress.getSnapshot();
            expect(s.waitUntil).toBeGreaterThan(Date.now());
            expect(s.waitReason).toBe('Modelo saturado');
            expect(s.stages.find(x => x.id === 'transcribe')!.status).toBe('waiting');
        });

        it('al reanudar vuelve a activa', () => {
            arrancar();
            progress.beginStage('transcribe');
            progress.beginWait(Date.now() + 5_000, 'x');
            progress.endWait();
            const s = progress.getSnapshot();
            expect(s.waitUntil).toBeNull();
            expect(s.stages.find(x => x.id === 'transcribe')!.status).toBe('active');
        });

        it('cualquier señal actualiza lastBeat', async () => {
            arrancar();
            const antes = progress.getSnapshot().lastBeat;
            await new Promise(r => setTimeout(r, 5));
            progress.setStreamCounters(1234);
            expect(progress.getSnapshot().lastBeat).toBeGreaterThan(antes);
        });
    });

    describe('registro de actividad', () => {
        it('acumula eventos con su tipo', () => {
            arrancar();
            progress.pushEvent('warn', 'modelo saturado');
            progress.pushEvent('success', 'audio comprimido');
            const eventos = progress.getSnapshot().events;
            expect(eventos).toHaveLength(2);
            expect(eventos[1]).toMatchObject({ kind: 'success', text: 'audio comprimido' });
        });

        it('no crece sin límite', () => {
            arrancar();
            for (let i = 0; i < 200; i++) progress.pushEvent('info', `evento ${i}`);
            const eventos = progress.getSnapshot().events;
            expect(eventos.length).toBeLessThanOrEqual(40);
            // Se conservan los últimos, que son los relevantes.
            expect(eventos[eventos.length - 1].text).toBe('evento 199');
        });
    });

    it('replan conserva lo ya vivido', () => {
        arrancar();
        progress.beginStage('prepare');
        progress.finishStage('prepare');
        progress.replan(['prepare', 'transcribe', 'organize']);
        const s = progress.getSnapshot();
        expect(s.stages.map(x => x.id)).toEqual(['prepare', 'transcribe', 'organize']);
        expect(s.stages[0].status).toBe('done');
    });

    it('el fallo deja el motivo y detiene el proceso', () => {
        arrancar();
        progress.beginStage('transcribe');
        progress.fail('API Key inválida');
        const s = progress.getSnapshot();
        expect(s.error).toBe('API Key inválida');
        expect(s.active).toBe(false);
        expect(s.stages.find(x => x.id === 'transcribe')!.status).toBe('error');
    });

    it('la ETA aparece cuando hay ritmo medible', async () => {
        arrancar();
        progress.beginStage('transcribe');
        await new Promise(r => setTimeout(r, 30));
        progress.setStage('transcribe', 0.25);
        const eta = progress.getSnapshot().etaMs;
        expect(eta).not.toBeNull();
        expect(eta!).toBeGreaterThan(0);
    });
});

describe('formato para la interfaz', () => {
    it.each([
        [null, null],
        [3_000, 'unos segundos'],
        [45_000, '45 s'],
        [219_000, '3 min 39 s'],
        [1_800_000, '30 min'],
    ])('formatEta(%s) → %s', (ms, esperado) => {
        expect(formatEta(ms as number | null, 'es')).toBe(esperado);
    });

    it('formatEta en inglés', () => {
        expect(formatEta(3_000, 'en')).toBe('a few seconds');
    });

    it.each([
        [0, '0:00'],
        [65_000, '1:05'],
        [3_600_000, '60:00'],
    ])('formatClock(%s) → %s', (ms, esperado) => {
        expect(formatClock(ms as number)).toBe(esperado);
    });
});
