"use server";

// lib
import type { Prisma } from "@prisma/client";
import { puedeAdministrar, requireSessionUser } from "@/shared/lib/auth";
import { prisma } from "@/shared/lib/prisma";

// schemas
import {
    filtroAuditoriaSchema,
    type FiltroAuditoriaInput
} from "@/modules/auditoria/schemas/auditoria.schema";

export async function obtenerFiltrosCatalogoAuditoria() {
    const user = await requireSessionUser();
    if (!puedeAdministrar(user.rol)) {
        throw new Error("Solo administradores pueden acceder a los datos de auditoría.");
    }

    const [centros, bodegas, usuarios] = await Promise.all([
        prisma.centro.findMany({
            where: { estado: true },
            select: { id: true, nombre: true },
            orderBy: { nombre: "asc" }
        }),
        prisma.bodega.findMany({
            where: { estado: true },
            select: { id: true, nombre: true, centroId: true },
            orderBy: { nombre: "asc" }
        }),
        prisma.usuario.findMany({
            where: { estado: true },
            select: {
                id: true,
                nombre: true,
                apPaterno: true,
                email: true,
                centroId: true,
                bodegaId: true,
                encargos: {
                    select: { bodegaId: true }
                }
            },
            orderBy: { nombre: "asc" }
        })
    ]);

    return { centros, bodegas, usuarios };
}

export async function consultarLogsAuditoria(inputFiltros: Partial<FiltroAuditoriaInput>) {
    const user = await requireSessionUser();
    if (!puedeAdministrar(user.rol)) {
        throw new Error("Solo administradores pueden consultar el registro de auditoría.");
    }

    const filtros = filtroAuditoriaSchema.parse(inputFiltros);
    const where: Prisma.LogWhereInput = {};

    // Filtro por Rango Temporal
    if (filtros.fechaDesde || filtros.fechaHasta) {
        where.fecha = {};
        if (filtros.fechaDesde) {
            where.fecha.gte = new Date(filtros.fechaDesde);
        }
        if (filtros.fechaHasta) {
            where.fecha.lte = new Date(filtros.fechaHasta);
        }
    }

    // Filtro por Acción
    if (filtros.accion && filtros.accion !== "todas") {
        where.accion = filtros.accion;
    }

    // Filtro por Entidad
    if (filtros.entidad && filtros.entidad !== "todas") {
        where.entidad = filtros.entidad;
    }

    // Filtro Territorial (ubicación real donde ocurrió la acción)
    if (filtros.bodegaId && filtros.bodegaId !== "todas") {
        where.bodegaId = filtros.bodegaId;
    } else if (filtros.centroId && filtros.centroId !== "todos") {
        where.centroId = filtros.centroId;
    }

    // Filtro por Usuario específico (combinable con centro/bodega en Y lógico)
    if (filtros.usuarioId && filtros.usuarioId !== "todos") {
        where.usuarioId = filtros.usuarioId;
    }

    const skip = (filtros.pagina - 1) * filtros.limite;

    const [total, logs] = await Promise.all([
        prisma.log.count({ where }),
        prisma.log.findMany({
            where,
            include: {
                usuario: {
                    select: {
                        id: true,
                        nombre: true,
                        apPaterno: true,
                        email: true,
                        rolId: true
                    }
                }
            },
            orderBy: { fecha: "desc" },
            take: filtros.limite,
            skip
        })
    ]);

    const paginasTotales = Math.max(1, Math.ceil(total / filtros.limite));

    return {
        logs,
        total,
        pagina: filtros.pagina,
        limite: filtros.limite,
        paginasTotales
    };
}

export type AuditoriaLogItem = Awaited<ReturnType<typeof consultarLogsAuditoria>>["logs"][number];

