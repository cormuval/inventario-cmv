import type * as React from "react";

// actions
import { listarLotesDisponibles } from "@/modules/orden-salida/actions/lotes-disponibles.action";

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
    const centroInicial = alcance.centroId ?? alcance.centros[0]?.id ?? null;
    const bodegaInicial = alcance.bodegaId ?? alcance.bodegas.find((bodega) => bodega.centroId === centroInicial)?.id ?? null;
    const [lotesIniciales, bodegasDestino] = puedeRegistrar
        ? await Promise.all([
              bodegaInicial ? listarLotesDisponibles(bodegaInicial).then((resultado) => resultado.lotes) : Promise.resolve([]),
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
                                stocks={lotesIniciales}
                                centroId={centroInicial}
                                bodegaId={bodegaInicial}
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

