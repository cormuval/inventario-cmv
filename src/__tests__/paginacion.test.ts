import { describe, expect, it } from "vitest";

// utils
import { TAMANO_PAGINA, calcularPaginacion, crearHrefConParametros } from "@/shared/utils/paginacion";

describe("calcularPaginacion", () => {
    it("calcula offset y rango visible de una página intermedia", () => {
        expect(calcularPaginacion(2, 1234)).toEqual({
            pagina: 2,
            tamano: TAMANO_PAGINA,
            total: 1234,
            paginasTotales: 25,
            skip: 50,
            desde: 51,
            hasta: 100
        });
    });

    it("lleva una página fuera de rango a la última", () => {
        const resultado = calcularPaginacion(99, 120);
        expect(resultado.pagina).toBe(3);
        expect(resultado.skip).toBe(100);
        expect(resultado.hasta).toBe(120);
    });

    it("normaliza páginas menores a 1 o no enteras", () => {
        expect(calcularPaginacion(0, 10).pagina).toBe(1);
        expect(calcularPaginacion(-3, 10).pagina).toBe(1);
        expect(calcularPaginacion(Number.NaN, 10).pagina).toBe(1);
    });

    it("sin resultados deja una página y rango 0–0", () => {
        expect(calcularPaginacion(1, 0)).toMatchObject({ pagina: 1, paginasTotales: 1, skip: 0, desde: 0, hasta: 0 });
    });
});

describe("crearHrefConParametros", () => {
    it("omite valores vacíos y conserva el resto", () => {
        expect(crearHrefConParametros("/salidas/registros", {
            desde: "2026-10-01",
            hasta: "2026-10-30",
            bodegaId: undefined,
            centroId: null,
            q: "",
            pagina: 3
        })).toBe("/salidas/registros?desde=2026-10-01&hasta=2026-10-30&pagina=3");
    });

    it("devuelve la ruta sola si no hay parámetros", () => {
        expect(crearHrefConParametros("/stock", {})).toBe("/stock");
    });
});

