// Reglas de órdenes de entrada y salida, y sus detalles (spec, sección 5.2).

// migracion
import { booleano, claveUnica, entero, fecha, normalizarLoteCaducidad, nuevaTabla, rechazo, recortar, texto } from "./normalizar";
import type { ResolverUsuario } from "./reglas-usuarios";
import {
    TIPO_SALIDA_OTROS_CENTROS,
    type OrdenEntradaDestino,
    type OrdenEntradaDetalleDestino,
    type OrdenEntradaDetalleOrigen,
    type OrdenEntradaOrigen,
    type OrdenSalidaDestino,
    type OrdenSalidaDetalleDestino,
    type OrdenSalidaDetalleOrigen,
    type OrdenSalidaOrigen,
    type Rechazo,
    type Tabla,
    type TablaTransformada,
    type Valor
} from "./tipos";

export interface ContextoOrdenes {
    // bodega -> centro, solo bodegas migradas
    bodegas: Map<string, string>;
    bodegasPrueba: Set<string>;
    nombresCentro: Map<string, string>;
    resolverUsuario: ResolverUsuario;
}

export interface ContextoDetalles {
    ordenesAceptadas: Set<string>;
    ordenesOrigen: Set<string>;
    productos: Set<number>;
}

type BodegaValidada = { ok: true; bodegaId: string; centroBodega: string } | { ok: false; rechazo: Rechazo };

function validarBodega(tabla: Tabla, clave: string, valor: Valor, contexto: ContextoOrdenes): BodegaValidada {
    const bodegaId = texto(valor);
    const centroBodega = bodegaId === null ? undefined : contexto.bodegas.get(bodegaId);
    if (bodegaId !== null && centroBodega !== undefined) return { ok: true, bodegaId, centroBodega };
    if (bodegaId !== null && contexto.bodegasPrueba.has(bodegaId)) {
        return { ok: false, rechazo: rechazo(tabla, clave, "centro_prueba", `Bodega ${bodegaId} del centro de prueba`) };
    }
    return { ok: false, rechazo: rechazo(tabla, clave, "bodega_inexistente", `Bodega ${bodegaId ?? "vacía"} no migrada`) };
}

function resolverUsuario(tabla: Tabla, clave: string, valor: Valor, contexto: ContextoOrdenes, advertencias: Rechazo[]): string {
    const resuelto = contexto.resolverUsuario(valor);
    if (resuelto.advertencia !== null) advertencias.push(rechazo(tabla, clave, "usuario_inexistente", resuelto.advertencia));
    return resuelto.id;
}

export function transformarEntradas(filas: OrdenEntradaOrigen[], contexto: ContextoOrdenes): TablaTransformada<OrdenEntradaDestino> {
    const resultado = nuevaTabla<OrdenEntradaDestino>(filas.length);
    const vistos = new Set<string>();
    for (const fila of filas) {
        const id = claveUnica("OrdenEntrada", fila.ID_OrdenEntrada, vistos, resultado);
        if (id === null) continue;
        const bodega = validarBodega("OrdenEntrada", id, fila.ID_Bodega, contexto);
        if (!bodega.ok) {
            resultado.rechazos.push(bodega.rechazo);
            continue;
        }
        if (texto(fila.ID_Centro) !== bodega.centroBodega) {
            resultado.rechazos.push(rechazo("OrdenEntrada", id, "centro_no_coincide", `Centro ${texto(fila.ID_Centro) ?? "vacío"} distinto al de la bodega`));
            continue;
        }
        const fechaOrden = fecha(fila.Fecha);
        const origen = texto(fila.Origen);
        if (fechaOrden === null || origen === null) {
            resultado.rechazos.push(rechazo("OrdenEntrada", id, "campo_requerido", "Fecha u origen vacío"));
            continue;
        }
        const advertencias: Rechazo[] = [];
        const usuarioId = resolverUsuario("OrdenEntrada", id, fila.ID_User, contexto, advertencias);
        const guiaDespacho = texto(fila.GuiaDespacho);
        const codigoRecepcion = texto(fila.Codigo_Recepcion);
        resultado.aceptados.push({
            id,
            fecha: fechaOrden,
            usuarioId,
            origen: recortar(origen),
            guiaDespacho: guiaDespacho === null ? null : recortar(guiaDespacho),
            centroId: bodega.centroBodega,
            bodegaId: bodega.bodegaId,
            codigoRecepcion: codigoRecepcion === null ? null : recortar(codigoRecepcion)
        });
        resultado.advertencias.push(...advertencias);
    }
    return resultado;
}

export function transformarSalidas(filas: OrdenSalidaOrigen[], contexto: ContextoOrdenes): TablaTransformada<OrdenSalidaDestino> {
    const resultado = nuevaTabla<OrdenSalidaDestino>(filas.length);
    const vistos = new Set<string>();
    for (const fila of filas) {
        const id = claveUnica("OrdenSalida", fila.ID_OrdenSalida, vistos, resultado);
        if (id === null) continue;
        const bodega = validarBodega("OrdenSalida", id, fila.ID_Bodega, contexto);
        if (!bodega.ok) {
            resultado.rechazos.push(bodega.rechazo);
            continue;
        }
        const fechaOrden = fecha(fila.Fecha);
        const tipoSalida = texto(fila.Tipo_Salida);
        let destino = texto(fila.Destino);
        if (fechaOrden === null || tipoSalida === null || destino === null) {
            resultado.rechazos.push(rechazo("OrdenSalida", id, "campo_requerido", "Fecha, tipo de salida o destino vacío"));
            continue;
        }
        const advertencias: Rechazo[] = [];
        const centroOrigen = texto(fila.ID_Centro);
        if (centroOrigen !== bodega.centroBodega) {
            if (tipoSalida !== TIPO_SALIDA_OTROS_CENTROS) {
                resultado.rechazos.push(rechazo("OrdenSalida", id, "centro_no_coincide", `Centro ${centroOrigen ?? "vacío"} distinto al de la bodega`));
                continue;
            }
            // AppSheet guarda en ID_Centro el centro de destino de las salidas "A Otros Centros".
            const nombreDestino = (centroOrigen === null ? undefined : contexto.nombresCentro.get(centroOrigen)) ?? centroOrigen ?? "sin centro";
            destino = `${destino} — ${nombreDestino}`;
            advertencias.push(rechazo("OrdenSalida", id, "centro_destino", `Centro de destino ${nombreDestino} se registra en el destino`));
        }
        const usuarioId = resolverUsuario("OrdenSalida", id, fila.ID_User, contexto, advertencias);
        const codigoSalida = texto(fila.Codigo_Salida);
        const correoDestino = texto(fila.Correo_Destino);
        resultado.aceptados.push({
            id,
            fecha: fechaOrden,
            usuarioId,
            bodegaId: bodega.bodegaId,
            tipoSalida: recortar(tipoSalida),
            centroId: bodega.centroBodega,
            destino: recortar(destino),
            codigoSalida: codigoSalida === null ? null : recortar(codigoSalida),
            enviarCorreo: booleano(fila.Enviar_Correo),
            correoDestino: correoDestino === null ? null : recortar(correoDestino)
        });
        resultado.advertencias.push(...advertencias);
    }
    return resultado;
}

interface DetalleValidado {
    ordenId: string;
    productoId: number;
    cantidad: number;
}

function validarDetalle(tabla: Tabla, clave: string, orden: Valor, producto: Valor, cantidad: Valor, contexto: ContextoDetalles): DetalleValidado | Rechazo {
    const ordenId = texto(orden);
    if (ordenId === null || !contexto.ordenesAceptadas.has(ordenId)) {
        return ordenId !== null && contexto.ordenesOrigen.has(ordenId)
            ? rechazo(tabla, clave, "orden_no_migrada", `Orden ${ordenId} rechazada`)
            : rechazo(tabla, clave, "orden_inexistente", `Orden ${ordenId ?? "vacía"} no existe en el origen`);
    }
    const productoId = entero(producto);
    if (productoId === null || !contexto.productos.has(productoId)) {
        return rechazo(tabla, clave, "producto_inexistente", `Producto ${productoId ?? "vacío"} no migrado`);
    }
    const unidades = entero(cantidad);
    if (unidades === null || unidades <= 0) {
        return rechazo(tabla, clave, "cantidad_invalida", `Cantidad ${unidades ?? "vacía"}`);
    }
    return { ordenId, productoId, cantidad: unidades };
}

function esRechazo(valor: DetalleValidado | Rechazo): valor is Rechazo {
    return "regla" in valor;
}

export function transformarDetallesEntrada(
    filas: OrdenEntradaDetalleOrigen[],
    contexto: ContextoDetalles
): TablaTransformada<OrdenEntradaDetalleDestino> {
    const resultado = nuevaTabla<OrdenEntradaDetalleDestino>(filas.length);
    const vistos = new Set<string>();
    for (const fila of filas) {
        const id = claveUnica("OrdenEntradaDetalle", fila.ID_Entrada, vistos, resultado);
        if (id === null) continue;
        const detalle = validarDetalle("OrdenEntradaDetalle", id, fila.ID_OrdenEntrada, fila.ID_Product, fila.Cantidad, contexto);
        if (esRechazo(detalle)) {
            resultado.rechazos.push(detalle);
            continue;
        }
        const categoria = texto(fila.Categoria);
        if (categoria === null) {
            resultado.rechazos.push(rechazo("OrdenEntradaDetalle", id, "campo_requerido", "Categoría vacía"));
            continue;
        }
        const loteCaducidad = normalizarLoteCaducidad("OrdenEntradaDetalle", id, fila.Lote, fila.Fecha_Caducidad);
        resultado.aceptados.push({
            id,
            productoId: detalle.productoId,
            categoria: recortar(categoria),
            fechaCaducidad: loteCaducidad.fechaCaducidad,
            cantidad: detalle.cantidad,
            lote: loteCaducidad.lote,
            ordenEntradaId: detalle.ordenId
        });
        resultado.advertencias.push(...loteCaducidad.advertencias);
    }
    return resultado;
}

export function transformarDetallesSalida(
    filas: OrdenSalidaDetalleOrigen[],
    contexto: ContextoDetalles
): TablaTransformada<OrdenSalidaDetalleDestino> {
    const resultado = nuevaTabla<OrdenSalidaDetalleDestino>(filas.length);
    const vistos = new Set<string>();
    for (const fila of filas) {
        const id = claveUnica("OrdenSalidaDetalle", fila.ID_Detalle, vistos, resultado);
        if (id === null) continue;
        const detalle = validarDetalle("OrdenSalidaDetalle", id, fila.ID_OrdenSalida, fila.ID_Product, fila.Cantidad, contexto);
        if (esRechazo(detalle)) {
            resultado.rechazos.push(detalle);
            continue;
        }
        const loteCaducidad = normalizarLoteCaducidad("OrdenSalidaDetalle", id, fila.Lote, fila.Fecha_Caducidad);
        resultado.aceptados.push({
            id,
            productoId: detalle.productoId,
            cantidad: detalle.cantidad,
            ordenSalidaId: detalle.ordenId,
            lote: loteCaducidad.lote,
            fechaCaducidad: loteCaducidad.fechaCaducidad
        });
        resultado.advertencias.push(...loteCaducidad.advertencias);
    }
    return resultado;
}
