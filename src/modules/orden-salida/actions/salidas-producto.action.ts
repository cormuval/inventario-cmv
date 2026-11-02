"use server";

import type { Bodega, Centro } from "@prisma/client";

// lib
import { requireSessionUser } from "@/shared/lib/auth";
import { obtenerAlcanceInventario } from "@/shared/lib/inventario-alcance";
import { crearFiltroMovimientosSeleccion } from "@/shared/lib/inventario-alcance-filtros";
import { prisma } from "@/shared/lib/prisma";

// utils
import {
    construirTotalesPorBodega,
    construirTotalesPorTipo,
    mapearTotales,
    type FilaTotalSql,
    type TotalAgrupado
} from "@/modules/orden-salida/utils/salidas-producto-consulta";
import { rangoFechasDb, type FiltrosRegistros } from "@/shared/utils/filtros-registros";
import { calcularPaginacion, type Paginacion } from "@/shared/utils/paginacion";

const MAXIMO_SUGERENCIAS = 20;

export interface ProductoBuscado {
    id: number;
    descripcion: string;
    linea: string;
}

export interface LineaSalidaProducto {
    id: string;
    ordenId: string;
    fecha: Date;
    bodegaNombre: string;
    tipoSalida: string;
    destino: string;
    lote: string;
    cantidad: number;
    usuarioNombre: string;
}

export interface ResultadoSalidasProducto {
    producto: ProductoBuscado | null;
    total: number;
    porBodega: TotalAgrupado[];
    porTipo: TotalAgrupado[];
    lineas: LineaSalidaProducto[];
    paginacion: Paginacion;
    centros: Centro[];
    bodegas: Bodega[];
    centroId: string | null;
    bodegaId: string | null;
    puedeFiltrarCentro: boolean;
}

export async function buscarProductosAction(texto: string): Promise<ProductoBuscado[]> {
    await requireSessionUser();
    const termino = texto.trim();
    const esCodigo = /^\d+$/.test(termino);

    if (termino.length < 2 && !esCodigo) {
        return [];
    }

    return prisma.producto.findMany({
        where: {
            OR: [
                { descripcion: { contains: termino } },
                ...(esCodigo ? [{ id: Number(termino) }] : [])
            ]
        },
        select: { id: true, descripcion: true, linea: true },
        orderBy: { descripcion: "asc" },
        take: MAXIMO_SUGERENCIAS
    });
}

export async function consultarSalidasProducto(
    filtros: FiltrosRegistros,
    productoId: number | undefined
): Promise<ResultadoSalidasProducto> {
    const alcance = await obtenerAlcanceInventario({ centroId: filtros.centroId, bodegaId: filtros.bodegaId });
    const filtroSeleccion = crearFiltroMovimientosSeleccion(alcance);
    const vacio = {
        total: 0,
        porBodega: [],
        porTipo: [],
        lineas: [],
        paginacion: calcularPaginacion(1, 0),
        centros: alcance.centros,
        bodegas: alcance.bodegas,
        centroId: alcance.centroId,
        bodegaId: alcance.bodegaId,
        puedeFiltrarCentro: alcance.puedeFiltrarCentro
    };

    if (!productoId || !filtroSeleccion) {
        return { ...vacio, producto: null };
    }

    const producto = await prisma.producto.findUnique({
        where: { id: productoId },
        select: { id: true, descripcion: true, linea: true }
    });

    if (!producto) {
        return { ...vacio, producto: null };
    }

    const rango = rangoFechasDb(filtros.desde, filtros.hasta);
    const consulta = { productoId, filtroMovimientos: filtroSeleccion, gte: rango.gte, lte: rango.lte };
    const where = { productoId, ordenSalida: { ...filtroSeleccion, fecha: rango } };
    const [filasBodega, filasTipo, totalLineas] = await Promise.all([
        prisma.$queryRaw<FilaTotalSql[]>(construirTotalesPorBodega(consulta)),
        prisma.$queryRaw<FilaTotalSql[]>(construirTotalesPorTipo(consulta)),
        prisma.ordenSalidaDetalle.count({ where })
    ]);
    const porBodega = mapearTotales(filasBodega);
    const paginacion = calcularPaginacion(filtros.pagina, totalLineas);
    const detalles = await prisma.ordenSalidaDetalle.findMany({
        where,
        select: {
            id: true,
            lote: true,
            cantidad: true,
            ordenSalida: {
                select: {
                    id: true,
                    fecha: true,
                    tipoSalida: true,
                    destino: true,
                    bodega: { select: { nombre: true } },
                    usuario: { select: { nombre: true, apPaterno: true } }
                }
            }
        },
        orderBy: [{ ordenSalida: { fecha: "desc" } }, { id: "desc" }],
        skip: paginacion.skip,
        take: paginacion.tamano
    });

    return {
        ...vacio,
        producto,
        total: porBodega.reduce((suma, fila) => suma + fila.cantidad, 0),
        porBodega,
        porTipo: mapearTotales(filasTipo),
        paginacion,
        lineas: detalles.map((detalle) => ({
            id: detalle.id,
            ordenId: detalle.ordenSalida.id,
            fecha: detalle.ordenSalida.fecha,
            bodegaNombre: detalle.ordenSalida.bodega.nombre,
            tipoSalida: detalle.ordenSalida.tipoSalida,
            destino: detalle.ordenSalida.destino,
            lote: detalle.lote,
            cantidad: detalle.cantidad,
            usuarioNombre: [detalle.ordenSalida.usuario.nombre, detalle.ordenSalida.usuario.apPaterno].filter(Boolean).join(" ")
        }))
    };
}
