// Reglas de stock (spec, sección 5.3): la tabla Stock de AppSheet es la fuente de verdad.

// migracion
import { claveComparable, claveFecha, claveUnica, entero, fecha, normalizarLoteCaducidad, nuevaTabla, rechazo, texto } from "./normalizar";
import type { StockDestino, StockOrigen, TablaTransformada } from "./tipos";

export interface ContextoStock {
    // bodega -> centro, solo bodegas migradas
    bodegas: Map<string, string>;
    bodegasPrueba: Set<string>;
    productos: Set<number>;
    ahora: Date;
}

export function transformarStock(filas: StockOrigen[], contexto: ContextoStock): TablaTransformada<StockDestino> {
    const resultado = nuevaTabla<StockDestino>(filas.length);
    const vistos = new Set<string>();
    const porClave = new Map<string, StockDestino>();

    for (const fila of filas) {
        const id = claveUnica("Stock", fila.ID_Stock, vistos, resultado);
        if (id === null) continue;

        const bodegaId = texto(fila.ID_Bodega);
        if (bodegaId === null || !contexto.bodegas.has(bodegaId)) {
            const regla = bodegaId !== null && contexto.bodegasPrueba.has(bodegaId) ? "centro_prueba" : "bodega_inexistente";
            resultado.rechazos.push(rechazo("Stock", id, regla, `Bodega ${bodegaId ?? "vacía"} no migrada (cantidad ${entero(fila.Cantidad_Disponible) ?? 0})`));
            continue;
        }
        const productoId = entero(fila.ID_Product);
        if (productoId === null || !contexto.productos.has(productoId)) {
            resultado.rechazos.push(rechazo("Stock", id, "producto_inexistente", `Producto ${productoId ?? "vacío"} no migrado (cantidad ${entero(fila.Cantidad_Disponible) ?? 0})`));
            continue;
        }

        let cantidadDisponible = entero(fila.Cantidad_Disponible);
        if (cantidadDisponible === null) {
            cantidadDisponible = 0;
            resultado.advertencias.push(rechazo("Stock", id, "cantidad_nula", "Cantidad disponible nula: se usa 0"));
        }
        const loteCaducidad = normalizarLoteCaducidad("Stock", id, fila.Lote, fila.Fecha_Caducidad);
        resultado.advertencias.push(...loteCaducidad.advertencias);

        const filaDestino: StockDestino = {
            id,
            productoId,
            bodegaId,
            cantidadDisponible,
            fechaUltimaActualizacion: fecha(fila.Fecha_Ultima_Actualizacion) ?? contexto.ahora,
            stockMinimo: entero(fila.StockMinimo) ?? 0,
            lote: loteCaducidad.lote,
            fechaCaducidad: loteCaducidad.fechaCaducidad
        };

        // stock_lote_unico: MySQL compara el lote sin distinguir mayúsculas ni acentos.
        const clave = `${productoId}|${bodegaId}|${claveComparable(loteCaducidad.lote)}|${claveFecha(loteCaducidad.fechaCaducidad)}`;
        const principal = porClave.get(clave);
        if (principal === undefined) {
            porClave.set(clave, filaDestino);
            resultado.aceptados.push(filaDestino);
            continue;
        }
        principal.cantidadDisponible += filaDestino.cantidadDisponible;
        principal.stockMinimo = Math.max(principal.stockMinimo, filaDestino.stockMinimo);
        if (filaDestino.fechaUltimaActualizacion > principal.fechaUltimaActualizacion) {
            principal.fechaUltimaActualizacion = filaDestino.fechaUltimaActualizacion;
        }
        resultado.advertencias.push(rechazo("Stock", id, "stock_fusionado", `Fusionado en ${principal.id}`));
    }
    return resultado;
}
