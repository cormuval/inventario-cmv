import type * as React from "react";

// actions
import { listarLineasProductos, listarProductosPaginados } from "@/modules/productos/actions/productos.action";

// lib
import { puedeAdministrar, requireSessionUser } from "@/shared/lib/auth";

// components
import { ProductoForm } from "@/modules/productos/components/producto-form";
import { ProductosFiltros } from "@/modules/productos/components/productos-filtros";
import { Badge } from "@/shared/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/shared/components/ui/card";
import { Paginacion } from "@/shared/components/inventario/paginacion";
import { Td, Th, Table } from "@/shared/components/ui/table";
import { AppLayout } from "@/shared/components/layout/app-layout";

// utils
import { leerFiltrosProductos, parametrosProductos } from "@/modules/productos/utils/productos-filtros";
import type { ParametrosUrl } from "@/shared/utils/filtros-registros";

export const dynamic = "force-dynamic";

interface ProductosPageProps {
    searchParams?: Promise<ParametrosUrl>;
}

export default async function ProductosPage({ searchParams }: ProductosPageProps): Promise<React.ReactElement> {
    const params = await searchParams;
    const [lineas, sessionUser] = await Promise.all([
        listarLineasProductos(),
        requireSessionUser()
    ]);
    const filtros = leerFiltrosProductos(params, lineas);
    const resultado = await listarProductosPaginados(filtros);
    const puedeCrear = puedeAdministrar(sessionUser.rol);

    return (
        <AppLayout>
            <div className="space-y-6">
                <div>
                    <p className="text-sm text-muted-foreground">Catalogo base para movimientos</p>
                    <h2 className="text-2xl font-semibold">Productos</h2>
                </div>
                {puedeCrear ? (
                    <Card>
                        <CardHeader>
                            <CardTitle>Nuevo producto</CardTitle>
                        </CardHeader>
                        <CardContent>
                            <ProductoForm />
                        </CardContent>
                    </Card>
                ) : null}
                <Card>
                    <CardHeader>
                        <CardTitle>Filtros</CardTitle>
                    </CardHeader>
                    <CardContent>
                        <ProductosFiltros filtros={filtros} lineas={lineas} />
                    </CardContent>
                </Card>
                {filtros.advertencias.length > 0 ? (
                    <div role="alert" className="rounded-md border border-amber-300 bg-amber-50 px-4 py-3 text-sm text-amber-900">
                        <ul className="list-disc space-y-1 pl-5">
                            {filtros.advertencias.map((advertencia) => (
                                <li key={advertencia}>{advertencia}</li>
                            ))}
                        </ul>
                    </div>
                ) : null}
                <Card>
                    <CardHeader>
                        <CardTitle>Productos registrados</CardTitle>
                    </CardHeader>
                    <CardContent className="overflow-x-auto">
                        <Table>
                            <thead>
                                <tr>
                                    <Th>ID</Th>
                                    <Th>Linea</Th>
                                    <Th>Descripcion</Th>
                                    <Th>Estado</Th>
                                </tr>
                            </thead>
                            <tbody>
                                {resultado.productos.map((producto) => (
                                    <tr key={producto.id}>
                                        <Td>{producto.id}</Td>
                                        <Td>{producto.linea}</Td>
                                        <Td>{producto.descripcion}</Td>
                                        <Td>
                                            <Badge tone={producto.estado ? "success" : "muted"}>
                                                {producto.estado ? "Activo" : "Inactivo"}
                                            </Badge>
                                        </Td>
                                    </tr>
                                ))}
                                {resultado.productos.length === 0 ? (
                                    <tr>
                                        <Td colSpan={4} className="text-center text-muted-foreground">
                                            No se encontraron productos con los filtros seleccionados.
                                        </Td>
                                    </tr>
                                ) : null}
                            </tbody>
                        </Table>
                        <Paginacion
                            ruta="/productos"
                            parametros={parametrosProductos(filtros)}
                            paginacion={resultado.paginacion}
                            textoSinResultados="0 resultados"
                        />
                    </CardContent>
                </Card>
            </div>
        </AppLayout>
    );
}
