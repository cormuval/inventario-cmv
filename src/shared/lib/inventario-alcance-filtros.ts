// config
import { ROL_ADMINISTRADOR, ROL_ENCARGADO_CENTRO } from "@/config/auth";

// types
import type { InventarioAlcance } from "@/shared/lib/inventario-alcance";

export interface FiltroMovimientosAlcance {
    centroId?: { in: string[] };
    bodegaId?: { in: string[] };
}

export interface FiltroStockAlcance {
    bodegaId?: { in: string[] };
    bodega?: { centroId: { in: string[] } };
}

export interface FiltroMovimientosSeleccion {
    centroId?: string | { in: string[] };
    bodegaId?: string | { in: string[] };
}

/**
 * Filtro Prisma para historiales (ordenes de entrada/salida) segun el alcance del usuario.
 * El historial no se acota a centros/bodegas activos: una bodega desactivada conserva sus movimientos.
 * - R01: sin restriccion (vista panoramica).
 * - R02: todo su centro.
 * - R03/R06/R07: solo sus bodegas asignadas.
 * Retorna `null` cuando el usuario no tiene alcance (no debe ver nada).
 */
export function crearFiltroMovimientosAlcance(alcance: InventarioAlcance): FiltroMovimientosAlcance | null {
    if (alcance.usuario.rol === ROL_ADMINISTRADOR) {
        return {};
    }

    if (alcance.centroIds.length === 0) {
        return null;
    }

    if (alcance.usuario.rol === ROL_ENCARGADO_CENTRO) {
        return { centroId: { in: alcance.centroIds } };
    }

    if (alcance.bodegaIds.length === 0) {
        return null;
    }

    return {
        centroId: { in: alcance.centroIds },
        bodegaId: { in: alcance.bodegaIds }
    };
}

/**
 * Filtro de historiales con el alcance del usuario más la selección de los filtros de pantalla.
 * La bodega elegida ya viene validada contra el alcance (`normalizarSeleccion`).
 * El centro solo se aplica cuando el rol puede elegirlo (R01); para el resto es su centro fijo.
 */
export function crearFiltroMovimientosSeleccion(alcance: InventarioAlcance): FiltroMovimientosSeleccion | null {
    const filtro = crearFiltroMovimientosAlcance(alcance);

    if (!filtro) {
        return null;
    }

    if (alcance.bodegaId) {
        return { ...filtro, bodegaId: alcance.bodegaId };
    }

    if (alcance.puedeFiltrarCentro && alcance.centroId) {
        return { ...filtro, centroId: alcance.centroId };
    }

    return filtro;
}

/**
 * Filtro Prisma para existencias (`Stock`) con las mismas reglas que `crearFiltroMovimientosAlcance`.
 * `Stock` no tiene centro propio, por lo que el centro se resuelve a traves de la bodega.
 */
export function crearFiltroStockAlcance(alcance: InventarioAlcance): FiltroStockAlcance | null {
    const filtro = crearFiltroMovimientosAlcance(alcance);

    if (!filtro) {
        return null;
    }

    if (filtro.bodegaId) {
        return { bodegaId: filtro.bodegaId };
    }

    if (filtro.centroId) {
        return { bodega: { centroId: filtro.centroId } };
    }

    return {};
}
