import PDFDocument from "pdfkit";
import { formatDate, formatNumber } from "@/shared/utils/format";

export interface OrdenSalidaPDFData {
    id: string;
    fecha: Date;
    tipoSalida: string;
    destino: string;
    codigoSalida?: string | null;
    centro: { nombre: string };
    bodega: { nombre: string };
    bodegaDestino?: { nombre: string } | null;
    usuario: {
        nombre: string;
        apPaterno: string | null;
        email: string;
    };
    detalles: Array<{
        id: string;
        cantidad: number;
        lote: string;
        fechaCaducidad: Date;
        producto: {
            descripcion: string;
        };
    }>;
}

export function generarComprobanteSalidaPDF(orden: OrdenSalidaPDFData): Promise<Buffer> {
    return new Promise((resolve, reject) => {
        try {
            const doc = new PDFDocument({
                size: "LETTER",
                margin: 40,
                info: {
                    Title: `Comprobante de Salida - ${orden.id}`,
                    Author: "Corporación Municipal de Valparaíso"
                }
            });

            const chunks: Buffer[] = [];
            doc.on("data", (chunk: Buffer) => chunks.push(chunk));
            doc.on("end", () => resolve(Buffer.concat(chunks)));
            doc.on("error", (err: Error) => reject(err));

            const primaryColor = "#0f172a";
            const secondaryColor = "#475569";
            const borderColor = "#cbd5e1";

            // Encabezado CMV
            doc.fontSize(13).font("Helvetica-Bold").fillColor(primaryColor)
                .text("CORPORACIÓN MUNICIPAL DE VALPARAÍSO", 40, 40);
            doc.fontSize(9).font("Helvetica").fillColor(secondaryColor)
                .text("Área de Salud · Sistema de Inventario y Farmacia APS", 40, 56);

            // Folio e Identificación de Documento
            doc.rect(380, 36, 192, 48).strokeColor(borderColor).stroke();
            doc.fontSize(10).font("Helvetica-Bold").fillColor(primaryColor)
                .text("COMPROBANTE DE SALIDA", 385, 42, { width: 182, align: "center" });
            doc.fontSize(9).font("Helvetica").fillColor(secondaryColor)
                .text(`N°: ${orden.id}`, 385, 56, { width: 182, align: "center" });
            doc.fontSize(8).fillColor(secondaryColor)
                .text(`Fecha: ${formatDate(orden.fecha)}`, 385, 69, { width: 182, align: "center" });

            doc.moveTo(40, 96).lineTo(572, 96).strokeColor(borderColor).stroke();

            // Bloque de Datos de la Operación
            let currentY = 108;
            doc.fontSize(9).font("Helvetica-Bold").fillColor(primaryColor)
                .text("DATOS DE LA SALIDA", 40, currentY);

            currentY += 14;
            doc.rect(40, currentY, 532, 54).strokeColor(borderColor).stroke();

            const leftX = 50;
            const midX = 310;
            const row1Y = currentY + 8;
            const row2Y = currentY + 22;
            const row3Y = currentY + 36;

            doc.fontSize(8.5).font("Helvetica-Bold").fillColor(secondaryColor).text("Centro Emisor:", leftX, row1Y);
            doc.font("Helvetica").fillColor(primaryColor).text(orden.centro.nombre, leftX + 80, row1Y);

            doc.font("Helvetica-Bold").fillColor(secondaryColor).text("Bodega Origen:", leftX, row2Y);
            doc.font("Helvetica").fillColor(primaryColor).text(orden.bodega.nombre, leftX + 80, row2Y);

            doc.font("Helvetica-Bold").fillColor(secondaryColor).text("Funcionario:", leftX, row3Y);
            doc.font("Helvetica").fillColor(primaryColor).text(
                `${orden.usuario.nombre} ${orden.usuario.apPaterno || ""} (${orden.usuario.email})`,
                leftX + 80,
                row3Y
            );

            doc.font("Helvetica-Bold").fillColor(secondaryColor).text("Tipo Salida:", midX, row1Y);
            doc.font("Helvetica").fillColor(primaryColor).text(orden.tipoSalida, midX + 75, row1Y);

            doc.font("Helvetica-Bold").fillColor(secondaryColor).text("Destino:", midX, row2Y);
            doc.font("Helvetica").fillColor(primaryColor).text(
                orden.bodegaDestino ? `${orden.bodegaDestino.nombre} (${orden.destino})` : orden.destino,
                midX + 75,
                row2Y
            );

            if (orden.codigoSalida) {
                doc.font("Helvetica-Bold").fillColor(secondaryColor).text("Código Envío:", midX, row3Y);
                doc.font("Helvetica").fillColor(primaryColor).text(orden.codigoSalida, midX + 75, row3Y);
            }

            // Tabla de Insumos
            currentY += 68;
            doc.fontSize(9).font("Helvetica-Bold").fillColor(primaryColor)
                .text("DETALLE DE INSUMOS Y MEDICAMENTOS ENTREGADOS", 40, currentY);

            currentY += 14;
            const tableX = 40;
            const colItem = 40;
            const colDesc = 65;
            const colLote = 330;
            const colVenc = 430;
            const colCant = 510;

            // Encabezado de tabla
            doc.rect(tableX, currentY, 532, 18).fillColor("#f1f5f9").fill();
            doc.fontSize(8).font("Helvetica-Bold").fillColor(primaryColor);
            doc.text("#", colItem + 5, currentY + 5);
            doc.text("Producto / Descripción", colDesc, currentY + 5);
            doc.text("Lote", colLote, currentY + 5);
            doc.text("F. Vencimiento", colVenc, currentY + 5);
            doc.text("Cantidad", colCant, currentY + 5, { width: 55, align: "right" });

            currentY += 18;
            doc.font("Helvetica").fontSize(8).fillColor(primaryColor);

            let totalUnidades = 0;
            orden.detalles.forEach((det, idx) => {
                const rowHeight = 18;
                if (idx % 2 === 1) {
                    doc.rect(tableX, currentY, 532, rowHeight).fillColor("#f8fafc").fill();
                }

                doc.fillColor(primaryColor);
                doc.text(String(idx + 1), colItem + 5, currentY + 5);
                doc.text(det.producto.descripcion, colDesc, currentY + 5, { width: 260, height: 12, ellipsis: true });
                doc.text(det.lote, colLote, currentY + 5);
                doc.text(formatDate(det.fechaCaducidad), colVenc, currentY + 5);
                doc.text(formatNumber(det.cantidad), colCant, currentY + 5, { width: 55, align: "right" });

                totalUnidades += det.cantidad;
                currentY += rowHeight;
            });

            // Fila de totales
            doc.rect(tableX, currentY, 532, 18).strokeColor(borderColor).stroke();
            doc.font("Helvetica-Bold").fontSize(8).fillColor(primaryColor);
            doc.text("TOTAL GENERAL:", 330, currentY + 5, { width: 90, align: "right" });
            doc.text(formatNumber(totalUnidades), colCant, currentY + 5, { width: 55, align: "right" });

            // Recuadros de Firma Física
            currentY = Math.max(currentY + 50, 600);

            // Firma Emisor
            doc.rect(60, currentY, 210, 80).strokeColor(borderColor).stroke();
            doc.moveTo(80, currentY + 55).lineTo(250, currentY + 55).strokeColor(borderColor).stroke();
            doc.fontSize(8).font("Helvetica-Bold").fillColor(secondaryColor)
                .text("ENTREGADO POR (BODEGA/FARMACIA)", 60, currentY + 60, { width: 210, align: "center" });
            doc.fontSize(7.5).font("Helvetica").fillColor(secondaryColor)
                .text("Firma y Timbre Responsable Emisión", 60, currentY + 70, { width: 210, align: "center" });

            // Firma Receptor
            doc.rect(342, currentY, 210, 80).strokeColor(borderColor).stroke();
            doc.moveTo(362, currentY + 55).lineTo(532, currentY + 55).strokeColor(borderColor).stroke();
            doc.fontSize(8).font("Helvetica-Bold").fillColor(secondaryColor)
                .text("RECIBIDO CONFORME (RECEPTOR FÍSICO)", 342, currentY + 60, { width: 210, align: "center" });
            doc.fontSize(7.5).font("Helvetica").fillColor(secondaryColor)
                .text("Nombre, RUT, Firma y Fecha/Hora", 342, currentY + 70, { width: 210, align: "center" });

            // Pie de página legal
            doc.fontSize(7).fillColor("#94a3b8")
                .text(
                    "Documento generado por el Sistema de Inventario CMV · Válido como respaldo físico interno de entrega y recepción de insumos.",
                    40,
                    740,
                    { width: 532, align: "center" }
                );

            doc.end();
        } catch (error) {
            reject(error);
        }
    });
}
