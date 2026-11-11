import { beforeEach, describe, expect, it, vi } from "vitest";

// lib
import * as authLib from "@/shared/lib/auth";
import { prisma } from "@/shared/lib/prisma";

// actions
import {
    crearOrdenSalida,
    actualizarDetalleSalida,
    eliminarDetalleSalida,
    anularPrestamoAction
} from "@/modules/orden-salida/actions/orden-salida.action";
import * as notifUtils from "@/modules/orden-salida/utils/notificar-prestamo";

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

vi.mock("@/shared/lib/prisma", () => ({
    prisma: {
        $transaction: vi.fn(),
        centro: { findMany: vi.fn(), findFirst: vi.fn(), findUnique: vi.fn() },
        bodega: { findMany: vi.fn(), findFirst: vi.fn(), findUnique: vi.fn() },
        encargadosBodega: { findMany: vi.fn() },
        ordenSalida: { findMany: vi.fn(), findUnique: vi.fn(), create: vi.fn(), updateMany: vi.fn() },
        ordenSalidaDetalle: {
            findMany: vi.fn(),
            create: vi.fn(),
            findUniqueOrThrow: vi.fn(),
            update: vi.fn(),
            delete: vi.fn()
        },
        stock: { findMany: vi.fn(), findUnique: vi.fn(), update: vi.fn(), upsert: vi.fn() }
    }
}));

vi.mock("@/modules/orden-salida/utils/notificar-prestamo", () => ({
    notificarPrestamoEnviado: vi.fn().mockResolvedValue(undefined)
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

function crearFormDataIntercentro(
    options: {
        centroDestinoId?: string;
        bodegaDestinoId?: string;
        fechaCaducidad?: string;
        advertenciaCaducidadAceptada?: string;
    } = {}
): FormData {
    const fd = new FormData();
    fd.append("fecha", new Date().toISOString().split("T")[0]);
    fd.append("centroId", "centro-1");
    fd.append("bodegaId", "b1");
    fd.append("tipoSalida", "A Otros Centros");
    fd.append("destino", "CESFAM Playa Ancha");
    fd.append("centroDestinoId", options.centroDestinoId ?? "centro-2");
    if (options.bodegaDestinoId !== undefined) {
        if (options.bodegaDestinoId !== "") {
            fd.append("bodegaDestinoId", options.bodegaDestinoId);
        }
    } else {
        fd.append("bodegaDestinoId", "b2");
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

describe("Emisión y Gestión de Traspaso / Préstamo Intercentros (orden-salida.action)", () => {
    beforeEach(() => {
        vi.clearAllMocks();
        sesionOperador();
    });

    const initialState = { ok: false, message: "" };

    describe("crearOrdenSalida (emisión préstamo)", () => {
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

        it("rechaza si no se especifica la bodega destino del centro receptor", async () => {
            const fd = crearFormDataIntercentro({ bodegaDestinoId: "" });
            const res = await crearOrdenSalida(initialState, fd);
            expect(res.ok).toBe(false);
            expect(res.message).toMatch(/Debe seleccionar la bodega destino del centro receptor/i);
        });

        it("rechaza si bodegaDestinoId provista no pertenece al centroDestino o no está activa", async () => {
            vi.mocked(prisma.bodega.findUnique).mockResolvedValue({
                id: "b-ajena",
                nombre: "Bodega Ajena",
                centroId: "otro-centro-distinto",
                estado: true
            } as never);

            const fd = crearFormDataIntercentro({ bodegaDestinoId: "b-ajena" });
            const res = await crearOrdenSalida(initialState, fd);
            expect(res.ok).toBe(false);
            expect(res.message).toMatch(/no pertenece al centro de destino/i);
        });

        it("exige confirmación si un lote vence en <= 7 días (advertencia sanitaria)", async () => {
            const fechaProxima = new Date(Date.now() + 2 * 24 * 60 * 60 * 1000).toISOString().split("T")[0];
            const fd = crearFormDataIntercentro({ fechaCaducidad: fechaProxima });

            const res = await crearOrdenSalida(initialState, fd);
            expect(res.ok).toBe(false);
            expect(res.message).toMatch(/plazo de 1 semana.*confirmación de advertencia sanitaria/i);
        });

        it("emite exitosamente con estado EN_TRANSITO, código de 7 caracteres y notifica internamente", async () => {
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
                        update: vi.fn().mockResolvedValue({ ...stockActual, cantidadDisponible: 15 })
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
            expect(notifUtils.notificarPrestamoEnviado).toHaveBeenCalledWith(ordenCreada.id);
        });

        it("reintenta regenerar el código si ocurre colisión única P2002", async () => {
            let intentos = 0;
            const stockActual = {
                id: "stk-1",
                productoId: 101,
                bodegaId: "b1",
                cantidadDisponible: 20,
                lote: "LOT-EXP-2027",
                fechaCaducidad: new Date(Date.now() + 365 * 24 * 60 * 60 * 1000)
            };

            vi.mocked(prisma.$transaction).mockImplementation(async (callback) => {
                intentos++;
                if (intentos === 1) {
                    const p2002Error = new Error("Unique constraint failed on the fields: (`Codigo_Recepcion`)");
                    Object.assign(p2002Error, { code: "P2002" });
                    throw p2002Error;
                }
                const tx = {
                    ordenSalida: {
                        create: vi.fn().mockResolvedValue({
                            id: "ord-retry-ok",
                            codigoRecepcion: "R99J2Q8",
                            estadoPrestamo: "EN_TRANSITO"
                        })
                    },
                    stock: {
                        findUnique: vi.fn().mockResolvedValue(stockActual),
                        update: vi.fn().mockResolvedValue({ ...stockActual, cantidadDisponible: 15 })
                    },
                    ordenSalidaDetalle: { create: vi.fn() }
                };
                return callback(tx as never);
            });

            const fd = crearFormDataIntercentro();
            const res = await crearOrdenSalida(initialState, fd);

            expect(res.ok).toBe(true);
            expect(intentos).toBe(2);
        });
    });

    describe("Bloqueo de edición y eliminación de detalle en préstamos", () => {
        it("actualizarDetalleSalida rechaza modificar el detalle de una orden de préstamo", async () => {
            vi.mocked(prisma.ordenSalidaDetalle.findUniqueOrThrow).mockResolvedValue({
                id: "det-prestamo",
                productoId: 101,
                cantidad: 5,
                lote: "LOT-1",
                fechaCaducidad: new Date("2027-10-10"),
                ordenSalida: {
                    id: "ord-p-1",
                    centroId: "centro-1",
                    bodegaId: "b1",
                    centroDestinoId: "centro-2", // Es préstamo
                    tipoSalida: "A Otros Centros"
                }
            } as never);

            const fd = new FormData();
            fd.append("productoId", "101");
            fd.append("cantidad", "8");
            fd.append("lote", "LOT-1");
            fd.append("fechaCaducidad", "2027-10-10");

            const res = await actualizarDetalleSalida("det-prestamo", fd);
            expect(res.ok).toBe(false);
            expect(res.message).toMatch(/No se permite modificar ni eliminar el detalle de un préstamo/i);
        });

        it("eliminarDetalleSalida rechaza eliminar el detalle de una orden de préstamo", async () => {
            vi.mocked(prisma.ordenSalidaDetalle.findUniqueOrThrow).mockResolvedValue({
                id: "det-prestamo",
                productoId: 101,
                cantidad: 5,
                lote: "LOT-1",
                fechaCaducidad: new Date("2027-10-10"),
                ordenSalida: {
                    id: "ord-p-1",
                    centroId: "centro-1",
                    bodegaId: "b1",
                    centroDestinoId: "centro-2", // Es préstamo
                    tipoSalida: "A Otros Centros"
                }
            } as never);

            const res = await eliminarDetalleSalida("det-prestamo");
            expect(res.ok).toBe(false);
            expect(res.message).toMatch(/No se permite modificar ni eliminar el detalle de un préstamo/i);
        });
    });

    describe("anularPrestamoAction (anulación y restitución de stock)", () => {
        it("exige motivo de anulación de al menos 5 caracteres", async () => {
            const res = await anularPrestamoAction("ord-1", "abc");
            expect(res.ok).toBe(false);
            expect(res.message).toMatch(/motivo de anulación detallado/i);
        });

        it("rechaza si la orden no está en EN_TRANSITO", async () => {
            vi.mocked(prisma.ordenSalida.findUnique).mockResolvedValue({
                id: "ord-1",
                centroId: "centro-1",
                bodegaId: "b1",
                centroDestinoId: "centro-2",
                estadoPrestamo: "RECEPCIONADO",
                detalles: []
            } as never);

            const res = await anularPrestamoAction("ord-1", "Extravío en camino");
            expect(res.ok).toBe(false);
            expect(res.message).toMatch(/Solo se pueden anular préstamos que se encuentren en estado 'EN_TRANSITO'/i);
        });

        it("anula exitosamente pasando a ANULADO y restituye el stock a la bodega de origen", async () => {
            const mockDetalles = [
                {
                    id: "det-1",
                    productoId: 101,
                    cantidad: 5,
                    lote: "LOT-1",
                    fechaCaducidad: new Date("2027-10-10")
                }
            ];
            vi.mocked(prisma.ordenSalida.findUnique).mockResolvedValue({
                id: "ord-1",
                centroId: "centro-1",
                bodegaId: "b1",
                centroDestinoId: "centro-2",
                codigoRecepcion: "K94J2Q8",
                estadoPrestamo: "EN_TRANSITO",
                tipoSalida: "A Otros Centros",
                detalles: mockDetalles
            } as never);

            const mockStockUpsert = vi.fn().mockResolvedValue({});
            const mockUpdateMany = vi.fn().mockResolvedValue({ count: 1 });

            vi.mocked(prisma.$transaction).mockImplementation(async (callback) => {
                const tx = {
                    ordenSalida: { updateMany: mockUpdateMany },
                    stock: { upsert: mockStockUpsert }
                };
                return callback(tx as never);
            });

            const res = await anularPrestamoAction("ord-1", "Extravío en transporte terrestre");
            expect(res.ok).toBe(true);
            expect(res.message).toMatch(/stock restituido/i);
            expect(mockUpdateMany).toHaveBeenCalledWith({
                where: {
                    id: "ord-1",
                    estadoPrestamo: "EN_TRANSITO"
                },
                data: expect.objectContaining({
                    estadoPrestamo: "ANULADO",
                    observacionRecepcion: expect.stringContaining("Extravío en transporte terrestre")
                })
            });
            expect(mockStockUpsert).toHaveBeenCalledTimes(1);
        });

        it("rechaza si el préstamo ya fue procesado concurrentemente al anular", async () => {
            vi.mocked(prisma.ordenSalida.findUnique).mockResolvedValue({
                id: "ord-1",
                centroId: "centro-1",
                bodegaId: "b1",
                centroDestinoId: "centro-2",
                codigoRecepcion: "K94J2Q8",
                estadoPrestamo: "EN_TRANSITO",
                tipoSalida: "A Otros Centros",
                detalles: []
            } as never);

            vi.mocked(prisma.$transaction).mockImplementation(async (callback) => {
                const tx = {
                    ordenSalida: { updateMany: vi.fn().mockResolvedValue({ count: 0 }) },
                    stock: { upsert: vi.fn() }
                };
                return callback(tx as never);
            });

            const res = await anularPrestamoAction("ord-1", "Extravío en transporte terrestre");
            expect(res.ok).toBe(false);
            expect(res.message).toBe("El préstamo ya fue recibido o anulado.");
        });
    });
});
