"use client";

import * as React from "react";
import { useEffect, useMemo, useState, useActionState } from "react";
import type { Bodega, Centro, Rol } from "@prisma/client";
import { X } from "lucide-react";

// actions
import { editarUsuario } from "@/modules/mantenedores/actions/mantenedores.action";

// components
import { BodegasMultiSelect } from "@/modules/mantenedores/components/bodegas-multi-select";
import { ActionMessage } from "@/shared/components/ui/action-message";
import { Button } from "@/shared/components/ui/button";
import { FormSubmit } from "@/shared/components/ui/form-submit";
import { Input } from "@/shared/components/ui/input";
import { Select } from "@/shared/components/ui/select";

// types
import { initialActionState } from "@/shared/types/action-state";

export interface UsuarioConDetalles {
    id: string;
    nombre: string;
    apPaterno: string | null;
    apMaterno: string | null;
    email: string;
    telefono: string | null;
    rolId: string;
    centroId: string;
    bodegaId?: string | null;
    estado: boolean;
    encargos?: Array<{
        bodegaId: string;
        bodega?: { id: string; nombre: string };
    }>;
}

interface UsuarioEditModalProps {
    usuario: UsuarioConDetalles;
    currentUserId: string;
    centros: Centro[];
    bodegas: Bodega[];
    roles: Rol[];
    onClose: () => void;
}

export function UsuarioEditModal({
    usuario,
    currentUserId,
    centros,
    bodegas,
    roles,
    onClose
}: UsuarioEditModalProps): React.ReactElement {
    const [state, formAction] = useActionState(editarUsuario, initialActionState);
    const [selectedCentroId, setSelectedCentroId] = useState(usuario.centroId);

    const isSelf = usuario.id === currentUserId;

    const initialBodegaIds = React.useMemo(() => {
        if (usuario.encargos && usuario.encargos.length > 0) {
            return usuario.encargos.map((e) => e.bodegaId);
        }
        return usuario.bodegaId ? [usuario.bodegaId] : [];
    }, [usuario]);

    // Cerrar automáticamente tras guardar con éxito
    useEffect(() => {
        if (state.ok) {
            const timer = setTimeout(() => {
                onClose();
            }, 800);
            return () => clearTimeout(timer);
        }
    }, [state.ok, onClose]);

    // Cerrar con tecla Escape
    useEffect(() => {
        const handleKeyDown = (e: KeyboardEvent) => {
            if (e.key === "Escape") {
                onClose();
            }
        };
        window.addEventListener("keydown", handleKeyDown);
        return () => window.removeEventListener("keydown", handleKeyDown);
    }, [onClose]);

    return (
        <div
            className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4"
            role="dialog"
            aria-modal="true"
            aria-labelledby="modal-editar-usuario-titulo"
        >
            <div className="max-h-[90vh] w-full max-w-2xl overflow-hidden rounded-lg border bg-background shadow-xl">
                <div className="flex items-center justify-between border-b px-5 py-3.5">
                    <div>
                        <h3 id="modal-editar-usuario-titulo" className="text-base font-semibold">
                            Editar Usuario
                        </h3>
                        <p className="text-xs text-muted-foreground">
                            Actualiza los datos, rol y bodegas asignadas de {usuario.email}
                        </p>
                    </div>
                    <Button
                        type="button"
                        variant="ghost"
                        size="sm"
                        onClick={onClose}
                        aria-label="Cerrar modal"
                    >
                        <X className="h-4 w-4" />
                    </Button>
                </div>

                <div className="max-h-[75vh] overflow-y-auto p-5">
                    <form action={formAction} className="grid gap-4 md:grid-cols-2">
                        <input type="hidden" name="id" value={usuario.id} />

                        <div className="space-y-1">
                            <label className="text-xs font-medium text-muted-foreground">Nombre</label>
                            <Input name="nombre" required defaultValue={usuario.nombre} placeholder="Nombre" />
                        </div>

                        <div className="space-y-1">
                            <label className="text-xs font-medium text-muted-foreground">Apellido paterno</label>
                            <Input
                                name="apPaterno"
                                required
                                defaultValue={usuario.apPaterno ?? ""}
                                placeholder="Apellido paterno"
                            />
                        </div>

                        <div className="space-y-1">
                            <label className="text-xs font-medium text-muted-foreground">Apellido materno</label>
                            <Input
                                name="apMaterno"
                                defaultValue={usuario.apMaterno ?? ""}
                                placeholder="Apellido materno"
                            />
                        </div>

                        <div className="space-y-1">
                            <label className="text-xs font-medium text-muted-foreground">Correo institucional</label>
                            <Input
                                type="email"
                                name="email"
                                required
                                defaultValue={usuario.email}
                                placeholder="correo@cmvalparaiso.cl"
                            />
                        </div>

                        <div className="space-y-1">
                            <label className="text-xs font-medium text-muted-foreground">Teléfono</label>
                            <Input
                                name="telefono"
                                defaultValue={usuario.telefono ?? ""}
                                placeholder="+56 9 ..."
                            />
                        </div>

                        <div className="space-y-1">
                            <label className="text-xs font-medium text-muted-foreground">Rol</label>
                            {isSelf ? (
                                <>
                                    <input type="hidden" name="rolId" value="R01" />
                                    <div className="rounded-md border bg-muted/60 px-3 py-2 text-xs font-medium text-muted-foreground">
                                        R01 · Administrador (Tu rol propio no puede modificarse)
                                    </div>
                                </>
                            ) : (
                                <Select name="rolId" required defaultValue={usuario.rolId}>
                                    {roles.map((rol) => (
                                        <option key={rol.id} value={rol.id}>
                                            {rol.id} · {rol.descripcion}
                                        </option>
                                    ))}
                                </Select>
                            )}
                        </div>

                        <div className="space-y-1 md:col-span-2">
                            <label className="text-xs font-medium text-muted-foreground">Centro de salud</label>
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
                        </div>

                        <div className="md:col-span-2">
                            <BodegasMultiSelect
                                bodegas={bodegas}
                                centroIdSeleccionado={selectedCentroId}
                                selectedBodegaIds={initialBodegaIds}
                            />
                        </div>

                        <div className="md:col-span-2">
                            {isSelf ? (
                                <>
                                    <input type="hidden" name="estado" value="true" />
                                    <div className="rounded-md border border-amber-200 bg-amber-50 p-2.5 text-xs text-amber-800">
                                        Esta es tu propia cuenta activa. Por seguridad, no puedes desactivarte a ti mismo.
                                    </div>
                                </>
                            ) : (
                                <label className="flex items-center gap-2 text-sm">
                                    <input
                                        type="checkbox"
                                        name="estado"
                                        defaultChecked={usuario.estado}
                                        className="h-4 w-4 rounded border-gray-300 text-primary focus:ring-primary"
                                    />
                                    <span>Usuario activo en el sistema</span>
                                </label>
                            )}
                        </div>

                        <div className="flex items-center justify-end gap-3 pt-2 md:col-span-2">
                            <Button type="button" variant="outline" size="sm" onClick={onClose}>
                                Cancelar
                            </Button>
                            <FormSubmit label="Guardar cambios" />
                        </div>

                        {state.message && (
                            <div className="md:col-span-2">
                                <ActionMessage state={state} />
                            </div>
                        )}
                    </form>
                </div>
            </div>
        </div>
    );
}
