"use server";

// lib
import { requireSessionUser } from "@/shared/lib/auth";
import { prisma } from "@/shared/lib/prisma";

// schemas
import {
    filtroAuditoriaSchema,
    type FiltroAuditoriaInput
} from "@/modules/auditoria/schemas/auditoria.schema";

export async function obtenerFiltrosCatalogoAuditoria() {
    const user = await requireSessionUser();
    if (user.rol !== "R01") {
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
    if (user.rol !== "R01") {
        throw new Error("Solo administradores pueden consultar el registro de auditoría.");
    }

    const filtros = filtroAuditoriaSchema.parse(inputFiltros);
    const where: any = {};

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

    // Filtro por Usuario específico
    if (filtros.usuarioId && filtros.usuarioId !== "todos") {
        where.usuarioId = filtros.usuarioId;
    } else if (filtros.bodegaId && filtros.bodegaId !== "todas") {
        const encargados = await prisma.encargadosBodega.findMany({
            where: { bodegaId: filtros.bodegaId },
            select: { encargadoId: true }
        });
        const usuarioIds = encargados.map((e) => e.encargadoId);
        where.usuarioId = { in: usuarioIds };
    } else if (filtros.centroId && filtros.centroId !== "todos") {
        const usuariosDelCentro = await prisma.usuario.findMany({
            where: { centroId: filtros.centroId },
            select: { id: true }
        });
        const usuarioIds = usuariosDelCentro.map((u) => u.id);
        where.usuarioId = { in: usuarioIds };
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
