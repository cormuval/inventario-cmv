import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const { sendMock } = vi.hoisted(() => ({ sendMock: vi.fn() }));

vi.mock("resend", () => ({
    Resend: vi.fn().mockImplementation(() => ({ emails: { send: sendMock } }))
}));

import { enviarCorreo } from "@/shared/lib/correo";

const correoBase = {
    para: "destino@cmvalparaiso.cl",
    asunto: "Asunto",
    html: "<p>Hola</p>",
    texto: "Hola"
};

describe("enviarCorreo", () => {
    beforeEach(() => {
        vi.clearAllMocks();
        vi.stubEnv("RESEND_API_KEY", "re_test");
        vi.stubEnv("CORREO_REMITENTE", "");
    });

    afterEach(() => {
        vi.unstubAllEnvs();
    });

    it("omite el envío cuando no hay RESEND_API_KEY", async () => {
        vi.stubEnv("RESEND_API_KEY", "");

        const resultado = await enviarCorreo(correoBase);

        expect(resultado).toEqual({ ok: false, omitido: true, error: "Envío de correo no configurado" });
        expect(sendMock).not.toHaveBeenCalled();
    });

    it("envía con el remitente por defecto y devuelve el id de Resend", async () => {
        sendMock.mockResolvedValue({ data: { id: "email-123" }, error: null });

        const resultado = await enviarCorreo({ ...correoBase, responderA: "emisor@cmvalparaiso.cl" });

        expect(resultado).toEqual({ ok: true, id: "email-123" });
        expect(sendMock).toHaveBeenCalledWith({
            from: "Inventario CMV <inventario@gi.cmvalparaiso.cl>",
            to: "destino@cmvalparaiso.cl",
            subject: "Asunto",
            html: "<p>Hola</p>",
            text: "Hola",
            replyTo: "emisor@cmvalparaiso.cl"
        });
    });

    it("usa CORREO_REMITENTE y mapea los adjuntos al formato de Resend", async () => {
        vi.stubEnv("CORREO_REMITENTE", "Pruebas <pruebas@cmvalparaiso.cl>");
        sendMock.mockResolvedValue({ data: { id: "email-456" }, error: null });
        const pdf = Buffer.from("pdf");

        await enviarCorreo({ ...correoBase, adjuntos: [{ nombre: "comprobante.pdf", contenido: pdf }] });

        expect(sendMock).toHaveBeenCalledWith(
            expect.objectContaining({
                from: "Pruebas <pruebas@cmvalparaiso.cl>",
                attachments: [{ filename: "comprobante.pdf", content: pdf }]
            })
        );
    });

    it("devuelve ok false cuando Resend responde con error", async () => {
        sendMock.mockResolvedValue({ data: null, error: { name: "validation_error", message: "Dominio no verificado" } });

        const resultado = await enviarCorreo(correoBase);

        expect(resultado).toEqual({ ok: false, error: "Dominio no verificado" });
    });

    it("devuelve ok false cuando el SDK lanza una excepción de red", async () => {
        sendMock.mockRejectedValue(new Error("fetch failed"));

        const resultado = await enviarCorreo(correoBase);

        expect(resultado).toEqual({ ok: false, error: "fetch failed" });
    });

    it("devuelve error por tiempo de espera cuando Resend no responde", async () => {
        vi.useFakeTimers();
        try {
            sendMock.mockReturnValue(new Promise(() => undefined));

            const pendiente = enviarCorreo(correoBase);
            await vi.advanceTimersByTimeAsync(15_000);

            expect(await pendiente).toEqual({ ok: false, error: "Tiempo de espera agotado al enviar el correo" });
        } finally {
            vi.useRealTimers();
        }
    });
});
