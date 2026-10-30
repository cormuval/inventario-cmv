import { describe, expect, it } from "vitest";

// migracion
import {
    booleano,
    claveUnica,
    email,
    entero,
    estado,
    fecha,
    normalizarLoteCaducidad,
    nuevaTabla,
    recortar,
    texto
} from "../../prisma/scripts/migracion-appsheet/normalizar";
import { CADUCIDAD_SIN_FECHA, LOTE_SIN_LOTE } from "../../prisma/scripts/migracion-appsheet/tipos";

describe("normalizar", () => {
    it("texto recorta espacios y convierte vacío o null en null", () => {
        expect(texto("  Cesfam  ")).toBe("Cesfam");
        expect(texto("   ")).toBeNull();
        expect(texto(null)).toBeNull();
        expect(texto(123)).toBe("123");
        expect(texto("Cesfam Las Cañas")).toBe("Cesfam Las Cañas");
    });

    it("booleano acepta 1, '1', true y bigint", () => {
        expect(booleano(1)).toBe(true);
        expect(booleano("1")).toBe(true);
        expect(booleano(true)).toBe(true);
        expect(booleano(BigInt(1))).toBe(true);
        expect(booleano(0)).toBe(false);
        expect(booleano(null)).toBe(false);
        expect(booleano("")).toBe(false);
    });

    it("estado nulo se considera activo", () => {
        expect(estado(null)).toBe(true);
        expect(estado(0)).toBe(false);
        expect(estado(BigInt(1))).toBe(true);
    });

    it("entero convierte números, bigint y strings numéricos", () => {
        expect(entero(5)).toBe(5);
        expect(entero(BigInt(7))).toBe(7);
        expect(entero("12")).toBe(12);
        expect(entero("")).toBeNull();
        expect(entero(null)).toBeNull();
        expect(entero("abc")).toBeNull();
        expect(entero(1.5)).toBeNull();
    });

    it("fecha acepta Date válido y string YYYY-MM-DD en UTC", () => {
        const d = new Date(Date.UTC(2026, 4, 2));
        expect(fecha(d)).toEqual(d);
        expect(fecha("2026-05-02")).toEqual(d);
        expect(fecha(new Date("x"))).toBeNull();
        expect(fecha(null)).toBeNull();
    });

    it("email normaliza a minúsculas sin espacios", () => {
        expect(email("  CCastillos@CMValparaiso.cl ")).toBe("ccastillos@cmvalparaiso.cl");
        expect(email("")).toBeNull();
    });

    it("recortar limita a 255 por defecto", () => {
        expect(recortar("a".repeat(300))).toHaveLength(255);
        expect(recortar("abc", 2)).toBe("ab");
    });

    it("claveUnica rechaza clave nula y duplicada", () => {
        const tabla = nuevaTabla<{ id: string }>(3);
        const vistos = new Set<string>();
        expect(claveUnica("Centro", "c1", vistos, tabla)).toBe("c1");
        expect(claveUnica("Centro", "c1", vistos, tabla)).toBeNull();
        expect(claveUnica("Centro", null, vistos, tabla)).toBeNull();
        expect(tabla.rechazos.map((r) => r.regla)).toEqual(["clave_duplicada", "clave_nula"]);
        expect(tabla.leidos).toBe(3);
    });

    it("normalizarLoteCaducidad usa SIN LOTE y 2099-12-31 con advertencias", () => {
        const r = normalizarLoteCaducidad("Stock", "s1", "  ", null);
        expect(r.lote).toBe(LOTE_SIN_LOTE);
        expect(r.fechaCaducidad).toEqual(CADUCIDAD_SIN_FECHA);
        expect(r.advertencias.map((a) => a.regla)).toEqual(["lote_vacio", "caducidad_nula"]);

        const ok = normalizarLoteCaducidad("Stock", "s2", " L-1 ", "2027-01-31");
        expect(ok.lote).toBe("L-1");
        expect(ok.fechaCaducidad).toEqual(new Date(Date.UTC(2027, 0, 31)));
        expect(ok.advertencias).toEqual([]);
    });
});
