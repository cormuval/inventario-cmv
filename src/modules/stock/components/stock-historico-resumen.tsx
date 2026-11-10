import type * as React from "react";
import { AlertCircle, ArrowDownRight, ArrowUpRight, Calendar, Package } from "lucide-react";

// components
import { Card, CardContent } from "@/shared/components/ui/card";

interface StockHistoricoResumenProps {
    saldoInicial: number;
    saldoFinal: number;
    totalIngresos: number;
    totalEgresos: number;
    fechaDesde: string;
    fechaHasta: string;
    datosCompletos: boolean;
    mensajeAdvertencia?: string;
}

export function StockHistoricoResumen({
    saldoInicial,
    saldoFinal,
    totalIngresos,
    totalEgresos,
    fechaDesde,
    fechaHasta,
    datosCompletos,
    mensajeAdvertencia
}: StockHistoricoResumenProps): React.ReactElement {
    return (
        <div className="space-y-4">
            {!datosCompletos && mensajeAdvertencia ? (
                <div
                    role="alert"
                    className="flex items-start gap-3 rounded-lg border border-amber-300 bg-amber-50 p-4 text-amber-900"
                >
                    <AlertCircle className="h-5 w-5 shrink-0 text-amber-600 mt-0.5" />
                    <div className="space-y-1">
                        <p className="font-semibold text-sm">Limitación de datos históricos</p>
                        <p className="text-sm text-amber-800">{mensajeAdvertencia}</p>
                    </div>
                </div>
            ) : null}

            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
                <Card>
                    <CardContent className="pt-6">
                        <div className="flex items-center justify-between">
                            <div>
                                <p className="text-xs font-medium text-muted-foreground uppercase tracking-wider">
                                    Saldo Inicial
                                </p>
                                <p className="text-xs text-muted-foreground mt-0.5">Al inicio ({fechaDesde})</p>
                                <p className="text-2xl font-bold mt-2">{saldoInicial.toLocaleString("es-CL")}</p>
                            </div>
                            <div className="rounded-full bg-slate-100 p-2.5 text-slate-600">
                                <Calendar className="h-5 w-5" />
                            </div>
                        </div>
                    </CardContent>
                </Card>

                <Card>
                    <CardContent className="pt-6">
                        <div className="flex items-center justify-between">
                            <div>
                                <p className="text-xs font-medium text-emerald-700 uppercase tracking-wider">
                                    Ingresos Netos
                                </p>
                                <p className="text-xs text-muted-foreground mt-0.5">Entradas y devoluciones</p>
                                <p className="text-2xl font-bold text-emerald-600 mt-2">
                                    +{totalIngresos.toLocaleString("es-CL")}
                                </p>
                            </div>
                            <div className="rounded-full bg-emerald-100 p-2.5 text-emerald-600">
                                <ArrowUpRight className="h-5 w-5" />
                            </div>
                        </div>
                    </CardContent>
                </Card>

                <Card>
                    <CardContent className="pt-6">
                        <div className="flex items-center justify-between">
                            <div>
                                <p className="text-xs font-medium text-rose-700 uppercase tracking-wider">
                                    Egresos Netos
                                </p>
                                <p className="text-xs text-muted-foreground mt-0.5">Salidas, mermas y traspasos</p>
                                <p className="text-2xl font-bold text-rose-600 mt-2">
                                    -{totalEgresos.toLocaleString("es-CL")}
                                </p>
                            </div>
                            <div className="rounded-full bg-rose-100 p-2.5 text-rose-600">
                                <ArrowDownRight className="h-5 w-5" />
                            </div>
                        </div>
                    </CardContent>
                </Card>

                <Card>
                    <CardContent className="pt-6">
                        <div className="flex items-center justify-between">
                            <div>
                                <p className="text-xs font-medium text-muted-foreground uppercase tracking-wider">
                                    Saldo a la Fecha
                                </p>
                                <p className="text-xs text-muted-foreground mt-0.5">Al cierre ({fechaHasta})</p>
                                <p className="text-2xl font-bold mt-2">{saldoFinal.toLocaleString("es-CL")}</p>
                            </div>
                            <div className="rounded-full bg-blue-100 p-2.5 text-blue-600">
                                <Package className="h-5 w-5" />
                            </div>
                        </div>
                    </CardContent>
                </Card>
            </div>
        </div>
    );
}

