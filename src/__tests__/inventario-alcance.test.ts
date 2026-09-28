import { describe, expect, it, vi, beforeEach } from "vitest";

// lib
import { obtenerAlcanceInventario, validarCentroBodegaEnAlcance } from "@/shared/lib/inventario-alcance";
import * as authLib from "@/shared/lib/auth";
import { prisma } from "@/shared/lib/prisma";

vi.mock("@/shared/lib/auth", () => ({
    requireSessionUser: vi.fn(),
    puedeOperarEntrada: vi.fn(),
    puedeOperarSalida: vi.fn()
}));

vi.mock("@/shared/lib/prisma", () => ({
    prisma: {
        centro: {
            findMany: vi.fn(),
            findFirst: vi.fn()
        },
        bodega: {
            findMany: vi.fn(),
            findFirst: vi.fn()
        },
        encargadosBodega: {
            findMany: vi.fn()
        }
    }
}));

describe("inventario-alcance", () => {
    beforeEach(() => {
        vi.clearAllMocks();
    });

    it("resuelve alcance panorámico para el Administrador (R01)", async () => {
        vi.mocked(authLib.requireSessionUser).mockResolvedValue({
            id: "user-admin",
            nombre: "Admin",
            apPaterno: "Comunal",
            email: "admin@cmvalparaiso.cl",
            rol: "R01",
            centroId: "centro-1",
            bodegaId: "bodega-1"
        });

        vi.mocked(prisma.centro.findMany).mockResolvedValue([
            { id: "centro-1", nombre: "CESFAM Barón", estado: true },
            { id: "centro-2", nombre: "CESFAM Esperanza", estado: true }
        ] as any);

        vi.mocked(prisma.bodega.findMany).mockResolvedValue([
            { id: "b1", nombre: "Bodega Farmacia Barón", centroId: "centro-1", estado: true },
            { id: "b2", nombre: "Bodega Vacunatorio Barón", centroId: "centro-1", estado: true },
            { id: "b3", nombre: "Bodega Farmacia Esperanza", centroId: "centro-2", estado: true }
        ] as any);

        const alcance = await obtenerAlcanceInventario();

        expect(alcance.puedeFiltrarCentro).toBe(true);
        expect(alcance.centros).toHaveLength(2);
        expect(alcance.centroIds).toEqual(["centro-1", "centro-2"]);
        expect(alcance.bodegas).toHaveLength(3);
    });

    it("resuelve alcance exclusivo de centro para Encargado Centro (R02)", async () => {
        vi.mocked(authLib.requireSessionUser).mockResolvedValue({
            id: "user-encargado-centro",
            nombre: "Director",
            apPaterno: "Barón",
            email: "director@cmvalparaiso.cl",
            rol: "R02",
            centroId: "centro-1",
            bodegaId: null
        });

        vi.mocked(prisma.centro.findFirst).mockResolvedValue({
            id: "centro-1",
            nombre: "CESFAM Barón",
            estado: true
        } as any);

        vi.mocked(prisma.bodega.findMany).mockResolvedValue([
            { id: "b1", nombre: "Bodega Farmacia", centroId: "centro-1", estado: true },
            { id: "b2", nombre: "Bodega Vacunatorio", centroId: "centro-1", estado: true }
        ] as any);

        const alcance = await obtenerAlcanceInventario();

        expect(alcance.puedeFiltrarCentro).toBe(false);
        expect(alcance.centroId).toBe("centro-1");
        expect(alcance.centroIds).toEqual(["centro-1"]);
        expect(alcance.bodegas).toHaveLength(2);
        expect(alcance.bodegaIds).toEqual(["b1", "b2"]);
    });

    it("resuelve bodegas asignadas uniendo EncargadosBodega y Usuario.bodegaId para roles R03/R06/R07", async () => {
        vi.mocked(authLib.requireSessionUser).mockResolvedValue({
            id: "user-operador",
            nombre: "Operador",
            apPaterno: "Salida",
            email: "operador@cmvalparaiso.cl",
            rol: "R07",
            centroId: "centro-1",
            bodegaId: "b-directa"
        });

        vi.mocked(prisma.centro.findFirst).mockResolvedValue({
            id: "centro-1",
            nombre: "CESFAM Barón",
            estado: true
        } as any);

        vi.mocked(prisma.encargadosBodega.findMany).mockResolvedValue([
            {
                id: "enc-1",
                encargadoId: "user-operador",
                centroId: "centro-1",
                bodegaId: "b-encargo",
                rolId: "R07",
                email: "operador@cmvalparaiso.cl",
                bodega: { id: "b-encargo", nombre: "Bodega Vacunatorio", centroId: "centro-1", estado: true }
            }
        ] as any);

        vi.mocked(prisma.bodega.findFirst).mockResolvedValue({
            id: "b-directa",
            nombre: "Bodega Farmacia",
            centroId: "centro-1",
            estado: true
        } as any);

        const alcance = await obtenerAlcanceInventario();

        expect(alcance.puedeFiltrarCentro).toBe(false);
        expect(alcance.centroId).toBe("centro-1");
        // Debe contener ambas bodegas
        expect(alcance.bodegas.map((b) => b.id)).toEqual(["b-directa", "b-encargo"]);
        expect(alcance.bodegaIds).toEqual(["b-directa", "b-encargo"]);
    });

    it("rechaza validación si centro o bodega están fuera del alcance", async () => {
        vi.mocked(authLib.requireSessionUser).mockResolvedValue({
            id: "user-operador",
            nombre: "Operador",
            apPaterno: "Salida",
            email: "operador@cmvalparaiso.cl",
            rol: "R07",
            centroId: "centro-1",
            bodegaId: "b1"
        });

        vi.mocked(prisma.centro.findFirst).mockResolvedValue({
            id: "centro-1",
            nombre: "CESFAM Barón",
            estado: true
        } as any);

        vi.mocked(prisma.encargadosBodega.findMany).mockResolvedValue([]);
        vi.mocked(prisma.bodega.findFirst).mockResolvedValue({
            id: "b1",
            nombre: "Bodega Farmacia",
            centroId: "centro-1",
            estado: true
        } as any);

        // Intento de operar en bodega ajena de otro centro
        await expect(validarCentroBodegaEnAlcance("centro-2", "b3")).rejects.toThrow(
            "No tienes permiso para operar en el centro o bodega seleccionada."
        );
    });
});
