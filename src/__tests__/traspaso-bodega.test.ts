import { beforeEach, describe, expect, it, vi } from "vitest";

// lib
import * as authLib from "@/shared/lib/auth";
import { prisma } from "@/shared/lib/prisma";

// actions
import { crearOrdenSalida } from "@/modules/orden-salida/actions/orden-salida.action";

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
        centro: { findMany: vi.fn(), findFirst: vi.fn() },
        bodega: { findMany: vi.fn(), findFirst: vi.fn(), findUnique: vi.fn() },
        encargadosBodega: { findMany: vi.fn() },
        ordenSalida: { findMany: vi.fn(), create: vi.fn() },
        ordenSalidaDetalle: { findMany: vi.fn(), create: vi.fn(), findUniqueOrThrow: vi.fn() },
        stock: { findMany: vi.fn(), findUnique: vi.fn(), update: vi.fn(), upsert: vi.fn() }
    }
}));

const centroBaron = { id: "centro-1", nombre: "CESFAM Barón", estado: true };
const bodegaFarmacia = { id: "b1", nombre: "Bodega Farmacia", centroId: "centro-1", estado: true };
const bodegaVacunatorio = { id: "b2", nombre: "Bodega Vacunatorio", centroId: "centro-1", estado: true };

function sesionOperador(): void {
    vi.mocked(authLib.requireSessionUser).mockResolvedValue({
        id: "user-operador",
        nombre: "Operador",
        apPaterno: "Salida",
        email: "operador@cmvalparaiso.cl",
        rol: "R07",
        centroId: "centro-1",
        bodegaId: "b1"
    });
    vi.mocked(prisma.centro.findFirst).mockResolvedValue(centroBaron as never);
    vi.mocked(prisma.encargadosBodega.findMany).mockResolvedValue([]);
    vi.mocked(prisma.bodega.findFirst).mockResolvedValue(bodegaFarmacia as never);
}

function crearFormDataTraspaso(options: {
    centroId?: string;
    bodegaId?: string;
    bodegaDestinoId?: string;
    fechaCaducidad?: Date;
    cantidad?: number;
}): FormData {
    const formData = new FormData();
    formData.set("fecha", new Date().toISOString());
    formData.set("centroId", options.centroId ?? "centro-1");
    formData.set("bodegaId", options.bodegaId ?? "b1");
    formData.set("tipoSalida", "A otra bodega");
    formData.set("destino", "Bodega Vacunatorio");
    if (options.bodegaDestinoId !== undefined) {
        formData.set("bodegaDestinoId", options.bodegaDestinoId);
    }
    formData.append("productoId", "1");
    formData.append("cantidad", String(options.cantidad ?? 5));
    formData.append("lote", "LOTE-01");
    const caducidad = options.fechaCaducidad ?? new Date(Date.now() + 365 * 24 * 60 * 60 * 1000);
    formData.append("fechaCaducidad", caducidad.toISOString());
    return formData;
}

describe("traspaso a otra bodega en el mismo centro", () => {
    beforeEach(() => {
        vi.clearAllMocks();
    });

    it("ejecuta traspaso atómico descontando en origen e incrementando en destino", async () => {
        sesionOperador();
        vi.mocked(prisma.bodega.findUnique).mockResolvedValue(bodegaVacunatorio as never);

        const tx = {
            ordenSalida: {
                create: vi.fn().mockResolvedValue({ id: "orden-traspaso-1" })
            },
            ordenSalidaDetalle: {
                create: vi.fn().mockResolvedValue({ id: "det-1" })
            },
            stock: {
                findUnique: vi.fn().mockResolvedValue({
                    id: "stock-origen-1",
                    productoId: 1,
                    bodegaId: "b1",
                    cantidadDisponible: 20,
                    lote: "LOTE-01",
                    fechaCaducidad: new Date(Date.now() + 365 * 24 * 60 * 60 * 1000)
                }),
                update: vi.fn().mockResolvedValue({}),
                upsert: vi.fn().mockResolvedValue({})
            }
        };

        vi.mocked(prisma.$transaction).mockImplementation((async (fn: (client: unknown) => Promise<unknown>) => fn(tx)) as never);

        const formData = crearFormDataTraspaso({ bodegaDestinoId: "b2" });
        const resultado = await crearOrdenSalida({ ok: false, message: "" }, formData);

        expect(resultado.ok).toBe(true);
        expect(resultado.message).toBe("Orden de salida registrada.");
        expect(prisma.$transaction).toHaveBeenCalled();

        // Descuenta en bodega origen (b1)
        expect(tx.stock.update).toHaveBeenCalledWith(
            expect.objectContaining({
                where: { id: "stock-origen-1" },
                data: expect.objectContaining({
                    cantidadDisponible: { decrement: 5 }
                })
            })
        );

        // Incrementa en bodega destino (b2)
        expect(tx.stock.upsert).toHaveBeenCalledWith(
            expect.objectContaining({
                where: {
                    stock_lote_unico: expect.objectContaining({
                        bodegaId: "b2",
                        productoId: 1,
                        lote: "LOTE-01"
                    })
                },
                update: expect.objectContaining({
                    cantidadDisponible: { increment: 5 }
                })
            })
        );
    });

    it("rechaza si no se selecciona bodega destino", async () => {
        sesionOperador();

        const formData = crearFormDataTraspaso({});
        formData.delete("bodegaDestinoId");

        const resultado = await crearOrdenSalida({ ok: false, message: "" }, formData);

        expect(resultado.ok).toBe(false);
        expect(resultado.message).toContain("Debe seleccionar la bodega destino");
        expect(prisma.$transaction).not.toHaveBeenCalled();
    });

    it("rechaza si la bodega destino es igual a la bodega origen", async () => {
        sesionOperador();

        const formData = crearFormDataTraspaso({ bodegaDestinoId: "b1" });
        const resultado = await crearOrdenSalida({ ok: false, message: "" }, formData);

        expect(resultado.ok).toBe(false);
        expect(resultado.message).toContain("no puede ser la misma bodega de origen");
        expect(prisma.$transaction).not.toHaveBeenCalled();
    });

    it("rechaza si la bodega destino pertenece a otro centro", async () => {
        sesionOperador();
        vi.mocked(prisma.bodega.findUnique).mockResolvedValue({
            id: "b-otro-centro",
            nombre: "Bodega Esperanza",
            centroId: "centro-2",
            estado: true
        } as never);

        const formData = crearFormDataTraspaso({ bodegaDestinoId: "b-otro-centro" });
        const resultado = await crearOrdenSalida({ ok: false, message: "" }, formData);

        expect(resultado.ok).toBe(false);
        expect(resultado.message).toContain("no pertenece al mismo centro de salud");
        expect(prisma.$transaction).not.toHaveBeenCalled();
    });

    it("bloquea el traspaso si el lote está caducado", async () => {
        sesionOperador();
        vi.mocked(prisma.bodega.findUnique).mockResolvedValue(bodegaVacunatorio as never);

        const loteVencido = new Date(Date.now() - 10 * 24 * 60 * 60 * 1000);
        const tx = {
            ordenSalida: { create: vi.fn().mockResolvedValue({ id: "orden-1" }) },
            stock: {
                findUnique: vi.fn().mockResolvedValue({
                    id: "stock-1",
                    productoId: 1,
                    bodegaId: "b1",
                    cantidadDisponible: 10,
                    lote: "LOTE-CAD",
                    fechaCaducidad: loteVencido
                })
            }
        };
        vi.mocked(prisma.$transaction).mockImplementation((async (fn: (client: unknown) => Promise<unknown>) => fn(tx)) as never);

        const formData = crearFormDataTraspaso({
            bodegaDestinoId: "b2",
            fechaCaducidad: loteVencido
        });

        const resultado = await crearOrdenSalida({ ok: false, message: "" }, formData);

        expect(resultado.ok).toBe(false);
        expect(resultado.message).toContain("se encuentra caducado");
    });
});
