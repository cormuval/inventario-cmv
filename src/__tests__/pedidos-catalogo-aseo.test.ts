import { beforeEach, describe, expect, it, vi } from "vitest";

// lib
import { prisma } from "@/shared/lib/prisma";

// utils
import {
    calcularSugerenciaAseo,
    clasificarStockAseo,
    obtenerCatalogoAseo,
    UMBRAL_SUGERENCIA_ASEO
} from "@/modules/pedidos/utils/catalogo-aseo";

vi.mock("@/shared/lib/prisma", () => ({
    prisma: {
        producto: { findMany: vi.fn() },
        bodega: { findMany: vi.fn() },
        stock: { groupBy: vi.fn() },
        pedidoPlantillaAseo: { findMany: vi.fn() }
    }
}));

describe("reglas del catálogo de aseo (INV-21)", () => {
    it("usa un umbral fijo de 10 unidades", () => {
        expect(UMBRAL_SUGERENCIA_ASEO).toBe(10);
    });

    it("clasifica rojo en 0, amarillo bajo 10 y verde desde 10", () => {
        expect(clasificarStockAseo(0)).toBe("sin_stock");
        expect(clasificarStockAseo(-2)).toBe("sin_stock");
        expect(clasificarStockAseo(1)).toBe("bajo_umbral");
        expect(clasificarStockAseo(9)).toBe("bajo_umbral");
        expect(clasificarStockAseo(10)).toBe("ok");
    });

    it("sugiere la cantidad habitual o lo que falta para 10, solo bajo el umbral", () => {
        expect(calcularSugerenciaAseo(3, 0)).toBe(7);
        expect(calcularSugerenciaAseo(0, 0)).toBe(10);
        expect(calcularSugerenciaAseo(3, 24)).toBe(24);
        expect(calcularSugerenciaAseo(10, 24)).toBe(0);
    });
});

describe("obtenerCatalogoAseo (INV-19, INV-21)", () => {
    beforeEach(() => {
        vi.clearAllMocks();
        vi.mocked(prisma.pedidoPlantillaAseo.findMany).mockResolvedValue([] as never);
    });

    it("lista solo productos activos de aseo y suma lotes vigentes con saldo", async () => {
        vi.mocked(prisma.producto.findMany).mockResolvedValue([
            { id: 1, descripcion: "Cloro 5L" },
            { id: 2, descripcion: "Jabón líquido 1L" },
            { id: 3, descripcion: "Papel higiénico" }
        ] as never);
        vi.mocked(prisma.bodega.findMany).mockResolvedValue([{ id: "b1" }, { id: "b2" }] as never);
        vi.mocked(prisma.stock.groupBy).mockResolvedValue([
            { productoId: 2, _sum: { cantidadDisponible: 5 } },
            { productoId: 3, _sum: { cantidadDisponible: 30 } }
        ] as never);

        const catalogo = await obtenerCatalogoAseo({ centroId: "c1" });

        expect(prisma.producto.findMany).toHaveBeenCalledWith(expect.objectContaining({ where: { linea: "ASEO", estado: true } }));
        const filtroStock = vi.mocked(prisma.stock.groupBy).mock.calls[0][0] as { where: Record<string, unknown> };
        expect(filtroStock.where).toMatchObject({
            bodegaId: { in: ["b1", "b2"] },
            cantidadDisponible: { gt: 0 },
            fechaCaducidad: { gt: expect.any(Date) }
        });
        expect(catalogo.map((item) => [item.productoId, item.estadoStock, item.sugerido, item.sugerencia])).toEqual([
            [1, "sin_stock", true, 10],
            [2, "bajo_umbral", true, 5],
            [3, "ok", false, 0]
        ]);
    });

    it("con bodega seleccionada consulta solo esa bodega y usa la plantilla del centro", async () => {
        vi.mocked(prisma.producto.findMany).mockResolvedValue([{ id: 1, descripcion: "Cloro 5L" }] as never);
        vi.mocked(prisma.stock.groupBy).mockResolvedValue([{ productoId: 1, _sum: { cantidadDisponible: 2 } }] as never);
        vi.mocked(prisma.pedidoPlantillaAseo.findMany).mockResolvedValue([{ productoId: 1, cantidadHabitual: 40 }] as never);

        const [item] = await obtenerCatalogoAseo({ centroId: "c1", bodegaId: "b9" });

        expect(prisma.bodega.findMany).not.toHaveBeenCalled();
        expect(item).toMatchObject({ cantidadHabitual: 40, sugerencia: 40, sugerido: true });
    });
});
