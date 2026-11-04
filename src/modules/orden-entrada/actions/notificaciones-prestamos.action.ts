"use server";

// lib
import { obtenerSessionUser } from "@/shared/lib/auth";
import { prisma } from "@/shared/lib/prisma";

export interface ResumenOrdenEnTransito {
    id: string;
    codigo: string;
    centroOrigen: string;
    bodegaOrigen: string;
    fecha: string;
    esDemorado: boolean;
    totalItems: number;
}

export interface NotificacionesPrestamoResultado {
    total: number;
    ordenes: ResumenOrdenEnTransito[];
}

/**
 * Obtiene los préstamos / transferencias intercentros dirigidos al centro del usuario autenticado
 * que se encuentran actualmente en estado "EN_TRANSITO".
 * Cuenta el total real en paralelo con Promise.all manteniendo take: 10 para la lista desplegable.
 */
export async function obtenerPrestamosEnTransitoCentroAction(): Promise<NotificacionesPrestamoResultado> {
    try {
        const user = await obtenerSessionUser();
        if (!user || !user.centroId) {
            return { total: 0, ordenes: [] };
        }

        const where = {
            centroDestinoId: user.centroId,
            estadoPrestamo: "EN_TRANSITO"
        };

        const [total, ordenes] = await Promise.all([
            prisma.ordenSalida.count({ where }),
            prisma.ordenSalida.findMany({
                where,
                include: {
                    centro: { select: { nombre: true } },
                    bodega: { select: { nombre: true } },
                    detalles: { select: { id: true } }
                },
                orderBy: { fecha: "desc" },
                take: 10
            })
        ]);

        const ahora = new Date();

        return {
            total,
            ordenes: ordenes.map((o) => ({
                id: o.id,
                codigo: o.codigoRecepcion ?? "",
                centroOrigen: o.centro?.nombre ?? "Centro de Origen",
                bodegaOrigen: o.bodega?.nombre ?? "Bodega",
                fecha: o.fecha.toISOString(),
                esDemorado: o.fechaLimiteRecepcion ? ahora > o.fechaLimiteRecepcion : false,
                totalItems: o.detalles.length
            }))
        };
    } catch {
        return { total: 0, ordenes: [] };
    }
}
