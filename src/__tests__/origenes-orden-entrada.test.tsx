import { describe, expect, it } from "vitest";

// constants
import { ORIGENES_ORDEN_ENTRADA } from "@/modules/orden-entrada/constants/origenes-orden-entrada";

// schemas
import { crearOrdenEntradaSchema } from "@/modules/orden-entrada/schemas/orden-entrada.schema";

describe("Catálogo de orígenes de órdenes de entrada", () => {
    const origenesEsperados = [
        "Drogueria",
        "Desde Otros Centros",
        "Otros Servicios",
        "Bodega Central",
        "Fondo Global Menor"
    ];

    const crearInputBase = (origen: string) => ({
        fecha: new Date(),
        origen,
        guiaDespacho: "GD-001",
        centroId: "centro-1",
        bodegaId: "bodega-1",
        detalles: [{
            productoId: 1,
            fechaCaducidad: new Date(Date.now() + 24 * 60 * 60 * 1000),
            cantidad: 1,
            lote: "LOT-001"
        }]
    });

    it("expone exactamente los cinco orígenes permitidos", () => {
        expect(ORIGENES_ORDEN_ENTRADA).toEqual(origenesEsperados);
    });

    it.each(origenesEsperados)("acepta el origen %s", (origen) => {
        const result = crearOrdenEntradaSchema.safeParse(crearInputBase(origen));

        expect(result.success).toBe(true);
    });

    it("rechaza un origen fuera del catálogo", () => {
        const result = crearOrdenEntradaSchema.safeParse(crearInputBase("Bodega inventada"));

        expect(result.success).toBe(false);
    });
});
