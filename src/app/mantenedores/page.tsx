import type * as React from "react";

// actions
import { listarMantenedores } from "@/modules/mantenedores/actions/mantenedores.action";

// lib
import { requireSessionUser } from "@/shared/lib/auth";

// components
import { BodegaForm, CentroForm, UnidadForm, UsuarioForm } from "@/modules/mantenedores/components/mantenedores-forms";
import { UsuariosTabla } from "@/modules/mantenedores/components/usuarios-tabla";
import { Card, CardContent, CardHeader, CardTitle } from "@/shared/components/ui/card";
import { AppLayout } from "@/shared/components/layout/app-layout";

export const dynamic = "force-dynamic";

export default async function MantenedoresPage(): Promise<React.ReactElement> {
    const [data, sessionUser] = await Promise.all([
        listarMantenedores(),
        requireSessionUser()
    ]);

    return (
        <AppLayout>
            <div className="space-y-6">
                <div>
                    <p className="text-sm text-muted-foreground">Gestión de centros de salud, bodegas, unidades y usuarios del sistema</p>
                    <h2 className="text-2xl font-semibold">Mantenedores</h2>
                </div>
                <section className="grid gap-4 lg:grid-cols-3">
                    <Card>
                        <CardHeader>
                            <CardTitle>Centro</CardTitle>
                        </CardHeader>
                        <CardContent>
                            <CentroForm />
                        </CardContent>
                    </Card>
                    <Card>
                        <CardHeader>
                            <CardTitle>Bodega</CardTitle>
                        </CardHeader>
                        <CardContent>
                            <BodegaForm centros={data.centros} />
                        </CardContent>
                    </Card>
                    <Card>
                        <CardHeader>
                            <CardTitle>Unidad</CardTitle>
                        </CardHeader>
                        <CardContent>
                            <UnidadForm />
                        </CardContent>
                    </Card>
                </section>
                <Card>
                    <CardHeader>
                        <CardTitle>Usuario</CardTitle>
                    </CardHeader>
                    <CardContent>
                        <UsuarioForm centros={data.centros} bodegas={data.bodegas} roles={data.roles} />
                    </CardContent>
                </Card>
                <Card>
                    <CardHeader>
                        <CardTitle>Usuarios registrados</CardTitle>
                    </CardHeader>
                    <CardContent>
                        <UsuariosTabla
                            usuarios={data.usuarios}
                            currentUserId={sessionUser.id}
                            centros={data.centros}
                            bodegas={data.bodegas}
                            roles={data.roles}
                        />
                    </CardContent>
                </Card>
            </div>
        </AppLayout>
    );
}
