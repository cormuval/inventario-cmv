import type * as React from "react";

export function EstadoPrestamoBadge({
    estado,
    codigoRecepcion
}: {
    estado?: string | null;
    codigoRecepcion?: string | null;
}): React.ReactElement | null {
    if (!estado) return null;

    if (estado === "EN_TRANSITO") {
        return (
            <div className="inline-flex flex-col items-start gap-0.5">
                <span className="inline-flex items-center px-2 py-0.5 rounded text-xs font-medium bg-amber-100 text-amber-800 border border-amber-300">
                    En tránsito
                </span>
                {codigoRecepcion && (
                    <span className="font-mono text-[10px] text-muted-foreground tracking-wide" title="Código de recepción">
                        {codigoRecepcion}
                    </span>
                )}
            </div>
        );
    }

    if (estado === "RECEPCIONADO") {
        return (
            <span className="inline-flex items-center px-2 py-0.5 rounded text-xs font-medium bg-emerald-100 text-emerald-800 border border-emerald-300">
                Recepcionado
            </span>
        );
    }

    if (estado === "ANULADO") {
        return (
            <span className="inline-flex items-center px-2 py-0.5 rounded text-xs font-medium bg-rose-100 text-rose-800 border border-rose-300">
                Anulado
            </span>
        );
    }

    return (
        <span className="inline-flex items-center px-2 py-0.5 rounded text-xs font-medium bg-gray-100 text-gray-800">
            {estado}
        </span>
    );
}
