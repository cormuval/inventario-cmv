// utils
import { leerPagina, obtenerParametro, type ParametrosUrl } from "@/shared/utils/filtros-registros";

export type EstadoProductoFiltro = "todos" | "activo" | "inactivo";

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
        const idLeido = Number(idTexto);
        if (Number.isInteger(idLeido) && idLeido >= 1) {
            id = idLeido;
        } else {
            advertencias.push("El ID del producto debe ser un entero mayor que cero; se ignora el filtro.");
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
