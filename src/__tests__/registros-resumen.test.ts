import { describe, expect, it } from "vitest";

// utils
import { formatearResumenDetalles, indexarResumenDetalles } from "@/shared/utils/registros";

describe("resumen de detalles por orden", () => {
    it("indexa por orden y trata la suma nula como 0", () => {
        const mapa = indexarResumenDetalles([
            { ordenId: "o1", productos: 3, unidades: 120 },
            { ordenId: "o2", productos: 1, unidades: null }
        ]);

        expect(mapa.get("o1")).toEqual({ productos: 3, unidades: 120 });
        expect(mapa.get("o2")).toEqual({ productos: 1, unidades: 0 });
        expect(mapa.get("o3")).toBeUndefined();
    });

    it("formatea con singular y separador de miles", () => {
        expect(formatearResumenDetalles({ productos: 1, unidades: 1 })).toBe("1 producto · 1 unidad");
        expect(formatearResumenDetalles({ productos: 12, unidades: 1500 })).toBe("12 productos · 1.500 unidades");
    });
});

