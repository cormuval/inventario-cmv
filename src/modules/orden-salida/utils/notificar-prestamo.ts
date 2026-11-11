import "server-only";

import { z } from "zod";

// lib
import { enviarCorreo, type ResultadoCorreo } from "@/shared/lib/correo";
import { AuditLogger } from "@/shared/lib/logger";
import { prisma } from "@/shared/lib/prisma";

// utils
import { construirCorreoNotificacionPrestamo } from "@/modules/orden-salida/utils/correo-notificacion-prestamo";

const LARGO_MAXIMO_ERROR = 500;

export interface ParametrosResolucionDestinatario {
    correoDestino?: string | null;
    centroDestinoId: string;
    bodegaDestinoId?: string | null;
}

/**
 * Resuelve y valida las direcciones de correo destinatarias para notificar la recepción del préstamo.
 * Prioridad:
 * 1. Correo explícito ingresado en la orden (`correoDestino`), previa validación de formato.
 * 2. Si no hay correo explícito, encargados de la bodega destino (`EncargadosBodega`).
 * 3. Encargados de cualquier bodega del centro destino (`EncargadosBodega`).
 * 4. Usuarios activos del centro destino con roles autorizados para operar o supervisar (`Usuario`).
 */
export async function resolverDestinatariosPrestamo(params: ParametrosResolucionDestinatario): Promise<string[]> {
    if (params.correoDestino && params.correoDestino.trim().length > 0) {
        const correo = params.correoDestino.trim();
        const validacion = z.string().email().safeParse(correo);
        if (validacion.success) {
            return [correo];
        }
        // Si se indicó un correo explícito con formato inválido, no se adivinan otros para evitar desvíos
        return [];
    }

    // 2. Encargados de la bodega destino si fue seleccionada
    if (params.bodegaDestinoId) {
        try {
            const encargadosBodega = await prisma.encargadosBodega.findMany({
                where: { bodegaId: params.bodegaDestinoId },
                select: { email: true }
            });
            const correos = encargadosBodega
                .map((e) => e.email?.trim())
                .filter((e): e is string => !!e && z.string().email().safeParse(e).success);
            if (correos.length > 0) {
                return Array.from(new Set(correos));
            }
        } catch {
            // Se continúa al siguiente criterio si la consulta falla
        }
    }

    // 3. Encargados de cualquier bodega en el centro de destino
    try {
        const encargadosCentro = await prisma.encargadosBodega.findMany({
            where: { centroId: params.centroDestinoId },
            select: { email: true }
        });
        const correosCentro = encargadosCentro
            .map((e) => e.email?.trim())
            .filter((e): e is string => !!e && z.string().email().safeParse(e).success);
        if (correosCentro.length > 0) {
            return Array.from(new Set(correosCentro));
        }
    } catch {
        // Se continúa al siguiente criterio
    }

    // 4. Usuarios activos del centro destino autorizados para recepción o jefatura
    try {
        const usuarios = await prisma.usuario.findMany({
            where: {
                centroId: params.centroDestinoId,
                estado: true,
                rolId: { in: ["R01", "R02", "R03", "R06", "R07"] }
            },
            select: { email: true }
        });
        const correosUsuarios = usuarios
            .map((u) => u.email?.trim())
            .filter((e): e is string => !!e && z.string().email().safeParse(e).success);
        if (correosUsuarios.length > 0) {
            return Array.from(new Set(correosUsuarios));
        }
    } catch {
        // Fallback final
    }

    return [];
}

/**
 * Notifica al destinatario receptor de un préstamo intercentros emitido,
 * enviando automáticamente el código de recepción único de 7 caracteres,
 * los datos del origen, destino, detalle de insumos y el plazo vigente de 7 días.
 *
 * Fail-safe: si ocurre un error, se audita y devuelve el resultado; nunca lanza
 * ni revierte la orden de salida o los stocks ya descontados.
 */
export async function notificarPrestamoEnviado(ordenSalidaId: string): Promise<ResultadoCorreo> {
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
            return { ok: false, omitido: true, error: "La orden no corresponde a un préstamo a otro centro" };
        }

        if (!orden.codigoRecepcion) {
            return { ok: false, omitido: true, error: "La orden no cuenta con código de recepción generado" };
        }

        const destinatarios = await resolverDestinatariosPrestamo({
            correoDestino: orden.correoDestino,
            centroDestinoId: orden.centroDestinoId,
            bodegaDestinoId: orden.bodegaDestinoId
        });

        if (destinatarios.length === 0) {
            const errorMsg = orden.correoDestino
                ? `El correo de destino "${orden.correoDestino}" no tiene un formato válido`
                : "No se encontró un destinatario de correo válido para el centro de destino";

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
                    resultadoEnvio: "fallido",
                    error: errorMsg,
                    mensaje: `Fallo al notificar préstamo: ${errorMsg}`
                }
            });

            try {
                await prisma.ordenSalida.update({
                    where: { id: orden.id },
                    data: {
                        enviarCorreo: false,
                        fechaEnvioCorreo: new Date(),
                        errorEnvioCorreo: errorMsg.slice(0, LARGO_MAXIMO_ERROR)
                    }
                });
            } catch {
                // Fail-safe
            }

            return { ok: false, error: errorMsg };
        }

        const fechaLimite = orden.fechaLimiteRecepcion ?? new Date(Date.now() + 7 * 24 * 60 * 60 * 1000);

        const correoInput = construirCorreoNotificacionPrestamo({
            ordenId: orden.id,
            codigoRecepcion: orden.codigoRecepcion,
            fecha: orden.fecha,
            fechaLimiteRecepcion: fechaLimite,
            centroOrigen: orden.centro.nombre,
            bodegaOrigen: orden.bodega.nombre,
            centroDestino: orden.centroDestino?.nombre ?? orden.destino,
            bodegaDestino: orden.bodegaDestino?.nombre ?? null,
            emisorNombre: `${orden.usuario.nombre} ${orden.usuario.apPaterno ?? ""}`.trim(),
            emisorEmail: orden.usuario.email,
            detalles: orden.detalles.map((d) => ({
                productoDescripcion: d.producto.descripcion,
                cantidad: d.cantidad,
                lote: d.lote,
                fechaCaducidad: d.fechaCaducidad
            })),
            para: destinatarios.length === 1 ? destinatarios[0] : destinatarios
        });

        const resultado = await enviarCorreo(correoInput);

        if (resultado.ok || !resultado.omitido) {
            try {
                await prisma.ordenSalida.update({
                    where: { id: orden.id },
                    data: resultado.ok
                        ? {
                              enviarCorreo: true,
                              fechaEnvioCorreo: new Date(),
                              errorEnvioCorreo: null,
                              ...(orden.correoDestino ? {} : { correoDestino: destinatarios[0] })
                          }
                        : {
                              enviarCorreo: false,
                              fechaEnvioCorreo: new Date(),
                              errorEnvioCorreo: resultado.error.slice(0, LARGO_MAXIMO_ERROR)
                          }
                });
            } catch {
                // Se ignora: el correo ya se intentó y el registro de la salida no debe fallar
            }
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
                destinatarios: destinatarios.join(", "),
                resultadoEnvio: resultado.ok ? "enviado" : (resultado.omitido ? "omitido" : "fallido"),
                ...(resultado.ok ? { emailId: resultado.id } : { error: resultado.error }),
                mensaje: resultado.ok
                    ? `Notificación de préstamo enviada exitosamente a ${destinatarios.join(", ")}`
                    : (resultado.omitido
                        ? "Envío de notificación omitido (sin servicio de correo configurado)"
                        : `Fallo al enviar notificación de préstamo por correo: ${resultado.error}`)
            }
        });

        return resultado;
    } catch (error) {
        const errorMsg = error instanceof Error ? error.message : "Error inesperado al notificar el préstamo";
        return { ok: false, error: errorMsg };
    }
}
