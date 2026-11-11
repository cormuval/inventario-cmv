import { describe, expect, it } from "vitest";
import { crearOrdenSalidaSchema } from "@/modules/orden-salida/schemas/orden-salida.schema";

describe("crearOrdenSalidaSchema - validaciones sanitarias", () => {
    const hoy = new Date();
    const ayer = new Date(Date.now() - 24 * 60 * 60 * 1000);
    const manana = new Date(Date.now() + 24 * 60 * 60 * 1000);

    it("rechaza salida 'Consumo Interno' si contiene un lote caducado", () => {
        const payload = {
            fecha: hoy,
            bodegaId: "bodega-1",
            centroId: "centro-1",
            tipoSalida: "Consumo Interno",
            destino: "Box 3 CESFAM",
            detalles: [{
                productoId: 1,
                cantidad: 5,
                lote: "LOT-CADUCADO",
                fechaCaducidad: ayer
            }]
        };

        const result = crearOrdenSalidaSchema.safeParse(payload);
        expect(result.success).toBe(false);
        if (!result.success) {
            const hasCaducadoMsg = result.error.issues.some((issue) => /caducado/i.test(issue.message));
            expect(hasCaducadoMsg).toBe(true);
        }
    });

    it("permite salida 'Merma' con lote caducado si incluye justificacion en destino", () => {
        const payload = {
            fecha: hoy,
            bodegaId: "bodega-1",
            centroId: "centro-1",
            tipoSalida: "Merma",
            destino: "Baja sanitaria por vencimiento en estante",
            detalles: [{
                productoId: 1,
                cantidad: 5,
                lote: "LOT-CADUCADO",
                fechaCaducidad: ayer
            }]
        };

        const result = crearOrdenSalidaSchema.safeParse(payload);
        expect(result.success).toBe(true);
    });

    it("acepta 'Merma' con la causal REAS aunque tenga menos de 5 caracteres", () => {
        const result = crearOrdenSalidaSchema.safeParse({
            fecha: hoy,
            bodegaId: "bodega-1",
            centroId: "centro-1",
            tipoSalida: "Merma",
            destino: "REAS",
            detalles: [{ productoId: 1, cantidad: 5, lote: "LOT-CADUCADO", fechaCaducidad: ayer }]
        });
        expect(result.success).toBe(true);
    });

    it("permite salida 'Consumo Interno' si los lotes son vigentes", () => {
        const payload = {
            fecha: hoy,
            bodegaId: "bodega-1",
            centroId: "centro-1",
            tipoSalida: "Consumo Interno",
            destino: "Box 3 CESFAM",
            detalles: [{
                productoId: 1,
                cantidad: 5,
                lote: "LOT-VIGENTE",
                fechaCaducidad: manana
            }]
        };

        const result = crearOrdenSalidaSchema.safeParse(payload);
        expect(result.success).toBe(true);
    });

    it("clasifica las unidades: solo 'Regularización de Bodega' y 'REAS' son causales de merma", async () => {
        const { clasificarUnidadesSalida, esUnidadMerma } = await import("@/modules/orden-salida/constants/destinos");

        expect(
            clasificarUnidadesSalida([
                { descripcion: "Box" },
                { descripcion: "REAS" },
                { descripcion: "Dental" },
                { descripcion: "Regularización de Bodega" }
            ])
        ).toEqual({ consumo: ["Box", "Dental"], merma: ["REAS", "Regularización de Bodega"] });
        expect(esUnidadMerma("  regularizacion de bodega ")).toBe(true);
        expect(esUnidadMerma("reas")).toBe(true);
        expect(esUnidadMerma("SAPU")).toBe(false);
    });

    it("rechaza salida 'A Otros Centros' si falta bodegaDestinoId", () => {
        const payload = {
            fecha: hoy,
            bodegaId: "bodega-1",
            centroId: "centro-1",
            tipoSalida: "A Otros Centros",
            destino: "CESFAM Playa Ancha",
            centroDestinoId: "centro-2",
            detalles: [{
                productoId: 1,
                cantidad: 2,
                lote: "LOT-1",
                fechaCaducidad: manana
            }]
        };

        const result = crearOrdenSalidaSchema.safeParse(payload);
        expect(result.success).toBe(false);
        if (!result.success) {
            const hasBodegaMsg = result.error.issues.some((i) => /bodega destino/i.test(i.message));
            expect(hasBodegaMsg).toBe(true);
        }
    });

    it("permite salida 'A Otros Centros' con centroDestinoId y bodegaDestinoId válidos", () => {
        const payload = {
            fecha: hoy,
            bodegaId: "bodega-1",
            centroId: "centro-1",
            tipoSalida: "A Otros Centros",
            destino: "CESFAM Playa Ancha",
            centroDestinoId: "centro-2",
            bodegaDestinoId: "bodega-2",
            advertenciaCaducidadAceptada: true,
            detalles: [{
                productoId: 1,
                cantidad: 2,
                lote: "LOT-1",
                fechaCaducidad: manana
            }]
        };

        const result = crearOrdenSalidaSchema.safeParse(payload);
        expect(result.success).toBe(true);
    });
});

