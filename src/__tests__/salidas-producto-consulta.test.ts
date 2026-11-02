import { describe, expect, it } from "vitest";

// utils
import {
    construirTotalesPorBodega,
    construirTotalesPorTipo,
    leerProductoId,
    mapearTotales,
    type ConsultaSalidasProducto
} from "@/modules/orden-salida/utils/salidas-producto-consulta";

function plano(sql: { sql: string }): string {
    return sql.sql.replace(/\s+/g, " ");
}

const CONSULTA: ConsultaSalidasProducto = {
    productoId: 7,
    filtroMovimientos: { bodegaId: "b1" },
    gte: new Date("2026-10-01T00:00:00.000Z"),
    lte: new Date("2026-10-30T00:00:00.000Z")
};

describe("totales de salidas por producto", () => {
    it("agrupa por bodega con producto, rango y alcance", () => {
        const consulta = construirTotalesPorBodega(CONSULTA);
        const texto = plano(consulta);

        expect(texto).toContain("WHERE d.ID_Product = ? AND o.Fecha >= ? AND o.Fecha <= ? AND 1 = 1 AND o.ID_Bodega = ?");
        expect(texto).toContain("GROUP BY o.ID_Bodega, b.Bodega");
        expect(consulta.values).toEqual([7, CONSULTA.gte, CONSULTA.lte, "b1"]);
    });

    it("agrupa por tipo de salida", () => {
        expect(plano(construirTotalesPorTipo(CONSULTA))).toContain("GROUP BY o.Tipo_Salida");
    });

    it("convierte cantidades a número", () => {
        expect(mapearTotales([{ clave: "b1", etiqueta: "Farmacia", cantidad: BigInt(15) }])).toEqual([
            { clave: "b1", etiqueta: "Farmacia", cantidad: 15 }
        ]);
    });
});

describe("leerProductoId", () => {
    it("acepta solo enteros positivos", () => {
        expect(leerProductoId("7")).toBe(7);
        expect(leerProductoId("0")).toBeUndefined();
        expect(leerProductoId("abc")).toBeUndefined();
        expect(leerProductoId(undefined)).toBeUndefined();
    });
});
