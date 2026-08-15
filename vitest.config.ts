import { defineConfig } from 'vitest/config';

export default defineConfig({
    test: {
        // Las librerías bajo prueba (gemini, groq, progress) son agnósticas del
        // DOM: sólo necesitan fetch, File y ReadableStream, que Node ya trae.
        environment: 'node',
        include: ['tests/**/*.test.{ts,tsx}'],
        setupFiles: ['tests/setup-dom.ts'],
        // Aislamiento: gemini.ts guarda estado de cadena entre peticiones y el
        // tracker de progreso es un singleton.
        restoreMocks: true,
        clearMocks: true,
    },
});
