import React from "react";
import { render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

vi.mock("@/modules/auth/actions/auth.action", () => ({
    cerrarSesion: vi.fn()
}));

// config
import nextConfig from "../../next.config";

// components
import { AppSidebarShell } from "@/shared/components/layout/app-sidebar-shell";

describe("Estandarización de Mantenedores en Interfaz", () => {
    const mockProfile = {
        nombreCompleto: "Administrador Central",
        email: "admin@cmvalparaiso.cl",
        rol: "Administrador Central",
        centro: "Dirección de Salud",
        bodegas: ["Bodega Farmacia Central"]
    };

    it("renderiza 'Mantenedores' en la barra lateral con enlace a /mantenedores", () => {
        render(
            <AppSidebarShell profile={mockProfile}>
                <div>Contenido principal</div>
            </AppSidebarShell>
        );

        // Debe existir el enlace a Mantenedores
        const mantenedoresLinks = screen.getAllByRole("link", { name: /mantenedores/i });
        expect(mantenedoresLinks.length).toBeGreaterThan(0);
        expect(mantenedoresLinks[0]).toHaveAttribute("href", "/mantenedores");

        // No debe existir 'Configuraciones' en los enlaces del menú
        expect(screen.queryByRole("link", { name: /^configuraciones$/i })).toBeNull();
    });

    it("redirige permanentemente la ruta historica /configuraciones a /mantenedores", async () => {
        const redirects = await nextConfig.redirects?.();

        expect(redirects).toContainEqual({
            source: "/configuraciones",
            destination: "/mantenedores",
            permanent: true
        });
    });
});
