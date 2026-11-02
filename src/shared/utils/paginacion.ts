export const TAMANO_PAGINA = 50;

export interface Paginacion {
    pagina: number;
    tamano: number;
    total: number;
    paginasTotales: number;
    skip: number;
    desde: number;
    hasta: number;
}

export type ValorParametro = string | number | null | undefined;

/**
 * Normaliza la página pedida contra el total de filas: nunca menor a 1 ni mayor a la última.
 * `desde`/`hasta` son las posiciones (base 1) que se muestran en "Mostrando 51–100 de 1.234".
 */
export function calcularPaginacion(paginaSolicitada: number, total: number, tamano: number = TAMANO_PAGINA): Paginacion {
    const paginasTotales = Math.max(1, Math.ceil(total / tamano));
    const paginaEntera = Number.isInteger(paginaSolicitada) ? paginaSolicitada : 1;
    const pagina = Math.min(Math.max(1, paginaEntera), paginasTotales);
    const skip = (pagina - 1) * tamano;

    return {
        pagina,
        tamano,
        total,
        paginasTotales,
        skip,
        desde: total === 0 ? 0 : skip + 1,
        hasta: Math.min(skip + tamano, total)
    };
}

export function crearHrefConParametros(ruta: string, parametros: Record<string, ValorParametro>): string {
    const busqueda = new URLSearchParams();

    for (const [clave, valor] of Object.entries(parametros)) {
        if (valor === undefined || valor === null || valor === "") {
            continue;
        }
        busqueda.set(clave, String(valor));
    }

    const texto = busqueda.toString();
    return texto.length > 0 ? `${ruta}?${texto}` : ruta;
}
