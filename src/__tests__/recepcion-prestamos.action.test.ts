import { beforeEach, describe, expect, it, vi } from "vitest";

// lib
import * as authLib from "@/shared/lib/auth";
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
        requireSessionUser: vi.fn()
    };
});

vi.mock("@/shared/lib/logger", () => ({ AuditLogger: { log: vi.fn() } }));

vi.mock("@/shared/lib/prisma", () => ({
    prisma: {
        $transaction: vi.fn(),
        centro: { findMany: vi.fn(), findFirst: vi.fn(), findUnique: vi.fn() },
        bodega: { findMany: vi.fn(), findFirst: vi.fn(), findUnique: vi.fn() },
        ordenSalida: { findFirst: vi.fn(), findUnique: vi.fn(), update: vi.fn() },
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
        it("ejecuta la recepción atómica incrementando stock y registrando OrdenEntrada", async () => {
            vi.mocked(prisma.ordenSalida.findFirst).mockResolvedValue(mockOrdenEnTransito as never);
            vi.mocked(prisma.bodega.findUnique).mockResolvedValue({
                id: "bodega-pa-1",
                nombre: "Farmacia Playa Ancha",
                centroId: "centro-playa-ancha",
                estado: true
            } as never);

            vi.mocked(prisma.$transaction).mockImplementation(async (callback) => {
                const tx = {
                    stock: { upsert: vi.fn() },
                    ordenEntrada: { create: vi.fn().mockResolvedValue({ id: "ent-1" }) },
                    ordenSalida: { update: vi.fn().mockResolvedValue({ id: "orden-salida-100" }) }
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
        });
    });
});
