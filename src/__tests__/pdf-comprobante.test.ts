import { describe, expect, it } from "vitest";
import { generarComprobanteSalidaPDF, type OrdenSalidaPDFData } from "@/modules/orden-salida/utils/pdf-comprobante";

describe("generarComprobanteSalidaPDF", () => {
    const mockOrden: OrdenSalidaPDFData = {
        id: "sal-12345",
        fecha: new Date("2026-10-27T10:00:00Z"),
        tipoSalida: "Consumo Interno",
        destino: "Box Curaciones Sala 2",
        codigoSalida: "COD-789",
        centro: { nombre: "CESFAM Barón" },
        bodega: { nombre: "Bodega Farmacia Principal" },
        bodegaDestino: null,
        usuario: {
            nombre: "Ana",
            apPaterno: "Gómez",
            email: "agomez@cmvalparaiso.cl"
        },
        detalles: [
            {
                id: "det-1",
                cantidad: 50,
                lote: "LOT-2026-A",
                fechaCaducidad: new Date("2027-05-15"),
                producto: {
                    descripcion: "Paracetamol 500mg comprimidos"
                }
            },
            {
                id: "det-2",
                cantidad: 10,
                lote: "LOT-GAS-99",
                fechaCaducidad: new Date("2028-01-01"),
                producto: {
                    descripcion: "Gasa estéril 10x10cm"
                }
            }
        ]
    };

    it("genera un buffer binario de PDF con encabezado %PDF-", async () => {
        const buffer = await generarComprobanteSalidaPDF(mockOrden);
        expect(Buffer.isBuffer(buffer)).toBe(true);
        expect(buffer.length).toBeGreaterThan(500);

        // La firma mágica de los archivos PDF debe ser %PDF-
        const magicHeader = buffer.subarray(0, 5).toString("ascii");
        expect(magicHeader).toBe("%PDF-");
    });
});
