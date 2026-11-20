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

export function esAlertaCaducidadResumen(item: AlertaResumenFiltrable): boolean {
    return item.tramoCaducidad !== null
        || item.alerta === "caducado"
        || item.alerta === "caducidad_proxima"
        || (item.alerta === "sin_stock" && item.diasCaducidad <= 0);
}

export function obtenerEtiquetaAlertaResumen(item: AlertaResumenFiltrable): string {
    if (item.diasCaducidad <= 0) {
        return "Caducado";
    }

    return esAlertaCaducidadResumen(item)
        ? `Caducidad <= ${item.tramoCaducidad ?? item.diasCaducidad} dias`
        : "Stock minimo";
}

function tieneAlertaOperativa(item: AlertaResumenFiltrable): boolean {
    return item.alerta === "stock_minimo" || esAlertaCaducidadResumen(item);
}

function pesoAlertaResumen(item: AlertaResumenFiltrable): number {
    return esAlertaCaducidadResumen(item) ? 0 : 1;
}
