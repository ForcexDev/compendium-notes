// @vitest-environment jsdom
import { describe, it, expect, afterEach, vi } from 'vitest';
import React, { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
/**
 * Framer Motion se sustituye por elementos planos: con `mode="wait"` la palabra
 * nueva no monta hasta que termina la animación de salida, y jsdom no tiene
 * bucle de animación que la termine. Lo que interesa probar aquí es la lógica
 * de rotación, no la librería.
 */
vi.mock('framer-motion', () => ({
    AnimatePresence: ({ children }: any) => children,
    motion: new Proxy({}, {
        get: (_t, tag: string) => ({ children, initial, animate, exit, transition, ...props }: any) =>
            React.createElement(tag, props, children),
    }),
    useReducedMotion: () => false,
}));

import HeroTextRotator from '../../src/components/react/HeroTextRotator';

/**
 * El rotador del hero es lo primero que se ve en la landing. Vive en una isla
 * `client:only`, así que si revienta al hidratar no hay error en servidor:
 * simplemente no aparece nada.
 */
describe('HeroTextRotator', () => {
    let root: Root | null = null;
    let host: HTMLDivElement | null = null;

    const montar = async () => {
        host = document.createElement('div');
        document.body.appendChild(host);
        root = createRoot(host);
        await act(async () => { root!.render(React.createElement(HeroTextRotator)); });
        return host;
    };

    afterEach(async () => {
        if (root) await act(async () => root!.unmount());
        host?.remove();
        root = null; host = null;
        vi.useRealTimers();
    });

    it('monta sin reventar y pinta una palabra', async () => {
        const el = await montar();
        expect(el.textContent?.trim()).not.toBe('');
    });

    it('la palabra es visible (no transparente sobre un fondo inexistente)', async () => {
        const el = await montar();
        const span = el.querySelector('span');
        expect(span).not.toBeNull();
        const style = span!.getAttribute('style') || '';
        if (/text-fill-color:\s*transparent/.test(style)) {
            expect(style).toMatch(/background(-image)?:\s*linear-gradient/);
        }
    });

    it('rota la palabra con el tiempo', async () => {
        vi.useFakeTimers();
        const el = await montar();
        const primera = el.textContent;

        await act(async () => { vi.advanceTimersByTime(3000); });
        expect(el.textContent).not.toBe(primera);
    });

    it('vuelve a la primera palabra tras dar la vuelta a la lista', async () => {
        vi.useFakeTimers();
        const el = await montar();
        const primera = el.textContent;

        // Cinco palabras a 2,8 s cada una.
        await act(async () => { vi.advanceTimersByTime(2800 * 5); });
        expect(el.textContent).toBe(primera);
    });
});
