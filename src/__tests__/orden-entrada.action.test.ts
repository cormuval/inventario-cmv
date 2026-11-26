import { beforeEach, describe, expect, it, vi } from "vitest";

// lib
import * as authLib from "@/shared/lib/auth";
import * as alcanceLib from "@/shared/lib/inventario-alcance";
import { AuditLogger } from "@/shared/lib/logger";
import { prisma } from "@/shared/lib/prisma";

// actions
import { actualizarDetalleEntrada, crearOrdenEntrada } from "@/modules/orden-entrada/actions/orden-entrada.action";

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
        bodega: { findUnique: vi.fn() },
        ordenEntradaDetalle: { findUniqueOrThrow: vi.fn() },
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
    vi.mocked(prisma.bodega.findUnique).mockResolvedValue({ id: "b1", tipo: "CLINICA", estado: true } as never);
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

    it("rechaza un origen fuera del catálogo antes de abrir una transacción", async () => {
        prepararDependencias();
        const formData = crearFormulario("Bodega Central");
        formData.set("origen", "Bodega inventada");

        const resultado = await crearOrdenEntrada({ ok: false, message: "" }, formData);

        expect(resultado.ok).toBe(false);
        expect(resultado.message).toContain("Invalid enum value");
        expect(resultado.message).toContain("Bodega inventada");
        expect(prisma.$transaction).not.toHaveBeenCalled();
    });
});

describe("crearOrdenEntrada — compatibilidad de bodega y producto", () => {
    beforeEach(() => {
        vi.clearAllMocks();
    });

    it.each([
        { tipoBodega: "ASEO", lineaProducto: "CLINICO", mensaje: "El producto no corresponde a una bodega de aseo." },
        { tipoBodega: "CLINICA", lineaProducto: "ASEO", mensaje: "Los productos de aseo solo pueden ingresarse en bodegas de aseo." }
    ] as const)("rechaza $lineaProducto en una bodega $tipoBodega antes de abrir una transacción", async ({ tipoBodega, lineaProducto, mensaje }) => {
        prepararDependencias();
        vi.mocked(prisma.bodega.findUnique).mockResolvedValue({ id: "b1", tipo: tipoBodega, estado: true } as never);
        vi.mocked(prisma.producto.findMany).mockResolvedValue([{ id: 1, linea: lineaProducto }] as never);

        const resultado = await crearOrdenEntrada({ ok: false, message: "" }, crearFormulario("Bodega Central"));

        expect(resultado).toEqual({ ok: false, message: mensaje });
        expect(prisma.$transaction).not.toHaveBeenCalled();
    });

    it.each([
        { tipoBodega: "ASEO", lineaProducto: "ASEO" },
        { tipoBodega: "CLINICA", lineaProducto: "CLINICO" }
    ] as const)("registra $lineaProducto en una bodega $tipoBodega", async ({ tipoBodega, lineaProducto }) => {
        const tx = prepararDependencias();
        vi.mocked(prisma.bodega.findUnique).mockResolvedValue({ id: "b1", tipo: tipoBodega, estado: true } as never);
        vi.mocked(prisma.producto.findMany).mockResolvedValue([{ id: 1, linea: lineaProducto }] as never);

        const resultado = await crearOrdenEntrada({ ok: false, message: "" }, crearFormulario("Bodega Central"));

        expect(resultado).toEqual({ ok: true, message: "Orden de entrada registrada." });
        expect(tx.ordenEntrada.create).toHaveBeenCalledTimes(1);
        expect(tx.stock.upsert).toHaveBeenCalledTimes(1);
    });

    it("mantiene el error de producto inactivo antes de abrir una transacción", async () => {
        prepararDependencias();
        vi.mocked(prisma.producto.findMany).mockResolvedValue([] as never);

        const resultado = await crearOrdenEntrada({ ok: false, message: "" }, crearFormulario("Bodega Central"));

        expect(resultado).toEqual({ ok: false, message: "Uno de los productos seleccionados no existe o esta inactivo." });
        expect(prisma.$transaction).not.toHaveBeenCalled();
    });
});

describe("actualizarDetalleEntrada — compatibilidad de bodega y producto", () => {
    beforeEach(() => {
        vi.clearAllMocks();
    });

    it("rechaza el nuevo producto incompatible antes de revertir stock", async () => {
        prepararDependencias();
        vi.mocked(prisma.bodega.findUnique).mockResolvedValue({ id: "b1", tipo: "CLINICA", estado: true } as never);
        vi.mocked(prisma.producto.findMany).mockResolvedValue([{ id: 2, linea: "ASEO" }] as never);
        vi.mocked(prisma.ordenEntradaDetalle.findUniqueOrThrow).mockResolvedValue({
            id: "de1",
            productoId: 1,
            cantidad: 8,
            lote: "LOTE-ENTRADA-01",
            fechaCaducidad: new Date("2027-01-01"),
            ordenEntrada: { centroId: "c1", bodegaId: "b1" }
        } as never);
        const formData = crearFormulario("Bodega Central");
        formData.set("productoId", "2");

        const resultado = await actualizarDetalleEntrada("de1", formData);

        expect(resultado).toEqual({ ok: false, message: "Los productos de aseo solo pueden ingresarse en bodegas de aseo." });
        expect(prisma.$transaction).not.toHaveBeenCalled();
    });
});
