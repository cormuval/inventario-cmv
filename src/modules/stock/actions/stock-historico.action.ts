"use server";

// lib
import { requireSessionUser } from "@/shared/lib/auth";
import { obtenerAlcanceInventario, validarCentroBodegaEnAlcance } from "@/shared/lib/inventario-alcance";
import { prisma } from "@/shared/lib/prisma";

// utils
import {
    consultarStockHistoricoDb,
    type CalculoEvolucionResult
} from "@/modules/stock/utils/stock-historico-consulta";

export interface StockHistoricoInput {
    productoId?: number;
    centroId?: string | null;
    bodegaId?: string | null;
    fechaDesde?: string | null;
    fechaHasta?: string | null;
}

export interface ProductoBusquedaResult {
    id: number;
    descripcion: string;
    linea: string;
}

export interface StockHistoricoActionResult {
    ok: boolean;
    error?: string;
    data?: {
        producto: {
            id: number;
            descripcion: string;
            linea: string;
        };
        centroId: string | null;
        bodegaId: string | null;
        centroNombre?: string;
        bodegaNombre?: string;
        centros: Array<{ id: string; nombre: string }>;
        bodegas: Array<{ id: string; nombre: string; centroId: string }>;
        puedeFiltrarCentro: boolean;
        fechaDesde: string;
        fechaHasta: string;
        resultado: CalculoEvolucionResult;
    };
}

export async function buscarProductosHistoricoAction(busqueda: string): Promise<ProductoBusquedaResult[]> {
    await requireSessionUser();

    const termino = busqueda?.trim() ?? "";
    if (termino.length < 2) {
        return [];
    }

    const esNumero = /^\d+$/.test(termino);

    return prisma.producto.findMany({
        where: esNumero
            ? {
                  OR: [{ id: Number(termino) }, { descripcion: { contains: termino } }]
              }
            : {
                  descripcion: { contains: termino }
              },
        select: {
            id: true,
            descripcion: true,
            linea: true
        },
        orderBy: { descripcion: "asc" },
        take: 20
    });
}

function parsearFechaInicio(fechaStr?: string | null): Date {
    if (fechaStr && /^\d{4}-\d{2}-\d{2}$/.test(fechaStr)) {
        const [año, mes, dia] = fechaStr.split("-").map(Number);
        return new Date(año, mes - 1, dia, 0, 0, 0, 0);
    }
    const d = new Date();
    d.setDate(d.getDate() - 30);
    d.setHours(0, 0, 0, 0);
    return d;
}

function parsearFechaFin(fechaStr?: string | null): Date {
    if (fechaStr && /^\d{4}-\d{2}-\d{2}$/.test(fechaStr)) {
        const [año, mes, dia] = fechaStr.split("-").map(Number);
        return new Date(año, mes - 1, dia, 23, 59, 59, 999);
    }
    const d = new Date();
    d.setHours(23, 59, 59, 999);
    return d;
}

function formatearFechaIso(fecha: Date): string {
    const año = fecha.getFullYear();
    const mes = String(fecha.getMonth() + 1).padStart(2, "0");
    const dia = String(fecha.getDate()).padStart(2, "0");
    return `${año}-${mes}-${dia}`;
}

export async function consultarStockHistoricoAction(input: StockHistoricoInput): Promise<StockHistoricoActionResult> {
    try {
        await requireSessionUser();

        if (!input.productoId || input.productoId <= 0) {
            return { ok: false, error: "Debe seleccionar un producto válido para consultar su stock histórico." };
        }

        const alcance = await obtenerAlcanceInventario({
            centroId: input.centroId ?? undefined,
            bodegaId: input.bodegaId ?? undefined
        });

        if (alcance.bodegaIds.length === 0) {
            return { ok: false, error: "No tiene bodegas asignadas o disponibles en su alcance de usuario." };
        }

        // Si se especificó centro y bodega, validar estrictamente
        if (input.centroId && input.bodegaId) {
            await validarCentroBodegaEnAlcance(input.centroId, input.bodegaId);
        }

        // Determinar bodegas a consultar
        let bodegasConsultaIds: string[] = [];
        if (input.bodegaId) {
            if (!alcance.bodegaIds.includes(input.bodegaId)) {
                return { ok: false, error: "La bodega seleccionada está fuera de su alcance." };
            }
            bodegasConsultaIds = [input.bodegaId];
        } else if (input.centroId) {
            bodegasConsultaIds = alcance.bodegas
                .filter((b) => b.centroId === input.centroId && alcance.bodegaIds.includes(b.id))
                .map((b) => b.id);
        } else {
            bodegasConsultaIds = alcance.bodegaIds;
        }

        const producto = await prisma.producto.findUnique({
            where: { id: input.productoId },
            select: { id: true, descripcion: true, linea: true }
        });

        if (!producto) {
            return { ok: false, error: "El producto seleccionado no existe." };
        }

        const fechaDesde = parsearFechaInicio(input.fechaDesde);
        const fechaHasta = parsearFechaFin(input.fechaHasta);

        if (fechaDesde.getTime() > fechaHasta.getTime()) {
            return { ok: false, error: "La fecha inicial no puede ser posterior a la fecha final." };
        }

        const resultado = await consultarStockHistoricoDb({
            productoId: producto.id,
            bodegaIds: bodegasConsultaIds,
            fechaDesde,
            fechaHasta
        });

        const centroNombre = input.centroId
            ? alcance.centros.find((c) => c.id === input.centroId)?.nombre
            : undefined;
        const bodegaNombre = input.bodegaId
            ? alcance.bodegas.find((b) => b.id === input.bodegaId)?.nombre
            : undefined;

        return {
            ok: true,
            data: {
                producto,
                centroId: input.centroId ?? alcance.centroId,
                bodegaId: input.bodegaId ?? alcance.bodegaId,
                centroNombre,
                bodegaNombre,
                centros: alcance.centros.map((c) => ({ id: c.id, nombre: c.nombre })),
                bodegas: alcance.bodegas.map((b) => ({ id: b.id, nombre: b.nombre, centroId: b.centroId })),
                puedeFiltrarCentro: alcance.puedeFiltrarCentro,
                fechaDesde: formatearFechaIso(fechaDesde),
                fechaHasta: formatearFechaIso(fechaHasta),
                resultado
            }
        };
    } catch (err: unknown) {
        return {
            ok: false,
            error: err instanceof Error ? err.message : "Error inesperado al consultar el stock histórico."
        };
    }
}

