import type * as React from "react";
import Link from "next/link";
import { ArrowLeft, ShoppingCart } from "lucide-react";

// components
import { PedidoForm } from "@/modules/pedidos/components/pedido-form";
import { AppLayout } from "@/shared/components/layout/app-layout";
import { Card, CardContent, CardHeader, CardTitle } from "@/shared/components/ui/card";

// lib
import { obtenerAlcanceInventario } from "@/shared/lib/inventario-alcance";

export const dynamic = "force-dynamic";

export default async function NuevoPedidoPage(): Promise<React.ReactElement> {
    const alcance = await obtenerAlcanceInventario();

    return (
        <AppLayout>
            <div className="space-y-6">
                <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
                    <div>
                        <div className="flex items-center gap-2">
                            <ShoppingCart className="h-6 w-6 text-primary" />
                            <h2 className="text-2xl font-semibold">Nuevo Pedido de Aseo</h2>
                        </div>
                        <p className="text-sm text-muted-foreground mt-1">
                            Complete las cantidades requeridas del catálogo cerrado de aseo para su centro de salud.
                        </p>
                    </div>
                    <Link
                        href="/pedidos"
                        className="inline-flex items-center gap-1.5 rounded-md border border-input bg-background h-8 px-3 text-sm font-medium hover:bg-accent transition-colors"
                    >
                        <ArrowLeft className="h-4 w-4" />
                        Volver al Historial
                    </Link>
                </div>

                <Card>
                    <CardHeader className="pb-3">
                        <CardTitle className="text-base font-semibold">Detalle y Configuración del Pedido</CardTitle>
                    </CardHeader>
                    <CardContent>
                        <PedidoForm
                            centros={alcance.centros.map((c) => ({ id: c.id, nombre: c.nombre }))}
                            bodegas={alcance.bodegas.map((b) => ({ id: b.id, nombre: b.nombre, centroId: b.centroId }))}
                            centroIdInicial={alcance.centroId ?? alcance.centros[0]?.id ?? ""}
                            bodegaIdInicial={alcance.bodegaId}
                            puedeFiltrarCentro={alcance.puedeFiltrarCentro}
                        />
                    </CardContent>
                </Card>
            </div>
        </AppLayout>
    );
}

