import type * as React from "react";
import Link from "next/link";
import { History } from "lucide-react";

// actions
import { listarStockConsolidado, type SortDirection, type StockSortKey } from "@/modules/stock/actions/stock.action";

// components
import { StockTable } from "@/modules/stock/components/stock-table";
import { InventarioFiltros } from "@/shared/components/inventario/inventario-filtros";
import { Paginacion } from "@/shared/components/inventario/paginacion";
import { AppLayout } from "@/shared/components/layout/app-layout";
import { Card, CardContent, CardHeader, CardTitle } from "@/shared/components/ui/card";
import { Select } from "@/shared/components/ui/select";

// utils
import { leerPagina, obtenerParametro, type ParametrosUrl } from "@/shared/utils/filtros-registros";

export const dynamic = "force-dynamic";

interface StockPageProps {
    searchParams?: Promise<ParametrosUrl>;
}

export default async function StockPage({ searchParams }: StockPageProps): Promise<React.ReactElement> {
    const params = await searchParams;
    const data = await listarStockConsolidado({
        centroId: obtenerParametro(params, "centroId"),
        bodegaId: obtenerParametro(params, "bodegaId"),
        busqueda: obtenerParametro(params, "q"),
        linea: obtenerParametro(params, "linea"),
        bajoMinimo: obtenerParametro(params, "bajoMinimo") === "1",
        porCaducar: obtenerParametro(params, "porCaducar") === "1",
        sort: obtenerSort(obtenerParametro(params, "sort")),
        direction: obtenerDirection(obtenerParametro(params, "direction")),
        pagina: leerPagina(obtenerParametro(params, "pagina"))
    });
    const parametros = {
        centroId: data.centroId,
        bodegaId: data.bodegaId,
        q: data.busqueda,
        linea: data.linea,
        bajoMinimo: data.bajoMinimo ? "1" : undefined,
        porCaducar: data.porCaducar ? "1" : undefined
    };

    return (
        <AppLayout>
            <div className="space-y-6">
                <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
                    <div>
                        <p className="text-sm text-muted-foreground">Inventario consolidado por producto y bodega</p>
                        <h2 className="text-2xl font-semibold">Stock</h2>
                    </div>
                    <Link
                        href="/stock/historico"
                        className="inline-flex items-center gap-1.5 rounded-md border border-input bg-background h-8 px-3 text-sm font-medium hover:bg-accent transition-colors"
                    >
                        <History className="h-4 w-4" />
                        Consultar Stock Histórico
                    </Link>
                </div>
                <Card>
                    <CardHeader>
                        <CardTitle>Filtros</CardTitle>
                    </CardHeader>
                    <CardContent>
                        <InventarioFiltros
                            action="/stock"
                            centros={data.centros}
                            bodegas={data.bodegas}
                            centroId={data.centroId}
                            bodegaId={data.bodegaId}
                            puedeFiltrarCentro={data.puedeFiltrarCentro}
                            busqueda={data.busqueda}
                            mostrarBusqueda
                        >
                            <label className="space-y-1 text-sm">
                                <span>Línea</span>
                                <Select name="linea" defaultValue={data.linea}>
                                    <option value="">Todas las líneas</option>
                                    {data.lineas.map((linea) => (
                                        <option key={linea} value={linea}>
                                            {linea}
                                        </option>
                                    ))}
                                </Select>
                            </label>
                            <div className="flex flex-col justify-end gap-2 text-sm">
                                <label className="flex items-center gap-2">
                                    <input type="checkbox" name="bajoMinimo" value="1" defaultChecked={data.bajoMinimo} />
                                    Bajo stock mínimo
                                </label>
                                <label className="flex items-center gap-2">
                                    <input type="checkbox" name="porCaducar" value="1" defaultChecked={data.porCaducar} />
                                    Por caducar (30 días)
                                </label>
                            </div>
                        </InventarioFiltros>
                    </CardContent>
                </Card>
                <Card>
                    <CardHeader>
                        <CardTitle>Existencias</CardTitle>
                    </CardHeader>
                    <CardContent className="overflow-x-auto">
                        <StockTable
                            stocks={data.stocks}
                            sort={data.sort}
                            direction={data.direction}
                            parametros={parametros}
                        />
                        <Paginacion
                            ruta="/stock"
                            parametros={{ ...parametros, sort: data.sort, direction: data.direction }}
                            paginacion={data.paginacion}
                        />
                    </CardContent>
                </Card>
            </div>
        </AppLayout>
    );
}

function obtenerSort(value: string | undefined): StockSortKey | undefined {
    const permitidos: StockSortKey[] = ["centro", "bodega", "producto", "linea", "disponible", "minimo", "alerta"];
    return permitidos.includes(value as StockSortKey) ? (value as StockSortKey) : undefined;
}

function obtenerDirection(value: string | undefined): SortDirection | undefined {
    return value === "desc" ? "desc" : value === "asc" ? "asc" : undefined;
}
