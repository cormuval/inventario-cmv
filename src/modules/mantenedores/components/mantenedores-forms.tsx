"use client";

import * as React from "react";
import { useActionState, useState } from "react";
import type { Bodega, Centro, Rol } from "@prisma/client";

// actions
import { crearBodega, crearCentro, crearUnidad, crearUsuario } from "@/modules/mantenedores/actions/mantenedores.action";

// components
import { BodegasMultiSelect } from "@/modules/mantenedores/components/bodegas-multi-select";
import { ActionMessage } from "@/shared/components/ui/action-message";
import { FormSubmit } from "@/shared/components/ui/form-submit";
import { Input } from "@/shared/components/ui/input";
import { Select } from "@/shared/components/ui/select";

// types
import { initialActionState } from "@/shared/types/action-state";

export function CentroForm(): React.ReactElement {
    const [state, formAction] = useActionState(crearCentro, initialActionState);
    return (
        <form action={formAction} className="space-y-3">
            <Input name="nombre" required placeholder="Nombre del centro" />
            <label className="flex items-center gap-2 text-sm">
                <input type="checkbox" name="estado" defaultChecked />
                Activo
            </label>
            <FormSubmit label="Crear centro" />
            <ActionMessage state={state} />
        </form>
    );
}

export function BodegaForm({ centros }: { centros: Centro[] }): React.ReactElement {
    const [state, formAction] = useActionState(crearBodega, initialActionState);
    return (
        <form action={formAction} className="space-y-3">
            <Input name="nombre" required placeholder="Nombre de bodega" />
            <Select name="centroId" required>
                {centros.map((centro) => (
                    <option key={centro.id} value={centro.id}>
                        {centro.nombre}
                    </option>
                ))}
            </Select>
            <label className="flex items-center gap-2 text-sm">
                <input type="checkbox" name="estado" defaultChecked />
                Activa
            </label>
            <FormSubmit label="Crear bodega" />
            <ActionMessage state={state} />
        </form>
    );
}

export function UnidadForm(): React.ReactElement {
    const [state, formAction] = useActionState(crearUnidad, initialActionState);
    return (
        <form action={formAction} className="space-y-3">
            <Input name="descripcion" required placeholder="Descripcion unidad" />
            <FormSubmit label="Crear unidad" />
            <ActionMessage state={state} />
        </form>
    );
}

export function UsuarioForm({
    centros,
    bodegas,
    roles
}: {
    centros: Centro[];
    bodegas: Bodega[];
    roles: Rol[];
}): React.ReactElement {
    const [state, formAction] = useActionState(crearUsuario, initialActionState);
    const [selectedCentroId, setSelectedCentroId] = React.useState<string>(centros[0]?.id || "");

    return (
        <form action={formAction} className="grid gap-3 md:grid-cols-2">
            <Input name="nombre" required placeholder="Nombre" />
            <Input name="apPaterno" required placeholder="Apellido paterno" />
            <Input name="apMaterno" placeholder="Apellido materno" />
            <Input type="email" name="email" required placeholder="correo@cmvalparaiso.cl" />
            <Input name="telefono" placeholder="Telefono" />
            <Select name="rolId" required defaultValue="R07">
                {roles.map((rol) => (
                    <option key={rol.id} value={rol.id}>
                        {rol.id} · {rol.descripcion}
                    </option>
                ))}
            </Select>
            <Select
                name="centroId"
                required
                value={selectedCentroId}
                onChange={(e) => setSelectedCentroId(e.target.value)}
            >
                {centros.map((centro) => (
                    <option key={centro.id} value={centro.id}>
                        {centro.nombre}
                    </option>
                ))}
            </Select>
            <div className="md:col-span-2">
                <BodegasMultiSelect
                    bodegas={bodegas}
                    centroIdSeleccionado={selectedCentroId}
                />
            </div>
            <label className="flex items-center gap-2 text-sm">
                <input type="checkbox" name="estado" defaultChecked />
                Activo
            </label>
            <div className="flex items-center gap-3 md:col-span-2">
                <FormSubmit label="Crear usuario" />
                <ActionMessage state={state} />
            </div>
        </form>
    );
}
