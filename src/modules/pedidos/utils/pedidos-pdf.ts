import PDFDocument from "pdfkit";

// utils
import { fechaHoyChile } from "@/shared/utils/filtros-registros";
import { formatNumber } from "@/shared/utils/format";

export interface PedidoPDFData {
    numero: string;
    tipo: string;
    estado: string;
    periodo?: string | null;
    fechaSolicitud: Date;
    fechaFinalizacion?: Date | null;
    observaciones?: string | null;
    motivoAnulacion?: string | null;
    centro: { nombre: string };
    bodega?: { nombre: string } | null;
    usuarioSolicitante: { nombre: string; apPaterno?: string | null; email: string };
    detalles: Array<{
        productoId: number;
        producto: { descripcion: string };
        cantidadSolicitada: number;
        stockActualMomento?: number | null;
    }>;
}

const COLOR_PRIMARIO = "#0f172a";
const COLOR_SECUNDARIO = "#475569";
const COLOR_BORDE = "#cbd5e1";
const ALTO_BLOQUE_FIRMAS = 90;

function fechaDdMmAaaa(fecha: Date): string {
    const [anio, mes, dia] = fechaHoyChile(fecha).split("-");
    return `${dia}-${mes}-${anio}`;
}

export function generarPedidoPDF(pedido: PedidoPDFData): Promise<Buffer> {
    return new Promise((resolve, reject) => {
        try {
            const doc = new PDFDocument({
                size: "LETTER",
                margin: 40,
                info: { Title: `Pedido de aseo ${pedido.numero}`, Author: "Corporación Municipal de Valparaíso" }
            });

            const chunks: Buffer[] = [];
            doc.on("data", (chunk: Buffer) => chunks.push(chunk));
            doc.on("end", () => resolve(Buffer.concat(chunks)));
            doc.on("error", (err: Error) => reject(err));

            const limiteInferior = doc.page.height - 50;
            const solicitante = `${pedido.usuarioSolicitante.nombre} ${pedido.usuarioSolicitante.apPaterno ?? ""}`.trim();

            doc.font("Helvetica-Bold").fillColor(COLOR_PRIMARIO).fontSize(14).text("CORPORACIÓN MUNICIPAL DE VALPARAÍSO", { align: "center" });
            doc.font("Helvetica").fontSize(10).fillColor(COLOR_SECUNDARIO).text("ÁREA DE SALUD", { align: "center" });
            doc.moveDown(0.5);
            doc.font("Helvetica-Bold").fontSize(12).fillColor(COLOR_PRIMARIO).text(`PEDIDO DE EXISTENCIAS DE ASEO ${pedido.numero}`, {
                align: "center"
            });
            if (pedido.estado === "ANULADO") {
                doc.fontSize(11).fillColor("#be123c").text("PEDIDO ANULADO", { align: "center" });
            }
            doc.moveDown(1);

            const inicioY = doc.y;
            doc.font("Helvetica").fontSize(9).fillColor(COLOR_PRIMARIO);
            doc.text(`Centro: ${pedido.centro.nombre}`, 40, inicioY);
            doc.text(`Bodega: ${pedido.bodega?.nombre ?? "Todas las bodegas del centro"}`, 40, inicioY + 14);
            doc.text(`Tipo: ${pedido.tipo}${pedido.periodo ? ` (${pedido.periodo})` : ""}`, 40, inicioY + 28);
            doc.text(`Fecha: ${fechaDdMmAaaa(pedido.fechaFinalizacion ?? pedido.fechaSolicitud)}`, 340, inicioY);
            doc.text(`Estado: ${pedido.estado}`, 340, inicioY + 14);
            doc.text(`Solicitante: ${solicitante}`, 340, inicioY + 28, { width: 232 });
            doc.y = inicioY + 50;

            if (pedido.observaciones) {
                doc.fontSize(8).fillColor(COLOR_SECUNDARIO).text(`Observaciones: ${pedido.observaciones}`, 40, doc.y, { width: 532 });
                doc.moveDown(0.5);
            }
            if (pedido.motivoAnulacion) {
                doc.fontSize(8).fillColor("#be123c").text(`Motivo de anulación: ${pedido.motivoAnulacion}`, 40, doc.y, { width: 532 });
                doc.moveDown(0.5);
            }

            const dibujarEncabezadoTabla = (y: number): number => {
                doc.rect(40, y, 532, 20).fill("#f1f5f9");
                doc.font("Helvetica-Bold").fillColor(COLOR_PRIMARIO).fontSize(8);
                doc.text("CÓD.", 45, y + 6);
                doc.text("INSUMO DE ASEO", 95, y + 6);
                doc.text("STOCK AL PEDIR", 400, y + 6, { width: 70, align: "right" });
                doc.text("SOLICITADO", 490, y + 6, { width: 75, align: "right" });
                doc.font("Helvetica");
                return y + 24;
            };

            let y = dibujarEncabezadoTabla(doc.y + 10);
            let totalSolicitado = 0;

            for (const d of pedido.detalles) {
                const altoFila = Math.max(12, doc.heightOfString(d.producto.descripcion, { width: 295 })) + 4;
                if (y + altoFila > limiteInferior) {
                    doc.addPage();
                    y = dibujarEncabezadoTabla(40);
                }
                totalSolicitado += d.cantidadSolicitada;
                doc.fontSize(8).fillColor(COLOR_PRIMARIO);
                doc.text(String(d.productoId), 45, y);
                doc.text(d.producto.descripcion, 95, y, { width: 295 });
                doc.text(d.stockActualMomento === null || d.stockActualMomento === undefined ? "—" : formatNumber(d.stockActualMomento), 400, y, {
                    width: 70,
                    align: "right"
                });
                doc.text(formatNumber(d.cantidadSolicitada), 490, y, { width: 75, align: "right" });
                doc.moveTo(40, y + altoFila - 2).lineTo(572, y + altoFila - 2).strokeColor(COLOR_BORDE).stroke();
                y += altoFila;
            }

            doc.font("Helvetica-Bold").fontSize(8).text(`TOTAL (${pedido.detalles.length} productos)`, 95, y + 4);
            doc.text(formatNumber(totalSolicitado), 490, y + 4, { width: 75, align: "right" });
            y += 24;

            // Las firmas van después de la tabla; si no caben, en una página nueva.
            if (y + ALTO_BLOQUE_FIRMAS > limiteInferior) {
                doc.addPage();
                y = 40;
            }
            const firmaY = y + 50;
            doc.moveTo(60, firmaY).lineTo(250, firmaY).strokeColor(COLOR_PRIMARIO).stroke();
            doc.moveTo(360, firmaY).lineTo(550, firmaY).strokeColor(COLOR_PRIMARIO).stroke();
            doc.font("Helvetica").fontSize(8).fillColor(COLOR_PRIMARIO);
            doc.text("Firma y timbre encargado(a) del centro", 60, firmaY + 5, { width: 190, align: "center" });
            doc.text("Recepción Adquisiciones", 360, firmaY + 5, { width: 190, align: "center" });

            doc.end();
        } catch (error) {
            reject(error);
        }
    });
}
