"use client";

import * as React from "react";
import { useState } from "react";
import { ChevronDown, ChevronUp, ChevronLeft, ChevronRight } from "lucide-react";

// components
import { AuditoriaDetalleVisor } from "@/modules/auditoria/components/auditoria-detalle-visor";
import { Badge } from "@/shared/components/ui/badge";
import { Button } from "@/shared/components/ui/button";
import { Td, Th, Table } from "@/shared/components/ui/table";
import type { AuditoriaLogItem } from "@/modules/auditoria/actions/auditoria.action";

export type LogItem = AuditoriaLogItem;

interface AuditoriaTablaProps {
    logs: LogItem[];
    total: number;
    paginaActual: number;
    paginasTotales: number;
    onCambiarPagina: (nuevaPagina: number) => void;
}

function formatearFechaHora(fecha: Date | string): string {
    const d = new Date(fecha);
    return d.toLocaleString("es-CL", {
        day: "2-digit",
        month: "2-digit",
        year: "numeric",
        hour: "2-digit",
        minute: "2-digit",
        second: "2-digit"
    });
}

function getTonePorAccion(accion: string): "success" | "warning" | "danger" | "default" {
    switch (accion.toLowerCase()) {
        case "crear":
            return "success";
        case "actualizar":
            return "default";
        case "eliminar":
            return "danger";
        default:
            return "warning";
    }
}

export function AuditoriaTabla({
    logs,
    total,
    paginaActual,
    paginasTotales,
    onCambiarPagina
}: AuditoriaTablaProps): React.ReactElement {
    const [filaExpandida, setFilaExpandida] = useState<string | null>(null);

    const toggleFila = (id: string) => {
        setFilaExpandida((prev) => (prev === id ? null : id));
    };

    if (logs.length === 0) {
        return (
            <div className="rounded-lg border border-dashed p-8 text-center text-sm text-muted-foreground">
                No se encontraron eventos de auditoría para los filtros especificados.
            </div>
        );
    }

    return (
        <div className="space-y-3">
            <div className="flex items-center justify-between text-xs text-muted-foreground px-1">
                <span>
                    Mostrando {logs.length} de {total} eventos registrados
                </span>
                <span>
                    Página {paginaActual} de {paginasTotales}
                </span>
            </div>

            <div className="overflow-x-auto rounded-lg border bg-card shadow-sm">
                <Table>
                    <thead>
                        <tr>
                            <Th>Fecha y Hora</Th>
                            <Th>Usuario Responsable</Th>
                            <Th>Acción</Th>
                            <Th>Entidad</Th>
                            <Th>Identificador</Th>
                            <Th className="text-right">Detalle</Th>
                        </tr>
                    </thead>
                    <tbody>
                        {logs.map((log) => {
                            const isExpanded = filaExpandida === log.id;
                            return (
                                <React.Fragment key={log.id}>
                                    <tr className="hover:bg-muted/30 transition-colors">
                                        <Td className="whitespace-nowrap text-xs font-mono text-muted-foreground">
                                            {formatearFechaHora(log.fecha)}
                                        </Td>
                                        <Td>
                                            {log.usuario ? (
                                                <div className="space-y-0.5">
                                                    <p className="text-xs font-medium text-foreground">
                                                        {log.usuario.nombre} {log.usuario.apPaterno ?? ""}
                                                    </p>
                                                    <p className="text-[11px] text-muted-foreground">
                                                        {log.usuario.email}
                                                    </p>
                                                </div>
                                            ) : (
                                                <span className="text-xs italic text-muted-foreground">
                                                    Sistema
                                                </span>
                                            )}
                                        </Td>
                                        <Td>
                                            <Badge tone={getTonePorAccion(log.accion)}>
                                                {log.accion.charAt(0).toUpperCase() + log.accion.slice(1)}
                                            </Badge>
                                        </Td>
                                        <Td className="text-xs font-medium">{log.entidad}</Td>
                                        <Td className="text-xs font-mono text-muted-foreground">
                                            {log.entidadId ? log.entidadId.slice(0, 15) : "—"}
                                        </Td>
                                        <Td className="text-right">
                                            <Button
                                                type="button"
                                                variant="ghost"
                                                size="sm"
                                                onClick={() => toggleFila(log.id)}
                                                className="h-7 gap-1 px-2 text-xs"
                                                aria-label={`Ver detalle ${log.id}`}
                                            >
                                                {isExpanded ? (
                                                    <>
                                                        <ChevronUp className="h-3.5 w-3.5" />
                                                        Ocultar
                                                    </>
                                                ) : (
                                                    <>
                                                        <ChevronDown className="h-3.5 w-3.5" />
                                                        Ver detalle
                                                    </>
                                                )}
                                            </Button>
                                        </Td>
                                    </tr>
                                    {isExpanded && (
                                        <tr className="bg-muted/10">
                                            <td colSpan={6} className="p-3">
                                                <AuditoriaDetalleVisor
                                                    detalle={log.detalle}
                                                    entidad={log.entidad}
                                                />
                                            </td>
                                        </tr>
                                    )}
                                </React.Fragment>
                            );
                        })}
                    </tbody>
                </Table>
            </div>

            {/* Paginación */}
            {paginasTotales > 1 && (
                <div className="flex items-center justify-end gap-2 pt-2">
                    <Button
                        type="button"
                        variant="outline"
                        size="sm"
                        disabled={paginaActual <= 1}
                        onClick={() => onCambiarPagina(paginaActual - 1)}
                        className="gap-1 text-xs"
                    >
                        <ChevronLeft className="h-3.5 w-3.5" />
                        Anterior
                    </Button>
                    <span className="text-xs font-medium text-muted-foreground">
                        {paginaActual} / {paginasTotales}
                    </span>
                    <Button
                        type="button"
                        variant="outline"
                        size="sm"
                        disabled={paginaActual >= paginasTotales}
                        onClick={() => onCambiarPagina(paginaActual + 1)}
                        className="gap-1 text-xs"
                    >
                        Siguiente
                        <ChevronRight className="h-3.5 w-3.5" />
                    </Button>
                </div>
            )}
        </div>
    );
}
