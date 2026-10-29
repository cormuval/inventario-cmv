// lib
import { Resend } from "resend";

const REMITENTE_POR_DEFECTO = "Inventario CMV <inventario@cmvalparaiso.cl>";

// Tiempo máximo de espera de Resend: el SDK no define timeout y el envío es síncrono tras registrar la salida.
const TIEMPO_MAXIMO_ENVIO_MS = 15_000;

export interface AdjuntoCorreo {
    nombre: string;
    contenido: Buffer;
}

export interface CorreoInput {
    para: string | string[];
    asunto: string;
    html: string;
    texto: string;
    responderA?: string;
    adjuntos?: AdjuntoCorreo[];
}

export type ResultadoCorreo = { ok: true; id: string } | { ok: false; error: string; omitido?: boolean };

let cliente: Resend | null = null;

function obtenerCliente(apiKey: string): Resend {
    if (!cliente) {
        cliente = new Resend(apiKey);
    }
    return cliente;
}

/**
 * Envía un correo con Resend. Nunca lanza: los errores del SDK o de red se devuelven como `ok: false`.
 * Sin `RESEND_API_KEY` (CI, tests, local sin clave) el envío se omite.
 */
export async function enviarCorreo(input: CorreoInput): Promise<ResultadoCorreo> {
    const apiKey = process.env.RESEND_API_KEY;
    if (!apiKey) {
        return { ok: false, omitido: true, error: "Envío de correo no configurado" };
    }

    let temporizador: ReturnType<typeof setTimeout> | undefined;
    try {
        const envio = obtenerCliente(apiKey).emails.send({
            from: process.env.CORREO_REMITENTE || REMITENTE_POR_DEFECTO,
            to: input.para,
            subject: input.asunto,
            html: input.html,
            text: input.texto,
            ...(input.responderA ? { replyTo: input.responderA } : {}),
            ...(input.adjuntos?.length
                ? { attachments: input.adjuntos.map((adjunto) => ({ filename: adjunto.nombre, content: adjunto.contenido })) }
                : {})
        });
        const tiempoAgotado = new Promise<"timeout">((resolve) => {
            temporizador = setTimeout(() => resolve("timeout"), TIEMPO_MAXIMO_ENVIO_MS);
        });

        const respuesta = await Promise.race([envio, tiempoAgotado]);
        if (respuesta === "timeout") {
            // Si el SDK termina después con un rechazo, se absorbe para no dejar una promesa sin manejar.
            envio.catch(() => undefined);
            return { ok: false, error: "Tiempo de espera agotado al enviar el correo" };
        }
        const { data, error } = respuesta;

        if (error || !data) {
            return { ok: false, error: error?.message ?? "Resend no devolvió respuesta" };
        }

        return { ok: true, id: data.id };
    } catch (error) {
        return { ok: false, error: error instanceof Error ? error.message : "Error desconocido al enviar el correo" };
    } finally {
        clearTimeout(temporizador);
    }
}
