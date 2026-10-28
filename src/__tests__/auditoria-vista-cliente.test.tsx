import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import type * as React from "react";
import { describe, expect, it, vi } from "vitest";

const consultarLogsAuditoria = vi.fn();

vi.mock("@/modules/auditoria/actions/auditoria.action", () => ({
    consultarLogsAuditoria: (...args: unknown[]) => consultarLogsAuditoria(...args)
}));

import { AuditoriaVistaCliente } from "@/modules/auditoria/components/auditoria-vista-cliente";

const logInicial = {
    id: "log-1",
    usuarioId: "u1",
    centroId: null,
    bodegaId: null,
    accion: "crear",
    entidad: "Producto",
    entidadId: "1",
    detalle: null,
    fecha: new Date("2026-10-21T12:00:00Z"),
    usuario: { id: "u1", nombre: "Juan", apPaterno: "Pérez", email: "juan@cmvalparaiso.cl", rolId: "R01" }
};

describe("AuditoriaVistaCliente - paginación inicial", () => {
    it("al paginar antes de filtrar envía las fechas iniciales en ISO, no la hora local del formulario", async () => {
        consultarLogsAuditoria.mockResolvedValue({ logs: [], total: 0, paginasTotales: 2 });

        render(
            <AuditoriaVistaCliente
                centros={[]}
                bodegas={[]}
                usuarios={[]}
                initialLogs={[logInicial]}
                initialTotal={60}
                initialPaginasTotales={2}
                initialValoresFiltros={{ fechaDesde: "2026-10-21T00:00", fechaHasta: "2026-10-21T23:59" }}
                initialFiltrosConsulta={{
                    fechaDesde: "2026-10-21T03:00:00.000Z",
                    fechaHasta: "2026-10-22T02:59:59.999Z"
                }}
            />
        );

        fireEvent.click(screen.getByRole("button", { name: /siguiente/i }));

        await waitFor(() => expect(consultarLogsAuditoria).toHaveBeenCalled());
        expect(consultarLogsAuditoria).toHaveBeenCalledWith({
            fechaDesde: "2026-10-21T03:00:00.000Z",
            fechaHasta: "2026-10-22T02:59:59.999Z",
            pagina: 2
        });
    });
});
