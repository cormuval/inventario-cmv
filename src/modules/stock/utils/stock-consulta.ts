import { Prisma } from "@prisma/client";

// types
import type { SortDirection, StockConsolidadoVista, StockSortKey } from "@/modules/stock/actions/stock.action";

// utils
import {
    DIAS_ALERTA_CADUCIDAD,
    calcularStockMinimo,
    evaluarAlertaStock,
    filtrarExistenciasVisibles,
    obtenerDiasRestantesCaducidad
} from "@/modules/stock/utils/movimientos";

export const FECHA_SIN_CADUCIDAD = "2099-12-31";
export const DIAS_POR_CADUCAR = 30;

export interface FiltrosConsultaStock {
    bodegaIds: string[];
    busqueda: string;
    linea?: string;
    bajoMinimo: boolean;
    porCaducar: boolean;
    sort: StockSortKey;
    direction: SortDirection;
    hoy: string;
}

export interface FilaStockSql {
    productoId: number;
    bodegaId: string;
    productoDescripcion: string;
    linea: string;
    bodegaNombre: string;
    centroId: string;
    centroNombre: string;
    cantidad: bigint | number;
    caducidadMinima: Date;
}

export interface LoteStockSql {
    id: string;
    productoId: number;
    bodegaId: string;
    lote: string;
    fechaCaducidad: Date;
    cantidadDisponible: number;
}

/** Mínimo por producto × bodega. Ver "Decisión pendiente" en el plan de la fase 2. */
const EXPR_MINIMO = Prisma.sql`CEIL(g.cantidad * 0.1)`;

export function patronLike(texto: string): string {
    return `%${texto.replace(/[\\%_]/g, (caracter) => `\\${caracter}`)}%`;
}

/**
 * Agrupa lotes por producto × bodega con la regla de `filtrarExistenciasVisibles`:
 * suma y caducidad mínima solo de lotes con existencia; si no hay ninguno, el grupo
 * se muestra únicamente cuando tiene un solo lote (fila en 0).
 */
function agrupado(bodegaIds: string[]): Prisma.Sql {
    return Prisma.sql`
        SELECT
            s.ID_Product AS productoId,
            s.ID_Bodega AS bodegaId,
            CAST(SUM(CASE WHEN s.Cantidad_Disponible > 0 THEN s.Cantidad_Disponible ELSE 0 END) AS SIGNED) AS cantidad,
            COALESCE(MIN(CASE WHEN s.Cantidad_Disponible > 0 THEN s.Fecha_Caducidad END), MIN(s.Fecha_Caducidad)) AS caducidadMinima,
            MIN(CASE WHEN s.Cantidad_Disponible > 0 AND s.Fecha_Caducidad <> ${FECHA_SIN_CADUCIDAD} THEN s.Fecha_Caducidad END) AS caducidadReal,
            SUM(s.Cantidad_Disponible > 0) AS lotesConExistencia,
            COUNT(*) AS lotes
        FROM Stock s
        WHERE s.ID_Bodega IN (${Prisma.join(bodegaIds)})
        GROUP BY s.ID_Product, s.ID_Bodega
        HAVING lotesConExistencia > 0 OR lotes = 1`;
}

function condiciones(filtros: FiltrosConsultaStock): Prisma.Sql {
    const partes: Prisma.Sql[] = [Prisma.sql`1 = 1`];
    const busqueda = filtros.busqueda.trim();

    if (busqueda.length > 0) {
        partes.push(
            /^\d+$/.test(busqueda)
                ? Prisma.sql`(p.Descripcion LIKE ${patronLike(busqueda)} OR p.ID_Product = ${Number(busqueda)})`
                : Prisma.sql`p.Descripcion LIKE ${patronLike(busqueda)}`
        );
    }
    if (filtros.linea) {
        partes.push(Prisma.sql`p.Linea = ${filtros.linea}`);
    }
    if (filtros.bajoMinimo) {
        partes.push(Prisma.sql`g.cantidad > 0 AND g.cantidad <= ${EXPR_MINIMO}`);
    }
    if (filtros.porCaducar) {
        partes.push(Prisma.sql`DATEDIFF(g.caducidadReal, ${filtros.hoy}) BETWEEN 1 AND ${DIAS_POR_CADUCAR}`);
    }

    return Prisma.join(partes, " AND ");
}

/** Mismo orden de severidad que `ordenarStockConsolidado`: sin stock, caducado, mínimo, por caducar, ok. */
function pesoAlerta(hoy: string): Prisma.Sql {
    return Prisma.sql`CASE
        WHEN g.cantidad <= 0 THEN 0
        WHEN DATEDIFF(g.caducidadMinima, ${hoy}) <= 0 THEN 1
        WHEN g.cantidad <= ${EXPR_MINIMO} THEN 2
        WHEN DATEDIFF(g.caducidadMinima, ${hoy}) BETWEEN 1 AND ${DIAS_ALERTA_CADUCIDAD[0]} THEN 3
        ELSE 4
    END`;
}

function columnaOrden(sort: StockSortKey, hoy: string): Prisma.Sql {
    switch (sort) {
        case "centro":
            return Prisma.sql`c.Nombre`;
        case "bodega":
            return Prisma.sql`b.Bodega`;
        case "linea":
            return Prisma.sql`p.Linea`;
        case "disponible":
            return Prisma.sql`g.cantidad`;
        case "minimo":
            return EXPR_MINIMO;
        case "alerta":
            return pesoAlerta(hoy);
        default:
            return Prisma.sql`p.Descripcion`;
    }
}

function desdeConJoins(filtros: FiltrosConsultaStock): Prisma.Sql {
    return Prisma.sql`
        FROM (${agrupado(filtros.bodegaIds)}) g
        JOIN Producto p ON p.ID_Product = g.productoId
        JOIN Bodega b ON b.ID_Bodega = g.bodegaId
        JOIN Centro c ON c.ID_Centro = b.ID_Centro
        WHERE ${condiciones(filtros)}`;
}

export function construirConteoStock(filtros: FiltrosConsultaStock): Prisma.Sql {
    return Prisma.sql`SELECT COUNT(*) AS total ${desdeConJoins(filtros)}`;
}

export function construirConsultaStock(filtros: FiltrosConsultaStock, pagina: { skip: number; tamano: number }): Prisma.Sql {
    const direccion = Prisma.raw(filtros.direction === "desc" ? "DESC" : "ASC");

    return Prisma.sql`
        SELECT
            g.productoId,
            g.bodegaId,
            p.Descripcion AS productoDescripcion,
            p.Linea AS linea,
            b.Bodega AS bodegaNombre,
            c.ID_Centro AS centroId,
            c.Nombre AS centroNombre,
            g.cantidad,
            g.caducidadMinima
        ${desdeConJoins(filtros)}
        ORDER BY ${columnaOrden(filtros.sort, filtros.hoy)} ${direccion}, p.Descripcion ASC, b.Bodega ASC
        LIMIT ${pagina.tamano} OFFSET ${pagina.skip}`;
}

export function mapearStockConsolidado(filas: FilaStockSql[], lotes: LoteStockSql[], hoy: Date = new Date()): StockConsolidadoVista[] {
    const lotesPorClave = new Map<string, LoteStockSql[]>();

    for (const lote of filtrarExistenciasVisibles(lotes)) {
        const clave = `${lote.bodegaId}:${lote.productoId}`;
        lotesPorClave.set(clave, [...(lotesPorClave.get(clave) ?? []), lote]);
    }

    return filas.map((fila) => {
        const clave = `${fila.bodegaId}:${fila.productoId}`;
        const cantidad = Number(fila.cantidad);
        const stockMinimo = calcularStockMinimo(cantidad);

        return {
            id: clave,
            centroId: fila.centroId,
            centroNombre: fila.centroNombre,
            bodegaId: fila.bodegaId,
            bodegaNombre: fila.bodegaNombre,
            productoId: Number(fila.productoId),
            productoDescripcion: fila.productoDescripcion,
            linea: fila.linea,
            cantidadDisponible: cantidad,
            stockMinimo,
            alerta: evaluarAlertaStock({ cantidadDisponible: cantidad, stockMinimo, fechaCaducidad: fila.caducidadMinima, hoy }),
            diasCaducidadMinimos: obtenerDiasRestantesCaducidad(fila.caducidadMinima, hoy),
            lotes: (lotesPorClave.get(clave) ?? [])
                .map((lote) => ({
                    id: lote.id,
                    lote: lote.lote,
                    fechaCaducidad: lote.fechaCaducidad,
                    cantidadDisponible: lote.cantidadDisponible
                }))
                .sort((a, b) => a.fechaCaducidad.getTime() - b.fechaCaducidad.getTime())
        };
    });
}
