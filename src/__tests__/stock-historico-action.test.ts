import { beforeEach, describe, expect, it, vi } from "vitest";

// lib
import * as authLib from "@/shared/lib/auth";
import * as alcanceLib from "@/shared/lib/inventario-alcance";
import { prisma } from "@/shared/lib/prisma";

// action
import {
    buscarProductosHistoricoAction,
    consultarStockHistoricoAction
} from "@/modules/stock/actions/stock-historico.action";
import * as consultaDbLib from "@/modules/stock/utils/stock-historico-consulta";

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
        producto: { findMany: vi.fn(), findUnique: vi.fn() }
    }
}));

vi.mock("@/modules/stock/utils/stock-historico-consulta", async (importOriginal) => {
    const original = await importOriginal<typeof import("@/modules/stock/utils/stock-historico-consulta")>();
    return {
        ...original,
        consultarStockHistoricoDb: vi.fn()
    };
});

describe("buscarProductosHistoricoAction", () => {
    beforeEach(() => {
        vi.clearAllMocks();
        vi.mocked(authLib.requireSessionUser).mockResolvedValue({
            id: "user-1",
            nombre: "Admin",
            apPaterno: "Comunal",
            email: "admin@cmvalparaiso.cl",
            rol: "R01",
            centroId: "c1",
            bodegaId: null
        });
    });

    it("retorna lista vacía con menos de 2 caracteres", async () => {
        const res = await buscarProductosHistoricoAction("a");
        expect(res).toEqual([]);
        expect(prisma.producto.findMany).not.toHaveBeenCalled();
    });

    it("busca por descripción y código con 2 o más caracteres", async () => {
        vi.mocked(prisma.producto.findMany).mockResolvedValue([
            { id: 10, descripcion: "Paracetamol 500mg", linea: "FARMACOS" }
        ] as never);

        const res = await buscarProductosHistoricoAction("Parac");
        expect(res).toHaveLength(1);
        expect(res[0].descripcion).toBe("Paracetamol 500mg");
        expect(prisma.producto.findMany).toHaveBeenCalled();
    });
});

describe("consultarStockHistoricoAction", () => {
    const sesionUsuario = {
        id: "user-1",
        nombre: "Encargado",
        apPaterno: "Bodega",
        email: "encargado@cmvalparaiso.cl",
        rol: "R03",
        centroId: "c1",
        bodegaId: "b1"
    };

    const alcanceMock = {
        usuario: sesionUsuario,
        centros: [{ id: "c1", nombre: "CESFAM Barón", estado: true, direccion: "" }],
        bodegas: [{ id: "b1", nombre: "Farmacia", centroId: "c1", estado: true }],
        centroId: "c1",
        bodegaId: "b1",
        centroIds: ["c1"],
        bodegaIds: ["b1"],
        puedeFiltrarCentro: false
    };

    beforeEach(() => {
        vi.clearAllMocks();
        vi.mocked(authLib.requireSessionUser).mockResolvedValue(sesionUsuario);
        vi.mocked(alcanceLib.obtenerAlcanceInventario).mockResolvedValue(alcanceMock as never);
        vi.mocked(alcanceLib.validarCentroBodegaEnAlcance).mockResolvedValue();
        vi.mocked(prisma.producto.findUnique).mockResolvedValue({
            id: 10,
            descripcion: "Paracetamol 500mg",
            linea: "FARMACOS"
        } as never);
        vi.mocked(consultaDbLib.consultarStockHistoricoDb).mockResolvedValue({
            saldoInicial: 100,
            saldoFinal: 120,
            totalIngresos: 50,
            totalEgresos: 30,
            datosCompletos: true,
            movimientos: []
        });
    });

    it("rechaza si no se proporciona un producto válido", async () => {
        const res = await consultarStockHistoricoAction({ productoId: 0 });
        expect(res.ok).toBe(false);
        expect(res.error).toContain("Debe seleccionar un producto válido");
    });

    it("rechaza si el usuario no tiene bodegas en su alcance", async () => {
        vi.mocked(alcanceLib.obtenerAlcanceInventario).mockResolvedValueOnce({
            ...alcanceMock,
            bodegaIds: []
        } as never);

        const res = await consultarStockHistoricoAction({ productoId: 10 });
        expect(res.ok).toBe(false);
        expect(res.error).toContain("No tiene bodegas asignadas");
    });

    it("rechaza si fechaDesde es posterior a fechaHasta", async () => {
        const res = await consultarStockHistoricoAction({
            productoId: 10,
            fechaDesde: "2026-11-20",
            fechaHasta: "2026-11-10"
        });
        expect(res.ok).toBe(false);
        expect(res.error).toContain("La fecha inicial no puede ser posterior");
    });

    it("ejecuta la consulta exitosamente y retorna resumen de evolución", async () => {
        const res = await consultarStockHistoricoAction({
            productoId: 10,
            centroId: "c1",
            bodegaId: "b1",
            fechaDesde: "2026-10-01",
            fechaHasta: "2026-10-31"
        });

        expect(res.ok).toBe(true);
        expect(res.data?.producto.id).toBe(10);
        expect(res.data?.resultado.saldoInicial).toBe(100);
        expect(res.data?.resultado.saldoFinal).toBe(120);
        expect(consultaDbLib.consultarStockHistoricoDb).toHaveBeenCalledWith(
            expect.objectContaining({
                productoId: 10,
                bodegaIds: ["b1"]
            })
        );
    });
});

