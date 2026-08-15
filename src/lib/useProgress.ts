import { useSyncExternalStore } from 'react';
import { progress, type ProgressSnapshot } from './progress';

/**
 * Suscripción al tracker de progreso.
 *
 * Vive fuera de zustand a propósito: el progreso cambia varias veces por
 * segundo y no debe arrastrar en cada tick a los componentes que sólo miran
 * transcripción, notas o tema.
 */
export function useProgress(): ProgressSnapshot {
    return useSyncExternalStore(progress.subscribe, progress.getSnapshot, progress.getSnapshot);
}
