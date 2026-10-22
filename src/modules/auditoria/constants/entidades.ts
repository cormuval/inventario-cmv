export const ENTIDADES_AUDITORIA = [
    { value: "OrdenEntrada", label: "Orden de entrada" },
    { value: "OrdenEntradaDetalle", label: "Detalle de orden de entrada" },
    { value: "OrdenSalida", label: "Orden de salida" },
    { value: "OrdenSalidaDetalle", label: "Detalle de orden de salida" },
    { value: "Producto", label: "Producto" },
    { value: "Usuario", label: "Usuario" },
    { value: "Centro", label: "Centro de salud" },
    { value: "Bodega", label: "Bodega" },
    { value: "Unidad", label: "Unidad" }
] as const;

export type EntidadAuditoriaValor = (typeof ENTIDADES_AUDITORIA)[number]["value"];

export const VALORES_ENTIDADES_AUDITORIA = [
    "todas",
    ...ENTIDADES_AUDITORIA.map((e) => e.value)
] as [string, ...string[]];
