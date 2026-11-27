import type { TipoBodega } from "@prisma/client";

export const LINEA_ASEO = "ASEO" as const;

export function esProductoCompatibleConBodega(tipoBodega: TipoBodega, lineaProducto: string): boolean {
    return tipoBodega === "ASEO"
        ? lineaProducto === LINEA_ASEO
        : lineaProducto !== LINEA_ASEO;
}

export function filtrarProductosCompatibles<T extends { linea: string }>(
    tipoBodega: TipoBodega,
    productos: readonly T[]
): T[] {
    return productos.filter((producto) => esProductoCompatibleConBodega(tipoBodega, producto.linea));
}

export function obtenerMensajeIncompatibilidad(tipoBodega: TipoBodega): string {
    return tipoBodega === "ASEO"
        ? "El producto no corresponde a una bodega de aseo."
        : "Los productos de aseo solo pueden ingresarse en bodegas de aseo.";
}
