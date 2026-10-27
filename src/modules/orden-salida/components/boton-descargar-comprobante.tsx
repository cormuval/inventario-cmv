"use client";

import * as React from "react";
import { useState } from "react";
import { FileDown, Loader2 } from "lucide-react";
import { toast } from "sonner";

// actions
import { descargarComprobanteSalidaAction } from "@/modules/orden-salida/actions/orden-salida.action";

// components
import { Button } from "@/shared/components/ui/button";

// utils
import { descargarArchivoBase64 } from "@/shared/utils/descargar-base64";

interface BotonDescargarComprobanteProps {
    ordenId: string;
    label?: string;
    variant?: "default" | "destructive" | "outline" | "secondary" | "ghost" | "link";
    size?: "default" | "sm" | "lg" | "icon";
    className?: string;
}

export function BotonDescargarComprobante({
    ordenId,
    label = "Descargar PDF",
    variant = "outline",
    size = "sm",
    className
}: BotonDescargarComprobanteProps): React.ReactElement {
    const [cargando, setCargando] = useState(false);

    const handleDescargar = async () => {
        try {
            setCargando(true);
            const resultado = await descargarComprobanteSalidaAction(ordenId);

            if (!resultado.ok || !resultado.base64) {
                toast.error(resultado.error || "No fue posible generar el comprobante");
                return;
            }

            descargarArchivoBase64(
                resultado.base64,
                resultado.filename || `comprobante-salida-${ordenId}.pdf`
            );
        } catch {
            toast.error("Ocurrió un error inesperado al descargar el comprobante");
        } finally {
            setCargando(false);
        }
    };

    return (
        <Button
            type="button"
            variant={variant}
            size={size}
            onClick={handleDescargar}
            disabled={cargando}
            className={className}
            title="Descargar comprobante en PDF"
            aria-label="Descargar PDF"
        >
            {cargando ? (
                <Loader2 className="h-3.5 w-3.5 animate-spin" />
            ) : (
                <FileDown className="h-3.5 w-3.5" />
            )}
            {label ? <span className="ml-1.5">{label}</span> : null}
        </Button>
    );
}
