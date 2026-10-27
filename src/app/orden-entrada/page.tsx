import type * as React from "react";

// actions
import { listarOrdenesEntrada } from "@/modules/orden-entrada/actions/orden-entrada.action";
import { listarProductosActivos } from "@/modules/productos/actions/productos.action";

// components
import { OrdenEntradaForm } from "@/modules/orden-entrada/components/orden-entrada-form";
import { OrdenEntradaTable } from "@/modules/orden-entrada/components/orden-entrada-table";
import { Card, CardContent, CardHeader, CardTitle } from "@/shared/components/ui/card";
import { AppLayout } from "@/shared/components/layout/app-layout";

// lib
import { obtenerAlcanceInventario } from "@/shared/lib/inventario-alcance";

import Link from "next/link";
import { ArrowRight } from "lucide-react";

export const dynamic = "force-dynamic";

export default async function OrdenEntradaPage(): Promise<React.ReactElement> {
    const [ordenes, alcance, productos] = await Promise.all([
        listarOrdenesEntrada(),
        obtenerAlcanceInventario(),
        listarProductosActivos()
    ]);

    return (
        <AppLayout>
            <div className="space-y-6">
                <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
                    <div>
                        <p className="text-sm text-muted-foreground">Recepcion de productos y aumento de stock</p>
                        <h2 className="text-2xl font-semibold">Orden de entrada</h2>
                    </div>
                    <Link
                        href="/orden-entrada/recepcion-prestamos"
                        className="inline-flex items-center gap-2 rounded-lg border border-teal-300 bg-teal-50 px-3.5 py-2 text-xs font-semibold text-teal-900 shadow-sm transition hover:bg-teal-100 self-start sm:self-auto"
                    >
                        <span>Recepcionar Préstamo Intercentros (Código)</span>
                        <ArrowRight className="h-4 w-4 text-teal-700" />
                    </Link>
                </div>
                <Card>
                    <CardHeader>
                        <CardTitle>Nueva entrada</CardTitle>
                    </CardHeader>
                    <CardContent>
                        <OrdenEntradaForm
                            centros={alcance.centros}
                            bodegas={alcance.bodegas}
                            productos={productos}
                            centroId={alcance.centroId}
                            bodegaId={alcance.bodegaId}
                            puedeFiltrarCentro={alcance.puedeFiltrarCentro}
                        />
                    </CardContent>
                </Card>
                <Card>
                    <CardHeader>
                        <CardTitle>Entradas registradas ultimos 90 dias</CardTitle>
                    </CardHeader>
                    <CardContent className="overflow-x-auto">
                        <OrdenEntradaTable ordenes={ordenes} />
                    </CardContent>
                </Card>
            </div>
        </AppLayout>
    );
}
