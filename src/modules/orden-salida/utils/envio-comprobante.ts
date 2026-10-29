// lib
import { enviarCorreo, type ResultadoCorreo } from "@/shared/lib/correo";
import { validarCentroBodegaEnAlcance } from "@/shared/lib/inventario-alcance";
import { AuditLogger } from "@/shared/lib/logger";
import { prisma } from "@/shared/lib/prisma";

// utils
import { construirCorreoComprobante } from "@/modules/orden-salida/utils/correo-comprobante";
import { generarComprobanteSalidaPDF } from "@/modules/orden-salida/utils/pdf-comprobante";

const LARGO_MAXIMO_ERROR = 500;

export interface EnvioComprobanteInput {
    ordenId: string;
    usuarioId: string;
    para: string;
    reenvio: boolean;
}

/** Carga la orden con los datos que necesita el comprobante PDF (descarga y envío por correo). */
export async function cargarOrdenParaComprobante(ordenId: string) {
    return prisma.ordenSalida.findUnique({
        where: { id: ordenId },
        include: {
            centro: { select: { nombre: true } },
            bodega: { select: { nombre: true } },
            bodegaDestino: { select: { nombre: true } },
            usuario: { select: { nombre: true, apPaterno: true, email: true } },
            detalles: {
                include: {
                    producto: { select: { descripcion: true } }
                }
            }
        }
    });
}

type OrdenComprobante = NonNullable<Awaited<ReturnType<typeof cargarOrdenParaComprobante>>>;

/** Carga la orden y valida el alcance del usuario; devuelve la orden o el error a informar. */
async function cargarOrdenEnAlcance(ordenId: string): Promise<{ orden: OrdenComprobante } | { error: string }> {
    try {
        const orden = await cargarOrdenParaComprobante(ordenId);
        if (!orden) {
            return { error: "Orden de salida no encontrada" };
        }
        await validarCentroBodegaEnAlcance(orden.centroId, orden.bodegaId);
        return { orden };
    } catch (error) {
        return { error: error instanceof Error ? error.message : "No fue posible cargar la orden de salida" };
    }
}

/**
 * Genera el comprobante, lo envía por correo, deja el estado del último envío en la orden y audita el intento.
 * No lanza por fallos del correo: el registro de la salida nunca debe fallar por el envío.
 */
export async function enviarComprobanteSalida(input: EnvioComprobanteInput): Promise<ResultadoCorreo> {
    const carga = await cargarOrdenEnAlcance(input.ordenId);
    if ("error" in carga) {
        return { ok: false, error: carga.error };
    }
    const { orden } = carga;

    let resultado: ResultadoCorreo;
    try {
        const pdf = await generarComprobanteSalidaPDF(orden);
        resultado = await enviarCorreo(construirCorreoComprobante(orden, pdf, input.para));
    } catch (error) {
        resultado = { ok: false, error: error instanceof Error ? error.message : "Error al generar el comprobante" };
    }

    if (resultado.ok || !resultado.omitido) {
        await prisma.ordenSalida.update({
            where: { id: orden.id },
            data: resultado.ok
                ? { enviarCorreo: true, fechaEnvioCorreo: new Date(), errorEnvioCorreo: null }
                : {
                      enviarCorreo: false,
                      fechaEnvioCorreo: new Date(),
                      errorEnvioCorreo: resultado.error.slice(0, LARGO_MAXIMO_ERROR)
                  }
        });
    }

    await AuditLogger.log({
        usuarioId: input.usuarioId,
        centroId: orden.centroId,
        bodegaId: orden.bodegaId,
        accion: "enviar_correo",
        entidad: "OrdenSalida",
        entidadId: orden.id,
        detalle: {
            para: input.para,
            reenvio: input.reenvio,
            ...(resultado.ok
                ? { resultado: "enviado", resendId: resultado.id }
                : { resultado: resultado.omitido ? "omitido" : "fallido", error: resultado.error })
        }
    });

    return resultado;
}
