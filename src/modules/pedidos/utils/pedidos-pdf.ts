import PDFDocument from "pdfkit";
import { formatDate } from "@/shared/utils/format";

export interface PedidoPDFData {
    numero: string;
    tipo: string;
    estado: string;
    periodo?: string | null;
    fechaSolicitud: Date;
    observaciones?: string | null;
    centro: { nombre: string };
    bodega?: { nombre: string } | null;
    usuarioSolicitante: { nombre: string; apPaterno?: string | null; email: string };
    usuarioRevision?: { nombre: string; apPaterno?: string | null; email: string } | null;
    fechaRevision?: Date | null;
    observacionesRevision?: string | null;
    detalles: Array<{
        productoId: number;
        producto: { descripcion: string; linea: string };
        cantidadSolicitada: number;
        cantidadAprobada?: number | null;
        observacionAjuste?: string | null;
        stockActualMomento?: number | null;
        stockMinimoMomento?: number | null;
    }>;
}

export function generarPedidoPDF(pedido: PedidoPDFData): Promise<Buffer> {
    return new Promise((resolve, reject) => {
        try {
            const doc = new PDFDocument({
                size: "LETTER",
                margin: 40,
                bufferPages: true,
                info: {
                    Title: `Pedido de Aseo - ${pedido.numero}`,
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
            const esRevisado = pedido.estado === "REVISADO";

            // Encabezado
            doc.fillColor(primaryColor).fontSize(14).text("CORPORACIÓN MUNICIPAL DE VALPARAÍSO", { align: "center" });
            doc.fontSize(10).fillColor(secondaryColor).text("ÁREA DE SALUD — DEPARTAMENTO DE ADQUISICIONES", { align: "center" });
            doc.moveDown(0.5);
            doc.fontSize(12).fillColor(primaryColor).text(`COMPROBANTE DE PEDIDO DE ASEO — ${pedido.numero}`, { align: "center", underline: true });
            doc.moveDown(1);

            // Metadatos
            const startY = doc.y;
            doc.fontSize(9).fillColor(primaryColor);
            
            // Columna Izquierda
            doc.text(`Centro Solicitante: ${pedido.centro.nombre}`, 40, startY);
            doc.text(`Bodega Destino: ${pedido.bodega?.nombre ?? "Todas las bodegas"}`, 40, startY + 14);
            doc.text(`Tipo de Pedido: ${pedido.tipo} ${pedido.periodo ? `(${pedido.periodo})` : ""}`, 40, startY + 28);
            doc.text(`Fecha Solicitud: ${formatDate(pedido.fechaSolicitud)}`, 40, startY + 42);

            // Columna Derecha
            const solicitanteNombre = `${pedido.usuarioSolicitante.nombre} ${pedido.usuarioSolicitante.apPaterno ?? ""}`.trim();
            doc.text(`Estado: ${pedido.estado}`, 340, startY);
            doc.text(`Solicitado por: ${solicitanteNombre}`, 340, startY + 14);

            if (esRevisado && pedido.usuarioRevision) {
                const revisorNombre = `${pedido.usuarioRevision.nombre} ${pedido.usuarioRevision.apPaterno ?? ""}`.trim();
                doc.text(`Revisado por: ${revisorNombre}`, 340, startY + 28);
                if (pedido.fechaRevision) {
                    doc.text(`Fecha Revisión: ${formatDate(pedido.fechaRevision)}`, 340, startY + 42);
                }
            }

            doc.y = startY + 65;

            if (pedido.observaciones) {
                doc.fontSize(8).fillColor(secondaryColor).text(`Obs. Solicitante: ${pedido.observaciones}`, 40, doc.y);
                doc.moveDown(0.5);
            }
            if (esRevisado && pedido.observacionesRevision) {
                doc.fontSize(8).fillColor(secondaryColor).text(`Obs. Adquisiciones: ${pedido.observacionesRevision}`, 40, doc.y);
                doc.moveDown(0.5);
            }

            // Tabla de detalles
            const tableY = doc.y + 10;
            doc.rect(40, tableY, 532, 20).fill("#f1f5f9");
            doc.fillColor(primaryColor).fontSize(8);

            doc.text("CÓD.", 45, tableY + 6);
            doc.text("DESCRIPCIÓN", 90, tableY + 6);
            doc.text("STOCK", 310, tableY + 6);
            doc.text("SOLICITADO", 370, tableY + 6);
            if (esRevisado) {
                doc.text("APROBADO", 440, tableY + 6);
                doc.text("OBSERVACIÓN", 500, tableY + 6);
            }

            let currentY = tableY + 22;
            let totalSolicitado = 0;
            let totalAprobado = 0;

            for (const d of pedido.detalles) {
                if (currentY > doc.page.height - 120) {
                    doc.addPage();
                    currentY = 40;
                }

                totalSolicitado += d.cantidadSolicitada;
                const cantAprobada = d.cantidadAprobada ?? d.cantidadSolicitada;
                totalAprobado += cantAprobada;

                doc.fontSize(8).fillColor(primaryColor);
                doc.text(String(d.productoId), 45, currentY);
                doc.text(d.producto.descripcion.substring(0, 40), 90, currentY);
                doc.text(String(d.stockActualMomento ?? "—"), 310, currentY);
                doc.text(String(d.cantidadSolicitada), 370, currentY);

                if (esRevisado) {
                    doc.text(String(cantAprobada), 440, currentY);
                    if (d.observacionAjuste) {
                        doc.fillColor(secondaryColor).text(d.observacionAjuste.substring(0, 20), 500, currentY);
                    }
                }

                doc.moveTo(40, currentY + 12).lineTo(572, currentY + 12).strokeColor(borderColor).stroke();
                currentY += 16;
            }

            // Totales
            doc.font("Helvetica-Bold").text("TOTAL:", 90, currentY + 4);
            doc.text(String(totalSolicitado), 370, currentY + 4);
            if (esRevisado) {
                doc.text(String(totalAprobado), 440, currentY + 4);
            }

            // Firmas al pie
            const footerY = doc.page.height - 80;
            doc.moveTo(60, footerY).lineTo(220, footerY).strokeColor(primaryColor).stroke();
            doc.font("Helvetica").fontSize(8).text("Firma y Timbre Solicitante", 60, footerY + 5, { width: 160, align: "center" });

            doc.moveTo(370, footerY).lineTo(530, footerY).strokeColor(primaryColor).stroke();
            doc.text("Firma y Timbre Adquisiciones", 370, footerY + 5, { width: 160, align: "center" });

            doc.end();
        } catch (error) {
            reject(error);
        }
    });
}

