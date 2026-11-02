// utils
import { formatNumber } from "@/shared/utils/format";

export interface ResumenDetalles {
    productos: number;
    unidades: number;
}

export function indexarResumenDetalles(
    grupos: Array<{ ordenId: string; productos: number; unidades: number | null }>
): Map<string, ResumenDetalles> {
    return new Map(grupos.map((grupo) => [grupo.ordenId, { productos: grupo.productos, unidades: grupo.unidades ?? 0 }]));
}

export function formatearResumenDetalles(resumen: ResumenDetalles): string {
    const productos = `${formatNumber(resumen.productos)} ${resumen.productos === 1 ? "producto" : "productos"}`;
    const unidades = `${formatNumber(resumen.unidades)} ${resumen.unidades === 1 ? "unidad" : "unidades"}`;
    return `${productos} · ${unidades}`;
}

