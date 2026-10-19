"use client";

import * as React from "react";
import { useEffect, useState } from "react";

// utils
import { cn } from "@/shared/utils/cn";

export interface BodegaOption {
    id: string;
    nombre: string;
    centroId: string;
    estado?: boolean;
}

export interface BodegasMultiSelectProps {
    bodegas: BodegaOption[];
    centroIdSeleccionado?: string;
    selectedBodegaIds?: string[];
    name?: string;
    onChange?: (selectedIds: string[]) => void;
}

export function BodegasMultiSelect({
    bodegas,
    centroIdSeleccionado,
    selectedBodegaIds = [],
    name = "bodegaIds",
    onChange
}: BodegasMultiSelectProps): React.ReactElement {
    const [selected, setSelected] = useState<string[]>(selectedBodegaIds);

    // Filtrar bodegas por centro seleccionado
    const bodegasDelCentro = React.useMemo(() => {
        if (!centroIdSeleccionado) return [];
        return bodegas.filter((b) => b.centroId === centroIdSeleccionado && b.estado !== false);
    }, [bodegas, centroIdSeleccionado]);

    // Sincronizar o podar bodegas si cambia el centro seleccionado
    useEffect(() => {
        setSelected((prev) => {
            const validIds = new Set(bodegasDelCentro.map((b) => b.id));
            const filtered = prev.filter((id) => validIds.has(id));
            if (filtered.length !== prev.length) {
                onChange?.(filtered);
                return filtered;
            }
            return prev;
        });
    }, [bodegasDelCentro, onChange]);

    // Permitir actualización externa de selectedBodegaIds (por ej. al abrir modal con otro usuario)
    useEffect(() => {
        setSelected(selectedBodegaIds);
    }, [selectedBodegaIds]);

    const handleToggle = (id: string) => {
        const next = selected.includes(id)
            ? selected.filter((item) => item !== id)
            : [...selected, id];
        setSelected(next);
        onChange?.(next);
    };

    const handleSelectAll = () => {
        const allIds = bodegasDelCentro.map((b) => b.id);
        setSelected(allIds);
        onChange?.(allIds);
    };

    const handleDeselectAll = () => {
        setSelected([]);
        onChange?.([]);
    };

    if (!centroIdSeleccionado) {
        return (
            <div className="rounded-md border border-dashed p-3 text-xs text-muted-foreground">
                Selecciona un centro de salud para ver y asignar bodegas.
            </div>
        );
    }

    if (bodegasDelCentro.length === 0) {
        return (
            <div className="rounded-md border border-dashed p-3 text-xs text-muted-foreground">
                No hay bodegas registradas para el centro seleccionado.
            </div>
        );
    }

    return (
        <div className="space-y-2">
            <div className="flex items-center justify-between text-xs">
                <span className="font-medium text-muted-foreground">
                    Bodegas asignadas ({selected.length} de {bodegasDelCentro.length})
                </span>
                {bodegasDelCentro.length > 1 && (
                    <div className="flex gap-2">
                        <button
                            type="button"
                            onClick={handleSelectAll}
                            className="text-primary hover:underline"
                        >
                            Todas
                        </button>
                        <span>·</span>
                        <button
                            type="button"
                            onClick={handleDeselectAll}
                            className="text-muted-foreground hover:underline"
                        >
                            Ninguna
                        </button>
                    </div>
                )}
            </div>

            <div className="grid max-h-40 grid-cols-1 gap-2 overflow-y-auto rounded-md border p-2 sm:grid-cols-2">
                {bodegasDelCentro.map((bodega) => {
                    const isChecked = selected.includes(bodega.id);
                    return (
                        <label
                            key={bodega.id}
                            className={cn(
                                "flex items-center gap-2 rounded border px-2.5 py-1.5 text-xs transition-colors cursor-pointer select-none",
                                isChecked
                                    ? "border-primary bg-primary/10 text-primary font-medium"
                                    : "border-border hover:bg-muted/50 text-foreground"
                            )}
                        >
                            <input
                                type="checkbox"
                                name={name}
                                value={bodega.id}
                                checked={isChecked}
                                onChange={() => handleToggle(bodega.id)}
                                className="h-3.5 w-3.5 rounded border-gray-300 text-primary focus:ring-primary"
                            />
                            <span className="truncate">{bodega.nombre}</span>
                        </label>
                    );
                })}
            </div>
        </div>
    );
}
