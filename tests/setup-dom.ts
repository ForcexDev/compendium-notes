/**
 * jsdom no implementa matchMedia, y el store lo consulta al inicializarse para
 * elegir el tema. Se instala aquí porque los imports ESM se elevan: hacerlo
 * dentro del propio test llega tarde.
 */
if (typeof window !== 'undefined' && !window.matchMedia) {
    (window as any).matchMedia = (query: string) => ({
        matches: false,
        media: query,
        onchange: null,
        addEventListener() { },
        removeEventListener() { },
        addListener() { },
        removeListener() { },
        dispatchEvent: () => false,
    });
}

/**
 * React exige esta bandera para que `act()` sincronice las actualizaciones de
 * estado en los tests; sin ella, los temporizadores avanzan pero el render no.
 */
(globalThis as any).IS_REACT_ACT_ENVIRONMENT = true;
