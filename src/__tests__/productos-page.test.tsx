import type * as React from "react";
import { render, screen } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

// actions
import {
    listarLineasProductos,
    listarProductosPaginados
} from "@/modules/productos/actions/productos.action";

// lib
import { requireSessionUser } from "@/shared/lib/auth";

// app
import ProductosPage from "@/app/productos/page";

vi.mock("@/modules/productos/actions/productos.action", () => ({
    listarProductos: vi.fn().mockResolvedValue([]),
    listarLineasProductos: vi.fn(),
    listarProductosPaginados: vi.fn()
}));

vi.mock("@/shared/lib/auth", () => ({
    requireSessionUser: vi.fn(),
    puedeAdministrar: (rol: string) => rol === "R01"
}));

vi.mock("@/shared/components/layout/app-layout", () => ({
    AppLayout: ({ children }: { children: React.ReactNode }) => <div>{children}</div>
}));

vi.mock("@/modules/productos/components/producto-form", () => ({
    ProductoForm: () => <form aria-label="Nuevo producto" />
}));

const paginacion = {
    pagina: 2,
    tamano: 100,
    total: 201,
    paginasTotales: 3,
    skip: 100,
    desde: 101,
    hasta: 200
};

function prepararConsulta(): void {
    vi.mocked(listarLineasProductos).mockResolvedValue(["ASEO", "CLINICO"]);
    vi.mocked(listarProductosPaginados).mockResolvedValue({
        productos: [
            { id: 104, linea: "CLINICO", descripcion: "Guantes de procedimiento", estado: true }
        ],
        paginacion
    } as never);
}

function prepararSesion(rol: string): void {
    vi.mocked(requireSessionUser).mockResolvedValue({
        id: "usuario-1",
        nombre: "Usuario",
        apPaterno: "Prueba",
        email: "usuario@cmvalparaiso.cl",
        rol,
        centroId: "centro-1",
        bodegaId: null
    });
}

describe("ProductosPage", () => {
    beforeEach(() => {
        vi.clearAllMocks();
        prepararConsulta();
    });

    it("muestra la creación de productos solamente a Administrador", async () => {
        prepararSesion("R01");

        const { rerender } = render(await ProductosPage({ searchParams: Promise.resolve({}) }));

        expect(screen.getByRole("heading", { name: "Nuevo producto" })).toBeInTheDocument();

        prepararSesion("R02");
        rerender(await ProductosPage({ searchParams: Promise.resolve({}) }));

        expect(screen.queryByRole("heading", { name: "Nuevo producto" })).not.toBeInTheDocument();
    });

    it("conserva los filtros actuales en el formulario GET y los resultados paginados", async () => {
        prepararSesion("R02");

        render(
            await ProductosPage({
                searchParams: Promise.resolve({
                    id: "104",
                    linea: "CLINICO",
                    estado: "activo",
                    descripcion: "guantes",
                    pagina: "2"
                })
            })
        );

        const formulario = screen.getByRole("form", { name: "Filtros de productos" });
        expect(formulario).toHaveAttribute("method", "get");
        expect(formulario).toHaveAttribute("action", "/productos");
        expect(screen.getByLabelText("ID")).toHaveValue(104);
        expect(screen.getByLabelText("Línea")).toHaveValue("CLINICO");
        expect(screen.getByLabelText("Estado")).toHaveValue("activo");
        expect(screen.getByLabelText("Descripción")).toHaveValue("guantes");
        expect(formulario.querySelector('[name="pagina"]')).toBeNull();
        expect(screen.getByRole("cell", { name: "Guantes de procedimiento" })).toBeInTheDocument();
    });

    it("muestra advertencias y un estado vacío cuando los filtros no tienen coincidencias", async () => {
        prepararSesion("R02");
        vi.mocked(listarProductosPaginados).mockResolvedValue({
            productos: [],
            paginacion: { ...paginacion, pagina: 1, total: 0, paginasTotales: 1, skip: 0, desde: 0, hasta: 0 }
        } as never);

        render(await ProductosPage({ searchParams: Promise.resolve({ linea: "INVALIDA" }) }));

        expect(screen.getByText("La línea del producto no es válida; se muestran todas las líneas.")).toBeInTheDocument();
        expect(screen.getByText("No se encontraron productos con los filtros seleccionados.")).toBeInTheDocument();
    });

    it("conserva todos los filtros al navegar entre páginas", async () => {
        prepararSesion("R02");

        render(
            await ProductosPage({
                searchParams: Promise.resolve({
                    id: "104",
                    linea: "CLINICO",
                    estado: "activo",
                    descripcion: "guantes",
                    pagina: "2"
                })
            })
        );

        expect(screen.getByRole("link", { name: "Siguiente" })).toHaveAttribute(
            "href",
            "/productos?id=104&linea=CLINICO&estado=activo&descripcion=guantes&pagina=3"
        );
    });
});
