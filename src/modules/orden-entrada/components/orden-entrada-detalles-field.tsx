"use client";

import type * as React from "react";
import { useMemo, useState } from "react";
import type { Producto } from "@prisma/client";
import { Plus, Trash2 } from "lucide-react";

// components
import { Button } from "@/shared/components/ui/button";
import { Input } from "@/shared/components/ui/input";
import { Select } from "@/shared/components/ui/select";

// utils
import { toDateInputValue } from "@/shared/utils/format";

interface DetalleEntradaRow {
    id: number;
    productoId: string;
    linea: string;
}

export function OrdenEntradaDetallesField({ productos }: { productos: Producto[] }): React.ReactElement {
    const [nextId, setNextId] = useState(2);
    const [detalles, setDetalles] = useState<DetalleEntradaRow[]>([crearDetalleInicial(1)]);
    const productosPorId = useMemo(() => new Map(productos.map((producto) => [String(producto.id), producto])), [productos]);
    const fechaMinima = toDateInputValue();

    function agregarDetalle(): void {
        setDetalles((actuales) => [...actuales, crearDetalleInicial(nextId)]);
        setNextId((actual) => actual + 1);
    }

    function eliminarDetalle(id: number): void {
        setDetalles((actuales) => actuales.length === 1 ? actuales : actuales.filter((detalle) => detalle.id !== id));
    }

    function seleccionarProducto(id: number, productoId: string): void {
        const producto = productosPorId.get(productoId);
        setDetalles((actuales) => actuales.map((detalle) => {
            if (detalle.id !== id) {
                return detalle;
            }

            return {
                ...detalle,
                productoId,
                linea: producto?.linea ?? ""
            };
        }));
    }

    return (
        <div className="space-y-3">
            {detalles.map((detalle, index) => (
                <div key={detalle.id} className="grid gap-3 rounded-md border p-3 md:grid-cols-6">
                    <label className="space-y-1 text-sm md:col-span-2">
                        <span>Producto</span>
                        <Select
                            value={detalle.productoId}
                            onChange={(event) => seleccionarProducto(detalle.id, event.currentTarget.value)}
                            required
                        >
                            <option value="">Seleccione producto del catálogo...</option>
                            {productos.map((producto) => (
                                <option key={producto.id} value={String(producto.id)}>
                                    {crearProductoLabel(producto)}
                                </option>
                            ))}
                        </Select>
                        <input type="hidden" name="productoId" value={detalle.productoId} readOnly />
                    </label>
                    <div className="space-y-1 text-sm">
                        <span>Categoria</span>
                        <div className="flex h-10 items-center rounded-md border bg-muted/30 px-3 text-sm text-muted-foreground">
                            {detalle.linea || "Seleccione producto"}
                        </div>
                    </div>
                    <label className="space-y-1 text-sm">
                        <span>Cantidad</span>
                        <Input type="number" name="cantidad" min={1} defaultValue={1} required />
                    </label>
                    <label className="space-y-1 text-sm">
                        <span>Lote</span>
                        <Input name="lote" minLength={3} required placeholder="L-001" />
                    </label>
                    <label className="space-y-1 text-sm">
                        <span>Caducidad</span>
                        <Input type="date" name="fechaCaducidad" min={fechaMinima} required />
                    </label>
                    <div className="flex items-end gap-2 md:col-span-6">
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
        </div>
    );
}

function crearDetalleInicial(id: number): DetalleEntradaRow {
    return {
        id,
        productoId: "",
        linea: ""
    };
}

function crearProductoLabel(producto: Producto): string {
    return `${producto.descripcion} — ${producto.linea} (#${producto.id})`;
}
