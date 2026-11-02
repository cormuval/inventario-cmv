import type * as React from "react";

// components
import { Button } from "@/shared/components/ui/button";
import { Input } from "@/shared/components/ui/input";
import { Select } from "@/shared/components/ui/select";

// utils
import type { NodoCentro } from "@/modules/reporte/utils/arbol";
import type { FiltrosReporte } from "@/modules/reporte/utils/periodo";

interface FiltrosReporteFormProps {
    filtros: FiltrosReporte;
    arbol: NodoCentro[];
    centroId: string | null;
    bodegaId: string | null;
    variante: "movil" | "escritorio";
}

export function FiltrosReporteForm({ filtros, arbol, centroId, bodegaId, variante }: FiltrosReporteFormProps): React.ReactElement {
    const nodoActual = bodegaId ? `b:${bodegaId}` : centroId ? `c:${centroId}` : "";

    return (
        <form action="/reporte" className="grid gap-3 md:grid-cols-2 xl:grid-cols-5">
            {variante === "escritorio" ? (
                <>
                    {centroId ? <input type="hidden" name="centroId" value={centroId} /> : null}
                    {bodegaId ? <input type="hidden" name="bodegaId" value={bodegaId} /> : null}
                </>
            ) : (
                <label className="space-y-1 text-sm">
                    <span>Centro / bodega</span>
                    <Select name="nodo" defaultValue={nodoActual}>
                        <option value="">Todo</option>
                        {arbol.map((centro) => (
                            <optgroup key={centro.id} label={centro.nombre}>
                                <option value={`c:${centro.id}`}>{centro.nombre} (todas las bodegas)</option>
                                {centro.bodegas.map((bodega) => (
                                    <option key={bodega.id} value={`b:${bodega.id}`}>
                                        {bodega.nombre}
                                    </option>
                                ))}
                            </optgroup>
                        ))}
                    </Select>
                </label>
            )}
            <label className="space-y-1 text-sm">
                <span>Mes desde</span>
                <Input type="month" name="mesDesde" defaultValue={filtros.mesDesde} aria-label="Mes desde" />
            </label>
            <label className="space-y-1 text-sm">
                <span>Mes hasta</span>
                <Input type="month" name="mesHasta" defaultValue={filtros.mesHasta} aria-label="Mes hasta" />
            </label>
            <label className="space-y-1 text-sm">
                <span>Buscar producto</span>
                <Input name="q" defaultValue={filtros.busqueda} placeholder="Nombre o código" />
            </label>
            <div className="flex items-end gap-2">
                <Button type="submit">Aplicar</Button>
            </div>
        </form>
    );
}
