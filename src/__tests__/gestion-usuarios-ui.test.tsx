import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import * as React from "react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { toast } from "sonner";

// components
import { BodegasMultiSelect } from "@/modules/mantenedores/components/bodegas-multi-select";
import { UsuarioForm } from "@/modules/mantenedores/components/mantenedores-forms";
import { UsuarioEditModal } from "@/modules/mantenedores/components/usuario-edit-modal";
import { UsuariosTabla, type UsuarioTablaItem } from "@/modules/mantenedores/components/usuarios-tabla";

vi.mock("sonner", () => ({
    toast: {
        success: vi.fn(),
        error: vi.fn()
    }
}));

vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));
vi.mock("@/modules/mantenedores/actions/mantenedores.action", () => ({
    crearUsuario: vi.fn(),
    editarUsuario: vi.fn(),
    toggleEstadoUsuario: vi.fn()
}));

const mockCentros = [
    { id: "centro-1", nombre: "CESFAM Centro", estado: true, createdAt: new Date(), updatedAt: new Date() },
    { id: "centro-2", nombre: "CESFAM Playa Ancha", estado: true, createdAt: new Date(), updatedAt: new Date() }
];

const mockBodegas = [
    { id: "b1", nombre: "Bodega Farmacia", centroId: "centro-1", estado: true, createdAt: new Date(), updatedAt: new Date() },
    { id: "b2", nombre: "Bodega Vacunatorio", centroId: "centro-1", estado: true, createdAt: new Date(), updatedAt: new Date() },
    { id: "b3", nombre: "Bodega Playa Ancha", centroId: "centro-2", estado: true, createdAt: new Date(), updatedAt: new Date() }
];

const mockRoles = [
    { id: "R01", descripcion: "Administrador" },
    { id: "R07", descripcion: "Operador de Bodega" }
];

const mockUsuarios: UsuarioTablaItem[] = [
    {
        id: "admin-1",
        nombre: "Admin",
        apPaterno: "Principal",
        apMaterno: "Sistema",
        email: "admin@cmvalparaiso.cl",
        telefono: "+56911111111",
        rolId: "R01",
        centroId: "centro-1",
        estado: true,
        rol: mockRoles[0],
        centro: mockCentros[0],
        bodega: mockBodegas[0],
        encargos: [
            { bodegaId: "b1", bodega: mockBodegas[0] },
            { bodegaId: "b2", bodega: mockBodegas[1] }
        ]
    },
    {
        id: "user-2",
        nombre: "Juan",
        apPaterno: "Pérez",
        apMaterno: "Gómez",
        email: "juan.perez@cmvalparaiso.cl",
        telefono: "+56922222222",
        rolId: "R07",
        centroId: "centro-1",
        estado: true,
        rol: mockRoles[1],
        centro: mockCentros[0],
        bodega: mockBodegas[0],
        encargos: [{ bodegaId: "b1", bodega: mockBodegas[0] }]
    },
    {
        id: "user-3",
        nombre: "María",
        apPaterno: "López",
        apMaterno: "Reyes",
        email: "maria.lopez@cmvalparaiso.cl",
        telefono: null,
        rolId: "R07",
        centroId: "centro-2",
        estado: false,
        rol: mockRoles[1],
        centro: mockCentros[1],
        bodega: null,
        encargos: []
    }
];

describe("Gestión de Usuarios - Componentes UI", () => {
    describe("BodegasMultiSelect", () => {
        it("muestra advertencia cuando no se ha seleccionado un centro", () => {
            render(<BodegasMultiSelect bodegas={mockBodegas} centroIdSeleccionado="" />);
            expect(screen.getByText(/selecciona un centro de salud para ver y asignar bodegas/i)).toBeInTheDocument();
        });

        it("filtra y muestra solo las bodegas del centro seleccionado", () => {
            render(
                <BodegasMultiSelect
                    bodegas={mockBodegas}
                    centroIdSeleccionado="centro-1"
                    selectedBodegaIds={["b1"]}
                />
            );

            expect(screen.getByText("Bodega Farmacia")).toBeInTheDocument();
            expect(screen.getByText("Bodega Vacunatorio")).toBeInTheDocument();
            expect(screen.queryByText("Bodega Playa Ancha")).not.toBeInTheDocument();

            const farmaciaCheckbox = screen.getByRole("checkbox", { name: /bodega farmacia/i }) as HTMLInputElement;
            expect(farmaciaCheckbox.checked).toBe(true);

            const vacunatorioCheckbox = screen.getByRole("checkbox", { name: /bodega vacunatorio/i }) as HTMLInputElement;
            expect(vacunatorioCheckbox.checked).toBe(false);
        });

        it("permite seleccionar y deseleccionar todas las bodegas del centro", () => {
            const onChange = vi.fn();
            render(
                <BodegasMultiSelect
                    bodegas={mockBodegas}
                    centroIdSeleccionado="centro-1"
                    selectedBodegaIds={[]}
                    onChange={onChange}
                />
            );

            const btnTodas = screen.getByRole("button", { name: /todas/i });
            fireEvent.click(btnTodas);
            expect(onChange).toHaveBeenCalledWith(["b1", "b2"]);

            const btnNinguna = screen.getByRole("button", { name: /ninguna/i });
            fireEvent.click(btnNinguna);
            expect(onChange).toHaveBeenCalledWith([]);
        });

        it("no entra en bucle infinito de re-renders cuando no se especifica selectedBodegaIds o se re-renderiza con StrictMode", () => {
            render(
                <React.StrictMode>
                    <BodegasMultiSelect
                        bodegas={mockBodegas}
                        centroIdSeleccionado="centro-1"
                    />
                </React.StrictMode>
            );

            expect(screen.getByText("Bodega Farmacia")).toBeInTheDocument();
        });
    });

    describe("UsuariosTabla", () => {
        beforeEach(() => {
            vi.clearAllMocks();
            vi.spyOn(window, "confirm").mockReturnValue(true);
        });

        it("renderiza la lista de usuarios con sus datos y badges de bodegas múltiples", () => {
            render(
                <UsuariosTabla
                    usuarios={mockUsuarios}
                    currentUserId="admin-1"
                    centros={mockCentros}
                    bodegas={mockBodegas}
                    roles={mockRoles}
                />
            );

            expect(screen.getByText("Admin Principal")).toBeInTheDocument();
            expect(screen.getByText("admin@cmvalparaiso.cl")).toBeInTheDocument();
            expect(screen.getByText("(Tú)")).toBeInTheDocument();

            expect(screen.getByText("Juan Pérez")).toBeInTheDocument();
            expect(screen.getByText("juan.perez@cmvalparaiso.cl")).toBeInTheDocument();

            expect(screen.getByText("María López")).toBeInTheDocument();
            expect(screen.getByText("Inactivo")).toBeInTheDocument();
        });

        it("deshabilita el botón de desactivar para el usuario propio conectado", () => {
            render(
                <UsuariosTabla
                    usuarios={mockUsuarios}
                    currentUserId="admin-1"
                    centros={mockCentros}
                    bodegas={mockBodegas}
                    roles={mockRoles}
                />
            );

            // Para el usuario propio admin-1, muestra 'Propia' deshabilitado
            const btnPropia = screen.getByRole("button", { name: /propia/i });
            expect(btnPropia).toBeDisabled();

            // Para juan.perez (activo), muestra botón 'Desactivar' habilitado
            const btnDesactivarJuan = screen.getByRole("button", { name: /desactivar juan\.perez@cmvalparaiso\.cl/i });
            expect(btnDesactivarJuan).toBeEnabled();

            // Para maria.lopez (inactiva), muestra botón 'Activar' habilitado
            const btnActivarMaria = screen.getByRole("button", { name: /activar maria\.lopez@cmvalparaiso\.cl/i });
            expect(btnActivarMaria).toBeEnabled();
        });

        it("abre el modal de edición al hacer clic en Editar", () => {
            render(
                <UsuariosTabla
                    usuarios={mockUsuarios}
                    currentUserId="admin-1"
                    centros={mockCentros}
                    bodegas={mockBodegas}
                    roles={mockRoles}
                />
            );

            const btnEditarJuan = screen.getByRole("button", { name: /editar juan\.perez@cmvalparaiso\.cl/i });
            fireEvent.click(btnEditarJuan);

            expect(screen.getByRole("dialog")).toBeInTheDocument();
            expect(screen.getByText(/actualiza los datos, rol y bodegas asignadas de juan\.perez@cmvalparaiso\.cl/i)).toBeInTheDocument();
        });

        it("muestra toast.error cuando toggleEstadoUsuario devuelve ok: false", async () => {
            const { toggleEstadoUsuario } = await import("@/modules/mantenedores/actions/mantenedores.action");
            vi.mocked(toggleEstadoUsuario).mockResolvedValueOnce({
                ok: false,
                message: "No tienes permisos para modificar este usuario."
            });

            render(
                <UsuariosTabla
                    usuarios={mockUsuarios}
                    currentUserId="admin-1"
                    centros={mockCentros}
                    bodegas={mockBodegas}
                    roles={mockRoles}
                />
            );

            const btnDesactivarJuan = screen.getByRole("button", { name: /desactivar juan\.perez@cmvalparaiso\.cl/i });
            fireEvent.click(btnDesactivarJuan);

            await waitFor(() => {
                expect(toast.error).toHaveBeenCalledWith("No tienes permisos para modificar este usuario.");
            });
        });

        it("muestra toast.success cuando toggleEstadoUsuario devuelve ok: true", async () => {
            const { toggleEstadoUsuario } = await import("@/modules/mantenedores/actions/mantenedores.action");
            vi.mocked(toggleEstadoUsuario).mockResolvedValueOnce({
                ok: true,
                message: "Usuario desactivado exitosamente."
            });

            render(
                <UsuariosTabla
                    usuarios={mockUsuarios}
                    currentUserId="admin-1"
                    centros={mockCentros}
                    bodegas={mockBodegas}
                    roles={mockRoles}
                />
            );

            const btnDesactivarJuan = screen.getByRole("button", { name: /desactivar juan\.perez@cmvalparaiso\.cl/i });
            fireEvent.click(btnDesactivarJuan);

            await waitFor(() => {
                expect(toast.success).toHaveBeenCalledWith("Usuario desactivado exitosamente.");
            });
        });
    });

    describe("UsuarioEditModal", () => {
        it("bloquea el rol y la desactivación cuando se edita la cuenta propia", () => {
            render(
                <UsuarioEditModal
                    usuario={mockUsuarios[0]} // admin-1
                    currentUserId="admin-1"
                    centros={mockCentros}
                    bodegas={mockBodegas}
                    roles={mockRoles}
                    onClose={vi.fn()}
                />
            );

            expect(screen.getByText(/tu rol propio no puede modificarse/i)).toBeInTheDocument();
            expect(screen.getByText(/por seguridad, no puedes desactivarte a ti mismo/i)).toBeInTheDocument();
        });

        it("permite modificar el rol y el estado para otros usuarios", () => {
            render(
                <UsuarioEditModal
                    usuario={mockUsuarios[1]} // juan.perez
                    currentUserId="admin-1"
                    centros={mockCentros}
                    bodegas={mockBodegas}
                    roles={mockRoles}
                    onClose={vi.fn()}
                />
            );

            expect(screen.getByDisplayValue("R07 · Operador de Bodega")).toBeInTheDocument();
            expect(screen.getByLabelText(/usuario activo en el sistema/i)).toBeInTheDocument();
            expect(screen.queryByText(/tu rol propio no puede modificarse/i)).not.toBeInTheDocument();
        });

        it("cierra el modal al presionar la tecla Escape", () => {
            const onClose = vi.fn();
            render(
                <UsuarioEditModal
                    usuario={mockUsuarios[1]}
                    currentUserId="admin-1"
                    centros={mockCentros}
                    bodegas={mockBodegas}
                    roles={mockRoles}
                    onClose={onClose}
                />
            );

            fireEvent.keyDown(window, { key: "Escape" });
            expect(onClose).toHaveBeenCalledTimes(1);
        });
    });

    describe("UsuarioForm", () => {
        it("renderiza el formulario de usuario en StrictMode sin provocar bucle de re-renders", () => {
            render(
                <React.StrictMode>
                    <UsuarioForm
                        centros={mockCentros}
                        bodegas={mockBodegas}
                        roles={mockRoles}
                    />
                </React.StrictMode>
            );

            expect(screen.getByPlaceholderText("correo@cmvalparaiso.cl")).toBeInTheDocument();
            expect(screen.getByText("Bodega Farmacia")).toBeInTheDocument();
        });
    });
});

