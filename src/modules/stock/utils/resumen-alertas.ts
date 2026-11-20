import type { StockAlerta } from "@/modules/stock/utils/movimientos";

export interface AlertaResumenFiltrable {
    alerta: StockAlerta;
    tramoCaducidad: number | null;
    diasCaducidad: number;
}

export function seleccionarAlertasResumen<T extends AlertaResumenFiltrable>(items: T[], limite: number = 12): T[] {
    return items
        .filter((item) => tieneAlertaOperativa(item))
        .sort((a, b) => pesoAlertaResumen(a) - pesoAlertaResumen(b) || a.diasCaducidad - b.diasCaducidad)
        .slice(0, limite);
}

function tieneAlertaOperativa(item: AlertaResumenFiltrable): boolean {
    return item.alerta === "stock_minimo" || tieneAlertaCaducidad(item);
}

function tieneAlertaCaducidad(item: AlertaResumenFiltrable): boolean {
    return item.tramoCaducidad !== null || item.alerta === "caducado" || item.alerta === "caducidad_proxima";
}

function pesoAlertaResumen(item: AlertaResumenFiltrable): number {
    return tieneAlertaCaducidad(item) ? 0 : 1;
}
