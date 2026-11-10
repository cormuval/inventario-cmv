import { redirect } from "next/navigation";
import type * as React from "react";
import Link from "next/link";
import { ArrowLeft } from "lucide-react";

// components
import { AppLayout } from "@/shared/components/layout/app-layout";
import { RecepcionPrestamoView } from "@/modules/orden-entrada/components/recepcion-prestamo-view";

// lib
import { puedeOperarEntrada } from "@/shared/lib/auth";
import { obtenerAlcanceInventario } from "@/shared/lib/inventario-alcance";

export const dynamic = "force-dynamic";

interface RecepcionPrestamosPageProps {
    searchParams?: Promise<{ codigo?: string }>;
}

export default async function RecepcionPrestamosPage({
    searchParams
}: RecepcionPrestamosPageProps): Promise<React.ReactElement> {
    const alcance = await obtenerAlcanceInventario();

    if (!puedeOperarEntrada(alcance.usuario.rol)) {
        redirect("/entradas/registros");
    }

    const resolvedParams = searchParams ? await searchParams : undefined;
    const codigoInicial = resolvedParams?.codigo ?? "";

    // Bodegas activas dentro del alcance de acceso del usuario
    const bodegasActivasAlcance = alcance.bodegas.filter((b) => b.estado);

    return (
        <AppLayout>
            <div className="space-y-6">
                <div>
                    <Link
                        href="/entradas/nueva"
                        className="inline-flex items-center gap-1.5 text-xs text-teal-700 hover:text-teal-900 font-medium mb-2 transition"
                    >
                        <ArrowLeft className="h-3.5 w-3.5" />
                        <span>Volver a Nueva entrada</span>
                    </Link>
                    <p className="text-sm text-muted-foreground">
                        Ingreso al stock de transferencias físicas en tránsito mediante código de validación
                    </p>
                    <h2 className="text-2xl font-semibold text-slate-900">
                        Recepción de Préstamos y Traspasos Intercentros
                    </h2>
                </div>

                <RecepcionPrestamoView
                    bodegasDisponibles={bodegasActivasAlcance}
                    codigoInicial={codigoInicial}
                />
            </div>
        </AppLayout>
    );
}
