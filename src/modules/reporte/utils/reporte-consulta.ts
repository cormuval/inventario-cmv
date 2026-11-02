import { Prisma } from "@prisma/client";

// lib
import type { FiltroMovimientosSeleccion } from "@/shared/lib/inventario-alcance-filtros";
import { condicionMovimientosSql } from "@/shared/lib/inventario-alcance-sql";

// utils
import type { ColumnaMes } from "@/modules/reporte/utils/periodo";
import { patronLike } from "@/modules/stock/utils/stock-consulta";

export const TIPO_SALIDA_TRASPASO = "A otra bodega";

export interface ConsultaReporte {
    filtroMovimientos: FiltroMovimientosSeleccion;
    bodegaIdsStock: string[];
    gte: Date;
    lt: Date;
    busqueda: string;
}

export interface FilaClaveReporte {
    productoId: number;
    bodegaId: string;
    centro: string;
    bodega: string;
    descripcion: string;
    linea: string;
    stockActual: bigint | number;
    ultimaActualizacion: Date | null;
}

export interface FilaConsumoReporte {
    productoId: number;
    bodegaId: string;
    mes: string;
    cantidad: bigint | number;
}

export interface FilaReporte {
    centro: string;
    bodega: string;
    bodegaId: string;
    productoId: number;
    descripcion: string;
    linea: string;
    stockActual: number;
    ultimaActualizacion: Date | null;
    meses: Record<string, number>;
    consumoPeriodo: number;
}

function consumoMensual(consulta: ConsultaReporte): Prisma.Sql {
    return Prisma.sql`
        SELECT
            d.ID_Product AS productoId,
            o.ID_Bodega AS bodegaId,
            DATE_FORMAT(o.Fecha, '%Y-%m') AS mes,
            CAST(SUM(d.Cantidad) AS SIGNED) AS cantidad
        FROM OrdenSalidaDetalle d
        JOIN OrdenSalida o ON o.ID_OrdenSalida = d.ID_OrdenSalida
        WHERE o.Fecha >= ${consulta.gte} AND o.Fecha < ${consulta.lt}
            AND o.Tipo_Salida <> ${TIPO_SALIDA_TRASPASO}
            AND ${condicionMovimientosSql(consulta.filtroMovimientos)}
        GROUP BY d.ID_Product, o.ID_Bodega, mes`;
}

function existencias(bodegaIds: string[]): Prisma.Sql {
    const condicion = bodegaIds.length > 0 ? Prisma.sql`s.ID_Bodega IN (${Prisma.join(bodegaIds)})` : Prisma.sql`1 = 0`;

    return Prisma.sql`
        SELECT
            s.ID_Product AS productoId,
            s.ID_Bodega AS bodegaId,
            CAST(SUM(s.Cantidad_Disponible) AS SIGNED) AS stockActual,
            MAX(s.Fecha_Ultima_Actualizacion) AS ultimaActualizacion
        FROM Stock s
        WHERE ${condicion}
        GROUP BY s.ID_Product, s.ID_Bodega`;
}

/** CTE + joins comunes al conteo y a la página: productos × bodega con stock o con consumo en el período. */
function baseClaves(consulta: ConsultaReporte): { cte: Prisma.Sql; desde: Prisma.Sql } {
    const busqueda = consulta.busqueda.trim();
    const condicionBusqueda = busqueda.length === 0
        ? Prisma.sql`1 = 1`
        : /^\d+$/.test(busqueda)
            ? Prisma.sql`(p.Descripcion LIKE ${patronLike(busqueda)} OR p.ID_Product = ${Number(busqueda)})`
            : Prisma.sql`p.Descripcion LIKE ${patronLike(busqueda)}`;

    return {
        cte: Prisma.sql`
            WITH consumo AS (${consumoMensual(consulta)}),
            existencias AS (${existencias(consulta.bodegaIdsStock)}),
            claves AS (
                SELECT productoId, bodegaId FROM existencias
                UNION
                SELECT productoId, bodegaId FROM consumo
            )`,
        desde: Prisma.sql`
            FROM claves k
            JOIN Producto p ON p.ID_Product = k.productoId
            JOIN Bodega b ON b.ID_Bodega = k.bodegaId
            JOIN Centro c ON c.ID_Centro = b.ID_Centro
            LEFT JOIN existencias e ON e.productoId = k.productoId AND e.bodegaId = k.bodegaId
            WHERE ${condicionBusqueda}`
    };
}

export function construirConteoReporte(consulta: ConsultaReporte): Prisma.Sql {
    const { cte, desde } = baseClaves(consulta);
    return Prisma.sql`${cte} SELECT COUNT(*) AS total ${desde}`;
}

export function construirClavesReporte(consulta: ConsultaReporte, pagina: { skip: number; tamano: number } | null): Prisma.Sql {
    const { cte, desde } = baseClaves(consulta);
    const limite = pagina ? Prisma.sql`LIMIT ${pagina.tamano} OFFSET ${pagina.skip}` : Prisma.empty;

    return Prisma.sql`
        ${cte}
        SELECT
            k.productoId,
            k.bodegaId,
            c.Nombre AS centro,
            b.Bodega AS bodega,
            p.Descripcion AS descripcion,
            p.Linea AS linea,
            COALESCE(e.stockActual, 0) AS stockActual,
            e.ultimaActualizacion
        ${desde}
        ORDER BY c.Nombre, b.Bodega, p.Descripcion
        ${limite}`;
}

/** Consumo por mes; con `pares` se limita a las filas visibles, con `null` (exportar) trae todo. */
export function construirConsumoReporte(
    consulta: ConsultaReporte,
    pares: Array<{ productoId: number; bodegaId: string }> | null
): Prisma.Sql {
    if (!pares) {
        return consumoMensual(consulta);
    }

    const tuplas = pares.map((par) => Prisma.sql`(${par.productoId}, ${par.bodegaId})`);
    return Prisma.sql`
        SELECT x.productoId, x.bodegaId, x.mes, x.cantidad
        FROM (${consumoMensual(consulta)}) x
        WHERE (x.productoId, x.bodegaId) IN (${Prisma.join(tuplas)})`;
}

export function armarFilasReporte(claves: FilaClaveReporte[], consumos: FilaConsumoReporte[], columnas: ColumnaMes[]): FilaReporte[] {
    const consumoPorClave = new Map<string, number>();

    for (const consumo of consumos) {
        consumoPorClave.set(`${consumo.productoId}:${consumo.bodegaId}:${consumo.mes}`, Number(consumo.cantidad));
    }

    return claves.map((clave) => {
        const meses = Object.fromEntries(
            columnas.map((columna) => [columna.clave, consumoPorClave.get(`${clave.productoId}:${clave.bodegaId}:${columna.clave}`) ?? 0])
        );

        return {
            centro: clave.centro,
            bodega: clave.bodega,
            bodegaId: clave.bodegaId,
            productoId: Number(clave.productoId),
            descripcion: clave.descripcion,
            linea: clave.linea,
            stockActual: Number(clave.stockActual),
            ultimaActualizacion: clave.ultimaActualizacion,
            meses,
            consumoPeriodo: Object.values(meses).reduce((total, cantidad) => total + cantidad, 0)
        };
    });
}
