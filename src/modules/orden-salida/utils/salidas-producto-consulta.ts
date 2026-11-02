import { Prisma } from "@prisma/client";

// lib
import type { FiltroMovimientosSeleccion } from "@/shared/lib/inventario-alcance-filtros";
import { condicionMovimientosSql } from "@/shared/lib/inventario-alcance-sql";

/** Mayor valor de `Producto.ID_Product`, columna `Int` de MySQL. */
const ID_PRODUCTO_MAXIMO = 2147483647;

export interface ConsultaSalidasProducto {
    productoId: number;
    filtroMovimientos: FiltroMovimientosSeleccion;
    gte: Date;
    lte: Date;
}

export interface FilaTotalSql {
    clave: string;
    etiqueta: string;
    cantidad: bigint | number;
}

export interface TotalAgrupado {
    clave: string;
    etiqueta: string;
    cantidad: number;
}

function filtroComun(consulta: ConsultaSalidasProducto): Prisma.Sql {
    return Prisma.sql`
        WHERE d.ID_Product = ${consulta.productoId}
            AND o.Fecha >= ${consulta.gte}
            AND o.Fecha <= ${consulta.lte}
            AND ${condicionMovimientosSql(consulta.filtroMovimientos)}`;
}

export function construirTotalesPorBodega(consulta: ConsultaSalidasProducto): Prisma.Sql {
    return Prisma.sql`
        SELECT o.ID_Bodega AS clave, b.Bodega AS etiqueta, CAST(SUM(d.Cantidad) AS SIGNED) AS cantidad
        FROM OrdenSalidaDetalle d
        JOIN OrdenSalida o ON o.ID_OrdenSalida = d.ID_OrdenSalida
        JOIN Bodega b ON b.ID_Bodega = o.ID_Bodega
        ${filtroComun(consulta)}
        GROUP BY o.ID_Bodega, b.Bodega
        ORDER BY cantidad DESC, b.Bodega`;
}

export function construirTotalesPorTipo(consulta: ConsultaSalidasProducto): Prisma.Sql {
    return Prisma.sql`
        SELECT o.Tipo_Salida AS clave, o.Tipo_Salida AS etiqueta, CAST(SUM(d.Cantidad) AS SIGNED) AS cantidad
        FROM OrdenSalidaDetalle d
        JOIN OrdenSalida o ON o.ID_OrdenSalida = d.ID_OrdenSalida
        ${filtroComun(consulta)}
        GROUP BY o.Tipo_Salida
        ORDER BY cantidad DESC, o.Tipo_Salida`;
}

export function mapearTotales(filas: FilaTotalSql[]): TotalAgrupado[] {
    return filas.map((fila) => ({ clave: fila.clave, etiqueta: fila.etiqueta, cantidad: Number(fila.cantidad) }));
}

export function leerProductoId(valor: string | undefined): number | undefined {
    if (valor === undefined || !/^\d+$/.test(valor)) {
        return undefined;
    }

    const numero = Number(valor);
    return numero > 0 && numero <= ID_PRODUCTO_MAXIMO ? numero : undefined;
}
