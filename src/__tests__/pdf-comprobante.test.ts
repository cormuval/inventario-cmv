import { describe, expect, it } from "vitest";
import zlib from "zlib";
import { generarComprobanteSalidaPDF, type OrdenSalidaPDFData } from "@/modules/orden-salida/utils/pdf-comprobante";

function extraerTextoPDF(buffer: Buffer): string {
    const raw = buffer.toString("latin1");
    let textoAcumulado = "";

    // Captura bloques de texto con kerning: [<hex> num <hex> ...] TJ o [(str) num ...] TJ
    const tjRegex = /\[([\s\S]*?)\]\s*TJ/g;
    let match: RegExpExecArray | null;
    while ((match = tjRegex.exec(raw)) !== null) {
        const inner = match[1];
        const tokenRegex = /<([0-9a-fA-F]+)>|\(([^)]*)\)/g;
        let tMatch: RegExpExecArray | null;
        let linea = "";
        while ((tMatch = tokenRegex.exec(inner)) !== null) {
            if (tMatch[1]) {
                linea += Buffer.from(tMatch[1], "hex").toString("latin1");
            } else if (tMatch[2]) {
                linea += tMatch[2];
            }
        }
        textoAcumulado += "\n" + linea;
    }

    // Captura líneas de texto directo: (texto) Tj
    const tjSingleRegex = /\(([^)]+)\)\s*Tj/g;
    while ((match = tjSingleRegex.exec(raw)) !== null) {
        textoAcumulado += "\n" + match[1];
    }

    return raw + "\n" + textoAcumulado;
}

function contarPaginasPDF(buffer: Buffer): number {
    const raw = buffer.toString("latin1");
    return (raw.match(/\/Type\s*\/Page\b/g) ?? []).length;
}

describe("generarComprobanteSalidaPDF", () => {
    function crearMockOrden(
        cantidadDetalles: number,
        options: {
            tipoSalida?: string;
            codigoSalida?: string | null;
            codigoRecepcion?: string | null;
            fechaGeneracion?: Date;
        } = {}
    ): OrdenSalidaPDFData {
        return {
            id: "sal-12345",
            fecha: new Date("2026-10-27T10:00:00Z"),
            fechaGeneracion: options.fechaGeneracion ?? new Date("2026-10-27T14:30:15Z"),
            tipoSalida: options.tipoSalida ?? "Consumo Interno",
            destino: "Box Curaciones Sala 2",
            codigoSalida: options.codigoSalida !== undefined ? options.codigoSalida : "COD-789",
            codigoRecepcion: options.codigoRecepcion ?? null,
            centro: { nombre: "CESFAM Barón" },
            bodega: { nombre: "Bodega Farmacia Principal" },
            bodegaDestino: options.tipoSalida === "A Otros Centros" ? { nombre: "Bodega Farmacia Playa Ancha" } : null,
            usuario: {
                nombre: "Ana",
                apPaterno: "Gómez",
                email: "operador.demo@cmvalparaiso.cl"
            },
            detalles: Array.from({ length: cantidadDetalles }, (_, i) => ({
                id: `det-${i + 1}`,
                cantidad: 10 + i,
                lote: `LOT-2026-${i + 1}`,
                fechaCaducidad: new Date("2027-05-15"),
                unidad: "un.",
                producto: {
                    id: 100 + (i % 5),
                    descripcion: `Producto farmacéutico de prueba ítem ${(i % 5) + 1}`,
                    linea: "CLINICO"
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

    it("genera exactamente 1 página cuando tiene 5 detalles en una salida normal", async () => {
        const orden = crearMockOrden(5);
        const buffer = await generarComprobanteSalidaPDF(orden);
        const text = extraerTextoPDF(buffer);

        const paginas = contarPaginasPDF(buffer);
        expect(paginas).toBe(1);

        // Verificación de detalles institucionales en el contenido del PDF
        expect(text).toContain("CORPORACIÓN MUNICIPAL DE VALPARAÍSO");
        expect(text).toContain("COMPROBANTE DE SALIDA");
        expect(text).toContain("sal-12345");
        expect(text).toContain("Fecha salida:");
        expect(text).toContain("Generado:");
        expect(text).toContain("Productos únicos:");
    });

    it("incluye código de producto, unidad, total de productos únicos y fecha/hora de generación", async () => {
        const orden = crearMockOrden(5, {
            fechaGeneracion: new Date("2026-10-27T15:45:00Z")
        });
        const buffer = await generarComprobanteSalidaPDF(orden);
        const text = extraerTextoPDF(buffer);

        // Columnas del detalle
        expect(text).toContain("Código");
        expect(text).toContain("Unidad");
        expect(text).toContain("F. Venc.");

        // Códigos de producto numéricos e insumos
        expect(text).toContain("100");
        expect(text).toContain("un.");

        // Fila de totales con productos únicos
        expect(text).toContain("Total líneas:");
        expect(text).toContain("Productos únicos: 5");
        expect(text).toContain("TOTAL GENERAL:");
    });

    it("en un préstamo intercentros con ambos códigos, muestra codigoSalida y codigoRecepcion con etiquetas distintas", async () => {
        const ordenPrestamo = crearMockOrden(3, {
            tipoSalida: "A Otros Centros",
            codigoSalida: "GUIA-DESP-456",
            codigoRecepcion: "K94J2Q8"
        });

        const buffer = await generarComprobanteSalidaPDF(ordenPrestamo);
        const text = extraerTextoPDF(buffer);

        // Ambos códigos presentes con etiquetas diferenciadas
        expect(text).toContain("Código Salida:");
        expect(text).toContain("GUIA-DESP-456");

        expect(text).toContain("Cód. Recepción:");
        expect(text).toContain("K94J2Q8");

        // No se solapan ni se reemplazan
        expect(text).toContain("A Otros Centros");
    });

    it("en un préstamo intercentros que solo tiene codigoRecepcion, muestra Cód. Recepción", async () => {
        const ordenPrestamo = crearMockOrden(3, {
            tipoSalida: "A Otros Centros",
            codigoSalida: null,
            codigoRecepcion: "R99J2Q8"
        });

        const buffer = await generarComprobanteSalidaPDF(ordenPrestamo);
        const text = extraerTextoPDF(buffer);

        expect(text).toContain("Cód. Recepción:");
        expect(text).toContain("R99J2Q8");
        expect(text).not.toContain("Código Salida:");
    });

    it("maneja paginación correctamente en un caso multipágina con 80 detalles, repitiendo encabezados y firmas al final", async () => {
        const ordenLarga = crearMockOrden(80, {
            tipoSalida: "A Otros Centros",
            codigoSalida: "DESP-MULTI-80",
            codigoRecepcion: "X7Y6Z5W"
        });

        const buffer = await generarComprobanteSalidaPDF(ordenLarga);
        const text = extraerTextoPDF(buffer);

        const paginas = contarPaginasPDF(buffer);
        expect(paginas).toBeGreaterThan(1);
        expect(paginas).toBeLessThanOrEqual(4);

        // Verifica que la paginación global aparece en el pie de página
        expect(text).toContain(`Página 1 de ${paginas}`);
        expect(text).toContain(`Página ${paginas} de ${paginas}`);

        // Las firmas aparecen en la última página
        expect(text).toContain("ENTREGADO POR");
        expect(text).toContain("RECIBIDO CONFORME");

        // Totales de líneas y productos únicos calculados (en este mock son 5 únicos repetidos)
        expect(text).toContain("Total líneas: 80");
        expect(text).toContain("Productos únicos: 5");
        expect(text).toContain("TOTAL GENERAL:");
    });
});
