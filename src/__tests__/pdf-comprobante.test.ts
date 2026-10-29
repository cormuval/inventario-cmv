import { describe, expect, it } from "vitest";
import { generarComprobanteSalidaPDF, type OrdenSalidaPDFData } from "@/modules/orden-salida/utils/pdf-comprobante";

describe("generarComprobanteSalidaPDF", () => {
    function crearMockOrden(cantidadDetalles: number): OrdenSalidaPDFData {
        return {
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
            detalles: Array.from({ length: cantidadDetalles }, (_, i) => ({
                id: `det-${i + 1}`,
                cantidad: 10 + i,
                lote: `LOT-2026-${i + 1}`,
                fechaCaducidad: new Date("2027-05-15"),
                producto: {
                    descripcion: `Producto farmacéutico de prueba ítem ${i + 1}`
                }
            }))
        };
    }

    it("genera un buffer binario de PDF con encabezado %PDF-", async () => {
        const buffer = await generarComprobanteSalidaPDF(crearMockOrden(2));
        expect(Buffer.isBuffer(buffer)).toBe(true);
        expect(buffer.length).toBeGreaterThan(500);

        // La firma mágica de los archivos PDF debe ser %PDF-
        const magicHeader = buffer.subarray(0, 5).toString("ascii");
        expect(magicHeader).toBe("%PDF-");
    });

    it("genera exactamente 1 página cuando tiene 5 detalles", async () => {
        const buffer = await generarComprobanteSalidaPDF(crearMockOrden(5));
        const paginas = (buffer.toString("latin1").match(/\/Type\s*\/Page\b/g) ?? []).length;
        expect(paginas).toBe(1);
    });

    it("maneja paginación correctamente con 80 detalles generando páginas razonables (<= 4)", async () => {
        const buffer = await generarComprobanteSalidaPDF(crearMockOrden(80));
        const paginas = (buffer.toString("latin1").match(/\/Type\s*\/Page\b/g) ?? []).length;
        expect(paginas).toBeGreaterThan(1);
        expect(paginas).toBeLessThanOrEqual(4);
    });
});
