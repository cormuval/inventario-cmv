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
                bufferPages: true,
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

            const LIMITE_INFERIOR = doc.page.height - doc.page.margins.bottom;
            const ESPACIO_PIE = 35;
            const ALTURA_FIRMAS = 80;

            const tableX = 40;
            const colItem = 40;
            const colDesc = 65;
            const colLote = 330;
            const colVenc = 430;
            const colCant = 510;

            function dibujarEncabezadoTabla(y: number): number {
                doc.rect(tableX, y, 532, 18).fillColor("#f1f5f9").fill();
                doc.fontSize(8).font("Helvetica-Bold").fillColor(primaryColor);
                doc.text("#", colItem + 5, y + 5);
                doc.text("Producto / Descripción", colDesc, y + 5);
                doc.text("Lote", colLote, y + 5);
                doc.text("F. Vencimiento", colVenc, y + 5);
                doc.text("Cantidad", colCant, y + 5, { width: 55, align: "right" });
                return y + 18;
            }

            // Encabezado CMV (Página 1)
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
            currentY = dibujarEncabezadoTabla(currentY);

            doc.font("Helvetica").fontSize(8).fillColor(primaryColor);

            let totalUnidades = 0;
            const rowHeight = 18;

            for (let idx = 0; idx < orden.detalles.length; idx++) {
                const det = orden.detalles[idx];

                if (currentY + rowHeight > LIMITE_INFERIOR - ESPACIO_PIE) {
                    doc.addPage();
                    currentY = doc.page.margins.top;
                    currentY = dibujarEncabezadoTabla(currentY);
                }

                if (idx % 2 === 1) {
                    doc.rect(tableX, currentY, 532, rowHeight).fillColor("#f8fafc").fill();
                }

                doc.font("Helvetica").fontSize(8).fillColor(primaryColor);
                doc.text(String(idx + 1), colItem + 5, currentY + 5);
                doc.text(det.producto.descripcion, colDesc, currentY + 5, { width: 260, height: 12, ellipsis: true });
                doc.text(det.lote, colLote, currentY + 5);
                doc.text(formatDate(det.fechaCaducidad), colVenc, currentY + 5);
                doc.text(formatNumber(det.cantidad), colCant, currentY + 5, { width: 55, align: "right" });

                totalUnidades += det.cantidad;
                currentY += rowHeight;
            }

            // Fila de totales
            if (currentY + 18 > LIMITE_INFERIOR - ESPACIO_PIE) {
                doc.addPage();
                currentY = doc.page.margins.top;
                currentY = dibujarEncabezadoTabla(currentY);
            }

            doc.rect(tableX, currentY, 532, 18).strokeColor(borderColor).stroke();
            doc.font("Helvetica-Bold").fontSize(8).fillColor(primaryColor);
            doc.text("TOTAL GENERAL:", 330, currentY + 5, { width: 90, align: "right" });
            doc.text(formatNumber(totalUnidades), colCant, currentY + 5, { width: 55, align: "right" });
            currentY += 18;

            // Recuadros de Firma Física (deben quedar juntos en la última página)
            const targetFirmasY = Math.max(currentY + 30, 590);
            if (targetFirmasY + ALTURA_FIRMAS > LIMITE_INFERIOR - ESPACIO_PIE) {
                doc.addPage();
                currentY = doc.page.margins.top + 30;
            } else {
                currentY = targetFirmasY;
            }

            // Firma Emisor
            doc.rect(60, currentY, 210, ALTURA_FIRMAS).strokeColor(borderColor).stroke();
            doc.moveTo(80, currentY + 55).lineTo(250, currentY + 55).strokeColor(borderColor).stroke();
            doc.fontSize(8).font("Helvetica-Bold").fillColor(secondaryColor)
                .text("ENTREGADO POR (BODEGA/FARMACIA)", 60, currentY + 60, { width: 210, align: "center" });
            doc.fontSize(7.5).font("Helvetica").fillColor(secondaryColor)
                .text("Firma y Timbre Responsable Emisión", 60, currentY + 70, { width: 210, align: "center" });

            // Firma Receptor
            doc.rect(342, currentY, 210, ALTURA_FIRMAS).strokeColor(borderColor).stroke();
            doc.moveTo(362, currentY + 55).lineTo(532, currentY + 55).strokeColor(borderColor).stroke();
            doc.fontSize(8).font("Helvetica-Bold").fillColor(secondaryColor)
                .text("RECIBIDO CONFORME (RECEPTOR FÍSICO)", 342, currentY + 60, { width: 210, align: "center" });
            doc.fontSize(7.5).font("Helvetica").fillColor(secondaryColor)
                .text("Nombre, RUT, Firma y Fecha/Hora", 342, currentY + 70, { width: 210, align: "center" });

            // Pie de página legal y paginación en todas las páginas bufferizadas
            const range = doc.bufferedPageRange();
            for (let i = range.start; i < range.start + range.count; i++) {
                doc.switchToPage(i);
                const oldBottomMargin = doc.page.margins.bottom;
                doc.page.margins.bottom = 0;

                doc.fontSize(7).font("Helvetica").fillColor("#94a3b8").text(
                    "Documento generado por el Sistema de Inventario CMV · Válido como respaldo físico interno de entrega y recepción de insumos.",
                    40,
                    735,
                    { width: 532, align: "center", lineBreak: false }
                );

                const pageNum = i + 1;
                const totalPages = range.count;
                doc.fontSize(7).font("Helvetica").fillColor("#94a3b8").text(
                    `Página ${pageNum} de ${totalPages}`,
                    40,
                    746,
                    { width: 532, align: "center", lineBreak: false }
                );

                doc.page.margins.bottom = oldBottomMargin;
            }

            doc.end();
        } catch (error) {
            reject(error);
        }
    });
}
