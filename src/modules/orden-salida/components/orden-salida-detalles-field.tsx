"use client";

import React, { useEffect, useMemo, useState } from "react";
import type { Stock } from "@prisma/client";
import { Plus, Trash2 } from "lucide-react";

// components
import { Button } from "@/shared/components/ui/button";
import { Combobox } from "@/shared/components/ui/combobox";
import { Input } from "@/shared/components/ui/input";

// utils
import { esLoteCaducado } from "@/modules/stock/utils/movimientos";
import { formatDate, toDateInputValue } from "@/shared/utils/format";

interface StockDisponible extends Stock {
    producto: {
        descripcion: string;
    };
    bodega: {
        nombre: string;
    };
}

interface DetalleSalidaRow {
    id: number;
    stockId: string;
    productoId: string;
    lote: string;
    fechaCaducidad: string;
    disponible: number | null;
}

export function OrdenSalidaDetallesField({
    bodegaId,
    stocks,
    tipoSalida = "Consumo Interno"
}: {
    bodegaId: string;
    stocks: StockDisponible[];
    tipoSalida?: string;
}): React.ReactElement {
    const [nextId, setNextId] = useState(2);
    const [detalles, setDetalles] = useState<DetalleSalidaRow[]>([crearDetalleInicial(1)]);
    const esMerma = tipoSalida.trim().toLowerCase() === "merma";

    const stocksFiltrados = useMemo(() => {
        return stocks.filter((stock) => {
            if (stock.bodegaId !== bodegaId) {
                return false;
            }
            if (stock.cantidadDisponible <= 0) {
                return false;
            }
            if (!esMerma && esLoteCaducado(stock.fechaCaducidad)) {
                return false;
            }
            return true;
        });
    }, [bodegaId, stocks, esMerma]);

    const opciones = useMemo(() => stocksFiltrados.map((stock) => {
        const fechaFormat = toDateInputValue(stock.fechaCaducidad);
        return {
            value: String(stock.id),
            label: crearStockLabel(stock),
            keywords: [stock.lote, stock.producto.descripcion, String(stock.productoId)],
            productoId: String(stock.productoId),
            lote: stock.lote,
            fechaCaducidad: fechaFormat,
            disponible: stock.cantidadDisponible
        };
    }), [stocksFiltrados]);
    const opcionesPorId = useMemo(() => new Map(opciones.map((opcion) => [opcion.value, opcion])), [opciones]);

    useEffect(() => {
        setNextId(2);
        setDetalles([crearDetalleInicial(1)]);
    }, [bodegaId, esMerma]);

    function agregarDetalle(): void {
        setDetalles((actuales) => [...actuales, crearDetalleInicial(nextId)]);
        setNextId((actual) => actual + 1);
    }

    function eliminarDetalle(id: number): void {
        setDetalles((actuales) => actuales.length === 1 ? actuales : actuales.filter((detalle) => detalle.id !== id));
    }

    function seleccionarStock(id: number, stockId: string): void {
        const opcion = opcionesPorId.get(stockId);
        setDetalles((actuales) => actuales.map((detalle) => {
            if (detalle.id !== id) {
                return detalle;
            }

            return {
                ...detalle,
                stockId,
                productoId: opcion?.productoId ?? "",
                lote: opcion?.lote ?? "",
                fechaCaducidad: opcion?.fechaCaducidad ?? "",
                disponible: opcion?.disponible ?? null
            };
        }));
    }

    return (
        <div className="space-y-3">
            {detalles.map((detalle, index) => (
                <div key={detalle.id} className="grid gap-3 rounded-md border p-3 md:grid-cols-5">
                    <label className="space-y-1 text-sm md:col-span-2">
                        <span>Producto / lote disponible</span>
                        <Combobox
                            value={detalle.stockId}
                            onChange={(value) => seleccionarStock(detalle.id, value)}
                            options={opciones}
                            placeholder="Seleccione stock disponible..."
                            searchPlaceholder="Buscar por producto o lote..."
                            emptyText="No se encontraron productos o lotes"
                        />
                        <input type="hidden" name="productoId" value={detalle.productoId} readOnly />
                        <input type="hidden" name="lote" value={detalle.lote} readOnly />
                        <input type="hidden" name="fechaCaducidad" value={detalle.fechaCaducidad} readOnly />
                    </label>
                    <label className="space-y-1 text-sm">
                        <span>Cantidad</span>
                        <Input
                            type="number"
                            name="cantidad"
                            min={1}
                            max={detalle.disponible ?? undefined}
                            defaultValue={1}
                            required
                        />
                    </label>
                    <div className="space-y-1 text-sm">
                        <span>Caducidad</span>
                        <div className="flex h-10 items-center rounded-md border bg-muted/30 px-3 text-sm text-muted-foreground">
                            {detalle.fechaCaducidad || "Seleccione stock"}
                        </div>
                    </div>
                    <div className="space-y-1 text-sm">
                        <span>Disponible</span>
                        <div className="flex h-10 items-center rounded-md border bg-muted/30 px-3 text-sm text-muted-foreground">
                            {detalle.disponible ?? "Seleccione stock"}
                        </div>
                    </div>
                    <div className="flex items-end gap-2 md:col-span-5">
                        <Button type="button" variant="outline" size="sm" onClick={agregarDetalle}>
                            <Plus className="h-4 w-4" />
                            Agregar
                        </Button>
                        <Button
                            type="button"
                            variant="ghost"
                            size="sm"
                            onClick={() => eliminarDetalle(detalle.id)}
                            disabled={detalles.length === 1}
                        >
                            <Trash2 className="h-4 w-4" />
                            Quitar
                        </Button>
                        <span className="text-xs text-muted-foreground">Detalle {index + 1}</span>
                    </div>
                </div>
            ))}
            {stocksFiltrados.length === 0 && (
                <p className="text-sm text-muted-foreground">No hay stock disponible para la bodega seleccionada.</p>
            )}
        </div>
    );
}

function crearDetalleInicial(id: number): DetalleSalidaRow {
    return {
        id,
        stockId: "",
        productoId: "",
        lote: "",
        fechaCaducidad: "",
        disponible: null
    };
}

function crearStockLabel(stock: StockDisponible): string {
    const caducado = esLoteCaducado(stock.fechaCaducidad);
    const prefijo = caducado ? "[CADUCADO] " : "";
    return `${prefijo}[Disp: ${stock.cantidadDisponible} un.] ${stock.producto.descripcion} | Lote: ${stock.lote} | Vence: ${formatDate(stock.fechaCaducidad)}`;
}
