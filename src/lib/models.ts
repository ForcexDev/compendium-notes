/**
 * Resolución del modelo de transcripción elegido.
 *
 * El selector guarda un único valor para los dos proveedores. Al cambiar de
 * proveedor, ese valor dejaba de tener sentido pero seguía viajando en la
 * petición: un id de Gemini acababa en el endpoint de Whisper (400 "modelo no
 * soportado", error definitivo, transcripción entera perdida) y al revés
 * (404 en Gemini, que en modo fijo no reintenta). El desplegable, además,
 * mostraba la primera opción como si estuviera seleccionada, así que el
 * usuario no tenía forma de saberlo.
 *
 * Aquí se valida contra la lista del proveedor activo y, si no encaja, se cae
 * a `auto`, que siempre funciona.
 */

import { GEMINI_TRANSCRIPTION_MODELS } from './gemini';
import { GROQ_TRANSCRIPTION_MODELS } from './groq';

export type Provider = 'groq' | 'gemini';

export function transcriptionModelsFor(provider: Provider): ReadonlyArray<{ id: string; label: string; desc: string }> {
    return provider === 'gemini' ? GEMINI_TRANSCRIPTION_MODELS : GROQ_TRANSCRIPTION_MODELS;
}

/** Id válido para `provider`: el elegido si existe ahí, o `auto`. */
export function resolveTranscriptionModel(provider: Provider, model: string | undefined | null): string {
    if (!model || model === 'auto') return 'auto';
    return transcriptionModelsFor(provider).some((m) => m.id === model) ? model : 'auto';
}
