import { prisma } from "@/shared/lib/prisma";

// utils
import { fechaHoyChile } from "@/shared/utils/filtros-registros";

/** Línea de productos que forman el catálogo cerrado de pedidos. */
export const LINEA_ASEO = "ASEO";

/**
 * Bajo este saldo un producto se marca en amarillo y se sugiere pedirlo.
 * Criterio provisorio: la columna StockMinimo de Stock se recalcula en cada entrada
 * (20 % del lote), por lo que no sirve como umbral fijo.
 */
export const UMBRAL_SUGERENCIA_ASEO = 10;

export type EstadoStockAseo = "sin_stock" | "bajo_umbral" | "ok";

export interface ItemCatalogoAseo {
    productoId: number;
    descripcion: string;
    stockDisponible: number;
    estadoStock: EstadoStockAseo;
    sugerido: boolean;
    sugerencia: number;
    cantidadHabitual: number;
}

export interface CatalogoAseoInput {
    centroId: string;
    bodegaId?: string | null;
}

export function clasificarStockAseo(disponible: number): EstadoStockAseo {
    if (disponible <= 0) {
        return "sin_stock";
    }
    return disponible < UMBRAL_SUGERENCIA_ASEO ? "bajo_umbral" : "ok";
}

/** Cantidad sugerida: la habitual de la plantilla o, si no hay, lo que falta para llegar al umbral. */
export function calcularSugerenciaAseo(disponible: number, cantidadHabitual: number): number {
    if (disponible >= UMBRAL_SUGERENCIA_ASEO) {
        return 0;
    }
    return cantidadHabitual > 0 ? cantidadHabitual : UMBRAL_SUGERENCIA_ASEO - Math.max(0, disponible);
}

export async function obtenerCatalogoAseo(input: CatalogoAseoInput): Promise<ItemCatalogoAseo[]> {
    const { centroId, bodegaId } = input;

    const productosAseo = await prisma.producto.findMany({
        where: { linea: LINEA_ASEO, estado: true },
        orderBy: { descripcion: "asc" },
        select: { id: true, descripcion: true }
    });

    if (productosAseo.length === 0) {
        return [];
    }

    const productoIds = productosAseo.map((p) => p.id);
    const bodegaIds = bodegaId
        ? [bodegaId]
        : (await prisma.bodega.findMany({ where: { centroId, estado: true }, select: { id: true } })).map((b) => b.id);

    // Solo lotes vigentes con saldo: un lote vencido no cuenta como existencia disponible.
    const hoy = new Date(`${fechaHoyChile()}T00:00:00.000Z`);
    const [stocks, plantillas] = await Promise.all([
        bodegaIds.length > 0
            ? prisma.stock.groupBy({
                  by: ["productoId"],
                  where: {
                      productoId: { in: productoIds },
                      bodegaId: { in: bodegaIds },
                      cantidadDisponible: { gt: 0 },
                      fechaCaducidad: { gt: hoy }
                  },
                  _sum: { cantidadDisponible: true }
              })
            : Promise.resolve([]),
        prisma.pedidoPlantillaAseo.findMany({
            where: { centroId, productoId: { in: productoIds } },
            select: { productoId: true, cantidadHabitual: true }
        })
    ]);

    const disponiblePorProducto = new Map(stocks.map((s) => [s.productoId, s._sum.cantidadDisponible ?? 0]));
    const habitualPorProducto = new Map(plantillas.map((p) => [p.productoId, p.cantidadHabitual]));

    return productosAseo.map((producto) => {
        const stockDisponible = disponiblePorProducto.get(producto.id) ?? 0;
        const cantidadHabitual = habitualPorProducto.get(producto.id) ?? 0;

        return {
            productoId: producto.id,
            descripcion: producto.descripcion,
            stockDisponible,
            estadoStock: clasificarStockAseo(stockDisponible),
            sugerido: stockDisponible < UMBRAL_SUGERENCIA_ASEO,
            sugerencia: calcularSugerenciaAseo(stockDisponible, cantidadHabitual),
            cantidadHabitual
        };
    });
}
