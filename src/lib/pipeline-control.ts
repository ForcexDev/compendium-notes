/**
 * Control central del pipeline: cancelación y red con tiempo límite.
 *
 * Antes cada capa inventaba lo suyo: `cancelProcessing` vaciaba el store pero
 * las peticiones seguían vivas (el usuario cancelaba y, veinte minutos después,
 * la app le tiraba al editor con unos apuntes que ya no quería), y ningún fetch
 * tenía plazo, así que una conexión que se quedaba a medias colgaba el proceso
 * para siempre sin un solo mensaje.
 *
 * Aquí hay una sola señal de cancelación por ejecución, y todo lo que sale a la
 * red la respeta. Las capas de red (gemini.ts, groq.ts) no necesitan recibirla
 * por parámetro: la consultan aquí, que es lo que permite cancelar de verdad
 * sin reescribir doce firmas.
 */

/** Se lanza cuando el usuario cancela. Nunca debe reintentarse ni mostrarse como fallo. */
export class CancelledError extends Error {
    readonly cancelled = true;
    constructor(message = 'Proceso cancelado') {
        super(message);
        this.name = 'CancelledError';
    }
}

export function isCancelledError(e: unknown): boolean {
    return e instanceof CancelledError || (e as any)?.cancelled === true;
}

/** Plazo por defecto de una petición: generoso, pero no infinito. */
export const DEFAULT_TIMEOUT_MS = 120_000;

let controller: AbortController | null = null;

/** Abre una ejecución nueva. Cualquier ejecución anterior se da por cancelada. */
export function beginRun(): AbortSignal {
    controller?.abort();
    controller = new AbortController();
    return controller.signal;
}

/**
 * Cancela la ejecución en curso: aborta las peticiones y despierta las esperas.
 *
 * La señal abortada se CONSERVA a propósito. Si se dejara a null, todo lo que
 * comprueba la cancelación entre paso y paso (`isAborted`, `throwIfCancelled`)
 * volvería a responder "no se ha cancelado" en cuanto terminara la petición que
 * sí se abortó, y el flujo seguiría adelante hasta escribir sus resultados
 * encima de un estado que el usuario ya había descartado. La limpieza la hace
 * `beginRun` al abrir la ejecución siguiente.
 */
export function abortRun(): void {
    controller?.abort();
}

export function currentSignal(): AbortSignal | null {
    return controller?.signal ?? null;
}

export function isAborted(): boolean {
    return controller?.signal.aborted ?? false;
}

/** Corta la ejecución en el siguiente punto de control si el usuario canceló. */
export function throwIfCancelled(): void {
    if (isAborted()) throw new CancelledError();
}

/**
 * Espera cancelable. La versión anterior (`setTimeout` pelado) mantenía viva
 * una cancelación durante todo un backoff de 60 s.
 */
export function sleep(ms: number): Promise<void> {
    return new Promise<void>((resolve, reject) => {
        const signal = currentSignal();
        if (signal?.aborted) return reject(new CancelledError());

        const timer = setTimeout(() => {
            signal?.removeEventListener('abort', onAbort);
            resolve();
        }, ms);

        function onAbort() {
            clearTimeout(timer);
            reject(new CancelledError());
        }

        signal?.addEventListener('abort', onAbort, { once: true });
    });
}

/**
 * `fetch` con plazo y con cancelación. Un plazo agotado se comunica como error
 * de red normal y corriente para que las capas de reintento lo traten como lo
 * que es: algo pasajero que merece otro intento.
 */
export async function fetchWithTimeout(
    url: string,
    init: RequestInit = {},
    opts: { timeoutMs?: number; label?: string } = {},
): Promise<Response> {
    const { timeoutMs = DEFAULT_TIMEOUT_MS, label = 'el servidor' } = opts;

    const run = currentSignal();
    if (run?.aborted) throw new CancelledError();

    const ctrl = new AbortController();
    const onAbort = () => ctrl.abort();
    run?.addEventListener('abort', onAbort, { once: true });

    let timedOut = false;
    const timer = setTimeout(() => { timedOut = true; ctrl.abort(); }, timeoutMs);

    try {
        return await fetch(url, { ...init, signal: ctrl.signal });
    } catch (e: any) {
        if (run?.aborted) throw new CancelledError();
        if (timedOut) {
            throw new Error(`${label} no respondió en ${Math.round(timeoutMs / 1000)}s`);
        }
        throw e;
    } finally {
        clearTimeout(timer);
        run?.removeEventListener('abort', onAbort);
    }
}
