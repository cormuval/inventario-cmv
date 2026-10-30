import { describe, expect, it } from "vitest";

// migracion
import {
    transformarBodegas,
    transformarCentros,
    transformarProductos,
    transformarUnidades
} from "../../prisma/scripts/migracion-appsheet/reglas-maestros";

describe("reglas de maestros", () => {
    it("centros: excluye Centro Prueba y rechaza nombre vacío", () => {
        const r = transformarCentros([
            { ID_Centro: "c1", Nombre: " Cesfam Barón ", Estado: BigInt(1) },
            { ID_Centro: "3d3f9a13", Nombre: "Centro Prueba", Estado: 1 },
            { ID_Centro: "c2", Nombre: "", Estado: 1 },
            { ID_Centro: "c3", Nombre: "Inactivo", Estado: 0 }
        ]);
        expect(r.aceptados).toEqual([
            { id: "c1", nombre: "Cesfam Barón", estado: true },
            { id: "c3", nombre: "Inactivo", estado: false }
        ]);
        expect(r.rechazos.map((x) => [x.clave, x.regla])).toEqual([
            ["3d3f9a13", "centro_prueba"],
            ["c2", "campo_requerido"]
        ]);
        expect(r.leidos).toBe(4);
    });

    it("bodegas: rechaza las de Centro Prueba y las de centros inexistentes", () => {
        const r = transformarBodegas(
            [
                { ID_Bodega: "b1", Bodega: "Farmacia", ID_Centro: "c1", Estado: 1 },
                { ID_Bodega: "b2", Bodega: "Prueba", ID_Centro: "3d3f9a13", Estado: 1 },
                { ID_Bodega: "b3", Bodega: "Huérfana", ID_Centro: "cx", Estado: 1 }
            ],
            new Set(["c1"])
        );
        expect(r.aceptados).toEqual([{ id: "b1", nombre: "Farmacia", centroId: "c1", estado: true }]);
        expect(r.rechazos.map((x) => [x.clave, x.regla])).toEqual([
            ["b2", "centro_prueba"],
            ["b3", "centro_inexistente"]
        ]);
    });

    it("unidades: rechaza descripción repetida sin distinguir mayúsculas", () => {
        const r = transformarUnidades([
            { ID_Unidad: "u1", Descripcion: "Caja" },
            { ID_Unidad: "u2", Descripcion: "CAJA " },
            { ID_Unidad: "u3", Descripcion: null }
        ]);
        expect(r.aceptados).toEqual([{ id: "u1", descripcion: "Caja" }]);
        expect(r.rechazos.map((x) => [x.clave, x.regla])).toEqual([
            ["u2", "descripcion_duplicada"],
            ["u3", "campo_requerido"]
        ]);
    });

    it("productos: id numérico, estado activo y campos requeridos", () => {
        const r = transformarProductos([
            { ID_Product: 10, Linea: "Aseo", Descripcion: "Cloro" },
            { ID_Product: 10, Linea: "Aseo", Descripcion: "Repetido" },
            { ID_Product: null, Linea: "Aseo", Descripcion: "Sin id" },
            { ID_Product: 11, Linea: "", Descripcion: "Sin línea" }
        ]);
        expect(r.aceptados).toEqual([{ id: 10, linea: "Aseo", descripcion: "Cloro", estado: true }]);
        expect(r.rechazos.map((x) => x.regla)).toEqual(["clave_duplicada", "clave_nula", "campo_requerido"]);
    });
});
