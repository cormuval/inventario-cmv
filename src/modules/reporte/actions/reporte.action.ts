"use server";

// lib
import { obtenerAlcanceInventario, type InventarioAlcance } from "@/shared/lib/inventario-alcance";
import { crearFiltroMovimientosSeleccion } from "@/shared/lib/inventario-alcance-filtros";
import { AuditLogger } from "@/shared/lib/logger";
import { prisma } from "@/shared/lib/prisma";

// utils
import { construirArbol, type NodoCentro } from "@/modules/reporte/utils/arbol";
import { construirExcelReporte, nombreArchivoReporte } from "@/modules/reporte/utils/excel-reporte";
import { columnasDelPeriodo, leerFiltrosReporte, rangoDelPeriodo, type ColumnaMes, type FiltrosReporte } from "@/modules/reporte/utils/periodo";
import {
    armarFilasReporte,
    construirClavesReporte,
    construirConsumoReporte,
    construirConteoReporte,
    type ConsultaReporte,
    type FilaClaveReporte,
    type FilaConsumoReporte,
    type FilaReporte
} from "@/modules/reporte/utils/reporte-consulta";
import { fechaHoyChile } from "@/shared/utils/filtros-registros";
import { calcularPaginacion, type Paginacion } from "@/shared/utils/paginacion";

export interface ResultadoReporte {
    filas: FilaReporte[];
    columnas: ColumnaMes[];
    paginacion: Paginacion;
    arbol: NodoCentro[];
    centroId: string | null;
    bodegaId: string | null;
    puedeFiltrarCentro: boolean;
    nodoNombre: string;
}

export interface ResultadoExportacion {
    ok: boolean;
    message: string;
    base64?: string;
    nombreArchivo?: string;
}

interface ContextoReporte {
    alcance: InventarioAlcance;
    arbol: NodoCentro[];
    columnas: ColumnaMes[];
    consulta: ConsultaReporte | null;
    nodoNombre: string;
}

function nombreDelNodo(alcance: InventarioAlcance): string {
    if (alcance.bodegaId) {
        return alcance.bodegas.find((bodega) => bodega.id === alcance.bodegaId)?.nombre ?? "bodega";
    }
    if (alcance.puedeFiltrarCentro && alcance.centroId) {
        return alcance.centros.find((centro) => centro.id === alcance.centroId)?.nombre ?? "centro";
    }
    return "todo";
}

async function prepararReporte(filtros: FiltrosReporte): Promise<ContextoReporte> {
    // El árbol se arma con el alcance completo; la consulta, con el nodo elegido.
    const [alcanceCompleto, alcance] = await Promise.all([
        obtenerAlcanceInventario(),
        obtenerAlcanceInventario({ centroId: filtros.centroId, bodegaId: filtros.bodegaId })
    ]);
    const filtroMovimientos = crearFiltroMovimientosSeleccion(alcance);
    const rango = rangoDelPeriodo(filtros.mesDesde, filtros.mesHasta);

    return {
        alcance,
        arbol: construirArbol(alcanceCompleto.centros, alcanceCompleto.bodegas),
        columnas: columnasDelPeriodo(filtros.mesDesde, filtros.mesHasta),
        nodoNombre: nombreDelNodo(alcance),
        consulta: filtroMovimientos
            ? {
                  filtroMovimientos,
                  bodegaIdsStock: alcance.bodegaIds,
                  gte: rango.gte,
                  lt: rango.lt,
                  busqueda: filtros.busqueda
              }
            : null
    };
}

async function cargarFilas(consulta: ConsultaReporte, columnas: ColumnaMes[], pagina: { skip: number; tamano: number } | null): Promise<FilaReporte[]> {
    const claves = await prisma.$queryRaw<FilaClaveReporte[]>(construirClavesReporte(consulta, pagina));

    if (claves.length === 0) {
        return [];
    }

    const pares = pagina ? claves.map((clave) => ({ productoId: Number(clave.productoId), bodegaId: clave.bodegaId })) : null;
    const consumos = await prisma.$queryRaw<FilaConsumoReporte[]>(construirConsumoReporte(consulta, pares));
    return armarFilasReporte(claves, consumos, columnas);
}

export async function consultarReporte(filtros: FiltrosReporte): Promise<ResultadoReporte> {
    const contexto = await prepararReporte(filtros);
    const base = {
        columnas: contexto.columnas,
        arbol: contexto.arbol,
        centroId: contexto.alcance.centroId,
        bodegaId: contexto.alcance.bodegaId,
        puedeFiltrarCentro: contexto.alcance.puedeFiltrarCentro,
        nodoNombre: contexto.nodoNombre
    };

    if (!contexto.consulta) {
        return { ...base, filas: [], paginacion: calcularPaginacion(1, 0) };
    }

    const [conteo] = await prisma.$queryRaw<Array<{ total: bigint | number }>>(construirConteoReporte(contexto.consulta));
    const paginacion = calcularPaginacion(filtros.pagina, Number(conteo?.total ?? 0));
    const filas = await cargarFilas(contexto.consulta, contexto.columnas, paginacion);

    return { ...base, filas, paginacion };
}

export async function exportarReporteExcelAction(parametros: Record<string, string>): Promise<ResultadoExportacion> {
    try {
        const filtros = leerFiltrosReporte(parametros, fechaHoyChile());
        const contexto = await prepararReporte(filtros);
        const filas = contexto.consulta ? await cargarFilas(contexto.consulta, contexto.columnas, null) : [];
        const buffer = await construirExcelReporte(filas, contexto.columnas);

        await AuditLogger.log({
            usuarioId: contexto.alcance.usuario.id,
            centroId: contexto.alcance.centroId,
            bodegaId: contexto.alcance.bodegaId,
            accion: "exportar",
            entidad: "Reporte",
            detalle: { mesDesde: filtros.mesDesde, mesHasta: filtros.mesHasta, busqueda: filtros.busqueda, filas: filas.length }
        });

        return {
            ok: true,
            message: "",
            base64: buffer.toString("base64"),
            nombreArchivo: nombreArchivoReporte(contexto.nodoNombre, filtros.mesDesde, filtros.mesHasta)
        };
    } catch {
        return { ok: false, message: "No fue posible generar el Excel del reporte." };
    }
}
