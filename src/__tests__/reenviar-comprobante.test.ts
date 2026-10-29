import { beforeEach, describe, expect, it, vi } from "vitest";

// lib
import * as authLib from "@/shared/lib/auth";
import { validarCentroBodegaEnAlcance } from "@/shared/lib/inventario-alcance";
import { prisma } from "@/shared/lib/prisma";

// actions
import { reenviarComprobanteSalidaAction } from "@/modules/orden-salida/actions/orden-salida.action";

// utils
import { enviarComprobanteSalida } from "@/modules/orden-salida/utils/envio-comprobante";

vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));
vi.mock("@/auth", () => ({ auth: vi.fn() }));
vi.mock("@/shared/lib/logger", () => ({ AuditLogger: { log: vi.fn() } }));
vi.mock("@/shared/lib/inventario-alcance", async (importOriginal) => ({
    ...(await importOriginal<typeof import("@/shared/lib/inventario-alcance")>()),
    validarCentroBodegaEnAlcance: vi.fn()
}));
vi.mock("@/shared/lib/auth", async (importOriginal) => ({
    ...(await importOriginal<typeof import("@/shared/lib/auth")>()),
    requireSessionUser: vi.fn()
}));
vi.mock("@/modules/orden-salida/utils/envio-comprobante", () => ({
    enviarComprobanteSalida: vi.fn(),
    cargarOrdenParaComprobante: vi.fn()
}));
vi.mock("@/shared/lib/prisma", () => ({
    prisma: { ordenSalida: { findUnique: vi.fn(), update: vi.fn() } }
}));

function sesion(rol: string): void {
    vi.mocked(authLib.requireSessionUser).mockResolvedValue({
        id: "user-1",
        nombre: "Operador",
        apPaterno: "Salida",
        email: "operador@cmvalparaiso.cl",
        rol,
        centroId: "c-1",
        bodegaId: "b-1"
    });
}

describe("reenviarComprobanteSalidaAction", () => {
    beforeEach(() => {
        vi.clearAllMocks();
        sesion("R07");
        vi.mocked(validarCentroBodegaEnAlcance).mockResolvedValue(undefined);
        vi.mocked(prisma.ordenSalida.findUnique).mockResolvedValue({
            id: "sal-1",
            centroId: "c-1",
            bodegaId: "b-1",
            correoDestino: "antiguo@cmvalparaiso.cl"
        } as never);
    });

    it("rechaza usuarios sin permiso de salida", async () => {
        sesion("R06");

        const resultado = await reenviarComprobanteSalidaAction("sal-1", "nuevo@cmvalparaiso.cl");

        expect(resultado.ok).toBe(false);
        expect(enviarComprobanteSalida).not.toHaveBeenCalled();
    });

    it("rechaza un correo inválido", async () => {
        const resultado = await reenviarComprobanteSalidaAction("sal-1", "no-es-correo");

        expect(resultado).toEqual({ ok: false, message: "Ingrese un correo válido." });
        expect(enviarComprobanteSalida).not.toHaveBeenCalled();
    });

    it("rechaza órdenes fuera del alcance sin modificar el correo", async () => {
        vi.mocked(validarCentroBodegaEnAlcance).mockRejectedValue(
            new Error("No tienes permiso para operar en el centro o bodega seleccionada.")
        );

        const resultado = await reenviarComprobanteSalidaAction("sal-1", "nuevo@cmvalparaiso.cl");

        expect(resultado).toEqual({ ok: false, message: "No tienes permiso para operar en el centro o bodega seleccionada." });
        expect(prisma.ordenSalida.update).not.toHaveBeenCalled();
        expect(enviarComprobanteSalida).not.toHaveBeenCalled();
    });

    it("corrige el correo destino y reenvía", async () => {
        vi.mocked(enviarComprobanteSalida).mockResolvedValue({ ok: true, id: "email-2" });

        const resultado = await reenviarComprobanteSalidaAction("sal-1", " nuevo@cmvalparaiso.cl ");

        expect(prisma.ordenSalida.update).toHaveBeenCalledWith({
            where: { id: "sal-1" },
            data: { correoDestino: "nuevo@cmvalparaiso.cl" }
        });
        expect(enviarComprobanteSalida).toHaveBeenCalledWith({
            ordenId: "sal-1",
            usuarioId: "user-1",
            para: "nuevo@cmvalparaiso.cl",
            reenvio: true
        });
        expect(resultado).toEqual({ ok: true, message: "Comprobante enviado a nuevo@cmvalparaiso.cl." });
    });

    it("no actualiza el correo si no cambió", async () => {
        vi.mocked(enviarComprobanteSalida).mockResolvedValue({ ok: true, id: "email-3" });

        await reenviarComprobanteSalidaAction("sal-1", "antiguo@cmvalparaiso.cl");

        expect(prisma.ordenSalida.update).not.toHaveBeenCalled();
    });

    it("informa el error de envío y el envío no configurado", async () => {
        vi.mocked(enviarComprobanteSalida).mockResolvedValueOnce({ ok: false, error: "Dominio no verificado" });
        expect(await reenviarComprobanteSalidaAction("sal-1", "antiguo@cmvalparaiso.cl")).toEqual({
            ok: false,
            message: "No se pudo enviar el comprobante: Dominio no verificado"
        });

        vi.mocked(enviarComprobanteSalida).mockResolvedValueOnce({
            ok: false,
            omitido: true,
            error: "Envío de correo no configurado"
        });
        expect(await reenviarComprobanteSalidaAction("sal-1", "antiguo@cmvalparaiso.cl")).toEqual({
            ok: false,
            message: "El envío de correos no está configurado en este entorno."
        });
    });
});
