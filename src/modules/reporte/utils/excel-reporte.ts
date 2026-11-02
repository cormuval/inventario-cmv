import ExcelJS from "exceljs";

// utils
import type { ColumnaMes } from "@/modules/reporte/utils/periodo";
import type { FilaReporte } from "@/modules/reporte/utils/reporte-consulta";

export const MIME_XLSX = "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet";

export async function construirExcelReporte(filas: FilaReporte[], columnas: ColumnaMes[]): Promise<Buffer> {
    const libro = new ExcelJS.Workbook();
    const hoja = libro.addWorksheet("Consumo");

    hoja.columns = [
        { header: "Centro", key: "centro", width: 28 },
        { header: "Bodega", key: "bodega", width: 28 },
        { header: "Código", key: "productoId", width: 10 },
        { header: "Producto", key: "descripcion", width: 42 },
        { header: "Línea", key: "linea", width: 18 },
        { header: "Stock actual", key: "stockActual", width: 14 },
        { header: "Última actualización", key: "ultimaActualizacion", width: 20, style: { numFmt: "dd-mm-yyyy" } },
        ...columnas.map((columna) => ({ header: columna.etiqueta, key: columna.clave, width: 11 })),
        { header: "Consumo del período", key: "consumoPeriodo", width: 20 }
    ];
    hoja.getRow(1).font = { bold: true };
    hoja.views = [{ state: "frozen", ySplit: 1 }];

    for (const fila of filas) {
        hoja.addRow({
            centro: fila.centro,
            bodega: fila.bodega,
            productoId: fila.productoId,
            descripcion: fila.descripcion,
            linea: fila.linea,
            stockActual: fila.stockActual,
            ultimaActualizacion: fila.ultimaActualizacion,
            ...fila.meses,
            consumoPeriodo: fila.consumoPeriodo
        });
    }

    return Buffer.from(await libro.xlsx.writeBuffer());
}

export function nombreArchivoReporte(nodo: string, mesDesde: string, mesHasta: string): string {
    const slug = nodo
        .normalize("NFD")
        .replace(/\p{Diacritic}/gu, "")
        .toLowerCase()
        .replace(/[^a-z0-9]+/g, "-")
        .replace(/^-|-$/g, "");

    return `reporte-consumo-${slug || "todo"}-${mesDesde}_${mesHasta}.xlsx`;
}
