import PDFDocument from "pdfkit";
import fs from "fs";
import path from "path";

// utils
import { formatDate, formatDateTime, formatNumber } from "@/shared/utils/format";

export interface OrdenSalidaPDFData {
    id: string;
    fecha: Date;
    tipoSalida: string;
    destino: string;
    codigoSalida?: string | null;
    codigoRecepcion?: string | null;
    fechaGeneracion?: Date | string;
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
        unidad?: string;
        producto: {
            id?: number;
            descripcion: string;
            linea?: string;
            unidad?: string;
        };
    }>;
}

export interface OpcionesGeneracionPDF {
    fechaGeneracion?: Date | string;
    compress?: boolean;
}

/**
 * Renderiza el logo institucional en el encabezado.
 * Si existe un archivo de logo en disco (public/logo-cmv.png o public/logo.png), lo incrusta.
 * En caso contrario, dibuja un emblema institucional vectorial nativo de CMV (Área de Salud)
 * para garantizar fidelidad gráfica tanto en desarrollo como en contenedores de producción.
 */
function dibujarLogoInstitucional(doc: PDFKit.PDFDocument, x: number, y: number): void {
    const posiblesRutas = [
        path.join(process.cwd(), "public", "logo-cmv.png"),
        path.join(process.cwd(), "public", "logo.png"),
        path.join(process.cwd(), "public", "images", "logo.png")
    ];

    for (const ruta of posiblesRutas) {
        if (fs.existsSync(ruta)) {
            try {
                doc.image(ruta, x, y, { width: 44, height: 44, fit: [44, 44] });
                return;
            } catch {
                // Fallback a dibujo vectorial si la imagen no se puede decodificar
            }
        }
    }

    // Emblema institucional vectorial CMV (Área de Salud)
    doc.save();
    // Escudo base en verde azulado institucional
    doc.roundedRect(x, y, 44, 44, 6).fillColor("#0f766e").fill();
    // Cruz de salud blanca
    doc.rect(x + 18, y + 8, 8, 22).fillColor("#ffffff").fill();
    doc.rect(x + 11, y + 15, 22, 8).fillColor("#ffffff").fill();
    // Franja inferior con siglas CMV
    doc.rect(x, y + 33, 44, 11).fillColor("#094f49").fill();
    doc.fontSize(6.5).font("Helvetica-Bold").fillColor("#ffffff")
        .text("CMV", x, y + 35, { width: 44, align: "center", lineBreak: false });
    doc.restore();
}

export function generarComprobanteSalidaPDF(
    orden: OrdenSalidaPDFData,
    opciones?: OpcionesGeneracionPDF
): Promise<Buffer> {
    return new Promise((resolve, reject) => {
        try {
            const fechaGeneracion = opciones?.fechaGeneracion ?? orden.fechaGeneracion ?? new Date();

            const doc = new PDFDocument({
                size: "LETTER",
                margin: 40,
                bufferPages: true,
                compress: opciones?.compress ?? false,
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
            const colItem = 40;     // # (ancho 22)
            const colCod = 62;      // Código producto (ancho 40)
            const colDesc = 104;    // Descripción (ancho 206)
            const colLote = 312;    // Lote (ancho 76)
            const colVenc = 390;    // F. Vencimiento (ancho 60)
            const colUnidad = 452;  // Unidad (ancho 46)
            const colCant = 500;    // Cantidad (ancho 72)

            function dibujarEncabezadoTabla(y: number): number {
                doc.rect(tableX, y, 532, 18).fillColor("#f1f5f9").fill();
                doc.fontSize(8).font("Helvetica-Bold").fillColor(primaryColor);
                doc.text("#", colItem + 4, y + 5);
                doc.text("Código", colCod, y + 5);
                doc.text("Producto / Descripción", colDesc, y + 5);
                doc.text("Lote", colLote, y + 5);
                doc.text("F. Venc.", colVenc, y + 5);
                doc.text("Unidad", colUnidad, y + 5, { width: 44, align: "center" });
                doc.text("Cantidad", colCant, y + 5, { width: 68, align: "right" });
                return y + 18;
            }

            // 1. Encabezado institucional con Logo (Página 1)
            dibujarLogoInstitucional(doc, 40, 36);

            doc.fontSize(11.5).font("Helvetica-Bold").fillColor(primaryColor)
                .text("CORPORACIÓN MUNICIPAL DE VALPARAÍSO", 92, 40);
            doc.fontSize(8.5).font("Helvetica").fillColor(secondaryColor)
                .text("Área de Salud · Sistema de Control y Trazabilidad de Inventario APS", 92, 54);
            doc.fontSize(7.5).font("Helvetica-Oblique").fillColor("#64748b")
                .text("Dirección del Área de Salud · Respaldo Oficial de Despacho", 92, 67);

            // Folio, fecha de salida y fecha/hora visible de generación
            const boxFolioY = 34;
            const boxFolioH = 52;
            doc.rect(380, boxFolioY, 192, boxFolioH).strokeColor(borderColor).stroke();
            doc.fontSize(9.5).font("Helvetica-Bold").fillColor(primaryColor)
                .text("COMPROBANTE DE SALIDA", 385, boxFolioY + 5, { width: 182, align: "center" });
            doc.fontSize(8.5).font("Helvetica-Bold").fillColor(secondaryColor)
                .text(`N°: ${orden.id}`, 385, boxFolioY + 18, { width: 182, align: "center" });
            doc.fontSize(7.5).font("Helvetica").fillColor(secondaryColor)
                .text(`Fecha salida: ${formatDate(orden.fecha)}`, 385, boxFolioY + 29, { width: 182, align: "center" });
            doc.fontSize(7).font("Helvetica").fillColor("#64748b")
                .text(`Generado: ${formatDateTime(fechaGeneracion)}`, 385, boxFolioY + 39, { width: 182, align: "center" });

            doc.moveTo(40, 94).lineTo(572, 94).strokeColor(borderColor).stroke();

            // 2. Bloque de Datos de la Operación (con códigos complementarios de salida y recepción)
            let currentY = 104;
            doc.fontSize(9).font("Helvetica-Bold").fillColor(primaryColor)
                .text("DATOS DE LA SALIDA", 40, currentY);

            currentY += 14;

            const tieneAmbosCodigos = Boolean(orden.codigoSalida && orden.codigoRecepcion);
            const boxDatosHeight = tieneAmbosCodigos ? 68 : 54;

            doc.rect(40, currentY, 532, boxDatosHeight).strokeColor(borderColor).stroke();

            const leftX = 50;
            const midX = 310;
            const row1Y = currentY + 8;
            const row2Y = currentY + 22;
            const row3Y = currentY + 36;
            const row4Y = currentY + 50;

            doc.fontSize(8.5).font("Helvetica-Bold").fillColor(secondaryColor).text("Centro Emisor:", leftX, row1Y);
            doc.font("Helvetica").fillColor(primaryColor).text(orden.centro.nombre, leftX + 80, row1Y);

            doc.font("Helvetica-Bold").fillColor(secondaryColor).text("Bodega Origen:", leftX, row2Y);
            doc.font("Helvetica").fillColor(primaryColor).text(orden.bodega.nombre, leftX + 80, row2Y);

            doc.font("Helvetica-Bold").fillColor(secondaryColor).text("Funcionario:", leftX, row3Y);
            doc.font("Helvetica").fillColor(primaryColor).text(
                `${orden.usuario.nombre} ${orden.usuario.apPaterno || ""} (${orden.usuario.email})`,
                leftX + 80,
                row3Y,
                { width: 175, height: 12, ellipsis: true }
            );

            doc.font("Helvetica-Bold").fillColor(secondaryColor).text("Tipo Salida:", midX, row1Y);
            doc.font("Helvetica").fillColor(primaryColor).text(orden.tipoSalida, midX + 80, row1Y);

            doc.font("Helvetica-Bold").fillColor(secondaryColor).text("Destino:", midX, row2Y);
            doc.font("Helvetica").fillColor(primaryColor).text(
                orden.bodegaDestino ? `${orden.bodegaDestino.nombre} (${orden.destino})` : orden.destino,
                midX + 80,
                row2Y,
                { width: 175, height: 12, ellipsis: true }
            );

            // Código de salida y código de recepción mostrados con etiquetas distintas
            if (orden.codigoSalida && orden.codigoRecepcion) {
                doc.font("Helvetica-Bold").fillColor(secondaryColor).text("Código Salida:", midX, row3Y);
                doc.font("Helvetica").fillColor(primaryColor).text(orden.codigoSalida, midX + 80, row3Y);

                doc.font("Helvetica-Bold").fillColor(secondaryColor).text("Cód. Recepción:", midX, row4Y);
                doc.font("Helvetica-Bold").fillColor("#0f766e").text(orden.codigoRecepcion, midX + 80, row4Y);
            } else if (orden.codigoSalida) {
                doc.font("Helvetica-Bold").fillColor(secondaryColor).text("Código Salida:", midX, row3Y);
                doc.font("Helvetica").fillColor(primaryColor).text(orden.codigoSalida, midX + 80, row3Y);
            } else if (orden.codigoRecepcion) {
                doc.font("Helvetica-Bold").fillColor(secondaryColor).text("Cód. Recepción:", midX, row3Y);
                doc.font("Helvetica-Bold").fillColor("#0f766e").text(orden.codigoRecepcion, midX + 80, row3Y);
            }

            // 3. Tabla de Insumos con Código y Unidad
            currentY += boxDatosHeight + 14;
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

                const codProd = det.producto.id != null ? String(det.producto.id) : "-";
                const unidad = det.unidad ?? det.producto.unidad ?? "un.";

                doc.font("Helvetica").fontSize(8).fillColor(primaryColor);
                doc.text(String(idx + 1), colItem + 4, currentY + 5);
                doc.text(codProd, colCod, currentY + 5, { width: 38, ellipsis: true });
                doc.text(det.producto.descripcion, colDesc, currentY + 5, { width: 204, height: 12, ellipsis: true });
                doc.text(det.lote, colLote, currentY + 5, { width: 74, ellipsis: true });
                doc.text(formatDate(det.fechaCaducidad), colVenc, currentY + 5);
                doc.text(unidad, colUnidad, currentY + 5, { width: 44, align: "center" });
                doc.text(formatNumber(det.cantidad), colCant, currentY + 5, { width: 68, align: "right" });

                totalUnidades += det.cantidad;
                currentY += rowHeight;
            }

            // 4. Fila de Totales (Productos Únicos y Total Unidades)
            if (currentY + 18 > LIMITE_INFERIOR - ESPACIO_PIE) {
                doc.addPage();
                currentY = doc.page.margins.top;
                currentY = dibujarEncabezadoTabla(currentY);
            }

            const totalLineas = orden.detalles.length;
            const productosUnicos = new Set(
                orden.detalles.map((d) => (d.producto.id != null ? d.producto.id : d.producto.descripcion))
            ).size;

            doc.rect(tableX, currentY, 532, 18).strokeColor(borderColor).stroke();
            doc.font("Helvetica-Bold").fontSize(7.5).fillColor(secondaryColor);
            doc.text(
                `Total líneas: ${totalLineas}  ·  Productos únicos: ${productosUnicos}`,
                tableX + 8,
                currentY + 5
            );

            doc.font("Helvetica-Bold").fontSize(8).fillColor(primaryColor);
            doc.text("TOTAL GENERAL:", colUnidad - 60, currentY + 5, { width: 100, align: "right" });
            doc.text(formatNumber(totalUnidades), colCant, currentY + 5, { width: 68, align: "right" });
            currentY += 18;

            // 5. Recuadros de Firma Física (indivisibles en la última página)
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

            // 6. Pie de página legal y paginación en todas las páginas bufferizadas
            const range = doc.bufferedPageRange();
            const fechaGenStr = formatDateTime(fechaGeneracion);
            for (let i = range.start; i < range.start + range.count; i++) {
                doc.switchToPage(i);
                const oldBottomMargin = doc.page.margins.bottom;
                doc.page.margins.bottom = 0;

                doc.fontSize(7).font("Helvetica").fillColor("#94a3b8").text(
                    `Documento generado el ${fechaGenStr} · Sistema de Inventario APS CMV · Respaldo físico oficial de entrega y recepción.`,
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
