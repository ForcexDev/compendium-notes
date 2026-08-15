/**
 * Normalización de duraciones venidas del navegador.
 *
 * `HTMLMediaElement.duration` devuelve `Infinity` en grabaciones WebM sin
 * índice y `NaN` en contenedores que el navegador no sabe medir. Ese valor se
 * propagaba tal cual al troceado, donde `bytes / Infinity` daba fragmentos de
 * cero bytes y un bucle que no avanzaba nunca.
 *
 * Vive en su propio módulo porque lo necesitan tanto la capa de audio como la
 * de red, y no merece la pena que una arrastre a la otra (y a FFmpeg y a
 * lamejs con ella) sólo por cuatro líneas.
 */

/** Devuelve una duración en segundos positiva y finita, o 0 si no se sabe. */
export function sanitizeDuration(value: number | undefined | null): number {
    if (typeof value !== 'number' || !Number.isFinite(value) || value <= 0) return 0;
    return value;
}
