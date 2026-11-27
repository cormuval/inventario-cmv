import type * as React from "react";
import { render, screen } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

// actions
import { listarStockConsolidado } from "@/modules/stock/actions/stock.action";

// app
import StockPage from "@/app/stock/page";

vi.mock("@/modules/stock/actions/stock.action", () => ({
    listarStockConsolidado: vi.fn()
}));

vi.mock("@/shared/components/layout/app-layout", () => ({
    AppLayout: ({ children }: { children: React.ReactNode }) => <div>{children}</div>
}));

function resultadoStock(overrides: Record<string, unknown> = {}) {
    return {
        centros: [],
        bodegas: [],
        centroId: null,
        bodegaId: null,
        puedeFiltrarCentro: false,
        busqueda: "",
        linea: "",
        lineas: [],
        bajoMinimo: false,
        sinStock: true,
        porCaducar: false,
        sort: "producto",
        direction: "asc",
        paginacion: { pagina: 1, paginasTotales: 2, total: 51, skip: 0, tamano: 50, desde: 1, hasta: 50 },
        stocks: [],
        ...overrides
    };
}

describe("StockPage", () => {
    beforeEach(() => {
        vi.clearAllMocks();
    });

    it("envía y preserva sinStock en filtro, orden y paginación", async () => {
        vi.mocked(listarStockConsolidado).mockResolvedValue(resultadoStock() as never);

        render(await StockPage({ searchParams: Promise.resolve({ sinStock: "1", bajoMinimo: "1" }) }));

        expect(listarStockConsolidado).toHaveBeenCalledWith(expect.objectContaining({ sinStock: true, bajoMinimo: true }));
        expect(screen.getByRole("checkbox", { name: "Sin stock" })).toBeChecked();
        expect(screen.getByRole("link", { name: /Producto/ })).toHaveAttribute("href", expect.stringContaining("sinStock=1"));
        expect(screen.getByRole("link", { name: "Siguiente" })).toHaveAttribute("href", expect.stringContaining("sinStock=1"));
    });

    it("muestra y preserva sin stock para cualquier rol con acceso a la vista", async () => {
        vi.mocked(listarStockConsolidado).mockResolvedValue(resultadoStock() as never);

        render(await StockPage({ searchParams: Promise.resolve({ sinStock: "1" }) }));

        expect(listarStockConsolidado).toHaveBeenCalledWith(expect.objectContaining({ sinStock: true }));
        expect(screen.getByRole("checkbox", { name: "Sin stock" })).toBeChecked();
        expect(screen.getByRole("link", { name: /Producto/ })).toHaveAttribute("href", expect.stringContaining("sinStock=1"));
        expect(screen.getByRole("link", { name: "Siguiente" })).toHaveAttribute("href", expect.stringContaining("sinStock=1"));
    });
});
