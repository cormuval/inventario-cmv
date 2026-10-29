import type * as React from "react";

// components
import { Badge } from "@/shared/components/ui/badge";

// utils
import { formatDate } from "@/shared/utils/format";

interface EstadoCorreoBadgeProps {
    enviado: boolean;
    fechaEnvio: Date | null;
    error: string | null;
    correoDestino: string | null;
}

export function EstadoCorreoBadge({ enviado, fechaEnvio, error, correoDestino }: EstadoCorreoBadgeProps): React.ReactElement {
    if (enviado && fechaEnvio) {
        return (
            <Badge tone="success" title={`Enviado a ${correoDestino ?? "-"} el ${formatDate(fechaEnvio)}`}>
                Enviado
            </Badge>
        );
    }
    if (error) {
        return (
            <Badge tone="danger" title={error}>
                Falló
            </Badge>
        );
    }
    return <Badge tone="muted">Sin envío</Badge>;
}
