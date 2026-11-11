import type * as React from "react";
import { describe, expect, it, vi } from "vitest";
import { render, screen } from "@testing-library/react";

// components
import { BotonDescargarPedido } from "@/modules/pedidos/components/boton-descargar-pedido";
import { PedidosTabla } from "@/modules/pedidos/components/pedidos-tabla";
import type { PedidoFilaLista } from "@/modules/pedidos/actions/consultar-pedidos.action";

vi.mock("next/navigation", () => ({
    useRouter: () => ({ refresh: vi.fn(), push: vi.fn() })
}));

vi.mock("@/modules/pedidos/actions/pedidos.action", () => ({
    descargarPedidoPdfAction: vi.fn(),
    descargarPedidoExcelAction: vi.fn(),
    revisarPedidoAction: vi.fn(),
    anularPedidoAction: vi.fn()
}));

describe("PedidosTabla (INV-18, INV-20)", () => {
    it("muestra mensaje de estado vacío cuando no hay pedidos", () => {
        render(<PedidosTabla pedidos={[]} esAdquisiciones={false} />);
        expect(screen.getByText(/No se encontraron pedidos de existencias/)).toBeDefined();
    });

    it("renderiza lista de pedidos con número, tipo, centro, estado y acciones", () => {
        const pedidosMock: PedidoFilaLista[] = [
            {
                id: "ped-1",
                numero: "PED-2026-0001",
                tipo: "MENSUAL",
                estado: "BORRADOR",
                periodo: "2026-11",
                fechaSolicitud: new Date("2026-11-01T10:00:00.000Z"),
                centroNombre: "CESFAM Barón",
                bodegaNombre: "Bodega Aseo",
                solicitanteNombre: "Juan Perez",
                totalItems: 5,
                totalUnidadesSolicitadas: 50,
                totalUnidadesAprobadas: null
            },
            {
                id: "ped-2",
                numero: "PED-2026-0002",
                tipo: "SUPLEMENTARIO",
                estado: "REVISADO",
                periodo: null,
                fechaSolicitud: new Date("2026-11-05T12:00:00.000Z"),
                centroNombre: "CESFAM Cordillera",
                bodegaNombre: null,
                solicitanteNombre: "Maria Soto",
                totalItems: 2,
                totalUnidadesSolicitadas: 20,
                totalUnidadesAprobadas: 15
            }
        ];

        render(<PedidosTabla pedidos={pedidosMock} esAdquisiciones={true} />);

        expect(screen.getByText("PED-2026-0001")).toBeDefined();
        expect(screen.getByText("MENSUAL")).toBeDefined();
        expect(screen.getByText("CESFAM Barón")).toBeDefined();
        expect(screen.getByText("Borrador")).toBeDefined();

        expect(screen.getByText("PED-2026-0002")).toBeDefined();
        expect(screen.getByText("SUPLEMENTARIO")).toBeDefined();
        expect(screen.getByText("CESFAM Cordillera")).toBeDefined();
        expect(screen.getByText("Revisado / Aprobado")).toBeDefined();
    });
});

describe("BotonDescargarPedido (INV-19, INV-23)", () => {
    it("renderiza botones de descarga para PDF y Excel", () => {
        render(<BotonDescargarPedido pedidoId="ped-1" numero="PED-2026-0001" />);

        expect(screen.getByText("PDF")).toBeDefined();
        expect(screen.getByText("Excel")).toBeDefined();
    });
});

