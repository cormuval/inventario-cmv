"use server";

import { revalidatePath } from "next/cache";
import type { PrismaClient } from "@prisma/client";

// lib
import { requireSessionUser, puedeOperarSalida } from "@/shared/lib/auth";
import { obtenerAlcanceInventario, validarCentroBodegaEnAlcance } from "@/shared/lib/inventario-alcance";
import { crearFiltroMovimientosAlcance } from "@/shared/lib/inventario-alcance-filtros";
import { AuditLogger } from "@/shared/lib/logger";
import { prisma } from "@/shared/lib/prisma";

// schemas
import { crearOrdenSalidaSchema, ordenSalidaDetalleSchema } from "@/modules/orden-salida/schemas/orden-salida.schema";
import { z } from "zod";

// types
import type { ActionState } from "@/shared/types/action-state";

// utils
import { validarSalidaLoteCaducado } from "@/modules/stock/utils/movimientos";
import { generarCodigoRecepcion } from "@/modules/orden-salida/utils/codigo-recepcion";
import { despacharNotificacionPrestamoAction } from "@/modules/orden-salida/actions/notificacion-correo";

type Tx = Omit<PrismaClient, "$connect" | "$disconnect" | "$on" | "$transaction" | "$use" | "$extends">;

interface DetalleSalidaForm {
    productoId: number;
    cantidad: number;
    lote: string;
    fechaCaducidad: Date;
}

export async function listarOrdenesSalida() {
    const filtroAlcance = crearFiltroMovimientosAlcance(await obtenerAlcanceInventario());

    if (!filtroAlcance) {
        return [];
    }

    return prisma.ordenSalida.findMany({
        where: filtroAlcance,
        include: {
            usuario: true,
            centro: true,
            bodega: true,
            detalles: {
                include: { producto: true }
            }
        },
        orderBy: { fecha: "desc" }
    });
}

export async function crearOrdenSalida(prevState: ActionState, formData: FormData): Promise<ActionState> {
    try {
        const user = await requireSessionUser();
        if (!puedeOperarSalida(user.rol)) {
            return { ok: false, message: "No tienes permiso para registrar salidas." };
        }

        const rawAdvertencia = formData.get("advertenciaCaducidadAceptada");
        const advertenciaAceptada = rawAdvertencia === "true" || rawAdvertencia === "on" || rawAdvertencia === "1";

        const parsed = crearOrdenSalidaSchema.parse({
            fecha: formData.get("fecha"),
            bodegaId: formData.get("bodegaId"),
            bodegaDestinoId: formData.get("bodegaDestinoId")?.toString()?.trim() || undefined,
            centroId: formData.get("centroId"),
            centroDestinoId: formData.get("centroDestinoId")?.toString()?.trim() || undefined,
            tipoSalida: formData.get("tipoSalida"),
            destino: formData.get("destino"),
            codigoSalida: formData.get("codigoSalida")?.toString() || undefined,
            correoDestino: formData.get("correoDestino")?.toString() || undefined,
            advertenciaCaducidadAceptada: advertenciaAceptada,
            detalles: leerDetallesSalida(formData)
        });
        await validarCentroBodegaEnAlcance(parsed.centroId, parsed.bodegaId);

        const esTraspasoBodega = parsed.tipoSalida.trim().toLowerCase() === "a otra bodega";
        const esAOtroCentro = parsed.tipoSalida.trim().toLowerCase() === "a otros centros";
        let bodegaDestinoId: string | null = null;
        let centroDestinoId: string | null = null;
        let codigoRecepcion: string | null = null;
        let fechaLimiteRecepcion: Date | null = null;
        let estadoPrestamo: string | null = null;

        if (esTraspasoBodega) {
            bodegaDestinoId = parsed.bodegaDestinoId ?? null;
            if (!bodegaDestinoId) {
                return { ok: false, message: "Debe seleccionar la bodega destino para el traspaso." };
            }
            if (bodegaDestinoId === parsed.bodegaId) {
                return { ok: false, message: "La bodega destino no puede ser la misma bodega de origen." };
            }
            const bodegaDestino = await prisma.bodega.findUnique({
                where: { id: bodegaDestinoId }
            });
            if (!bodegaDestino || !bodegaDestino.estado || bodegaDestino.centroId !== parsed.centroId) {
                return { ok: false, message: "La bodega destino seleccionada no existe o no pertenece al mismo centro de salud." };
            }
            parsed.destino = bodegaDestino.nombre;
        }

        if (esAOtroCentro) {
            centroDestinoId = parsed.centroDestinoId ?? null;
            if (!centroDestinoId) {
                return { ok: false, message: "Debe seleccionar el centro de destino para el traspaso." };
            }
            if (centroDestinoId === parsed.centroId) {
                return { ok: false, message: "El centro destino no puede ser el mismo centro de origen." };
            }
            const centroDestino = await prisma.centro.findUnique({
                where: { id: centroDestinoId }
            });
            if (!centroDestino || !centroDestino.estado) {
                return { ok: false, message: "El centro de destino seleccionado no existe o no está activo." };
            }
            parsed.destino = centroDestino.nombre;
            codigoRecepcion = generarCodigoRecepcion();
            estadoPrestamo = "EN_TRANSITO";
            // Plazo de 1 semana (7 días)
            fechaLimiteRecepcion = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000);
        }

        const orden = await prisma.$transaction(async (tx) => {
            const nuevaOrden = await tx.ordenSalida.create({
                data: {
                    fecha: parsed.fecha,
                    usuarioId: user.id,
                    bodegaId: parsed.bodegaId,
                    bodegaDestinoId: esTraspasoBodega ? bodegaDestinoId : (parsed.bodegaDestinoId ?? null),
                    tipoSalida: parsed.tipoSalida,
                    centroId: parsed.centroId,
                    centroDestinoId: esAOtroCentro ? centroDestinoId : null,
                    destino: parsed.destino,
                    codigoSalida: parsed.codigoSalida || null,
                    correoDestino: parsed.correoDestino || null,
                    codigoRecepcion: esAOtroCentro ? codigoRecepcion : null,
                    estadoPrestamo: esAOtroCentro ? estadoPrestamo : null,
                    fechaLimiteRecepcion: esAOtroCentro ? fechaLimiteRecepcion : null,
                    advertenciaCaducidadAceptada: parsed.advertenciaCaducidadAceptada ?? false
                }
            });

            for (const detalle of parsed.detalles) {
                await descontarStock(tx, {
                    productoId: detalle.productoId,
                    bodegaId: parsed.bodegaId,
                    cantidad: detalle.cantidad,
                    lote: detalle.lote,
                    fechaCaducidad: detalle.fechaCaducidad,
                    tipoSalida: parsed.tipoSalida
                });

                if (esTraspasoBodega && bodegaDestinoId) {
                    await devolverStock(tx, {
                        productoId: detalle.productoId,
                        bodegaId: bodegaDestinoId,
                        cantidad: detalle.cantidad,
                        lote: detalle.lote,
                        fechaCaducidad: detalle.fechaCaducidad
                    });
                }

                await tx.ordenSalidaDetalle.create({
                    data: {
                        ...detalle,
                        ordenSalidaId: nuevaOrden.id
                    }
                });
            }

            return nuevaOrden;
        });

        await AuditLogger.log({
            usuarioId: user.id,
            centroId: parsed.centroId,
            bodegaId: parsed.bodegaId,
            accion: "crear",
            entidad: "OrdenSalida",
            entidadId: orden.id,
            detalle: {
                tipoSalida: parsed.tipoSalida,
                destino: parsed.destino,
                bodegaOrigenId: parsed.bodegaId,
                ...(esTraspasoBodega && bodegaDestinoId ? { bodegaDestinoId } : {}),
                ...(esAOtroCentro && centroDestinoId ? { centroDestinoId, codigoRecepcion, estadoPrestamo } : {}),
                detalles: parsed.detalles.length
            }
        });

        if (esAOtroCentro && centroDestinoId && codigoRecepcion) {
            const [centroOrigen, bodegaOrigen] = await Promise.all([
                prisma.centro.findUnique({ where: { id: parsed.centroId }, select: { nombre: true } }),
                prisma.bodega.findUnique({ where: { id: parsed.bodegaId }, select: { nombre: true } })
            ]);

            await despacharNotificacionPrestamoAction({
                ordenSalidaId: orden.id,
                codigoRecepcion,
                centroOrigenNombre: centroOrigen?.nombre ?? "Centro de Origen",
                bodegaOrigenNombre: bodegaOrigen?.nombre ?? "Bodega de Origen",
                centroDestinoId,
                correoDestinoOpcional: parsed.correoDestino,
                items: parsed.detalles.map((d) => ({
                    productoNombre: `Insumo #${d.productoId}`,
                    cantidad: d.cantidad,
                    lote: d.lote
                }))
            });
        }

        revalidatePath("/");
        revalidatePath("/stock");
        revalidatePath("/orden-salida");
        revalidatePath("/reporte");
        revalidatePath("/orden-entrada");

        return {
            ok: true,
            message: esAOtroCentro
                ? `Traspaso intercentros registrado en tránsito. Código de verificación: ${codigoRecepcion}`
                : "Orden de salida registrada.",
            ordenId: orden.id,
            codigoRecepcion: codigoRecepcion || undefined
        };
    } catch (error) {
        if (error instanceof z.ZodError) {
            return { ok: false, message: error.issues.map((i) => i.message).join(" ") };
        }
        return { ok: false, message: error instanceof Error ? error.message : "No se pudo registrar la salida." };
    }
}

export async function actualizarDetalleSalida(detalleId: string, formData: FormData): Promise<ActionState> {
    try {
        const user = await requireSessionUser();
        if (!puedeOperarSalida(user.rol)) {
            return { ok: false, message: "No tienes permiso para editar salidas." };
        }

        const parsed = ordenSalidaDetalleSchema.parse({
            productoId: formData.get("productoId"),
            cantidad: formData.get("cantidad"),
            lote: formData.get("lote"),
            fechaCaducidad: formData.get("fechaCaducidad")
        });

        const previo = await prisma.ordenSalidaDetalle.findUniqueOrThrow({
            where: { id: detalleId },
            include: { ordenSalida: true }
        });
        await validarCentroBodegaEnAlcance(previo.ordenSalida.centroId, previo.ordenSalida.bodegaId);

        const esTraspaso = previo.ordenSalida.tipoSalida.trim().toLowerCase() === "a otra bodega";
        let bodegaDestinoId: string | null = null;
        if (esTraspaso) {
            bodegaDestinoId = previo.ordenSalida.bodegaDestinoId;
            if (!bodegaDestinoId) {
                return {
                    ok: false,
                    message: "La orden de traspaso no tiene bodega destino registrada; no es posible revertirla."
                };
            }
        }

        await prisma.$transaction(async (tx) => {
            await devolverStock(tx, {
                productoId: previo.productoId,
                bodegaId: previo.ordenSalida.bodegaId,
                cantidad: previo.cantidad,
                lote: previo.lote,
                fechaCaducidad: previo.fechaCaducidad
            });
            if (esTraspaso && bodegaDestinoId) {
                await descontarStock(tx, {
                    productoId: previo.productoId,
                    bodegaId: bodegaDestinoId,
                    cantidad: previo.cantidad,
                    lote: previo.lote,
                    fechaCaducidad: previo.fechaCaducidad,
                    tipoSalida: "A otra bodega",
                    esCompensacion: true
                });
            }

            await descontarStock(tx, {
                productoId: parsed.productoId,
                bodegaId: previo.ordenSalida.bodegaId,
                cantidad: parsed.cantidad,
                lote: parsed.lote,
                fechaCaducidad: parsed.fechaCaducidad,
                tipoSalida: previo.ordenSalida.tipoSalida
            });
            if (esTraspaso && bodegaDestinoId) {
                await devolverStock(tx, {
                    productoId: parsed.productoId,
                    bodegaId: bodegaDestinoId,
                    cantidad: parsed.cantidad,
                    lote: parsed.lote,
                    fechaCaducidad: parsed.fechaCaducidad
                });
            }

            await tx.ordenSalidaDetalle.update({ where: { id: detalleId }, data: parsed });
        });

        await AuditLogger.log({
            usuarioId: user.id,
            centroId: previo.ordenSalida.centroId,
            bodegaId: previo.ordenSalida.bodegaId,
            accion: "actualizar",
            entidad: "OrdenSalidaDetalle",
            entidadId: detalleId,
            detalle: {
                bodegaOrigenId: previo.ordenSalida.bodegaId,
                ...(esTraspaso && bodegaDestinoId ? { bodegaDestinoId } : {})
            }
        });
        revalidatePath("/stock");
        revalidatePath("/orden-salida");
        revalidatePath("/reporte");
        return { ok: true, message: "Detalle de salida actualizado." };
    } catch (error) {
        return { ok: false, message: error instanceof Error ? error.message : "No se pudo actualizar el detalle." };
    }
}

export async function eliminarDetalleSalida(detalleId: string): Promise<ActionState> {
    try {
        const user = await requireSessionUser();
        if (!puedeOperarSalida(user.rol)) {
            return { ok: false, message: "No tienes permiso para eliminar salidas." };
        }

        const detalle = await prisma.ordenSalidaDetalle.findUniqueOrThrow({
            where: { id: detalleId },
            include: { ordenSalida: true }
        });
        await validarCentroBodegaEnAlcance(detalle.ordenSalida.centroId, detalle.ordenSalida.bodegaId);

        const esTraspaso = detalle.ordenSalida.tipoSalida.trim().toLowerCase() === "a otra bodega";
        let bodegaDestinoId: string | null = null;
        if (esTraspaso) {
            bodegaDestinoId = detalle.ordenSalida.bodegaDestinoId;
            if (!bodegaDestinoId) {
                return {
                    ok: false,
                    message: "La orden de traspaso no tiene bodega destino registrada; no es posible revertirla."
                };
            }
        }

        await prisma.$transaction(async (tx) => {
            await devolverStock(tx, {
                productoId: detalle.productoId,
                bodegaId: detalle.ordenSalida.bodegaId,
                cantidad: detalle.cantidad,
                lote: detalle.lote,
                fechaCaducidad: detalle.fechaCaducidad
            });
            if (esTraspaso && bodegaDestinoId) {
                await descontarStock(tx, {
                    productoId: detalle.productoId,
                    bodegaId: bodegaDestinoId,
                    cantidad: detalle.cantidad,
                    lote: detalle.lote,
                    fechaCaducidad: detalle.fechaCaducidad,
                    tipoSalida: "A otra bodega",
                    esCompensacion: true
                });
            }

            await tx.ordenSalidaDetalle.delete({ where: { id: detalleId } });
        });

        await AuditLogger.log({
            usuarioId: user.id,
            centroId: detalle.ordenSalida.centroId,
            bodegaId: detalle.ordenSalida.bodegaId,
            accion: "eliminar",
            entidad: "OrdenSalidaDetalle",
            entidadId: detalleId,
            detalle: {
                bodegaOrigenId: detalle.ordenSalida.bodegaId,
                ...(esTraspaso && bodegaDestinoId ? { bodegaDestinoId } : {})
            }
        });
        revalidatePath("/stock");
        revalidatePath("/orden-salida");
        revalidatePath("/reporte");
        return { ok: true, message: "Detalle de salida eliminado." };
    } catch (error) {
        return { ok: false, message: error instanceof Error ? error.message : "No se pudo eliminar el detalle." };
    }
}

function leerDetallesSalida(formData: FormData): DetalleSalidaForm[] {
    const productos = formData.getAll("productoId");
    const cantidades = formData.getAll("cantidad");
    const lotes = formData.getAll("lote");
    const caducidades = formData.getAll("fechaCaducidad");

    return productos.map((productoId, index) => ({
        productoId: Number(productoId),
        cantidad: Number(cantidades[index]),
        lote: lotes[index]?.toString() ?? "",
        fechaCaducidad: new Date(caducidades[index]?.toString() ?? "")
    }));
}

async function descontarStock(
    tx: Tx,
    input: {
        productoId: number;
        bodegaId: string;
        cantidad: number;
        lote: string;
        fechaCaducidad: Date;
        tipoSalida: string;
        esCompensacion?: boolean;
    }
): Promise<void> {
    const stock = await tx.stock.findUnique({
        where: {
            stock_lote_unico: {
                productoId: input.productoId,
                bodegaId: input.bodegaId,
                lote: input.lote,
                fechaCaducidad: input.fechaCaducidad
            }
        }
    });

    if (!stock || stock.cantidadDisponible <= 0) {
        throw new Error(`El lote "${input.lote}" no tiene stock disponible (saldo: 0).`);
    }

    if (stock.cantidadDisponible < input.cantidad) {
        throw new Error(`Stock insuficiente para el lote "${input.lote}". Solicitado: ${input.cantidad}, disponible: ${stock.cantidadDisponible}.`);
    }

    if (!input.esCompensacion) {
        const validacion = validarSalidaLoteCaducado(input.tipoSalida, stock.fechaCaducidad);
        if (!validacion.valido) {
            throw new Error(validacion.motivo);
        }
    }

    await tx.stock.update({
        where: { id: stock.id },
        data: {
            cantidadDisponible: { decrement: input.cantidad },
            fechaUltimaActualizacion: new Date()
        }
    });
}

async function devolverStock(
    tx: Tx,
    input: { productoId: number; bodegaId: string; cantidad: number; lote: string; fechaCaducidad: Date }
): Promise<void> {
    await tx.stock.upsert({
        where: {
            stock_lote_unico: {
                productoId: input.productoId,
                bodegaId: input.bodegaId,
                lote: input.lote,
                fechaCaducidad: input.fechaCaducidad
            }
        },
        update: {
            cantidadDisponible: { increment: input.cantidad },
            fechaUltimaActualizacion: new Date()
        },
        create: {
            productoId: input.productoId,
            bodegaId: input.bodegaId,
            cantidadDisponible: input.cantidad,
            stockMinimo: 0,
            lote: input.lote,
            fechaCaducidad: input.fechaCaducidad,
            fechaUltimaActualizacion: new Date()
        }
    });
}
