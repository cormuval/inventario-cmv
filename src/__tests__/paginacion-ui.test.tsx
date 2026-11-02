import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";

// components
import { ActionMessage } from "@/shared/components/ui/action-message";
import { InventarioFiltros } from "@/shared/components/inventario/inventario-filtros";
import { Paginacion } from "@/shared/components/inventario/paginacion";

// utils
import { calcularPaginacion } from "@/shared/utils/paginacion";

describe("Paginacion", () => {
    it("muestra el rango y enlaces que conservan los filtros", () => {
        render(
            <Paginacion
                ruta="/salidas/registros"
                parametros={{ desde: "2026-10-01", hasta: "2026-10-30" }}
                paginacion={calcularPaginacion(2, 1234)}
            />
        );

        expect(screen.getByText("Mostrando 51–100 de 1.234")).toBeInTheDocument();
        expect(screen.getByRole("link", { name: "Siguiente" })).toHaveAttribute(
            "href",
            "/salidas/registros?desde=2026-10-01&hasta=2026-10-30&pagina=3"
        );
        expect(screen.getByRole("link", { name: "Primera" })).toHaveAttribute(
            "href",
            "/salidas/registros?desde=2026-10-01&hasta=2026-10-30&pagina=1"
        );
    });

    it("deshabilita anterior/primera en la primera página", () => {
        render(<Paginacion ruta="/stock" parametros={{}} paginacion={calcularPaginacion(1, 10)} />);

        expect(screen.queryByRole("link", { name: "Anterior" })).not.toBeInTheDocument();
        expect(screen.getByText("Anterior")).toHaveAttribute("aria-disabled", "true");
    });
});

describe("InventarioFiltros con rango de fechas", () => {
    it("muestra desde y hasta con los valores actuales", () => {
        render(
            <InventarioFiltros
                action="/salidas/registros"
                centros={[]}
                bodegas={[]}
                centroId={null}
                bodegaId={null}
                puedeFiltrarCentro={false}
                mostrarRangoFechas
                desde="2026-10-01"
                hasta="2026-10-30"
            />
        );

        expect(screen.getByLabelText("Desde")).toHaveValue("2026-10-01");
        expect(screen.getByLabelText("Hasta")).toHaveValue("2026-10-30");
    });
});

describe("ActionMessage", () => {
    it("ofrece el enlace a los registros solo cuando la acción terminó bien", () => {
        const enlace = { href: "/salidas/registros", etiqueta: "Ver registros de salida" };
        const { rerender } = render(<ActionMessage state={{ ok: true, message: "Orden de salida registrada." }} enlaceExito={enlace} />);
        expect(screen.getByRole("link", { name: "Ver registros de salida" })).toHaveAttribute("href", "/salidas/registros");

        rerender(<ActionMessage state={{ ok: false, message: "Stock insuficiente." }} enlaceExito={enlace} />);
        expect(screen.queryByRole("link")).not.toBeInTheDocument();
    });
});
