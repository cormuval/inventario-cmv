import type * as React from "react";

// actions
import { listarRegistrosSalida } from "@/modules/orden-salida/actions/registros-salida.action";

// components
import { RegistrosSalidaTabla } from "@/modules/orden-salida/components/registros-salida-tabla";
import { InventarioFiltros } from "@/shared/components/inventario/inventario-filtros";
import { Paginacion } from "@/shared/components/inventario/paginacion";
import { AppLayout } from "@/shared/components/layout/app-layout";
import { Card, CardContent, CardHeader, CardTitle } from "@/shared/components/ui/card";

// utils
import { fechaHoyChile, leerFiltrosRegistros, parametrosDeFiltros, type ParametrosUrl } from "@/shared/utils/filtros-registros";

export const dynamic = "force-dynamic";

interface RegistrosSalidaPageProps {
    searchParams?: Promise<ParametrosUrl>;
}

export default async function RegistrosSalidaPage({ searchParams }: RegistrosSalidaPageProps): Promise<React.ReactElement> {
    const filtros = leerFiltrosRegistros(await searchParams, fechaHoyChile());
    const resultado = await listarRegistrosSalida(filtros);

    return (
        <AppLayout>
            <div className="space-y-6">
                <div>
                    <p className="text-sm text-muted-foreground">Gestión de salida</p>
                    <h2 className="text-2xl font-semibold">Registros de salida</h2>
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
                            action="/salidas/registros"
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
                        <CardTitle>Salidas registradas</CardTitle>
                    </CardHeader>
                    <CardContent className="overflow-x-auto">
                        <RegistrosSalidaTabla filas={resultado.filas} puedeOperar={resultado.puedeOperar} />
                        <Paginacion ruta="/salidas/registros" parametros={parametrosDeFiltros(filtros)} paginacion={resultado.paginacion} />
                    </CardContent>
                </Card>
            </div>
        </AppLayout>
    );
}

