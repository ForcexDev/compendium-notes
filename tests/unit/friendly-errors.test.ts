import { describe, it, expect } from 'vitest';
import { friendlyError } from '../../src/lib/friendly-errors';

/**
 * Lo que ve alguien que no programa cuando algo falla.
 *
 * La pregunta que responde cada caso es la misma: leyendo esto, ¿sabría qué
 * hacer a continuación? Un "429 RESOURCE_EXHAUSTED" no lo dice; "espera unos
 * minutos" o "vuelve mañana", sí.
 */
describe('errores en lenguaje de persona', () => {
    describe('distingue causas que piden acciones distintas', () => {
        it('la cuota diaria no se arregla esperando: no ofrece reintentar', () => {
            const e = friendlyError('El modelo gemini-3.7-flash agotó su cuota diaria (RPD). Inténtalo mañana.', 'es');
            expect(e.title).toMatch(/cuota gratuita de hoy/i);
            expect(e.message).toMatch(/mañana/i);
            expect(e.retryable).toBe(false);
        });

        it('la saturación sí se arregla sola: ofrece reintentar', () => {
            const e = friendlyError('Todos los modelos de Gemini están saturados ahora mismo. (model overloaded)', 'es');
            expect(e.title).toMatch(/saturado/i);
            expect(e.message).toMatch(/unos minutos/i);
            expect(e.retryable).toBe(true);
        });

        it('una clave mala manda a Configuración, no a reintentar', () => {
            const e = friendlyError('API key not valid. Please pass a valid API key.', 'es');
            expect(e.title).toMatch(/clave de API/i);
            expect(e.message).toMatch(/Configuración/i);
            expect(e.retryable).toBe(false);
        });

        it('el límite por minuto pide esperar un momento', () => {
            const e = friendlyError('Límite de Groq alcanzado. Espera un momento.', 'es');
            expect(e.title).toMatch(/límite/i);
            expect(e.retryable).toBe(true);
        });

        it('un archivo ilegible sugiere convertirlo', () => {
            const e = friendlyError('No se pudo decodificar el audio: EncodingError. El archivo puede estar dañado', 'es');
            expect(e.title).toMatch(/no se pudo leer el audio/i);
            expect(e.message).toMatch(/MP3/);
            expect(e.retryable).toBe(false);
        });

        it('un archivo demasiado largo explica la salida', () => {
            const e = friendlyError('El archivo es demasiado largo para procesarlo en el navegador (128 min...)', 'es');
            expect(e.message).toMatch(/MP3|partes más cortas/i);
            expect(e.retryable).toBe(false);
        });

        it('un plazo agotado habla de conexión, no de milisegundos', () => {
            const e = friendlyError('El modelo gemini-3.5-flash-lite no respondió en 600s', 'es');
            expect(e.title).toMatch(/tardado demasiado/i);
            expect(e.message).toMatch(/internet/i);
            expect(e.retryable).toBe(true);
        });

        it('una transcripción vacía pregunta por el audio', () => {
            const e = friendlyError('La transcripción está vacía.', 'es');
            expect(e.message).toMatch(/voz|se oye/i);
        });
    });

    describe('no esconde lo que no entiende', () => {
        it('deja pasar el mensaje original si no reconoce el error', () => {
            const raro = 'Algo muy concreto que nadie previó: CÓDIGO XJ-42';
            expect(friendlyError(raro, 'es').message).toBe(raro);
        });

        it('un error sin texto sigue diciendo algo útil', () => {
            const e = friendlyError('', 'es');
            expect(e.title).toMatch(/no se pudieron crear/i);
            expect(e.message.length).toBeGreaterThan(10);
        });

        it('también sin definir', () => {
            expect(friendlyError(undefined, 'en').title).toMatch(/could not be created/i);
        });
    });

    describe('habla los dos idiomas', () => {
        it('devuelve inglés cuando toca', () => {
            const e = friendlyError('Todos los modelos están saturados', 'en');
            expect(e.title).toMatch(/overloaded/i);
            expect(e.message).toMatch(/few minutes/i);
        });

        it('el orden de las reglas gana a la coincidencia parcial', () => {
            // Contiene "cuota" y "límite": debe elegir la regla de cuota diaria,
            // que es la que da el consejo correcto.
            const e = friendlyError('Límite: cuota diaria agotada', 'es');
            expect(e.title).toMatch(/hoy/i);
            expect(e.retryable).toBe(false);
        });
    });
});
