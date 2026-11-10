import type * as React from "react";
import Link from "next/link";
import { ArrowLeft, History, PackageSearch } from "lucide-react";

// actions
import { consultarStockHistoricoAction } from "@/modules/stock/actions/stock-historico.action";

// components
import { StockHistoricoBuscador } from "@/modules/stock/components/stock-historico-buscador";
import { StockHistoricoResumen } from "@/modules/stock/components/stock-historico-resumen";
import { StockHistoricoTabla } from "@/modules/stock/components/stock-historico-tabla";
import { InventarioFiltros } from "@/shared/components/inventario/inventario-filtros";
import { AppLayout } from "@/shared/components/layout/app-layout";
import { Card, CardContent, CardHeader, CardTitle } from "@/shared/components/ui/card";

// lib
import { obtenerAlcanceInventario } from "@/shared/lib/inventario-alcance";

// utils
import {
    fechaHoyChile,
    obtenerParametro,
    type ParametrosUrl
} from "@/shared/utils/filtros-registros";

export const dynamic = "force-dynamic";

interface StockHistoricoPageProps {
    searchParams?: Promise<ParametrosUrl>;
}

function formatearFechaIso(fecha: Date): string {
    const año = fecha.getFullYear();
    const mes = String(fecha.getMonth() + 1).padStart(2, "0");
    const dia = String(fecha.getDate()).padStart(2, "0");
    return `${año}-${mes}-${dia}`;
}

function fechaTreintaDiasAntes(): string {
    const d = new Date();
    d.setDate(d.getDate() - 30);
    return formatearFechaIso(d);
}

export default async function StockHistoricoPage({ searchParams }: StockHistoricoPageProps): Promise<React.ReactElement> {
    const params = await searchParams;
    const productoIdParam = obtenerParametro(params, "productoId");
    const centroIdParam = obtenerParametro(params, "centroId");
    const bodegaIdParam = obtenerParametro(params, "bodegaId");
    const desdeParam = obtenerParametro(params, "desde") || fechaTreintaDiasAntes();
    const hastaParam = obtenerParametro(params, "hasta") || fechaHoyChile();

    const productoId = productoIdParam && /^\d+$/.test(productoIdParam) ? Number(productoIdParam) : undefined;

    // Obtener alcance base de centros y bodegas
    const alcance = await obtenerAlcanceInventario({
        centroId: centroIdParam ?? undefined,
        bodegaId: bodegaIdParam ?? undefined
    });

    let resultadoConsulta = null;
    let errorMensaje = null;

    if (productoId) {
        const respuesta = await consultarStockHistoricoAction({
            productoId,
            centroId: centroIdParam,
            bodegaId: bodegaIdParam,
            fechaDesde: desdeParam,
            fechaHasta: hastaParam
        });

        if (respuesta.ok && respuesta.data) {
            resultadoConsulta = respuesta.data;
        } else {
            errorMensaje = respuesta.error ?? "No se pudo obtener el stock histórico.";
        }
    }

    const parametrosParaBuscador = {
        centroId: centroIdParam,
        bodegaId: bodegaIdParam,
        desde: desdeParam,
        hasta: hastaParam
    };

    return (
        <AppLayout>
            <div className="space-y-6">
                <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
                    <div>
                        <div className="flex items-center gap-2">
                            <History className="h-6 w-6 text-primary" />
                            <h2 className="text-2xl font-semibold">Stock Histórico y Evolución</h2>
                        </div>
                        <p className="text-sm text-muted-foreground mt-1">
                            Reconstrucción de saldos a fechas pasadas y trazabilidad de movimientos (entradas, salidas, traspasos y préstamos).
                        </p>
                    </div>
                    <Link
                        href="/stock"
                        className="inline-flex items-center gap-1.5 rounded-md border border-input bg-background h-8 px-3 text-sm font-medium hover:bg-accent transition-colors"
                    >
                        <ArrowLeft className="h-4 w-4" />
                        Volver a Stock
                    </Link>
                </div>

                <Card>
                    <CardHeader>
                        <CardTitle className="text-lg">Parámetros de Consulta</CardTitle>
                    </CardHeader>
                    <CardContent className="space-y-4">
                        <StockHistoricoBuscador
                            productoActual={resultadoConsulta?.producto ?? null}
                            parametros={parametrosParaBuscador}
                        />

                        <InventarioFiltros
                            action="/stock/historico"
                            centros={alcance.centros}
                            bodegas={alcance.bodegas}
                            centroId={centroIdParam ?? alcance.centroId}
                            bodegaId={bodegaIdParam ?? alcance.bodegaId}
                            puedeFiltrarCentro={alcance.puedeFiltrarCentro}
                            mostrarRangoFechas
                            desde={desdeParam}
                            hasta={hastaParam}
                        >
                            {productoId ? <input type="hidden" name="productoId" value={productoId} /> : null}
                        </InventarioFiltros>
                    </CardContent>
                </Card>

                {errorMensaje ? (
                    <div role="alert" className="rounded-lg border border-red-300 bg-red-50 p-4 text-sm text-red-900">
                        {errorMensaje}
                    </div>
                ) : null}

                {resultadoConsulta ? (
                    <div className="space-y-6">
                        <Card>
                            <CardHeader className="pb-3">
                                <div className="flex flex-col gap-1 sm:flex-row sm:items-center sm:justify-between">
                                    <div>
                                        <CardTitle className="text-xl">
                                            #{resultadoConsulta.producto.id} — {resultadoConsulta.producto.descripcion}
                                        </CardTitle>
                                        <p className="text-sm text-muted-foreground mt-0.5">
                                            Línea: {resultadoConsulta.producto.linea || "Sin clasificar"}
                                            {resultadoConsulta.centroNombre ? ` • Centro: ${resultadoConsulta.centroNombre}` : ""}
                                            {resultadoConsulta.bodegaNombre ? ` • Bodega: ${resultadoConsulta.bodegaNombre}` : " • Todas las bodegas en alcance"}
                                        </p>
                                    </div>
                                    <span className="text-xs text-muted-foreground">
                                        Período evaluado: {resultadoConsulta.fechaDesde} al {resultadoConsulta.fechaHasta}
                                    </span>
                                </div>
                            </CardHeader>
                            <CardContent>
                                <StockHistoricoResumen
                                    saldoInicial={resultadoConsulta.resultado.saldoInicial}
                                    saldoFinal={resultadoConsulta.resultado.saldoFinal}
                                    totalIngresos={resultadoConsulta.resultado.totalIngresos}
                                    totalEgresos={resultadoConsulta.resultado.totalEgresos}
                                    fechaDesde={resultadoConsulta.fechaDesde}
                                    fechaHasta={resultadoConsulta.fechaHasta}
                                    datosCompletos={resultadoConsulta.resultado.datosCompletos}
                                    mensajeAdvertencia={resultadoConsulta.resultado.mensajeAdvertencia}
                                />
                            </CardContent>
                        </Card>

                        <Card>
                            <CardHeader>
                                <CardTitle className="text-lg">Evolución y Trazabilidad de Movimientos</CardTitle>
                            </CardHeader>
                            <CardContent>
                                <StockHistoricoTabla
                                    movimientos={resultadoConsulta.resultado.movimientos}
                                    saldoInicial={resultadoConsulta.resultado.saldoInicial}
                                />
                            </CardContent>
                        </Card>
                    </div>
                ) : !errorMensaje ? (
                    <div className="rounded-lg border border-dashed p-12 text-center">
                        <PackageSearch className="mx-auto h-12 w-12 text-muted-foreground/60" />
                        <h3 className="mt-4 text-base font-medium">Seleccione un producto para comenzar</h3>
                        <p className="mt-1 text-sm text-muted-foreground max-w-md mx-auto">
                            Utilice el buscador superior para seleccionar el medicamento o insumo y definir el centro, bodega y rango de fechas a auditar.
                        </p>
                    </div>
                ) : null}
            </div>
        </AppLayout>
    );
}

