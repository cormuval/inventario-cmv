import { z } from "zod";

// utils
import { obtenerRangoHoyChile } from "@/shared/utils/fechas";
import type { ValorParametro } from "@/shared/utils/paginacion";

export type ParametrosUrl = Record<string, string | string[] | undefined>;

export const DIAS_RANGO_POR_DEFECTO = 30;
export const MESES_RANGO_MAXIMO = 12;

export interface FiltrosRegistros {
    desde: string;
    hasta: string;
    centroId?: string;
    bodegaId?: string;
    pagina: number;
    avisos: string[];
}

const fechaIsoSchema = z.string().regex(/^\d{4}-\d{2}-\d{2}$/);
const paginaSchema = z.coerce.number().int().min(1);

export function obtenerParametro(params: ParametrosUrl | undefined, clave: string): string | undefined {
    const valor = params?.[clave];
    const texto = Array.isArray(valor) ? valor[0] : valor;
    const limpio = texto?.trim();

    return limpio && limpio.length > 0 ? limpio : undefined;
}

export function fechaHoyChile(referencia: Date = new Date()): string {
    return obtenerRangoHoyChile(referencia).fechaInicioLocal.slice(0, 10);
}

export function esFechaIsoValida(valor: string): boolean {
    if (!fechaIsoSchema.safeParse(valor).success) {
        return false;
    }

    const fecha = new Date(`${valor}T00:00:00.000Z`);
    return !Number.isNaN(fecha.getTime()) && fecha.toISOString().slice(0, 10) === valor;
}

export function sumarDias(fechaIso: string, dias: number): string {
    const fecha = new Date(`${fechaIso}T00:00:00.000Z`);
    fecha.setUTCDate(fecha.getUTCDate() + dias);
    return fecha.toISOString().slice(0, 10);
}

/** Suma meses conservando el día; si el mes destino es más corto, usa su último día. */
export function sumarMeses(fechaIso: string, meses: number): string {
    const [anio, mes, dia] = fechaIso.split("-").map(Number);
    const primero = new Date(Date.UTC(anio, mes - 1 + meses, 1));
    const ultimoDia = new Date(Date.UTC(primero.getUTCFullYear(), primero.getUTCMonth() + 1, 0)).getUTCDate();
    primero.setUTCDate(Math.min(dia, ultimoDia));
    return primero.toISOString().slice(0, 10);
}

export function leerPagina(valor: string | undefined): number {
    const resultado = paginaSchema.safeParse(valor);
    return resultado.success ? resultado.data : 1;
}

export function leerSeleccion(valor: string | undefined): string | undefined {
    return valor && valor !== "todos" ? valor : undefined;
}

/**
 * Lee los filtros de los registros desde la URL. Un valor inválido no rompe la página:
 * vuelve al rango por defecto (últimos 30 días) y deja un aviso para mostrar.
 * El centro y la bodega se validan después contra el alcance del usuario.
 */
export function leerFiltrosRegistros(params: ParametrosUrl | undefined, hoy: string): FiltrosRegistros {
    const porDefecto = { desde: sumarDias(hoy, -DIAS_RANGO_POR_DEFECTO), hasta: hoy };
    const desdeUrl = obtenerParametro(params, "desde") ?? porDefecto.desde;
    const hastaUrl = obtenerParametro(params, "hasta") ?? porDefecto.hasta;
    const avisos: string[] = [];
    let rango = { desde: desdeUrl, hasta: hastaUrl };

    if (!esFechaIsoValida(desdeUrl) || !esFechaIsoValida(hastaUrl)) {
        avisos.push("Las fechas ingresadas no son válidas; se muestran los últimos 30 días.");
        rango = porDefecto;
    } else if (desdeUrl > hastaUrl) {
        avisos.push("La fecha desde es posterior a la fecha hasta; se muestran los últimos 30 días.");
        rango = porDefecto;
    } else if (desdeUrl < sumarMeses(hastaUrl, -MESES_RANGO_MAXIMO)) {
        avisos.push("El rango máximo es de 12 meses; se muestran los últimos 30 días.");
        rango = porDefecto;
    }

    return {
        desde: rango.desde,
        hasta: rango.hasta,
        centroId: leerSeleccion(obtenerParametro(params, "centroId")),
        bodegaId: leerSeleccion(obtenerParametro(params, "bodegaId")),
        pagina: leerPagina(obtenerParametro(params, "pagina")),
        avisos
    };
}

/** Las columnas `Fecha` son `@db.Date`: Prisma las guarda a medianoche UTC. */
export function rangoFechasDb(desde: string, hasta: string): { gte: Date; lte: Date } {
    return {
        gte: new Date(`${desde}T00:00:00.000Z`),
        lte: new Date(`${hasta}T00:00:00.000Z`)
    };
}

/** Parámetros de URL que conservan los filtros al paginar (sin `pagina`). */
export function parametrosDeFiltros(filtros: FiltrosRegistros): Record<string, ValorParametro> {
    return {
        desde: filtros.desde,
        hasta: filtros.hasta,
        centroId: filtros.centroId,
        bodegaId: filtros.bodegaId
    };
}

