import ExcelJS from "exceljs";

// utils
import { fechaHoyChile } from "@/shared/utils/filtros-registros";

export const MIME_XLSX = "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet";

export interface PedidoExcelData {
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

export async function construirExcelPedido(pedido: PedidoExcelData): Promise<Buffer> {
    const libro = new ExcelJS.Workbook();
    const hoja = libro.addWorksheet(`Pedido ${pedido.numero}`);
    const solicitante = `${pedido.usuarioSolicitante.nombre} ${pedido.usuarioSolicitante.apPaterno ?? ""}`.trim();

    hoja.mergeCells("A1:D1");
    hoja.getCell("A1").value = "CORPORACIÓN MUNICIPAL DE VALPARAÍSO — ÁREA DE SALUD";
    hoja.getCell("A1").font = { bold: true, size: 14 };
    hoja.mergeCells("A2:D2");
    hoja.getCell("A2").value = `PEDIDO DE EXISTENCIAS DE ASEO ${pedido.numero} (${pedido.tipo})`;
    hoja.getCell("A2").font = { bold: true, size: 12 };

    hoja.addRow([]);
    hoja.addRow(["Centro:", pedido.centro.nombre, "Estado:", pedido.estado]);
    hoja.addRow(["Bodega:", pedido.bodega?.nombre ?? "Todas las bodegas del centro", "Período:", pedido.periodo || "Suplementario"]);
    hoja.addRow(["Fecha:", fechaHoyChile(pedido.fechaFinalizacion ?? pedido.fechaSolicitud), "Solicitante:", solicitante]);
    if (pedido.observaciones) {
        hoja.addRow(["Observaciones:", pedido.observaciones]);
    }
    if (pedido.motivoAnulacion) {
        hoja.addRow(["Motivo de anulación:", pedido.motivoAnulacion]);
    }
    hoja.addRow([]);

    const encabezado = hoja.addRow(["Código", "Insumo de aseo", "Stock al pedir", "Cantidad solicitada"]);
    encabezado.font = { bold: true };
    encabezado.fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FFE2E8F0" } };

    let totalSolicitado = 0;
    for (const d of pedido.detalles) {
        totalSolicitado += d.cantidadSolicitada;
        hoja.addRow([d.productoId, d.producto.descripcion, d.stockActualMomento ?? "—", d.cantidadSolicitada]);
    }
    hoja.addRow(["TOTAL", "", "", totalSolicitado]).font = { bold: true };

    [12, 45, 16, 20].forEach((ancho, indice) => {
        hoja.getColumn(indice + 1).width = ancho;
    });

    return Buffer.from(await libro.xlsx.writeBuffer());
}
