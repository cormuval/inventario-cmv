import { beforeEach, describe, expect, it, vi } from "vitest";

// lib
import { prisma } from "@/shared/lib/prisma";

// utils
import { obtenerCatalogoAseo } from "@/modules/pedidos/utils/catalogo-aseo";

vi.mock("@/shared/lib/prisma", () => ({
    prisma: {
        producto: { findMany: vi.fn() },
        bodega: { findMany: vi.fn() },
        stock: { findMany: vi.fn() },
        pedidoPlantillaAseo: { findMany: vi.fn() }
    }
}));

describe("obtenerCatalogoAseo (INV-19, INV-21)", () => {
    beforeEach(() => {
        vi.clearAllMocks();
    });

    it("filtra exclusivamente productos de la línea ASEO activos", async () => {
        vi.mocked(prisma.producto.findMany).mockResolvedValue([
            { id: 1, descripcion: "Cloro 5L", linea: "ASEO" },
            { id: 2, descripcion: "Detergente 5L", linea: "ASEO" }
        ] as never);
        vi.mocked(prisma.bodega.findMany).mockResolvedValue([{ id: "b1" }] as never);
        vi.mocked(prisma.stock.findMany).mockResolvedValue([] as never);
        vi.mocked(prisma.pedidoPlantillaAseo.findMany).mockResolvedValue([] as never);

        const catalogo = await obtenerCatalogoAseo({ centroId: "c1" });

        expect(catalogo).toHaveLength(2);
        expect(prisma.producto.findMany).toHaveBeenCalledWith(
            expect.objectContaining({
                where: { linea: "ASEO", estado: true }
            })
        );
    });

    it("evalúa semáforos de stock: sin_stock (rojo), bajo_minimo (amarillo), ok (verde)", async () => {
        vi.mocked(prisma.producto.findMany).mockResolvedValue([
            { id: 1, descripcion: "Cloro 5L", linea: "ASEO" },
            { id: 2, descripcion: "Jabón Líquido 1L", linea: "ASEO" },
            { id: 3, descripcion: "Papel Higiénico", linea: "ASEO" }
        ] as never);
        vi.mocked(prisma.bodega.findMany).mockResolvedValue([{ id: "b1" }] as never);
        vi.mocked(prisma.stock.findMany).mockResolvedValue([
            { productoId: 1, cantidadDisponible: 0, stockMinimo: 10 },    // sin stock
            { productoId: 2, cantidadDisponible: 5, stockMinimo: 10 },    // bajo mínimo
            { productoId: 3, cantidadDisponible: 30, stockMinimo: 10 }    // ok
        ] as never);
        vi.mocked(prisma.pedidoPlantillaAseo.findMany).mockResolvedValue([] as never);

        const catalogo = await obtenerCatalogoAseo({ centroId: "c1" });

        expect(catalogo[0].estadoStock).toBe("sin_stock");
        expect(catalogo[0].sugerencia).toBe(20); // 10 * 2 - 0 = 20

        expect(catalogo[1].estadoStock).toBe("bajo_minimo");
        expect(catalogo[1].sugerencia).toBe(15); // 10 * 2 - 5 = 15

        expect(catalogo[2].estadoStock).toBe("ok");
        expect(catalogo[2].sugerencia).toBe(0);
    });

    it("asocia cantidades habituales de la plantilla persistida del centro (INV-20)", async () => {
        vi.mocked(prisma.producto.findMany).mockResolvedValue([
            { id: 1, descripcion: "Cloro 5L", linea: "ASEO" }
        ] as never);
        vi.mocked(prisma.bodega.findMany).mockResolvedValue([{ id: "b1" }] as never);
        vi.mocked(prisma.stock.findMany).mockResolvedValue([
            { productoId: 1, cantidadDisponible: 25, stockMinimo: 10 }
        ] as never);
        vi.mocked(prisma.pedidoPlantillaAseo.findMany).mockResolvedValue([
            { productoId: 1, cantidadHabitual: 12 }
        ] as never);

        const catalogo = await obtenerCatalogoAseo({ centroId: "c1" });

        expect(catalogo[0].cantidadHabitual).toBe(12);
        expect(catalogo[0].sugerencia).toBe(12); // Prioriza cantidad habitual de plantilla
    });
});

