import { fireEvent, render, screen } from "@testing-library/react";
import type * as React from "react";
import { describe, expect, it, vi } from "vitest";
import { AuditoriaFiltros } from "@/modules/auditoria/components/auditoria-filtros";

const mockCentros = [
    { id: "c1", nombre: "CESFAM Centro" },
    { id: "c2", nombre: "CESFAM Playa Ancha" }
];

const mockBodegas = [
    { id: "b1", nombre: "Bodega Farmacia", centroId: "c1" },
    { id: "b2", nombre: "Bodega Vacunatorio", centroId: "c1" },
    { id: "b3", nombre: "Bodega Playa Ancha", centroId: "c2" }
];

const mockUsuarios = [
    { id: "u1", nombre: "Carlos", apPaterno: "Pérez", email: "carlos@cmvalparaiso.cl", centroId: "c1", bodegaId: "b1", encargos: [{ bodegaId: "b1" }] },
    { id: "u2", nombre: "Ana", apPaterno: "Gómez", email: "ana@cmvalparaiso.cl", centroId: "c1", bodegaId: "b2", encargos: [{ bodegaId: "b2" }] },
    { id: "u3", nombre: "Pedro", apPaterno: "Soto", email: "pedro@cmvalparaiso.cl", centroId: "c2", bodegaId: "b3", encargos: [{ bodegaId: "b3" }] }
];

describe("AuditoriaFiltros - Dependencia en Cascada", () => {
    it("filtra las bodegas y usuarios dinámicamente según el centro seleccionado", () => {
        const onFiltrar = vi.fn();

        render(
            <AuditoriaFiltros
                centros={mockCentros}
                bodegas={mockBodegas}
                usuarios={mockUsuarios}
                onFiltrar={onFiltrar}
            />
        );

        // Al inicio con centro 'c1' o al seleccionar 'CESFAM Centro'
        const centroSelect = screen.getByLabelText(/centro de salud/i);
        fireEvent.change(centroSelect, { target: { value: "c1" } });

        // Bodega selector debe mostrar Bodega Farmacia y Bodega Vacunatorio, pero NO Bodega Playa Ancha
        const bodegaSelect = screen.getByLabelText(/bodega/i);
        expect(screen.getByText("Bodega Farmacia")).toBeInTheDocument();
        expect(screen.queryByText("Bodega Playa Ancha")).not.toBeInTheDocument();

        // Al seleccionar Bodega Farmacia, el selector de usuarios solo debe listar a Carlos
        fireEvent.change(bodegaSelect, { target: { value: "b1" } });
        expect(screen.getByText(/carlos pérez/i)).toBeInTheDocument();
        expect(screen.queryByText(/ana gómez/i)).not.toBeInTheDocument();
    });

    it("restablece los filtros al pulsar Limpiar", () => {
        const onFiltrar = vi.fn();

        render(
            <AuditoriaFiltros
                centros={mockCentros}
                bodegas={mockBodegas}
                usuarios={mockUsuarios}
                onFiltrar={onFiltrar}
            />
        );

        const btnLimpiar = screen.getByRole("button", { name: /limpiar/i });
        fireEvent.click(btnLimpiar);

        expect(onFiltrar).toHaveBeenCalledWith(
            expect.objectContaining({
                centroId: "todos",
                bodegaId: "todas",
                usuarioId: "todos",
                accion: "todas",
                entidad: "todas"
            })
        );
    });

    it("el schema acepta OrdenSalidaDetalle y el filtro muestra la opción", async () => {
        const { filtroAuditoriaSchema } = await import("@/modules/auditoria/schemas/auditoria.schema");

        // Validación en schema
        const parseResult = filtroAuditoriaSchema.safeParse({ entidad: "OrdenSalidaDetalle" });
        expect(parseResult.success).toBe(true);
        if (parseResult.success) {
            expect(parseResult.data.entidad).toBe("OrdenSalidaDetalle");
        }

        // Renderizado en select de filtro
        render(
            <AuditoriaFiltros
                centros={mockCentros}
                bodegas={mockBodegas}
                usuarios={mockUsuarios}
                onFiltrar={vi.fn()}
            />
        );

        const entidadSelect = screen.getByLabelText(/entidad afectada/i);
        expect(entidadSelect).toBeInTheDocument();
        expect(screen.getByRole("option", { name: "Detalle de orden de salida" })).toBeInTheDocument();
        expect(screen.getByRole("option", { name: "Detalle de orden de entrada" })).toBeInTheDocument();
    });
});

