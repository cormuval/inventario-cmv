import type * as React from "react";

// components
import { OrdenSalidaForm } from "@/modules/orden-salida/components/orden-salida-form";
import { SinPermisoRegistro } from "@/shared/components/inventario/sin-permiso-registro";
import { AppLayout } from "@/shared/components/layout/app-layout";
import { Card, CardContent, CardHeader, CardTitle } from "@/shared/components/ui/card";

// lib
import { puedeOperarSalida } from "@/shared/lib/auth";
import { obtenerAlcanceInventario } from "@/shared/lib/inventario-alcance";
import { prisma } from "@/shared/lib/prisma";

export const dynamic = "force-dynamic";

export default async function NuevaSalidaPage(): Promise<React.ReactElement> {
    const alcance = await obtenerAlcanceInventario();
    const puedeRegistrar = puedeOperarSalida(alcance.usuario.rol);
    const centrosDisponiblesIds = alcance.centros.map((centro) => centro.id);
    const [stocks, bodegasDestino] = puedeRegistrar
        ? await Promise.all([
              alcance.bodegaIds.length > 0
                  ? prisma.stock.findMany({
                        where: { cantidadDisponible: { gt: 0 }, bodegaId: { in: alcance.bodegaIds } },
                        include: {
                            producto: { select: { descripcion: true } },
                            bodega: { select: { nombre: true } }
                        },
                        orderBy: [{ producto: { descripcion: "asc" } }, { fechaCaducidad: "asc" }]
                    })
                  : Promise.resolve([]),
              centrosDisponiblesIds.length > 0
                  ? prisma.bodega.findMany({
                        where: { centroId: { in: centrosDisponiblesIds }, estado: true },
                        orderBy: { nombre: "asc" }
                    })
                  : Promise.resolve([])
          ])
        : [[], []];

    return (
        <AppLayout>
            <div className="space-y-6">
                <div>
                    <p className="text-sm text-muted-foreground">Despacho y consumo con validación de stock</p>
                    <h2 className="text-2xl font-semibold">Nueva salida</h2>
                </div>
                {puedeRegistrar ? (
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
                ) : (
                    <SinPermisoRegistro
                        mensaje="Tu rol no permite registrar salidas."
                        hrefRegistros="/salidas/registros"
                        etiquetaRegistros="Ver registros de salida"
                    />
                )}
            </div>
        </AppLayout>
    );
}
