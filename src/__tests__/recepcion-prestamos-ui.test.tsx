import { beforeEach, describe, expect, it, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { RecepcionPrestamoView } from "@/modules/orden-entrada/components/recepcion-prestamo-view";
import * as actions from "@/modules/orden-entrada/actions/recepcion-prestamos.action";

vi.mock("@/modules/orden-entrada/actions/recepcion-prestamos.action", () => ({
    buscarPrestamoPorCodigoAction: vi.fn(),
    confirmarRecepcionPrestamoAction: vi.fn()
}));

vi.mock("sonner", () => ({
    toast: {
        success: vi.fn(),
        error: vi.fn()
    }
}));

const mockBodegas = [
    { id: "b-pa-1", nombre: "Farmacia Playa Ancha", centroId: "c-pa" },
    { id: "b-pa-2", nombre: "Vacunatorio Playa Ancha", centroId: "c-pa" }
];

const mockPrestamoDetalle = {
    id: "ord-1",
    codigo: "K94J2Q8",
    centroOrigenNombre: "CESFAM Barón",
    bodegaOrigenNombre: "Farmacia Barón",
    centroDestinoId: "c-pa",
    fechaEmision: "2026-10-25T10:00:00.000Z",
    esDemorado: false,
    detalles: [
        {
            id: "d1",
            productoId: 101,
            productoDescripcion: "Amoxicilina 500mg",
            linea: "Farmacia",
            cantidad: 50,
            lote: "LOT-AMX-2026",
            fechaCaducidad: "2027-04-10T00:00:00.000Z"
        }
    ]
};

describe("RecepcionPrestamoView UI", () => {
    beforeEach(() => {
        vi.clearAllMocks();
    });

    it("renderiza el buscador por código de 7 caracteres", () => {
        render(<RecepcionPrestamoView bodegasDisponibles={mockBodegas} />);

        expect(screen.getByPlaceholderText("Ej: K94J2Q8")).toBeInTheDocument();
        expect(screen.getByRole("button", { name: /localizar envío/i })).toBeInTheDocument();
    });

    it("muestra los detalles de los productos y formulario de confirmación tras localizar el envío", async () => {
        vi.mocked(actions.buscarPrestamoPorCodigoAction).mockResolvedValue({
            ok: true,
            message: "Localizado",
            prestamo: mockPrestamoDetalle
        });

        const user = userEvent.setup();
        render(<RecepcionPrestamoView bodegasDisponibles={mockBodegas} />);

        const input = screen.getByPlaceholderText("Ej: K94J2Q8");
        await user.type(input, "K94J2Q8");

        const botonBuscar = screen.getByRole("button", { name: /localizar envío/i });
        await user.click(botonBuscar);

        expect(actions.buscarPrestamoPorCodigoAction).toHaveBeenCalledWith("K94J2Q8");
        expect(await screen.findByText(/CESFAM Barón/i)).toBeInTheDocument();
        expect(screen.getByText("Amoxicilina 500mg")).toBeInTheDocument();
        expect(screen.getByText("LOT-AMX-2026")).toBeInTheDocument();
        expect(screen.getByText("50")).toBeInTheDocument();
        expect(screen.getByRole("button", { name: /confirmar recepción e ingresar a bodega/i })).toBeInTheDocument();
    });

    it("despliega alerta de tránsito demorado si esDemorado es true", async () => {
        vi.mocked(actions.buscarPrestamoPorCodigoAction).mockResolvedValue({
            ok: true,
            message: "Localizado",
            prestamo: {
                ...mockPrestamoDetalle,
                esDemorado: true
            }
        });

        const user = userEvent.setup();
        render(<RecepcionPrestamoView bodegasDisponibles={mockBodegas} />);

        await user.type(screen.getByPlaceholderText("Ej: K94J2Q8"), "K94J2Q8");
        await user.click(screen.getByRole("button", { name: /localizar envío/i }));

        expect(await screen.findByText(/Tránsito Demorado/i)).toBeInTheDocument();
    });
});
