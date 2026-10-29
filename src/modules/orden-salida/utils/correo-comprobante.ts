// lib
import type { CorreoInput } from "@/shared/lib/correo";

// types
import type { OrdenSalidaPDFData } from "@/modules/orden-salida/utils/pdf-comprobante";

// utils
import { formatDate } from "@/shared/utils/format";

function escaparHtml(texto: string): string {
    return texto
        .replace(/&/g, "&amp;")
        .replace(/</g, "&lt;")
        .replace(/>/g, "&gt;")
        .replace(/"/g, "&quot;");
}

/** Arma el correo del comprobante de salida; el detalle completo va en el PDF adjunto. */
export function construirCorreoComprobante(orden: OrdenSalidaPDFData, pdf: Buffer, para: string): CorreoInput {
    const emisor = `${orden.usuario.nombre} ${orden.usuario.apPaterno ?? ""}`.trim();
    const destino = orden.bodegaDestino?.nombre ?? orden.destino;
    const cantidadLineas = orden.detalles.length;

    const filas: Array<[string, string]> = [
        ["Fecha", formatDate(orden.fecha)],
        ["Centro", orden.centro.nombre],
        ["Bodega de origen", orden.bodega.nombre],
        ["Tipo de salida", orden.tipoSalida],
        ["Destino", destino],
        ["Detalle", `${cantidadLineas} ${cantidadLineas === 1 ? "producto" : "productos"}`],
        ["Emitido por", `${emisor} (${orden.usuario.email})`]
    ];

    const texto = [
        `Comprobante de salida N° ${orden.id}`,
        "",
        ...filas.map(([etiqueta, valor]) => `${etiqueta}: ${valor}`),
        "",
        "Se adjunta el comprobante en PDF con el detalle de productos, lotes y cantidades.",
        "Para consultas, responda este correo."
    ].join("\n");

    const html = `
<div style="font-family: Arial, sans-serif; color: #0f172a; max-width: 560px;">
    <h2 style="color: #0f766e; margin: 0 0 12px;">Comprobante de salida N° ${escaparHtml(orden.id)}</h2>
    <table style="border-collapse: collapse; width: 100%; font-size: 14px;">
        ${filas
            .map(
                ([etiqueta, valor]) =>
                    `<tr><td style="padding: 6px 8px; color: #64748b; border-bottom: 1px solid #e2e8f0;">${escaparHtml(etiqueta)}</td><td style="padding: 6px 8px; border-bottom: 1px solid #e2e8f0;">${escaparHtml(valor)}</td></tr>`
            )
            .join("")}
    </table>
    <p style="font-size: 13px; color: #475569; margin-top: 16px;">Se adjunta el comprobante en PDF con el detalle de productos, lotes y cantidades. Para consultas, responda este correo.</p>
    <p style="font-size: 12px; color: #94a3b8;">Inventario APS — Corporación Municipal de Valparaíso</p>
</div>`.trim();

    return {
        para,
        asunto: `Comprobante de salida N° ${orden.id} — ${orden.centro.nombre}`,
        html,
        texto,
        responderA: orden.usuario.email,
        adjuntos: [{ nombre: `comprobante-salida-${orden.id}.pdf`, contenido: pdf }]
    };
}
