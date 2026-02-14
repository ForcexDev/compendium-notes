export type Locale = 'es' | 'en';

export const translations = {
    // Nav
    'nav.app': { es: 'Abrir App', en: 'Open App' },
    'nav.config': { es: 'Configuración', en: 'Settings' },

    // Hero
    'hero.title.line1': { es: 'Convierte clases', en: 'Turn lectures' },
    'hero.title.line2': { es: 'en conocimiento', en: 'into knowledge' },
    'hero.subtitle': {
        es: 'Transcribe audio y video con IA. Organiza apuntes automáticamente. Descarga PDFs profesionales.',
        en: 'Transcribe audio and video with AI. Organize notes automatically. Download professional PDFs.',
    },
    'hero.cta.start': { es: 'Comenzar', en: 'Get Started' },
    'hero.cta.how': { es: 'Cómo funciona', en: 'How it works' },

    // Features
    'features.label': { es: 'Características', en: 'Features' },
    'features.title': { es: 'Todo lo que necesitas', en: 'Everything you need' },
    'features.subtitle': {
        es: 'De audio/video a apuntes profesionales en minutos.',
        en: 'From audio/video to professional notes in minutes.',
    },
    'features.transcribe.title': { es: 'Transcripción Dual', en: 'Dual Transcription' },
    'features.transcribe.desc': {
        es: 'Elige entre la velocidad extrema de Whisper + Llama (Groq) o el razonamiento multimodal de Gemini Flash 2.0.',
        en: 'Choose between Whisper + Llama extreme speed (Groq) or Gemini Flash 2.0 multimodal reasoning.',
    },
    'features.organize.title': { es: 'Organización Inteligente', en: 'Smart Organization' },
    'features.organize.desc': {
        es: 'Detecta temas automáticamente, extrae conceptos clave y genera resúmenes estructurados perfectos.',
        en: 'Automatically detects topics, extracts key concepts, and generates structured perfect summaries.',
    },
    'features.export.title': { es: 'Exportación Premium', en: 'Premium Export' },
    'features.export.desc': {
        es: 'Obtén documentos PDF limpios, paginados y con formato académico listos para imprimir o estudiar.',
        en: 'Get clean, paginated, and academically formatted PDF documents ready to print or study.',
    },

    // How it works
    'how.label': { es: 'Proceso', en: 'Process' },
    'how.title': { es: 'Así de simple', en: 'Simple as that' },
    'how.step1.title': { es: 'Elige tu IA', en: 'Choose your AI' },
    'how.step1.desc': {
        es: 'Usa una API Key gratuita de Groq o Google Gemini.',
        en: 'Use a free Groq or Google Gemini API Key.',
    },
    'how.step2.title': { es: 'Sube tu archivo', en: 'Upload your file' },
    'how.step2.desc': {
        es: 'Arrastra tu grabación. MP3, MP4, WAV y más.',
        en: 'Drag your recording. MP3, MP4, WAV and more.',
    },
    'how.step3.title': { es: 'La IA organiza', en: 'AI organizes' },
    'how.step3.desc': {
        es: 'Transcripción y organización automática con IA.',
        en: 'Automatic transcription and organization with AI.',
    },
    'how.step4.title': { es: 'Descarga PDF', en: 'Download PDF' },
    'how.step4.desc': {
        es: 'Edita y descarga un PDF profesional.',
        en: 'Edit and download a professional PDF.',
    },

    // Pricing
    'pricing.label': { es: 'Precio', en: 'Pricing' },
    'pricing.title': { es: 'Elige tu Motor', en: 'Choose your Engine' },
    'pricing.subtitle': {
        es: 'Ambas opciones son gratuitas con tu propia API Key. Tú tienes el control.',
        en: 'Both options are free with your own API Key. You are in control.',
    },

    // Groq Card
    'pricing.groq.title': { es: 'Velocidad', en: 'Speed' },
    'pricing.groq.desc': { es: 'Ideal para clases estándar (Whisper + Llama)', en: 'Ideal for standard classes (Whisper + Llama)' },
    'pricing.groq.price': { es: '$0', en: '$0' },
    'pricing.groq.f1': { es: 'Modelo Whisper V3 Turbo + Llama', en: 'Whisper V3 Turbo + Llama Model' },
    'pricing.groq.f2': { es: 'Transcripción ultra-rápida', en: 'Ultra-fast transcription' },
    'pricing.groq.f3': { es: 'Mejor para audios < 1 hora', en: 'Best for audios < 1 hour' },
    'pricing.groq.btn': { es: 'Obtener Key de Groq', en: 'Get Groq Key' },

    // Gemini Card
    'pricing.gemini.title': { es: 'Potencia', en: 'Power' },
    'pricing.gemini.desc': { es: 'Para contenido complejo', en: 'For complex content' },
    'pricing.gemini.price': { es: '$0', en: '$0' },
    'pricing.gemini.f1': { es: 'Modelo Gemini Flash 2.0', en: 'Gemini Flash 2.0 Model' },
    'pricing.gemini.f2': { es: 'Contexto masivo (+1h)', en: 'Massive context (+1h)' },
    'pricing.gemini.f3': { es: 'Razonamiento multimodal', en: 'Multimodal reasoning' },
    'pricing.gemini.btn': { es: 'Obtener Key de Gemini', en: 'Get Gemini Key' },

    'pricing.cta.start': { es: 'Comenzar ahora', en: 'Start now' },
    'pricing.cta.key': { es: 'Obtener API Key', en: 'Get API Key' },

    // Footer
    'footer.product': { es: 'Producto', en: 'Product' },
    'footer.resources': { es: 'Recursos', en: 'Resources' },
    'footer.legal': { es: 'Legal', en: 'Legal' },
    'footer.features': { es: 'Características', en: 'Features' },
    'footer.pricing': { es: 'Precios', en: 'Pricing' },
    'footer.docs': { es: 'Documentación', en: 'Documentation' },
    'footer.groq': { es: 'Consola Groq', en: 'Groq Console' },
    'footer.gemini': { es: 'Consola Gemini', en: 'Gemini Console' },
    'footer.github': { es: 'GitHub', en: 'GitHub' },
    'footer.privacy': { es: 'Privacidad', en: 'Privacy' },
    'footer.terms': { es: 'Términos', en: 'Terms' },
    'footer.copyright': { es: 'Smart Class Notes. Open Source.', en: 'Smart Class Notes. Open Source.' },

    // Hero Preview
    'hero.preview.filename': { es: 'clase_calculo.mp3', en: 'calculus_class.mp3' },
    'hero.preview.status': { es: 'Completado', en: 'Completed' },
    'hero.preview.summary': { es: 'Resumen', en: 'Summary' },
    'hero.preview.summary.val': { es: '5 puntos clave', en: '5 key points' },
    'hero.preview.concepts': { es: 'Conceptos', en: 'Concepts' },
    'hero.preview.concepts.val': { es: '12 términos', en: '12 terms' },
    'hero.preview.pdf': { es: 'PDF', en: 'PDF' },
    'hero.preview.pdf.val': { es: '8 páginas', en: '8 pages' },

    // App
    'app.upload.title': { es: 'Sube tu archivo', en: 'Upload your file' },
    'app.upload.subtitle': {
        es: 'Arrastra tu grabación (Audio/Video).',
        en: 'Drag your recording (Audio/Video).',
    },
    'app.upload.drop': { es: 'Arrastra tu archivo o haz click', en: 'Drag your file or click' },
    'app.upload.dropping': { es: 'Suelta tu archivo aquí', en: 'Drop your file here' },
    'app.upload.formats': { es: 'MP3, MP4, WAV, M4A, MOV — Máx. 200MB', en: 'MP3, MP4, WAV, M4A, MOV — Max. 200MB' },
    'app.upload.select': { es: 'Seleccionar archivo', en: 'Select file' },
    'app.upload.transcribe': { es: 'Transcribir con IA', en: 'Transcribe with AI' },
    'app.upload.remove': { es: 'Eliminar archivo', en: 'Remove file' },
    'app.record.start': { es: 'Grabar Audio', en: 'Record Audio' },
    'app.record.stop': { es: 'Detener', en: 'Stop' },
    'app.record.recording': { es: 'Grabando', en: 'Recording' },
    'app.record.cancel': { es: 'Cancelar', en: 'Cancel' },
    'app.transcribing': { es: 'Transcribiendo...', en: 'Transcribing...' },
    'app.transcribing.desc': {
        es: 'Procesando audio rápido con Whisper + Llama 4 Scout',
        en: 'Fast audio processing with Whisper + Llama 4 Scout',
    },
    'app.ai.title': { es: 'Organizando con IA', en: 'Organizing with AI' },
    'app.ai.desc': {
        es: 'Llama 4 Scout está creando tus apuntes',
        en: 'Llama 4 Scout is creating your notes',
    },
    'app.ai.step1': { es: 'Analizando contenido...', en: 'Analyzing content...' },
    'app.ai.step2': { es: 'Extrayendo conceptos clave...', en: 'Extracting key concepts...' },
    'app.ai.step3': { es: 'Generando resumen...', en: 'Generating summary...' },
    'app.ai.step4': { es: 'Estructurando documento...', en: 'Structuring document...' },
    'app.ai.step5': { es: 'Listo', en: 'Done' },
    'app.editor.markdown': { es: 'Editor Markdown', en: 'Markdown Editor' },
    'app.editor.preview': { es: 'Vista previa', en: 'Preview' },
    'app.editor.new': { es: 'Nuevo', en: 'New' },
    'app.editor.start_new': { es: 'Crear nuevo documento', en: 'Create new document' },
    'app.editor.copy': { es: 'Copiar', en: 'Copy' },
    'app.editor.copied': { es: 'Copiado', en: 'Copied' },
    'app.editor.download': { es: 'Descargar PDF', en: 'Download PDF' },
    'app.editor.downloading': { es: 'Generando...', en: 'Generating...' },
    'app.editor.downloaded': { es: 'Descargado', en: 'Downloaded' },
    'app.config.title': { es: 'Configuración', en: 'Settings' },
    'app.config.apikey': { es: 'Groq API Key', en: 'Groq API Key' },
    'app.config.show': { es: 'Mostrar', en: 'Show' },
    'app.config.hide': { es: 'Ocultar', en: 'Hide' },
    'app.config.paste': { es: 'Pegar', en: 'Paste' },
    'app.config.save': { es: 'Guardar', en: 'Save' },
    'app.config.saved': { es: 'Guardada', en: 'Saved' },
    'app.config.privacy': {
        es: 'Tu API key se guarda solo en tu navegador. Nunca la enviamos a ningún servidor.',
        en: 'Your API key is stored only in your browser. We never send it to any server.',
    },
    'app.config.howto': { es: '¿Cómo obtener mi API key?', en: 'How to get my API key?' },
    'app.config.pdfstyle': { es: 'Estilo de PDF', en: 'PDF Style' },
    'app.config.provider': { es: 'Proveedor de IA', en: 'AI Provider' },
    'app.config.groq.get': { es: 'Obtener API Key de Groq', en: 'Get Groq API Key' },
    'app.config.gemini.get': { es: 'Obtener API Key de Gemini', en: 'Get Gemini API Key' },
    'app.config.close': { es: 'Cerrar', en: 'Close' },
    'app.style.minimalista': { es: 'Minimalista', en: 'Minimalist' },
    'app.style.academico': { es: 'Académico', en: 'Academic' },
    'app.style.cornell': { es: 'Cornell', en: 'Cornell' },
    'app.connected': { es: 'Conectada', en: 'Connected' },
    'app.cancel': { es: 'Cancelar', en: 'Cancel' },
    'app.processing': { es: 'Procesando', en: 'Processing' },
    'app.error.apikey': {
        es: 'Configura tu API Key (Groq o Gemini) primero.',
        en: 'Configure your API Key (Groq or Gemini) first.',
    },

    // Privacy
    'privacy.title': { es: 'Política de Privacidad', en: 'Privacy Policy' },
    'privacy.date': { es: 'Última actualización: 13 de febrero de 2026', en: 'Last updated: February 13, 2026' },
    'privacy.intro.title': { es: '1. Introducción', en: '1. Introduction' },
    'privacy.intro.desc': {
        es: 'Smart Class Notes ("nosotros", "nuestro") respeta su privacidad. Esta Política de Privacidad explica cómo recopilamos, usamos y protegemos su información cuando utiliza nuestra aplicación. Su privacidad es nuestra prioridad: operamos bajo un modelo <strong>Bring Your Own Key (BYOK)</strong>, lo que significa que sus datos más sensibles son procesados directamente por los proveedores de IA (Groq/Google) utilizando sus propias credenciales.',
        en: 'Smart Class Notes ("we", "our") respects your privacy. This Privacy Policy explains how we collect, use, and protect your information when you use our application. Your privacy is our priority: we operate under a <strong>Bring Your Own Key (BYOK)</strong> model, meaning your most sensitive data is processed directly by AI providers (Groq/Google) using your own credentials.'
    },
    'privacy.collection.title': { es: '2. Recopilación de Datos', en: '2. Data Collection' },
    'privacy.collection.desc': {
        es: 'No almacenamos sus archivos de audio ni las transcripciones en nuestros servidores. Todo el procesamiento ocurre en su navegador o se envía directamente desde su navegador a las APIs de Groq o Google utilizando su propia API Key.',
        en: 'We do not store your audio files or transcripts on our servers. All processing happens in your browser or is sent directly from your browser to Groq or Google APIs using your own API Key.'
    },
    'privacy.collection.l1': { es: 'API Keys: Se almacenan localmente en su dispositivo (localStorage). Nunca se envían a nuestros servidores.', en: 'API Keys: Stored locally on your device (localStorage). Never sent to our servers.' },
    'privacy.collection.l2': { es: 'Archivos de Audio: Se procesan temporalmente en su navegador para su reproducción y envío a las APIs.', en: 'Audio Files: Processed temporarily in your browser for playback and API transmission.' },
    'privacy.collection.l3': { es: 'Transcripciones y Notas: Se generan y muestran en su navegador. Usted es responsable de guardarlas.', en: 'Transcripts and Notes: Generated and displayed in your browser. You are responsible for saving them.' },
    'privacy.third.title': { es: '3. Uso de Servicios de Terceros', en: '3. Third-Party Services' },
    'privacy.third.desc': {
        es: 'Utilizamos servicios de terceros para el procesamiento de IA. Al usar Smart Class Notes, usted también está sujeto a las políticas de privacidad de:',
        en: 'We use third-party services for AI processing. By using Smart Class Notes, you are also subject to the privacy policies of:'
    },
    'privacy.changes.title': { es: '4. Cambios en esta Política', en: '4. Changes to this Policy' },
    'privacy.changes.desc': {
        es: 'Podemos actualizar nuestra Política de Privacidad de vez en cuando. Le notificaremos de cualquier cambio publicando la nueva política en esta página.',
        en: 'We may update our Privacy Policy from time to time. We will notify you of any changes by posting the new policy on this page.'
    },
    'privacy.contact.title': { es: '5. Contacto', en: '5. Contact' },
    'privacy.contact.desc': {
        es: 'Si tiene preguntas sobre esta Política de Privacidad, por favor contáctenos a través de nuestro repositorio en GitHub.',
        en: 'If you have questions about this Privacy Policy, please contact us via our GitHub repository.'
    },
    'privacy.back': { es: 'Volver al inicio', en: 'Back to home' },

    // Terms
    'terms.title': { es: 'Términos de Servicio', en: 'Terms of Service' },
    'terms.date': { es: 'Última actualización: 13 de febrero de 2026', en: 'Last updated: February 13, 2026' },
    'terms.acceptance.title': { es: '1. Aceptación de los Términos', en: '1. Acceptance of Terms' },
    'terms.acceptance.desc': {
        es: 'Al acceder y utilizar Smart Class Notes, usted acepta estar sujeto a estos Términos de Servicio. Si no está de acuerdo con alguna parte de estos términos, no debe utilizar nuestro servicio.',
        en: 'By accessing and using Smart Class Notes, you agree to be bound by these Terms of Service. If you do not agree to any part of these terms, you must not use our service.'
    },
    'terms.desc.title': { es: '2. Descripción del Servicio', en: '2. Service Description' },
    'terms.desc.desc': {
        es: 'Smart Class Notes es una herramienta que permite a los usuarios transcribir y organizar notas de audio utilizando inteligencia artificial. El servicio se proporciona "tal cual" y "según disponibilidad".',
        en: 'Smart Class Notes is a tool that allows users to transcribe and organize audio notes using artificial intelligence. The service is provided "as is" and "as available".'
    },
    'terms.resp.title': { es: '3. Responsabilidades del Usuario', en: '3. User Responsibilities' },
    'terms.resp.l1': { es: 'Usted es responsable de mantener la confidencialidad de sus API Keys (Groq/Gemini).', en: 'You are responsible for maintaining the confidentiality of your API Keys (Groq/Gemini).' },
    'terms.resp.l2': { es: 'Usted acepta no utilizar el servicio para fines ilegales o no autorizados.', en: 'You agree not to use the service for illegal or unauthorized purposes.' },
    'terms.resp.l3': { es: 'Usted garantiza que tiene los derechos necesarios sobre el contenido de audio que sube para su procesamiento.', en: 'You warrant that you have the necessary rights to the audio content you upload for processing.' },
    'terms.costs.title': { es: '4. Costos y Tarifas', en: '4. Costs and Fees' },
    'terms.costs.desc': {
        es: 'Smart Class Notes es una aplicación de código abierto y de uso gratuito. Sin embargo, el uso de los modelos de IA de terceros (Groq, Google Gemini) puede estar sujeto a los límites y tarifas de sus respectivos proveedores. Usted es responsable de cualquier costo asociado con el uso de sus propias API Keys.',
        en: 'Smart Class Notes is an open-source, free-to-use application. However, the use of third-party AI models (Groq, Google Gemini) may be subject to limits and fees from their respective providers. You are responsible for any costs associated with the use of your own API Keys.'
    },
    'terms.limit.title': { es: '5. Limitación de Responsabilidad', en: '5. Limitation of Liability' },
    'terms.limit.desc': {
        es: 'En ningún caso Smart Class Notes, sus desarrolladores o colaboradores serán responsables de ningún daño directo, indirecto, incidental, especial, consecuente o punitivo que surja de su uso del servicio.',
        en: 'In no event shall Smart Class Notes, its developers, or contributors be liable for any direct, indirect, incidental, special, consequential, or punitive damages arising from your use of the service.'
    },
    'terms.mod.title': { es: '6. Modificaciones', en: '6. Modifications' },
    'terms.mod.desc': {
        es: 'Nos reservamos el derecho de modificar o reemplazar estos Términos en cualquier momento. Es su responsabilidad revisar estos Términos periódicamente para ver si hay cambios.',
        en: 'We reserve the right to modify or replace these Terms at any time. It is your responsibility to review these Terms periodically for changes.'
    },

    // Language toggle
    'lang.switch': { es: 'EN', en: 'ES' },
} as const;

type TranslationKey = keyof typeof translations;

export function t(key: TranslationKey, locale: Locale): string {
    return translations[key]?.[locale] ?? key;
}

export function getLocaleFromBrowser(): Locale {
    if (typeof window === 'undefined') return 'es';
    const stored = localStorage.getItem('scn-lang');
    if (stored === 'en' || stored === 'es') return stored;
    return navigator.language.startsWith('en') ? 'en' : 'es';
}

export function setLocale(locale: Locale): void {
    if (typeof window !== 'undefined') {
        localStorage.setItem('scn-lang', locale);
    }
}
