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
        requireSessionUser: vi.fn(),
        puedeOperarSalida: vi.fn().mockReturnValue(true)
    };
});

vi.mock("@/shared/lib/inventario-alcance", () => ({
    validarCentroBodegaEnAlcance: vi.fn().mockResolvedValue(undefined),
    obtenerAlcanceInventario: vi.fn().mockResolvedValue({
        centros: [],
        bodegas: [],
        centroId: "centro-1",
        bodegaId: "b1",
        puedeFiltrarCentro: true
    })
}));

vi.mock("@/shared/lib/logger", () => ({ AuditLogger: { log: vi.fn() } }));

vi.mock("@/modules/orden-salida/utils/notificar-prestamo", () => ({
    notificarPrestamoEnviado: vi.fn().mockResolvedValue(undefined)
}));

vi.mock("@/shared/lib/prisma", () => ({
    prisma: {
        $transaction: vi.fn(),
        centro: { findFirst: vi.fn(), findUnique: vi.fn() },
        bodega: { findFirst: vi.fn(), findUnique: vi.fn() },
        unidad: { findFirst: vi.fn() },
        encargadosBodega: { findMany: vi.fn() },
        ordenSalida: { create: vi.fn() },
        ordenSalidaDetalle: { create: vi.fn() },
        stock: { findUnique: vi.fn(), update: vi.fn() }
    }
}));

describe("Validación de Destinos y Bodega Destino en Órdenes de Salida", () => {
    const initialState = { ok: false, message: "" };

    const centroOrigen = { id: "centro-1", nombre: "CESFAM Barón", estado: true };
    const centroDestino = { id: "centro-2", nombre: "CESFAM Playa Ancha", estado: true };
    const bodegaOrigen = { id: "b1", nombre: "Bodega Barón", centroId: "centro-1", estado: true };
    const bodegaDestino = { id: "b2", nombre: "Bodega Playa Ancha", centroId: "centro-2", estado: true };

    beforeEach(() => {
        vi.clearAllMocks();
        vi.mocked(authLib.requireSessionUser).mockResolvedValue({
            id: "user-1",
            nombre: "Juan",
            apPaterno: "Perez",
            email: "operador@cmvalparaiso.cl",
            rol: "R07",
            centroId: "centro-1",
            bodegaId: "b1"
        });
        vi.mocked(prisma.centro.findFirst).mockResolvedValue(centroOrigen as never);
        vi.mocked(prisma.bodega.findFirst).mockResolvedValue(bodegaOrigen as never);
        vi.mocked(prisma.encargadosBodega.findMany).mockResolvedValue([]);
    });

    describe("Consumo Interno — Validación contra tabla Unidad", () => {
        function crearFormDataConsumo(destino: string): FormData {
            const fd = new FormData();
            fd.append("fecha", "2026-11-10");
            fd.append("centroId", "centro-1");
            fd.append("bodegaId", "b1");
            fd.append("tipoSalida", "Consumo Interno");
            fd.append("destino", destino);
            fd.append("productoId", "1");
            fd.append("cantidad", "2");
            fd.append("lote", "LOT-1");
            fd.append("fechaCaducidad", "2027-12-31");
            return fd;
        }

        it("rechaza Consumo Interno si el destino no existe en la tabla Unidad", async () => {
            vi.mocked(prisma.unidad.findFirst).mockResolvedValue(null);

            const fd = crearFormDataConsumo("Servicio Ficticio Inexistente");
            const res = await crearOrdenSalida(initialState, fd);

            expect(res.ok).toBe(false);
            expect(res.message).toMatch(/servicio o unidad clínica seleccionada no es válida/i);
        });

        it("permite Consumo Interno si el destino coincide con una Unidad registrada", async () => {
            vi.mocked(prisma.unidad.findFirst).mockResolvedValue({
                id: "u-1",
                descripcion: "Box Médico / Consulta Médica"
            } as never);

            const stockMock = {
                id: "stk-1",
                bodegaId: "b1",
                productoId: 1,
                lote: "LOT-1",
                cantidadDisponible: 10,
                fechaCaducidad: new Date("2027-12-31")
            };
            vi.mocked(prisma.stock.findUnique).mockResolvedValue(stockMock as never);
            vi.mocked(prisma.$transaction).mockImplementation((async (callback: (tx: unknown) => Promise<unknown>) => {
                const tx = {
                    ordenSalida: { create: vi.fn().mockResolvedValue({ id: "ord-1" }) },
                    ordenSalidaDetalle: { create: vi.fn().mockResolvedValue({}) },
                    stock: {
                        findUnique: vi.fn().mockResolvedValue(stockMock),
                        update: vi.fn().mockResolvedValue({})
                    }
                };
                return callback(tx);
            }) as never);

            const fd = crearFormDataConsumo("Box Médico / Consulta Médica");
            const res = await crearOrdenSalida(initialState, fd);

            expect(res.ok).toBe(true);
            expect(res.id).toBe("ord-1");
        });
    });

    describe("A Otros Centros — Validación de Bodega Destino Obligatoria", () => {
        function crearFormDataIntercentro(bodegaDestinoId?: string): FormData {
            const fd = new FormData();
            fd.append("fecha", "2026-11-10");
            fd.append("centroId", "centro-1");
            fd.append("bodegaId", "b1");
            fd.append("tipoSalida", "A Otros Centros");
            fd.append("destino", "CESFAM Playa Ancha");
            fd.append("centroDestinoId", "centro-2");
            if (bodegaDestinoId !== undefined) {
                fd.append("bodegaDestinoId", bodegaDestinoId);
            }
            fd.append("productoId", "1");
            fd.append("cantidad", "2");
            fd.append("lote", "LOT-1");
            fd.append("fechaCaducidad", "2027-12-31");
            return fd;
        }

        it("rechaza si falta bodegaDestinoId", async () => {
            const fd = crearFormDataIntercentro();
            const res = await crearOrdenSalida(initialState, fd);

            expect(res.ok).toBe(false);
            expect(res.message).toMatch(/Debe seleccionar la bodega destino/i);
        });

        it("rechaza si bodegaDestinoId pertenece a otro centro distinto al centro receptor", async () => {
            vi.mocked(prisma.centro.findUnique).mockResolvedValue(centroDestino as never);
            vi.mocked(prisma.bodega.findUnique).mockResolvedValue({
                id: "b-otra",
                nombre: "Bodega de otro centro",
                centroId: "centro-3",
                estado: true
            } as never);

            const fd = crearFormDataIntercentro("b-otra");
            const res = await crearOrdenSalida(initialState, fd);

            expect(res.ok).toBe(false);
            expect(res.message).toMatch(/bodega de destino seleccionada no pertenece al centro de destino/i);
        });

        it("rechaza si bodegaDestinoId está inactiva", async () => {
            vi.mocked(prisma.centro.findUnique).mockResolvedValue(centroDestino as never);
            vi.mocked(prisma.bodega.findUnique).mockResolvedValue({
                id: "b2-inactiva",
                nombre: "Bodega Desactivada",
                centroId: "centro-2",
                estado: false
            } as never);

            const fd = crearFormDataIntercentro("b2-inactiva");
            const res = await crearOrdenSalida(initialState, fd);

            expect(res.ok).toBe(false);
            expect(res.message).toMatch(/bodega de destino seleccionada no pertenece al centro de destino o no está activa/i);
        });

        it("emite el préstamo exitosamente y persiste bodegaDestinoId cuando es válida", async () => {
            vi.mocked(prisma.centro.findUnique).mockResolvedValue(centroDestino as never);
            vi.mocked(prisma.bodega.findUnique).mockResolvedValue(bodegaDestino as never);

            const stockMock = {
                id: "stk-1",
                bodegaId: "b1",
                productoId: 1,
                lote: "LOT-1",
                cantidadDisponible: 10,
                fechaCaducidad: new Date("2027-12-31")
            };
            vi.mocked(prisma.stock.findUnique).mockResolvedValue(stockMock as never);

            let createdData: unknown = null;
            vi.mocked(prisma.$transaction).mockImplementation((async (callback: (tx: unknown) => Promise<unknown>) => {
                const tx = {
                    ordenSalida: {
                        create: vi.fn().mockImplementation((args: { data: unknown }) => {
                            createdData = args.data;
                            return Promise.resolve({ id: "ord-prestamo-1" });
                        })
                    },
                    ordenSalidaDetalle: { create: vi.fn().mockResolvedValue({}) },
                    stock: {
                        findUnique: vi.fn().mockResolvedValue(stockMock),
                        update: vi.fn().mockResolvedValue({})
                    }
                };
                return callback(tx);
            }) as never);

            const fd = crearFormDataIntercentro("b2");
            const res = await crearOrdenSalida(initialState, fd);

            expect(res.ok).toBe(true);
            expect(res.id).toBe("ord-prestamo-1");
            expect(createdData).toMatchObject({
                centroDestinoId: "centro-2",
                bodegaDestinoId: "b2",
                estadoPrestamo: "EN_TRANSITO"
            });
        });
    });
});
