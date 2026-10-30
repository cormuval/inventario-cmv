// Orquesta las reglas en el orden de dependencias (spec, sección 6.1).

// migracion
import { texto } from "./normalizar";
import { transformarBodegas, transformarCentros, transformarProductos, transformarUnidades } from "./reglas-maestros";
import { transformarDetallesEntrada, transformarDetallesSalida, transformarEntradas, transformarSalidas } from "./reglas-ordenes";
import { transformarStock } from "./reglas-stock";
import { contarOrdenesPorUsuario, crearResolverUsuario, transformarUsuarios } from "./reglas-usuarios";
import { CENTRO_PRUEBA_ID, type ContextoMigracion, type DatosOrigen, type MigracionTransformada, type Valor } from "./tipos";

function idsTexto(valores: Valor[]): Set<string> {
    return new Set(valores.map((valor) => texto(valor)).filter((id): id is string => id !== null));
}

export function transformarTodo(origen: DatosOrigen, contexto: ContextoMigracion): MigracionTransformada {
    const Centro = transformarCentros(origen.centros);
    const centros = new Set(Centro.aceptados.map((centro) => centro.id));

    const Bodega = transformarBodegas(origen.bodegas, centros);
    const bodegas = new Map(Bodega.aceptados.map((bodega) => [bodega.id, bodega.centroId]));
    const bodegasPrueba = idsTexto(origen.bodegas.filter((bodega) => texto(bodega.ID_Centro) === CENTRO_PRUEBA_ID).map((bodega) => bodega.ID_Bodega));

    const nombresCentro = new Map<string, string>();
    for (const centro of origen.centros) {
        const id = texto(centro.ID_Centro);
        const nombre = texto(centro.Nombre);
        if (id !== null && nombre !== null) nombresCentro.set(id, nombre);
    }

    const Unidad = transformarUnidades(origen.unidades);
    const Producto = transformarProductos(origen.productos);
    const productos = new Set(Producto.aceptados.map((producto) => producto.id));

    const usuarios = transformarUsuarios(origen.usuarios, {
        centros,
        bodegas,
        usuariosDestino: contexto.usuariosDestino,
        ordenesPorUsuario: contarOrdenesPorUsuario([...origen.entradas.map((e) => e.ID_User), ...origen.salidas.map((s) => s.ID_User)])
    });
    const contextoOrdenes = { bodegas, bodegasPrueba, nombresCentro, resolverUsuario: crearResolverUsuario(usuarios, contexto.usuariosDestino) };

    const OrdenEntrada = transformarEntradas(origen.entradas, contextoOrdenes);
    const OrdenSalida = transformarSalidas(origen.salidas, contextoOrdenes);

    const OrdenEntradaDetalle = transformarDetallesEntrada(origen.entradaDetalles, {
        ordenesAceptadas: new Set(OrdenEntrada.aceptados.map((orden) => orden.id)),
        ordenesOrigen: idsTexto(origen.entradas.map((orden) => orden.ID_OrdenEntrada)),
        productos
    });
    const OrdenSalidaDetalle = transformarDetallesSalida(origen.salidaDetalles, {
        ordenesAceptadas: new Set(OrdenSalida.aceptados.map((orden) => orden.id)),
        ordenesOrigen: idsTexto(origen.salidas.map((orden) => orden.ID_OrdenSalida)),
        productos
    });

    const Stock = transformarStock(origen.stock, { bodegas, bodegasPrueba, productos, ahora: contexto.ahora });

    return {
        Centro,
        Bodega,
        Unidad,
        Producto,
        Usuario: usuarios.tabla,
        OrdenEntrada,
        OrdenEntradaDetalle,
        OrdenSalida,
        OrdenSalidaDetalle,
        Stock,
        reasignaciones: Object.fromEntries(usuarios.reasignaciones)
    };
}
