import { Prisma } from "@prisma/client";

// lib
import type { FiltroMovimientosSeleccion } from "@/shared/lib/inventario-alcance-filtros";

function condicionCampo(columna: Prisma.Sql, valor: string | { in: string[] } | undefined): Prisma.Sql | null {
    if (valor === undefined) {
        return null;
    }

    return typeof valor === "string"
        ? Prisma.sql`${columna} = ${valor}`
        : Prisma.sql`${columna} IN (${Prisma.join(valor.in)})`;
}

/**
 * Versión SQL de `crearFiltroMovimientosSeleccion` para consultas crudas.
 * Las listas `in` nunca vienen vacías: el filtro es `null` cuando no hay alcance.
 * Requiere que la orden tenga el alias `o` en la consulta.
 */
export function condicionMovimientosSql(filtro: FiltroMovimientosSeleccion): Prisma.Sql {
    const partes = [
        Prisma.sql`1 = 1`,
        condicionCampo(Prisma.sql`o.ID_Centro`, filtro.centroId),
        condicionCampo(Prisma.sql`o.ID_Bodega`, filtro.bodegaId)
    ].filter((parte): parte is Prisma.Sql => parte !== null);

    return Prisma.join(partes, " AND ");
}
