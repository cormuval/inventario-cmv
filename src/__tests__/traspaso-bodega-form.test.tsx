import React from "react";
import { render, screen, fireEvent, within } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { OrdenSalidaForm } from "@/modules/orden-salida/components/orden-salida-form";

vi.mock("@/modules/orden-salida/actions/orden-salida.action", () => ({
    crearOrdenSalida: vi.fn()
}));

describe("OrdenSalidaForm - selección de bodegas destino para operadores R07", () => {
    const centroBaron = { id: "centro-1", nombre: "CESFAM Barón", estado: true };
    const bodegaFarmacia = { id: "b1", nombre: "Bodega Farmacia", centroId: "centro-1", estado: true };
    const bodegaVacunatorio = { id: "b2", nombre: "Bodega Vacunatorio", centroId: "centro-1", estado: true };
    const bodegaDental = { id: "b3", nombre: "Bodega Dental", centroId: "centro-1", estado: true };

    it("permite a un operador R07 con una sola bodega asignada ver las demás bodegas del centro como destino", () => {
        // Para R07, bodegas asignadas contiene únicamente Farmacia (b1)
        const bodegasAsignadas = [bodegaFarmacia];
        // bodegasDestino contiene todas las bodegas activas del centro Barón (b1, b2, b3)
        const bodegasDelCentro = [bodegaFarmacia, bodegaVacunatorio, bodegaDental];

        render(
            <OrdenSalidaForm
                centros={[centroBaron]}
                bodegas={bodegasAsignadas}
                bodegasDestino={bodegasDelCentro}
                stocks={[]}
                centroId="centro-1"
                bodegaId="b1"
            />
        );

        // Cambiamos tipoSalida a "A otra bodega"
        const tipoSalidaSelect = screen.getByLabelText(/tipo salida/i);
        fireEvent.change(tipoSalidaSelect, { target: { value: "A otra bodega" } });

        // Verificamos que aparece el selector de Bodega destino (Mismo centro)
        expect(screen.getByText(/Bodega destino \(Mismo centro\)/i)).toBeInTheDocument();

        const bodegaDestinoSelect = screen.getByLabelText(/bodega destino \(mismo centro\)/i);
        expect(within(bodegaDestinoSelect).getByRole("option", { name: "Bodega Vacunatorio" })).toBeInTheDocument();
        expect(within(bodegaDestinoSelect).getByRole("option", { name: "Bodega Dental" })).toBeInTheDocument();
        expect(within(bodegaDestinoSelect).queryByRole("option", { name: "Bodega Farmacia" })).not.toBeInTheDocument();
    });
});
