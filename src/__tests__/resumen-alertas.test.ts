import { describe, expect, it } from "vitest";

// utils
import { seleccionarAlertasResumen, type AlertaResumenFiltrable } from "@/modules/stock/utils/resumen-alertas";

interface AlertaPrueba extends AlertaResumenFiltrable {
    id: string;
}

function alerta(
    id: string,
    valores: Partial<Omit<AlertaPrueba, "id">> = {}
): AlertaPrueba {
    return {
        id,
        alerta: "ok",
        tramoCaducidad: null,
        diasCaducidad: 120,
        ...valores
    };
}

describe("seleccionarAlertasResumen", () => {
    it("incluye alertas de stock y caducidad, pero excluye estados sin una alerta operativa", () => {
        const resultado = seleccionarAlertasResumen([
            alerta("ok-sin-tramo"),
            alerta("sin-stock-sin-tramo", { alerta: "sin_stock", diasCaducidad: 120 }),
            alerta("stock-minimo", { alerta: "stock_minimo" }),
            alerta("caducidad-proxima", { alerta: "caducidad_proxima", tramoCaducidad: 15, diasCaducidad: 8 }),
            alerta("caducado", { alerta: "caducado", diasCaducidad: -1 }),
            alerta("ok-con-tramo", { tramoCaducidad: 30, diasCaducidad: 20 }),
            alerta("sin-stock-con-tramo", { alerta: "sin_stock", tramoCaducidad: 5, diasCaducidad: 4 })
        ]);

        expect(resultado.map((item) => item.id)).toEqual([
            "caducado",
            "sin-stock-con-tramo",
            "caducidad-proxima",
            "ok-con-tramo",
            "stock-minimo"
        ]);
    });

    it("prioriza caducidad antes que stock mínimo y limita el resumen a doce alertas", () => {
        const alertasStockMinimo = Array.from({ length: 13 }, (_, indice) => alerta(`minimo-${indice + 1}`, {
            alerta: "stock_minimo",
            diasCaducidad: 120
        }));

        const resultado = seleccionarAlertasResumen([
            ...alertasStockMinimo,
            alerta("caducidad-prioritaria", { alerta: "caducidad_proxima", tramoCaducidad: 5, diasCaducidad: 3 })
        ]);

        expect(resultado).toHaveLength(12);
        expect(resultado[0]?.id).toBe("caducidad-prioritaria");
        expect(resultado.map((item) => item.id)).toContain("minimo-11");
        expect(resultado.map((item) => item.id)).not.toContain("minimo-12");
    });
});
