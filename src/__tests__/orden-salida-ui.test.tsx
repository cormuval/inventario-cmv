import { render, screen } from "@testing-library/react";
import * as React from "react";
import { describe, expect, it, vi } from "vitest";

// components
import { BotonDescargarComprobante } from "@/modules/orden-salida/components/boton-descargar-comprobante";
import { OrdenSalidaForm } from "@/modules/orden-salida/components/orden-salida-form";

vi.mock("@/modules/orden-salida/actions/orden-salida.action", () => ({
    descargarComprobanteSalidaAction: vi.fn(),
    crearOrdenSalida: vi.fn()
}));

vi.mock("sonner", () => ({
    toast: {
        error: vi.fn(),
        success: vi.fn()
    }
}));

describe("Integración UI de Comprobante PDF", () => {
    it("renderiza botón de descarga con label accesible en la tabla de salidas", () => {
        render(<BotonDescargarComprobante ordenId="orden-10" />);
        expect(screen.getByRole("button", { name: /descargar pdf/i })).toBeInTheDocument();
    });

    it("renderiza OrdenSalidaForm con soporte para comprobante tras guardar", () => {
        const mockCentros = [{ id: "c-1", nombre: "CESFAM Centro", estado: true, createdAt: new Date(), updatedAt: new Date() }];
        const mockBodegas = [{ id: "b-1", nombre: "Farmacia", centroId: "c-1", estado: true, createdAt: new Date(), updatedAt: new Date() }];

        render(
            <OrdenSalidaForm
                centros={mockCentros}
                bodegas={mockBodegas}
                stocks={[]}
                centroId="c-1"
                bodegaId="b-1"
            />
        );

        expect(screen.getByRole("button", { name: /registrar salida/i })).toBeInTheDocument();
    });
});
