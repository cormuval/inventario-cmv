// lib
import type { CorreoInput } from "@/shared/lib/correo";

// utils
import { formatDate } from "@/shared/utils/format";

function escaparHtml(texto: string): string {
    return texto
        .replace(/&/g, "&amp;")
        .replace(/</g, "&lt;")
        .replace(/>/g, "&gt;")
        .replace(/"/g, "&quot;");
}

export interface ItemPrestamoNotificacion {
    productoDescripcion: string;
    cantidad: number;
    lote: string;
    fechaCaducidad: Date | string;
}

export interface DatosCorreoNotificacionPrestamo {
    ordenId: string;
    codigoRecepcion: string;
    fecha: Date | string;
    fechaLimiteRecepcion: Date | string;
    centroOrigen: string;
    bodegaOrigen: string;
    centroDestino: string;
    bodegaDestino?: string | null;
    emisorNombre: string;
    emisorEmail: string;
    detalles: ItemPrestamoNotificacion[];
    para: string | string[];
}

/**
 * Construye el correo institucional para notificar un préstamo / traspaso intercentros entrante.
 * Contiene de forma destacada el código de recepción (7 caracteres), centro/bodega de origen y destino,
 * plazo de 7 días corridos, detalle de insumos e instrucciones de recepción en la app.
 */
export function construirCorreoNotificacionPrestamo(datos: DatosCorreoNotificacionPrestamo): CorreoInput {
    const fechaLimiteStr = formatDate(datos.fechaLimiteRecepcion);
    const fechaEmisionStr = formatDate(datos.fecha);
    const bodegaDestinoStr = datos.bodegaDestino?.trim()
        ? datos.bodegaDestino.trim()
        : "Por asignar al momento de recepcionar";

    const filasResumen: Array<[string, string]> = [
        ["Código de recepción", datos.codigoRecepcion],
        ["Fecha de emisión", fechaEmisionStr],
        ["Plazo de recepción", `7 días corridos (hasta el ${fechaLimiteStr})`],
        ["Centro de origen", datos.centroOrigen],
        ["Bodega de origen", datos.bodegaOrigen],
        ["Centro de destino", datos.centroDestino],
        ["Bodega de destino", bodegaDestinoStr],
        ["Emitido por", `${datos.emisorNombre} (${datos.emisorEmail})`],
        ["Total de insumos", `${datos.detalles.length} ${datos.detalles.length === 1 ? "línea" : "líneas"}`]
    ];

    const lineasTexto: string[] = [
        `NOTIFICACIÓN DE PRÉSTAMO INTERCENTROS ENTRANTE (Orden N° ${datos.ordenId})`,
        "==================================================================",
        "",
        `CÓDIGO DE RECEPCIÓN: ${datos.codigoRecepcion}`,
        `Plazo de recepción: 7 días corridos (hasta el ${fechaLimiteStr})`,
        "",
        ...filasResumen.map(([etiq, val]) => `${etiq}: ${val}`),
        "",
        "DETALLE DE PRODUCTOS ENVIADOS:",
        "------------------------------------------------------------------"
    ];

    for (const item of datos.detalles) {
        lineasTexto.push(
            `• ${item.productoDescripcion} | Cantidad: ${item.cantidad} | Lote: ${item.lote} | Vence: ${formatDate(item.fechaCaducidad)}`
        );
    }

    lineasTexto.push(
        "",
        "INSTRUCCIONES PARA LA RECEPCIÓN:",
        "Para ingresar estos insumos al inventario de su centro, acceda al sistema en:",
        "Menú 'Entradas' > 'Recepción de Préstamos', e ingrese el código de 7 caracteres.",
        "",
        "Inventario APS — Corporación Municipal de Valparaíso"
    );

    const filasDetalleHtml = datos.detalles
        .map(
            (item) => `
        <tr>
            <td style="padding: 8px; border-bottom: 1px solid #e2e8f0; font-size: 13px;">${escaparHtml(item.productoDescripcion)}</td>
            <td style="padding: 8px; border-bottom: 1px solid #e2e8f0; font-size: 13px; text-align: center; font-weight: bold;">${item.cantidad}</td>
            <td style="padding: 8px; border-bottom: 1px solid #e2e8f0; font-size: 13px; text-align: center;">${escaparHtml(item.lote)}</td>
            <td style="padding: 8px; border-bottom: 1px solid #e2e8f0; font-size: 13px; text-align: center;">${escaparHtml(formatDate(item.fechaCaducidad))}</td>
        </tr>`
        )
        .join("");

    const html = `
<div style="font-family: Arial, sans-serif; color: #0f172a; max-width: 620px; line-height: 1.5; margin: 0 auto; background-color: #ffffff; padding: 24px; border: 1px solid #e2e8f0; border-radius: 8px;">
    <div style="border-bottom: 2px solid #0f766e; padding-bottom: 12px; margin-bottom: 16px;">
        <h2 style="color: #0f766e; margin: 0; font-size: 20px;">Préstamo Intercentros Entrante</h2>
        <p style="margin: 4px 0 0; font-size: 13px; color: #64748b;">Orden de salida N° ${escaparHtml(datos.ordenId)}</p>
    </div>

    <!-- Caja destacada con el código de recepción de 7 caracteres y plazo de 7 días -->
    <div style="background-color: #f0fdf4; border: 2px dashed #16a34a; border-radius: 8px; padding: 16px; text-align: center; margin: 16px 0;">
        <div style="font-size: 12px; text-transform: uppercase; letter-spacing: 0.05em; color: #166534; font-weight: 600;">
            Código de Recepción (7 caracteres)
        </div>
        <div style="font-size: 28px; font-weight: bold; letter-spacing: 0.15em; color: #15803d; font-family: 'Courier New', Courier, monospace; margin: 8px 0;">
            ${escaparHtml(datos.codigoRecepcion)}
        </div>
        <div style="font-size: 13px; color: #166534; font-weight: 500;">
            Plazo vigente para recepcionar: <strong>7 días corridos</strong> (hasta el ${escaparHtml(fechaLimiteStr)})
        </div>
    </div>

    <h3 style="font-size: 15px; color: #1e293b; margin: 16px 0 8px;">Datos de Identificación del Envío</h3>
    <table style="border-collapse: collapse; width: 100%; font-size: 13px; margin-bottom: 16px;">
        ${filasResumen
            .map(
                ([etiqueta, valor]) =>
                    `<tr>
                        <td style="padding: 6px 8px; color: #64748b; border-bottom: 1px solid #f1f5f9; width: 38%;">${escaparHtml(etiqueta)}</td>
                        <td style="padding: 6px 8px; color: #0f172a; border-bottom: 1px solid #f1f5f9; font-weight: 500;">${escaparHtml(valor)}</td>
                    </tr>`
            )
            .join("")}
    </table>

    <h3 style="font-size: 15px; color: #1e293b; margin: 16px 0 8px;">Detalle de Insumos Enviados</h3>
    <table style="border-collapse: collapse; width: 100%; font-size: 13px; margin-bottom: 20px;">
        <thead>
            <tr style="background-color: #f8fafc;">
                <th style="padding: 8px; border-bottom: 2px solid #cbd5e1; text-align: left; font-size: 12px; color: #475569;">Insumo / Producto</th>
                <th style="padding: 8px; border-bottom: 2px solid #cbd5e1; text-align: center; font-size: 12px; color: #475569;">Cant.</th>
                <th style="padding: 8px; border-bottom: 2px solid #cbd5e1; text-align: center; font-size: 12px; color: #475569;">Lote</th>
                <th style="padding: 8px; border-bottom: 2px solid #cbd5e1; text-align: center; font-size: 12px; color: #475569;">Vence</th>
            </tr>
        </thead>
        <tbody>
            ${filasDetalleHtml}
        </tbody>
    </table>

    <div style="background-color: #f8fafc; border-left: 4px solid #0f766e; padding: 12px 14px; margin-bottom: 20px; font-size: 13px; color: #334155;">
        <strong>¿Cómo recepcionar estos insumos?</strong><br />
        Acceda al sistema de inventario con su cuenta institucional, diríjase a la sección <strong>Entradas &gt; Recepción de Préstamos</strong>, ingrese el código de 7 caracteres y confirme la bodega donde se almacenará el stock.
    </div>

    <p style="font-size: 12px; color: #94a3b8; border-top: 1px solid #e2e8f0; padding-top: 12px; margin: 0;">
        Inventario APS — Corporación Municipal de Valparaíso. Por favor no responda directamente si este mensaje fue enviado de manera automática. Para consultas, contacte al emisor (${escaparHtml(datos.emisorEmail)}).
    </p>
</div>`.trim();

    return {
        para: datos.para,
        asunto: `Préstamo intercentros entrante: Código ${datos.codigoRecepcion} — ${datos.centroOrigen}`,
        html,
        texto: lineasTexto.join("\n"),
        responderA: datos.emisorEmail
    };
}
