"use client";

import type * as React from "react";

// actions
import type { SortDirection, StockConsolidadoVista, StockSortKey } from "@/modules/stock/actions/stock.action";

// components
import { Badge } from "@/shared/components/ui/badge";
import { SimpleModal } from "@/shared/components/ui/simple-modal";
import { Table, Td, Th } from "@/shared/components/ui/table";

// utils
import { esLoteCaducado } from "@/modules/stock/utils/movimientos";
import { formatDate, formatNumber } from "@/shared/utils/format";
import { crearHrefConParametros, type ValorParametro } from "@/shared/utils/paginacion";

interface StockTableProps {
    stocks: StockConsolidadoVista[];
    sort: StockSortKey;
    direction: SortDirection;
    parametros: Record<string, ValorParametro>;
}

const columnas: Array<{ key: StockSortKey; label: string }> = [
    { key: "centro", label: "Centro" },
    { key: "bodega", label: "Bodega" },
    { key: "producto", label: "Producto" },
    { key: "linea", label: "Linea" },
    { key: "disponible", label: "Disponible" },
    { key: "minimo", label: "Minimo" },
    { key: "alerta", label: "Alerta" }
];

export function StockTable({ stocks, sort, direction, parametros }: StockTableProps): React.ReactElement {
    return (
        <Table>
            <thead>
                <tr>
                    {columnas.map((columna) => (
                        <Th key={columna.key}>
                            <a className="inline-flex items-center gap-1 hover:text-foreground" href={crearSortHref({
                                columna: columna.key,
                                sort,
                                direction,
                                parametros
                            })}>
                                {columna.label}
                                {sort === columna.key ? (direction === "asc" ? "^" : "v") : null}
                            </a>
                        </Th>
                    ))}
                    <Th>Lotes</Th>
                </tr>
            </thead>
            <tbody>
                {stocks.map((stock) => (
                    <tr key={stock.id}>
                        <Td>{stock.centroNombre}</Td>
                        <Td>{stock.bodegaNombre}</Td>
                        <Td>
                            <div className="space-y-0.5">
                                <p className="font-medium">{stock.productoDescripcion}</p>
                                <p className="text-xs text-muted-foreground">ID: {stock.productoId}</p>
                            </div>
                        </Td>
                        <Td>{stock.linea}</Td>
                        <Td>{formatNumber(stock.cantidadDisponible)}</Td>
                        <Td>{formatNumber(stock.stockMinimo)}</Td>
                        <Td>
                            <Badge tone={alertaTone(stock.alerta)}>{alertaLabel(stock.alerta)}</Badge>
                        </Td>
                        <Td>
                            <SimpleModal title={`Lotes: ${stock.productoDescripcion}`} triggerLabel={`Ver lotes (${stock.lotes.length})`}>
                                <Table>
                                    <thead>
                                        <tr>
                                            <Th>Lote</Th>
                                            <Th>Caducidad</Th>
                                            <Th>Disponible</Th>
                                            <Th>Estado</Th>
                                        </tr>
                                    </thead>
                                    <tbody>
                                        {stock.lotes.map((lote) => {
                                            const caducado = esLoteCaducado(lote.fechaCaducidad);
                                            return (
                                                <tr key={lote.id}>
                                                    <Td>{lote.lote}</Td>
                                                    <Td>{formatDate(lote.fechaCaducidad)}</Td>
                                                    <Td>{formatNumber(lote.cantidadDisponible)}</Td>
                                                    <Td>
                                                        <Badge tone={caducado ? "danger" : "success"}>
                                                            {caducado ? "Caducado" : "Vigente"}
                                                        </Badge>
                                                    </Td>
                                                </tr>
                                            );
                                        })}
                                        {stock.lotes.length === 0 ? (
                                            <tr>
                                                <Td colSpan={4} className="text-muted-foreground">
                                                    Sin detalle de lotes.
                                                </Td>
                                            </tr>
                                        ) : null}
                                    </tbody>
                                </Table>
                            </SimpleModal>
                        </Td>
                    </tr>
                ))}
                {stocks.length === 0 ? (
                    <tr>
                        <Td colSpan={8} className="text-muted-foreground">
                            No hay stock disponible para los filtros seleccionados.
                        </Td>
                    </tr>
                ) : null}
            </tbody>
        </Table>
    );
}

function crearSortHref(input: {
    columna: StockSortKey;
    sort: StockSortKey;
    direction: SortDirection;
    parametros: Record<string, ValorParametro>;
}): string {
    const direction = input.sort === input.columna && input.direction === "asc" ? "desc" : "asc";

    // Cambiar el orden vuelve a la página 1 (no se incluye `pagina`)
    return crearHrefConParametros("/stock", { ...input.parametros, sort: input.columna, direction });
}

function alertaTone(alerta: string): "success" | "warning" | "danger" | "muted" {
    if (alerta === "sin_stock" || alerta === "caducado") {
        return "danger";
    }
    if (alerta === "stock_minimo" || alerta === "caducidad_proxima") {
        return "warning";
    }
    return "success";
}

function alertaLabel(alerta: string): string {
    const labels: Record<string, string> = {
        sin_stock: "Sin stock",
        caducado: "Caducado (Merma)",
        stock_minimo: "Stock minimo",
        caducidad_proxima: "Caducidad proxima",
        ok: "OK"
    };
    return labels[alerta] ?? "OK";
}
