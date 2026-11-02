import type * as React from "react";

// actions
import { listarProductosActivos } from "@/modules/productos/actions/productos.action";

// components
import { OrdenEntradaForm } from "@/modules/orden-entrada/components/orden-entrada-form";
import { SinPermisoRegistro } from "@/shared/components/inventario/sin-permiso-registro";
import { AppLayout } from "@/shared/components/layout/app-layout";
import { Card, CardContent, CardHeader, CardTitle } from "@/shared/components/ui/card";

// lib
import { puedeOperarEntrada } from "@/shared/lib/auth";
import { obtenerAlcanceInventario } from "@/shared/lib/inventario-alcance";

export const dynamic = "force-dynamic";

export default async function NuevaEntradaPage(): Promise<React.ReactElement> {
    const alcance = await obtenerAlcanceInventario();
    const puedeRegistrar = puedeOperarEntrada(alcance.usuario.rol);
    const productos = puedeRegistrar ? await listarProductosActivos() : [];

    return (
        <AppLayout>
            <div className="space-y-6">
                <div>
                    <p className="text-sm text-muted-foreground">Recepción de productos y aumento de stock</p>
                    <h2 className="text-2xl font-semibold">Nueva entrada</h2>
                </div>
                {puedeRegistrar ? (
                    <Card>
                        <CardHeader>
                            <CardTitle>Nueva entrada</CardTitle>
                        </CardHeader>
                        <CardContent>
                            <OrdenEntradaForm
                                centros={alcance.centros}
                                bodegas={alcance.bodegas}
                                productos={productos}
                                centroId={alcance.centroId}
                                bodegaId={alcance.bodegaId}
                                puedeFiltrarCentro={alcance.puedeFiltrarCentro}
                            />
                        </CardContent>
                    </Card>
                ) : (
                    <SinPermisoRegistro
                        mensaje="Tu rol no permite registrar entradas."
                        hrefRegistros="/entradas/registros"
                        etiquetaRegistros="Ver registros de entrada"
                    />
                )}
            </div>
        </AppLayout>
    );
}
