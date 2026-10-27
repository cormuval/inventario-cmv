"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";

// config
import { ROL_ADMINISTRADOR } from "@/config/auth";

// lib
import { requireSessionUser, puedeOperarEntrada } from "@/shared/lib/auth";
import { AuditLogger } from "@/shared/lib/logger";
import { prisma } from "@/shared/lib/prisma";

// schemas
import {
    buscarPrestamoSchema,
    confirmarRecepcionPrestamoSchema,
    type ConfirmarRecepcionPrestamoInput
} from "@/modules/orden-entrada/schemas/recepcion-prestamos.schema";

// utils
import { normalizarCodigoRecepcion } from "@/modules/orden-salida/utils/codigo-recepcion";

export interface DetallePrestamoResumen {
    id: string;
    productoId: number;
    productoDescripcion: string;
    linea: string;
    cantidad: number;
    lote: string;
    fechaCaducidad: string;
}

export interface PrestamoEnTransitoDetalle {
    id: string;
    codigo: string;
    centroOrigenNombre: string;
    bodegaOrigenNombre: string;
    centroDestinoId: string;
    bodegaDestinoSugeridaId?: string | null;
    fechaEmision: string;
    fechaLimiteRecepcion?: string | null;
    esDemorado: boolean;
    detalles: DetallePrestamoResumen[];
}

export interface ResultadoBusquedaPrestamo {
    ok: boolean;
    message: string;
    prestamo?: PrestamoEnTransitoDetalle;
}

export interface ResultadoConfirmacionPrestamo {
    ok: boolean;
    message: string;
}

/**
 * Busca un préstamo intercentro mediante su código único de 7 caracteres
 * y valida que el usuario pertenezca al centro de destino asignado.
 */
export async function buscarPrestamoPorCodigoAction(codigo: string): Promise<ResultadoBusquedaPrestamo> {
    try {
        const user = await requireSessionUser();
        const validacion = buscarPrestamoSchema.safeParse({ codigo });
        if (!validacion.success) {
            return {
                ok: false,
                message: "Código no válido. Debe tener 7 caracteres alfanuméricos válidos."
            };
        }

        const codigoNormalizado = normalizarCodigoRecepcion(codigo);

        const orden = await prisma.ordenSalida.findFirst({
            where: {
                codigoRecepcion: codigoNormalizado,
                estadoPrestamo: "EN_TRANSITO"
            },
            include: {
                centro: { select: { nombre: true } },
                bodega: { select: { nombre: true } },
                detalles: {
                    include: {
                        producto: { select: { id: true, descripcion: true, linea: true } }
                    }
                }
            }
        });

        if (!orden) {
            return {
                ok: false,
                message: "Orden de préstamo no encontrada o ya fue recepcionada/anulada."
            };
        }

        if (user.rol !== ROL_ADMINISTRADOR && orden.centroDestinoId !== user.centroId) {
            return {
                ok: false,
                message: "Este préstamo está destinado a otro centro de salud."
            };
        }

        const esDemorado = orden.fechaLimiteRecepcion ? new Date() > orden.fechaLimiteRecepcion : false;

        return {
            ok: true,
            message: "Préstamo localizado con éxito.",
            prestamo: {
                id: orden.id,
                codigo: orden.codigoRecepcion ?? codigoNormalizado,
                centroOrigenNombre: orden.centro?.nombre ?? "Centro de Origen",
                bodegaOrigenNombre: orden.bodega?.nombre ?? "Bodega de Origen",
                centroDestinoId: orden.centroDestinoId ?? "",
                bodegaDestinoSugeridaId: orden.bodegaDestinoId,
                fechaEmision: orden.fecha.toISOString(),
                fechaLimiteRecepcion: orden.fechaLimiteRecepcion?.toISOString() ?? null,
                esDemorado,
                detalles: orden.detalles.map((d) => ({
                    id: d.id,
                    productoId: d.productoId,
                    productoDescripcion: d.producto.descripcion,
                    linea: d.producto.linea,
                    cantidad: d.cantidad,
                    lote: d.lote,
                    fechaCaducidad: d.fechaCaducidad.toISOString()
                }))
            }
        };
    } catch (error) {
        return {
            ok: false,
            message: error instanceof Error ? error.message : "Error al consultar el código de préstamo."
        };
    }
}

/**
 * Confirma la recepción física en el centro de destino, incrementando stock
 * en la bodega receptora y actualizando la orden a RECEPCIONADO de forma atómica.
 */
export async function confirmarRecepcionPrestamoAction(
    input: ConfirmarRecepcionPrestamoInput
): Promise<ResultadoConfirmacionPrestamo> {
    try {
        const user = await requireSessionUser();
        if (!puedeOperarEntrada(user.rol)) {
            return { ok: false, message: "No tienes permiso para recepcionar insumos en inventario." };
        }

        const parsed = confirmarRecepcionPrestamoSchema.parse(input);
        const codigoNormalizado = normalizarCodigoRecepcion(parsed.codigo);

        const orden = await prisma.ordenSalida.findFirst({
            where: {
                codigoRecepcion: codigoNormalizado,
                estadoPrestamo: "EN_TRANSITO"
            },
            include: {
                centro: { select: { nombre: true } },
                bodega: { select: { nombre: true } },
                detalles: {
                    include: {
                        producto: { select: { id: true, linea: true } }
                    }
                }
            }
        });

        if (!orden) {
            return {
                ok: false,
                message: "La orden asociada a este código ya no se encuentra en tránsito o no existe."
            };
        }

        if (user.rol !== ROL_ADMINISTRADOR && orden.centroDestinoId !== user.centroId) {
            return {
                ok: false,
                message: "No tienes autorización para recepcionar este préstamo en este establecimiento."
            };
        }

        const bodegaDestino = await prisma.bodega.findUnique({
            where: { id: parsed.bodegaDestinoId }
        });

        if (!bodegaDestino || !bodegaDestino.estado || (orden.centroDestinoId && bodegaDestino.centroId !== orden.centroDestinoId)) {
            return {
                ok: false,
                message: "La bodega seleccionada no existe o no pertenece al centro de salud receptor."
            };
        }

        await prisma.$transaction(async (tx) => {
            // 1. Incrementar stock en la bodega de destino respetando lotes y caducidades
            for (const detalle of orden.detalles) {
                await tx.stock.upsert({
                    where: {
                        stock_lote_unico: {
                            productoId: detalle.productoId,
                            bodegaId: parsed.bodegaDestinoId,
                            lote: detalle.lote,
                            fechaCaducidad: detalle.fechaCaducidad
                        }
                    },
                    update: {
                        cantidadDisponible: { increment: detalle.cantidad },
                        fechaUltimaActualizacion: new Date()
                    },
                    create: {
                        productoId: detalle.productoId,
                        bodegaId: parsed.bodegaDestinoId,
                        cantidad: detalle.cantidad,
                        lote: detalle.lote,
                        fechaCaducidad: detalle.fechaCaducidad
                    }
                });
            }

            // 2. Registrar OrdenEntrada automática vinculada
            await tx.ordenEntrada.create({
                data: {
                    fecha: new Date(),
                    usuarioId: user.id,
                    bodegaId: parsed.bodegaDestinoId,
                    tipoEntrada: "Préstamo Intercentros",
                    centroId: orden.centroDestinoId ?? user.centroId,
                    origen: `Traspaso desde ${orden.centro?.nombre ?? "Centro Origen"} (${orden.bodega?.nombre ?? "Bodega Origen"})`,
                    detalles: {
                        create: orden.detalles.map((d) => ({
                            productoId: d.productoId,
                            categoria: d.producto.linea || "Clínico",
                            fechaCaducidad: d.fechaCaducidad,
                            cantidad: d.cantidad,
                            lote: d.lote
                        }))
                    }
                }
            });

            // 3. Actualizar la orden de salida original a RECEPCIONADO
            await tx.ordenSalida.update({
                where: { id: orden.id },
                data: {
                    estadoPrestamo: "RECEPCIONADO",
                    fechaRecepcion: new Date(),
                    usuarioReceptorId: user.id,
                    bodegaDestinoId: parsed.bodegaDestinoId,
                    observacionRecepcion: parsed.observacionRecepcion?.trim() || null
                }
            });
        });

        // 4. Auditoría
        await AuditLogger.log({
            usuarioId: user.id,
            accion: "actualizar",
            entidad: "OrdenSalida",
            entidadId: orden.id,
            detalle: {
                operacion: "recepcion_prestamo",
                codigoRecepcion: codigoNormalizado,
                estadoPrestamo: "RECEPCIONADO",
                bodegaDestinoId: parsed.bodegaDestinoId,
                observacion: parsed.observacionRecepcion || null
            }
        });

        revalidatePath("/");
        revalidatePath("/stock");
        revalidatePath("/orden-entrada");
        revalidatePath("/orden-salida");
        revalidatePath("/reporte");

        return {
            ok: true,
            message: "Préstamo recepcionado exitosamente. Los insumos han ingresado al inventario de la bodega."
        };
    } catch (error) {
        if (error instanceof z.ZodError) {
            return { ok: false, message: error.issues.map((i) => i.message).join(" ") };
        }
        return {
            ok: false,
            message: error instanceof Error ? error.message : "No se pudo confirmar la recepción del préstamo."
        };
    }
}
