import * as React from "react";
import { render, screen, fireEvent } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

// mocks
vi.mock("next/navigation", () => ({
    useRouter: () => ({ replace: vi.fn(), push: vi.fn() }),
    useSearchParams: () => new URLSearchParams()
}));

vi.mock("sonner", () => ({ toast: { success: vi.fn(), error: vi.fn() } }));

vi.mock("@/modules/mantenedores/actions/mantenedores.action", () => ({
    crearCentro: vi.fn(),
    editarCentro: vi.fn(),
    toggleEstadoCentro: vi.fn(),
    crearBodega: vi.fn(),
    editarBodega: vi.fn(),
    toggleEstadoBodega: vi.fn(),
    crearUnidad: vi.fn(),
    editarUnidad: vi.fn(),
    toggleEstadoUnidad: vi.fn(),
    crearUsuario: vi.fn(),
    editarUsuario: vi.fn(),
    toggleEstadoUsuario: vi.fn()
}));

// components
import { MantenedoresTabs } from "@/modules/mantenedores/components/mantenedores-tabs";
import { CentrosTabla } from "@/modules/mantenedores/components/centros/centros-tabla";
import { BodegasTabla } from "@/modules/mantenedores/components/bodegas/bodegas-tabla";
import { UnidadesTabla } from "@/modules/mantenedores/components/unidades/unidades-tabla";

describe("Mantenedores CRUD - Componentes UI", () => {
    const mockCentros = [
        { id: "c-1", nombre: "CESFAM Barón", estado: true },
        { id: "c-2", nombre: "CESFAM Esperanza", estado: false }
    ];

    const mockBodegas = [
        { id: "b-1", nombre: "Bodega Farmacia Barón", centroId: "c-1", estado: true, centro: mockCentros[0] },
        { id: "b-2", nombre: "Bodega Periférica Esperanza", centroId: "c-2", estado: false, centro: mockCentros[1] }
    ];

    const mockRoles = [
        { id: "R01", descripcion: "Administrador Central" },
        { id: "R07", descripcion: "Operador de Bodega" }
    ];

    const mockUsuarios = [
        {
            id: "u-1",
            nombre: "Juan",
            apPaterno: "Perez",
            apMaterno: "Gomez",
            email: "juan@cmvalparaiso.cl",
            telefono: "12345678",
            rolId: "R01",
            centroId: "c-1",
            bodegaId: "b-1",
            estado: true,
            rol: mockRoles[0],
            centro: mockCentros[0],
            bodega: mockBodegas[0],
            encargos: []
        }
    ];

    const mockUnidades = [
        { id: "un-1", descripcion: "Box Médico 1", estado: true },
        { id: "un-2", descripcion: "Vacunatorio Inactivo", estado: false }
    ];

    beforeEach(() => {
        vi.clearAllMocks();
    });

    describe("MantenedoresTabs", () => {
        it("renderiza las 4 pestañas con sus respectivos contadores", () => {
            render(
                <MantenedoresTabs
                    centros={mockCentros}
                    bodegas={mockBodegas}
                    roles={mockRoles}
                    usuarios={mockUsuarios}
                    unidades={mockUnidades}
                    currentUserId="u-1"
                />
            );

            expect(screen.getByRole("tab", { name: /usuarios/i })).toBeInTheDocument();
            expect(screen.getByRole("tab", { name: /centros de salud/i })).toBeInTheDocument();
            expect(screen.getByRole("tab", { name: /bodegas/i })).toBeInTheDocument();
            expect(screen.getByRole("tab", { name: /unidades y servicios/i })).toBeInTheDocument();
        });

        it("conmuta entre pestañas al hacer clic", () => {
            render(
                <MantenedoresTabs
                    centros={mockCentros}
                    bodegas={mockBodegas}
                    roles={mockRoles}
                    usuarios={mockUsuarios}
                    unidades={mockUnidades}
                    currentUserId="u-1"
                />
            );

            // Al inicio la pestaña activa es Usuarios
            expect(screen.getByText("juan@cmvalparaiso.cl")).toBeInTheDocument();

            // Clic en pestaña Centros
            fireEvent.click(screen.getByRole("tab", { name: /centros de salud/i }));
            expect(screen.getByText("CESFAM Barón")).toBeInTheDocument();

            // Clic en pestaña Bodegas
            fireEvent.click(screen.getByRole("tab", { name: /bodegas/i }));
            expect(screen.getByText("Bodega Farmacia Barón")).toBeInTheDocument();

            // Clic en pestaña Unidades
            fireEvent.click(screen.getByRole("tab", { name: /unidades y servicios/i }));
            expect(screen.getByText("Box Médico 1")).toBeInTheDocument();
        });
    });

    describe("CentrosTabla", () => {
        it("filtra centros por texto de búsqueda", () => {
            render(<CentrosTabla centros={mockCentros} />);

            expect(screen.getByText("CESFAM Barón")).toBeInTheDocument();
            expect(screen.getByText("CESFAM Esperanza")).toBeInTheDocument();

            const input = screen.getByPlaceholderText(/buscar centro por nombre/i);
            fireEvent.change(input, { target: { value: "Esperanza" } });

            expect(screen.queryByText("CESFAM Barón")).toBeNull();
            expect(screen.getByText("CESFAM Esperanza")).toBeInTheDocument();
        });

        it("filtra centros por estado (activos/inactivos)", () => {
            render(<CentrosTabla centros={mockCentros} />);

            const selectEstado = screen.getByRole("combobox");
            fireEvent.change(selectEstado, { target: { value: "inactivos" } });

            expect(screen.queryByText("CESFAM Barón")).toBeNull();
            expect(screen.getByText("CESFAM Esperanza")).toBeInTheDocument();
        });

        it("abre el modal de nuevo centro al hacer clic en '+ Nuevo Centro'", () => {
            render(<CentrosTabla centros={mockCentros} />);

            const btnNuevo = screen.getByRole("button", { name: /nuevo centro/i });
            fireEvent.click(btnNuevo);

            expect(screen.getByRole("dialog")).toBeInTheDocument();
            expect(screen.getByRole("heading", { name: "Nuevo Centro de Salud" })).toBeInTheDocument();
        });

        it("abre el modal de edición prellenado al hacer clic en el botón de editar", () => {
            render(<CentrosTabla centros={mockCentros} />);

            const editButtons = screen.getAllByLabelText(/editar/i);
            fireEvent.click(editButtons[0]);

            expect(screen.getByRole("dialog")).toBeInTheDocument();
            expect(screen.getByRole("heading", { name: "Editar Centro de Salud" })).toBeInTheDocument();
            const inputNombre = screen.getByLabelText(/nombre del centro/i) as HTMLInputElement;
            expect(inputNombre.value).toBe("CESFAM Barón");
        });
    });

    describe("BodegasTabla", () => {
        it("filtra bodegas por selector de centro de salud", () => {
            render(<BodegasTabla bodegas={mockBodegas} centros={mockCentros} />);

            expect(screen.getByText("Bodega Farmacia Barón")).toBeInTheDocument();
            expect(screen.getByText("Bodega Periférica Esperanza")).toBeInTheDocument();

            const selects = screen.getAllByRole("combobox");
            const selectCentro = selects[0]; // filtroCentroId
            fireEvent.change(selectCentro, { target: { value: "c-1" } });

            expect(screen.getByText("Bodega Farmacia Barón")).toBeInTheDocument();
            expect(screen.queryByText("Bodega Periférica Esperanza")).toBeNull();
        });

        it("abre el modal de nueva bodega al pulsar '+ Nueva Bodega'", () => {
            render(<BodegasTabla bodegas={mockBodegas} centros={mockCentros} />);

            const btnNueva = screen.getByRole("button", { name: /nueva bodega/i });
            fireEvent.click(btnNueva);

            expect(screen.getByRole("dialog")).toBeInTheDocument();
            expect(screen.getByRole("heading", { name: "Nueva Bodega" })).toBeInTheDocument();
        });
    });

    describe("UnidadesTabla", () => {
        it("muestra unidades con badges de estado y abre modal de edición", () => {
            render(<UnidadesTabla unidades={mockUnidades} />);

            expect(screen.getByText("Box Médico 1")).toBeInTheDocument();
            expect(screen.getByText("Vacunatorio Inactivo")).toBeInTheDocument();

            const editBtns = screen.getAllByLabelText(/editar/i);
            fireEvent.click(editBtns[0]);

            expect(screen.getByRole("dialog")).toBeInTheDocument();
            expect(screen.getByRole("heading", { name: "Editar Unidad o Servicio" })).toBeInTheDocument();
            const inputDesc = screen.getByLabelText(/descripción de la unidad/i) as HTMLInputElement;
            expect(inputDesc.value).toBe("Box Médico 1");
        });
    });
});
