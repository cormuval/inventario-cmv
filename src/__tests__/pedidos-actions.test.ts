import { beforeEach, describe, expect, it, vi } from "vitest";

// lib
import * as authLib from "@/shared/lib/auth";
import * as alcanceLib from "@/shared/lib/inventario-alcance";
import { prisma } from "@/shared/lib/prisma";

// actions
import {
    anularPedidoAction,
    crearPedidoAction,
    descargarPedidoExcelAction,
    descargarPedidoPdfAction,
    enviarPedidoAction,
    guardarBorradorPedidoAction,
    revisarPedidoAction
} from "@/modules/pedidos/actions/pedidos.action";

vi.mock("@/auth", () => ({ auth: vi.fn() }));

vi.mock("@/shared/lib/auth", async (importOriginal) => {
    const original = await importOriginal<typeof import("@/shared/lib/auth")>();
    return { ...original, requireSessionUser: vi.fn() };
});

vi.mock("@/shared/lib/inventario-alcance", async (importOriginal) => {
    const original = await importOriginal<typeof import("@/shared/lib/inventario-alcance")>();
    return {
        ...original,
        obtenerAlcanceInventario: vi.fn(),
        validarCentroBodegaEnAlcance: vi.fn()
    };
});

vi.mock("@/shared/lib/prisma", () => ({
    prisma: {
        $transaction: vi.fn((callback) => callback(prisma)),
        pedido: {
            create: vi.fn(),
            findFirst: vi.fn(),
            findUnique: vi.fn(),
            update: vi.fn()
        },
        pedidoDetalle: {
            create: vi.fn(),
            update: vi.fn(),
            deleteMany: vi.fn()
        },
        pedidoPlantillaAseo: {
            findMany: vi.fn(),
            upsert: vi.fn()
        },
        producto: { findMany: vi.fn() },
        bodega: { findMany: vi.fn() },
        stock: { findMany: vi.fn() },
        log: { create: vi.fn() }
    }
}));

vi.mock("@/shared/lib/logger", () => ({
    AuditLogger: { log: vi.fn() }
}));

vi.mock("next/cache", () => ({
    revalidatePath: vi.fn()
}));

describe("pedidos.action (INV-18, INV-22, INV-23)", () => {
    const sesionCentro = {
        id: "user-c1",
        nombre: "Encargado",
        apPaterno: "Centro",
        email: "encargado@cmvalparaiso.cl",
        rol: "R02",
        centroId: "c1",
        bodegaId: null
    };

    const alcanceMock = {
        usuario: sesionCentro,
        centros: [{ id: "c1", nombre: "CESFAM Barón", estado: true, direccion: "" }],
        bodegas: [{ id: "b1", nombre: "Bodega Aseo", centroId: "c1", estado: true }],
        centroId: "c1",
        bodegaId: null,
        centroIds: ["c1"],
        bodegaIds: ["b1"],
        puedeFiltrarCentro: false
    };

    beforeEach(() => {
        vi.clearAllMocks();
        vi.mocked(authLib.requireSessionUser).mockResolvedValue(sesionCentro);
        vi.mocked(alcanceLib.obtenerAlcanceInventario).mockResolvedValue(alcanceMock as never);
        vi.mocked(alcanceLib.validarCentroBodegaEnAlcance).mockResolvedValue();
        vi.mocked(prisma.producto.findMany).mockResolvedValue([
            { id: 10, descripcion: "Cloro 5L", linea: "ASEO" }
        ] as never);
        vi.mocked(prisma.bodega.findMany).mockResolvedValue([{ id: "b1" }] as never);
        vi.mocked(prisma.stock.findMany).mockResolvedValue([] as never);
        vi.mocked(prisma.pedidoPlantillaAseo.findMany).mockResolvedValue([] as never);
    });

    it("crea un pedido en estado BORRADOR o ENVIADO con número correlativo", async () => {
        vi.mocked(prisma.pedido.findFirst).mockResolvedValue(null);
        vi.mocked(prisma.pedido.create).mockResolvedValue({
            id: "ped-1",
            numero: "PED-2026-0001",
            tipo: "MENSUAL",
            estado: "BORRADOR",
            centroId: "c1"
        } as never);

        const res = await crearPedidoAction({
            centroId: "c1",
            tipo: "MENSUAL",
            periodo: "2026-11",
            detalles: [{ productoId: 10, cantidadSolicitada: 15 }],
            enviarInmediatamente: false
        });

        expect(res.ok).toBe(true);
        expect(res.pedidoId).toBe("ped-1");
        expect(prisma.pedido.create).toHaveBeenCalledWith(
            expect.objectContaining({
                data: expect.objectContaining({
                    numero: "PED-2026-0001",
                    estado: "BORRADOR"
                })
            })
        );
    });

    it("rechaza si el centro está fuera del alcance del usuario", async () => {
        const res = await crearPedidoAction({
            centroId: "centro-no-autorizado",
            tipo: "MENSUAL",
            detalles: [{ productoId: 10, cantidadSolicitada: 5 }],
            enviarInmediatamente: false
        });

        expect(res.ok).toBe(false);
        expect(res.message).toContain("No tienes permiso");
    });

    it("enviarPedidoAction cambia estado de BORRADOR a ENVIADO", async () => {
        vi.mocked(prisma.pedido.findUnique).mockResolvedValue({
            id: "ped-1",
            numero: "PED-2026-0001",
            estado: "BORRADOR",
            centroId: "c1",
            bodegaId: null,
            detalles: [{ id: "d1", cantidadSolicitada: 10 }]
        } as never);

        const res = await enviarPedidoAction("ped-1");
        expect(res.ok).toBe(true);
        expect(prisma.pedido.update).toHaveBeenCalledWith(
            expect.objectContaining({
                where: { id: "ped-1" },
                data: expect.objectContaining({ estado: "ENVIADO" })
            })
        );
    });

    it("revisarPedidoAction exige rol de Adquisiciones (R01)", async () => {
        // Usuario con rol R02 (encargado de centro) intenta revisar
        const res = await revisarPedidoAction({
            pedidoId: "ped-1",
            ajustes: [{ detalleId: "d1", cantidadAprobada: 8 }]
        });

        expect(res.ok).toBe(false);
        expect(res.message).toContain("Solo el personal de Adquisiciones");
    });

    it("revisarPedidoAction exige observación si la cantidad aprobada difiere de la solicitada", async () => {
        // Usuario con rol R01 (Adquisiciones)
        vi.mocked(authLib.requireSessionUser).mockResolvedValue({
            ...sesionCentro,
            id: "user-admin",
            rol: "R01"
        });

        vi.mocked(prisma.pedido.findUnique).mockResolvedValue({
            id: "ped-1",
            numero: "PED-2026-0001",
            estado: "ENVIADO",
            detalles: [
                { id: "d1", productoId: 10, cantidadSolicitada: 20 }
            ]
        } as never);

        // Sin observación de ajuste
        const res = await revisarPedidoAction({
            pedidoId: "ped-1",
            ajustes: [{ detalleId: "d1", cantidadAprobada: 10, observacionAjuste: "" }]
        });

        expect(res.ok).toBe(false);
        expect(res.message).toContain("Debe indicar una justificación de ajuste");
    });

    it("revisarPedidoAction aprueba y actualiza cantidades con justificación", async () => {
        vi.mocked(authLib.requireSessionUser).mockResolvedValue({
            ...sesionCentro,
            id: "user-admin",
            rol: "R01"
        });

        vi.mocked(prisma.pedido.findUnique).mockResolvedValue({
            id: "ped-1",
            numero: "PED-2026-0001",
            estado: "ENVIADO",
            detalles: [
                { id: "d1", productoId: 10, cantidadSolicitada: 20 }
            ]
        } as never);

        const res = await revisarPedidoAction({
            pedidoId: "ped-1",
            observacionesRevision: "Aprobado con ajuste de cuota",
            ajustes: [
                {
                    detalleId: "d1",
                    cantidadAprobada: 15,
                    observacionAjuste: "Ajuste por cuota comunal de noviembre"
                }
            ]
        });

        expect(res.ok).toBe(true);
        expect(prisma.pedido.update).toHaveBeenCalledWith(
            expect.objectContaining({
                where: { id: "ped-1" },
                data: expect.objectContaining({ estado: "REVISADO" })
            })
        );
    });

    it("anularPedidoAction anula el pedido y registra auditoría", async () => {
        vi.mocked(prisma.pedido.findUnique).mockResolvedValue({
            id: "ped-1",
            numero: "PED-2026-0001",
            estado: "ENVIADO",
            centroId: "c1"
        } as never);

        const res = await anularPedidoAction("ped-1", "Pedido duplicado por error");
        expect(res.ok).toBe(true);
        expect(prisma.pedido.update).toHaveBeenCalledWith(
            expect.objectContaining({
                where: { id: "ped-1" },
                data: expect.objectContaining({ estado: "ANULADO" })
            })
        );
    });
});

