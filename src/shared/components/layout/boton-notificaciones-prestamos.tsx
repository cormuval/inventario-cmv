"use client";

import * as React from "react";
import Link from "next/link";
import { Bell, Clock, PackageCheck, AlertTriangle } from "lucide-react";

// components
import { Popover, PopoverContent, PopoverTrigger } from "@/shared/components/ui/popover";
import { Button } from "@/shared/components/ui/button";
import { Badge } from "@/shared/components/ui/badge";

// types
import type { NotificacionesPrestamoResultado } from "@/modules/orden-entrada/actions/notificaciones-prestamos.action";

interface BotonNotificacionesPrestamosProps {
    initialData?: NotificacionesPrestamoResultado;
}

export function BotonNotificacionesPrestamos({
    initialData = { total: 0, ordenes: [] }
}: BotonNotificacionesPrestamosProps): React.ReactElement {
    const [data] = React.useState<NotificacionesPrestamoResultado>(initialData);
    const [abierto, setAbierto] = React.useState(false);

    const hayPendientes = data.total > 0;

    return (
        <Popover open={abierto} onOpenChange={setAbierto}>
            <PopoverTrigger asChild>
                <button
                    type="button"
                    aria-label="Notificaciones de préstamos intercentros"
                    className="relative flex h-9 w-9 items-center justify-center rounded-lg border border-teal-200 bg-white text-slate-700 shadow-sm transition hover:bg-teal-50 hover:text-teal-900 focus:outline-none focus:ring-2 focus:ring-teal-500"
                >
                    <Bell className="h-4 w-4" />
                    {hayPendientes && (
                        <span
                            data-testid="punto-rojo-notificacion"
                            className="absolute top-1 right-1 h-2.5 w-2.5 rounded-full bg-red-500 ring-2 ring-white animate-pulse"
                            title={`${data.total} envíos en tránsito`}
                        />
                    )}
                </button>
            </PopoverTrigger>
            <PopoverContent align="end" className="w-80 p-0 shadow-lg border-teal-100 bg-white">
                <div className="flex items-center justify-between border-b border-slate-100 bg-teal-50/70 px-4 py-3">
                    <div className="flex items-center gap-2">
                        <PackageCheck className="h-4 w-4 text-teal-700" />
                        <span className="text-xs font-semibold uppercase tracking-wider text-teal-900">
                            Envíos en Tránsito ({data.total})
                        </span>
                    </div>
                    {hayPendientes && (
                        <Badge tone="default" className="border-teal-300 bg-teal-100 text-[10px] text-teal-800">
                            Pendientes
                        </Badge>
                    )}
                </div>

                <div className="max-h-80 overflow-y-auto divide-y divide-slate-100 p-2">
                    {!hayPendientes ? (
                        <div className="py-6 text-center text-xs text-slate-500">
                            No hay préstamos ni traspasos en camino hacia tu centro.
                        </div>
                    ) : (
                        data.ordenes.map((orden) => (
                            <div key={orden.id} className="p-2.5 text-xs transition hover:bg-slate-50 rounded-md">
                                <div className="flex items-start justify-between gap-2">
                                    <span className="font-semibold text-slate-800">{orden.centroOrigen}</span>
                                    <span className="font-mono font-bold text-teal-700 bg-teal-50 px-1.5 py-0.5 rounded border border-teal-200 text-[11px]">
                                        {orden.codigo}
                                    </span>
                                </div>
                                <p className="mt-0.5 text-slate-500">
                                    {orden.bodegaOrigen} • {orden.totalItems} producto{orden.totalItems !== 1 ? "s" : ""}
                                </p>
                                {orden.esDemorado && (
                                    <div className="mt-1.5 flex items-center gap-1 text-[11px] font-medium text-amber-700">
                                        <AlertTriangle className="h-3.5 w-3.5 text-amber-600" />
                                        <span>Tránsito Demorado (&gt; 1 semana)</span>
                                    </div>
                                )}
                            </div>
                        ))
                    )}
                </div>

                <div className="border-t border-slate-100 bg-slate-50 p-2 text-center">
                    <Link
                        href="/orden-entrada/recepcion-prestamos"
                        onClick={() => setAbierto(false)}
                        className="inline-flex w-full items-center justify-center rounded-md bg-teal-700 px-3 py-1.5 text-xs font-medium text-white shadow-sm hover:bg-teal-800 transition"
                    >
                        Ir a recepcionar con código →
                    </Link>
                </div>
            </PopoverContent>
        </Popover>
    );
}
