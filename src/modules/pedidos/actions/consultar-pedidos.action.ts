"use server";

import type { Prisma } from "@prisma/client";

// lib
import { requireSessionUser } from "@/shared/lib/auth";
import { obtenerAlcanceInventario } from "@/shared/lib/inventario-alcance";
import { prisma } from "@/shared/lib/prisma";

// utils
import { calcularPaginacion, type Paginacion } from "@/shared/utils/paginacion";

export interface FiltrosListarPedidos {
    centroId?: string;
    tipo?: string;
    estado?: string;
    periodo?: string;
    busqueda?: string;
    pagina?: number;
}

export interface PedidoFilaLista {
    id: string;
    numero: string;
    tipo: string;
    estado: string;
    periodo: string | null;
    fechaSolicitud: Date;
    centroNombre: string;
    bodegaNombre: string | null;
    solicitanteNombre: string;
    totalItems: number;
    totalUnidadesSolicitadas: number;
    totalUnidadesAprobadas: number | null;
}

export interface ResultadoListarPedidos {
    centros: Array<{ id: string; nombre: string }>;
    centroId: string | null;
    puedeFiltrarCentro: boolean;
    esAdquisiciones: boolean;
    pedidos: PedidoFilaLista[];
    paginacion: Paginacion;
}

export async function listarPedidosAction(filtros: FiltrosListarPedidos = {}): Promise<ResultadoListarPedidos> {
    const user = await requireSessionUser();
    const alcance = await obtenerAlcanceInventario({ centroId: filtros.centroId });

    const esAdquisiciones = user.rol === "R01";
    const pagina = filtros.pagina && filtros.pagina > 0 ? filtros.pagina : 1;

    if (alcance.centroIds.length === 0) {
        return {
            centros: alcance.centros,
            centroId: alcance.centroId,
            puedeFiltrarCentro: alcance.puedeFiltrarCentro,
            esAdquisiciones,
            pedidos: [],
            paginacion: calcularPaginacion(pagina, 0)
        };
    }

    const where: Prisma.PedidoWhereInput = {
        centroId: { in: alcance.centroIds }
    };

    if (filtros.centroId && alcance.centroIds.includes(filtros.centroId)) {
        where.centroId = filtros.centroId;
    }
    if (filtros.tipo) {
        where.tipo = filtros.tipo;
    }
    if (filtros.estado) {
        where.estado = filtros.estado;
    }
    if (filtros.periodo) {
        where.periodo = filtros.periodo;
    }
    if (filtros.busqueda && filtros.busqueda.trim().length > 0) {
        const termino = filtros.busqueda.trim();
        where.OR = [
            { numero: { contains: termino } },
            { observaciones: { contains: termino } }
        ];
    }

    const total = await prisma.pedido.count({ where });
    const paginacion = calcularPaginacion(pagina, total);

    const pedidosDb = await prisma.pedido.findMany({
        where,
        include: {
            centro: { select: { nombre: true } },
            bodega: { select: { nombre: true } },
            usuarioSolicitante: { select: { nombre: true, apPaterno: true } },
            detalles: {
                select: {
                    cantidadSolicitada: true,
                    cantidadAprobada: true
                }
            }
        },
        orderBy: [{ fechaSolicitud: "desc" }, { numero: "desc" }],
        skip: paginacion.skip,
        take: paginacion.tamano
    });

    const pedidos: PedidoFilaLista[] = pedidosDb.map((p) => {
        const totalItems = p.detalles.length;
        const totalUnidadesSolicitadas = p.detalles.reduce((acc, d) => acc + d.cantidadSolicitada, 0);
        const tieneAprobadas = p.detalles.some((d) => d.cantidadAprobada !== null);
        const totalUnidadesAprobadas = tieneAprobadas
            ? p.detalles.reduce((acc, d) => acc + (d.cantidadAprobada ?? d.cantidadSolicitada), 0)
            : null;

        const solicitante = `${p.usuarioSolicitante.nombre} ${p.usuarioSolicitante.apPaterno ?? ""}`.trim();

        return {
            id: p.id,
            numero: p.numero,
            tipo: p.tipo,
            estado: p.estado,
            periodo: p.periodo,
            fechaSolicitud: p.fechaSolicitud,
            centroNombre: p.centro.nombre,
            bodegaNombre: p.bodega?.nombre ?? null,
            solicitanteNombre: solicitante,
            totalItems,
            totalUnidadesSolicitadas,
            totalUnidadesAprobadas
        };
    });

    return {
        centros: alcance.centros.map((c) => ({ id: c.id, nombre: c.nombre })),
        centroId: alcance.centroId,
        puedeFiltrarCentro: alcance.puedeFiltrarCentro,
        esAdquisiciones,
        pedidos,
        paginacion
    };
}

export async function obtenerPedidoPorIdAction(pedidoId: string) {
    const user = await requireSessionUser();
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
                },
                orderBy: {
                    producto: {
                        descripcion: "asc"
                    }
                }
            }
        }
    });

    if (!pedido) {
        return null;
    }

    const alcance = await obtenerAlcanceInventario({ centroId: pedido.centroId });
    if (!alcance.centroIds.includes(pedido.centroId) && user.rol !== "R01") {
        throw new Error("No tienes permiso para ver este pedido.");
    }

    return {
        ...pedido,
        esRevisor: user.rol === "R01"
    };
}

