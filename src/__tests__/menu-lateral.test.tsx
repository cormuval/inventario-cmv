import { render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

// components
import { AppSidebarShell } from "@/shared/components/layout/app-sidebar-shell";
import { aplanarMenu, construirMenu, esRutaActiva } from "@/shared/components/layout/menu";

vi.mock("next/navigation", () => ({
    usePathname: () => "/salidas/registros"
}));

vi.mock("@/modules/auth/actions/auth.action", () => ({
    cerrarSesion: vi.fn()
}));

function hrefs(rolId: string): string[] {
    return aplanarMenu(construirMenu(rolId)).map((item) => item.href);
}

describe("construirMenu", () => {
    it("agrupa entrada y salida con sus subopciones para el Administrador", () => {
        const menu = construirMenu("R01");
        const grupos = menu.filter((item) => item.tipo === "grupo");

        expect(grupos.map((grupo) => grupo.label)).toEqual(["Gestión de entrada", "Gestión de salida"]);
        expect(hrefs("R01")).toEqual([
            "/",
            "/stock",
            "/productos",
            "/entradas/nueva",
            "/entradas/registros",
            "/salidas/nueva",
            "/salidas/registros",
            "/salidas/por-producto",
            "/pedidos",
            "/reporte",
            "/mantenedores",
            "/auditoria"
        ]);
    });

    it("oculta 'Nueva…' a quien no puede registrar y Auditoría a quien no es R01", () => {
        expect(hrefs("R02")).not.toContain("/entradas/nueva");
        expect(hrefs("R02")).not.toContain("/salidas/nueva");
        expect(hrefs("R02")).not.toContain("/auditoria");
        expect(hrefs("R06")).toContain("/entradas/nueva");
        expect(hrefs("R06")).not.toContain("/salidas/nueva");
    });

    it("muestra 'Salidas por producto' a todos los roles", () => {
        expect(hrefs("R02")).toContain("/salidas/por-producto");
        expect(hrefs("R06")).toContain("/salidas/por-producto");
    });
});

describe("esRutaActiva", () => {
    it("marca la ruta exacta y sus subrutas, pero Resumen solo en '/'", () => {
        expect(esRutaActiva("/salidas/registros", "/salidas/registros")).toBe(true);
        expect(esRutaActiva("/stock/algo", "/stock")).toBe(true);
        expect(esRutaActiva("/stocks", "/stock")).toBe(false);
        expect(esRutaActiva("/stock", "/")).toBe(false);
        expect(esRutaActiva("/", "/")).toBe(true);
    });
});

describe("AppSidebarShell", () => {
    it("muestra los encabezados de grupo y marca la subopción activa", () => {
        render(
            <AppSidebarShell
                profile={{
                    nombreCompleto: "Encargado Centro",
                    email: "encargado@cmvalparaiso.cl",
                    rol: "Encargado Centro",
                    rolId: "R02",
                    centro: "CESFAM Barón",
                    bodegas: []
                }}
            >
                <div>Contenido</div>
            </AppSidebarShell>
        );

        expect(screen.getByText("Gestión de entrada")).toBeInTheDocument();
        expect(screen.getByText("Gestión de salida")).toBeInTheDocument();
        expect(screen.queryByText("Nueva salida")).not.toBeInTheDocument();
        expect(screen.getAllByRole("link", { name: "Registros de salida" })[0]).toHaveClass("bg-teal-600");
    });
});
