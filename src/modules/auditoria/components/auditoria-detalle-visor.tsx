"use client";

import * as React from "react";
import { Code2 } from "lucide-react";

interface AuditoriaDetalleVisorProps {
    detalle: unknown;
    entidad: string;
}

export function AuditoriaDetalleVisor({
    detalle,
    entidad
}: AuditoriaDetalleVisorProps): React.ReactElement {
    const [mostrarRaw, setMostrarRaw] = React.useState(false);

    if (!detalle || typeof detalle !== "object") {
        return <p className="text-xs italic text-muted-foreground">Sin detalle adicional registrado.</p>;
    }

    const data = detalle as Record<string, any>;

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
                    const stringVal =
                        typeof value === "object" ? JSON.stringify(value) : String(value);

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
