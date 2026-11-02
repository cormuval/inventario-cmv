import { beforeEach, describe, expect, it, vi } from "vitest";

// lib
import * as authLib from "@/shared/lib/auth";
import { prisma } from "@/shared/lib/prisma";

// actions
import { listarLotesDisponibles } from "@/modules/orden-salida/actions/lotes-disponibles.action";

vi.mock("@/auth", () => ({ auth: vi.fn() }));

vi.mock("@/shared/lib/auth", async (importOriginal) => {
    const original = await importOriginal<typeof import("@/shared/lib/auth")>();
    return { ...original, requireSessionUser: vi.fn() };
});

vi.mock("@/shared/lib/prisma", () => ({
    prisma: {
        centro: { findFirst: vi.fn() },
        bodega: { findFirst: vi.fn() },
        encargadosBodega: { findMany: vi.fn() },
        stock: { findMany: vi.fn() }
    }
}));

function sesionOperadorFarmacia(): void {
    vi.mocked(authLib.requireSessionUser).mockResolvedValue({
        id: "user-operador",
        nombre: "Operador",
        apPaterno: "Farmacia",
        email: "operador@cmvalparaiso.cl",
        rol: "R07",
        centroId: "centro-1",
        bodegaId: "b1"
    });
    vi.mocked(prisma.centro.findFirst).mockResolvedValue({ id: "centro-1", nombre: "CESFAM Barón", estado: true } as never);
    vi.mocked(prisma.encargadosBodega.findMany).mockResolvedValue([]);
    vi.mocked(prisma.bodega.findFirst).mockResolvedValue({ id: "b1", nombre: "Bodega Farmacia", centroId: "centro-1", estado: true } as never);
}

describe("listarLotesDisponibles", () => {
    beforeEach(() => {
        vi.clearAllMocks();
    });

    it("devuelve solo los lotes con existencia de la bodega pedida", async () => {
        sesionOperadorFarmacia();
        vi.mocked(prisma.stock.findMany).mockResolvedValue([{ id: "s1" }] as never);

        const resultado = await listarLotesDisponibles("b1");

        expect(resultado).toEqual({ ok: true, message: "", lotes: [{ id: "s1" }] });
        expect(prisma.stock.findMany).toHaveBeenCalledWith(expect.objectContaining({
            where: { bodegaId: "b1", cantidadDisponible: { gt: 0 } }
        }));
    });

    it("rechaza una bodega fuera del alcance sin consultar el stock", async () => {
        sesionOperadorFarmacia();

        const resultado = await listarLotesDisponibles("b-ajena");

        expect(resultado).toEqual({ ok: false, message: "La bodega no está dentro de tu alcance.", lotes: [] });
        expect(prisma.stock.findMany).not.toHaveBeenCalled();
    });
});
