// Reglas de maestros: Centro, Bodega, Unidad y Producto (spec, sección 5.1).

// migracion
import { claveUnica, entero, estado, nuevaTabla, rechazo, recortar, texto } from "./normalizar";
import {
    CENTRO_PRUEBA_ID,
    type BodegaDestino,
    type BodegaOrigen,
    type CentroDestino,
    type CentroOrigen,
    type ProductoDestino,
    type ProductoOrigen,
    type TablaTransformada,
    type UnidadDestino,
    type UnidadOrigen
} from "./tipos";

export function transformarCentros(filas: CentroOrigen[]): TablaTransformada<CentroDestino> {
    const resultado = nuevaTabla<CentroDestino>(filas.length);
    const vistos = new Set<string>();
    for (const fila of filas) {
        const id = claveUnica("Centro", fila.ID_Centro, vistos, resultado);
        if (id === null) continue;
        if (id === CENTRO_PRUEBA_ID) {
            resultado.rechazos.push(rechazo("Centro", id, "centro_prueba", "Centro de prueba excluido de la migración"));
            continue;
        }
        const nombre = texto(fila.Nombre);
        if (nombre === null) {
            resultado.rechazos.push(rechazo("Centro", id, "campo_requerido", "Nombre vacío"));
            continue;
        }
        resultado.aceptados.push({ id, nombre: recortar(nombre), estado: estado(fila.Estado) });
    }
    return resultado;
}

export function transformarBodegas(filas: BodegaOrigen[], centros: Set<string>): TablaTransformada<BodegaDestino> {
    const resultado = nuevaTabla<BodegaDestino>(filas.length);
    const vistos = new Set<string>();
    for (const fila of filas) {
        const id = claveUnica("Bodega", fila.ID_Bodega, vistos, resultado);
        if (id === null) continue;
        const centroId = texto(fila.ID_Centro);
        if (centroId === CENTRO_PRUEBA_ID) {
            resultado.rechazos.push(rechazo("Bodega", id, "centro_prueba", "Bodega del centro de prueba"));
            continue;
        }
        if (centroId === null || !centros.has(centroId)) {
            resultado.rechazos.push(rechazo("Bodega", id, "centro_inexistente", `Centro ${centroId ?? "vacío"} no migrado`));
            continue;
        }
        const nombre = texto(fila.Bodega);
        if (nombre === null) {
            resultado.rechazos.push(rechazo("Bodega", id, "campo_requerido", "Nombre de bodega vacío"));
            continue;
        }
        resultado.aceptados.push({ id, nombre: recortar(nombre), centroId, estado: estado(fila.Estado) });
    }
    return resultado;
}

export function transformarUnidades(filas: UnidadOrigen[]): TablaTransformada<UnidadDestino> {
    const resultado = nuevaTabla<UnidadDestino>(filas.length);
    const vistos = new Set<string>();
    const descripciones = new Set<string>();
    for (const fila of filas) {
        const id = claveUnica("Unidad", fila.ID_Unidad, vistos, resultado);
        if (id === null) continue;
        const descripcion = texto(fila.Descripcion);
        if (descripcion === null) {
            resultado.rechazos.push(rechazo("Unidad", id, "campo_requerido", "Descripción vacía"));
            continue;
        }
        // Descripcion es única en el destino y MySQL compara sin distinguir mayúsculas.
        const claveDescripcion = descripcion.toLowerCase();
        if (descripciones.has(claveDescripcion)) {
            resultado.rechazos.push(rechazo("Unidad", id, "descripcion_duplicada", `Descripción "${descripcion}" repetida`));
            continue;
        }
        descripciones.add(claveDescripcion);
        resultado.aceptados.push({ id, descripcion: recortar(descripcion) });
    }
    return resultado;
}

export function transformarProductos(filas: ProductoOrigen[]): TablaTransformada<ProductoDestino> {
    const resultado = nuevaTabla<ProductoDestino>(filas.length);
    const vistos = new Set<string>();
    for (const fila of filas) {
        const id = entero(fila.ID_Product);
        if (claveUnica("Producto", id, vistos, resultado) === null || id === null) continue;
        const linea = texto(fila.Linea);
        const descripcion = texto(fila.Descripcion);
        if (linea === null || descripcion === null) {
            resultado.rechazos.push(rechazo("Producto", String(id), "campo_requerido", "Línea o descripción vacía"));
            continue;
        }
        resultado.aceptados.push({ id, linea: recortar(linea), descripcion: recortar(descripcion), estado: true });
    }
    return resultado;
}
