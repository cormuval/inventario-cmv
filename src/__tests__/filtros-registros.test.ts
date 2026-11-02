import { describe, expect, it } from "vitest";

// utils
import {
    esFechaIsoValida,
    fechaHoyChile,
    leerFiltrosRegistros,
    leerPagina,
    parametrosDeFiltros,
    rangoFechasDb,
    sumarDias,
    sumarMeses
} from "@/shared/utils/filtros-registros";

const HOY = "2026-10-30";

describe("fechas ISO", () => {
    it("valida formato y fecha real", () => {
        expect(esFechaIsoValida("2026-10-30")).toBe(true);
        expect(esFechaIsoValida("2026-02-30")).toBe(false);
        expect(esFechaIsoValida("30-10-2026")).toBe(false);
        expect(esFechaIsoValida("")).toBe(false);
    });

    it("suma días y meses respetando fin de mes", () => {
        expect(sumarDias("2026-10-30", -30)).toBe("2026-09-30");
        expect(sumarMeses("2026-10-30", -12)).toBe("2025-10-30");
        expect(sumarMeses("2026-03-31", -1)).toBe("2026-02-28");
    });

    it("obtiene la fecha de hoy en Chile", () => {
        // 30-10-2026 02:00 UTC es 29-10-2026 23:00 en Chile (UTC-3)
        expect(fechaHoyChile(new Date("2026-10-30T02:00:00.000Z"))).toBe("2026-10-29");
    });
});

describe("leerFiltrosRegistros", () => {
    it("usa los últimos 30 días y página 1 por defecto", () => {
        expect(leerFiltrosRegistros(undefined, HOY)).toEqual({
            desde: "2026-09-30",
            hasta: HOY,
            centroId: undefined,
            bodegaId: undefined,
            pagina: 1,
            avisos: []
        });
    });

    it("acepta un rango válido, centro, bodega y página", () => {
        const filtros = leerFiltrosRegistros({
            desde: "2026-01-01",
            hasta: "2026-06-30",
            centroId: "c1",
            bodegaId: ["b1", "b2"],
            pagina: "3"
        }, HOY);

        expect(filtros).toEqual({
            desde: "2026-01-01",
            hasta: "2026-06-30",
            centroId: "c1",
            bodegaId: "b1",
            pagina: 3,
            avisos: []
        });
    });

    it("ignora el valor 'todos' de los selects", () => {
        const filtros = leerFiltrosRegistros({ centroId: "todos", bodegaId: "todos" }, HOY);
        expect(filtros.centroId).toBeUndefined();
        expect(filtros.bodegaId).toBeUndefined();
    });

    it("vuelve al rango por defecto con aviso si una fecha es inválida", () => {
        const filtros = leerFiltrosRegistros({ desde: "2026-13-01", hasta: HOY }, HOY);
        expect(filtros.desde).toBe("2026-09-30");
        expect(filtros.hasta).toBe(HOY);
        expect(filtros.avisos).toEqual(["Las fechas ingresadas no son válidas; se muestran los últimos 30 días."]);
    });

    it("vuelve al rango por defecto con aviso si desde es posterior a hasta", () => {
        const filtros = leerFiltrosRegistros({ desde: "2026-10-10", hasta: "2026-10-01" }, HOY);
        expect(filtros.desde).toBe("2026-09-30");
        expect(filtros.avisos).toEqual(["La fecha desde es posterior a la fecha hasta; se muestran los últimos 30 días."]);
    });

    it("rechaza rangos mayores a 12 meses", () => {
        expect(leerFiltrosRegistros({ desde: "2025-10-30", hasta: HOY }, HOY).avisos).toEqual([]);

        const filtros = leerFiltrosRegistros({ desde: "2025-10-29", hasta: HOY }, HOY);
        expect(filtros.desde).toBe("2026-09-30");
        expect(filtros.avisos).toEqual(["El rango máximo es de 12 meses; se muestran los últimos 30 días."]);
    });

    it("lee la página como entero positivo", () => {
        expect(leerPagina(undefined)).toBe(1);
        expect(leerPagina("abc")).toBe(1);
        expect(leerPagina("0")).toBe(1);
        expect(leerPagina("2.5")).toBe(1);
        expect(leerPagina("7")).toBe(7);
    });
});

describe("rangoFechasDb y parametrosDeFiltros", () => {
    it("convierte el rango a medianoche UTC (columnas @db.Date)", () => {
        expect(rangoFechasDb("2026-10-01", "2026-10-30")).toEqual({
            gte: new Date("2026-10-01T00:00:00.000Z"),
            lte: new Date("2026-10-30T00:00:00.000Z")
        });
    });

    it("devuelve los parámetros de URL sin página ni avisos", () => {
        expect(parametrosDeFiltros({ desde: "2026-10-01", hasta: "2026-10-30", bodegaId: "b1", pagina: 4, avisos: ["x"] })).toEqual({
            desde: "2026-10-01",
            hasta: "2026-10-30",
            centroId: undefined,
            bodegaId: "b1"
        });
    });
});
