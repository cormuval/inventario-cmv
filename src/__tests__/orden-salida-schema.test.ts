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

    it("rechaza salida 'Merma' si el destino/justificacion es demasiado corto o vacio", () => {
        const payload = {
            fecha: hoy,
            bodegaId: "bodega-1",
            centroId: "centro-1",
            tipoSalida: "Merma",
            destino: "baja",
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
            const hasJustificacionMsg = result.error.issues.some((issue) => /justificaci[oó]n/i.test(issue.message));
            expect(hasJustificacionMsg).toBe(true);
        }
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

    it("todos los destinos de CONSUMO_INTERNO y MERMA cumplen con los requisitos del schema", async () => {
        const { DESTINOS_CONSUMO_INTERNO, DESTINOS_MERMA } = await import(
            "@/modules/orden-salida/constants/destinos"
        );

        expect(DESTINOS_CONSUMO_INTERNO.length).toBeGreaterThan(0);
        for (const destino of DESTINOS_CONSUMO_INTERNO) {
            const result = crearOrdenSalidaSchema.safeParse({
                fecha: hoy,
                bodegaId: "bodega-1",
                centroId: "centro-1",
                tipoSalida: "Consumo Interno",
                destino,
                detalles: [{
                    productoId: 1,
                    cantidad: 1,
                    lote: "LOT-OK",
                    fechaCaducidad: manana
                }]
            });
            expect(result.success).toBe(true);
        }

        expect(DESTINOS_MERMA.length).toBeGreaterThan(0);
        for (const merma of DESTINOS_MERMA) {
            expect(merma.trim().length).toBeGreaterThanOrEqual(5);
            const result = crearOrdenSalidaSchema.safeParse({
                fecha: hoy,
                bodegaId: "bodega-1",
                centroId: "centro-1",
                tipoSalida: "Merma",
                destino: merma,
                detalles: [{
                    productoId: 1,
                    cantidad: 1,
                    lote: "LOT-CAD",
                    fechaCaducidad: ayer
                }]
            });
            expect(result.success).toBe(true);
        }
    });
});

