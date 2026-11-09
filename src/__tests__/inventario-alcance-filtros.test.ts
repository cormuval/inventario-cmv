import { describe, expect, it } from "vitest";

// lib
import {
    crearFiltroMovimientosAlcance,
    crearFiltroMovimientosSeleccion,
    crearFiltroStockAlcance
} from "@/shared/lib/inventario-alcance-filtros";

// types
import type { InventarioAlcance } from "@/shared/lib/inventario-alcance";

function crearAlcance(rol: string, centroIds: string[], bodegaIds: string[]): InventarioAlcance {
    return {
        usuario: {
            id: "user-1",
            nombre: "Funcionario",
            apPaterno: "Prueba",
            email: "funcionario@cmvalparaiso.cl",
            rol,
            centroId: "centro-1",
            bodegaId: null
        },
        centros: [],
        bodegas: [],
        centroId: null,
        bodegaId: null,
        centroIds,
        bodegaIds,
        puedeFiltrarCentro: rol === "R01" || rol === "R08"
    };
}

describe("inventario-alcance-filtros", () => {
    it("no restringe el historial ni el stock del Administrador (R01), incluidas bodegas inactivas", () => {
        const alcance = crearAlcance("R01", ["centro-1"], ["b1"]);

        expect(crearFiltroMovimientosAlcance(alcance)).toEqual({});
        expect(crearFiltroStockAlcance(alcance)).toEqual({});
    });

    it("no restringe el historial ni el stock del Visualizador Global Droguería (R08)", () => {
        const alcance = crearAlcance("R08", ["centro-1"], ["b1"]);

        expect(crearFiltroMovimientosAlcance(alcance)).toEqual({});
        expect(crearFiltroStockAlcance(alcance)).toEqual({});
    });

    it("acota al Encargado Centro (R02) a todo su centro, sin depender de bodegas activas", () => {
        const alcance = crearAlcance("R02", ["centro-1"], ["b1"]);

        expect(crearFiltroMovimientosAlcance(alcance)).toEqual({ centroId: { in: ["centro-1"] } });
        expect(crearFiltroStockAlcance(alcance)).toEqual({ bodega: { centroId: { in: ["centro-1"] } } });
    });

    it.each(["R03", "R06", "R07"])("acota al rol %s a sus bodegas asignadas", (rol) => {
        const alcance = crearAlcance(rol, ["centro-1"], ["b1", "b2"]);

        expect(crearFiltroMovimientosAlcance(alcance)).toEqual({
            centroId: { in: ["centro-1"] },
            bodegaId: { in: ["b1", "b2"] }
        });
        expect(crearFiltroStockAlcance(alcance)).toEqual({ bodegaId: { in: ["b1", "b2"] } });
    });

    it("retorna null cuando el usuario no tiene alcance", () => {
        expect(crearFiltroMovimientosAlcance(crearAlcance("R07", ["centro-1"], []))).toBeNull();
        expect(crearFiltroMovimientosAlcance(crearAlcance("R02", [], []))).toBeNull();
        expect(crearFiltroMovimientosAlcance(crearAlcance("R99", [], []))).toBeNull();
        expect(crearFiltroStockAlcance(crearAlcance("R07", ["centro-1"], []))).toBeNull();
    });
});

describe("crearFiltroMovimientosSeleccion", () => {
    it("aplica la bodega elegida por el Administrador", () => {
        const alcance = { ...crearAlcance("R01", ["centro-1"], ["b1"]), bodegaId: "b1", centroId: "centro-1" };
        expect(crearFiltroMovimientosSeleccion(alcance)).toEqual({ bodegaId: "b1" });
    });

    it("aplica el centro elegido por el Administrador sin bodega", () => {
        const alcance = { ...crearAlcance("R01", ["centro-1"], ["b1", "b2"]), centroId: "centro-1" };
        expect(crearFiltroMovimientosSeleccion(alcance)).toEqual({ centroId: "centro-1" });
    });

    it("no agrega el centro propio de un Encargado Centro (no es una selección)", () => {
        const alcance = { ...crearAlcance("R02", ["centro-1"], ["b1"]), centroId: "centro-1" };
        expect(crearFiltroMovimientosSeleccion(alcance)).toEqual({ centroId: { in: ["centro-1"] } });
    });

    it("acota a la bodega elegida dentro de las asignadas de un operador", () => {
        const alcance = { ...crearAlcance("R07", ["centro-1"], ["b1"]), bodegaId: "b1" };
        expect(crearFiltroMovimientosSeleccion(alcance)).toEqual({ centroId: { in: ["centro-1"] }, bodegaId: "b1" });
    });

    it("retorna null sin alcance", () => {
        expect(crearFiltroMovimientosSeleccion(crearAlcance("R07", [], []))).toBeNull();
    });
});
