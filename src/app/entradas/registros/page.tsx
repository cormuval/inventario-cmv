import type * as React from "react";

// actions
import { listarRegistrosEntrada } from "@/modules/orden-entrada/actions/registros-entrada.action";

// components
import { RegistrosEntradaTabla } from "@/modules/orden-entrada/components/registros-entrada-tabla";
import { InventarioFiltros } from "@/shared/components/inventario/inventario-filtros";
import { Paginacion } from "@/shared/components/inventario/paginacion";
import { AppLayout } from "@/shared/components/layout/app-layout";
import { Card, CardContent, CardHeader, CardTitle } from "@/shared/components/ui/card";

// utils
import { fechaHoyChile, leerFiltrosRegistros, parametrosDeFiltros, type ParametrosUrl } from "@/shared/utils/filtros-registros";

export const dynamic = "force-dynamic";

interface RegistrosEntradaPageProps {
    searchParams?: Promise<ParametrosUrl>;
}

export default async function RegistrosEntradaPage({ searchParams }: RegistrosEntradaPageProps): Promise<React.ReactElement> {
    const filtros = leerFiltrosRegistros(await searchParams, fechaHoyChile());
    const resultado = await listarRegistrosEntrada(filtros);

    return (
        <AppLayout>
            <div className="space-y-6">
                <div>
                    <p className="text-sm text-muted-foreground">Gestión de entrada</p>
                    <h2 className="text-2xl font-semibold">Registros de entrada</h2>
                </div>
                <Card>
                    <CardHeader>
                        <CardTitle>Filtros</CardTitle>
                    </CardHeader>
                    <CardContent className="space-y-3">
                        {filtros.avisos.map((aviso) => (
                            <p key={aviso} role="status" className="rounded-md border border-amber-200 bg-amber-50 px-3 py-2 text-sm text-amber-900">
                                {aviso}
                            </p>
                        ))}
                        <InventarioFiltros
                            action="/entradas/registros"
                            centros={resultado.centros}
                            bodegas={resultado.bodegas}
                            centroId={resultado.centroId}
                            bodegaId={resultado.bodegaId}
                            puedeFiltrarCentro={resultado.puedeFiltrarCentro}
                            mostrarRangoFechas
                            desde={filtros.desde}
                            hasta={filtros.hasta}
                        />
                    </CardContent>
                </Card>
                <Card>
                    <CardHeader>
                        <CardTitle>Entradas registradas</CardTitle>
                    </CardHeader>
                    <CardContent className="overflow-x-auto">
                        <RegistrosEntradaTabla filas={resultado.filas} />
                        <Paginacion ruta="/entradas/registros" parametros={parametrosDeFiltros(filtros)} paginacion={resultado.paginacion} />
                    </CardContent>
                </Card>
            </div>
        </AppLayout>
    );
}
