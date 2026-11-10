import type * as React from "react";
import { describe, expect, it, vi } from "vitest";
import { render, screen } from "@testing-library/react";

// components
import { StockHistoricoBuscador } from "@/modules/stock/components/stock-historico-buscador";
import { StockHistoricoResumen } from "@/modules/stock/components/stock-historico-resumen";
import { StockHistoricoTabla } from "@/modules/stock/components/stock-historico-tabla";
import type { MovimientoHistorico } from "@/modules/stock/utils/stock-historico-consulta";

vi.mock("next/navigation", () => ({
    useRouter: () => ({ push: vi.fn() })
}));

vi.mock("@/modules/stock/actions/stock-historico.action", () => ({
    buscarProductosHistoricoAction: vi.fn()
}));

describe("StockHistoricoResumen", () => {
    it("muestra tarjetas de saldo inicial, ingresos, egresos y saldo final", () => {
        render(
            <StockHistoricoResumen
                saldoInicial={150}
                saldoFinal={180}
                totalIngresos={50}
                totalEgresos={20}
                fechaDesde="2026-10-01"
                fechaHasta="2026-10-31"
                datosCompletos={true}
            />
        );

        expect(screen.getByText("Saldo Inicial")).toBeDefined();
        expect(screen.getByText("150")).toBeDefined();
        expect(screen.getByText("+50")).toBeDefined();
        expect(screen.getByText("-20")).toBeDefined();
        expect(screen.getByText("Saldo a la Fecha")).toBeDefined();
        expect(screen.getByText("180")).toBeDefined();
        expect(screen.queryByRole("alert")).toBeNull();
    });

    it("despliega alerta cuando datosCompletos es false con el mensaje de limitación", () => {
        render(
            <StockHistoricoResumen
                saldoInicial={50}
                saldoFinal={80}
                totalIngresos={30}
                totalEgresos={0}
                fechaDesde="2026-08-01"
                fechaHasta="2026-10-31"
                datosCompletos={false}
                mensajeAdvertencia="Datos insuficientes para reconstruir el saldo con anterioridad al 15/09/2026."
            />
        );

        const alert = screen.getByRole("alert");
        expect(alert).toBeDefined();
        expect(screen.getByText("Limitación de datos históricos")).toBeDefined();
        expect(screen.getByText(/Datos insuficientes para reconstruir el saldo/)).toBeDefined();
    });
});

describe("StockHistoricoTabla", () => {
    it("muestra mensaje de estado vacío cuando no hubo movimientos en el período", () => {
        render(<StockHistoricoTabla movimientos={[]} saldoInicial={100} />);

        expect(screen.getByText(/No se registraron movimientos para este producto/)).toBeDefined();
        expect(screen.getByText(/El saldo se mantuvo constante en 100 unidades/)).toBeDefined();
    });

    it("renderiza lista de movimientos con badges, deltas y saldos acumulados", () => {
        const movimientos: MovimientoHistorico[] = [
            {
                id: "1",
                fecha: new Date("2026-10-05T12:00:00.000Z"),
                tipo: "ENTRADA",
                documento: "FAC-123",
                origen: "Cenabast",
                destino: "Farmacia Central",
                cantidad: 40,
                delta: 40,
                saldoResultante: 140,
                lote: "L-A1",
                fechaCaducidad: new Date("2027-10-05")
            },
            {
                id: "2",
                fecha: new Date("2026-10-10T15:00:00.000Z"),
                tipo: "SALIDA_MERMA",
                documento: "ORD-99",
                origen: "Farmacia Central",
                destino: "Baja Sanitaria",
                cantidad: 10,
                delta: -10,
                saldoResultante: 130,
                lote: "L-A1",
                observaciones: "Frasco quebrado"
            },
            {
                id: "3",
                fecha: new Date("2026-10-15T09:00:00.000Z"),
                tipo: "PRESTAMO_ANULADO",
                documento: "ORD-PR-5",
                origen: "CESFAM Cordillera",
                destino: "Farmacia Central",
                cantidad: 20,
                delta: 20,
                saldoResultante: 150
            }
        ];

        render(<StockHistoricoTabla movimientos={movimientos} saldoInicial={100} />);

        expect(screen.getByText("Entrada")).toBeDefined();
        expect(screen.getByText("Merma / Baja")).toBeDefined();
        expect(screen.getByText("Préstamo Anulado (Restituido)")).toBeDefined();

        expect(screen.getByText("+40")).toBeDefined();
        expect(screen.getByText("-10")).toBeDefined();
        expect(screen.getByText("+20")).toBeDefined();

        expect(screen.getByText("140")).toBeDefined();
        expect(screen.getByText("130")).toBeDefined();
        expect(screen.getByText("150")).toBeDefined();

        expect(screen.getByText("FAC-123")).toBeDefined();
        expect(screen.getByText("Frasco quebrado")).toBeDefined();
    });
});

describe("StockHistoricoBuscador", () => {
    it("muestra producto seleccionado actual si está definido", () => {
        render(
            <StockHistoricoBuscador
                productoActual={{ id: 45, descripcion: "Amoxicilina 500mg", linea: "FARMACOS" }}
                parametros={{}}
            />
        );

        expect(screen.getByText(/#45 — Amoxicilina 500mg/)).toBeDefined();
        expect(screen.getByText("FARMACOS")).toBeDefined();
    });
});
