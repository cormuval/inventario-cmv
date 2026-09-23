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
});
