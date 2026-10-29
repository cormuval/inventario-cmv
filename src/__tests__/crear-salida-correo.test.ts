import { beforeEach, describe, expect, it, vi } from "vitest";

// lib
import * as authLib from "@/shared/lib/auth";
import { prisma } from "@/shared/lib/prisma";

// actions
import { crearOrdenSalida } from "@/modules/orden-salida/actions/orden-salida.action";

// utils
import { enviarComprobanteSalida } from "@/modules/orden-salida/utils/envio-comprobante";

vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));
vi.mock("@/auth", () => ({ auth: vi.fn() }));
vi.mock("@/shared/lib/logger", () => ({ AuditLogger: { log: vi.fn() } }));
vi.mock("@/shared/lib/inventario-alcance", async (importOriginal) => ({
    ...(await importOriginal<typeof import("@/shared/lib/inventario-alcance")>()),
    validarCentroBodegaEnAlcance: vi.fn().mockResolvedValue(undefined)
}));
vi.mock("@/shared/lib/auth", async (importOriginal) => ({
    ...(await importOriginal<typeof import("@/shared/lib/auth")>()),
    requireSessionUser: vi.fn()
}));
vi.mock("@/modules/orden-salida/utils/envio-comprobante", () => ({
    enviarComprobanteSalida: vi.fn(),
    cargarOrdenParaComprobante: vi.fn()
}));
vi.mock("@/shared/lib/prisma", () => ({ prisma: { $transaction: vi.fn() } }));

function formDataSalida(correoDestino?: string): FormData {
    const formData = new FormData();
    formData.set("fecha", new Date().toISOString());
    formData.set("centroId", "centro-1");
    formData.set("bodegaId", "b1");
    formData.set("tipoSalida", "Consumo Interno");
    formData.set("destino", "Box 1");
    if (correoDestino) {
        formData.set("correoDestino", correoDestino);
    }
    formData.append("productoId", "1");
    formData.append("cantidad", "2");
    formData.append("lote", "LOTE-01");
    formData.append("fechaCaducidad", new Date(Date.now() + 365 * 24 * 60 * 60 * 1000).toISOString());
    return formData;
}

describe("crearOrdenSalida con envío de comprobante", () => {
    beforeEach(() => {
        vi.clearAllMocks();
        vi.mocked(authLib.requireSessionUser).mockResolvedValue({
            id: "user-1",
            nombre: "Operador",
            apPaterno: "Salida",
            email: "operador@cmvalparaiso.cl",
            rol: "R07",
            centroId: "centro-1",
            bodegaId: "b1"
        });
        const tx = {
            ordenSalida: { create: vi.fn().mockResolvedValue({ id: "sal-1" }) },
            ordenSalidaDetalle: { create: vi.fn().mockResolvedValue({ id: "det-1" }) },
            stock: {
                findUnique: vi.fn().mockResolvedValue({
                    id: "stock-1",
                    cantidadDisponible: 20,
                    fechaCaducidad: new Date(Date.now() + 365 * 24 * 60 * 60 * 1000)
                }),
                update: vi.fn().mockResolvedValue({}),
                upsert: vi.fn().mockResolvedValue({})
            }
        };
        vi.mocked(prisma.$transaction).mockImplementation((async (fn: (client: unknown) => Promise<unknown>) => fn(tx)) as never);
    });

    it("no envía correo cuando la salida no tiene correo destino", async () => {
        const resultado = await crearOrdenSalida({ ok: false, message: "" }, formDataSalida());

        expect(resultado).toEqual({ ok: true, message: "Orden de salida registrada.", id: "sal-1" });
        expect(enviarComprobanteSalida).not.toHaveBeenCalled();
    });

    it("envía el comprobante y lo informa en el mensaje", async () => {
        vi.mocked(enviarComprobanteSalida).mockResolvedValue({ ok: true, id: "email-1" });

        const resultado = await crearOrdenSalida({ ok: false, message: "" }, formDataSalida("destino@cmvalparaiso.cl"));

        expect(enviarComprobanteSalida).toHaveBeenCalledWith({
            ordenId: "sal-1",
            usuarioId: "user-1",
            para: "destino@cmvalparaiso.cl",
            reenvio: false
        });
        expect(resultado).toEqual({
            ok: true,
            message: "Orden de salida registrada. Comprobante enviado a destino@cmvalparaiso.cl.",
            id: "sal-1"
        });
    });

    it("mantiene la salida registrada y devuelve advertencia si el correo falla", async () => {
        vi.mocked(enviarComprobanteSalida).mockResolvedValue({ ok: false, error: "Dominio no verificado" });

        const resultado = await crearOrdenSalida({ ok: false, message: "" }, formDataSalida("destino@cmvalparaiso.cl"));

        expect(resultado).toEqual({
            ok: true,
            message: "Orden de salida registrada.",
            id: "sal-1",
            advertencia: "No se pudo enviar el comprobante: Dominio no verificado"
        });
    });

    it("no muestra advertencia cuando el envío está omitido por falta de configuración", async () => {
        vi.mocked(enviarComprobanteSalida).mockResolvedValue({
            ok: false,
            omitido: true,
            error: "Envío de correo no configurado"
        });

        const resultado = await crearOrdenSalida({ ok: false, message: "" }, formDataSalida("destino@cmvalparaiso.cl"));

        expect(resultado).toEqual({ ok: true, message: "Orden de salida registrada.", id: "sal-1" });
    });

    it("mantiene la salida registrada aunque el envío lance una excepción inesperada", async () => {
        vi.mocked(enviarComprobanteSalida).mockRejectedValue(new Error("Base de datos no disponible"));

        const resultado = await crearOrdenSalida({ ok: false, message: "" }, formDataSalida("destino@cmvalparaiso.cl"));

        expect(resultado.ok).toBe(true);
        expect(resultado.advertencia).toBe("No se pudo enviar el comprobante: Base de datos no disponible");
    });
});
