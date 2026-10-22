import { beforeEach, describe, expect, it, vi } from "vitest";

// lib
import * as authLib from "@/shared/lib/auth";
import { prisma } from "@/shared/lib/prisma";

// actions
import {
    crearUsuario,
    editarUsuario,
    toggleEstadoUsuario
} from "@/modules/mantenedores/actions/mantenedores.action";
import { initialActionState } from "@/shared/types/action-state";

vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));
vi.mock("@/auth", () => ({ auth: vi.fn() }));

vi.mock("@/shared/lib/auth", async (importOriginal) => {
    const original = await importOriginal<typeof import("@/shared/lib/auth")>();
    return {
        ...original,
        requireSessionUser: vi.fn()
    };
});

vi.mock("@/shared/lib/logger", () => ({ AuditLogger: { log: vi.fn() } }));

vi.mock("@/shared/lib/prisma", () => ({
    prisma: {
        $transaction: vi.fn((callback) => callback(prisma)),
        usuario: {
            create: vi.fn(),
            update: vi.fn(),
            findUnique: vi.fn(),
            findMany: vi.fn()
        },
        bodega: {
            findMany: vi.fn()
        },
        encargadosBodega: {
            deleteMany: vi.fn(),
            createMany: vi.fn(),
            findMany: vi.fn()
        }
    }
}));

describe("Gestión de Usuarios - Server Actions", () => {
    const adminUser = {
        id: "admin-1",
        nombre: "Admin",
        apPaterno: "Central",
        email: "admin@cmvalparaiso.cl",
        rol: "R01",
        centroId: "centro-1",
        bodegaId: null
    };

    const targetUser = {
        id: "user-2",
        nombre: "Carlos",
        apPaterno: "Muñoz",
        email: "carlos@cmvalparaiso.cl",
        rolId: "R07",
        centroId: "centro-1",
        estado: true,
        encargos: []
    };

    beforeEach(() => {
        vi.clearAllMocks();
        vi.mocked(authLib.requireSessionUser).mockResolvedValue(adminUser);
    });

    describe("editarUsuario", () => {
        it("permite a un administrador editar los datos y asignar múltiples bodegas a un usuario", async () => {
            vi.mocked(prisma.usuario.findUnique).mockResolvedValue(targetUser as any);
            vi.mocked(prisma.bodega.findMany).mockResolvedValue([
                { id: "b1", centroId: "centro-1", estado: true } as any,
                { id: "b2", centroId: "centro-1", estado: true } as any
            ]);
            vi.mocked(prisma.usuario.update).mockResolvedValue({
                ...targetUser,
                nombre: "Carlos Modificado",
                bodegaId: "b1"
            } as any);

            const formData = new FormData();
            formData.append("id", "user-2");
            formData.append("nombre", "Carlos Modificado");
            formData.append("apPaterno", "Muñoz");
            formData.append("email", "carlos@cmvalparaiso.cl");
            formData.append("rolId", "R07");
            formData.append("centroId", "centro-1");
            formData.append("bodegaIds", "b1");
            formData.append("bodegaIds", "b2");
            formData.append("estado", "on");

            const res = await editarUsuario(initialActionState, formData);

            expect(res.ok).toBe(true);
            expect(res.message).toBe("Usuario actualizado exitosamente.");
            expect(prisma.usuario.update).toHaveBeenCalledWith(
                expect.objectContaining({
                    where: { id: "user-2" },
                    data: expect.objectContaining({
                        nombre: "Carlos Modificado",
                        bodegaId: "b1"
                    })
                })
            );
            expect(prisma.encargadosBodega.deleteMany).toHaveBeenCalledWith({
                where: { encargadoId: "user-2" }
            });
            expect(prisma.encargadosBodega.createMany).toHaveBeenCalledWith({
                data: [
                    expect.objectContaining({ encargadoId: "user-2", bodegaId: "b1", centroId: "centro-1" }),
                    expect.objectContaining({ encargadoId: "user-2", bodegaId: "b2", centroId: "centro-1" })
                ]
            });
        });

        it("rechaza si una de las bodegas seleccionadas no pertenece al centro del usuario", async () => {
            vi.mocked(prisma.usuario.findUnique).mockResolvedValue(targetUser as any);
            // Solo encuentra b1 en centro-1, b_otro es de otro centro
            vi.mocked(prisma.bodega.findMany).mockResolvedValue([
                { id: "b1", centroId: "centro-1", estado: true } as any
            ]);

            const formData = new FormData();
            formData.append("id", "user-2");
            formData.append("nombre", "Carlos");
            formData.append("apPaterno", "Muñoz");
            formData.append("email", "carlos@cmvalparaiso.cl");
            formData.append("rolId", "R07");
            formData.append("centroId", "centro-1");
            formData.append("bodegaIds", "b1");
            formData.append("bodegaIds", "b_otro");
            formData.append("estado", "on");

            const res = await editarUsuario(initialActionState, formData);

            expect(res.ok).toBe(false);
            expect(res.message).toMatch(/no están activas o no pertenecen al centro/i);
        });

        it("impide que el administrador conectado desactive su propia cuenta", async () => {
            vi.mocked(prisma.usuario.findUnique).mockResolvedValue(adminUser as any);

            const formData = new FormData();
            formData.append("id", "admin-1"); // Mismo que adminUser.id
            formData.append("nombre", "Admin");
            formData.append("apPaterno", "Central");
            formData.append("email", "admin@cmvalparaiso.cl");
            formData.append("rolId", "R01");
            formData.append("centroId", "centro-1");
            // estado desmarcado (inactivo)

            const res = await editarUsuario(initialActionState, formData);

            expect(res.ok).toBe(false);
            expect(res.message).toMatch(/no puedes desactivar tu propia cuenta/i);
        });

        it("impide que el administrador conectado degrade su propio rol de administrador", async () => {
            vi.mocked(prisma.usuario.findUnique).mockResolvedValue(adminUser as any);

            const formData = new FormData();
            formData.append("id", "admin-1");
            formData.append("nombre", "Admin");
            formData.append("apPaterno", "Central");
            formData.append("email", "admin@cmvalparaiso.cl");
            formData.append("rolId", "R07"); // Intento de quitarse rol R01
            formData.append("centroId", "centro-1");
            formData.append("estado", "on");

            const res = await editarUsuario(initialActionState, formData);

            expect(res.ok).toBe(false);
            expect(res.message).toMatch(/no puedes quitarte el rol de administrador/i);
        });
    });

    describe("toggleEstadoUsuario", () => {
        it("permite a un administrador desactivar a otro usuario", async () => {
            vi.mocked(prisma.usuario.update).mockResolvedValue({ ...targetUser, estado: false } as any);

            const formData = new FormData();
            formData.append("id", "user-2");
            formData.append("estado", "false");

            const res = await toggleEstadoUsuario(initialActionState, formData);

            expect(res.ok).toBe(true);
            expect(res.message).toBe("Usuario desactivado exitosamente.");
            expect(prisma.usuario.update).toHaveBeenCalledWith({
                where: { id: "user-2" },
                data: { estado: false }
            });
        });

        it("permite a un administrador reactivar a un usuario inactivo", async () => {
            vi.mocked(prisma.usuario.update).mockResolvedValue({ ...targetUser, estado: true } as any);

            const formData = new FormData();
            formData.append("id", "user-2");
            formData.append("estado", "true");

            const res = await toggleEstadoUsuario(initialActionState, formData);

            expect(res.ok).toBe(true);
            expect(res.message).toBe("Usuario activado exitosamente.");
            expect(prisma.usuario.update).toHaveBeenCalledWith({
                where: { id: "user-2" },
                data: { estado: true }
            });
        });

        it("impide que el administrador se auto-desactive mediante toggle", async () => {
            const formData = new FormData();
            formData.append("id", "admin-1");
            formData.append("estado", "false");

            const res = await toggleEstadoUsuario(initialActionState, formData);

            expect(res.ok).toBe(false);
            expect(res.message).toMatch(/no puedes desactivar tu propia cuenta/i);
        });
    });

    describe("Validación de Correo Institucional y Restricción Única", () => {
        it("rechaza la creación de un usuario con correo no institucional (ej: gmail.com)", async () => {
            const formData = new FormData();
            formData.append("nombre", "Pedro");
            formData.append("apPaterno", "Gómez");
            formData.append("email", "persona@gmail.com");
            formData.append("rolId", "R07");
            formData.append("centroId", "centro-1");

            const res = await crearUsuario(initialActionState, formData);

            expect(res.ok).toBe(false);
            expect(res.message).toMatch(/correo debe ser institucional/i);
        });

        it("rechaza la edición de un usuario si se ingresa un correo no institucional", async () => {
            const formData = new FormData();
            formData.append("id", "user-2");
            formData.append("nombre", "Carlos");
            formData.append("apPaterno", "Muñoz");
            formData.append("email", "persona@gmail.com");
            formData.append("rolId", "R07");
            formData.append("centroId", "centro-1");

            const res = await editarUsuario(initialActionState, formData);

            expect(res.ok).toBe(false);
            expect(res.message).toMatch(/correo debe ser institucional/i);
        });

        it("devuelve mensaje amigable cuando Prisma arroja error P2002 de correo duplicado", async () => {
            const errorP2002 = new Error("Unique constraint failed");
            (errorP2002 as any).code = "P2002";

            vi.mocked(prisma.usuario.create).mockRejectedValueOnce(errorP2002);

            const formData = new FormData();
            formData.append("nombre", "Pedro");
            formData.append("apPaterno", "Gómez");
            formData.append("email", "duplicado@cmvalparaiso.cl");
            formData.append("rolId", "R07");
            formData.append("centroId", "centro-1");

            const res = await crearUsuario(initialActionState, formData);

            expect(res.ok).toBe(false);
            expect(res.message).toBe("Ya existe un usuario con ese correo.");
        });
    });

    describe("Validación de Bodegas (Activas y Sin Duplicados)", () => {
        it("rechaza la asignación de bodegas si alguna está inactiva", async () => {
            vi.mocked(prisma.usuario.findUnique).mockResolvedValue(targetUser as any);
            // Si b2 está inactiva, findMany con estado: true solo devolverá b1
            vi.mocked(prisma.bodega.findMany).mockResolvedValue([
                { id: "b1", centroId: "centro-1", estado: true } as any
            ]);

            const formData = new FormData();
            formData.append("id", "user-2");
            formData.append("nombre", "Carlos");
            formData.append("apPaterno", "Muñoz");
            formData.append("email", "carlos@cmvalparaiso.cl");
            formData.append("rolId", "R07");
            formData.append("centroId", "centro-1");
            formData.append("bodegaIds", "b1");
            formData.append("bodegaIds", "b2"); // Inactiva
            formData.append("estado", "on");

            const res = await editarUsuario(initialActionState, formData);

            expect(res.ok).toBe(false);
            expect(res.message).toMatch(/no están activas o no pertenecen al centro/i);
        });

        it("elimina duplicados en bodegaIds y crea un solo registro por bodega en EncargadosBodega", async () => {
            vi.mocked(prisma.usuario.findUnique).mockResolvedValue(targetUser as any);
            vi.mocked(prisma.bodega.findMany).mockResolvedValue([
                { id: "b1", centroId: "centro-1", estado: true } as any
            ]);
            vi.mocked(prisma.usuario.update).mockResolvedValue({
                ...targetUser,
                bodegaId: "b1"
            } as any);

            const formData = new FormData();
            formData.append("id", "user-2");
            formData.append("nombre", "Carlos");
            formData.append("apPaterno", "Muñoz");
            formData.append("email", "carlos@cmvalparaiso.cl");
            formData.append("rolId", "R07");
            formData.append("centroId", "centro-1");
            formData.append("bodegaIds", "b1");
            formData.append("bodegaIds", "b1"); // Duplicado intencional
            formData.append("estado", "on");

            const res = await editarUsuario(initialActionState, formData);

            expect(res.ok).toBe(true);
            expect(prisma.encargadosBodega.createMany).toHaveBeenCalledWith({
                data: [
                    expect.objectContaining({ encargadoId: "user-2", bodegaId: "b1", centroId: "centro-1" })
                ]
            });
        });
    });

    describe("Auditoría Estructurada (JSON Object)", () => {
        it("registra AuditLogger.log con cambios.rolId al editar el rol", async () => {
            const { AuditLogger } = await import("@/shared/lib/logger");

            vi.mocked(prisma.usuario.findUnique).mockResolvedValue({
                ...targetUser,
                rolId: "R07",
                encargos: [{ bodegaId: "b1" }]
            } as any);
            vi.mocked(prisma.bodega.findMany).mockResolvedValue([
                { id: "b1", centroId: "centro-1", estado: true } as any
            ]);
            vi.mocked(prisma.usuario.update).mockResolvedValue({
                ...targetUser,
                rolId: "R03"
            } as any);

            const formData = new FormData();
            formData.append("id", "user-2");
            formData.append("nombre", "Carlos");
            formData.append("apPaterno", "Muñoz");
            formData.append("email", "carlos@cmvalparaiso.cl");
            formData.append("rolId", "R03"); // Cambio de rol: R07 -> R03
            formData.append("centroId", "centro-1");
            formData.append("bodegaIds", "b1");
            formData.append("estado", "on");

            await editarUsuario(initialActionState, formData);

            expect(AuditLogger.log).toHaveBeenCalledWith(
                expect.objectContaining({
                    accion: "actualizar",
                    entidad: "Usuario",
                    detalle: expect.objectContaining({
                        cambios: expect.objectContaining({
                            rolId: { antes: "R07", despues: "R03" }
                        })
                    })
                })
            );
        });

        it("registra AuditLogger.log con cambios.estado al desactivar usuario", async () => {
            const { AuditLogger } = await import("@/shared/lib/logger");

            vi.mocked(prisma.usuario.update).mockResolvedValue({ ...targetUser, estado: false } as any);

            const formData = new FormData();
            formData.append("id", "user-2");
            formData.append("estado", "false");

            await toggleEstadoUsuario(initialActionState, formData);

            expect(AuditLogger.log).toHaveBeenCalledWith(
                expect.objectContaining({
                    accion: "actualizar",
                    entidad: "Usuario",
                    detalle: {
                        cambios: {
                            estado: { antes: true, despues: false }
                        }
                    }
                })
            );
        });
    });
});

