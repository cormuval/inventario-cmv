import { redirect } from "next/navigation";
import type * as React from "react";

// actions
import {
    consultarLogsAuditoria,
    obtenerFiltrosCatalogoAuditoria
} from "@/modules/auditoria/actions/auditoria.action";

// components
import { AuditoriaVistaCliente } from "@/modules/auditoria/components/auditoria-vista-cliente";
import { AppLayout } from "@/shared/components/layout/app-layout";

// lib
import { puedeAdministrar, requireSessionUser } from "@/shared/lib/auth";
import { obtenerRangoHoyChile } from "@/shared/utils/fechas";

export const dynamic = "force-dynamic";

export default async function AuditoriaPage(): Promise<React.ReactElement> {
    const sessionUser = await requireSessionUser();

    if (!puedeAdministrar(sessionUser.rol)) {
        redirect("/");
    }

    const rangoHoy = obtenerRangoHoyChile();

    const [catalogo, resultadoInicial] = await Promise.all([
        obtenerFiltrosCatalogoAuditoria(),
        consultarLogsAuditoria({
            fechaDesde: rangoHoy.desde.toISOString(),
            fechaHasta: rangoHoy.hasta.toISOString(),
            pagina: 1
        })
    ]);

    return (
        <AppLayout>
            <div className="space-y-6">
                <div>
                    <p className="text-sm text-muted-foreground">
                        Registro y trazabilidad cronológica de movimientos y operaciones en el sistema
                    </p>
                    <h2 className="text-2xl font-semibold">Auditoría de Acciones</h2>
                </div>

                <AuditoriaVistaCliente
                    centros={catalogo.centros}
                    bodegas={catalogo.bodegas}
                    usuarios={catalogo.usuarios}
                    initialLogs={resultadoInicial.logs}
                    initialTotal={resultadoInicial.total}
                    initialPaginasTotales={resultadoInicial.paginasTotales}
                    initialValoresFiltros={{
                        fechaDesde: rangoHoy.fechaInicioLocal,
                        fechaHasta: rangoHoy.fechaFinLocal
                    }}
                />
            </div>
        </AppLayout>
    );
}
