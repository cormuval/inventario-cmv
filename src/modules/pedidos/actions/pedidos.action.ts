"use server";

import { revalidatePath } from "next/cache";

// lib
import { requireSessionUser } from "@/shared/lib/auth";
import { obtenerAlcanceInventario, validarCentroBodegaEnAlcance } from "@/shared/lib/inventario-alcance";
import { AuditLogger } from "@/shared/lib/logger";
import { prisma } from "@/shared/lib/prisma";

// schemas
import {
    anularPedidoSchema,
    crearPedidoSchema,
    guardarBorradorSchema,
    guardarPlantillaSchema,
    revisarPedidoSchema,
    type CrearPedidoInput,
    type GuardarBorradorInput,
    type GuardarPlantillaInput,
    type RevisarPedidoInput
} from "@/modules/pedidos/schemas/pedidos.schema";

// types
import type { ActionState } from "@/shared/types/action-state";

// utils
import { obtenerCatalogoAseo } from "@/modules/pedidos/utils/catalogo-aseo";
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

export async function obtenerCatalogoAseoAction(centroId: string, bodegaId?: string | null) {
    await requireSessionUser();
    return obtenerCatalogoAseo({ centroId, bodegaId });
}

export async function crearPedidoAction(input: CrearPedidoInput): Promise<ActionState & { pedidoId?: string }> {
    try {
        const user = await requireSessionUser();
        const parsed = crearPedidoSchema.parse(input);

        // Validar alcance sobre el centro
        const alcance = await obtenerAlcanceInventario({ centroId: parsed.centroId, bodegaId: parsed.bodegaId ?? undefined });
        if (!alcance.centroIds.includes(parsed.centroId)) {
            return { ok: false, message: "No tienes permiso para solicitar pedidos en el centro indicado." };
        }
        if (parsed.bodegaId) {
            await validarCentroBodegaEnAlcance(parsed.centroId, parsed.bodegaId);
        }

        const estado = parsed.enviarInmediatamente ? "ENVIADO" : "BORRADOR";

        // Obtener foto de stock actual y mínimo para cada producto
        const catalogo = await obtenerCatalogoAseo({ centroId: parsed.centroId, bodegaId: parsed.bodegaId });
        const stockPorProducto = new Map(catalogo.map((c) => [c.productoId, c]));

        const nuevoPedido = await prisma.$transaction(async (tx) => {
            const numero = await generarNumeroPedido(tx);

            const pedido = await tx.pedido.create({
                data: {
                    numero,
                    tipo: parsed.tipo,
                    estado,
                    periodo: parsed.periodo ?? null,
                    centroId: parsed.centroId,
                    bodegaId: parsed.bodegaId ?? null,
                    usuarioSolicitanteId: user.id,
                    observaciones: parsed.observaciones ?? null
                }
            });

            for (const item of parsed.detalles) {
                if (item.cantidadSolicitada <= 0 && !parsed.enviarInmediatamente) {
                    continue; // En borrador se pueden omitir filas en 0
                }
                const info = stockPorProducto.get(item.productoId);
                await tx.pedidoDetalle.create({
                    data: {
                        pedidoId: pedido.id,
                        productoId: item.productoId,
                        cantidadSolicitada: item.cantidadSolicitada,
                        stockActualMomento: info?.stockDisponible ?? 0,
                        stockMinimoMomento: info?.stockMinimo ?? 0
                    }
                });
            }

            return pedido;
        });

        await AuditLogger.log({
            usuarioId: user.id,
            centroId: parsed.centroId,
            bodegaId: parsed.bodegaId ?? undefined,
            accion: "crear",
            entidad: "Pedido",
            entidadId: nuevoPedido.id,
            detalle: {
                numero: nuevoPedido.numero,
                tipo: nuevoPedido.tipo,
                estado: nuevoPedido.estado,
                detalles: parsed.detalles.length
            }
        });

        revalidatePath("/pedidos");
        return {
            ok: true,
            message: parsed.enviarInmediatamente
                ? `Pedido ${nuevoPedido.numero} enviado correctamente a Adquisiciones.`
                : `Borrador ${nuevoPedido.numero} guardado correctamente.`,
            pedidoId: nuevoPedido.id
        };
    } catch (error: unknown) {
        return {
            ok: false,
            message: error instanceof Error ? error.message : "Error inesperado al crear el pedido."
        };
    }
}

export async function guardarBorradorPedidoAction(input: GuardarBorradorInput): Promise<ActionState & { pedidoId?: string }> {
    try {
        const user = await requireSessionUser();
        const parsed = guardarBorradorSchema.parse(input);

        const alcance = await obtenerAlcanceInventario({ centroId: parsed.centroId, bodegaId: parsed.bodegaId ?? undefined });
        if (!alcance.centroIds.includes(parsed.centroId)) {
            return { ok: false, message: "No tienes permiso para operar en este centro." };
        }

        const catalogo = await obtenerCatalogoAseo({ centroId: parsed.centroId, bodegaId: parsed.bodegaId });
        const stockPorProducto = new Map(catalogo.map((c) => [c.productoId, c]));

        if (parsed.pedidoId) {
            // Actualizar borrador existente
            const pedidoExistente = await prisma.pedido.findUnique({
                where: { id: parsed.pedidoId }
            });

            if (!pedidoExistente) {
                return { ok: false, message: "El pedido especificado no existe." };
            }
            if (pedidoExistente.estado !== "BORRADOR") {
                return { ok: false, message: "Solo se pueden editar pedidos en estado BORRADOR." };
            }

            await prisma.$transaction(async (tx) => {
                await tx.pedido.update({
                    where: { id: pedidoExistente.id },
                    data: {
                        tipo: parsed.tipo,
                        periodo: parsed.periodo ?? null,
                        observaciones: parsed.observaciones ?? null
                    }
                });

                // Reemplazar detalles
                await tx.pedidoDetalle.deleteMany({
                    where: { pedidoId: pedidoExistente.id }
                });

                for (const item of parsed.detalles) {
                    const info = stockPorProducto.get(item.productoId);
                    await tx.pedidoDetalle.create({
                        data: {
                            pedidoId: pedidoExistente.id,
                            productoId: item.productoId,
                            cantidadSolicitada: item.cantidadSolicitada,
                            stockActualMomento: info?.stockDisponible ?? 0,
                            stockMinimoMomento: info?.stockMinimo ?? 0
                        }
                    });
                }
            });

            revalidatePath(`/pedidos/${pedidoExistente.id}`);
            revalidatePath("/pedidos");
            return { ok: true, message: `Borrador ${pedidoExistente.numero} actualizado.`, pedidoId: pedidoExistente.id };
        }

        // Crear nuevo borrador
        return crearPedidoAction({
            ...parsed,
            enviarInmediatamente: false
        });
    } catch (error: unknown) {
        return {
            ok: false,
            message: error instanceof Error ? error.message : "Error al guardar el borrador."
        };
    }
}

export async function enviarPedidoAction(pedidoId: string): Promise<ActionState> {
    try {
        const user = await requireSessionUser();
        const pedido = await prisma.pedido.findUnique({
            where: { id: pedidoId },
            include: { detalles: true }
        });

        if (!pedido) {
            return { ok: false, message: "El pedido no existe." };
        }
        if (pedido.estado !== "BORRADOR") {
            return { ok: false, message: "Solo se pueden enviar pedidos en estado BORRADOR." };
        }
        if (pedido.detalles.length === 0) {
            return { ok: false, message: "El pedido no contiene ningún producto de aseo." };
        }

        await validarCentroBodegaEnAlcance(pedido.centroId, pedido.bodegaId ?? undefined as never);

        await prisma.pedido.update({
            where: { id: pedido.id },
            data: {
                estado: "ENVIADO",
                fechaSolicitud: new Date()
            }
        });

        await AuditLogger.log({
            usuarioId: user.id,
            centroId: pedido.centroId,
            bodegaId: pedido.bodegaId ?? undefined,
            accion: "enviar",
            entidad: "Pedido",
            entidadId: pedido.id,
            detalle: { numero: pedido.numero, estado: "ENVIADO" }
        });

        revalidatePath(`/pedidos/${pedido.id}`);
        revalidatePath("/pedidos");
        return { ok: true, message: `Pedido ${pedido.numero} enviado a Adquisiciones.` };
    } catch (error: unknown) {
        return {
            ok: false,
            message: error instanceof Error ? error.message : "Error al enviar el pedido."
        };
    }
}

export async function revisarPedidoAction(input: RevisarPedidoInput): Promise<ActionState> {
    try {
        const user = await requireSessionUser();
        if (user.rol !== "R01") {
            return { ok: false, message: "Solo el personal de Adquisiciones/Administración puede revisar y aprobar pedidos." };
        }

        const parsed = revisarPedidoSchema.parse(input);
        const pedido = await prisma.pedido.findUnique({
            where: { id: parsed.pedidoId },
            include: { detalles: true }
        });

        if (!pedido) {
            return { ok: false, message: "El pedido no existe." };
        }
        if (pedido.estado !== "ENVIADO") {
            return { ok: false, message: "Solo se pueden revisar pedidos en estado ENVIADO." };
        }

        const detallesMap = new Map(pedido.detalles.map((d) => [d.id, d]));

        // Validar que si la cantidad aprobada difiere de la solicitada, se provea observación
        for (const ajuste of parsed.ajustes) {
            const original = detallesMap.get(ajuste.detalleId);
            if (!original) continue;

            if (ajuste.cantidadAprobada !== original.cantidadSolicitada) {
                const obs = ajuste.observacionAjuste?.trim();
                if (!obs || obs.length < 3) {
                    return {
                        ok: false,
                        message: `Debe indicar una justificación de ajuste para el producto ID ${original.productoId} (modificado de ${original.cantidadSolicitada} a ${ajuste.cantidadAprobada}).`
                    };
                }
            }
        }

        await prisma.$transaction(async (tx) => {
            await tx.pedido.update({
                where: { id: pedido.id },
                data: {
                    estado: "REVISADO",
                    usuarioRevisionId: user.id,
                    fechaRevision: new Date(),
                    observacionesRevision: parsed.observacionesRevision ?? null
                }
            });

            for (const ajuste of parsed.ajustes) {
                await tx.pedidoDetalle.update({
                    where: { id: ajuste.detalleId },
                    data: {
                        cantidadAprobada: ajuste.cantidadAprobada,
                        observacionAjuste: ajuste.observacionAjuste ?? null
                    }
                });
            }
        });

        await AuditLogger.log({
            usuarioId: user.id,
            centroId: pedido.centroId,
            bodegaId: pedido.bodegaId ?? undefined,
            accion: "revisar",
            entidad: "Pedido",
            entidadId: pedido.id,
            detalle: {
                numero: pedido.numero,
                estado: "REVISADO",
                observaciones: parsed.observacionesRevision
            }
        });

        revalidatePath(`/pedidos/${pedido.id}`);
        revalidatePath("/pedidos");
        return { ok: true, message: `Pedido ${pedido.numero} revisado y aprobado formalmente.` };
    } catch (error: unknown) {
        return {
            ok: false,
            message: error instanceof Error ? error.message : "Error al revisar el pedido."
        };
    }
}

export async function anularPedidoAction(pedidoId: string, motivo: string): Promise<ActionState> {
    try {
        const user = await requireSessionUser();
        const parsed = anularPedidoSchema.parse({ pedidoId, motivo });

        const pedido = await prisma.pedido.findUnique({
            where: { id: parsed.pedidoId }
        });

        if (!pedido) {
            return { ok: false, message: "El pedido no existe." };
        }
        if (pedido.estado === "ANULADO") {
            return { ok: false, message: "El pedido ya se encuentra anulado." };
        }

        const alcance = await obtenerAlcanceInventario({ centroId: pedido.centroId });
        if (!alcance.centroIds.includes(pedido.centroId) && user.rol !== "R01") {
            return { ok: false, message: "No tienes permiso para anular este pedido." };
        }

        await prisma.pedido.update({
            where: { id: pedido.id },
            data: {
                estado: "ANULADO",
                observacionesRevision: `Anulado: ${parsed.motivo}`
            }
        });

        await AuditLogger.log({
            usuarioId: user.id,
            centroId: pedido.centroId,
            bodegaId: pedido.bodegaId ?? undefined,
            accion: "anular",
            entidad: "Pedido",
            entidadId: pedido.id,
            detalle: { numero: pedido.numero, motivo: parsed.motivo }
        });

        revalidatePath(`/pedidos/${pedido.id}`);
        revalidatePath("/pedidos");
        return { ok: true, message: `Pedido ${pedido.numero} anulado.` };
    } catch (error: unknown) {
        return {
            ok: false,
            message: error instanceof Error ? error.message : "Error al anular el pedido."
        };
    }
}

export async function guardarPlantillaCentroAction(input: GuardarPlantillaInput): Promise<ActionState> {
    try {
        const user = await requireSessionUser();
        const parsed = guardarPlantillaSchema.parse(input);

        const alcance = await obtenerAlcanceInventario({ centroId: parsed.centroId });
        if (!alcance.centroIds.includes(parsed.centroId) && user.rol !== "R01") {
            return { ok: false, message: "No tienes permiso para configurar la plantilla de este centro." };
        }

        await prisma.$transaction(async (tx) => {
            for (const item of parsed.items) {
                await tx.pedidoPlantillaAseo.upsert({
                    where: {
                        centroId_productoId: {
                            centroId: parsed.centroId,
                            productoId: item.productoId
                        }
                    },
                    update: {
                        cantidadHabitual: item.cantidadHabitual
                    },
                    create: {
                        centroId: parsed.centroId,
                        productoId: item.productoId,
                        cantidadHabitual: item.cantidadHabitual
                    }
                });
            }
        });

        return { ok: true, message: "Plantilla habitual de aseo guardada con éxito." };
    } catch (error: unknown) {
        return {
            ok: false,
            message: error instanceof Error ? error.message : "Error al guardar la plantilla."
        };
    }
}

export async function descargarPedidoPdfAction(pedidoId: string): Promise<ResultadoDescarga> {
    try {
        await requireSessionUser();
        const pedido = await prisma.pedido.findUnique({
            where: { id: pedidoId },
            include: {
                centro: true,
                bodega: true,
                usuarioSolicitante: true,
                usuarioRevision: true,
                detalles: {
                    include: {
                        producto: true
                    }
                }
            }
        });

        if (!pedido) {
            return { ok: false, error: "Pedido no encontrado." };
        }

        const buffer = await generarPedidoPDF(pedido);
        const base64 = buffer.toString("base64");
        const nombreArchivo = `${pedido.numero}-${pedido.estado.toLowerCase()}.pdf`;

        return {
            ok: true,
            base64,
            nombreArchivo,
            mimeType: "application/pdf"
        };
    } catch (error: unknown) {
        return {
            ok: false,
            error: error instanceof Error ? error.message : "Error al generar PDF."
        };
    }
}

export async function descargarPedidoExcelAction(pedidoId: string): Promise<ResultadoDescarga> {
    try {
        await requireSessionUser();
        const pedido = await prisma.pedido.findUnique({
            where: { id: pedidoId },
            include: {
                centro: true,
                bodega: true,
                usuarioSolicitante: true,
                usuarioRevision: true,
                detalles: {
                    include: {
                        producto: true
                    }
                }
            }
        });

        if (!pedido) {
            return { ok: false, error: "Pedido no encontrado." };
        }

        const buffer = await construirExcelPedido(pedido);
        const base64 = buffer.toString("base64");
        const nombreArchivo = `${pedido.numero}-${pedido.estado.toLowerCase()}.xlsx`;

        return {
            ok: true,
            base64,
            nombreArchivo,
            mimeType: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
        };
    } catch (error: unknown) {
        return {
            ok: false,
            error: error instanceof Error ? error.message : "Error al generar Excel."
        };
    }
}

