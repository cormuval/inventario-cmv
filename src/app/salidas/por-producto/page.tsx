import type * as React from "react";

// actions
import { consultarSalidasProducto } from "@/modules/orden-salida/actions/salidas-producto.action";

// components
import { BuscadorProducto } from "@/modules/orden-salida/components/buscador-producto";
import { SalidasProductoResumen } from "@/modules/orden-salida/components/salidas-producto-resumen";
import { SalidasProductoTabla } from "@/modules/orden-salida/components/salidas-producto-tabla";
import { InventarioFiltros } from "@/shared/components/inventario/inventario-filtros";
import { Paginacion } from "@/shared/components/inventario/paginacion";
import { AppLayout } from "@/shared/components/layout/app-layout";
import { Card, CardContent, CardHeader, CardTitle } from "@/shared/components/ui/card";

// utils
import { leerProductoId } from "@/modules/orden-salida/utils/salidas-producto-consulta";
import {
    fechaHoyChile,
    leerFiltrosRegistros,
    obtenerParametro,
    parametrosDeFiltros,
    type ParametrosUrl
} from "@/shared/utils/filtros-registros";

export const dynamic = "force-dynamic";

interface SalidasPorProductoPageProps {
    searchParams?: Promise<ParametrosUrl>;
}

export default async function SalidasPorProductoPage({ searchParams }: SalidasPorProductoPageProps): Promise<React.ReactElement> {
    const params = await searchParams;
    const filtros = leerFiltrosRegistros(params, fechaHoyChile());
    const productoId = leerProductoId(obtenerParametro(params, "productoId"));
    const resultado = await consultarSalidasProducto(filtros, productoId);
    const parametros = parametrosDeFiltros(filtros);

    return (
        <AppLayout>
            <div className="space-y-6">
                <div>
                    <p className="text-sm text-muted-foreground">Gestión de salida</p>
                    <h2 className="text-2xl font-semibold">Salidas por producto</h2>
                </div>
                <Card>
                    <CardHeader>
                        <CardTitle>Producto y filtros</CardTitle>
                    </CardHeader>
                    <CardContent className="space-y-4">
                        <BuscadorProducto productoActual={resultado.producto} parametros={parametros} />
                        {filtros.avisos.map((aviso) => (
                            <p key={aviso} role="status" className="rounded-md border border-amber-200 bg-amber-50 px-3 py-2 text-sm text-amber-900">
                                {aviso}
                            </p>
                        ))}
                        {resultado.producto ? (
                            <InventarioFiltros
                                action={`/salidas/por-producto?productoId=${resultado.producto.id}`}
                                centros={resultado.centros}
                                bodegas={resultado.bodegas}
                                centroId={resultado.centroId}
                                bodegaId={resultado.bodegaId}
                                puedeFiltrarCentro={resultado.puedeFiltrarCentro}
                                mostrarRangoFechas
                                desde={filtros.desde}
                                hasta={filtros.hasta}
                            >
                                <input type="hidden" name="productoId" value={resultado.producto.id} />
                            </InventarioFiltros>
                        ) : null}
                    </CardContent>
                </Card>
                {resultado.producto ? (
                    <>
                        <Card>
                            <CardHeader>
                                <CardTitle>
                                    {resultado.producto.descripcion} #{resultado.producto.id}
                                </CardTitle>
                            </CardHeader>
                            <CardContent>
                                <SalidasProductoResumen total={resultado.total} porBodega={resultado.porBodega} porTipo={resultado.porTipo} />
                            </CardContent>
                        </Card>
                        <Card>
                            <CardHeader>
                                <CardTitle>Salidas</CardTitle>
                            </CardHeader>
                            <CardContent className="overflow-x-auto">
                                <SalidasProductoTabla lineas={resultado.lineas} />
                                <Paginacion
                                    ruta="/salidas/por-producto"
                                    parametros={{ ...parametros, productoId: resultado.producto.id }}
                                    paginacion={resultado.paginacion}
                                />
                            </CardContent>
                        </Card>
                    </>
                ) : (
                    <Card>
                        <CardContent className="py-10 text-center text-sm text-muted-foreground">
                            Busca un producto para ver sus salidas.
                        </CardContent>
                    </Card>
                )}
            </div>
        </AppLayout>
    );
}
