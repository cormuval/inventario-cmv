"use server";

// lib
import { obtenerAlcanceInventario } from "@/shared/lib/inventario-alcance";
import { prisma } from "@/shared/lib/prisma";

// types
import type { StockDisponible } from "@/modules/orden-salida/types/stock-disponible";

export interface LotesDisponiblesResultado {
    ok: boolean;
    message: string;
    lotes: StockDisponible[];
}

/** Lotes con existencia de una bodega del alcance, para el formulario de nueva salida. */
export async function listarLotesDisponibles(bodegaId: string): Promise<LotesDisponiblesResultado> {
    try {
        const alcance = await obtenerAlcanceInventario();

        if (!alcance.bodegaIds.includes(bodegaId)) {
            return { ok: false, message: "La bodega no está dentro de tu alcance.", lotes: [] };
        }

        const lotes = await prisma.stock.findMany({
            where: { bodegaId, cantidadDisponible: { gt: 0 } },
            include: {
                producto: { select: { descripcion: true } },
                bodega: { select: { nombre: true } }
            },
            orderBy: [{ producto: { descripcion: "asc" } }, { fechaCaducidad: "asc" }]
        });

        return { ok: true, message: "", lotes };
    } catch {
        return { ok: false, message: "No fue posible cargar los lotes de la bodega.", lotes: [] };
    }
}
