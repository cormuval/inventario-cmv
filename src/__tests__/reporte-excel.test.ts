// @vitest-environment node
import ExcelJS from "exceljs";
import { describe, expect, it } from "vitest";

// utils
import { construirExcelReporte, nombreArchivoReporte } from "@/modules/reporte/utils/excel-reporte";
import { columnasDelPeriodo } from "@/modules/reporte/utils/periodo";

describe("construirExcelReporte", () => {
    it("escribe encabezados, meses del período y valores numéricos", async () => {
        const columnas = columnasDelPeriodo("2026-01", "2026-02");
        const buffer = await construirExcelReporte(
            [{
                centro: "CESFAM Barón",
                bodega: "Farmacia",
                bodegaId: "b1",
                productoId: 7,
                descripcion: "Guantes M",
                linea: "INSUMOS",
                stockActual: 40,
                ultimaActualizacion: new Date("2026-10-28T12:00:00.000Z"),
                meses: { "2026-01": 5, "2026-02": 0 },
                consumoPeriodo: 5
            }],
            columnas
        );

        const libro = new ExcelJS.Workbook();
        await libro.xlsx.load(buffer as never);
        const hoja = libro.getWorksheet("Consumo");

        expect(hoja?.getRow(1).values).toEqual([
            undefined,
            "Centro",
            "Bodega",
            "Código",
            "Producto",
            "Línea",
            "Stock actual",
            "Última actualización",
            "ene-2026",
            "feb-2026",
            "Consumo del período"
        ]);
        expect(hoja?.getRow(2).getCell(6).value).toBe(40);
        expect(hoja?.getRow(2).getCell(8).value).toBe(5);
        expect(hoja?.getRow(2).getCell(10).value).toBe(5);
    });
});

describe("nombreArchivoReporte", () => {
    it("normaliza el nombre del nodo", () => {
        expect(nombreArchivoReporte("Cesfam Las Cañas", "2026-01", "2026-12")).toBe("reporte-consumo-cesfam-las-canas-2026-01_2026-12.xlsx");
    });
});
