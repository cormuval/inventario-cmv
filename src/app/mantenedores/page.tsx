import { redirect } from "next/navigation";
import type * as React from "react";
import { Suspense } from "react";

// actions
import { listarMantenedores } from "@/modules/mantenedores/actions/mantenedores.action";

// lib
import { puedeAdministrar, requireSessionUser } from "@/shared/lib/auth";

// components
import { MantenedoresTabs } from "@/modules/mantenedores/components/mantenedores-tabs";
import { AppLayout } from "@/shared/components/layout/app-layout";

export const dynamic = "force-dynamic";

export default async function MantenedoresPage(): Promise<React.ReactElement> {
    const sessionUser = await requireSessionUser();

    if (!puedeAdministrar(sessionUser.rol)) {
        redirect("/");
    }

    const data = await listarMantenedores();

    return (
        <AppLayout>
            <div className="space-y-6">
                <div>
                    <p className="text-sm text-muted-foreground">
                        Gestión y configuración de entidades base del sistema de inventario de salud primaria
                    </p>
                    <h2 className="text-2xl font-semibold">Mantenedores</h2>
                </div>
                <Suspense fallback={<p className="text-sm text-muted-foreground">Cargando mantenedores…</p>}>
                    <MantenedoresTabs
                        centros={data.centros}
                        bodegas={data.bodegas}
                        roles={data.roles}
                        usuarios={data.usuarios}
                        unidades={data.unidades}
                        currentUserId={sessionUser.id}
                    />
                </Suspense>
            </div>
        </AppLayout>
    );
}
