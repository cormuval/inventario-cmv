// utils
import { leerPagina, leerSeleccion, obtenerParametro, type ParametrosUrl } from "@/shared/utils/filtros-registros";
import type { ValorParametro } from "@/shared/utils/paginacion";

export const MESES_MAXIMOS_REPORTE = 12;

const ABREVIATURAS_MES = ["ene", "feb", "mar", "abr", "may", "jun", "jul", "ago", "sep", "oct", "nov", "dic"] as const;
const FORMATO_MES = /^\d{4}-(0[1-9]|1[0-2])$/;

export interface FiltrosReporte {
    mesDesde: string;
    mesHasta: string;
    centroId?: string;
    bodegaId?: string;
    busqueda: string;
    pagina: number;
    avisos: string[];
}

export interface ColumnaMes {
    clave: string;
    etiqueta: string;
}

export function esMesValido(valor: string): boolean {
    return FORMATO_MES.test(valor);
}

export function sumarMesesClave(clave: string, meses: number): string {
    const [anio, mes] = clave.split("-").map(Number);
    return new Date(Date.UTC(anio, mes - 1 + meses, 1)).toISOString().slice(0, 7);
}

export function mesesEntre(desde: string, hasta: string): number {
    const [anioDesde, mesDesde] = desde.split("-").map(Number);
    const [anioHasta, mesHasta] = hasta.split("-").map(Number);
    return (anioHasta - anioDesde) * 12 + (mesHasta - mesDesde) + 1;
}

/**
 * El selector móvil envía `nodo` como "c:<centroId>", "b:<bodegaId>" o "" (Todo).
 * Si viene `nodo`, reemplaza a `centroId`/`bodegaId`.
 */
function leerNodo(params: ParametrosUrl | undefined): { centroId?: string; bodegaId?: string } {
    if (params && "nodo" in params) {
        const nodo = obtenerParametro(params, "nodo") ?? "";
        if (nodo.startsWith("c:")) {
            return { centroId: leerSeleccion(nodo.slice(2)), bodegaId: undefined };
        }
        if (nodo.startsWith("b:")) {
            return { centroId: undefined, bodegaId: leerSeleccion(nodo.slice(2)) };
        }
        return { centroId: undefined, bodegaId: undefined };
    }

    return {
        centroId: leerSeleccion(obtenerParametro(params, "centroId")),
        bodegaId: leerSeleccion(obtenerParametro(params, "bodegaId"))
    };
}

export function leerFiltrosReporte(params: ParametrosUrl | undefined, hoy: string): FiltrosReporte {
    const anio = hoy.slice(0, 4);
    const porDefecto = { mesDesde: `${anio}-01`, mesHasta: `${anio}-12` };
    const desdeUrl = obtenerParametro(params, "mesDesde") ?? porDefecto.mesDesde;
    const hastaUrl = obtenerParametro(params, "mesHasta") ?? porDefecto.mesHasta;
    const avisos: string[] = [];
    let periodo = { mesDesde: desdeUrl, mesHasta: hastaUrl };

    if (!esMesValido(desdeUrl) || !esMesValido(hastaUrl)) {
        avisos.push("El período ingresado no es válido; se muestra el año en curso.");
        periodo = porDefecto;
    } else if (desdeUrl > hastaUrl) {
        avisos.push("El mes desde es posterior al mes hasta; se muestra el año en curso.");
        periodo = porDefecto;
    } else if (mesesEntre(desdeUrl, hastaUrl) > MESES_MAXIMOS_REPORTE) {
        avisos.push("El período máximo es de 12 meses; se muestra el año en curso.");
        periodo = porDefecto;
    }

    return {
        ...periodo,
        ...leerNodo(params),
        busqueda: obtenerParametro(params, "q") ?? "",
        pagina: leerPagina(obtenerParametro(params, "pagina")),
        avisos
    };
}

export function columnasDelPeriodo(mesDesde: string, mesHasta: string): ColumnaMes[] {
    return Array.from({ length: mesesEntre(mesDesde, mesHasta) }, (_, indice) => {
        const clave = sumarMesesClave(mesDesde, indice);
        const [anio, mes] = clave.split("-");
        return { clave, etiqueta: `${ABREVIATURAS_MES[Number(mes) - 1]}-${anio}` };
    });
}

/** `Fecha` es `@db.Date` (medianoche UTC): el período es [primer día de mesDesde, primer día del mes siguiente a mesHasta). */
export function rangoDelPeriodo(mesDesde: string, mesHasta: string): { gte: Date; lt: Date } {
    return {
        gte: new Date(`${mesDesde}-01T00:00:00.000Z`),
        lt: new Date(`${sumarMesesClave(mesHasta, 1)}-01T00:00:00.000Z`)
    };
}

export function parametrosDeReporte(filtros: FiltrosReporte): Record<string, ValorParametro> {
    return {
        mesDesde: filtros.mesDesde,
        mesHasta: filtros.mesHasta,
        centroId: filtros.centroId,
        bodegaId: filtros.bodegaId,
        q: filtros.busqueda
    };
}
