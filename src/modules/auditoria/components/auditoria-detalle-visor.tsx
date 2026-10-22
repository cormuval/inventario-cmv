"use client";

import * as React from "react";
import { Code2 } from "lucide-react";

interface AuditoriaDetalleVisorProps {
    detalle: unknown;
    entidad: string;
}

function formatearValorAuditoria(valor: unknown): string {
    if (valor === null || valor === undefined) return "—";
    if (typeof valor === "boolean") return valor ? "true" : "false";
    if (Array.isArray(valor)) return valor.length > 0 ? valor.join(", ") : "—";
    if (typeof valor === "object") return JSON.stringify(valor);
    return String(valor);
}

function esObjetoCambios(
    detalle: Record<string, unknown>
): detalle is { cambios: Record<string, { antes?: unknown; despues?: unknown }> } {
    if (!detalle || typeof detalle !== "object") return false;
    const { cambios } = detalle;
    return Boolean(
        cambios &&
        typeof cambios === "object" &&
        !Array.isArray(cambios) &&
        Object.keys(cambios).length > 0
    );
}

export function AuditoriaDetalleVisor({
    detalle,
    entidad
}: AuditoriaDetalleVisorProps): React.ReactElement {
    const [mostrarRaw, setMostrarRaw] = React.useState(false);

    // 1. Caso null o undefined
    if (detalle === null || detalle === undefined) {
        return <p className="text-xs italic text-muted-foreground">Sin detalle adicional registrado.</p>;
    }

    // 2. Caso tipo primitivo: string, number o boolean
    if (typeof detalle === "string" || typeof detalle === "number" || typeof detalle === "boolean") {
        return (
            <div className="rounded-md border bg-muted/40 p-3 text-xs">
                <span className="font-semibold text-foreground">Detalle registrado</span>
                <p className="mt-1 whitespace-pre-wrap text-muted-foreground">{String(detalle)}</p>
            </div>
        );
    }

    // 3. Caso arreglo
    if (Array.isArray(detalle)) {
        return (
            <div className="space-y-2 rounded-md border bg-muted/40 p-3 text-xs">
                <div className="flex items-center justify-between border-b pb-1.5">
                    <span className="font-semibold text-foreground">
                        Lista de elementos ({detalle.length})
                    </span>
                    <button
                        type="button"
                        onClick={() => setMostrarRaw(!mostrarRaw)}
                        className="flex items-center gap-1 text-[11px] text-muted-foreground hover:text-foreground"
                    >
                        <Code2 className="h-3 w-3" />
                        {mostrarRaw ? "Ocultar JSON" : "Ver JSON"}
                    </button>
                </div>
                <pre className="max-h-40 overflow-auto rounded border bg-background p-2 font-mono text-[11px] text-foreground">
                    {JSON.stringify(detalle, null, 2)}
                </pre>
            </div>
        );
    }

    // 4. Caso objeto estructurado
    const data = detalle as Record<string, unknown>;

    // 4a. Objeto con tabla de cambios (Campo | Antes | Después)
    if (esObjetoCambios(data)) {
        const cambios = data.cambios;
        return (
            <div className="space-y-2 rounded-md border bg-muted/40 p-3 text-xs">
                <div className="flex items-center justify-between border-b pb-1.5">
                    <span className="font-semibold text-foreground">
                        Cambios registrados en {entidad}
                    </span>
                    <button
                        type="button"
                        onClick={() => setMostrarRaw(!mostrarRaw)}
                        className="flex items-center gap-1 text-[11px] text-muted-foreground hover:text-foreground"
                    >
                        <Code2 className="h-3 w-3" />
                        {mostrarRaw ? "Ocultar JSON" : "Ver JSON"}
                    </button>
                </div>

                <div className="overflow-x-auto rounded border bg-background">
                    <table className="w-full border-collapse text-left text-xs">
                        <thead>
                            <tr className="border-b bg-muted/60 text-[11px] font-semibold text-muted-foreground">
                                <th className="px-3 py-1.5">Campo</th>
                                <th className="px-3 py-1.5">Antes</th>
                                <th className="px-3 py-1.5">Después</th>
                            </tr>
                        </thead>
                        <tbody className="divide-y">
                            {Object.entries(cambios).map(([campo, valor]) => (
                                <tr key={campo} className="hover:bg-muted/20">
                                    <td className="px-3 py-1.5 font-medium text-foreground">{campo}</td>
                                    <td className="px-3 py-1.5 text-muted-foreground">
                                        {formatearValorAuditoria(valor?.antes)}
                                    </td>
                                    <td className="px-3 py-1.5 font-medium text-foreground">
                                        {formatearValorAuditoria(valor?.despues)}
                                    </td>
                                </tr>
                            ))}
                        </tbody>
                    </table>
                </div>

                {mostrarRaw && (
                    <pre className="max-h-40 overflow-auto rounded bg-black/80 p-2 font-mono text-[11px] text-emerald-400">
                        {JSON.stringify(data, null, 2)}
                    </pre>
                )}
            </div>
        );
    }

    // 4b. Objeto plano común (clave-valor)
    return (
        <div className="space-y-2 rounded-md border bg-muted/40 p-3 text-xs">
            <div className="flex items-center justify-between border-b pb-1.5">
                <span className="font-semibold text-foreground">
                    Detalle estructurado de {entidad}
                </span>
                <button
                    type="button"
                    onClick={() => setMostrarRaw(!mostrarRaw)}
                    className="flex items-center gap-1 text-[11px] text-muted-foreground hover:text-foreground"
                >
                    <Code2 className="h-3 w-3" />
                    {mostrarRaw ? "Ocultar JSON" : "Ver JSON"}
                </button>
            </div>

            <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
                {Object.entries(data).map(([key, value]) => {
                    const label = key
                        .replace(/([A-Z])/g, " $1")
                        .replace(/^./, (str) => str.toUpperCase());
                    const stringVal = formatearValorAuditoria(value);

                    return (
                        <div key={key} className="space-y-0.5">
                            <span className="text-[10px] font-medium uppercase text-muted-foreground">
                                {label}
                            </span>
                            <p className="font-medium text-foreground truncate" title={stringVal}>
                                {stringVal}
                            </p>
                        </div>
                    );
                })}
            </div>

            {mostrarRaw && (
                <pre className="max-h-40 overflow-auto rounded bg-black/80 p-2 font-mono text-[11px] text-emerald-400">
                    {JSON.stringify(data, null, 2)}
                </pre>
            )}
        </div>
    );
}
