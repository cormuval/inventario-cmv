import { describe, expect, it } from "vitest";
import {
    esCodigoRecepcionValido,
    generarCodigoRecepcion,
    normalizarCodigoRecepcion
} from "@/modules/orden-salida/utils/codigo-recepcion";

describe("generarCodigoRecepcion", () => {
    it("genera un código de exactamente 7 caracteres en mayúsculas", () => {
        const codigo = generarCodigoRecepcion();
        expect(codigo).toHaveLength(7);
        expect(codigo).toBe(codigo.toUpperCase());
    });

    it("no contiene caracteres ambiguos visualmente (0, O, 1, I)", () => {
        for (let i = 0; i < 50; i++) {
            const codigo = generarCodigoRecepcion();
            expect(codigo).not.toMatch(/[0O1I]/);
            expect(esCodigoRecepcionValido(codigo)).toBe(true);
        }
    });

    it("valida y normaliza correctamente códigos con esCodigoRecepcionValido", () => {
        expect(esCodigoRecepcionValido("K94J2Q8")).toBe(true);
        expect(esCodigoRecepcionValido("k94j2q8")).toBe(true); // normalizado en minúscula
        expect(esCodigoRecepcionValido("  K94J2Q8  ")).toBe(true); // con espacios
        expect(esCodigoRecepcionValido("K94J2")).toBe(false); // longitud menor
        expect(esCodigoRecepcionValido("K94J2Q89")).toBe(false); // longitud mayor
        expect(esCodigoRecepcionValido("K9402Q8")).toBe(false); // contiene 0
        expect(esCodigoRecepcionValido("K94O2Q8")).toBe(false); // contiene O
        expect(esCodigoRecepcionValido("K9412Q8")).toBe(false); // contiene 1
        expect(esCodigoRecepcionValido("K94I2Q8")).toBe(false); // contiene I
        expect(esCodigoRecepcionValido(null)).toBe(false);
        expect(esCodigoRecepcionValido(undefined)).toBe(false);
    });

    it("normaliza códigos a mayúsculas y sin espacios", () => {
        expect(normalizarCodigoRecepcion("  abc2345  ")).toBe("ABC2345");
    });
});
