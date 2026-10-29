import { beforeEach, describe, expect, it, vi } from "vitest";

// lib
import { enviarCorreo } from "@/shared/lib/correo";
import { validarCentroBodegaEnAlcance } from "@/shared/lib/inventario-alcance";
import { AuditLogger } from "@/shared/lib/logger";
import { prisma } from "@/shared/lib/prisma";

// utils
import { enviarComprobanteSalida } from "@/modules/orden-salida/utils/envio-comprobante";
import { generarComprobanteSalidaPDF } from "@/modules/orden-salida/utils/pdf-comprobante";

vi.mock("@/auth", () => ({ auth: vi.fn() }));
vi.mock("@/shared/lib/correo", () => ({ enviarCorreo: vi.fn() }));
vi.mock("@/shared/lib/logger", () => ({ AuditLogger: { log: vi.fn() } }));
vi.mock("@/shared/lib/inventario-alcance", () => ({ validarCentroBodegaEnAlcance: vi.fn() }));
vi.mock("@/modules/orden-salida/utils/pdf-comprobante", () => ({
    generarComprobanteSalidaPDF: vi.fn()
}));
vi.mock("@/shared/lib/prisma", () => ({
    prisma: { ordenSalida: { findUnique: vi.fn(), update: vi.fn() } }
}));

const ordenCompleta = {
    id: "sal-1",
    fecha: new Date("2026-10-29T12:00:00Z"),
    tipoSalida: "Consumo Interno",
    destino: "Box 1",
    codigoSalida: null,
    centroId: "c-1",
    bodegaId: "b-1",
    centro: { nombre: "CESFAM Barón" },
    bodega: { nombre: "Bodega Farmacia" },
    bodegaDestino: null,
    usuario: { nombre: "Carla", apPaterno: "Rojas", email: "crojas@cmvalparaiso.cl" },
    detalles: []
};

const input = { ordenId: "sal-1", usuarioId: "u-1", para: "destino@cmvalparaiso.cl", reenvio: false };

describe("enviarComprobanteSalida", () => {
    beforeEach(() => {
        // resetAllMocks descarta implementaciones previas (p. ej. rechazos) y se reestablecen los valores por defecto
        vi.resetAllMocks();
        vi.mocked(generarComprobanteSalidaPDF).mockResolvedValue(Buffer.from("pdf"));
        vi.mocked(prisma.ordenSalida.update).mockResolvedValue({} as never);
        vi.mocked(AuditLogger.log).mockResolvedValue(undefined as never);
        vi.mocked(prisma.ordenSalida.findUnique).mockResolvedValue(ordenCompleta as never);
        vi.mocked(validarCentroBodegaEnAlcance).mockResolvedValue(undefined);
    });

    it("envía, marca la orden como enviada y audita el éxito", async () => {
        vi.mocked(enviarCorreo).mockResolvedValue({ ok: true, id: "email-1" });

        const resultado = await enviarComprobanteSalida(input);

        expect(resultado).toEqual({ ok: true, id: "email-1" });
        expect(validarCentroBodegaEnAlcance).toHaveBeenCalledWith("c-1", "b-1");
        expect(enviarCorreo).toHaveBeenCalledWith(
            expect.objectContaining({ para: "destino@cmvalparaiso.cl", asunto: expect.stringContaining("sal-1") })
        );
        expect(prisma.ordenSalida.update).toHaveBeenCalledWith({
            where: { id: "sal-1" },
            data: { enviarCorreo: true, fechaEnvioCorreo: expect.any(Date), errorEnvioCorreo: null }
        });
        expect(AuditLogger.log).toHaveBeenCalledWith({
            usuarioId: "u-1",
            centroId: "c-1",
            bodegaId: "b-1",
            accion: "enviar_correo",
            entidad: "OrdenSalida",
            entidadId: "sal-1",
            detalle: { para: "destino@cmvalparaiso.cl", reenvio: false, resultado: "enviado", resendId: "email-1" }
        });
    });

    it("registra el fallo truncado a 500 caracteres", async () => {
        const errorLargo = "x".repeat(600);
        vi.mocked(enviarCorreo).mockResolvedValue({ ok: false, error: errorLargo });

        const resultado = await enviarComprobanteSalida({ ...input, reenvio: true });

        expect(resultado.ok).toBe(false);
        expect(prisma.ordenSalida.update).toHaveBeenCalledWith({
            where: { id: "sal-1" },
            data: { enviarCorreo: false, fechaEnvioCorreo: expect.any(Date), errorEnvioCorreo: "x".repeat(500) }
        });
        expect(AuditLogger.log).toHaveBeenCalledWith(
            expect.objectContaining({
                detalle: { para: "destino@cmvalparaiso.cl", reenvio: true, resultado: "fallido", error: errorLargo }
            })
        );
    });

    it("cuando el envío se omite (sin clave) audita pero no modifica el estado de la orden", async () => {
        vi.mocked(enviarCorreo).mockResolvedValue({ ok: false, omitido: true, error: "Envío de correo no configurado" });

        await enviarComprobanteSalida(input);

        expect(prisma.ordenSalida.update).not.toHaveBeenCalled();
        expect(AuditLogger.log).toHaveBeenCalledWith(
            expect.objectContaining({ detalle: expect.objectContaining({ resultado: "omitido" }) })
        );
    });

    it("no envía ni audita si la orden no existe", async () => {
        vi.mocked(prisma.ordenSalida.findUnique).mockResolvedValue(null);

        const resultado = await enviarComprobanteSalida(input);

        expect(resultado).toEqual({ ok: false, error: "Orden de salida no encontrada" });
        expect(enviarCorreo).not.toHaveBeenCalled();
        expect(AuditLogger.log).not.toHaveBeenCalled();
    });

    it("no envía si la orden está fuera del alcance del usuario", async () => {
        vi.mocked(validarCentroBodegaEnAlcance).mockRejectedValue(
            new Error("No tienes permiso para operar en el centro o bodega seleccionada.")
        );

        const resultado = await enviarComprobanteSalida(input);

        expect(resultado).toEqual({ ok: false, error: "No tienes permiso para operar en el centro o bodega seleccionada." });
        expect(enviarCorreo).not.toHaveBeenCalled();
        expect(prisma.ordenSalida.update).not.toHaveBeenCalled();
    });

    it("si falla guardar el estado, igual devuelve el resultado y audita", async () => {
        vi.mocked(enviarCorreo).mockResolvedValue({ ok: true, id: "email-1" });
        vi.mocked(prisma.ordenSalida.update).mockRejectedValue(new Error("db caída"));

        const resultado = await enviarComprobanteSalida(input);

        expect(resultado).toEqual({ ok: true, id: "email-1" });
        expect(AuditLogger.log).toHaveBeenCalled();
    });

    it("si falla la auditoría, igual devuelve el resultado", async () => {
        vi.mocked(enviarCorreo).mockResolvedValue({ ok: true, id: "email-1" });
        vi.mocked(AuditLogger.log).mockRejectedValue(new Error("db caída"));

        await expect(enviarComprobanteSalida(input)).resolves.toEqual({ ok: true, id: "email-1" });
    });

    it("si enviarCorreo lanza, devuelve fallo y audita como fallido", async () => {
        vi.mocked(enviarCorreo).mockRejectedValue(new Error("boom"));

        const resultado = await enviarComprobanteSalida(input);

        expect(resultado).toEqual({ ok: false, error: "boom" });
        expect(AuditLogger.log).toHaveBeenCalledWith(
            expect.objectContaining({ detalle: expect.objectContaining({ resultado: "fallido", error: "boom" }) })
        );
    });
});
