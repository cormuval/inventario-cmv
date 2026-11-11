export const TIPOS_SALIDA = [
    "Consumo Interno",
    "A otra bodega",
    "A Otros Centros",
    "Merma"
] as const;

export type TipoSalida = (typeof TIPOS_SALIDA)[number];

// La tabla Unidad mezcla servicios clinicos y causales de merma (herencia de AppSheet).
// Mientras no se separe, estas descripciones son las unicas validas para "Merma";
// todas las demas unidades corresponden a destinos de "Consumo Interno".
export const UNIDADES_MERMA = ["Regularización de Bodega", "REAS"] as const;

function normalizarDescripcion(descripcion: string): string {
    return descripcion.normalize("NFD").replace(/[\u0300-\u036f]/g, "").trim().toLowerCase();
}

const UNIDADES_MERMA_NORMALIZADAS = new Set(UNIDADES_MERMA.map(normalizarDescripcion));

export function esUnidadMerma(descripcion: string): boolean {
    return UNIDADES_MERMA_NORMALIZADAS.has(normalizarDescripcion(descripcion));
}

export function clasificarUnidadesSalida(unidades: Array<{ descripcion: string }>): {
    consumo: string[];
    merma: string[];
} {
    const consumo: string[] = [];
    const merma: string[] = [];
    for (const unidad of unidades) {
        (esUnidadMerma(unidad.descripcion) ? merma : consumo).push(unidad.descripcion);
    }
    return { consumo, merma };
}
