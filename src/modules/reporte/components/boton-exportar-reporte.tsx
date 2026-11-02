"use client";

import type * as React from "react";
import { useState } from "react";
import { FileSpreadsheet, Loader2 } from "lucide-react";
import { toast } from "sonner";

// actions
import { exportarReporteExcelAction } from "@/modules/reporte/actions/reporte.action";

// components
import { Button } from "@/shared/components/ui/button";

// utils
import { descargarArchivoBase64 } from "@/shared/utils/descargar-base64";

const MIME_XLSX = "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet";

export function BotonExportarReporte({ parametros }: { parametros: Record<string, string> }): React.ReactElement {
    const [exportando, setExportando] = useState(false);

    async function exportar(): Promise<void> {
        setExportando(true);
        try {
            const resultado = await exportarReporteExcelAction(parametros);

            if (!resultado.ok || !resultado.base64 || !resultado.nombreArchivo) {
                toast.error(resultado.message || "No fue posible generar el Excel del reporte.");
                return;
            }

            descargarArchivoBase64(resultado.base64, resultado.nombreArchivo, MIME_XLSX);
            toast.success("Reporte exportado.");
        } catch {
            toast.error("No fue posible generar el Excel del reporte.");
        } finally {
            setExportando(false);
        }
    }

    return (
        <Button type="button" variant="outline" onClick={() => void exportar()} disabled={exportando}>
            {exportando ? <Loader2 className="h-4 w-4 animate-spin" /> : <FileSpreadsheet className="h-4 w-4" />}
            <span>Exportar Excel</span>
        </Button>
    );
}
