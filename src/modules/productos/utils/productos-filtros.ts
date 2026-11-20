// utils
import { leerPagina, obtenerParametro, type ParametrosUrl } from "@/shared/utils/filtros-registros";

export type EstadoProductoFiltro = "todos" | "activo" | "inactivo";
export const PRODUCTO_ID_MAXIMO = 2147483647;

const ADVERTENCIA_ID_INVALIDO = "El ID del producto debe ser un entero entre 1 y 2147483647; se ignora el filtro.";

export interface ProductosFiltros {
    id: number | null;
    linea: string;
    estado: EstadoProductoFiltro;
    descripcion: string;
    pagina: number;
    advertencias: string[];
}

export function leerFiltrosProductos(
    params?: ParametrosUrl,
    lineasPermitidas?: readonly string[]
): ProductosFiltros {
    const advertencias: string[] = [];
    const idTexto = obtenerParametro(params, "id");
    let id: number | null = null;

    if (idTexto !== undefined) {
        const esDecimal = /^\d+$/.test(idTexto) && idTexto.length <= String(PRODUCTO_ID_MAXIMO).length;
        const idLeido = esDecimal ? Number(idTexto) : Number.NaN;
        if (Number.isSafeInteger(idLeido) && idLeido >= 1 && idLeido <= PRODUCTO_ID_MAXIMO) {
            id = idLeido;
        } else {
            advertencias.push(ADVERTENCIA_ID_INVALIDO);
        }
    }

    let linea = obtenerParametro(params, "linea") ?? "";
    if (linea && lineasPermitidas && !lineasPermitidas.includes(linea)) {
        linea = "";
        advertencias.push("La línea del producto no es válida; se muestran todas las líneas.");
    }

    const estadoTexto = obtenerParametro(params, "estado");
    let estado: EstadoProductoFiltro = "todos";
    if (estadoTexto === "activo" || estadoTexto === "inactivo" || estadoTexto === "todos") {
        estado = estadoTexto;
    } else if (estadoTexto !== undefined) {
        advertencias.push("El estado del producto no es válido; se muestran todos los estados.");
    }

    return {
        id,
        linea,
        estado,
        descripcion: obtenerParametro(params, "descripcion") ?? "",
        pagina: leerPagina(obtenerParametro(params, "pagina")),
        advertencias
    };
}

export function parametrosProductos(filtros: ProductosFiltros): Record<string, string | number | undefined> {
    const parametros: Record<string, string | number | undefined> = {};

    if (filtros.id !== null) {
        parametros.id = filtros.id;
    }
    if (filtros.linea !== "") {
        parametros.linea = filtros.linea;
    }
    if (filtros.estado !== "todos") {
        parametros.estado = filtros.estado;
    }
    if (filtros.descripcion !== "") {
        parametros.descripcion = filtros.descripcion;
    }

    return parametros;
}
