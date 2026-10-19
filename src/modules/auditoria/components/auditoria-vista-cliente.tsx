"use client";

import * as React from "react";
import { useState, useTransition } from "react";

// actions
import { consultarLogsAuditoria } from "@/modules/auditoria/actions/auditoria.action";

// components
import { AuditoriaFiltros } from "@/modules/auditoria/components/auditoria-filtros";
import { AuditoriaTabla, type LogItem } from "@/modules/auditoria/components/auditoria-tabla";

// types
import type { FiltroAuditoriaInput } from "@/modules/auditoria/schemas/auditoria.schema";

interface AuditoriaVistaClienteProps {
    centros: Array<{ id: string; nombre: string }>;
    bodegas: Array<{ id: string; nombre: string; centroId: string }>;
    usuarios: Array<{
        id: string;
        nombre: string;
        apPaterno: string | null;
        email: string;
        centroId: string;
        bodegaId?: string | null;
        encargos?: Array<{ bodegaId: string }>;
    }>;
    initialLogs: LogItem[];
    initialTotal: number;
    initialPaginasTotales: number;
}

export function AuditoriaVistaCliente({
    centros,
    bodegas,
    usuarios,
    initialLogs,
    initialTotal,
    initialPaginasTotales
}: AuditoriaVistaClienteProps): React.ReactElement {
    const [logs, setLogs] = useState<LogItem[]>(initialLogs);
    const [total, setTotal] = useState(initialTotal);
    const [pagina, setPagina] = useState(1);
    const [paginasTotales, setPaginasTotales] = useState(initialPaginasTotales);
    const [filtrosActuales, setFiltrosActuales] = useState<Partial<FiltroAuditoriaInput>>({});
    const [isPending, startTransition] = useTransition();

    const ejecutarConsulta = (nuevosFiltros: Partial<FiltroAuditoriaInput>, targetPagina = 1) => {
        setFiltrosActuales(nuevosFiltros);
        setPagina(targetPagina);

        startTransition(async () => {
            const res = await consultarLogsAuditoria({
                ...nuevosFiltros,
                pagina: targetPagina
            });
            setLogs(res.logs as LogItem[]);
            setTotal(res.total);
            setPaginasTotales(res.paginasTotales);
        });
    };

    return (
        <div className="space-y-6">
            <AuditoriaFiltros
                centros={centros}
                bodegas={bodegas}
                usuarios={usuarios}
                onFiltrar={(f) => ejecutarConsulta(f, 1)}
            />

            <div className={isPending ? "opacity-50 transition-opacity pointer-events-none" : ""}>
                <AuditoriaTabla
                    logs={logs}
                    total={total}
                    paginaActual={pagina}
                    paginasTotales={paginasTotales}
                    onCambiarPagina={(p) => ejecutarConsulta(filtrosActuales, p)}
                />
            </div>
        </div>
    );
}
