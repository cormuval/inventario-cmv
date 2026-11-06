"use client";

import type * as React from "react";
import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";

// actions
import { anularPrestamoAction } from "@/modules/orden-salida/actions/orden-salida.action";

// components
import { Button } from "@/shared/components/ui/button";
import { Input } from "@/shared/components/ui/input";
import { SimpleModal } from "@/shared/components/ui/simple-modal";

export function BotonAnularPrestamo({ ordenId }: { ordenId: string }): React.ReactElement {
    const [motivo, setMotivo] = useState("");
    const [isPending, startTransition] = useTransition();
    const router = useRouter();

    function handleAnular(): void {
        const motivoTrim = motivo.trim();
        if (motivoTrim.length < 5) {
            toast.error("Debe ingresar un motivo de anulación detallado (mínimo 5 caracteres).");
            return;
        }

        startTransition(async () => {
            const res = await anularPrestamoAction(ordenId, motivoTrim);
            if (res.ok) {
                toast.success(res.message);
                router.refresh();
            } else {
                toast.error(res.message);
            }
        });
    }

    return (
        <SimpleModal
            title="Anular Préstamo Intercentros"
            triggerLabel="Anular"
            triggerClassName="text-destructive hover:bg-destructive/10 hover:text-destructive border-destructive/30"
        >
            <div className="space-y-4">
                <p className="text-sm text-muted-foreground">
                    Esta acción cambiará el estado del préstamo a <strong className="text-destructive">ANULADO</strong> y
                    restituirá automáticamente el stock descontado a la bodega de origen.
                </p>
                <div className="space-y-1.5">
                    <label htmlFor={`motivo-${ordenId}`} className="text-xs font-medium text-foreground">
                        Motivo de anulación * (mínimo 5 caracteres)
                    </label>
                    <Input
                        id={`motivo-${ordenId}`}
                        placeholder="Ej. Insumos extraviados en traslado / Orden mal emitida"
                        value={motivo}
                        onChange={(e) => setMotivo(e.target.value)}
                        disabled={isPending}
                    />
                </div>
                <div className="flex justify-end gap-2 pt-2">
                    <Button
                        type="button"
                        variant="destructive"
                        size="sm"
                        disabled={isPending || motivo.trim().length < 5}
                        onClick={handleAnular}
                    >
                        {isPending ? "Anulando…" : "Confirmar Anulación"}
                    </Button>
                </div>
            </div>
        </SimpleModal>
    );
}
