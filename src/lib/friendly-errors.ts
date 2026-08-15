/**
 * Traducción de errores técnicos a lenguaje de persona.
 *
 * Los mensajes que sube el pipeline están escritos para quien programa: "429
 * RESOURCE_EXHAUSTED", "Failed to decode audio", "El modelo gemini-3.7-flash
 * agotó su cuota diaria (RPD)". A quien sólo quiere sus apuntes de clase, eso
 * no le dice ni qué ha pasado ni qué puede hacer.
 *
 * Aquí se reconoce el error por lo que contiene y se devuelven dos cosas: qué
 * ha pasado y qué hacer al respecto. El texto original no se pierde: sigue
 * estando en "Ver detalles" y en la consola, que es donde sirve.
 */

export interface FriendlyError {
    /** Titular corto: qué ha pasado. */
    title: string;
    /** Una o dos frases: por qué y qué hacer. */
    message: string;
    /** Si merece la pena volver a intentarlo tal cual. */
    retryable: boolean;
}

type Rule = {
    match: RegExp;
    es: { title: string; message: string };
    en: { title: string; message: string };
    retryable: boolean;
};

/**
 * El orden importa: gana la primera que encaje. Las causas concretas van antes
 * que las genéricas — "cuota diaria" antes que "cuota", y ambas antes que
 * "límite", porque si no el consejo sería el equivocado.
 */
const RULES: Rule[] = [
    {
        // Cuota diaria agotada: esperar no arregla nada, hay que volver mañana.
        match: /cuota diaria|per day|RPD|agotaron su cuota diaria/i,
        es: {
            title: 'Se acabó la cuota gratuita de hoy',
            message: 'Este modelo no admite más peticiones hasta mañana. Puedes esperar a mañana, elegir otro modelo en Configuración o usar otra clave de API.',
        },
        en: {
            title: "Today's free quota is used up",
            message: 'This model takes no more requests until tomorrow. Wait until tomorrow, pick another model in Settings, or use a different API key.',
        },
        retryable: false,
    },
    {
        // Clave mala: insistir sólo repite el mismo 401.
        match: /API ?key.*(no|not) (es )?válida|invalid.*api ?key|API key not valid|401|403|no es válida/i,
        es: {
            title: 'La clave de API no funciona',
            message: 'Revisa que la clave esté bien copiada en Configuración, y que siga activa en la web del proveedor.',
        },
        en: {
            title: 'The API key is not working',
            message: 'Check that the key is pasted correctly in Settings and that it is still active on the provider’s site.',
        },
        retryable: false,
    },
    {
        // Saturación pasajera: esto sí se arregla solo.
        match: /saturad|overload|high demand|503|502|500|no disponible|unavailable/i,
        es: {
            title: 'El servicio está saturado',
            // La caída es de Google, no del audio ni de la clave, y hay una
            // salida que ya está construida: el otro proveedor. Callársela
            // deja al usuario mirando una pantalla de error con una hora de
            // clase sin transcribir y sin saber que tiene alternativa.
            message: 'No es cosa tuya: los servidores de IA están caídos ahora mismo. Suele arreglarse solo en unos minutos. Si tienes prisa, en Configuración puedes cambiar de proveedor y seguir con el otro.',
        },
        en: {
            title: 'The service is overloaded',
            message: 'This is not your fault: the AI servers are down right now. It usually clears up within a few minutes. If you are in a hurry, you can switch provider in Settings and carry on with the other one.',
        },
        retryable: true,
    },
    {
        match: /límite|limit|429|rate|demasiadas peticiones|too many requests/i,
        es: {
            title: 'Has llegado al límite de peticiones',
            message: 'El proveedor limita cuántas peticiones se pueden hacer por minuto. Espera un momento y vuelve a intentarlo.',
        },
        en: {
            title: 'You have hit the request limit',
            message: 'The provider caps how many requests you can make per minute. Wait a moment and try again.',
        },
        retryable: true,
    },
    {
        match: /no respondió|timeout|tardó demasiado|dejó de enviar|took too long/i,
        es: {
            title: 'El servicio ha tardado demasiado',
            message: 'La conexión se quedó esperando sin respuesta. Comprueba tu internet y vuelve a intentarlo.',
        },
        en: {
            title: 'The service took too long',
            message: 'The connection was left waiting with no reply. Check your internet and try again.',
        },
        retryable: true,
    },
    {
        match: /fallo de red|network|failed to fetch|conexión|connection/i,
        es: {
            title: 'Problema de conexión',
            message: 'No se pudo contactar con el servicio. Comprueba tu conexión a internet y vuelve a intentarlo.',
        },
        en: {
            title: 'Connection problem',
            message: 'The service could not be reached. Check your internet connection and try again.',
        },
        retryable: true,
    },
    {
        // Ya viene con instrucciones concretas desde la capa de audio.
        match: /demasiado largo para procesarlo|too long to process/i,
        es: {
            title: 'El archivo es demasiado largo',
            message: 'No cabe en la memoria del navegador. Conviértelo a MP3 o divídelo en partes más cortas antes de subirlo.',
        },
        en: {
            title: 'The file is too long',
            message: 'It does not fit in the browser’s memory. Convert it to MP3 or split it into shorter parts before uploading.',
        },
        retryable: false,
    },
    {
        match: /demasiado grande|too large|413/i,
        es: {
            title: 'El archivo es demasiado grande',
            message: 'Prueba con una grabación más corta, o cambia a Gemini en Configuración, que admite archivos mayores.',
        },
        en: {
            title: 'The file is too large',
            message: 'Try a shorter recording, or switch to Gemini in Settings, which accepts bigger files.',
        },
        retryable: false,
    },
    {
        match: /decodificar|decode|códec|codec|corrupt|dañado|no soportado|unsupported/i,
        es: {
            title: 'No se pudo leer el audio',
            message: 'El archivo puede estar dañado o en un formato que el navegador no abre. Prueba a convertirlo a MP3.',
        },
        en: {
            title: 'The audio could not be read',
            message: 'The file may be damaged or in a format the browser cannot open. Try converting it to MP3.',
        },
        retryable: false,
    },
    {
        match: /vacía|vacio|empty/i,
        es: {
            title: 'No se entendió nada del audio',
            message: 'La transcripción salió vacía. Comprueba que la grabación tiene voz y que se oye con claridad.',
        },
        en: {
            title: 'Nothing could be heard in the audio',
            message: 'The transcript came out empty. Check that the recording has speech and is audible.',
        },
        retryable: true,
    },
    {
        match: /falta api ?key|api ?key missing|no configurada|configura tu api/i,
        es: {
            title: 'Falta la clave de API',
            message: 'Abre Configuración y pega tu clave de Groq o de Gemini para poder empezar.',
        },
        en: {
            title: 'The API key is missing',
            message: 'Open Settings and paste your Groq or Gemini key to get started.',
        },
        retryable: false,
    },
];

/**
 * Convierte el error crudo del pipeline en algo legible.
 *
 * Si no se reconoce, se devuelve el original: más vale un mensaje técnico que
 * un "ha ocurrido un error" que no dice nada.
 */
export function friendlyError(raw: string | null | undefined, locale: 'es' | 'en'): FriendlyError {
    const text = (raw || '').trim();

    if (!text) {
        return locale === 'es'
            ? { title: 'No se pudieron crear los apuntes', message: 'El proceso se detuvo sin dar un motivo. Vuelve a intentarlo.', retryable: true }
            : { title: 'The notes could not be created', message: 'The process stopped without giving a reason. Please try again.', retryable: true };
    }

    for (const rule of RULES) {
        if (rule.match.test(text)) {
            const t = rule[locale];
            return { title: t.title, message: t.message, retryable: rule.retryable };
        }
    }

    return locale === 'es'
        ? { title: 'No se pudieron crear los apuntes', message: text, retryable: true }
        : { title: 'The notes could not be created', message: text, retryable: true };
}
