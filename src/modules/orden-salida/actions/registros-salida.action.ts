"use server";

// lib
import { puedeOperarSalida } from "@/shared/lib/auth";
import { obtenerAlcanceInventario } from "@/shared/lib/inventario-alcance";
import { crearFiltroMovimientosAlcance, crearFiltroMovimientosSeleccion } from "@/shared/lib/inventario-alcance-filtros";
import { prisma } from "@/shared/lib/prisma";

// types
import type { DetalleOrdenResultado, ResultadoRegistros } from "@/shared/types/registros";

// utils
import { rangoFechasDb, type FiltrosRegistros } from "@/shared/utils/filtros-registros";
import { calcularPaginacion } from "@/shared/utils/paginacion";
import { indexarResumenDetalles } from "@/shared/utils/registros";

export interface RegistroSalidaFila {
    id: string;
    fecha: Date;
    tipoSalida: string;
    destino: string;
    bodegaNombre: string;
    usuarioNombre: string;
    productos: number;
    unidades: number;
    enviarCorreo: boolean;
    fechaEnvioCorreo: Date | null;
    errorEnvioCorreo: string | null;
    correoDestino: string | null;
}

export async function listarRegistrosSalida(filtros: FiltrosRegistros): Promise<ResultadoRegistros<RegistroSalidaFila>> {
    const alcance = await obtenerAlcanceInventario({ centroId: filtros.centroId, bodegaId: filtros.bodegaId });
    const filtroSeleccion = crearFiltroMovimientosSeleccion(alcance);
    const base = {
        centros: alcance.centros,
        bodegas: alcance.bodegas,
        centroId: alcance.centroId,
        bodegaId: alcance.bodegaId,
        puedeFiltrarCentro: alcance.puedeFiltrarCentro,
        puedeOperar: puedeOperarSalida(alcance.usuario.rol)
    };

    if (!filtroSeleccion) {
        return { ...base, filas: [], paginacion: calcularPaginacion(1, 0) };
    }

    const where = { ...filtroSeleccion, fecha: rangoFechasDb(filtros.desde, filtros.hasta) };
    const total = await prisma.ordenSalida.count({ where });
    const paginacion = calcularPaginacion(filtros.pagina, total);
    const ordenes = await prisma.ordenSalida.findMany({
        where,
        select: {
            id: true,
            fecha: true,
            tipoSalida: true,
            destino: true,
            enviarCorreo: true,
            fechaEnvioCorreo: true,
            errorEnvioCorreo: true,
            correoDestino: true,
            bodega: { select: { nombre: true } },
            usuario: { select: { nombre: true, apPaterno: true } }
        },
        orderBy: [{ fecha: "desc" }, { id: "desc" }],
        skip: paginacion.skip,
        take: paginacion.tamano
    });
    const grupos = ordenes.length > 0
        ? await prisma.ordenSalidaDetalle.groupBy({
              by: ["ordenSalidaId"],
              where: { ordenSalidaId: { in: ordenes.map((orden) => orden.id) } },
              _count: { _all: true },
              _sum: { cantidad: true }
          })
        : [];
    const resumen = indexarResumenDetalles(
        grupos.map((grupo) => ({ ordenId: grupo.ordenSalidaId, productos: grupo._count._all, unidades: grupo._sum.cantidad }))
    );

    return {
        ...base,
        paginacion,
        filas: ordenes.map((orden) => ({
            id: orden.id,
            fecha: orden.fecha,
            tipoSalida: orden.tipoSalida,
            destino: orden.destino,
            bodegaNombre: orden.bodega.nombre,
            usuarioNombre: [orden.usuario.nombre, orden.usuario.apPaterno].filter(Boolean).join(" "),
            enviarCorreo: orden.enviarCorreo,
            fechaEnvioCorreo: orden.fechaEnvioCorreo,
            errorEnvioCorreo: orden.errorEnvioCorreo,
            correoDestino: orden.correoDestino,
            ...(resumen.get(orden.id) ?? { productos: 0, unidades: 0 })
        }))
    };
}

export async function obtenerDetalleOrdenSalida(ordenId: string): Promise<DetalleOrdenResultado> {
    try {
        const filtro = crearFiltroMovimientosAlcance(await obtenerAlcanceInventario());

        if (!filtro) {
            return { ok: false, message: "No tienes centro o bodega asignada.", lineas: [] };
        }

        const orden = await prisma.ordenSalida.findFirst({
            where: { id: ordenId, ...filtro },
            select: {
                detalles: {
                    select: {
                        id: true,
                        productoId: true,
                        lote: true,
                        fechaCaducidad: true,
                        cantidad: true,
                        producto: { select: { descripcion: true } }
                    },
                    orderBy: { producto: { descripcion: "asc" } }
                }
            }
        });

        if (!orden) {
            return { ok: false, message: "Orden no encontrada.", lineas: [] };
        }

        return {
            ok: true,
            message: "",
            lineas: orden.detalles.map((detalle) => ({
                id: detalle.id,
                productoId: detalle.productoId,
                producto: detalle.producto.descripcion,
                lote: detalle.lote,
                fechaCaducidad: detalle.fechaCaducidad,
                cantidad: detalle.cantidad
            }))
        };
    } catch {
        return { ok: false, message: "No fue posible cargar el detalle de la orden.", lineas: [] };
    }
}

