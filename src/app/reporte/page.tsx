import type * as React from "react";

// actions
import { consultarReporte } from "@/modules/reporte/actions/reporte.action";

// components
import { ArbolCentros } from "@/modules/reporte/components/arbol-centros";
import { BotonExportarReporte } from "@/modules/reporte/components/boton-exportar-reporte";
import { FiltrosReporteForm } from "@/modules/reporte/components/filtros-reporte";
import { ReporteTabla } from "@/modules/reporte/components/reporte-tabla";
import { Paginacion } from "@/shared/components/inventario/paginacion";
import { AppLayout } from "@/shared/components/layout/app-layout";
import { Card, CardContent, CardHeader, CardTitle } from "@/shared/components/ui/card";

// utils
import { leerFiltrosReporte, parametrosDeReporte } from "@/modules/reporte/utils/periodo";
import { fechaHoyChile, type ParametrosUrl } from "@/shared/utils/filtros-registros";

export const dynamic = "force-dynamic";

interface ReportePageProps {
    searchParams?: Promise<ParametrosUrl>;
}

export default async function ReportePage({ searchParams }: ReportePageProps): Promise<React.ReactElement> {
    const filtros = leerFiltrosReporte(await searchParams, fechaHoyChile());
    const reporte = await consultarReporte(filtros);
    // Para R02/R03/R06/R07 el centro es fijo: no cuenta como selección del árbol.
    const centroSeleccionado = reporte.puedeFiltrarCentro && !reporte.bodegaId ? reporte.centroId : null;
    const parametros = {
        ...parametrosDeReporte(filtros),
        centroId: reporte.bodegaId ? undefined : centroSeleccionado ?? undefined,
        bodegaId: reporte.bodegaId ?? undefined
    };
    const parametrosSinNodo = { mesDesde: filtros.mesDesde, mesHasta: filtros.mesHasta, q: filtros.busqueda };
    const parametrosExportacion = Object.fromEntries(
        Object.entries(parametros).filter((entrada): entrada is [string, string] => typeof entrada[1] === "string" && entrada[1].length > 0)
    );

    return (
        <AppLayout>
            <div className="space-y-6">
                <div className="flex flex-wrap items-end justify-between gap-3">
                    <div>
                        <p className="text-sm text-muted-foreground">Consumo mensual por centro, bodega y producto</p>
                        <h2 className="text-2xl font-semibold">Reporte de consumo</h2>
                    </div>
                    <BotonExportarReporte parametros={parametrosExportacion} />
                </div>
                <div className="grid gap-6 lg:grid-cols-[16rem_minmax(0,1fr)]">
                    <Card className="hidden lg:block">
                        <CardContent className="max-h-[75vh] overflow-y-auto pt-4">
                            <ArbolCentros
                                arbol={reporte.arbol}
                                centroId={centroSeleccionado}
                                bodegaId={reporte.bodegaId}
                                parametros={parametrosSinNodo}
                            />
                        </CardContent>
                    </Card>
                    <div className="min-w-0 space-y-6">
                        <Card>
                            <CardHeader>
                                <CardTitle>Filtros · {reporte.nodoNombre === "todo" ? "Todo" : reporte.nodoNombre}</CardTitle>
                            </CardHeader>
                            <CardContent className="space-y-3">
                                {filtros.avisos.map((aviso) => (
                                    <p key={aviso} role="status" className="rounded-md border border-amber-200 bg-amber-50 px-3 py-2 text-sm text-amber-900">
                                        {aviso}
                                    </p>
                                ))}
                                <div className="lg:hidden">
                                    <FiltrosReporteForm filtros={filtros} arbol={reporte.arbol} centroId={centroSeleccionado} bodegaId={reporte.bodegaId} variante="movil" />
                                </div>
                                <div className="hidden lg:block">
                                    <FiltrosReporteForm filtros={filtros} arbol={reporte.arbol} centroId={centroSeleccionado} bodegaId={reporte.bodegaId} variante="escritorio" />
                                </div>
                            </CardContent>
                        </Card>
                        <Card>
                            <CardContent className="overflow-x-auto pt-4">
                                <ReporteTabla filas={reporte.filas} columnas={reporte.columnas} />
                                <Paginacion ruta="/reporte" parametros={parametros} paginacion={reporte.paginacion} />
                            </CardContent>
                        </Card>
                    </div>
                </div>
            </div>
        </AppLayout>
    );
}
