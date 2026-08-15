import { m as msg } from './progress';

/**
 * Detección de bucles de repetición del modelo.
 *
 * Gemini puede engancharse repitiendo un fragmento ("no, no, no, …") hasta
 * agotar maxOutputTokens: el resultado es basura y, peor, se pierde todo el
 * audio posterior de ese fragmento. La limpieza que había sólo miraba el final
 * del texto y exigía separación por espacios, así que una racha separada por
 * comas pasaba entera al documento.
 *
 * El patrón: una unidad corta (palabra + puntuación) repetida muchas veces.
 */
/**
 * Dos patrones, porque los bucles llegan de dos formas:
 *  - una PALABRA repetida ("no, no, no, …"), que es la habitual y que puede
 *    llevar saltos de línea en medio, así que el separador tiene que ser
 *    flexible o la racha se parte en trozos y se cuela media;
 *  - una FRASE corta repetida literalmente.
 * En ambos casos se exige un mínimo alto de repeticiones: alguien diciendo
 * "sí, sí, sí, sí" es lenguaje normal, no un modelo atascado.
 */
const MIN_REPEATS = 10;
const WORD_RUN = /([^\s,;.:!?]{1,24})(?:[,;.:!?]*\s+)(?:\1[,;.:!?]*\s+){9,}/g;
const PHRASE_RUN = /((?:\S{1,20}[ \t]+){2,6})\1{9,}/g;

/**
 * Racha degenerada al final del texto, para cortar el stream en caliente.
 * Sólo mira una ventana corta: interesa lo que el modelo escribe ahora.
 */
export function tailRepetitionRun(text: string): { unit: string; count: number } | null {
    const tail = text.slice(-4000);
    const anchored = [
        /([^\s,;.:!?]{1,24})(?:[,;.:!?]*\s+)(?:\1[,;.:!?]*\s+){9,}[^\s]{0,24}[,;.:!?]*\s*$/,
        /((?:\S{1,20}[ \t]+){2,6})\1{9,}\S{0,20}\s*$/,
    ];
    for (const re of anchored) {
        const m = tail.match(re);
        if (m) {
            const unit = m[1];
            return { unit, count: Math.max(MIN_REPEATS, Math.floor(m[0].length / Math.max(1, unit.length))) };
        }
    }
    return null;
}

/**
 * Sustituye las rachas degeneradas por dos repeticiones y una marca visible.
 * Se conservan dos porque el bucle suele arrancar dentro de una frase real
 * ("dicen, están caminando, no, no, no…") y cortar en seco la desfigura.
 */
export function stripRepetitionRuns(text: string): { text: string; removed: number } {
    let removed = 0;
    const mark = msg('[…repetición del modelo omitida]', '[…model repetition removed]');

    let out = text.replace(WORD_RUN, (match, word: string) => {
        removed += match.length;
        return `${word}, ${word}, ${mark} `;
    });
    out = out.replace(PHRASE_RUN, (match, phrase: string) => {
        removed += match.length;
        return `${phrase.trim()} ${mark} `;
    });

    return { text: out, removed };
}

/** Último timestamp legible, en texto, para señalar dónde se perdió el audio. */
export function lastTimestampLabel(text: string): string | null {
    const matches = text.match(/\[(\d{1,2}):(\d{2})(?::(\d{2}))?\]/g);
    return matches && matches.length ? matches[matches.length - 1] : null;
}

/**
 * Último timestamp presente en una transcripción parcial, en segundos.
 *
 * Es la señal de progreso más honesta del pipeline: si el modelo acaba de
 * escribir [00:34:10] de un audio de 78 min, va por el 43%. No hace falta
 * estimar nada ni pedir información extra a la API.
 */
export function lastTimestampSeconds(text: string): number | null {
    const matches = text.match(/\[(\d{1,2}):(\d{2})(?::(\d{2}))?\]/g);
    if (!matches || matches.length === 0) return null;
    const last = matches[matches.length - 1];
    const parts = last.slice(1, -1).split(':').map(Number);
    if (parts.some(isNaN)) return null;
    return parts.length === 3
        ? parts[0] * 3600 + parts[1] * 60 + parts[2]
        : parts[0] * 60 + parts[1];
}

/** Segundos → "[MM:SS]" / "[HH:MM:SS]", el formato que usa la transcripción. */
export function secondsToLabel(seconds: number): string {
    const s = Math.max(0, Math.floor(seconds));
    const h = Math.floor(s / 3600);
    const m = Math.floor((s % 3600) / 60);
    const sec = s % 60;
    const pad = (n: number) => String(n).padStart(2, '0');
    return h > 0 ? `[${pad(h)}:${pad(m)}:${pad(sec)}]` : `[${pad(m)}:${pad(sec)}]`;
}
