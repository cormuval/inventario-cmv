import type * as React from "react";
import Link from "next/link";
import { PlusCircle, ShoppingCart } from "lucide-react";

// actions
import { listarPedidosAction } from "@/modules/pedidos/actions/consultar-pedidos.action";

// components
import { PedidosFiltros } from "@/modules/pedidos/components/pedidos-filtros";
import { PedidosTabla } from "@/modules/pedidos/components/pedidos-tabla";
import { Paginacion } from "@/shared/components/inventario/paginacion";
import { AppLayout } from "@/shared/components/layout/app-layout";
import { Card, CardContent, CardHeader, CardTitle } from "@/shared/components/ui/card";

// utils
import { leerPagina, obtenerParametro, type ParametrosUrl } from "@/shared/utils/filtros-registros";

export const dynamic = "force-dynamic";

interface PedidosPageProps {
    searchParams?: Promise<ParametrosUrl>;
}

export default async function PedidosPage({ searchParams }: PedidosPageProps): Promise<React.ReactElement> {
    const params = await searchParams;
    const centroId = obtenerParametro(params, "centroId");
    const tipo = obtenerParametro(params, "tipo");
    const estado = obtenerParametro(params, "estado");
    const periodo = obtenerParametro(params, "periodo");
    const busqueda = obtenerParametro(params, "busqueda");
    const pagina = leerPagina(obtenerParametro(params, "pagina"));

    const data = await listarPedidosAction({
        centroId,
        tipo,
        estado,
        periodo,
        busqueda,
        pagina
    });

    const parametrosUrl = {
        centroId: data.centroId,
        tipo,
        estado,
        periodo,
        busqueda
    };

    return (
        <AppLayout>
            <div className="space-y-6">
                <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
                    <div>
                        <div className="flex items-center gap-2">
                            <ShoppingCart className="h-6 w-6 text-primary" />
                            <h2 className="text-2xl font-semibold">Pedidos de Existencias de Aseo</h2>
                        </div>
                        <p className="text-sm text-muted-foreground mt-1">
                            Pedidos mensuales y suplementarios de aseo: arma el pedido, descárgalo en PDF o Excel y envíalo a Adquisiciones.
                        </p>
                    </div>
                    {data.puedeGestionar ? (
                    <Link
                        href="/pedidos/nuevo"
                        className="inline-flex items-center gap-1.5 rounded-md bg-primary text-primary-foreground h-9 px-4 text-sm font-medium hover:bg-primary/90 transition-colors"
                    >
                        <PlusCircle className="h-4 w-4" />
                        Nuevo Pedido
                    </Link>
                    ) : null}
                </div>

                <Card>
                    <CardHeader className="pb-3">
                        <CardTitle className="text-base font-semibold">Filtros de Búsqueda</CardTitle>
                    </CardHeader>
                    <CardContent>
                        <PedidosFiltros
                            centros={data.centros}
                            centroId={data.centroId}
                            tipo={tipo}
                            estado={estado}
                            periodo={periodo}
                            busqueda={busqueda}
                            puedeFiltrarCentro={data.puedeFiltrarCentro}
                        />
                    </CardContent>
                </Card>

                <Card>
                    <CardHeader className="pb-3">
                        <div className="flex items-center justify-between">
                            <CardTitle className="text-base font-semibold">Historial de Pedidos</CardTitle>
                            <span className="text-xs text-muted-foreground">
                                Total registros: {data.paginacion.total}
                            </span>
                        </div>
                    </CardHeader>
                    <CardContent className="space-y-4">
                        <PedidosTabla pedidos={data.pedidos} />
                        <Paginacion paginacion={data.paginacion} ruta="/pedidos" parametros={parametrosUrl} />
                    </CardContent>
                </Card>
            </div>
        </AppLayout>
    );
}

