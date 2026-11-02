// @vitest-environment node
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { Prisma } from "@prisma/client";

// lib
import * as authLib from "@/shared/lib/auth";
import { AuditLogger } from "@/shared/lib/logger";
import { prisma } from "@/shared/lib/prisma";

// actions
import { consultarReporte, exportarReporteExcelAction } from "@/modules/reporte/actions/reporte.action";

// utils
import { leerFiltrosReporte } from "@/modules/reporte/utils/periodo";

vi.mock("@/auth", () => ({ auth: vi.fn() }));
vi.mock("@/shared/lib/logger", () => ({ AuditLogger: { log: vi.fn() } }));

vi.mock("@/shared/lib/auth", async (importOriginal) => {
    const original = await importOriginal<typeof import("@/shared/lib/auth")>();
    return { ...original, requireSessionUser: vi.fn() };
});

vi.mock("@/shared/lib/prisma", () => ({
    prisma: {
        $queryRaw: vi.fn(),
        centro: { findMany: vi.fn() },
        bodega: { findMany: vi.fn() }
    }
}));

const FILTROS = leerFiltrosReporte(undefined, "2026-10-30");

describe("consultarReporte", () => {
    beforeEach(() => {
        vi.clearAllMocks();
        vi.mocked(authLib.requireSessionUser).mockResolvedValue({
            id: "user-admin",
            nombre: "Admin",
            apPaterno: "Comunal",
            email: "admin@cmvalparaiso.cl",
            rol: "R01",
            centroId: "c1",
            bodegaId: null
        });
        vi.mocked(prisma.centro.findMany).mockResolvedValue([{ id: "c1", nombre: "CESFAM Barón", estado: true }] as never);
        vi.mocked(prisma.bodega.findMany).mockResolvedValue([{ id: "b1", nombre: "Farmacia", centroId: "c1", estado: true }] as never);
    });

    it("cuenta, trae la página y el consumo solo de esas filas", async () => {
        vi.mocked(prisma.$queryRaw)
            .mockResolvedValueOnce([{ total: BigInt(1) }] as never)
            .mockResolvedValueOnce([{
                productoId: 7,
                bodegaId: "b1",
                centro: "CESFAM Barón",
                bodega: "Farmacia",
                descripcion: "Guantes M",
                linea: "INSUMOS",
                stockActual: BigInt(40),
                ultimaActualizacion: null
            }] as never)
            .mockResolvedValueOnce([{ productoId: 7, bodegaId: "b1", mes: "2026-03", cantidad: BigInt(12) }] as never);

        const resultado = await consultarReporte(FILTROS);

        expect(resultado.columnas).toHaveLength(12);
        expect(resultado.filas[0].meses["2026-03"]).toBe(12);
        expect(resultado.filas[0].consumoPeriodo).toBe(12);
        expect(resultado.arbol).toEqual([{ id: "c1", nombre: "CESFAM Barón", bodegas: [{ id: "b1", nombre: "Farmacia" }] }]);
        const consumo = vi.mocked(prisma.$queryRaw).mock.calls[2][0] as unknown as Prisma.Sql;
        expect(consumo.values).toEqual(expect.arrayContaining([7, "b1"]));
    });

    it("no pide consumo si la página está vacía", async () => {
        vi.mocked(prisma.$queryRaw).mockResolvedValueOnce([{ total: BigInt(0) }] as never).mockResolvedValueOnce([] as never);

        const resultado = await consultarReporte(FILTROS);

        expect(resultado.filas).toEqual([]);
        expect(prisma.$queryRaw).toHaveBeenCalledTimes(2);
    });
});

describe("exportarReporteExcelAction", () => {
    beforeEach(() => {
        vi.clearAllMocks();
        vi.mocked(authLib.requireSessionUser).mockResolvedValue({
            id: "user-admin",
            nombre: "Admin",
            apPaterno: "Comunal",
            email: "admin@cmvalparaiso.cl",
            rol: "R01",
            centroId: "c1",
            bodegaId: null
        });
        vi.mocked(prisma.centro.findMany).mockResolvedValue([{ id: "c1", nombre: "CESFAM Barón", estado: true }] as never);
        vi.mocked(prisma.bodega.findMany).mockResolvedValue([{ id: "b1", nombre: "Farmacia", centroId: "c1", estado: true }] as never);
    });

    it("devuelve el Excel en base64 sin paginar y audita la exportación", async () => {
        vi.mocked(prisma.$queryRaw).mockResolvedValueOnce([] as never).mockResolvedValueOnce([] as never);

        const resultado = await exportarReporteExcelAction({ mesDesde: "2026-01", mesHasta: "2026-06" });

        expect(resultado.ok).toBe(true);
        expect(resultado.nombreArchivo).toBe("reporte-consumo-todo-2026-01_2026-06.xlsx");
        expect(resultado.base64?.length).toBeGreaterThan(0);
        const claves = vi.mocked(prisma.$queryRaw).mock.calls[0][0] as unknown as Prisma.Sql;
        expect(claves.sql).not.toContain("LIMIT");
        expect(AuditLogger.log).toHaveBeenCalledWith(expect.objectContaining({
            usuarioId: "user-admin",
            accion: "exportar",
            entidad: "Reporte"
        }));
    });
});
