"use server";

// lib
import { AuditLogger } from "@/shared/lib/logger";
import { prisma } from "@/shared/lib/prisma";

export interface ItemPrestamoResumen {
    productoNombre: string;
    cantidad: number;
    lote: string;
}

export interface NotificacionPrestamoInput {
    ordenSalidaId: string;
    codigoRecepcion: string;
    centroOrigenNombre: string;
    bodegaOrigenNombre: string;
    centroDestinoId: string;
    correoDestinoOpcional?: string | null;
    items: ItemPrestamoResumen[];
}

/**
 * Despacha notificaciones de préstamo a los usuarios autorizados del centro receptor.
 * Diseñado con filosofía fail-safe: errores en la resolución de destinatarios o envío
 * quedan registrados pero jamás interrumpen la transacción de inventario.
 */
export async function despacharNotificacionPrestamoAction(
    input: NotificacionPrestamoInput
): Promise<{ ok: boolean; destinatarios: string[] }> {
    try {
        const encargados = await prisma.usuario.findMany({
            where: {
                centroId: input.centroDestinoId,
                estado: true
            },
            select: { email: true }
        });

        const destinatarios = new Set<string>();
        for (const enc of encargados) {
            if (enc.email && enc.email.includes("@cmvalparaiso.cl")) {
                destinatarios.add(enc.email.toLowerCase().trim());
            }
        }

        if (input.correoDestinoOpcional && input.correoDestinoOpcional.includes("@")) {
            destinatarios.add(input.correoDestinoOpcional.toLowerCase().trim());
        }

        const listaDestinatarios = [...destinatarios];

        await AuditLogger.log({
            accion: "notificar",
            entidad: "OrdenSalida",
            entidadId: input.ordenSalidaId,
            detalles: {
                asunto: `Préstamo Intercentros Código #${input.codigoRecepcion}`,
                centroOrigen: input.centroOrigenNombre,
                bodegaOrigen: input.bodegaOrigenNombre,
                destinatarios: listaDestinatarios,
                totalProductos: input.items.length
            }
        });

        return { ok: true, destinatarios: listaDestinatarios };
    } catch (error) {
        // Fail-safe: No propagar para proteger la orden de salida
        console.error("Error al despachar notificación de préstamo intercentros:", error);
        return { ok: false, destinatarios: [] };
    }
}
