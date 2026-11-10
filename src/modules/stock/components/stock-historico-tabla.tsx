import type * as React from "react";

// utils
import type { MovimientoHistorico, TipoMovimientoHistorico } from "@/modules/stock/utils/stock-historico-consulta";

interface StockHistoricoTablaProps {
    movimientos: MovimientoHistorico[];
    saldoInicial: number;
}

function renderBadgeTipo(tipo: TipoMovimientoHistorico): React.ReactElement {
    switch (tipo) {
        case "ENTRADA":
            return (
                <span className="inline-flex items-center rounded-full bg-emerald-100 px-2.5 py-0.5 text-xs font-medium text-emerald-800">
                    Entrada
                </span>
            );
        case "TRASPASO_ENTRADA":
            return (
                <span className="inline-flex items-center rounded-full bg-teal-100 px-2.5 py-0.5 text-xs font-medium text-teal-800">
                    Traspaso Recibido
                </span>
            );
        case "PRESTAMO_RECEPCIONADO":
            return (
                <span className="inline-flex items-center rounded-full bg-cyan-100 px-2.5 py-0.5 text-xs font-medium text-cyan-800">
                    Préstamo Recibido
                </span>
            );
        case "PRESTAMO_ANULADO":
            return (
                <span className="inline-flex items-center rounded-full bg-amber-100 px-2.5 py-0.5 text-xs font-medium text-amber-800">
                    Préstamo Anulado (Restituido)
                </span>
            );
        case "SALIDA_CONSUMO":
            return (
                <span className="inline-flex items-center rounded-full bg-slate-100 px-2.5 py-0.5 text-xs font-medium text-slate-800">
                    Consumo Interno
                </span>
            );
        case "SALIDA_MERMA":
            return (
                <span className="inline-flex items-center rounded-full bg-rose-100 px-2.5 py-0.5 text-xs font-medium text-rose-800">
                    Merma / Baja
                </span>
            );
        case "TRASPASO_SALIDA":
            return (
                <span className="inline-flex items-center rounded-full bg-purple-100 px-2.5 py-0.5 text-xs font-medium text-purple-800">
                    Traspaso Enviado
                </span>
            );
        case "PRESTAMO_EMITIDO":
            return (
                <span className="inline-flex items-center rounded-full bg-orange-100 px-2.5 py-0.5 text-xs font-medium text-orange-800">
                    Préstamo Emitido
                </span>
            );
        default:
            return (
                <span className="inline-flex items-center rounded-full bg-gray-100 px-2.5 py-0.5 text-xs font-medium text-gray-800">
                    {tipo}
                </span>
            );
    }
}

function formatearFechaHora(fecha: Date): string {
    const d = new Date(fecha);
    return d.toLocaleDateString("es-CL", {
        day: "2-digit",
        month: "2-digit",
        year: "numeric",
        hour: "2-digit",
        minute: "2-digit"
    });
}

function formatearCaducidad(fecha?: Date): string {
    if (!fecha) return "—";
    const d = new Date(fecha);
    return d.toLocaleDateString("es-CL", {
        day: "2-digit",
        month: "2-digit",
        year: "numeric"
    });
}

export function StockHistoricoTabla({ movimientos, saldoInicial }: StockHistoricoTablaProps): React.ReactElement {
    if (movimientos.length === 0) {
        return (
            <div className="rounded-lg border border-dashed p-8 text-center">
                <p className="text-sm text-muted-foreground">
                    No se registraron movimientos para este producto en el período seleccionado.
                </p>
                <p className="text-xs text-muted-foreground mt-1">
                    El saldo se mantuvo constante en {saldoInicial.toLocaleString("es-CL")} unidades.
                </p>
            </div>
        );
    }

    return (
        <div className="overflow-x-auto rounded-md border">
            <table className="w-full text-left text-sm">
                <thead className="border-b bg-muted/50 text-xs font-medium text-muted-foreground uppercase">
                    <tr>
                        <th className="px-4 py-3">Fecha y Hora</th>
                        <th className="px-4 py-3">Tipo Movimiento</th>
                        <th className="px-4 py-3">Documento / Ref</th>
                        <th className="px-4 py-3">Origen / Destino</th>
                        <th className="px-4 py-3">Lote / Caducidad</th>
                        <th className="px-4 py-3 text-right">Variación</th>
                        <th className="px-4 py-3 text-right">Saldo Resultante</th>
                    </tr>
                </thead>
                <tbody className="divide-y">
                    {movimientos.map((m) => {
                        const esIngreso = m.delta > 0;
                        return (
                            <tr key={m.id} className="hover:bg-muted/40 transition-colors">
                                <td className="px-4 py-3 whitespace-nowrap text-muted-foreground font-mono text-xs">
                                    {formatearFechaHora(m.fecha)}
                                </td>
                                <td className="px-4 py-3 whitespace-nowrap">{renderBadgeTipo(m.tipo)}</td>
                                <td className="px-4 py-3 font-mono text-xs">
                                    {m.documento}
                                    {m.observaciones ? (
                                        <p className="text-[11px] text-muted-foreground italic truncate max-w-xs">
                                            {m.observaciones}
                                        </p>
                                    ) : null}
                                </td>
                                <td className="px-4 py-3 text-xs">
                                    <div className="flex flex-col">
                                        <span className="text-muted-foreground">De: {m.origen}</span>
                                        <span className="font-medium">A: {m.destino}</span>
                                    </div>
                                </td>
                                <td className="px-4 py-3 whitespace-nowrap text-xs">
                                    <p className="font-mono">{m.lote || "S/L"}</p>
                                    <p className="text-muted-foreground text-[11px]">
                                        Vence: {formatearCaducidad(m.fechaCaducidad)}
                                    </p>
                                </td>
                                <td
                                    className={`px-4 py-3 text-right font-semibold whitespace-nowrap ${
                                        esIngreso ? "text-emerald-600" : "text-rose-600"
                                    }`}
                                >
                                    {esIngreso ? `+${m.cantidad}` : `-${m.cantidad}`}
                                </td>
                                <td className="px-4 py-3 text-right font-bold whitespace-nowrap text-foreground">
                                    {m.saldoResultante.toLocaleString("es-CL")}
                                </td>
                            </tr>
                        );
                    })}
                </tbody>
            </table>
        </div>
    );
}

