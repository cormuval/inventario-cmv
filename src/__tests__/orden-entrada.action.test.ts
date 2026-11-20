import { beforeEach, describe, expect, it, vi } from "vitest";

// lib
import * as authLib from "@/shared/lib/auth";
import * as alcanceLib from "@/shared/lib/inventario-alcance";
import { AuditLogger } from "@/shared/lib/logger";
import { prisma } from "@/shared/lib/prisma";

// actions
import { crearOrdenEntrada } from "@/modules/orden-entrada/actions/orden-entrada.action";

vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));
vi.mock("@/auth", () => ({ auth: vi.fn() }));

vi.mock("@/shared/lib/auth", async (importOriginal) => {
    const original = await importOriginal<typeof import("@/shared/lib/auth")>();
    return { ...original, requireSessionUser: vi.fn() };
});

vi.mock("@/shared/lib/inventario-alcance", async (importOriginal) => {
    const original = await importOriginal<typeof import("@/shared/lib/inventario-alcance")>();
    return { ...original, validarCentroBodegaEnAlcance: vi.fn() };
});

vi.mock("@/shared/lib/logger", () => ({ AuditLogger: { log: vi.fn() } }));

vi.mock("@/shared/lib/prisma", () => ({
    prisma: {
        producto: { findMany: vi.fn() },
        $transaction: vi.fn()
    }
}));

function crearFormulario(origen: "Bodega Central" | "Fondo Global Menor"): FormData {
    const formData = new FormData();
    const hoy = new Date();
    const caducidad = new Date(hoy);
    caducidad.setFullYear(caducidad.getFullYear() + 1);

    formData.set("fecha", hoy.toISOString());
    formData.set("origen", origen);
    formData.set("centroId", "c1");
    formData.set("bodegaId", "b1");
    formData.append("productoId", "1");
    formData.append("cantidad", "8");
    formData.append("lote", "LOTE-ENTRADA-01");
    formData.append("fechaCaducidad", caducidad.toISOString());
    return formData;
}

function prepararDependencias(): { ordenEntrada: { create: ReturnType<typeof vi.fn> } } {
    vi.mocked(authLib.requireSessionUser).mockResolvedValue({
        id: "u1",
        nombre: "Andrea",
        apPaterno: "Pérez",
        email: "andrea@cmvalparaiso.cl",
        rol: "R07",
        centroId: "c1",
        bodegaId: "b1"
    });
    vi.mocked(alcanceLib.validarCentroBodegaEnAlcance).mockResolvedValue();
    vi.mocked(prisma.producto.findMany).mockResolvedValue([{ id: 1, linea: "Medicamentos" }] as never);

    const tx = {
        ordenEntrada: { create: vi.fn().mockResolvedValue({ id: "oe1" }) },
        ordenEntradaDetalle: { create: vi.fn().mockResolvedValue({ id: "de1" }) },
        stock: {
            findUnique: vi.fn().mockResolvedValue(null),
            upsert: vi.fn().mockResolvedValue({ id: "stock1" })
        }
    };
    vi.mocked(prisma.$transaction).mockImplementation((async (callback: (client: typeof tx) => Promise<unknown>) => callback(tx)) as never);

    return tx;
}

describe("crearOrdenEntrada — persistencia de orígenes", () => {
    beforeEach(() => {
        vi.clearAllMocks();
    });

    it.each(["Bodega Central", "Fondo Global Menor"] as const)(
        "persiste literalmente %s en la bodega receptora",
        async (origen) => {
            const tx = prepararDependencias();

            const resultado = await crearOrdenEntrada({ ok: false, message: "" }, crearFormulario(origen));

            expect(resultado).toEqual({ ok: true, message: "Orden de entrada registrada." });
            expect(tx.ordenEntrada.create).toHaveBeenCalledWith({
                data: expect.objectContaining({
                    origen,
                    bodegaId: "b1"
                })
            });
            expect(AuditLogger.log).toHaveBeenCalledWith(expect.objectContaining({
                usuarioId: "u1",
                centroId: "c1",
                bodegaId: "b1",
                entidad: "OrdenEntrada"
            }));
        }
    );
});
