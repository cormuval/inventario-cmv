// Conversión de valores crudos de AppSheet y utilidades comunes de las reglas.

// migracion
import { CADUCIDAD_SIN_FECHA, LOTE_SIN_LOTE, type Rechazo, type Tabla, type TablaTransformada, type Valor } from "./tipos";

export function texto(valor: Valor | undefined): string | null {
    if (valor === null || valor === undefined) return null;
    const limpio = (valor instanceof Date ? valor.toISOString() : String(valor)).trim();
    return limpio === "" ? null : limpio;
}

export function booleano(valor: Valor | undefined): boolean {
    if (typeof valor === "boolean") return valor;
    if (typeof valor === "number" || typeof valor === "bigint") return Number(valor) === 1;
    if (typeof valor === "string") return ["1", "true", "si", "sí"].includes(valor.trim().toLowerCase());
    return false;
}

// Estado nulo en AppSheet se considera activo.
export function estado(valor: Valor | undefined): boolean {
    return valor === null || valor === undefined ? true : booleano(valor);
}

export function entero(valor: Valor | undefined): number | null {
    if (valor === null || valor === undefined || typeof valor === "boolean" || valor instanceof Date) return null;
    if (typeof valor === "string" && valor.trim() === "") return null;
    const numero = Number(valor);
    return Number.isSafeInteger(numero) ? numero : null;
}

export function fecha(valor: Valor | undefined): Date | null {
    if (valor instanceof Date) return Number.isNaN(valor.getTime()) ? null : valor;
    if (typeof valor === "string") {
        const partes = /^(\d{4})-(\d{2})-(\d{2})/.exec(valor.trim());
        return partes ? new Date(Date.UTC(Number(partes[1]), Number(partes[2]) - 1, Number(partes[3]))) : null;
    }
    return null;
}

export function email(valor: Valor | undefined): string | null {
    const limpio = texto(valor);
    return limpio === null ? null : limpio.toLowerCase();
}

export function recortar(valor: string, maximo = 255): string {
    return valor.length > maximo ? valor.slice(0, maximo) : valor;
}

export function claveFecha(valor: Date): string {
    return valor.toISOString().slice(0, 10);
}

export function rechazo(tabla: Tabla, clave: string, regla: string, detalle: string): Rechazo {
    return { tabla, clave, regla, detalle };
}

export function nuevaTabla<T>(leidos: number): TablaTransformada<T> {
    return { leidos, aceptados: [], rechazos: [], advertencias: [] };
}

// Devuelve la clave primaria si es válida y no se repite; si no, registra el rechazo.
export function claveUnica<T>(tabla: Tabla, valor: Valor, vistos: Set<string>, resultado: TablaTransformada<T>): string | null {
    const clave = texto(valor);
    if (clave === null) {
        resultado.rechazos.push(rechazo(tabla, "(sin clave)", "clave_nula", "Clave primaria vacía"));
        return null;
    }
    if (vistos.has(clave)) {
        resultado.rechazos.push(rechazo(tabla, clave, "clave_duplicada", "Clave primaria repetida en el origen"));
        return null;
    }
    vistos.add(clave);
    return clave;
}

export interface LoteCaducidad {
    lote: string;
    fechaCaducidad: Date;
    advertencias: Rechazo[];
}

export function normalizarLoteCaducidad(tabla: Tabla, clave: string, lote: Valor, caducidad: Valor): LoteCaducidad {
    const advertencias: Rechazo[] = [];
    const loteLimpio = texto(lote);
    const fechaCaducidad = fecha(caducidad);
    if (loteLimpio === null) {
        advertencias.push(rechazo(tabla, clave, "lote_vacio", `Lote vacío: se usa "${LOTE_SIN_LOTE}"`));
    }
    if (fechaCaducidad === null) {
        advertencias.push(rechazo(tabla, clave, "caducidad_nula", "Caducidad nula: se usa 2099-12-31"));
    }
    return {
        lote: loteLimpio === null ? LOTE_SIN_LOTE : recortar(loteLimpio),
        fechaCaducidad: fechaCaducidad ?? CADUCIDAD_SIN_FECHA,
        advertencias
    };
}
