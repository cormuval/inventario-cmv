import type * as React from "react";

// actions
import { listarOrdenesSalida } from "@/modules/orden-salida/actions/orden-salida.action";

// components
import { OrdenSalidaForm } from "@/modules/orden-salida/components/orden-salida-form";
import { Card, CardContent, CardHeader, CardTitle } from "@/shared/components/ui/card";
import { Td, Th, Table } from "@/shared/components/ui/table";
import { AppLayout } from "@/shared/components/layout/app-layout";

// lib
import { prisma } from "@/shared/lib/prisma";
import { obtenerAlcanceInventario } from "@/shared/lib/inventario-alcance";

// utils
import { formatDate, formatNumber } from "@/shared/utils/format";

export const dynamic = "force-dynamic";

export default async function OrdenSalidaPage(): Promise<React.ReactElement> {
    const alcance = await obtenerAlcanceInventario();
    const centrosDisponiblesIds = alcance.centros.map((c) => c.id);
    const [ordenes, stocks, bodegasDestino] = await Promise.all([
        listarOrdenesSalida(),
        alcance.bodegaIds.length > 0
            ? prisma.stock.findMany({
                  where: {
                      cantidadDisponible: { gt: 0 },
                      bodegaId: { in: alcance.bodegaIds }
                  },
                  include: {
                      producto: { select: { descripcion: true } },
                      bodega: { select: { nombre: true } }
                  },
                  orderBy: [{ producto: { descripcion: "asc" } }, { fechaCaducidad: "asc" }]
              })
            : Promise.resolve([]),
        centrosDisponiblesIds.length > 0
            ? prisma.bodega.findMany({
                  where: {
                      centroId: { in: centrosDisponiblesIds },
                      estado: true
                  },
                  orderBy: { nombre: "asc" }
              })
            : Promise.resolve([])
    ]);

    return (
        <AppLayout>
            <div className="space-y-6">
                <div>
                    <p className="text-sm text-muted-foreground">Despacho y consumo con validacion de stock</p>
                    <h2 className="text-2xl font-semibold">Orden de salida</h2>
                </div>
                <Card>
                    <CardHeader>
                        <CardTitle>Nueva salida</CardTitle>
                    </CardHeader>
                    <CardContent>
                        <OrdenSalidaForm
                            centros={alcance.centros}
                            bodegas={alcance.bodegas}
                            bodegasDestino={bodegasDestino}
                            stocks={stocks}
                            centroId={alcance.centroId}
                            bodegaId={alcance.bodegaId}
                            puedeFiltrarCentro={alcance.puedeFiltrarCentro}
                        />
                    </CardContent>
                </Card>
                <Card>
                    <CardHeader>
                        <CardTitle>Salidas registradas</CardTitle>
                    </CardHeader>
                    <CardContent className="overflow-x-auto">
                        <Table>
                            <thead>
                                <tr>
                                    <Th>Fecha</Th>
                                    <Th>Tipo</Th>
                                    <Th>Destino</Th>
                                    <Th>Bodega</Th>
                                    <Th>Usuario</Th>
                                    <Th>Detalle</Th>
                                </tr>
                            </thead>
                            <tbody>
                                {ordenes.map((orden) => (
                                    <tr key={orden.id}>
                                        <Td>{formatDate(orden.fecha)}</Td>
                                        <Td>{orden.tipoSalida}</Td>
                                        <Td>{orden.destino}</Td>
                                        <Td>{orden.bodega.nombre}</Td>
                                        <Td>{orden.usuario.nombre} {orden.usuario.apPaterno}</Td>
                                        <Td>
                                            {orden.detalles.map((detalle) => (
                                                <div key={detalle.id}>
                                                    {detalle.producto.descripcion}: {formatNumber(detalle.cantidad)} · {detalle.lote}
                                                </div>
                                            ))}
                                        </Td>
                                    </tr>
                                ))}
                            </tbody>
                        </Table>
                    </CardContent>
                </Card>
            </div>
        </AppLayout>
    );
}
