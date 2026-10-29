import type * as React from "react";
import Link from "next/link";
import { ArrowLeft } from "lucide-react";

// components
import { AppLayout } from "@/shared/components/layout/app-layout";
import { RecepcionPrestamoView } from "@/modules/orden-entrada/components/recepcion-prestamo-view";

// lib
import { obtenerAlcanceInventario } from "@/shared/lib/inventario-alcance";

export const dynamic = "force-dynamic";

interface RecepcionPrestamosPageProps {
    searchParams?: Promise<{ codigo?: string }>;
}

export default async function RecepcionPrestamosPage({
    searchParams
}: RecepcionPrestamosPageProps): Promise<React.ReactElement> {
    const alcance = await obtenerAlcanceInventario();
    const resolvedParams = searchParams ? await searchParams : undefined;
    const codigoInicial = resolvedParams?.codigo ?? "";

    // Filtrar bodegas del centro asignado al usuario
    const bodegasDelCentro = alcance.bodegas.filter(
        (b) => b.centroId === alcance.centroId && b.estado
    );

    return (
        <AppLayout>
            <div className="space-y-6">
                <div>
                    <Link
                        href="/orden-entrada"
                        className="inline-flex items-center gap-1.5 text-xs text-teal-700 hover:text-teal-900 font-medium mb-2 transition"
                    >
                        <ArrowLeft className="h-3.5 w-3.5" />
                        <span>Volver a Órdenes de Entrada</span>
                    </Link>
                    <p className="text-sm text-muted-foreground">
                        Ingreso al stock de transferencias físicas en tránsito mediante código de validación
                    </p>
                    <h2 className="text-2xl font-semibold text-slate-900">
                        Recepción de Préstamos y Traspasos Intercentros
                    </h2>
                </div>

                <RecepcionPrestamoView
                    bodegasDisponibles={bodegasDelCentro}
                    codigoInicial={codigoInicial}
                />
            </div>
        </AppLayout>
    );
}
