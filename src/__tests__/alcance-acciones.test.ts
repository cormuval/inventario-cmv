import { beforeEach, describe, expect, it, vi } from "vitest";

// lib
import * as authLib from "@/shared/lib/auth";
import { prisma } from "@/shared/lib/prisma";

// actions
import { eliminarDetalleEntrada, listarOrdenesEntrada } from "@/modules/orden-entrada/actions/orden-entrada.action";
import {
    actualizarDetalleSalida,
    crearOrdenSalida,
    eliminarDetalleSalida,
    listarOrdenesSalida
} from "@/modules/orden-salida/actions/orden-salida.action";
import { listarReporteConsumoMensual } from "@/modules/reporte/actions/reporte.action";

vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));

// Evita cargar NextAuth; los permisos por rol (`puedeOperar*`) se usan reales.
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
        bodega: { findMany: vi.fn(), findFirst: vi.fn() },
        encargadosBodega: { findMany: vi.fn() },
        ordenEntrada: { findMany: vi.fn() },
        ordenSalida: { findMany: vi.fn() },
        ordenSalidaDetalle: { findMany: vi.fn() },
        stock: { findMany: vi.fn() }
    }
}));

const MENSAJE_SIN_PERMISO = "No tienes permiso para operar en el centro o bodega seleccionada.";

const centroBaron = { id: "centro-1", nombre: "CESFAM Barón", estado: true };
const bodegaFarmacia = { id: "b1", nombre: "Bodega Farmacia", centroId: "centro-1", estado: true };

// Operador de salida asignado solo a "Bodega Farmacia" del CESFAM Barón.
function sesionOperadorFarmacia(): void {
    vi.mocked(authLib.requireSessionUser).mockResolvedValue({
        id: "user-operador",
        nombre: "Operador",
        apPaterno: "Farmacia",
        email: "operador@cmvalparaiso.cl",
        rol: "R07",
        centroId: "centro-1",
        bodegaId: "b1"
    });
    vi.mocked(prisma.centro.findFirst).mockResolvedValue(centroBaron as never);
    vi.mocked(prisma.encargadosBodega.findMany).mockResolvedValue([]);
    vi.mocked(prisma.bodega.findFirst).mockResolvedValue(bodegaFarmacia as never);
}

function sesionAdministrador(): void {
    vi.mocked(authLib.requireSessionUser).mockResolvedValue({
        id: "user-admin",
        nombre: "Admin",
        apPaterno: "Comunal",
        email: "admin@cmvalparaiso.cl",
        rol: "R01",
        centroId: "centro-1",
        bodegaId: null
    });
    vi.mocked(prisma.centro.findMany).mockResolvedValue([centroBaron] as never);
    vi.mocked(prisma.bodega.findMany).mockResolvedValue([bodegaFarmacia] as never);
}

// Simula `prisma.$transaction(fn)` entregando un cliente transaccional con los metodos indicados.
function simularTransaccion(tx: Record<string, unknown>): void {
    vi.mocked(prisma.$transaction).mockImplementation((async (fn: (client: unknown) => Promise<unknown>) => fn(tx)) as never);
}

function crearFormDataSalida(centroId: string, bodegaId: string): FormData {
    const formData = new FormData();
    formData.set("fecha", new Date().toISOString());
    formData.set("centroId", centroId);
    formData.set("bodegaId", bodegaId);
    formData.set("tipoSalida", "Consumo Interno");
    formData.set("destino", "Box 3");
    formData.append("productoId", "1");
    formData.append("cantidad", "5");
    formData.append("lote", "LOTE-01");
    formData.append("fechaCaducidad", new Date(Date.now() + 365 * 24 * 60 * 60 * 1000).toISOString());
    return formData;
}

describe("alcance en acciones de inventario", () => {
    beforeEach(() => {
        vi.clearAllMocks();
    });

    describe("CA-4: el backend rechaza centros o bodegas fuera del alcance", () => {
        it("crearOrdenSalida rechaza una bodega de otro centro sin tocar el stock", async () => {
            sesionOperadorFarmacia();

            const resultado = await crearOrdenSalida({ ok: false, message: "" }, crearFormDataSalida("centro-2", "b3"));

            expect(resultado).toEqual({ ok: false, message: MENSAJE_SIN_PERMISO });
            expect(prisma.$transaction).not.toHaveBeenCalled();
        });

        it("crearOrdenSalida rechaza una bodega ajena del mismo centro", async () => {
            sesionOperadorFarmacia();

            const resultado = await crearOrdenSalida({ ok: false, message: "" }, crearFormDataSalida("centro-1", "b-vacunatorio"));

            expect(resultado).toEqual({ ok: false, message: MENSAJE_SIN_PERMISO });
            expect(prisma.$transaction).not.toHaveBeenCalled();
        });

        it("actualizarDetalleSalida rechaza un detalle de una bodega ajena sin devolver stock", async () => {
            sesionOperadorFarmacia();
            const tx = {
                ordenSalidaDetalle: {
                    findUniqueOrThrow: vi.fn().mockResolvedValue({
                        id: "det-1",
                        productoId: 1,
                        cantidad: 5,
                        lote: "LOTE-01",
                        fechaCaducidad: new Date(),
                        ordenSalida: { centroId: "centro-2", bodegaId: "b3" }
                    }),
                    update: vi.fn()
                },
                stock: { findUnique: vi.fn(), update: vi.fn(), upsert: vi.fn() }
            };
            simularTransaccion(tx);

            const formData = new FormData();
            formData.set("productoId", "1");
            formData.set("cantidad", "3");
            formData.set("lote", "LOTE-01");
            formData.set("fechaCaducidad", new Date(Date.now() + 365 * 24 * 60 * 60 * 1000).toISOString());

            const resultado = await actualizarDetalleSalida("det-1", formData);

            expect(resultado).toEqual({ ok: false, message: MENSAJE_SIN_PERMISO });
            expect(tx.stock.update).not.toHaveBeenCalled();
            expect(tx.stock.upsert).not.toHaveBeenCalled();
            expect(tx.ordenSalidaDetalle.update).not.toHaveBeenCalled();
        });

        it("eliminarDetalleSalida rechaza un detalle de una bodega ajena", async () => {
            sesionOperadorFarmacia();
            const tx = {
                ordenSalidaDetalle: {
                    findUniqueOrThrow: vi.fn().mockResolvedValue({
                        id: "det-1",
                        productoId: 1,
                        cantidad: 5,
                        lote: "LOTE-01",
                        fechaCaducidad: new Date(),
                        ordenSalida: { centroId: "centro-2", bodegaId: "b3" }
                    }),
                    delete: vi.fn()
                },
                stock: { update: vi.fn(), upsert: vi.fn() }
            };
            simularTransaccion(tx);

            const resultado = await eliminarDetalleSalida("det-1");

            expect(resultado).toEqual({ ok: false, message: MENSAJE_SIN_PERMISO });
            expect(tx.ordenSalidaDetalle.delete).not.toHaveBeenCalled();
        });

        it("eliminarDetalleEntrada rechaza un detalle de una bodega ajena", async () => {
            vi.mocked(authLib.requireSessionUser).mockResolvedValue({
                id: "user-operador",
                nombre: "Operador",
                apPaterno: "Entrada",
                email: "operador@cmvalparaiso.cl",
                rol: "R06",
                centroId: "centro-1",
                bodegaId: "b1"
            });
            vi.mocked(prisma.centro.findFirst).mockResolvedValue(centroBaron as never);
            vi.mocked(prisma.encargadosBodega.findMany).mockResolvedValue([]);
            vi.mocked(prisma.bodega.findFirst).mockResolvedValue(bodegaFarmacia as never);
            const tx = {
                ordenEntradaDetalle: {
                    findUniqueOrThrow: vi.fn().mockResolvedValue({
                        id: "det-1",
                        productoId: 1,
                        cantidad: 5,
                        lote: "LOTE-01",
                        fechaCaducidad: new Date(),
                        ordenEntrada: { centroId: "centro-1", bodegaId: "b-vacunatorio" }
                    }),
                    delete: vi.fn()
                },
                stock: { findUnique: vi.fn(), update: vi.fn() }
            };
            simularTransaccion(tx);

            const resultado = await eliminarDetalleEntrada("det-1");

            expect(resultado).toEqual({ ok: false, message: MENSAJE_SIN_PERMISO });
            expect(tx.stock.update).not.toHaveBeenCalled();
            expect(tx.ordenEntradaDetalle.delete).not.toHaveBeenCalled();
        });
    });

    describe("CA-2 / CA-3 / CA-5: historiales y reporte acotados a las bodegas asignadas", () => {
        const filtroOperador = { centroId: { in: ["centro-1"] }, bodegaId: { in: ["b1"] } };

        it("CA-2: listarOrdenesSalida filtra por las bodegas del funcionario", async () => {
            sesionOperadorFarmacia();
            vi.mocked(prisma.ordenSalida.findMany).mockResolvedValue([]);

            await listarOrdenesSalida();

            expect(prisma.ordenSalida.findMany).toHaveBeenCalledWith(expect.objectContaining({ where: filtroOperador }));
        });

        it("CA-3: listarOrdenesEntrada filtra por bodega (no por usuario) para dar continuidad de turno", async () => {
            sesionOperadorFarmacia();
            vi.mocked(prisma.ordenEntrada.findMany).mockResolvedValue([]);

            await listarOrdenesEntrada();

            const where = vi.mocked(prisma.ordenEntrada.findMany).mock.calls[0][0]?.where;
            expect(where).toMatchObject(filtroOperador);
            expect(where).not.toHaveProperty("usuarioId");
        });

        it("CA-5: el reporte mensual filtra salidas y stock por las bodegas del funcionario", async () => {
            sesionOperadorFarmacia();
            vi.mocked(prisma.ordenSalidaDetalle.findMany).mockResolvedValue([]);
            vi.mocked(prisma.stock.findMany).mockResolvedValue([]);

            await listarReporteConsumoMensual(2026);

            const whereSalidas = vi.mocked(prisma.ordenSalidaDetalle.findMany).mock.calls[0][0]?.where;
            expect(whereSalidas?.ordenSalida).toMatchObject(filtroOperador);
            expect(prisma.stock.findMany).toHaveBeenCalledWith(expect.objectContaining({ where: { bodegaId: { in: ["b1"] } } }));
        });

        it("retorna vacío sin consultar cuando el funcionario no tiene bodegas asignadas", async () => {
            sesionOperadorFarmacia();
            vi.mocked(prisma.bodega.findFirst).mockResolvedValue(null);

            expect(await listarOrdenesSalida()).toEqual([]);
            expect(await listarOrdenesEntrada()).toEqual([]);
            expect(await listarReporteConsumoMensual(2026)).toEqual([]);
            expect(prisma.ordenSalida.findMany).not.toHaveBeenCalled();
            expect(prisma.ordenEntrada.findMany).not.toHaveBeenCalled();
            expect(prisma.ordenSalidaDetalle.findMany).not.toHaveBeenCalled();
        });
    });

    describe("CA-6: vista panorámica del Administrador", () => {
        it("no filtra historiales ni reporte por centro o bodega (incluye bodegas desactivadas)", async () => {
            sesionAdministrador();
            vi.mocked(prisma.ordenSalida.findMany).mockResolvedValue([]);
            vi.mocked(prisma.ordenEntrada.findMany).mockResolvedValue([]);
            vi.mocked(prisma.ordenSalidaDetalle.findMany).mockResolvedValue([]);
            vi.mocked(prisma.stock.findMany).mockResolvedValue([]);

            await listarOrdenesSalida();
            await listarOrdenesEntrada();
            await listarReporteConsumoMensual(2026);

            expect(vi.mocked(prisma.ordenSalida.findMany).mock.calls[0][0]?.where).toEqual({});
            const whereEntradas = vi.mocked(prisma.ordenEntrada.findMany).mock.calls[0][0]?.where;
            expect(whereEntradas).not.toHaveProperty("bodegaId");
            expect(whereEntradas).not.toHaveProperty("centroId");
            const whereSalidas = vi.mocked(prisma.ordenSalidaDetalle.findMany).mock.calls[0][0]?.where;
            expect(whereSalidas?.ordenSalida).not.toHaveProperty("bodegaId");
            expect(whereSalidas?.ordenSalida).not.toHaveProperty("centroId");
            expect(prisma.stock.findMany).toHaveBeenCalledWith(expect.objectContaining({ where: {} }));
        });
    });
});
