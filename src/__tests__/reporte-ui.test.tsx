import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { toast } from "sonner";
import { beforeEach, describe, expect, it, vi } from "vitest";

// actions
import { exportarReporteExcelAction } from "@/modules/reporte/actions/reporte.action";

// components
import { ArbolCentros } from "@/modules/reporte/components/arbol-centros";
import { BotonExportarReporte } from "@/modules/reporte/components/boton-exportar-reporte";
import { ReporteTabla } from "@/modules/reporte/components/reporte-tabla";

// utils
import { columnasDelPeriodo } from "@/modules/reporte/utils/periodo";
import { descargarArchivoBase64 } from "@/shared/utils/descargar-base64";

vi.mock("@/modules/reporte/actions/reporte.action", () => ({ exportarReporteExcelAction: vi.fn() }));
vi.mock("@/shared/utils/descargar-base64", () => ({ descargarArchivoBase64: vi.fn() }));
vi.mock("sonner", () => ({ toast: { error: vi.fn(), success: vi.fn() } }));

const ARBOL = [
    { id: "c1", nombre: "Cesfam Barón", bodegas: [{ id: "b1", nombre: "Farmacia" }] },
    { id: "c2", nombre: "Cesfam Placeres", bodegas: [{ id: "b2", nombre: "Dental" }] }
];

describe("ArbolCentros", () => {
    it("abre el centro de la bodega elegida y conserva el período en los enlaces", () => {
        render(<ArbolCentros arbol={ARBOL} centroId={null} bodegaId="b1" parametros={{ mesDesde: "2026-01", mesHasta: "2026-12" }} />);

        expect(screen.getByRole("link", { name: "Todo" })).toHaveAttribute("href", "/reporte?mesDesde=2026-01&mesHasta=2026-12");
        expect(screen.getByRole("link", { name: "Farmacia" })).toHaveAttribute("aria-current", "page");
        expect(screen.queryByRole("link", { name: "Dental" })).not.toBeInTheDocument();
        expect(screen.getByRole("link", { name: /Cesfam Placeres/ })).toHaveAttribute(
            "href",
            "/reporte?mesDesde=2026-01&mesHasta=2026-12&centroId=c2"
        );
    });
});

describe("ReporteTabla", () => {
    it("muestra una columna por mes y el consumo del período", () => {
        render(
            <ReporteTabla
                columnas={columnasDelPeriodo("2026-01", "2026-02")}
                filas={[{
                    centro: "Cesfam Barón",
                    bodega: "Farmacia",
                    bodegaId: "b1",
                    productoId: 7,
                    descripcion: "Guantes M",
                    linea: "INSUMOS",
                    stockActual: 1500,
                    ultimaActualizacion: null,
                    meses: { "2026-01": 5, "2026-02": 0 },
                    consumoPeriodo: 5
                }]}
            />
        );

        expect(screen.getByRole("columnheader", { name: "ene-2026" })).toBeInTheDocument();
        expect(screen.getByRole("columnheader", { name: "Consumo período" })).toBeInTheDocument();
        expect(screen.getByText("1.500")).toBeInTheDocument();
    });
});

describe("BotonExportarReporte", () => {
    beforeEach(() => {
        vi.clearAllMocks();
    });

    it("avisa y reactiva el botón si la exportación falla por un error de red", async () => {
        vi.mocked(exportarReporteExcelAction).mockRejectedValue(new Error("503"));

        render(<BotonExportarReporte parametros={{ mesDesde: "2026-01", mesHasta: "2026-12" }} />);
        const boton = screen.getByRole("button", { name: /exportar excel/i });
        fireEvent.click(boton);

        await waitFor(() => expect(toast.error).toHaveBeenCalledWith("No fue posible generar el Excel del reporte."));
        await waitFor(() => expect(boton).toBeEnabled());
        expect(descargarArchivoBase64).not.toHaveBeenCalled();
    });

    it("descarga el archivo devuelto por la action", async () => {
        vi.mocked(exportarReporteExcelAction).mockResolvedValue({ ok: true, message: "", base64: "QUJD", nombreArchivo: "r.xlsx" });

        render(<BotonExportarReporte parametros={{ mesDesde: "2026-01", mesHasta: "2026-12" }} />);
        fireEvent.click(screen.getByRole("button", { name: /exportar excel/i }));

        await waitFor(() => expect(descargarArchivoBase64).toHaveBeenCalledWith(
            "QUJD",
            "r.xlsx",
            "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
        ));
        expect(exportarReporteExcelAction).toHaveBeenCalledWith({ mesDesde: "2026-01", mesHasta: "2026-12" });
    });
});
