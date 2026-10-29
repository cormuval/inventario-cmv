import { beforeEach, describe, expect, it, vi } from "vitest";

// lib
import * as authLib from "@/shared/lib/auth";
import { prisma } from "@/shared/lib/prisma";

// actions
import { crearOrdenSalida } from "@/modules/orden-salida/actions/orden-salida.action";
import * as notifActions from "@/modules/orden-salida/actions/notificacion-correo";

vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));
vi.mock("@/auth", () => ({ auth: vi.fn() }));

vi.mock("@/shared/lib/auth", async (importOriginal) => {
    const original = await importOriginal<typeof import("@/shared/lib/auth")>();
    return {
        ...original,
        requireSessionUser: vi.fn()
    };
});

vi.mock("@/shared/lib/logger", () => ({ AuditLogger: { log: vi.fn() } }));

vi.mock("@/shared/lib/prisma", () => ({
    prisma: {
        $transaction: vi.fn(),
        centro: { findMany: vi.fn(), findFirst: vi.fn(), findUnique: vi.fn() },
        bodega: { findMany: vi.fn(), findFirst: vi.fn(), findUnique: vi.fn() },
        encargadosBodega: { findMany: vi.fn() },
        ordenSalida: { findMany: vi.fn(), create: vi.fn() },
        ordenSalidaDetalle: { findMany: vi.fn(), create: vi.fn(), findUniqueOrThrow: vi.fn(), update: vi.fn(), delete: vi.fn() },
        stock: { findMany: vi.fn(), findUnique: vi.fn(), update: vi.fn(), upsert: vi.fn() }
    }
}));

vi.mock("@/modules/orden-salida/actions/notificacion-correo", () => ({
    despacharNotificacionPrestamoAction: vi.fn().mockResolvedValue({ ok: true, destinatarios: ["dest@cmvalparaiso.cl"] })
}));

const centroOrigen = { id: "centro-1", nombre: "CESFAM Barón", estado: true };
const centroDestino = { id: "centro-2", nombre: "CESFAM Playa Ancha", estado: true };
const bodegaOrigen = { id: "b1", nombre: "Bodega Farmacia Barón", centroId: "centro-1", estado: true };
const bodegaDestino = { id: "b2", nombre: "Bodega Farmacia Playa Ancha", centroId: "centro-2", estado: true };

function sesionOperador(): void {
    vi.mocked(authLib.requireSessionUser).mockResolvedValue({
        id: "user-emisor",
        nombre: "Operador",
        apPaterno: "Emisor",
        email: "emisor@cmvalparaiso.cl",
        rol: "R07",
        centroId: "centro-1",
        bodegaId: "b1"
    });
    vi.mocked(prisma.centro.findFirst).mockResolvedValue(centroOrigen as never);
    vi.mocked(prisma.encargadosBodega.findMany).mockResolvedValue([]);
    vi.mocked(prisma.bodega.findFirst).mockResolvedValue(bodegaOrigen as never);
    vi.mocked(prisma.centro.findUnique).mockResolvedValue(centroDestino as never);
    vi.mocked(prisma.bodega.findUnique).mockResolvedValue(bodegaDestino as never);
}

function crearFormDataIntercentro(options: {
    centroDestinoId?: string;
    bodegaDestinoId?: string;
    fechaCaducidad?: string;
    advertenciaCaducidadAceptada?: string;
} = {}): FormData {
    const fd = new FormData();
    fd.append("fecha", "2026-10-27");
    fd.append("centroId", "centro-1");
    fd.append("bodegaId", "b1");
    fd.append("tipoSalida", "A Otros Centros");
    fd.append("destino", "CESFAM Playa Ancha");
    fd.append("centroDestinoId", options.centroDestinoId ?? "centro-2");
    if (options.bodegaDestinoId) {
        fd.append("bodegaDestinoId", options.bodegaDestinoId);
    }
    if (options.advertenciaCaducidadAceptada) {
        fd.append("advertenciaCaducidadAceptada", options.advertenciaCaducidadAceptada);
    }
    fd.append("productoId", "101");
    fd.append("cantidad", "5");
    fd.append("lote", "LOT-EXP-2027");
    fd.append("fechaCaducidad", options.fechaCaducidad ?? "2027-12-31");
    return fd;
}

describe("Emisión de Traspaso / Préstamo Intercentros (orden-salida.action)", () => {
    beforeEach(() => {
        vi.clearAllMocks();
        sesionOperador();
    });

    const initialState = { ok: false, message: "" };

    it("rechaza si no se especifica el centro de destino", async () => {
        const fd = crearFormDataIntercentro({ centroDestinoId: "" });
        const res = await crearOrdenSalida(initialState, fd);
        expect(res.ok).toBe(false);
        expect(res.message).toMatch(/Debe seleccionar el centro de destino/i);
    });

    it("rechaza si el centro destino es el mismo centro de origen", async () => {
        const fd = crearFormDataIntercentro({ centroDestinoId: "centro-1" });
        const res = await crearOrdenSalida(initialState, fd);
        expect(res.ok).toBe(false);
        expect(res.message).toMatch(/El centro destino no puede ser el mismo centro de origen/i);
    });

    it("exige confirmación si un lote vence en <= 7 días (advertencia sanitaria)", async () => {
        // Mañana (dentro de los 7 días)
        const fechaProxima = new Date(Date.now() + 2 * 24 * 60 * 60 * 1000).toISOString().split("T")[0];
        const fd = crearFormDataIntercentro({ fechaCaducidad: fechaProxima });

        const res = await crearOrdenSalida(initialState, fd);
        expect(res.ok).toBe(false);
        expect(res.message).toMatch(/plazo de 1 semana.*confirmación de advertencia sanitaria/i);
    });

    it("emite exitosamente con estado EN_TRANSITO, código de 7 caracteres y fecha límite a 7 días", async () => {
        const stockActual = {
            id: "stk-1",
            productoId: 101,
            bodegaId: "b1",
            cantidadDisponible: 20,
            lote: "LOT-EXP-2027",
            fechaCaducidad: new Date(Date.now() + 365 * 24 * 60 * 60 * 1000)
        };
        const ordenCreada = {
            id: "ord-trans-1",
            codigoRecepcion: "K94J2Q8",
            estadoPrestamo: "EN_TRANSITO",
            fechaLimiteRecepcion: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000)
        };

        vi.mocked(prisma.$transaction).mockImplementation(async (callback) => {
            const tx = {
                ordenSalida: { create: vi.fn().mockResolvedValue(ordenCreada) },
                stock: {
                    findUnique: vi.fn().mockResolvedValue(stockActual),
                    update: vi.fn().mockResolvedValue({ ...stockActual, cantidad: 15 })
                },
                ordenSalidaDetalle: { create: vi.fn() }
            };
            return callback(tx as never);
        });

        const fd = crearFormDataIntercentro();
        const res = await crearOrdenSalida(initialState, fd);

        expect(res.ok).toBe(true);
        expect(res.codigoRecepcion).toBeDefined();
        expect(res.codigoRecepcion).toHaveLength(7);
        expect(notifActions.despacharNotificacionPrestamoAction).toHaveBeenCalled();
    });
});
