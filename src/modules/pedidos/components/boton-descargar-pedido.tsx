"use client";

import type * as React from "react";
import { useState } from "react";
import { Download, FileSpreadsheet, FileText } from "lucide-react";
import { toast } from "sonner";

// actions
import {
    descargarPedidoExcelAction,
    descargarPedidoPdfAction
} from "@/modules/pedidos/actions/pedidos.action";

// utils
import { descargarArchivoBase64 } from "@/shared/utils/descargar-base64";

interface BotonDescargarPedidoProps {
    pedidoId: string;
    numero: string;
}

export function BotonDescargarPedido({
    pedidoId,
    numero
}: BotonDescargarPedidoProps): React.ReactElement {
    const [descargando, setDescargando] = useState<"pdf" | "excel" | null>(null);

    async function descargarPdf(): Promise<void> {
        try {
            setDescargando("pdf");
            const res = await descargarPedidoPdfAction(pedidoId);
            if (!res.ok || !res.base64 || !res.nombreArchivo) {
                toast.error(res.error ?? "No se pudo generar el PDF.");
                return;
            }
            descargarArchivoBase64(res.base64, res.nombreArchivo, res.mimeType ?? "application/pdf");
            toast.success(`PDF ${numero} descargado.`);
        } catch {
            toast.error("Error al descargar el PDF.");
        } finally {
            setDescargando(null);
        }
    }

    async function descargarExcel(): Promise<void> {
        try {
            setDescargando("excel");
            const res = await descargarPedidoExcelAction(pedidoId);
            if (!res.ok || !res.base64 || !res.nombreArchivo) {
                toast.error(res.error ?? "No se pudo generar el Excel.");
                return;
            }
            descargarArchivoBase64(
                res.base64,
                res.nombreArchivo,
                res.mimeType ?? "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
            );
            toast.success(`Excel ${numero} descargado.`);
        } catch {
            toast.error("Error al descargar el Excel.");
        } finally {
            setDescargando(null);
        }
    }

    return (
        <div className="inline-flex items-center gap-1.5">
            <button
                type="button"
                onClick={descargarPdf}
                disabled={descargando !== null}
                className="inline-flex items-center gap-1 rounded border border-input bg-background px-2 py-1 text-xs font-medium hover:bg-accent hover:text-accent-foreground disabled:opacity-50"
                title="Descargar comprobante en PDF"
            >
                <FileText className="h-3.5 w-3.5 text-rose-600" />
                <span>{descargando === "pdf" ? "Generando..." : "PDF"}</span>
            </button>
            <button
                type="button"
                onClick={descargarExcel}
                disabled={descargando !== null}
                className="inline-flex items-center gap-1 rounded border border-input bg-background px-2 py-1 text-xs font-medium hover:bg-accent hover:text-accent-foreground disabled:opacity-50"
                title="Descargar detalle en Excel (.xlsx)"
            >
                <FileSpreadsheet className="h-3.5 w-3.5 text-emerald-600" />
                <span>{descargando === "excel" ? "Generando..." : "Excel"}</span>
            </button>
        </div>
    );
}

