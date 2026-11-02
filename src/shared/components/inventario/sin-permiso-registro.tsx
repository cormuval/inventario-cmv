import Link from "next/link";
import type * as React from "react";

// components
import { Card, CardContent, CardHeader, CardTitle } from "@/shared/components/ui/card";

interface SinPermisoRegistroProps {
    mensaje: string;
    hrefRegistros: string;
    etiquetaRegistros: string;
}

export function SinPermisoRegistro({ mensaje, hrefRegistros, etiquetaRegistros }: SinPermisoRegistroProps): React.ReactElement {
    return (
        <Card>
            <CardHeader>
                <CardTitle>Sin permiso para registrar</CardTitle>
            </CardHeader>
            <CardContent className="space-y-3 text-sm">
                <p className="text-muted-foreground">{mensaje}</p>
                <Link href={hrefRegistros} className="font-medium text-teal-700 underline-offset-4 hover:underline">
                    {etiquetaRegistros}
                </Link>
            </CardContent>
        </Card>
    );
}
