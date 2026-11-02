import type * as React from "react";
import { render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

// actions
import { consultarSalidasProducto } from "@/modules/orden-salida/actions/salidas-producto.action";

// app
import SalidasPorProductoPage from "@/app/salidas/por-producto/page";

vi.mock("@/modules/orden-salida/actions/salidas-producto.action", () => ({
    consultarSalidasProducto: vi.fn(),
    buscarProductosAction: vi.fn()
}));
vi.mock("next/navigation", () => ({ useRouter: () => ({ push: vi.fn() }) }));
vi.mock("@/shared/components/layout/app-layout", () => ({
    AppLayout: ({ children }: { children: React.ReactNode }) => <div>{children}</div>
}));
vi.mock("@/modules/orden-salida/components/salidas-producto-tabla", () => ({ SalidasProductoTabla: () => null }));
vi.mock("@/shared/components/inventario/inventario-filtros", () => ({
    InventarioFiltros: ({ action }: { action: string }) => <p data-testid="accion-filtros">{action}</p>
}));

describe("SalidasPorProductoPage", () => {
    it("conserva el producto en la ruta de los filtros, también al limpiar", async () => {
        vi.mocked(consultarSalidasProducto).mockResolvedValue({
            producto: { id: 7, descripcion: "Guantes M", linea: "INSUMOS" },
            total: 0,
            porBodega: [],
            porTipo: [],
            lineas: [],
            paginacion: { pagina: 1, paginasTotales: 1, total: 0, skip: 0, tamano: 50, desde: 0, hasta: 0 },
            centros: [],
            bodegas: [],
            centroId: null,
            bodegaId: null,
            puedeFiltrarCentro: false
        } as never);

        render(await SalidasPorProductoPage({ searchParams: Promise.resolve({ productoId: "7" }) }));

        expect(screen.getByTestId("accion-filtros")).toHaveTextContent("/salidas/por-producto?productoId=7");
    });
});
