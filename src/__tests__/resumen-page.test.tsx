import type * as React from "react";
import { render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

// lib
import { obtenerAlcanceInventario } from "@/shared/lib/inventario-alcance";
import { prisma } from "@/shared/lib/prisma";

// app
import HomePage from "@/app/page";

vi.mock("@/shared/lib/inventario-alcance", () => ({
    obtenerAlcanceInventario: vi.fn()
}));

vi.mock("@/shared/lib/prisma", () => ({
    prisma: {
        ordenEntrada: { count: vi.fn() },
        ordenSalida: { count: vi.fn() },
        stock: { findMany: vi.fn() }
    }
}));

vi.mock("@/shared/components/layout/app-layout", () => ({
    AppLayout: ({ children }: { children: React.ReactNode }) => <div>{children}</div>
}));

vi.mock("@/shared/components/inventario/inventario-filtros", () => ({
    InventarioFiltros: () => <form aria-label="Filtros de inventario" />
}));

describe("Resumen de inventario", () => {
    beforeEach(() => {
        vi.clearAllMocks();
        vi.setSystemTime(new Date(2026, 10, 20, 12));
        vi.mocked(obtenerAlcanceInventario).mockResolvedValue({
            usuario: {
                id: "usuario-1",
                nombre: "Usuario",
                apPaterno: "Prueba",
                email: "usuario@cmvalparaiso.cl",
                rol: "R01",
                centroId: "centro-1",
                bodegaId: null
            },
            centros: [],
            bodegas: [],
            centroId: null,
            bodegaId: null,
            centroIds: ["centro-1"],
            bodegaIds: ["bodega-1"],
            puedeFiltrarCentro: true
        });
        vi.mocked(prisma.ordenEntrada.count).mockResolvedValue(0);
        vi.mocked(prisma.ordenSalida.count).mockResolvedValue(0);
        vi.mocked(prisma.stock.findMany).mockResolvedValue([
            {
                id: "stock-1",
                productoId: 7,
                bodegaId: "bodega-1",
                cantidadDisponible: 0,
                stockMinimo: 0,
                fechaCaducidad: new Date(2026, 10, 19),
                lote: "L-1",
                producto: { id: 7, descripcion: "Producto vencido", estado: true },
                bodega: {
                    id: "bodega-1",
                    nombre: "Bodega principal",
                    centro: { id: "centro-1", nombre: "Centro prueba" }
                }
            }
        ] as never);
    });

    afterEach(() => {
        vi.useRealTimers();
    });

    it("muestra Caducado para un producto sin stock cuya fecha ya venció", async () => {
        render(await HomePage({ searchParams: Promise.resolve({}) }));

        expect(screen.getByRole("cell", { name: "Producto vencido" })).toBeInTheDocument();
        expect(screen.getByText("Caducado")).toBeInTheDocument();
        expect(screen.queryByText(/Caducidad <= -/)).not.toBeInTheDocument();
    });
});
