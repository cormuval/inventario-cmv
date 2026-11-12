"use server";

import { revalidatePath } from "next/cache";
import { Prisma } from "@prisma/client";
import { ZodError } from "zod";

// lib
import { puedeGestionarPedidos, requireSessionUser, type SessionUser } from "@/shared/lib/auth";
import { obtenerAlcanceInventario, validarCentroBodegaEnAlcance } from "@/shared/lib/inventario-alcance";
import { AuditLogger } from "@/shared/lib/logger";
import { prisma } from "@/shared/lib/prisma";

// schemas
import {
    anularPedidoSchema,
    guardarPedidoSchema,
    guardarPlantillaSchema,
    type GuardarPedidoInput,
    type GuardarPlantillaInput
} from "@/modules/pedidos/schemas/pedidos.schema";

// types
import type { ActionState } from "@/shared/types/action-state";

// utils
import { obtenerCatalogoAseo, type ItemCatalogoAseo } from "@/modules/pedidos/utils/catalogo-aseo";
import { generarNumeroPedido } from "@/modules/pedidos/utils/correlativo";
import { construirExcelPedido } from "@/modules/pedidos/utils/pedidos-excel";
import { generarPedidoPDF } from "@/modules/pedidos/utils/pedidos-pdf";

export interface ResultadoDescarga {
    ok: boolean;
    error?: string;
    base64?: string;
    nombreArchivo?: string;
    mimeType?: string;
}

const MAX_INTENTOS_NUMERO = 3;

class ErrorPedido extends Error {}

function mensajeError(error: unknown, porDefecto: string): string {
    if (error instanceof ZodError) {
        return error.issues[0]?.message ?? porDefecto;
    }
    if (error instanceof ErrorPedido) {
        return error.message;
    }
    if (error instanceof Error && /^(No tienes permiso|La bodega seleccionada)/.test(error.message)) {
        return error.message;
    }
    return porDefecto;
}

async function requerirGestor(): Promise<SessionUser> {
    const user = await requireSessionUser();
    if (!puedeGestionarPedidos(user.rol)) {
        throw new ErrorPedido("Tu rol solo permite consultar pedidos de aseo.");
    }
    return user;
}

/** Lectura y gestión exigen que el centro del pedido esté dentro del alcance del usuario. */
async function validarCentroPedido(centroId: string, bodegaId?: string | null): Promise<void> {
    const alcance = await obtenerAlcanceInventario({ centroId });
    if (!alcance.centroIds.includes(centroId)) {
        throw new ErrorPedido("No tienes permiso para operar pedidos de este centro.");
    }
    if (bodegaId) {
        await validarCentroBodegaEnAlcance(centroId, bodegaId);
    }
}

/** Catálogo cerrado: solo productos activos de aseo; descarta las filas en 0. */
function validarDetallesCatalogo(
    detalles: Array<{ productoId: number; cantidadSolicitada: number }>,
    catalogo: ItemCatalogoAseo[]
): Array<{ productoId: number; cantidadSolicitada: number; stockActualMomento: number }> {
    const porProducto = new Map(catalogo.map((item) => [item.productoId, item]));
    return detalles
        .filter((detalle) => detalle.cantidadSolicitada > 0)
        .map((detalle) => {
            const item = porProducto.get(detalle.productoId);
            if (!item) {
                throw new ErrorPedido(`El producto ${detalle.productoId} no pertenece al catálogo de aseo.`);
            }
            return { ...detalle, stockActualMomento: item.stockDisponible };
        });
}

function esNumeroDuplicado(error: unknown): boolean {
    return error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002";
}

function revalidarPedido(pedidoId: string): void {
    revalidatePath("/pedidos");
    revalidatePath(`/pedidos/${pedidoId}`);
}

export async function obtenerCatalogoAseoAction(centroId: string, bodegaId?: string | null): Promise<ItemCatalogoAseo[]> {
    await requireSessionUser();
    await validarCentroPedido(centroId, bodegaId);
    return obtenerCatalogoAseo({ centroId, bodegaId });
}

export async function guardarPedidoAction(input: GuardarPedidoInput): Promise<ActionState & { pedidoId?: string }> {
    try {
        const user = await requerirGestor();
        const parsed = guardarPedidoSchema.parse(input);
        const estado = parsed.finalizar ? "FINALIZADO" : "BORRADOR";
        const periodo = parsed.tipo === "MENSUAL" ? parsed.periodo ?? null : null;
        const observaciones = parsed.observaciones || null;

        if (parsed.pedidoId) {
            // El centro y la bodega de un borrador existente no cambian: se toman de la base.
            const existente = await prisma.pedido.findUnique({
                where: { id: parsed.pedidoId },
                select: { id: true, numero: true, estado: true, centroId: true, bodegaId: true }
            });
            if (!existente) {
                return { ok: false, message: "El pedido no existe." };
            }
            if (existente.estado !== "BORRADOR") {
                return { ok: false, message: "Solo se pueden modificar pedidos en estado borrador." };
            }
            await validarCentroPedido(existente.centroId, existente.bodegaId);

            const catalogo = await obtenerCatalogoAseo({ centroId: existente.centroId, bodegaId: existente.bodegaId });
            const detalles = validarDetallesCatalogo(parsed.detalles, catalogo);

            await prisma.$transaction(async (tx) => {
                // Condicional sobre el estado: si otro usuario lo envió o anuló entretanto, no se pisa.
                const actualizado = await tx.pedido.updateMany({
                    where: { id: existente.id, estado: "BORRADOR" },
                    data: {
                        tipo: parsed.tipo,
                        periodo,
                        observaciones,
                        estado,
                        ...(parsed.finalizar ? { fechaFinalizacion: new Date() } : {})
                    }
                });
                if (actualizado.count !== 1) {
                    throw new ErrorPedido("El pedido ya no está en borrador. Recarga la página.");
                }
                await tx.pedidoDetalle.deleteMany({ where: { pedidoId: existente.id } });
                await tx.pedidoDetalle.createMany({
                    data: detalles.map((detalle) => ({ ...detalle, pedidoId: existente.id }))
                });
            });

            await AuditLogger.log({
                usuarioId: user.id,
                centroId: existente.centroId,
                bodegaId: existente.bodegaId ?? undefined,
                accion: "actualizar",
                entidad: "Pedido",
                entidadId: existente.id,
                detalle: { numero: existente.numero, estado, productos: detalles.length }
            });

            revalidarPedido(existente.id);
            return {
                ok: true,
                message: parsed.finalizar ? `Pedido ${existente.numero} finalizado.` : `Borrador ${existente.numero} guardado.`,
                pedidoId: existente.id
            };
        }

        await validarCentroPedido(parsed.centroId, parsed.bodegaId);
        const catalogo = await obtenerCatalogoAseo({ centroId: parsed.centroId, bodegaId: parsed.bodegaId });
        const detalles = validarDetallesCatalogo(parsed.detalles, catalogo);

        let pedido: { id: string; numero: string } | null = null;
        for (let intento = 1; intento <= MAX_INTENTOS_NUMERO && !pedido; intento++) {
            try {
                pedido = await prisma.$transaction(async (tx) => {
                    const creado = await tx.pedido.create({
                        data: {
                            numero: await generarNumeroPedido(tx),
                            tipo: parsed.tipo,
                            estado,
                            periodo,
                            centroId: parsed.centroId,
                            bodegaId: parsed.bodegaId || null,
                            usuarioSolicitanteId: user.id,
                            observaciones,
                            fechaFinalizacion: parsed.finalizar ? new Date() : null
                        },
                        select: { id: true, numero: true }
                    });
                    await tx.pedidoDetalle.createMany({
                        data: detalles.map((detalle) => ({ ...detalle, pedidoId: creado.id }))
                    });
                    return creado;
                });
            } catch (error: unknown) {
                // Dos pedidos simultáneos pueden calcular el mismo correlativo: se reintenta.
                if (!esNumeroDuplicado(error) || intento === MAX_INTENTOS_NUMERO) {
                    throw error;
                }
            }
        }
        if (!pedido) {
            return { ok: false, message: "No fue posible asignar un número al pedido. Intenta nuevamente." };
        }

        await AuditLogger.log({
            usuarioId: user.id,
            centroId: parsed.centroId,
            bodegaId: parsed.bodegaId ?? undefined,
            accion: "crear",
            entidad: "Pedido",
            entidadId: pedido.id,
            detalle: { numero: pedido.numero, tipo: parsed.tipo, estado, productos: detalles.length }
        });

        revalidarPedido(pedido.id);
        return {
            ok: true,
            message: parsed.finalizar ? `Pedido ${pedido.numero} finalizado.` : `Borrador ${pedido.numero} guardado.`,
            pedidoId: pedido.id
        };
    } catch (error: unknown) {
        return { ok: false, message: mensajeError(error, "No fue posible guardar el pedido.") };
    }
}

export async function anularPedidoAction(pedidoId: string, motivo: string): Promise<ActionState> {
    try {
        const user = await requerirGestor();
        const parsed = anularPedidoSchema.parse({ pedidoId, motivo });

        const pedido = await prisma.pedido.findUnique({
            where: { id: parsed.pedidoId },
            select: { id: true, numero: true, estado: true, centroId: true, bodegaId: true }
        });
        if (!pedido) {
            return { ok: false, message: "El pedido no existe." };
        }
        await validarCentroPedido(pedido.centroId);

        const anulado = await prisma.pedido.updateMany({
            where: { id: pedido.id, estado: { in: ["BORRADOR", "FINALIZADO"] } },
            data: { estado: "ANULADO", motivoAnulacion: parsed.motivo, fechaAnulacion: new Date() }
        });
        if (anulado.count !== 1) {
            return { ok: false, message: "El pedido ya se encuentra anulado." };
        }

        await AuditLogger.log({
            usuarioId: user.id,
            centroId: pedido.centroId,
            bodegaId: pedido.bodegaId ?? undefined,
            accion: "anular",
            entidad: "Pedido",
            entidadId: pedido.id,
            detalle: { numero: pedido.numero, estadoAnterior: pedido.estado, motivo: parsed.motivo }
        });

        revalidarPedido(pedido.id);
        return { ok: true, message: `Pedido ${pedido.numero} anulado.` };
    } catch (error: unknown) {
        return { ok: false, message: mensajeError(error, "No fue posible anular el pedido.") };
    }
}

export async function guardarPlantillaCentroAction(input: GuardarPlantillaInput): Promise<ActionState> {
    try {
        const user = await requerirGestor();
        const parsed = guardarPlantillaSchema.parse(input);
        await validarCentroPedido(parsed.centroId);

        const catalogo = await obtenerCatalogoAseo({ centroId: parsed.centroId });
        const productosAseo = new Set(catalogo.map((item) => item.productoId));
        const ajeno = parsed.items.find((item) => !productosAseo.has(item.productoId));
        if (ajeno) {
            return { ok: false, message: `El producto ${ajeno.productoId} no pertenece al catálogo de aseo.` };
        }

        await prisma.$transaction(
            parsed.items.map((item) =>
                prisma.pedidoPlantillaAseo.upsert({
                    where: { centroId_productoId: { centroId: parsed.centroId, productoId: item.productoId } },
                    update: { cantidadHabitual: item.cantidadHabitual },
                    create: { centroId: parsed.centroId, productoId: item.productoId, cantidadHabitual: item.cantidadHabitual }
                })
            )
        );

        await AuditLogger.log({
            usuarioId: user.id,
            centroId: parsed.centroId,
            accion: "actualizar",
            entidad: "Pedido",
            entidadId: `plantilla-${parsed.centroId}`,
            detalle: { plantilla: true, productos: parsed.items.filter((item) => item.cantidadHabitual > 0).length }
        });

        return { ok: true, message: "Plantilla habitual del centro guardada." };
    } catch (error: unknown) {
        return { ok: false, message: mensajeError(error, "No fue posible guardar la plantilla.") };
    }
}

async function cargarPedidoParaDescarga(pedidoId: string, formato: "pdf" | "excel") {
    const user = await requireSessionUser();
    const pedido = await prisma.pedido.findUnique({
        where: { id: pedidoId },
        include: {
            centro: true,
            bodega: true,
            usuarioSolicitante: true,
            detalles: { include: { producto: true }, orderBy: { producto: { descripcion: "asc" } } }
        }
    });
    if (!pedido) {
        return null;
    }
    await validarCentroPedido(pedido.centroId);

    await AuditLogger.log({
        usuarioId: user.id,
        centroId: pedido.centroId,
        bodegaId: pedido.bodegaId ?? undefined,
        accion: "exportar",
        entidad: "Pedido",
        entidadId: pedido.id,
        detalle: { numero: pedido.numero, formato }
    });
    return pedido;
}

export async function descargarPedidoPdfAction(pedidoId: string): Promise<ResultadoDescarga> {
    try {
        const pedido = await cargarPedidoParaDescarga(pedidoId, "pdf");
        if (!pedido) {
            return { ok: false, error: "Pedido no encontrado." };
        }
        const buffer = await generarPedidoPDF(pedido);
        return {
            ok: true,
            base64: buffer.toString("base64"),
            nombreArchivo: `${pedido.numero}.pdf`,
            mimeType: "application/pdf"
        };
    } catch (error: unknown) {
        return { ok: false, error: mensajeError(error, "No fue posible generar el PDF.") };
    }
}

export async function descargarPedidoExcelAction(pedidoId: string): Promise<ResultadoDescarga> {
    try {
        const pedido = await cargarPedidoParaDescarga(pedidoId, "excel");
        if (!pedido) {
            return { ok: false, error: "Pedido no encontrado." };
        }
        const buffer = await construirExcelPedido(pedido);
        return {
            ok: true,
            base64: buffer.toString("base64"),
            nombreArchivo: `${pedido.numero}.xlsx`,
            mimeType: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
        };
    } catch (error: unknown) {
        return { ok: false, error: mensajeError(error, "No fue posible generar el Excel.") };
    }
}
