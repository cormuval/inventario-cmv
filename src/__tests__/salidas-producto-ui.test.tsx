import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { toast } from "sonner";
import { beforeEach, describe, expect, it, vi } from "vitest";

// actions
import { buscarProductosAction } from "@/modules/orden-salida/actions/salidas-producto.action";

// components
import { BuscadorProducto } from "@/modules/orden-salida/components/buscador-producto";
import { SalidasProductoResumen } from "@/modules/orden-salida/components/salidas-producto-resumen";

const push = vi.fn();

vi.mock("next/navigation", () => ({ useRouter: () => ({ push }) }));
vi.mock("@/modules/orden-salida/actions/salidas-producto.action", () => ({ buscarProductosAction: vi.fn() }));
vi.mock("sonner", () => ({ toast: { error: vi.fn(), success: vi.fn() } }));

describe("BuscadorProducto", () => {
    beforeEach(() => {
        vi.clearAllMocks();
    });

    it("sugiere productos y navega conservando los filtros", async () => {
        vi.mocked(buscarProductosAction).mockResolvedValue([{ id: 7, descripcion: "Guantes M", linea: "INSUMOS" }]);

        render(<BuscadorProducto productoActual={null} parametros={{ desde: "2026-10-01", hasta: "2026-10-30" }} />);
        fireEvent.change(screen.getByLabelText("Buscar producto"), { target: { value: "guan" } });

        const opcion = await screen.findByRole("option", { name: /Guantes M/ });
        expect(buscarProductosAction).toHaveBeenCalledWith("guan");

        fireEvent.click(opcion);
        expect(push).toHaveBeenCalledWith("/salidas/por-producto?desde=2026-10-01&hasta=2026-10-30&productoId=7");
    });

    it("no busca con un solo carácter", async () => {
        render(<BuscadorProducto productoActual={null} parametros={{}} />);
        fireEvent.change(screen.getByLabelText("Buscar producto"), { target: { value: "g" } });

        await new Promise((resolver) => setTimeout(resolver, 400));
        expect(buscarProductosAction).not.toHaveBeenCalled();
    });
});

describe("BuscadorProducto: estados de la búsqueda", () => {
    beforeEach(() => {
        vi.clearAllMocks();
    });

    it("quita 'Buscando…' al borrar el texto con una búsqueda en curso", async () => {
        vi.mocked(buscarProductosAction).mockReturnValue(new Promise(() => undefined));

        render(<BuscadorProducto productoActual={null} parametros={{}} />);
        const campo = screen.getByLabelText("Buscar producto");
        fireEvent.change(campo, { target: { value: "guan" } });
        await screen.findByText("Buscando…");

        fireEvent.change(campo, { target: { value: "g" } });

        await waitFor(() => expect(screen.queryByText("Buscando…")).toBeNull());
    });

    it("avisa si la búsqueda falla", async () => {
        vi.mocked(buscarProductosAction).mockRejectedValue(new Error("503"));

        render(<BuscadorProducto productoActual={null} parametros={{}} />);
        fireEvent.change(screen.getByLabelText("Buscar producto"), { target: { value: "guan" } });

        await waitFor(() => expect(toast.error).toHaveBeenCalledWith("No fue posible buscar productos."));
        expect(screen.queryByText("Buscando…")).toBeNull();
    });
});

describe("SalidasProductoResumen", () => {
    it("muestra el total y los desgloses", () => {
        render(
            <SalidasProductoResumen
                total={1500}
                porBodega={[{ clave: "b1", etiqueta: "Farmacia", cantidad: 1500 }]}
                porTipo={[{ clave: "Consumo Interno", etiqueta: "Consumo Interno", cantidad: 1500 }]}
            />
        );

        expect(screen.getAllByText("1.500").length).toBeGreaterThanOrEqual(3);
        expect(screen.getByText("Farmacia")).toBeInTheDocument();
        expect(screen.getByText("Consumo Interno")).toBeInTheDocument();
    });
});
