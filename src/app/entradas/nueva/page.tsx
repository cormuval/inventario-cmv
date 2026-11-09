import type * as React from "react";
import Link from "next/link";
import { ArrowRight } from "lucide-react";

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
                <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
                    <div>
                        <p className="text-sm text-muted-foreground">Recepción de productos y aumento de stock</p>
                        <h2 className="text-2xl font-semibold">Nueva entrada</h2>
                    </div>
                    {puedeRegistrar ? (
                        <Link
                            href="/orden-entrada/recepcion-prestamos"
                            className="inline-flex items-center gap-2 rounded-lg border border-teal-300 bg-teal-50 px-3.5 py-2 text-xs font-semibold text-teal-900 shadow-sm transition hover:bg-teal-100 self-start sm:self-auto"
                        >
                            <span>Recepcionar Préstamo Intercentros (Código)</span>
                            <ArrowRight className="h-4 w-4 text-teal-700" />
                        </Link>
                    ) : null}
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
