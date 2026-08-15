// @vitest-environment jsdom
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import React, { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';

vi.mock('framer-motion', () => ({
    AnimatePresence: ({ children }: any) => children,
    useReducedMotion: () => true,
    motion: new Proxy({}, {
        get: (_t, tag: string) => ({ children, initial, animate, exit, transition, ...props }: any) =>
            React.createElement(tag, props, children),
    }),
}));

import ProcessingView from '../../src/components/react/ProcessingView';
import { progress } from '../../src/lib/progress';
import { useAppStore } from '../../src/lib/store';

/**
 * Escenario realista: cuatro fragmentos, uno terminado, uno a medias con
 * reintentos y uno caído. Es el estado en el que el registro de actividad se
 * vuelve ilegible sin filtros.
 */
function escenario() {
    // jsdom dice navigator.language = en-US; los textos que se comprueban aquí
    // son los españoles.
    useAppStore.setState({ locale: 'es' });
    progress.resetIdle();
    progress.start({
        provider: 'gemini', fileName: 'clase.m4a', fileSize: 40e6,
        durationSeconds: 4800, stages: ['prepare', 'transcribe', 'organize'], locale: 'es',
    });
    progress.beginStage('prepare');
    progress.pushEvent('success', 'Audio comprimido un 62%');
    progress.finishStage('prepare');

    progress.beginStage('transcribe');
    progress.initChunks([0, 1, 2, 3].map(i => ({ startSec: i * 1200, endSec: (i + 1) * 1200 })));

    progress.setChunk(0, 'done');
    progress.setChunkMeta(0, { model: 'gemini-3.5-flash-lite', attempts: 1, requests: 1, tokens: 4120 });

    progress.setChunk(1, 'active', 0.5);
    progress.setChunkMeta(1, { model: 'gemini-3.5-flash-lite', attempts: 2, requests: 3 });
    progress.pushEvent('retry', 'Reintento 2 de 3', { chunk: 1 });
    progress.pushEvent('warn', 'Incompleto: 50% del audio', { chunk: 1 });

    progress.setChunk(2, 'error');
    progress.setChunkMeta(2, { error: 'Audio corrupto', attempts: 3, requests: 6 });
    progress.pushEvent('warn', 'Falló: Audio corrupto', { chunk: 2 });

    progress.pushEvent('info', 'Transcribiendo 2 fragmentos a la vez');
}

describe('ProcessingView · detalle ordenado', () => {
    let root: Root | null = null;
    let host: HTMLDivElement;

    const montar = async () => {
        host = document.createElement('div');
        document.body.appendChild(host);
        root = createRoot(host);
        await act(async () => { root!.render(React.createElement(ProcessingView)); });
        return host;
    };

    const clic = async (el: Element | null | undefined) => {
        expect(el, 'el elemento buscado no existe').toBeTruthy();
        await act(async () => { (el as HTMLElement).click(); });
    };

    const botonPorTexto = (el: HTMLElement, texto: string | RegExp) =>
        [...el.querySelectorAll('button')].find(b =>
            typeof texto === 'string' ? b.textContent?.trim() === texto : texto.test(b.textContent || ''));

    const fragmentos = (el: HTMLElement) =>
        [...el.querySelectorAll('button')].filter(b => b.getAttribute('aria-label')?.startsWith('Fragmento'));

    /**
     * El detalle técnico ya no está a la vista: la pantalla es para quien sólo
     * quiere sus apuntes, y todo esto vive tras "Ver detalles".
     */
    const abrirDetalles = async (el: HTMLElement) => {
        await clic(botonPorTexto(el, /Ver detalles/));
        return el;
    };

    beforeEach(escenario);
    afterEach(async () => {
        if (root) await act(async () => root!.unmount());
        host?.remove();
        root = null;
    });

    it('enseña los pasos en orden con el estado de cada uno', async () => {
        const el = await abrirDetalles(await montar());
        const texto = el.textContent || '';

        expect(texto.indexOf('Preparar')).toBeLessThan(texto.indexOf('Transcribir'));
        expect(texto.indexOf('Transcribir')).toBeLessThan(texto.indexOf('Organizar'));
        expect(texto).toContain('Listo');        // preparar, terminado
        expect(texto).toContain('Pendiente');    // organizar, sin empezar
    });

    /**
     * El dato que antes no existía: el fragmento en curso ya no está en 0 hasta
     * que termina. El porcentaje sale de los timestamps que emite el modelo.
     */
    it('cada fragmento enseña su tramo de grabación y su avance', async () => {
        const el = await abrirDetalles(await montar());
        const tablero = fragmentos(el);

        expect(tablero).toHaveLength(4);
        expect(tablero[1].textContent).toContain('20:00–40:00');
        expect(tablero[1].textContent).toContain('50%');
        expect(tablero[2].textContent).toContain('falló');
    });

    it('resume cuántos fragmentos y cuántos minutos van', async () => {
        const el = await abrirDetalles(await montar());
        expect(el.textContent).toContain('1/4');
        expect(el.textContent).toMatch(/\d+\/80 min/);
    });

    it('pulsar un fragmento cuenta lo que le pasó', async () => {
        const el = await abrirDetalles(await montar());

        await clic(fragmentos(el)[0]);
        expect(el.textContent).toContain('gemini-3.5-flash-lite');
        expect(el.textContent).toContain('Completado');

        await clic(fragmentos(el)[2]);
        expect(el.textContent).toContain('Falló');
        expect(el.textContent).toContain('Audio corrupto');
    });

    it('al pulsar un fragmento el registro se queda con lo suyo', async () => {
        const el = await abrirDetalles(await montar());
        await clic(fragmentos(el)[1]);

        expect(el.textContent).toContain('Incompleto');
        expect(el.textContent).not.toContain('Falló: Audio corrupto');
        expect(el.textContent).not.toContain('Audio comprimido');
    });

    it('el registro filtra lo que fue mal', async () => {
        const el = await abrirDetalles(await montar());
        await clic(botonPorTexto(el, /Actividad/));
        await clic(botonPorTexto(el, /^Avisos/));

        expect(el.textContent).toContain('Falló: Audio corrupto');
        expect(el.textContent).toContain('Reintento 2 de 3');
        expect(el.textContent).not.toContain('Audio comprimido un 62%');
    });

    it('cuenta los avisos en la cabecera del registro', async () => {
        const el = await abrirDetalles(await montar());
        const cabecera = botonPorTexto(el, /Actividad/);
        expect(cabecera?.textContent).toContain('(5)');   // total de eventos
        expect(cabecera?.textContent).toContain('3');     // avisos y reintentos
    });

    it('cerrado, el registro enseña la última línea', async () => {
        const el = await abrirDetalles(await montar());
        expect(el.textContent).toContain('Transcribiendo 2 fragmentos');
    });
});

/**
 * La superficie que ve alguien que no programa.
 *
 * El encargo fue explícito: la pantalla anterior estaba recargada. Estas
 * pruebas fijan lo que NO debe aparecer sin pedirlo, que es la parte que se
 * rompe sola en cuanto alguien añade "sólo un dato más".
 */
describe('ProcessingView · pantalla para quien no es informático', () => {
    let root: Root | null = null;
    let host: HTMLDivElement;

    const montar = async () => {
        host = document.createElement('div');
        document.body.appendChild(host);
        root = createRoot(host);
        await act(async () => { root!.render(React.createElement(ProcessingView)); });
        return host;
    };

    afterEach(async () => {
        if (root) await act(async () => root!.unmount());
        host?.remove();
        root = null;
    });

    beforeEach(escenario);

    it('dice qué está pasando en una frase, sin jerga', async () => {
        const el = await montar();
        expect(el.textContent).toContain('Escuchando la grabación');
        // Ni nombres de etapa internos ni cuentas de fragmentos a la vista.
        expect(el.textContent).not.toContain('Fragmento 2 de 4');
        expect(el.textContent).not.toContain('gemini-3.5-flash-lite');
    });

    /**
     * Lo granular dicho en lo que el usuario reconoce: minutos de SU clase. Sin
     * esto, la única medida a la vista era un porcentaje que no se sabe de qué.
     */
    it('dice cuánta grabación lleva escuchada', async () => {
        const el = await montar();
        expect(el.textContent).toMatch(/\d+ de 80 minutos transcritos/);
    });

    it('esconde el detalle técnico hasta que se pide', async () => {
        const el = await montar();
        expect(el.textContent).toContain('Ver detalles');
        expect(el.textContent).not.toContain('Actividad');
        expect(el.textContent).not.toContain('Audio corrupto');
    });

    it('el tiempo restante se dice en palabras, no en segundos', async () => {
        const el = await montar();
        expect(el.textContent).toMatch(/Unos \d+ minutos|Menos de un minuto|Ya casi está|Calculando/);
        expect(el.textContent).not.toMatch(/quedan ~/);
    });

    it('tranquiliza en vez de alarmar cuando el proceso es largo', async () => {
        const el = await montar();
        expect(el.textContent).toContain('segundo plano');
    });

    it('al fallar explica la causa en cristiano y ofrece salida', async () => {
        progress.fail('Todos los modelos de Gemini están saturados ahora mismo.');
        const el = await montar();

        expect(el.textContent).toContain('El servicio está saturado');
        expect(el.textContent).toContain('unos minutos');
        // El mensaje crudo no se le echa encima al usuario.
        expect(el.textContent).not.toContain('Todos los modelos de Gemini');

        const botones = [...el.querySelectorAll('button')].map(b => b.textContent?.trim());
        expect(botones).toContain('Reintentar');
        expect(botones).toContain('Volver');
    });

    it('no ofrece reintentar lo que no se arregla reintentando', async () => {
        progress.fail('El modelo gemini-3.7-flash agotó su cuota diaria (RPD).');
        const el = await montar();

        expect(el.textContent).toContain('cuota gratuita de hoy');
        const botones = [...el.querySelectorAll('button')].map(b => b.textContent?.trim());
        expect(botones).not.toContain('Reintentar');
        expect(botones).toContain('Volver');
    });

    it('el detalle técnico sigue ahí para diagnosticar el fallo', async () => {
        progress.fail('Todos los modelos de Gemini están saturados ahora mismo.');
        const el = await montar();

        const pulsar = async (re: RegExp) => {
            const b = [...el.querySelectorAll('button')].find(x => re.test(x.textContent || ''));
            expect(b, `no hay botón que case con ${re}`).toBeTruthy();
            await act(async () => { (b as HTMLElement).click(); });
        };

        await pulsar(/Ver detalles/);
        expect(el.textContent).toContain('Fragmentos');
        expect(el.textContent).toContain('Actividad');

        // Y el registro completo sigue a un clic de distancia.
        await pulsar(/Actividad/);
        expect(el.textContent).toContain('Audio corrupto');
    });
});
