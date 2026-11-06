import "server-only";

// lib
import { prisma } from "@/shared/lib/prisma";
import { AuditLogger } from "@/shared/lib/logger";

/**
 * Registra la notificación interna de un préstamo intercentros emitido.
 * Fail-safe: si ocurre un error, se captura en try/catch para nunca romper la emisión.
 *
 * // TODO correo: se conecta en el PR de integración Resend.
 */
export async function notificarPrestamoEnviado(ordenSalidaId: string): Promise<void> {
    try {
        const orden = await prisma.ordenSalida.findUnique({
            where: { id: ordenSalidaId },
            include: {
                centro: true,
                centroDestino: true,
                bodega: true,
                bodegaDestino: true,
                usuario: true,
                detalles: {
                    include: {
                        producto: true
                    }
                }
            }
        });

        if (!orden || !orden.centroDestinoId) {
            return;
        }

        await AuditLogger.log({
            usuarioId: orden.usuarioId,
            centroId: orden.centroDestinoId,
            bodegaId: orden.bodegaDestinoId ?? null,
            accion: "notificar",
            entidad: "OrdenSalida",
            entidadId: orden.id,
            detalle: {
                tipoSalida: orden.tipoSalida,
                centroOrigenId: orden.centroId,
                centroOrigenNombre: orden.centro.nombre,
                centroDestinoId: orden.centroDestinoId,
                centroDestinoNombre: orden.centroDestino?.nombre,
                codigoRecepcion: orden.codigoRecepcion,
                totalItems: orden.detalles.length,
                // TODO correo: se conecta en el PR de integración Resend.
                mensaje: "Préstamo intercentros emitido y pendiente de recepción"
            }
        });
    } catch {
        // Fail-safe: un fallo de notificación no debe romper la emisión de la orden
    }
}
