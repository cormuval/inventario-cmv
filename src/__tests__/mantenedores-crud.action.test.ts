import { beforeEach, describe, expect, it, vi } from "vitest";

// lib
import * as authLib from "@/shared/lib/auth";
import { prisma } from "@/shared/lib/prisma";
import { AuditLogger } from "@/shared/lib/logger";

// actions
import {
    crearCentro,
    editarCentro,
    toggleEstadoCentro,
    crearBodega,
    editarBodega,
    toggleEstadoBodega,
    crearUnidad,
    editarUnidad,
    toggleEstadoUnidad
} from "@/modules/mantenedores/actions/mantenedores.action";
import { initialActionState } from "@/shared/types/action-state";

vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));
vi.mock("@/auth", () => ({ auth: vi.fn() }));

vi.mock("@/shared/lib/auth", async (importOriginal) => {
    const original = await importOriginal<typeof import("@/shared/lib/auth")>();
    return {
        ...original,
        requireSessionUser: vi.fn(),
        puedeAdministrar: vi.fn((rol: string) => rol === "R01")
    };
});

vi.mock("@/shared/lib/logger", () => ({ AuditLogger: { log: vi.fn() } }));

vi.mock("@/shared/lib/prisma", () => ({
    prisma: {
        $transaction: vi.fn((callback) => callback(prisma)),
        centro: {
            create: vi.fn(),
            update: vi.fn(),
            findUnique: vi.fn(),
            findMany: vi.fn(),
            count: vi.fn()
        },
        bodega: {
            create: vi.fn(),
            update: vi.fn(),
            findUnique: vi.fn(),
            findMany: vi.fn(),
            count: vi.fn()
        },
        usuario: {
            count: vi.fn(),
            findUnique: vi.fn()
        },
        stock: {
            findFirst: vi.fn()
        },
        unidad: {
            create: vi.fn(),
            update: vi.fn(),
            findUnique: vi.fn(),
            findMany: vi.fn()
        }
    }
}));

describe("Mantenedores CRUD - Server Actions", () => {
    const adminUser = {
        id: "admin-1",
        nombre: "Admin",
        apPaterno: "Central",
        email: "admin@cmvalparaiso.cl",
        rol: "R01",
        centroId: "centro-1",
        bodegaId: null
    };

    const operadorUser = {
        id: "operador-1",
        nombre: "Operador",
        apPaterno: "Bodega",
        email: "operador@cmvalparaiso.cl",
        rol: "R07",
        centroId: "centro-1",
        bodegaId: "b1"
    };

    beforeEach(() => {
        vi.clearAllMocks();
        vi.mocked(authLib.requireSessionUser).mockResolvedValue(adminUser);
    });

    describe("Centro CRUD", () => {
        it("crearCentro: registra centro y genera auditoría", async () => {
            vi.mocked(prisma.centro.create).mockResolvedValue({
                id: "c-nuevo",
                nombre: "CESFAM Esperanza",
                estado: true
            } as never);

            const fd = new FormData();
            fd.set("nombre", "CESFAM Esperanza");
            fd.set("estado", "on");

            const res = await crearCentro(initialActionState, fd);
            expect(res.ok).toBe(true);
            expect(res.message).toBe("Centro creado.");
            expect(AuditLogger.log).toHaveBeenCalledWith(
                expect.objectContaining({
                    accion: "crear",
                    entidad: "Centro",
                    entidadId: "c-nuevo"
                })
            );
        });

        it("editarCentro: actualiza nombre y estado exitosamente", async () => {
            vi.mocked(prisma.centro.findUnique).mockResolvedValue({
                id: "c-1",
                nombre: "CESFAM Barón",
                estado: true
            } as never);
            vi.mocked(prisma.centro.update).mockResolvedValue({
                id: "c-1",
                nombre: "CESFAM Barón Renombrado",
                estado: true
            } as never);

            const fd = new FormData();
            fd.set("id", "c-1");
            fd.set("nombre", "CESFAM Barón Renombrado");
            fd.set("estado", "true");

            const res = await editarCentro(initialActionState, fd);
            expect(res.ok).toBe(true);
            expect(res.message).toMatch(/actualizado exitosamente/i);
            expect(prisma.centro.update).toHaveBeenCalledWith({
                where: { id: "c-1" },
                data: { nombre: "CESFAM Barón Renombrado", estado: true }
            });
        });

        it("editarCentro: bloquea desactivación si el centro tiene bodegas activas (R-02)", async () => {
            vi.mocked(prisma.centro.findUnique).mockResolvedValue({
                id: "c-1",
                nombre: "CESFAM Barón",
                estado: true
            } as never);
            vi.mocked(prisma.bodega.count).mockResolvedValue(2);

            const fd = new FormData();
            fd.set("id", "c-1");
            fd.set("nombre", "CESFAM Barón");
            // estado desactivado (sin on ni true)

            const res = await editarCentro(initialActionState, fd);
            expect(res.ok).toBe(false);
            expect(res.message).toContain("contiene 2 bodega(s) activa(s). Desactívelas primero.");
            expect(prisma.centro.update).not.toHaveBeenCalled();
        });

        it("editarCentro: bloquea desactivación si el centro tiene usuarios activos (R-02)", async () => {
            vi.mocked(prisma.centro.findUnique).mockResolvedValue({
                id: "c-1",
                nombre: "CESFAM Barón",
                estado: true
            } as never);
            vi.mocked(prisma.bodega.count).mockResolvedValue(0);
            vi.mocked(prisma.usuario.count).mockResolvedValue(3);

            const fd = new FormData();
            fd.set("id", "c-1");
            fd.set("nombre", "CESFAM Barón");

            const res = await editarCentro(initialActionState, fd);
            expect(res.ok).toBe(false);
            expect(res.message).toContain("contiene 3 usuario(s) activo(s). Reasígnelos o desactívelos primero.");
            expect(prisma.centro.update).not.toHaveBeenCalled();
        });

        it("toggleEstadoCentro: activa centro inactivo sin restricciones", async () => {
            vi.mocked(prisma.centro.findUnique).mockResolvedValue({
                id: "c-inactivo",
                nombre: "CESFAM Desactivado",
                estado: false
            } as never);
            vi.mocked(prisma.centro.update).mockResolvedValue({
                id: "c-inactivo",
                nombre: "CESFAM Desactivado",
                estado: true
            } as never);

            const fd = new FormData();
            fd.set("id", "c-inactivo");
            fd.set("estado", "true");

            const res = await toggleEstadoCentro(initialActionState, fd);
            expect(res.ok).toBe(true);
            expect(res.message).toMatch(/Centro activado exitosamente/i);
            expect(prisma.centro.update).toHaveBeenCalledWith({
                where: { id: "c-inactivo" },
                data: { estado: true }
            });
        });

        it("toggleEstadoCentro: bloquea desactivación si tiene dependencias activas", async () => {
            vi.mocked(prisma.centro.findUnique).mockResolvedValue({
                id: "c-1",
                nombre: "CESFAM Barón",
                estado: true
            } as never);
            vi.mocked(prisma.bodega.count).mockResolvedValue(1);

            const fd = new FormData();
            fd.set("id", "c-1");
            fd.set("estado", "false");

            const res = await toggleEstadoCentro(initialActionState, fd);
            expect(res.ok).toBe(false);
            expect(res.message).toContain("contiene 1 bodega(s) activa(s)");
        });

        it("rechaza usuarios no R01 en operaciones de Centro", async () => {
            vi.mocked(authLib.requireSessionUser).mockResolvedValue(operadorUser);

            const fd = new FormData();
            fd.set("id", "c-1");
            fd.set("nombre", "CESFAM Barón");

            const resEdit = await editarCentro(initialActionState, fd);
            expect(resEdit.ok).toBe(false);
            expect(resEdit.message).toContain("Solo administradores");

            const resToggle = await toggleEstadoCentro(initialActionState, fd);
            expect(resToggle.ok).toBe(false);
            expect(resToggle.message).toContain("Solo administradores");
        });
    });

    describe("Bodega CRUD", () => {
        it("crearBodega: crea bodega asociada al centro", async () => {
            vi.mocked(prisma.bodega.create).mockResolvedValue({
                id: "b-nueva",
                nombre: "Bodega Vacunatorio",
                centroId: "c-1",
                estado: true
            } as never);

            const fd = new FormData();
            fd.set("nombre", "Bodega Vacunatorio");
            fd.set("centroId", "c-1");
            fd.set("estado", "on");

            const res = await crearBodega(initialActionState, fd);
            expect(res.ok).toBe(true);
            expect(res.message).toBe("Bodega creada.");
            expect(AuditLogger.log).toHaveBeenCalledWith(
                expect.objectContaining({
                    accion: "crear",
                    entidad: "Bodega",
                    entidadId: "b-nueva"
                })
            );
        });

        it("editarBodega: actualiza datos correctamente", async () => {
            vi.mocked(prisma.bodega.findUnique).mockResolvedValue({
                id: "b-1",
                nombre: "Bodega Farmacia",
                centroId: "c-1",
                estado: true
            } as never);
            vi.mocked(prisma.bodega.update).mockResolvedValue({
                id: "b-1",
                nombre: "Bodega Farmacia Principal",
                centroId: "c-1",
                estado: true
            } as never);

            const fd = new FormData();
            fd.set("id", "b-1");
            fd.set("nombre", "Bodega Farmacia Principal");
            fd.set("centroId", "c-1");
            fd.set("estado", "true");

            const res = await editarBodega(initialActionState, fd);
            expect(res.ok).toBe(true);
            expect(res.message).toMatch(/actualizada exitosamente/i);
        });

        it("editarBodega: bloquea desactivación si tiene stock disponible positivo (R-03)", async () => {
            vi.mocked(prisma.bodega.findUnique).mockResolvedValue({
                id: "b-1",
                nombre: "Bodega Farmacia",
                centroId: "c-1",
                estado: true
            } as never);
            vi.mocked(prisma.stock.findFirst).mockResolvedValue({
                id: "stk-1",
                bodegaId: "b-1",
                cantidadDisponible: 15
            } as never);

            const fd = new FormData();
            fd.set("id", "b-1");
            fd.set("nombre", "Bodega Farmacia");
            fd.set("centroId", "c-1");
            // estado desactivado

            const res = await editarBodega(initialActionState, fd);
            expect(res.ok).toBe(false);
            expect(res.message).toContain("mantiene existencias de stock disponibles");
            expect(prisma.bodega.update).not.toHaveBeenCalled();
        });

        it("toggleEstadoBodega: desactiva bodega si no mantiene existencias de stock", async () => {
            vi.mocked(prisma.bodega.findUnique).mockResolvedValue({
                id: "b-1",
                nombre: "Bodega Farmacia",
                centroId: "c-1",
                estado: true
            } as never);
            vi.mocked(prisma.stock.findFirst).mockResolvedValue(null);

            const fd = new FormData();
            fd.set("id", "b-1");
            fd.set("estado", "false");

            const res = await toggleEstadoBodega(initialActionState, fd);
            expect(res.ok).toBe(true);
            expect(res.message).toMatch(/Bodega desactivada exitosamente/i);
            expect(prisma.bodega.update).toHaveBeenCalledWith({
                where: { id: "b-1" },
                data: { estado: false }
            });
        });
    });

    describe("Unidad CRUD", () => {
        it("crearUnidad: registra unidad con estado activo por defecto", async () => {
            vi.mocked(prisma.unidad.create).mockResolvedValue({
                id: "u-nueva",
                descripcion: "Box Odontológico",
                estado: true
            } as never);

            const fd = new FormData();
            fd.set("descripcion", "Box Odontológico");

            const res = await crearUnidad(initialActionState, fd);
            expect(res.ok).toBe(true);
            expect(res.message).toBe("Unidad creada.");
        });

        it("crearUnidad: traduce código P2002 a mensaje amigable de duplicado (R-04)", async () => {
            vi.mocked(prisma.unidad.create).mockRejectedValue({
                code: "P2002",
                clientVersion: "6.0.0"
            });

            const fd = new FormData();
            fd.set("descripcion", "Caja");

            const res = await crearUnidad(initialActionState, fd);
            expect(res.ok).toBe(false);
            expect(res.message).toBe("Ya existe una unidad con esa descripción.");
        });

        it("editarUnidad: actualiza descripción y estado", async () => {
            vi.mocked(prisma.unidad.findUnique).mockResolvedValue({
                id: "u-1",
                descripcion: "Box 1",
                estado: true
            } as never);
            vi.mocked(prisma.unidad.update).mockResolvedValue({
                id: "u-1",
                descripcion: "Box 1 Médico",
                estado: true
            } as never);

            const fd = new FormData();
            fd.set("id", "u-1");
            fd.set("descripcion", "Box 1 Médico");
            fd.set("estado", "true");

            const res = await editarUnidad(initialActionState, fd);
            expect(res.ok).toBe(true);
            expect(res.message).toMatch(/Unidad actualizada exitosamente/i);
        });

        it("toggleEstadoUnidad: alterna estado lógico sin borrado físico (R-01)", async () => {
            vi.mocked(prisma.unidad.findUnique).mockResolvedValue({
                id: "u-1",
                descripcion: "Box 1",
                estado: true
            } as never);

            const fd = new FormData();
            fd.set("id", "u-1");
            fd.set("estado", "false");

            const res = await toggleEstadoUnidad(initialActionState, fd);
            expect(res.ok).toBe(true);
            expect(res.message).toMatch(/Unidad desactivada exitosamente/i);
            expect(prisma.unidad.update).toHaveBeenCalledWith({
                where: { id: "u-1" },
                data: { estado: false }
            });
        });
    });
});
