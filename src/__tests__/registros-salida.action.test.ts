import { beforeEach, describe, expect, it, vi } from "vitest";

// lib
import * as authLib from "@/shared/lib/auth";
import { prisma } from "@/shared/lib/prisma";

// actions
import { listarRegistrosSalida, obtenerDetalleOrdenSalida } from "@/modules/orden-salida/actions/registros-salida.action";

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
        ordenSalida: { count: vi.fn(), findMany: vi.fn(), findFirst: vi.fn() },
        ordenSalidaDetalle: { groupBy: vi.fn() }
    }
}));

const centroBaron = { id: "centro-1", nombre: "CESFAM Barón", estado: true };
const bodegaFarmacia = { id: "b1", nombre: "Bodega Farmacia", centroId: "centro-1", estado: true };
const FILTROS = { desde: "2026-10-01", hasta: "2026-10-30", pagina: 1, avisos: [] };

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

describe("listarRegistrosSalida", () => {
    beforeEach(() => {
        vi.clearAllMocks();
    });

    it("pagina en el servidor con alcance, rango de fechas y select acotado", async () => {
        sesionOperadorFarmacia();
        vi.mocked(prisma.ordenSalida.count).mockResolvedValue(120);
        vi.mocked(prisma.ordenSalida.findMany).mockResolvedValue([
            {
                id: "o1",
                fecha: new Date("2026-10-20T00:00:00.000Z"),
                tipoSalida: "Consumo Interno",
                destino: "Box 1",
                enviarCorreo: false,
                fechaEnvioCorreo: null,
                errorEnvioCorreo: null,
                correoDestino: null,
                bodega: { nombre: "Bodega Farmacia" },
                usuario: { nombre: "Ana", apPaterno: "Pérez" }
            }
        ] as never);
        vi.mocked(prisma.ordenSalidaDetalle.groupBy).mockResolvedValue([
            { ordenSalidaId: "o1", _count: { _all: 2 }, _sum: { cantidad: 30 } }
        ] as never);

        const resultado = await listarRegistrosSalida({ ...FILTROS, pagina: 3 });

        const where = {
            centroId: { in: ["centro-1"] },
            bodegaId: { in: ["b1"] },
            fecha: { gte: new Date("2026-10-01T00:00:00.000Z"), lte: new Date("2026-10-30T00:00:00.000Z") }
        };
        expect(prisma.ordenSalida.count).toHaveBeenCalledWith({ where });
        expect(prisma.ordenSalida.findMany).toHaveBeenCalledWith(expect.objectContaining({ where, skip: 100, take: 50 }));
        expect(vi.mocked(prisma.ordenSalida.findMany).mock.calls[0][0]).not.toHaveProperty("include");
        expect(resultado.paginacion).toMatchObject({ pagina: 3, total: 120, paginasTotales: 3 });
        expect(resultado.filas[0]).toMatchObject({ id: "o1", bodegaNombre: "Bodega Farmacia", usuarioNombre: "Ana Pérez", productos: 2, unidades: 30 });
        expect(resultado.puedeOperar).toBe(true);
    });

    it("no consulta sin alcance", async () => {
        sesionOperadorFarmacia();
        vi.mocked(prisma.bodega.findFirst).mockResolvedValue(null);

        const resultado = await listarRegistrosSalida(FILTROS);

        expect(resultado.filas).toEqual([]);
        expect(prisma.ordenSalida.count).not.toHaveBeenCalled();
    });
});

describe("obtenerDetalleOrdenSalida", () => {
    beforeEach(() => {
        vi.clearAllMocks();
    });

    it("busca la orden dentro del alcance y devuelve sus líneas", async () => {
        sesionOperadorFarmacia();
        vi.mocked(prisma.ordenSalida.findFirst).mockResolvedValue({
            detalles: [
                {
                    id: "d1",
                    productoId: 7,
                    lote: "L1",
                    fechaCaducidad: new Date("2027-01-01T00:00:00.000Z"),
                    cantidad: 5,
                    producto: { descripcion: "Guantes M" }
                }
            ]
        } as never);

        const resultado = await obtenerDetalleOrdenSalida("o1");

        expect(prisma.ordenSalida.findFirst).toHaveBeenCalledWith(expect.objectContaining({
            where: { id: "o1", centroId: { in: ["centro-1"] }, bodegaId: { in: ["b1"] } }
        }));
        expect(resultado).toEqual({
            ok: true,
            message: "",
            lineas: [{ id: "d1", productoId: 7, producto: "Guantes M", lote: "L1", fechaCaducidad: new Date("2027-01-01T00:00:00.000Z"), cantidad: 5 }]
        });
    });

    it("informa cuando la orden no existe o está fuera del alcance", async () => {
        sesionOperadorFarmacia();
        vi.mocked(prisma.ordenSalida.findFirst).mockResolvedValue(null);

        expect(await obtenerDetalleOrdenSalida("otra")).toEqual({ ok: false, message: "Orden no encontrada.", lineas: [] });
    });
});

