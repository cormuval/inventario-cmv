"use server";

// lib
import { obtenerAlcanceInventario } from "@/shared/lib/inventario-alcance";
import { prisma } from "@/shared/lib/prisma";

// types
import type { StockAlerta } from "@/modules/stock/utils/movimientos";

// utils
import { construirConsultaStock, construirConteoStock, mapearStockConsolidado, type FilaStockSql } from "@/modules/stock/utils/stock-consulta";
import { fechaHoyChile } from "@/shared/utils/filtros-registros";
import { calcularPaginacion, type Paginacion } from "@/shared/utils/paginacion";

export type StockSortKey = "centro" | "bodega" | "producto" | "linea" | "disponible" | "minimo" | "alerta";
export type SortDirection = "asc" | "desc";

export interface ListarStockInput {
    centroId?: string;
    bodegaId?: string;
    busqueda?: string;
    linea?: string;
    bajoMinimo?: boolean;
    porCaducar?: boolean;
    sort?: StockSortKey;
    direction?: SortDirection;
    pagina?: number;
}

export interface StockLoteVista {
    id: string;
    lote: string;
    fechaCaducidad: Date;
    cantidadDisponible: number;
}

export interface StockConsolidadoVista {
    id: string;
    centroId: string;
    centroNombre: string;
    bodegaId: string;
    bodegaNombre: string;
    productoId: number;
    productoDescripcion: string;
    linea: string;
    cantidadDisponible: number;
    stockMinimo: number;
    alerta: StockAlerta;
    diasCaducidadMinimos: number | null;
    lotes: StockLoteVista[];
}

export interface ListarStockResult {
    centros: Awaited<ReturnType<typeof obtenerAlcanceInventario>>["centros"];
    bodegas: Awaited<ReturnType<typeof obtenerAlcanceInventario>>["bodegas"];
    centroId: string | null;
    bodegaId: string | null;
    puedeFiltrarCentro: boolean;
    busqueda: string;
    linea: string;
    lineas: string[];
    bajoMinimo: boolean;
    porCaducar: boolean;
    sort: StockSortKey;
    direction: SortDirection;
    paginacion: Paginacion;
    stocks: StockConsolidadoVista[];
}

export async function listarStock() {
    return prisma.stock.findMany({
        include: {
            producto: true,
            bodega: {
                include: {
                    centro: true
                }
            }
        },
        orderBy: [
            { bodega: { nombre: "asc" } },
            { producto: { descripcion: "asc" } },
            { fechaCaducidad: "asc" }
        ]
    });
}

export async function listarStockConsolidado(input: ListarStockInput = {}): Promise<ListarStockResult> {
    const alcance = await obtenerAlcanceInventario({ centroId: input.centroId, bodegaId: input.bodegaId });
    const busqueda = input.busqueda?.trim() ?? "";
    const linea = input.linea?.trim() ?? "";
    const sort = input.sort ?? "producto";
    const direction = input.direction ?? "asc";
    const bajoMinimo = input.bajoMinimo ?? false;
    const porCaducar = input.porCaducar ?? false;
    const lineas = (await prisma.producto.findMany({
        distinct: ["linea"],
        select: { linea: true },
        orderBy: { linea: "asc" }
    })).map((producto) => producto.linea);
    const base = {
        centros: alcance.centros,
        bodegas: alcance.bodegas,
        centroId: alcance.centroId,
        bodegaId: alcance.bodegaId,
        puedeFiltrarCentro: alcance.puedeFiltrarCentro,
        busqueda,
        linea,
        lineas,
        bajoMinimo,
        porCaducar,
        sort,
        direction
    };

    if (alcance.bodegaIds.length === 0 || alcance.centroIds.length === 0) {
        return { ...base, stocks: [], paginacion: calcularPaginacion(1, 0) };
    }

    const filtros = {
        bodegaIds: alcance.bodegaIds,
        busqueda,
        linea: linea || undefined,
        bajoMinimo,
        porCaducar,
        sort,
        direction,
        hoy: fechaHoyChile()
    };
    const [conteo] = await prisma.$queryRaw<Array<{ total: bigint | number }>>(construirConteoStock(filtros));
    const paginacion = calcularPaginacion(input.pagina ?? 1, Number(conteo?.total ?? 0));
    const filas = await prisma.$queryRaw<FilaStockSql[]>(construirConsultaStock(filtros, paginacion));
    const lotes = filas.length > 0
        ? await prisma.stock.findMany({
              where: { OR: filas.map((fila) => ({ productoId: Number(fila.productoId), bodegaId: fila.bodegaId })) },
              select: { id: true, productoId: true, bodegaId: true, lote: true, fechaCaducidad: true, cantidadDisponible: true }
          })
        : [];

    return { ...base, paginacion, stocks: mapearStockConsolidado(filas, lotes) };
}
