import { render, screen } from "@testing-library/react";
import type * as React from "react";
import { describe, expect, it, vi } from "vitest";
import { AppSidebarShell } from "@/shared/components/layout/app-sidebar-shell";

vi.mock("next/navigation", () => ({
    usePathname: () => "/auditoria"
}));

vi.mock("@/modules/auth/actions/auth.action", () => ({
    cerrarSesion: vi.fn()
}));

describe("Acceso en Barra Lateral a Auditoría", () => {
    it("muestra el enlace a Auditoría únicamente para usuarios con rol R01", () => {
        const { rerender } = render(
            <AppSidebarShell
                profile={{
                    nombreCompleto: "Admin Central",
                    email: "admin@cmvalparaiso.cl",
                    rol: "R01",
                    centro: "CESFAM Centro",
                    bodegas: ["Bodega 1"]
                }}
            >
                <div>Contenido</div>
            </AppSidebarShell>
        );

        expect(screen.getByText("Auditoría")).toBeInTheDocument();

        // Para rol no administrador (ej: R07)
        rerender(
            <AppSidebarShell
                profile={{
                    nombreCompleto: "Operador Bodega",
                    email: "operador@cmvalparaiso.cl",
                    rol: "R07",
                    centro: "CESFAM Centro",
                    bodegas: ["Bodega 1"]
                }}
            >
                <div>Contenido</div>
            </AppSidebarShell>
        );

        expect(screen.queryByText("Auditoría")).not.toBeInTheDocument();
    });
});
