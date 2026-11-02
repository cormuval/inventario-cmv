import { beforeEach, describe, expect, it, vi } from "vitest";

// lib
import * as authLib from "@/shared/lib/auth";
import { prisma } from "@/shared/lib/prisma";

// actions
import { listarStockConsolidado } from "@/modules/stock/actions/stock.action";

vi.mock("@/auth", () => ({ auth: vi.fn() }));

vi.mock("@/shared/lib/auth", async (importOriginal) => {
    const original = await importOriginal<typeof import("@/shared/lib/auth")>();
    return { ...original, requireSessionUser: vi.fn() };
});

vi.mock("@/shared/lib/prisma", () => ({
    prisma: {
        $queryRaw: vi.fn(),
        centro: { findMany: vi.fn() },
        bodega: { findMany: vi.fn() },
        producto: { findMany: vi.fn() },
        stock: { findMany: vi.fn() }
    }
}));

describe("listarStockConsolidado paginado", () => {
    beforeEach(() => {
        vi.clearAllMocks();
        vi.mocked(authLib.requireSessionUser).mockResolvedValue({
            id: "user-admin",
            nombre: "Admin",
            apPaterno: "Comunal",
            email: "admin@cmvalparaiso.cl",
            rol: "R01",
            centroId: "c1",
            bodegaId: null
        });
        vi.mocked(prisma.centro.findMany).mockResolvedValue([{ id: "c1", nombre: "CESFAM Barón", estado: true }] as never);
        vi.mocked(prisma.bodega.findMany).mockResolvedValue([{ id: "b1", nombre: "Farmacia", centroId: "c1", estado: true }] as never);
        vi.mocked(prisma.producto.findMany).mockResolvedValue([{ linea: "DENTAL" }, { linea: "INSUMOS" }] as never);
    });

    it("cuenta, pagina y pide los lotes solo de las filas visibles", async () => {
        vi.mocked(prisma.$queryRaw)
            .mockResolvedValueOnce([{ total: BigInt(120) }] as never)
            .mockResolvedValueOnce([{
                productoId: 7,
                bodegaId: "b1",
                productoDescripcion: "Guantes M",
                linea: "INSUMOS",
                bodegaNombre: "Farmacia",
                centroId: "c1",
                centroNombre: "CESFAM Barón",
                cantidad: BigInt(5),
                caducidadMinima: new Date("2027-01-01T00:00:00.000Z")
            }] as never);
        vi.mocked(prisma.stock.findMany).mockResolvedValue([]);

        const resultado = await listarStockConsolidado({ pagina: 3, linea: "INSUMOS" });

        expect(resultado.paginacion).toMatchObject({ pagina: 3, total: 120, paginasTotales: 3 });
        expect(resultado.lineas).toEqual(["DENTAL", "INSUMOS"]);
        expect(resultado.stocks).toHaveLength(1);
        expect(prisma.stock.findMany).toHaveBeenCalledWith(expect.objectContaining({
            where: { OR: [{ productoId: 7, bodegaId: "b1" }] }
        }));
    });
});
