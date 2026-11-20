import { beforeEach, describe, expect, it, vi } from "vitest";

// lib
import { prisma } from "@/shared/lib/prisma";

// actions
import { listarLineasProductos, listarProductosPaginados } from "@/modules/productos/actions/productos.action";

vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));
vi.mock("@/shared/lib/auth", () => ({ puedeAdministrar: vi.fn(), requireSessionUser: vi.fn() }));
vi.mock("@/shared/lib/logger", () => ({ AuditLogger: { log: vi.fn() } }));
vi.mock("@/shared/lib/prisma", () => ({
    prisma: {
        producto: { count: vi.fn(), findMany: vi.fn() }
    }
}));

describe("listarProductosPaginados", () => {
    beforeEach(() => {
        vi.clearAllMocks();
        vi.mocked(prisma.producto.count).mockResolvedValue(101);
        vi.mocked(prisma.producto.findMany).mockResolvedValue([
            { id: 42, linea: "Farmacia", descripcion: "Paracetamol", estado: true }
        ] as never);
    });

    it("consulta la página con todos los filtros normalizados y el orden estable", async () => {
        const resultado = await listarProductosPaginados({
            id: 42,
            linea: "Farmacia",
            estado: "activo",
            descripcion: "  paracetamol  ",
            pagina: 1,
            advertencias: []
        });

        const where = {
            id: 42,
            linea: "Farmacia",
            estado: true,
            descripcion: { contains: "paracetamol" }
        };
        expect(resultado.paginacion).toMatchObject({ pagina: 1, total: 101, paginasTotales: 2, tamano: 100 });
        expect(prisma.producto.count).toHaveBeenCalledWith({ where });
        expect(prisma.producto.findMany).toHaveBeenCalledWith({
            where,
            orderBy: [{ linea: "asc" }, { descripcion: "asc" }, { id: "asc" }],
            skip: 0,
            take: 100
        });
    });

    it("normaliza una página fuera de rango antes de consultar", async () => {
        await listarProductosPaginados({
            id: null,
            linea: "",
            estado: "todos",
            descripcion: "",
            pagina: 99,
            advertencias: []
        });

        expect(prisma.producto.count).toHaveBeenCalledWith({ where: {} });
        expect(prisma.producto.findMany).toHaveBeenCalledWith({
            where: {},
            orderBy: [{ linea: "asc" }, { descripcion: "asc" }, { id: "asc" }],
            skip: 100,
            take: 100
        });
    });
});

describe("listarLineasProductos", () => {
    it("obtiene las líneas distintas ordenadas para el selector", async () => {
        vi.mocked(prisma.producto.findMany).mockResolvedValue([
            { linea: "Aseo" },
            { linea: "Farmacia" }
        ] as never);

        await expect(listarLineasProductos()).resolves.toEqual(["Aseo", "Farmacia"]);
        expect(prisma.producto.findMany).toHaveBeenCalledWith({
            distinct: ["linea"],
            select: { linea: true },
            orderBy: { linea: "asc" }
        });
    });
});
