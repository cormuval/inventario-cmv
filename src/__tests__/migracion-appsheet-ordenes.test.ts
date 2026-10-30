import { describe, expect, it } from "vitest";

// migracion
import {
    transformarDetallesEntrada,
    transformarDetallesSalida,
    transformarEntradas,
    transformarSalidas,
    type ContextoOrdenes
} from "../../prisma/scripts/migracion-appsheet/reglas-ordenes";
import type { OrdenEntradaOrigen, OrdenSalidaOrigen } from "../../prisma/scripts/migracion-appsheet/tipos";

const FECHA = new Date(Date.UTC(2026, 9, 1));

function contexto(): ContextoOrdenes {
    return {
        bodegas: new Map([["b1", "c1"], ["b2", "c2"]]),
        bodegasPrueba: new Set(["bp"]),
        nombresCentro: new Map([["c1", "Cesfam Placeres"], ["c2", "Cesfam Padre Damian"]]),
        resolverUsuario: (id) =>
            id === "u1" ? { id: "u1", advertencia: null } : { id: "migracion-appsheet", advertencia: `Usuario ${String(id)} no migrado` }
    };
}

function entrada(parcial: Partial<OrdenEntradaOrigen>): OrdenEntradaOrigen {
    return {
        ID_OrdenEntrada: "e1",
        Fecha: FECHA,
        ID_User: "u1",
        Origen: "Droguería",
        GuiaDespacho: null,
        ID_Centro: "c1",
        ID_Bodega: "b1",
        Codigo_Recepcion: null,
        ...parcial
    };
}

function salida(parcial: Partial<OrdenSalidaOrigen>): OrdenSalidaOrigen {
    return {
        ID_OrdenSalida: "s1",
        Fecha: FECHA,
        ID_User: "u1",
        ID_Bodega: "b1",
        Tipo_Salida: "Consumo",
        ID_Centro: "c1",
        Destino: "Enfermería",
        Codigo_Salida: null,
        Enviar_Correo: "1",
        Correo_Destino: " jefa@cmvalparaiso.cl ",
        ...parcial
    };
}

describe("reglas de órdenes", () => {
    it("entradas: acepta válidas y rechaza bodega de prueba, inexistente y centro distinto", () => {
        const r = transformarEntradas(
            [
                entrada({}),
                entrada({ ID_OrdenEntrada: "e2", ID_Bodega: "bp" }),
                entrada({ ID_OrdenEntrada: "e3", ID_Bodega: "bx" }),
                entrada({ ID_OrdenEntrada: "e4", ID_Centro: "c2" })
            ],
            contexto()
        );
        expect(r.aceptados).toEqual([
            { id: "e1", fecha: FECHA, usuarioId: "u1", origen: "Droguería", guiaDespacho: null, centroId: "c1", bodegaId: "b1", codigoRecepcion: null }
        ]);
        expect(r.rechazos.map((x) => [x.clave, x.regla])).toEqual([
            ["e2", "centro_prueba"],
            ["e3", "bodega_inexistente"],
            ["e4", "centro_no_coincide"]
        ]);
    });

    it("órdenes con usuario inexistente quedan con el usuario técnico y advertencia", () => {
        const r = transformarEntradas([entrada({ ID_User: "fantasma" })], contexto());
        expect(r.aceptados[0].usuarioId).toBe("migracion-appsheet");
        expect(r.advertencias.map((a) => [a.clave, a.regla])).toEqual([["e1", "usuario_inexistente"]]);
    });

    it("salidas: convierte Enviar_Correo y recorta el correo destino", () => {
        const r = transformarSalidas([salida({}), salida({ ID_OrdenSalida: "s2", Enviar_Correo: null, Correo_Destino: "" })], contexto());
        expect(r.aceptados[0]).toEqual({
            id: "s1",
            fecha: FECHA,
            usuarioId: "u1",
            bodegaId: "b1",
            tipoSalida: "Consumo",
            centroId: "c1",
            destino: "Enfermería",
            codigoSalida: null,
            enviarCorreo: true,
            correoDestino: "jefa@cmvalparaiso.cl"
        });
        expect(r.aceptados[1]).toMatchObject({ enviarCorreo: false, correoDestino: null });
    });

    it("salidas A Otros Centros: centro de la bodega y destino con el centro de destino", () => {
        const r = transformarSalidas(
            [salida({ Tipo_Salida: "A Otros Centros", ID_Centro: "c2", Destino: "Aseo" }), salida({ ID_OrdenSalida: "s3", ID_Centro: "c2" })],
            contexto()
        );
        expect(r.aceptados).toHaveLength(1);
        expect(r.aceptados[0]).toMatchObject({ centroId: "c1", destino: "Aseo — Cesfam Padre Damian" });
        expect(r.advertencias.map((a) => [a.clave, a.regla])).toEqual([["s1", "centro_destino"]]);
        expect(r.rechazos.map((x) => [x.clave, x.regla])).toEqual([["s3", "centro_no_coincide"]]);
    });

    it("detalles de entrada: huérfanos, producto inexistente, cantidad inválida y lote vacío", () => {
        const base = { ID_Product: 10, Categoria: "Insumo", Fecha_Caducidad: "2027-01-31", Cantidad: 5, Lote: "L1", ID_OrdenEntrada: "e1" };
        const r = transformarDetallesEntrada(
            [
                { ID_Entrada: "d1", ...base },
                { ID_Entrada: "d2", ...base, ID_OrdenEntrada: "e2" },
                { ID_Entrada: "d3", ...base, ID_OrdenEntrada: "ex" },
                { ID_Entrada: "d4", ...base, ID_Product: 99 },
                { ID_Entrada: "d5", ...base, Cantidad: 0 },
                { ID_Entrada: "d6", ...base, Lote: null, Fecha_Caducidad: null }
            ],
            { ordenesAceptadas: new Set(["e1"]), ordenesOrigen: new Set(["e1", "e2"]), productos: new Set([10]) }
        );
        expect(r.aceptados.map((d) => d.id)).toEqual(["d1", "d6"]);
        expect(r.aceptados[0]).toEqual({
            id: "d1",
            productoId: 10,
            categoria: "Insumo",
            fechaCaducidad: new Date(Date.UTC(2027, 0, 31)),
            cantidad: 5,
            lote: "L1",
            ordenEntradaId: "e1"
        });
        expect(r.aceptados[1]).toMatchObject({ lote: "SIN LOTE", fechaCaducidad: new Date(Date.UTC(2099, 11, 31)) });
        expect(r.rechazos.map((x) => [x.clave, x.regla])).toEqual([
            ["d2", "orden_no_migrada"],
            ["d3", "orden_inexistente"],
            ["d4", "producto_inexistente"],
            ["d5", "cantidad_invalida"]
        ]);
        expect(r.advertencias.map((a) => a.regla)).toEqual(["lote_vacio", "caducidad_nula"]);
    });

    it("detalles de salida: mismo tratamiento sin categoría", () => {
        const r = transformarDetallesSalida(
            [
                { ID_Detalle: "x1", ID_Product: 10, Cantidad: 2, ID_OrdenSalida: "s1", Lote: "L1", Fecha_Caducidad: "2027-01-31" },
                { ID_Detalle: "x2", ID_Product: 10, Cantidad: 2, ID_OrdenSalida: "sx", Lote: "L1", Fecha_Caducidad: "2027-01-31" }
            ],
            { ordenesAceptadas: new Set(["s1"]), ordenesOrigen: new Set(["s1"]), productos: new Set([10]) }
        );
        expect(r.aceptados).toEqual([
            { id: "x1", productoId: 10, cantidad: 2, ordenSalidaId: "s1", lote: "L1", fechaCaducidad: new Date(Date.UTC(2027, 0, 31)) }
        ]);
        expect(r.rechazos.map((x) => x.regla)).toEqual(["orden_inexistente"]);
    });
});
