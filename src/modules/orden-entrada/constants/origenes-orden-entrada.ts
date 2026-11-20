export const ORIGENES_ORDEN_ENTRADA = [
    "Drogueria",
    "Desde Otros Centros",
    "Otros Servicios",
    "Bodega Central",
    "Fondo Global Menor"
] as const;

export type OrigenOrdenEntrada = (typeof ORIGENES_ORDEN_ENTRADA)[number];
