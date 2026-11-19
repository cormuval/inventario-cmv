"use client";

import * as React from "react";
import { useEffect, useActionState } from "react";
import type { Centro } from "@prisma/client";
import { X } from "lucide-react";
import { toast } from "sonner";

// actions
import { crearCentro, editarCentro } from "@/modules/mantenedores/actions/mantenedores.action";

// components
import { ActionMessage } from "@/shared/components/ui/action-message";
import { Button } from "@/shared/components/ui/button";
import { FormSubmit } from "@/shared/components/ui/form-submit";
import { Input } from "@/shared/components/ui/input";

// types
import { initialActionState } from "@/shared/types/action-state";

interface CentroFormModalProps {
    centro?: Centro | null;
    isOpen: boolean;
    onClose: () => void;
}

export function CentroFormModal({
    centro,
    isOpen,
    onClose
}: CentroFormModalProps): React.ReactElement | null {
    const esEdicion = Boolean(centro);
    const action = esEdicion ? editarCentro : crearCentro;
    const [state, formAction] = useActionState(action, initialActionState);

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
            <div className="relative w-full max-w-md rounded-lg border bg-background p-6 shadow-xl">
                <div className="flex items-center justify-between pb-4 border-b">
                    <div>
                        <h3 className="text-lg font-semibold">
                            {esEdicion ? "Editar Centro de Salud" : "Nuevo Centro de Salud"}
                        </h3>
                        <p className="text-xs text-muted-foreground mt-0.5">
                            {esEdicion
                                ? "Modifica el nombre o estado del establecimiento."
                                : "Ingresa los datos para registrar un nuevo centro."}
                        </p>
                    </div>
                    <Button variant="ghost" size="sm" onClick={onClose} aria-label="Cerrar modal">
                        <X className="h-4 w-4" />
                    </Button>
                </div>

                <form action={formAction} className="space-y-4 pt-4">
                    {esEdicion && centro && <input type="hidden" name="id" value={centro.id} />}

                    <div className="space-y-1 text-sm">
                        <label htmlFor="nombre-centro" className="font-medium">
                            Nombre del centro *
                        </label>
                        <Input
                            id="nombre-centro"
                            name="nombre"
                            required
                            defaultValue={centro?.nombre ?? ""}
                            placeholder="Ej: CESFAM Esperanza"
                        />
                    </div>

                    <label className="flex items-center gap-2 text-sm cursor-pointer select-none">
                        <input
                            type="checkbox"
                            name="estado"
                            value="true"
                            defaultChecked={centro ? centro.estado : true}
                            className="rounded border-input text-primary focus:ring-primary"
                        />
                        <span className="font-medium">Centro Activo</span>
                    </label>

                    <ActionMessage state={state} />

                    <div className="flex items-center justify-end gap-3 pt-3 border-t">
                        <Button type="button" variant="outline" onClick={onClose}>
                            Cancelar
                        </Button>
                        <FormSubmit label={esEdicion ? "Guardar cambios" : "Crear centro"} />
                    </div>
                </form>
            </div>
        </div>
    );
}
