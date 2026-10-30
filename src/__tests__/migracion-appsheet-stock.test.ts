import { describe, expect, it } from "vitest";

// migracion
import { transformarStock } from "../../prisma/scripts/migracion-appsheet/reglas-stock";
import { transformarTodo } from "../../prisma/scripts/migracion-appsheet/transformar";
import type { DatosOrigen, StockOrigen } from "../../prisma/scripts/migracion-appsheet/tipos";

const AHORA = new Date(Date.UTC(2026, 9, 29, 12));

function stock(parcial: Partial<StockOrigen>): StockOrigen {
    return {
        ID_Stock: "s1",
        ID_Product: 10,
        ID_Bodega: "b1",
        Cantidad_Disponible: 5,
        Fecha_Ultima_Actualizacion: "2026-10-01",
        StockMinimo: 2,
        Lote: "L1",
        Fecha_Caducidad: "2027-01-31",
        ...parcial
    };
}

const CONTEXTO_STOCK = { bodegas: new Map([["b1", "c1"]]), bodegasPrueba: new Set(["bp"]), productos: new Set([10]), ahora: AHORA };

describe("reglas de stock", () => {
    it("fusiona claves duplicadas sumando cantidades", () => {
        const r = transformarStock(
            [
                stock({}),
                stock({ ID_Stock: "s2", Lote: " l1 ", Cantidad_Disponible: 3, StockMinimo: 7, Fecha_Ultima_Actualizacion: "2026-10-20" })
            ],
            CONTEXTO_STOCK
        );
        expect(r.aceptados).toEqual([
            {
                id: "s1",
                productoId: 10,
                bodegaId: "b1",
                cantidadDisponible: 8,
                fechaUltimaActualizacion: new Date(Date.UTC(2026, 9, 20)),
                stockMinimo: 7,
                lote: "L1",
                fechaCaducidad: new Date(Date.UTC(2027, 0, 31))
            }
        ]);
        expect(r.advertencias.map((a) => [a.clave, a.regla, a.detalle])).toEqual([["s2", "stock_fusionado", "Fusionado en s1"]]);
    });

    it("rechaza bodega de prueba, bodega y producto inexistentes; cantidad nula pasa a 0", () => {
        const r = transformarStock(
            [
                stock({ ID_Stock: "a", ID_Bodega: "bp" }),
                stock({ ID_Stock: "b", ID_Bodega: "bx" }),
                stock({ ID_Stock: "c", ID_Product: 99 }),
                stock({ ID_Stock: "d", Cantidad_Disponible: null, Lote: null, Fecha_Ultima_Actualizacion: null })
            ],
            CONTEXTO_STOCK
        );
        expect(r.rechazos.map((x) => [x.clave, x.regla])).toEqual([
            ["a", "centro_prueba"],
            ["b", "bodega_inexistente"],
            ["c", "producto_inexistente"]
        ]);
        expect(r.aceptados[0]).toMatchObject({ id: "d", cantidadDisponible: 0, lote: "SIN LOTE", fechaUltimaActualizacion: AHORA });
        expect(r.advertencias.map((a) => a.regla)).toEqual(["cantidad_nula", "lote_vacio"]);
    });
});

describe("transformarTodo", () => {
    function origen(): DatosOrigen {
        return {
            centros: [
                { ID_Centro: "c1", Nombre: "Cesfam Placeres", Estado: 1 },
                { ID_Centro: "3d3f9a13", Nombre: "Centro Prueba", Estado: 1 }
            ],
            bodegas: [
                { ID_Bodega: "b1", Bodega: "Farmacia", ID_Centro: "c1", Estado: 1 },
                { ID_Bodega: "bp", Bodega: "Prueba", ID_Centro: "3d3f9a13", Estado: 1 }
            ],
            unidades: [{ ID_Unidad: "u", Descripcion: "Caja" }],
            productos: [{ ID_Product: 10, Linea: "Aseo", Descripcion: "Cloro" }],
            usuarios: [
                {
                    ID_User: "u1",
                    Nombre: "Ana",
                    Ap_Paterno: null,
                    Ap_Materno: null,
                    Rol: "R03",
                    ID_Bodega: "b1",
                    Telefono: null,
                    Email: "ana@cmvalparaiso.cl",
                    ID_Centro: "c1",
                    Estado: 1
                }
            ],
            entradas: [
                { ID_OrdenEntrada: "e1", Fecha: "2026-10-01", ID_User: "u1", Origen: "Droguería", GuiaDespacho: null, ID_Centro: "c1", ID_Bodega: "b1", Codigo_Recepcion: null },
                { ID_OrdenEntrada: "e2", Fecha: "2026-10-01", ID_User: "u1", Origen: "Droguería", GuiaDespacho: null, ID_Centro: "3d3f9a13", ID_Bodega: "bp", Codigo_Recepcion: null }
            ],
            entradaDetalles: [
                { ID_Entrada: "d1", ID_Product: 10, Categoria: "Insumo", Fecha_Caducidad: "2027-01-31", Cantidad: 5, Lote: "L1", ID_OrdenEntrada: "e1" },
                { ID_Entrada: "d2", ID_Product: 10, Categoria: "Insumo", Fecha_Caducidad: "2027-01-31", Cantidad: 5, Lote: "L1", ID_OrdenEntrada: "e2" }
            ],
            salidas: [
                {
                    ID_OrdenSalida: "s1",
                    Fecha: "2026-10-02",
                    ID_User: "fantasma",
                    ID_Bodega: "b1",
                    Tipo_Salida: "Consumo",
                    ID_Centro: "c1",
                    Destino: "Enfermería",
                    Codigo_Salida: null,
                    Enviar_Correo: null,
                    Correo_Destino: null
                }
            ],
            salidaDetalles: [{ ID_Detalle: "x1", ID_Product: 10, Cantidad: 1, ID_OrdenSalida: "s1", Lote: "L1", Fecha_Caducidad: "2027-01-31" }],
            stock: [stock({})]
        };
    }

    it("encadena las reglas: excluye Centro Prueba en cascada y asigna el usuario técnico", () => {
        const r = transformarTodo(origen(), { usuariosDestino: [], ahora: AHORA });
        expect(r.Centro.aceptados.map((c) => c.id)).toEqual(["c1"]);
        expect(r.Bodega.rechazos.map((x) => x.regla)).toEqual(["centro_prueba"]);
        expect(r.OrdenEntrada.rechazos.map((x) => [x.clave, x.regla])).toEqual([["e2", "centro_prueba"]]);
        expect(r.OrdenEntradaDetalle.rechazos.map((x) => [x.clave, x.regla])).toEqual([["d2", "orden_no_migrada"]]);
        expect(r.OrdenSalida.aceptados[0].usuarioId).toBe("migracion-appsheet");
        expect(r.OrdenSalidaDetalle.aceptados).toHaveLength(1);
        expect(r.Stock.aceptados).toHaveLength(1);
        expect(r.Usuario.aceptados.map((u) => u.id)).toEqual(["u1", "migracion-appsheet"]);
    });

    it("es determinista", () => {
        const a = transformarTodo(origen(), { usuariosDestino: [], ahora: AHORA });
        const b = transformarTodo(origen(), { usuariosDestino: [], ahora: AHORA });
        expect(a).toEqual(b);
    });

    it("reasigna órdenes de un usuario cuyo email ya existe en el destino", () => {
        const r = transformarTodo(origen(), { usuariosDestino: [{ id: "admin-seed", email: "ana@cmvalparaiso.cl" }], ahora: AHORA });
        expect(r.reasignaciones).toEqual({ u1: "admin-seed" });
        expect(r.OrdenEntrada.aceptados[0].usuarioId).toBe("admin-seed");
    });
});
