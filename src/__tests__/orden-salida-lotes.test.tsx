import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

// actions
import { listarLotesDisponibles } from "@/modules/orden-salida/actions/lotes-disponibles.action";

// components
import { OrdenSalidaForm } from "@/modules/orden-salida/components/orden-salida-form";

vi.mock("@/modules/orden-salida/actions/orden-salida.action", () => ({
    crearOrdenSalida: vi.fn(),
    descargarComprobanteSalidaAction: vi.fn()
}));

vi.mock("@/modules/orden-salida/actions/lotes-disponibles.action", () => ({
    listarLotesDisponibles: vi.fn()
}));

vi.mock("sonner", () => ({ toast: { error: vi.fn(), success: vi.fn() } }));

const centro = { id: "c1", nombre: "CESFAM Barón", estado: true };
const bodegas = [
    { id: "b1", nombre: "Farmacia", centroId: "c1", estado: true },
    { id: "b2", nombre: "Dental", centroId: "c1", estado: true }
];

describe("OrdenSalidaForm — lotes por bodega", () => {
    beforeEach(() => {
        vi.clearAllMocks();
        vi.mocked(listarLotesDisponibles).mockResolvedValue({ ok: true, message: "", lotes: [] });
    });

    it("no pide lotes al abrir con la bodega inicial precargada", () => {
        render(<OrdenSalidaForm centros={[centro]} bodegas={bodegas} stocks={[]} centroId="c1" bodegaId="b1" puedeFiltrarCentro />);

        expect(listarLotesDisponibles).not.toHaveBeenCalled();
    });

    it("pide los lotes de la nueva bodega al cambiarla", async () => {
        render(<OrdenSalidaForm centros={[centro]} bodegas={bodegas} stocks={[]} centroId="c1" bodegaId="b1" puedeFiltrarCentro />);

        // El texto de la etiqueta incluye las opciones del select, por eso se usa una regex de prefijo.
        // Con el tipo por defecto ("Consumo Interno") no existe el select de bodega destino.
        fireEvent.change(screen.getByLabelText(/^Bodega/), { target: { value: "b2" } });

        await waitFor(() => expect(listarLotesDisponibles).toHaveBeenCalledWith("b2"));
    });
});
