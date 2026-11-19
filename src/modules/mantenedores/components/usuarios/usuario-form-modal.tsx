"use client";

import * as React from "react";
import { useEffect, useState, useActionState } from "react";
import type { Bodega, Centro, Rol } from "@prisma/client";
import { X } from "lucide-react";
import { toast } from "sonner";

// actions
import { crearUsuario } from "@/modules/mantenedores/actions/mantenedores.action";

// components
import { BodegasMultiSelect } from "@/modules/mantenedores/components/bodegas-multi-select";
import { ActionMessage } from "@/shared/components/ui/action-message";
import { Button } from "@/shared/components/ui/button";
import { FormSubmit } from "@/shared/components/ui/form-submit";
import { Input } from "@/shared/components/ui/input";
import { Select } from "@/shared/components/ui/select";

// types
import { initialActionState } from "@/shared/types/action-state";

interface UsuarioFormModalProps {
    centros: Centro[];
    bodegas: Bodega[];
    roles: Rol[];
    isOpen: boolean;
    onClose: () => void;
}

export function UsuarioFormModal({
    centros,
    bodegas,
    roles,
    isOpen,
    onClose
}: UsuarioFormModalProps): React.ReactElement | null {
    const [state, formAction] = useActionState(crearUsuario, initialActionState);
    const [selectedCentroId, setSelectedCentroId] = useState<string>(centros[0]?.id || "");

    useEffect(() => {
        if (state.ok) {
            toast.success(state.message);
            const timer = setTimeout(() => {
                onClose();
            }, 600);
            return () => clearTimeout(timer);
        } else if (state.message) {
            toast.error(state.message);
        }
    }, [state, onClose]);

    useEffect(() => {
        if (!isOpen) return;
        const handleKeyDown = (e: KeyboardEvent) => {
            if (e.key === "Escape") onClose();
        };
        window.addEventListener("keydown", handleKeyDown);
        return () => window.removeEventListener("keydown", handleKeyDown);
    }, [isOpen, onClose]);

    if (!isOpen) return null;

    return (
        <div
            className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4 animate-in fade-in duration-200"
            role="dialog"
            aria-modal="true"
        >
            <div className="relative w-full max-w-2xl rounded-lg border bg-background p-6 shadow-xl max-h-[90vh] overflow-y-auto">
                <div className="flex items-center justify-between pb-4 border-b">
                    <div>
                        <h3 className="text-lg font-semibold">Nuevo Usuario</h3>
                        <p className="text-xs text-muted-foreground mt-0.5">
                            Registra un nuevo usuario con cuenta institucional Google y alcance operativo.
                        </p>
                    </div>
                    <Button variant="ghost" size="sm" onClick={onClose} aria-label="Cerrar modal">
                        <X className="h-4 w-4" />
                    </Button>
                </div>

                <form action={formAction} className="space-y-4 pt-4">
                    <div className="grid gap-3 sm:grid-cols-2">
                        <div className="space-y-1 text-sm">
                            <label className="font-medium">Nombre *</label>
                            <Input name="nombre" required placeholder="Nombre" />
                        </div>
                        <div className="space-y-1 text-sm">
                            <label className="font-medium">Apellido paterno *</label>
                            <Input name="apPaterno" required placeholder="Apellido paterno" />
                        </div>
                        <div className="space-y-1 text-sm">
                            <label className="font-medium">Apellido materno</label>
                            <Input name="apMaterno" placeholder="Apellido materno (opcional)" />
                        </div>
                        <div className="space-y-1 text-sm">
                            <label className="font-medium">Correo institucional *</label>
                            <Input
                                type="email"
                                name="email"
                                required
                                placeholder="usuario@cmvalparaiso.cl"
                            />
                        </div>
                        <div className="space-y-1 text-sm">
                            <label className="font-medium">Teléfono</label>
                            <Input name="telefono" placeholder="+56 9 1234 5678" />
                        </div>
                        <div className="space-y-1 text-sm">
                            <label className="font-medium">Rol del sistema *</label>
                            <Select name="rolId" required defaultValue="R07">
                                {roles.map((rol) => (
                                    <option key={rol.id} value={rol.id}>
                                        {rol.id} · {rol.descripcion}
                                    </option>
                                ))}
                            </Select>
                        </div>
                        <div className="space-y-1 text-sm sm:col-span-2">
                            <label className="font-medium">Centro de salud principal *</label>
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
                        <div className="sm:col-span-2">
                            <BodegasMultiSelect
                                bodegas={bodegas}
                                centroIdSeleccionado={selectedCentroId}
                            />
                        </div>
                    </div>

                    <label className="flex items-center gap-2 text-sm cursor-pointer select-none">
                        <input
                            type="checkbox"
                            name="estado"
                            value="true"
                            defaultChecked
                            className="rounded border-input text-primary focus:ring-primary"
                        />
                        <span className="font-medium">Usuario Activo</span>
                    </label>

                    <ActionMessage state={state} />

                    <div className="flex items-center justify-end gap-3 pt-3 border-t">
                        <Button type="button" variant="outline" onClick={onClose}>
                            Cancelar
                        </Button>
                        <FormSubmit label="Crear usuario" />
                    </div>
                </form>
            </div>
        </div>
    );
}
