import { describe, expect, it } from "vitest";

// utils
import {
    columnasDelPeriodo,
    esMesValido,
    leerFiltrosReporte,
    mesesEntre,
    parametrosDeReporte,
    rangoDelPeriodo,
    sumarMesesClave
} from "@/modules/reporte/utils/periodo";

const HOY = "2026-10-30";

describe("utilidades de meses", () => {
    it("valida el formato YYYY-MM", () => {
        expect(esMesValido("2026-01")).toBe(true);
        expect(esMesValido("2026-13")).toBe(false);
        expect(esMesValido("2026-1")).toBe(false);
    });

    it("suma meses y cuenta meses inclusive", () => {
        expect(sumarMesesClave("2025-11", 2)).toBe("2026-01");
        expect(mesesEntre("2025-11", "2026-10")).toBe(12);
        expect(mesesEntre("2026-01", "2026-01")).toBe(1);
    });
});

describe("leerFiltrosReporte", () => {
    it("usa el año en curso por defecto", () => {
        expect(leerFiltrosReporte(undefined, HOY)).toEqual({
            mesDesde: "2026-01",
            mesHasta: "2026-12",
            centroId: undefined,
            bodegaId: undefined,
            busqueda: "",
            pagina: 1,
            avisos: []
        });
    });

    it("acepta un período que cruza de año", () => {
        const filtros = leerFiltrosReporte({ mesDesde: "2025-11", mesHasta: "2026-10", q: " guante ", pagina: "2" }, HOY);
        expect(filtros).toMatchObject({ mesDesde: "2025-11", mesHasta: "2026-10", busqueda: "guante", pagina: 2, avisos: [] });
    });

    it("vuelve al año en curso con aviso ante período inválido, invertido o mayor a 12 meses", () => {
        expect(leerFiltrosReporte({ mesDesde: "2026-13", mesHasta: "2026-12" }, HOY).avisos).toEqual([
            "El período ingresado no es válido; se muestra el año en curso."
        ]);
        expect(leerFiltrosReporte({ mesDesde: "2026-06", mesHasta: "2026-01" }, HOY).avisos).toEqual([
            "El mes desde es posterior al mes hasta; se muestra el año en curso."
        ]);
        const largo = leerFiltrosReporte({ mesDesde: "2025-10", mesHasta: "2026-10" }, HOY);
        expect(largo.avisos).toEqual(["El período máximo es de 12 meses; se muestra el año en curso."]);
        expect(largo.mesDesde).toBe("2026-01");
    });

    it("lee el nodo del selector móvil", () => {
        expect(leerFiltrosReporte({ nodo: "c:centro-1" }, HOY)).toMatchObject({ centroId: "centro-1", bodegaId: undefined });
        expect(leerFiltrosReporte({ nodo: "b:b1", centroId: "centro-1" }, HOY)).toMatchObject({ centroId: undefined, bodegaId: "b1" });
        expect(leerFiltrosReporte({ nodo: "" , centroId: "centro-1" }, HOY)).toMatchObject({ centroId: undefined, bodegaId: undefined });
    });
});

describe("columnas y rango", () => {
    it("genera una columna por mes con etiqueta corta", () => {
        expect(columnasDelPeriodo("2025-11", "2026-02")).toEqual([
            { clave: "2025-11", etiqueta: "nov-2025" },
            { clave: "2025-12", etiqueta: "dic-2025" },
            { clave: "2026-01", etiqueta: "ene-2026" },
            { clave: "2026-02", etiqueta: "feb-2026" }
        ]);
    });

    it("convierte el período a [primer día, primer día del mes siguiente)", () => {
        expect(rangoDelPeriodo("2026-01", "2026-12")).toEqual({
            gte: new Date("2026-01-01T00:00:00.000Z"),
            lt: new Date("2027-01-01T00:00:00.000Z")
        });
    });

    it("entrega los parámetros de URL sin página", () => {
        expect(parametrosDeReporte(leerFiltrosReporte({ q: "x", bodegaId: "b1", pagina: "3" }, HOY))).toEqual({
            mesDesde: "2026-01",
            mesHasta: "2026-12",
            centroId: undefined,
            bodegaId: "b1",
            q: "x"
        });
    });
});
