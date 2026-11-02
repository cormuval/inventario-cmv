import { beforeEach, describe, expect, it, vi } from "vitest";

// lib
import * as authLib from "@/shared/lib/auth";
import { prisma } from "@/shared/lib/prisma";

// actions
import { listarRegistrosEntrada, obtenerDetalleOrdenEntrada } from "@/modules/orden-entrada/actions/registros-entrada.action";

vi.mock("@/auth", () => ({ auth: vi.fn() }));

vi.mock("@/shared/lib/auth", async (importOriginal) => {
    const original = await importOriginal<typeof import("@/shared/lib/auth")>();
    return { ...original, requireSessionUser: vi.fn() };
});

vi.mock("@/shared/lib/prisma", () => ({
    prisma: {
        centro: { findMany: vi.fn(), findFirst: vi.fn() },
        bodega: { findMany: vi.fn(), findFirst: vi.fn() },
        encargadosBodega: { findMany: vi.fn() },
        ordenEntrada: { count: vi.fn(), findMany: vi.fn(), findFirst: vi.fn() },
        ordenEntradaDetalle: { groupBy: vi.fn() }
    }
}));

const centroBaron = { id: "centro-1", nombre: "CESFAM Barón", estado: true };
const bodegaFarmacia = { id: "b1", nombre: "Bodega Farmacia", centroId: "centro-1", estado: true };
const FILTROS = { desde: "2026-10-01", hasta: "2026-10-30", pagina: 1, avisos: [] };

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

describe("listarRegistrosEntrada", () => {
    beforeEach(() => {
        vi.clearAllMocks();
    });

    it("aplica la bodega elegida por el Administrador y resume los detalles", async () => {
        sesionAdministrador();
        vi.mocked(prisma.ordenEntrada.count).mockResolvedValue(1);
        vi.mocked(prisma.ordenEntrada.findMany).mockResolvedValue([
            {
                id: "e1",
                fecha: new Date("2026-10-15T00:00:00.000Z"),
                origen: "Cenabast",
                bodega: { nombre: "Bodega Farmacia" },
                usuario: { nombre: "Luis", apPaterno: null }
            }
        ] as never);
        vi.mocked(prisma.ordenEntradaDetalle.groupBy).mockResolvedValue([
            { ordenEntradaId: "e1", _count: { _all: 4 }, _sum: { cantidad: 400 } }
        ] as never);

        const resultado = await listarRegistrosEntrada({ ...FILTROS, bodegaId: "b1" });

        expect(prisma.ordenEntrada.count).toHaveBeenCalledWith({
            where: {
                bodegaId: "b1",
                fecha: { gte: new Date("2026-10-01T00:00:00.000Z"), lte: new Date("2026-10-30T00:00:00.000Z") }
            }
        });
        expect(resultado.filas[0]).toEqual({
            id: "e1",
            fecha: new Date("2026-10-15T00:00:00.000Z"),
            origen: "Cenabast",
            bodegaNombre: "Bodega Farmacia",
            usuarioNombre: "Luis",
            productos: 4,
            unidades: 400
        });
    });
});

describe("obtenerDetalleOrdenEntrada", () => {
    it("informa cuando la orden no existe", async () => {
        sesionAdministrador();
        vi.mocked(prisma.ordenEntrada.findFirst).mockResolvedValue(null);

        expect(await obtenerDetalleOrdenEntrada("x")).toEqual({ ok: false, message: "Orden no encontrada.", lineas: [] });
        expect(prisma.ordenEntrada.findFirst).toHaveBeenCalledWith(expect.objectContaining({ where: { id: "x" } }));
    });
});
