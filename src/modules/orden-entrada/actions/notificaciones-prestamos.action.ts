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
 */
export async function obtenerPrestamosEnTransitoCentroAction(): Promise<NotificacionesPrestamoResultado> {
    try {
        const user = await obtenerSessionUser();
        if (!user || !user.centroId) {
            return { total: 0, ordenes: [] };
        }

        const ordenes = await prisma.ordenSalida.findMany({
            where: {
                centroDestinoId: user.centroId,
                estadoPrestamo: "EN_TRANSITO"
            },
            include: {
                centro: { select: { nombre: true } },
                bodega: { select: { nombre: true } },
                detalles: { select: { id: true } }
            },
            orderBy: { fecha: "desc" },
            take: 10
        });

        const ahora = new Date();

        return {
            total: ordenes.length,
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
    } catch (error) {
        console.error("Error al obtener notificaciones de préstamos en tránsito:", error);
        return { total: 0, ordenes: [] };
    }
}
