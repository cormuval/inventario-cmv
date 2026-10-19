import { fireEvent, render, screen } from "@testing-library/react";
import type * as React from "react";
import { describe, expect, it } from "vitest";
import { AuditoriaTabla } from "@/modules/auditoria/components/auditoria-tabla";

const mockLogs = [
    {
        id: "log-1",
        usuarioId: "u1",
        accion: "crear",
        entidad: "OrdenSalida",
        entidadId: "salida-999",
        detalle: {
            tipo: "Consumo Interno",
            bodegaOrigen: "Bodega Farmacia",
            lineas: 3
        },
        fecha: new Date("2026-10-19T14:30:00Z"),
        usuario: {
            id: "u1",
            nombre: "Juan",
            apPaterno: "Pérez",
            email: "juan@cmvalparaiso.cl",
            rolId: "R07"
        }
    }
];

describe("AuditoriaTabla", () => {
    it("renderiza columnas principales y expande el visor estructurado de detalle", () => {
        render(
            <AuditoriaTabla
                logs={mockLogs}
                total={1}
                paginaActual={1}
                paginasTotales={1}
                onCambiarPagina={() => {}}
            />
        );

        expect(screen.getByText("OrdenSalida")).toBeInTheDocument();
        expect(screen.getByText("Crear")).toBeInTheDocument();
        expect(screen.getByText(/juan pérez/i)).toBeInTheDocument();

        // Pulsar botón de expansión de detalle
        const btnDetalle = screen.getByRole("button", { name: /ver detalle/i });
        fireEvent.click(btnDetalle);

        expect(screen.getByText(/consumo interno/i)).toBeInTheDocument();
        expect(screen.getByText(/bodega farmacia/i)).toBeInTheDocument();
    });
});
