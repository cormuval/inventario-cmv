import { beforeEach, describe, expect, it, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { BotonNotificacionesPrestamos } from "@/shared/components/layout/boton-notificaciones-prestamos";
import * as notifAction from "@/modules/orden-entrada/actions/notificaciones-prestamos.action";

vi.mock("@/modules/orden-entrada/actions/notificaciones-prestamos.action", () => ({
    obtenerPrestamosEnTransitoCentroAction: vi.fn()
}));

const mockPrestamosConDatos = {
    total: 2,
    ordenes: [
        {
            id: "ord-1",
            codigo: "K94J2Q8",
            centroOrigen: "CESFAM Barón",
            bodegaOrigen: "Farmacia Barón",
            fecha: "2026-10-27T10:00:00.000Z",
            esDemorado: false,
            totalItems: 3
        },
        {
            id: "ord-2",
            codigo: "M72X9P1",
            centroOrigen: "CESFAM Reina Isabel",
            bodegaOrigen: "Farmacia Central",
            fecha: "2026-10-15T10:00:00.000Z",
            esDemorado: true,
            totalItems: 1
        }
    ]
};

const mockPrestamosVacio = {
    total: 0,
    ordenes: []
};

describe("BotonNotificacionesPrestamos", () => {
    beforeEach(() => {
        vi.clearAllMocks();
    });

    it("renderiza el punto rojo indicador cuando hay transferencias pendientes en tránsito", () => {
        render(<BotonNotificacionesPrestamos initialData={mockPrestamosConDatos} />);

        // Botón campana existe
        const boton = screen.getByRole("button", { name: /notificaciones de préstamos/i });
        expect(boton).toBeInTheDocument();

        // El punto rojo indicador está presente
        const puntoRojo = screen.getByTestId("punto-rojo-notificacion");
        expect(puntoRojo).toBeInTheDocument();
        expect(puntoRojo).toHaveClass("bg-red-500");
    });

    it("no renderiza el punto rojo cuando no hay órdenes en tránsito", () => {
        render(<BotonNotificacionesPrestamos initialData={mockPrestamosVacio} />);

        const boton = screen.getByRole("button", { name: /notificaciones de préstamos/i });
        expect(boton).toBeInTheDocument();

        expect(screen.queryByTestId("punto-rojo-notificacion")).not.toBeInTheDocument();
    });

    it("despliega popover con los envíos entrantes y alerta de demora al hacer clic", async () => {
        const user = userEvent.setup();
        render(<BotonNotificacionesPrestamos initialData={mockPrestamosConDatos} />);

        const boton = screen.getByRole("button", { name: /notificaciones de préstamos/i });
        await user.click(boton);

        expect(screen.getByText("Envíos en Tránsito (2)")).toBeInTheDocument();
        expect(screen.getByText("CESFAM Barón")).toBeInTheDocument();
        expect(screen.getByText("K94J2Q8")).toBeInTheDocument();
        expect(screen.getByText(/Tránsito Demorado/i)).toBeInTheDocument();
        expect(screen.getByRole("link", { name: /ir a recepcionar/i })).toHaveAttribute(
            "href",
            "/orden-entrada/recepcion-prestamos"
        );
    });
});
