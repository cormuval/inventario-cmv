import type * as React from "react";
import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowLeft, ShoppingCart } from "lucide-react";

// actions
import { obtenerPedidoPorIdAction } from "@/modules/pedidos/actions/consultar-pedidos.action";

// components
import { BotonDescargarPedido } from "@/modules/pedidos/components/boton-descargar-pedido";
import { PedidoForm } from "@/modules/pedidos/components/pedido-form";
import { PedidoDetalle } from "@/modules/pedidos/components/pedido-detalle";
import { Badge } from "@/shared/components/ui/badge";
import { AppLayout } from "@/shared/components/layout/app-layout";
import { Card, CardContent, CardHeader, CardTitle } from "@/shared/components/ui/card";

// lib
import { obtenerAlcanceInventario } from "@/shared/lib/inventario-alcance";

// utils
import { formatDate } from "@/shared/utils/format";

export const dynamic = "force-dynamic";

interface PedidoDetallePageProps {
    params: Promise<{ id: string }>;
}

function renderBadgeEstado(estado: string): React.ReactElement {
    switch (estado) {
        case "BORRADOR":
            return <Badge tone="default">Borrador</Badge>;
        case "ENVIADO":
            return <Badge tone="success">Enviado</Badge>;
        case "ANULADO":
            return <Badge tone="danger">Anulado</Badge>;
        default:
            return <Badge tone="default">{estado}</Badge>;
    }
}

export default async function PedidoDetallePage({ params }: PedidoDetallePageProps): Promise<React.ReactElement> {
    const { id } = await params;
    const pedido = await obtenerPedidoPorIdAction(id);

    if (!pedido) {
        notFound();
    }

    const alcance = await obtenerAlcanceInventario({ centroId: pedido.centroId });

    return (
        <AppLayout>
            <div className="space-y-6">
                <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
                    <div>
                        <div className="flex items-center gap-3">
                            <ShoppingCart className="h-6 w-6 text-primary" />
                            <h2 className="text-2xl font-bold font-mono">{pedido.numero}</h2>
                            {renderBadgeEstado(pedido.estado)}
                        </div>
                        <p className="text-sm text-muted-foreground mt-1">
                            Pedido {pedido.tipo} {pedido.periodo ? `del período ${pedido.periodo}` : ""} — {pedido.centro.nombre}
                        </p>
                    </div>
                    <div className="flex items-center gap-2">
                        <BotonDescargarPedido pedidoId={pedido.id} numero={pedido.numero} />
                        <Link
                            href="/pedidos"
                            className="inline-flex items-center gap-1.5 rounded-md border border-input bg-background h-8 px-3 text-sm font-medium hover:bg-accent transition-colors"
                        >
                            <ArrowLeft className="h-4 w-4" />
                            Volver
                        </Link>
                    </div>
                </div>

                <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
                    <Card>
                        <CardContent className="pt-4 pb-4">
                            <p className="text-xs text-muted-foreground">Centro Solicitante</p>
                            <p className="font-semibold text-sm mt-0.5">{pedido.centro.nombre}</p>
                            <p className="text-xs text-muted-foreground mt-0.5">
                                Bodega: {pedido.bodega?.nombre ?? "Todas las bodegas"}
                            </p>
                        </CardContent>
                    </Card>

                    <Card>
                        <CardContent className="pt-4 pb-4">
                            <p className="text-xs text-muted-foreground">Solicitado por</p>
                            <p className="font-semibold text-sm mt-0.5">
                                {pedido.usuarioSolicitante.nombre} {pedido.usuarioSolicitante.apPaterno ?? ""}
                            </p>
                            <p className="text-xs text-muted-foreground mt-0.5">
                                Fecha: {formatDate(pedido.fechaSolicitud)}
                            </p>
                        </CardContent>
                    </Card>

                    <Card>
                        <CardContent className="pt-4 pb-4">
                            <p className="text-xs text-muted-foreground">Estado</p>
                            <p className="font-semibold text-sm mt-0.5">
                                {pedido.estado === "ANULADO"
                                    ? "Anulado"
                                    : pedido.estado === "ENVIADO"
                                      ? "Enviado"
                                      : "Borrador"}
                            </p>
                            <p className="text-xs text-muted-foreground mt-0.5">
                                {pedido.estado === "ANULADO" && pedido.fechaAnulacion
                                    ? `Fecha: ${formatDate(pedido.fechaAnulacion)}`
                                    : pedido.fechaEnvio
                                      ? `Enviado el ${formatDate(pedido.fechaEnvio)}`
                                      : "Aún no enviado"}
                            </p>
                        </CardContent>
                    </Card>

                    <Card>
                        <CardContent className="pt-4 pb-4">
                            <p className="text-xs text-muted-foreground">Tipo y Período</p>
                            <p className="font-semibold text-sm mt-0.5">{pedido.tipo}</p>
                            <p className="text-xs text-muted-foreground mt-0.5">
                                {pedido.periodo ? `Mes: ${pedido.periodo}` : "Extraordinario"}
                            </p>
                        </CardContent>
                    </Card>
                </div>

                {pedido.observaciones ? (
                    <div className="rounded-lg border bg-muted/30 p-3 text-sm">
                        <span className="font-semibold text-foreground">Observaciones del solicitante:</span>{" "}
                        <span className="text-muted-foreground">{pedido.observaciones}</span>
                    </div>
                ) : null}

                {pedido.motivoAnulacion ? (
                    <div className="rounded-lg border border-rose-200 bg-rose-50/60 p-3 text-sm">
                        <span className="font-semibold text-rose-900">Motivo de anulación:</span>{" "}
                        <span className="text-rose-800">{pedido.motivoAnulacion}</span>
                    </div>
                ) : null}

                <Card>
                    <CardHeader className="pb-3">
                        <CardTitle className="text-base font-semibold">
                            {pedido.estado === "BORRADOR" && pedido.puedeGestionar ? "Edición de borrador" : "Detalle del pedido"}
                        </CardTitle>
                    </CardHeader>
                    <CardContent>
                        {pedido.estado === "BORRADOR" && pedido.puedeGestionar ? (
                            <PedidoForm
                                centros={alcance.centros.map((c) => ({ id: c.id, nombre: c.nombre }))}
                                bodegas={alcance.bodegas.map((b) => ({ id: b.id, nombre: b.nombre, centroId: b.centroId }))}
                                centroIdInicial={pedido.centroId}
                                bodegaIdInicial={pedido.bodegaId}
                                puedeFiltrarCentro={alcance.puedeFiltrarCentro}
                                pedidoExistente={{
                                    id: pedido.id,
                                    numero: pedido.numero,
                                    tipo: pedido.tipo,
                                    periodo: pedido.periodo,
                                    centroId: pedido.centroId,
                                    bodegaId: pedido.bodegaId,
                                    observaciones: pedido.observaciones,
                                    detalles: pedido.detalles.map((d) => ({
                                        productoId: d.productoId,
                                        cantidadSolicitada: d.cantidadSolicitada
                                    }))
                                }}
                            />
                        ) : null}
                        {pedido.estado === "BORRADOR" && pedido.puedeGestionar ? (
                            <div className="mt-6 border-t pt-4">
                                <PedidoDetalle pedido={pedido} puedeAnular mostrarDetalle={false} />
                            </div>
                        ) : (
                            <PedidoDetalle pedido={pedido} puedeAnular={pedido.puedeGestionar} />
                        )}
                    </CardContent>
                </Card>
            </div>
        </AppLayout>
    );
}

