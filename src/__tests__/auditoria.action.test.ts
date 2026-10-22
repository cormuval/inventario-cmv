import { beforeEach, describe, expect, it, vi } from "vitest";
import * as authLib from "@/shared/lib/auth";
import { prisma } from "@/shared/lib/prisma";
import {
    consultarLogsAuditoria,
    obtenerFiltrosCatalogoAuditoria
} from "@/modules/auditoria/actions/auditoria.action";

vi.mock("@/shared/lib/auth", () => ({
    requireSessionUser: vi.fn(),
    puedeAdministrar: vi.fn()
}));

vi.mock("@/shared/lib/prisma", () => ({
    prisma: {
        centro: { findMany: vi.fn() },
        bodega: { findMany: vi.fn() },
        usuario: { findMany: vi.fn() },
        encargadosBodega: { findMany: vi.fn() },
        log: {
            findMany: vi.fn(),
            count: vi.fn()
        }
    }
}));

describe("Auditoría - Server Actions", () => {
    beforeEach(() => {
        vi.clearAllMocks();
    });

    it("rechaza el acceso si el usuario no tiene permisos de administrador", async () => {
        vi.mocked(authLib.requireSessionUser).mockResolvedValue({
            id: "u-2",
            rol: "R07",
            email: "operador@cmvalparaiso.cl"
        } as any);
        vi.mocked(authLib.puedeAdministrar).mockReturnValue(false);

        await expect(
            consultarLogsAuditoria({
                fechaDesde: "2026-10-19T00:00:00.000Z",
                fechaHasta: "2026-10-19T23:59:59.999Z"
            })
        ).rejects.toThrow(/solo administradores/i);
    });

    it("permite consultar logs aplicando filtros de fecha, accion y usuario a un administrador", async () => {
        vi.mocked(authLib.requireSessionUser).mockResolvedValue({
            id: "admin-1",
            rol: "R01",
            email: "admin@cmvalparaiso.cl"
        } as any);
        vi.mocked(authLib.puedeAdministrar).mockReturnValue(true);

        const mockLogs = [
            {
                id: "log-1",
                usuarioId: "u-1",
                accion: "crear",
                entidad: "OrdenSalida",
                entidadId: "sal-1",
                detalle: { tipo: "Consumo Interno" },
                fecha: new Date("2026-10-19T10:00:00Z"),
                usuario: { id: "u-1", nombre: "Carlos", apPaterno: "Pérez", email: "carlos@cmvalparaiso.cl", rolId: "R07" }
            }
        ];

        vi.mocked(prisma.log.findMany).mockResolvedValue(mockLogs as any);
        vi.mocked(prisma.log.count).mockResolvedValue(1);

        const resultado = await consultarLogsAuditoria({
            fechaDesde: "2026-10-19T00:00:00.000Z",
            fechaHasta: "2026-10-19T23:59:59.999Z",
            usuarioId: "u-1",
            accion: "crear",
            entidad: "OrdenSalida",
            pagina: 1
        });

        expect(resultado.total).toBe(1);
        expect(resultado.logs).toHaveLength(1);
        expect(resultado.logs[0].id).toBe("log-1");
        expect(prisma.log.findMany).toHaveBeenCalledWith(
            expect.objectContaining({
                where: expect.objectContaining({
                    usuarioId: "u-1",
                    accion: "crear",
                    entidad: "OrdenSalida"
                }),
                orderBy: { fecha: "desc" }
            })
        );
    });

    it("filtrar por bodega genera where: { bodegaId } y no consulta encargadosBodega", async () => {
        vi.mocked(authLib.requireSessionUser).mockResolvedValue({
            id: "admin-1",
            rol: "R01",
            email: "admin@cmvalparaiso.cl"
        } as any);
        vi.mocked(authLib.puedeAdministrar).mockReturnValue(true);

        vi.mocked(prisma.log.findMany).mockResolvedValue([]);
        vi.mocked(prisma.log.count).mockResolvedValue(0);

        await consultarLogsAuditoria({
            bodegaId: "bodega-farmacia-1",
            pagina: 1
        });

        expect(prisma.encargadosBodega.findMany).not.toHaveBeenCalled();
        expect(prisma.log.findMany).toHaveBeenCalledWith(
            expect.objectContaining({
                where: expect.objectContaining({
                    bodegaId: "bodega-farmacia-1"
                })
            })
        );
    });

    it("filtrar por usuario + bodega aplica ambas condiciones a la vez (Y lógico)", async () => {
        vi.mocked(authLib.requireSessionUser).mockResolvedValue({
            id: "admin-1",
            rol: "R01",
            email: "admin@cmvalparaiso.cl"
        } as any);
        vi.mocked(authLib.puedeAdministrar).mockReturnValue(true);

        vi.mocked(prisma.log.findMany).mockResolvedValue([]);
        vi.mocked(prisma.log.count).mockResolvedValue(0);

        await consultarLogsAuditoria({
            bodegaId: "bodega-farmacia-1",
            usuarioId: "user-carlos",
            pagina: 1
        });

        expect(prisma.log.findMany).toHaveBeenCalledWith(
            expect.objectContaining({
                where: expect.objectContaining({
                    bodegaId: "bodega-farmacia-1",
                    usuarioId: "user-carlos"
                })
            })
        );
    });

    it("obtiene los datos de catálogo para alimentar los combos en cascada", async () => {
        vi.mocked(authLib.requireSessionUser).mockResolvedValue({
            id: "admin-1",
            rol: "R01",
            email: "admin@cmvalparaiso.cl"
        } as any);
        vi.mocked(authLib.puedeAdministrar).mockReturnValue(true);

        vi.mocked(prisma.centro.findMany).mockResolvedValue([{ id: "c1", nombre: "Centro 1" }] as any);
        vi.mocked(prisma.bodega.findMany).mockResolvedValue([{ id: "b1", nombre: "Bodega 1", centroId: "c1" }] as any);
        vi.mocked(prisma.usuario.findMany).mockResolvedValue([
            { id: "u1", nombre: "Juan", apPaterno: "Pérez", email: "juan@cmvalparaiso.cl", centroId: "c1", encargos: [{ bodegaId: "b1" }] }
        ] as any);

        const catalogo = await obtenerFiltrosCatalogoAuditoria();

        expect(catalogo.centros).toHaveLength(1);
        expect(catalogo.bodegas).toHaveLength(1);
        expect(catalogo.usuarios).toHaveLength(1);
    });
});
