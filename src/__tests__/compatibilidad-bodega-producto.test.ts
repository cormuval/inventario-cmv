import { describe, expect, it } from "vitest";

// utils
import {
    esProductoCompatibleConBodega,
    filtrarProductosCompatibles,
    obtenerMensajeIncompatibilidad,
    sonProductosCompatiblesConBodega
} from "@/shared/utils/compatibilidad-bodega-producto";

describe("compatibilidad entre bodega y producto", () => {
    describe("esProductoCompatibleConBodega", () => {
        it("acepta en bodega ASEO solo productos de línea ASEO exacta", () => {
            expect(esProductoCompatibleConBodega("ASEO", "ASEO")).toBe(true);
            expect(esProductoCompatibleConBodega("ASEO", "CLINICO")).toBe(false);
            expect(esProductoCompatibleConBodega("ASEO", "Aseo")).toBe(false);
            expect(esProductoCompatibleConBodega("ASEO", "FARMACIA")).toBe(false);
        });

        it("rechaza en bodega CLINICA la línea ASEO exacta y acepta las demás", () => {
            expect(esProductoCompatibleConBodega("CLINICA", "ASEO")).toBe(false);
            expect(esProductoCompatibleConBodega("CLINICA", "CLINICO")).toBe(true);
            expect(esProductoCompatibleConBodega("CLINICA", "Aseo")).toBe(true);
            expect(esProductoCompatibleConBodega("CLINICA", "FARMACIA")).toBe(true);
        });
    });

    describe("sonProductosCompatiblesConBodega", () => {
        it("exige que todos los productos de la operación sean compatibles", () => {
            expect(sonProductosCompatiblesConBodega("ASEO", [{ linea: "ASEO" }, { linea: "ASEO" }])).toBe(true);
            expect(sonProductosCompatiblesConBodega("ASEO", [{ linea: "ASEO" }, { linea: "CLINICO" }])).toBe(false);
            expect(sonProductosCompatiblesConBodega("CLINICA", [{ linea: "CLINICO" }, { linea: "FARMACIA" }])).toBe(true);
            expect(sonProductosCompatiblesConBodega("CLINICA", [{ linea: "CLINICO" }, { linea: "ASEO" }])).toBe(false);
        });
    });

    it("filtra productos compatibles conservando su identidad y orden en un arreglo nuevo", () => {
        const productoClinico = { id: 1, linea: "CLINICO" };
        const productoAseo = { id: 2, linea: "ASEO" };
        const productoFarmacia = { id: 3, linea: "FARMACIA" };
        const productos = [productoClinico, productoAseo, productoFarmacia] as const;

        const compatibles = filtrarProductosCompatibles("CLINICA", productos);

        expect(compatibles).toEqual([productoClinico, productoFarmacia]);
        expect(compatibles).not.toBe(productos);
        expect(compatibles[0]).toBe(productoClinico);
        expect(compatibles[1]).toBe(productoFarmacia);
    });

    it("entrega un mensaje específico para cada tipo de bodega incompatible", () => {
        expect(obtenerMensajeIncompatibilidad("ASEO")).toContain("no corresponde a una bodega de aseo");
        expect(obtenerMensajeIncompatibilidad("CLINICA")).toContain("solo pueden ingresarse en bodegas de aseo");
    });
});
