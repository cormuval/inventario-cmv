import ExcelJS from "exceljs";

export const MIME_XLSX = "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet";

export interface PedidoExcelData {
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

export async function construirExcelPedido(pedido: PedidoExcelData): Promise<Buffer> {
    const libro = new ExcelJS.Workbook();
    const hoja = libro.addWorksheet(`Pedido ${pedido.numero}`);

    const esRevisado = pedido.estado === "REVISADO";

    // Encabezado institucional
    hoja.mergeCells("A1:G1");
    hoja.getCell("A1").value = "CORPORACIÓN MUNICIPAL DE VALPARAÍSO — ÁREA DE SALUD";
    hoja.getCell("A1").font = { bold: true, size: 14 };

    hoja.mergeCells("A2:G2");
    hoja.getCell("A2").value = `PEDIDO DE EXISTENCIAS DE ASEO: ${pedido.numero} (${pedido.tipo})`;
    hoja.getCell("A2").font = { bold: true, size: 12 };

    hoja.addRow([]);
    hoja.addRow(["Centro Solicitante:", pedido.centro.nombre, "", "Estado:", pedido.estado]);
    hoja.addRow(["Bodega Destino:", pedido.bodega?.nombre ?? "Todas / General", "", "Período:", pedido.periodo || "Suplementario"]);
    hoja.addRow(["Fecha Solicitud:", pedido.fechaSolicitud.toISOString().split("T")[0], "", "Solicitante:", `${pedido.usuarioSolicitante.nombre} ${pedido.usuarioSolicitante.apPaterno ?? ""}`.trim()]);
    
    if (esRevisado && pedido.usuarioRevision) {
        hoja.addRow([
            "Fecha Revisión:",
            pedido.fechaRevision ? pedido.fechaRevision.toISOString().split("T")[0] : "",
            "",
            "Revisado por (Adquisiciones):",
            `${pedido.usuarioRevision.nombre} ${pedido.usuarioRevision.apPaterno ?? ""}`.trim()
        ]);
        if (pedido.observacionesRevision) {
            hoja.addRow(["Obs. Adquisiciones:", pedido.observacionesRevision]);
        }
    }
    hoja.addRow([]);

    // Definición de columnas de la tabla
    const headerRowIdx = hoja.lastRow ? hoja.lastRow.number + 1 : 8;

    const columnas = [
        { header: "Código", key: "codigo", width: 10 },
        { header: "Descripción Insumo de Aseo", key: "descripcion", width: 40 },
        { header: "Línea", key: "linea", width: 14 },
        { header: "Stock al Solicitar", key: "stockMomento", width: 18 },
        { header: "Cant. Solicitada", key: "cantSolicitada", width: 18 },
        ...(esRevisado
            ? [
                  { header: "Cant. Aprobada", key: "cantAprobada", width: 18 },
                  { header: "Observación Ajuste", key: "observacionAjuste", width: 35 }
              ]
            : [])
    ];

    hoja.getRow(headerRowIdx).values = columnas.map((c) => c.header);
    hoja.getRow(headerRowIdx).font = { bold: true };
    hoja.getRow(headerRowIdx).fill = {
        type: "pattern",
        pattern: "solid",
        fgColor: { argb: "FFE2E8F0" }
    };

    let totalSolicitado = 0;
    let totalAprobado = 0;

    for (const d of pedido.detalles) {
        totalSolicitado += d.cantidadSolicitada;
        if (d.cantidadAprobada !== null && d.cantidadAprobada !== undefined) {
            totalAprobado += d.cantidadAprobada;
        }

        const filaValores = [
            d.productoId,
            d.producto.descripcion,
            d.producto.linea,
            d.stockActualMomento ?? "—",
            d.cantidadSolicitada,
            ...(esRevisado
                ? [
                      d.cantidadAprobada ?? d.cantidadSolicitada,
                      d.observacionAjuste ?? ""
                  ]
                : [])
        ];
        hoja.addRow(filaValores);
    }

    // Fila de totales
    const filaTotales = [
        "TOTALES",
        "",
        "",
        "",
        totalSolicitado,
        ...(esRevisado ? [totalAprobado, ""] : [])
    ];
    const totalRow = hoja.addRow(filaTotales);
    totalRow.font = { bold: true };

    // Auto fit widths
    columnas.forEach((col, idx) => {
        hoja.getColumn(idx + 1).width = col.width;
    });

    return Buffer.from(await libro.xlsx.writeBuffer());
}

