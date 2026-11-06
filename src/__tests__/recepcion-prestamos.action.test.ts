import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

// lib
import * as authLib from "@/shared/lib/auth";
import { validarCentroBodegaEnAlcance } from "@/shared/lib/inventario-alcance";
import { prisma } from "@/shared/lib/prisma";

// actions
import {
    buscarPrestamoPorCodigoAction,
    confirmarRecepcionPrestamoAction
} from "@/modules/orden-entrada/actions/recepcion-prestamos.action";

vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));
vi.mock("@/auth", () => ({ auth: vi.fn() }));

vi.mock("@/shared/lib/auth", async (importOriginal) => {
    const original = await importOriginal<typeof import("@/shared/lib/auth")>();
    return {
        ...original,
        requireSessionUser: vi.fn(),
        puedeOperarEntrada: vi.fn().mockReturnValue(true)
    };
});

vi.mock("@/shared/lib/inventario-alcance", () => ({
    validarCentroBodegaEnAlcance: vi.fn().mockResolvedValue(undefined)
}));

vi.mock("@/shared/lib/logger", () => ({ AuditLogger: { log: vi.fn() } }));

vi.mock("@/shared/lib/prisma", () => ({
    prisma: {
        $transaction: vi.fn(),
        centro: { findMany: vi.fn(), findFirst: vi.fn(), findUnique: vi.fn() },
        bodega: { findMany: vi.fn(), findFirst: vi.fn(), findUnique: vi.fn() },
        ordenSalida: { findFirst: vi.fn(), findUnique: vi.fn(), update: vi.fn(), updateMany: vi.fn() },
        ordenEntrada: { create: vi.fn() },
        stock: { upsert: vi.fn() }
    }
}));

const mockUserReceptor = {
    id: "user-receptor",
    nombre: "Receptor",
    apPaterno: "Playa Ancha",
    email: "receptor@cmvalparaiso.cl",
    rol: "R07",
    centroId: "centro-playa-ancha",
    bodegaId: "bodega-pa-1"
};

const mockOrdenEnTransito = {
    id: "orden-salida-100",
    codigoRecepcion: "K94J2Q8",
    estadoPrestamo: "EN_TRANSITO",
    centroId: "centro-baron",
    centroDestinoId: "centro-playa-ancha",
    bodegaDestinoId: "bodega-pa-1",
    fecha: new Date("2026-10-25"),
    fechaLimiteRecepcion: new Date(Date.now() + 5 * 24 * 60 * 60 * 1000), // dentro de 1 semana
    centro: { nombre: "CESFAM Barón" },
    bodega: { nombre: "Bodega Farmacia Barón" },
    detalles: [
        {
            id: "det-1",
            productoId: 10,
            cantidad: 20,
            lote: "LOT-ABC",
            fechaCaducidad: new Date("2027-05-20"),
            producto: { id: 10, descripcion: "Ibuprofeno 400mg", linea: "Farmaco" }
        }
    ]
};

describe("Recepción de Préstamos Intercentros (recepcion-prestamos.action)", () => {
    beforeEach(() => {
        vi.clearAllMocks();
        vi.mocked(authLib.requireSessionUser).mockResolvedValue(mockUserReceptor as never);
    });

    describe("buscarPrestamoPorCodigoAction", () => {
        it("rechaza si el código de 7 caracteres no tiene formato válido", async () => {
            const res = await buscarPrestamoPorCodigoAction("COD12"); // corto
            expect(res.ok).toBe(false);
            expect(res.message).toMatch(/código no válido/i);
        });

        it("rechaza si la orden no existe o ya no está EN_TRANSITO", async () => {
            vi.mocked(prisma.ordenSalida.findFirst).mockResolvedValue(null);
            const res = await buscarPrestamoPorCodigoAction("K94J2Q8");
            expect(res.ok).toBe(false);
            expect(res.message).toMatch(/no encontrada o ya fue recepcionada/i);
        });

        it("rechaza si el usuario pertenece a un centro distinto del centro destino", async () => {
            vi.mocked(prisma.ordenSalida.findFirst).mockResolvedValue({
                ...mockOrdenEnTransito,
                centroDestinoId: "otro-centro"
            } as never);

            const res = await buscarPrestamoPorCodigoAction("K94J2Q8");
            expect(res.ok).toBe(false);
            expect(res.message).toMatch(/destinado a otro centro de salud/i);
        });

        it("retorna el resumen de productos y detecta si tiene demora (> 1 semana)", async () => {
            const ordenConDemora = {
                ...mockOrdenEnTransito,
                fechaLimiteRecepcion: new Date(Date.now() - 2 * 24 * 60 * 60 * 1000) // Venció hace 2 días
            };
            vi.mocked(prisma.ordenSalida.findFirst).mockResolvedValue(ordenConDemora as never);

            const res = await buscarPrestamoPorCodigoAction("K94J2Q8");
            expect(res.ok).toBe(true);
            expect(res.prestamo?.esDemorado).toBe(true);
            expect(res.prestamo?.detalles).toHaveLength(1);
            expect(res.prestamo?.detalles[0].productoDescripcion).toBe("Ibuprofeno 400mg");
        });
    });

    describe("confirmarRecepcionPrestamoAction", () => {
        afterEach(() => {
            vi.useRealTimers();
        });

        function bodegaReceptoraActiva(): void {
            vi.mocked(prisma.ordenSalida.findFirst).mockResolvedValue(mockOrdenEnTransito as never);
            vi.mocked(prisma.bodega.findUnique).mockResolvedValue({
                id: "bodega-pa-1",
                nombre: "Farmacia Playa Ancha",
                centroId: "centro-playa-ancha",
                estado: true
            } as never);
        }

        it("registra la entrada con la fecha de Chile aunque en UTC ya sea el día siguiente", async () => {
            // 23:30 del 5 de noviembre en Chile (UTC-3) = 02:30 del 6 de noviembre en UTC
            vi.useFakeTimers({ toFake: ["Date"] });
            vi.setSystemTime(new Date("2026-11-06T02:30:00.000Z"));
            bodegaReceptoraActiva();
            const mockOrdenEntradaCreate = vi.fn().mockResolvedValue({ id: "ent-1" });
            vi.mocked(prisma.$transaction).mockImplementation(async (callback) => callback({
                ordenSalida: { updateMany: vi.fn().mockResolvedValue({ count: 1 }) },
                stock: { upsert: vi.fn().mockResolvedValue({}) },
                ordenEntrada: { create: mockOrdenEntradaCreate }
            } as never));

            const res = await confirmarRecepcionPrestamoAction({ codigo: "K94J2Q8", bodegaDestinoId: "bodega-pa-1" });

            expect(res.ok).toBe(true);
            expect(mockOrdenEntradaCreate).toHaveBeenCalledWith(expect.objectContaining({
                data: expect.objectContaining({ fecha: new Date("2026-11-05T00:00:00.000Z") })
            }));
        });

        it("rechaza la recepción en una bodega fuera del alcance del usuario sin tocar el stock", async () => {
            bodegaReceptoraActiva();
            vi.mocked(validarCentroBodegaEnAlcance).mockRejectedValueOnce(
                new Error("No tienes permiso para operar en el centro o bodega seleccionada.")
            );

            const res = await confirmarRecepcionPrestamoAction({ codigo: "K94J2Q8", bodegaDestinoId: "bodega-pa-1" });

            expect(res).toEqual({ ok: false, message: "No tienes permiso para operar en el centro o bodega seleccionada." });
            expect(validarCentroBodegaEnAlcance).toHaveBeenCalledWith("centro-playa-ancha", "bodega-pa-1");
            expect(prisma.$transaction).not.toHaveBeenCalled();
        });

        it("ejecuta la recepción atómica incrementando stock y registrando OrdenEntrada", async () => {
            vi.mocked(prisma.ordenSalida.findFirst).mockResolvedValue(mockOrdenEnTransito as never);
            vi.mocked(prisma.bodega.findUnique).mockResolvedValue({
                id: "bodega-pa-1",
                nombre: "Farmacia Playa Ancha",
                centroId: "centro-playa-ancha",
                estado: true
            } as never);

            const mockStockUpsert = vi.fn().mockResolvedValue({});
            const mockOrdenEntradaCreate = vi.fn().mockResolvedValue({ id: "ent-1" });
            const mockUpdateMany = vi.fn().mockResolvedValue({ count: 1 });

            vi.mocked(prisma.$transaction).mockImplementation(async (callback) => {
                const tx = {
                    ordenSalida: { updateMany: mockUpdateMany },
                    stock: { upsert: mockStockUpsert },
                    ordenEntrada: { create: mockOrdenEntradaCreate }
                };
                return callback(tx as never);
            });

            const res = await confirmarRecepcionPrestamoAction({
                codigo: "K94J2Q8",
                bodegaDestinoId: "bodega-pa-1",
                observacionRecepcion: "Recepción conforme sin observaciones"
            });

            expect(res.ok).toBe(true);
            expect(res.message).toMatch(/exitosamente/i);
            expect(mockUpdateMany).toHaveBeenCalledWith({
                where: {
                    id: mockOrdenEnTransito.id,
                    estadoPrestamo: "EN_TRANSITO"
                },
                data: expect.objectContaining({
                    estadoPrestamo: "RECEPCIONADO",
                    usuarioReceptorId: mockUserReceptor.id,
                    bodegaDestinoId: "bodega-pa-1"
                })
            });
            expect(mockStockUpsert).toHaveBeenCalledTimes(1);
            expect(mockOrdenEntradaCreate).toHaveBeenCalledTimes(1);
        });

        it("evita race conditions: ante doble confirmación simultánea el stock se incrementa una sola vez", async () => {
            vi.mocked(prisma.ordenSalida.findFirst).mockResolvedValue(mockOrdenEnTransito as never);
            vi.mocked(prisma.bodega.findUnique).mockResolvedValue({
                id: "bodega-pa-1",
                nombre: "Farmacia Playa Ancha",
                centroId: "centro-playa-ancha",
                estado: true
            } as never);

            let llamadasUpdateMany = 0;
            const mockStockUpsert = vi.fn().mockResolvedValue({});
            const mockOrdenEntradaCreate = vi.fn().mockResolvedValue({ id: "ent-1" });

            vi.mocked(prisma.$transaction).mockImplementation(async (callback) => {
                llamadasUpdateMany++;
                // La primera llamada actualiza 1 fila; la segunda (concurrente) no encuentra filas con EN_TRANSITO
                const count = llamadasUpdateMany === 1 ? 1 : 0;
                const tx = {
                    ordenSalida: {
                        updateMany: vi.fn().mockResolvedValue({ count })
                    },
                    stock: { upsert: mockStockUpsert },
                    ordenEntrada: { create: mockOrdenEntradaCreate }
                };
                return callback(tx as never);
            });

            // Simulamos doble clic / invocación concurrente
            const [resultado1, resultado2] = await Promise.all([
                confirmarRecepcionPrestamoAction({
                    codigo: "K94J2Q8",
                    bodegaDestinoId: "bodega-pa-1"
                }),
                confirmarRecepcionPrestamoAction({
                    codigo: "K94J2Q8",
                    bodegaDestinoId: "bodega-pa-1"
                })
            ]);

            // La primera debe ser exitosa
            expect(resultado1.ok).toBe(true);
            expect(resultado1.message).toMatch(/exitosamente/i);

            // La segunda debe fallar con mensaje claro
            expect(resultado2.ok).toBe(false);
            expect(resultado2.message).toBe("El préstamo ya fue recibido o anulado.");

            // El stock y la orden de entrada solo se crearon una sola vez
            expect(mockStockUpsert).toHaveBeenCalledTimes(1);
            expect(mockOrdenEntradaCreate).toHaveBeenCalledTimes(1);
        });
    });
});
