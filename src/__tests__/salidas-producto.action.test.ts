import { beforeEach, describe, expect, it, vi } from "vitest";

// lib
import * as authLib from "@/shared/lib/auth";
import { prisma } from "@/shared/lib/prisma";

// actions
import { buscarProductosAction, consultarSalidasProducto } from "@/modules/orden-salida/actions/salidas-producto.action";

vi.mock("@/auth", () => ({ auth: vi.fn() }));

vi.mock("@/shared/lib/auth", async (importOriginal) => {
    const original = await importOriginal<typeof import("@/shared/lib/auth")>();
    return { ...original, requireSessionUser: vi.fn() };
});

vi.mock("@/shared/lib/prisma", () => ({
    prisma: {
        $queryRaw: vi.fn(),
        centro: { findMany: vi.fn() },
        bodega: { findMany: vi.fn() },
        producto: { findMany: vi.fn(), findUnique: vi.fn() },
        ordenSalidaDetalle: { count: vi.fn(), findMany: vi.fn() }
    }
}));

const FILTROS = { desde: "2026-10-01", hasta: "2026-10-30", pagina: 1, avisos: [] };

function sesionAdministrador(): void {
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
}

describe("buscarProductosAction", () => {
    beforeEach(() => {
        vi.clearAllMocks();
        sesionAdministrador();
    });

    it("no busca con menos de 2 caracteres", async () => {
        expect(await buscarProductosAction("g")).toEqual([]);
        expect(prisma.producto.findMany).not.toHaveBeenCalled();
    });

    it("busca por descripción y por código, máximo 20", async () => {
        vi.mocked(prisma.producto.findMany).mockResolvedValue([{ id: 7, descripcion: "Guantes M", linea: "INSUMOS" }] as never);

        await buscarProductosAction("7");

        expect(prisma.producto.findMany).toHaveBeenCalledWith(expect.objectContaining({
            where: { OR: [{ descripcion: { contains: "7" } }, { id: 7 }] },
            take: 20
        }));
    });
});

describe("buscarProductosAction con códigos largos", () => {
    beforeEach(() => {
        vi.clearAllMocks();
        sesionAdministrador();
    });

    it("no compara por código un número que no cabe en la columna", async () => {
        vi.mocked(prisma.producto.findMany).mockResolvedValue([] as never);

        await buscarProductosAction("99999999999999999999");

        expect(prisma.producto.findMany).toHaveBeenCalledWith(expect.objectContaining({
            where: { OR: [{ descripcion: { contains: "99999999999999999999" } }] }
        }));
    });
});

describe("consultarSalidasProducto", () => {
    beforeEach(() => {
        vi.clearAllMocks();
        sesionAdministrador();
    });

    it("sin producto no consulta movimientos", async () => {
        const resultado = await consultarSalidasProducto(FILTROS, undefined);

        expect(resultado.producto).toBeNull();
        expect(prisma.ordenSalidaDetalle.count).not.toHaveBeenCalled();
        expect(prisma.$queryRaw).not.toHaveBeenCalled();
    });

    it("calcula totales y pagina las líneas del producto", async () => {
        vi.mocked(prisma.producto.findUnique).mockResolvedValue({ id: 7, descripcion: "Guantes M", linea: "INSUMOS" } as never);
        vi.mocked(prisma.$queryRaw)
            .mockResolvedValueOnce([{ clave: "b1", etiqueta: "Farmacia", cantidad: BigInt(15) }] as never)
            .mockResolvedValueOnce([{ clave: "Consumo Interno", etiqueta: "Consumo Interno", cantidad: BigInt(15) }] as never);
        vi.mocked(prisma.ordenSalidaDetalle.count).mockResolvedValue(1);
        vi.mocked(prisma.ordenSalidaDetalle.findMany).mockResolvedValue([{
            id: "d1",
            lote: "L1",
            cantidad: 15,
            ordenSalida: {
                id: "o1",
                fecha: new Date("2026-10-20T00:00:00.000Z"),
                tipoSalida: "Consumo Interno",
                destino: "Box 1",
                bodega: { nombre: "Farmacia" },
                usuario: { nombre: "Ana", apPaterno: "Pérez" }
            }
        }] as never);

        const resultado = await consultarSalidasProducto(FILTROS, 7);

        expect(resultado.total).toBe(15);
        expect(resultado.porBodega).toEqual([{ clave: "b1", etiqueta: "Farmacia", cantidad: 15 }]);
        expect(resultado.lineas[0]).toEqual({
            id: "d1",
            ordenId: "o1",
            fecha: new Date("2026-10-20T00:00:00.000Z"),
            bodegaNombre: "Farmacia",
            tipoSalida: "Consumo Interno",
            destino: "Box 1",
            lote: "L1",
            cantidad: 15,
            usuarioNombre: "Ana Pérez"
        });
        expect(prisma.ordenSalidaDetalle.count).toHaveBeenCalledWith({
            where: {
                productoId: 7,
                ordenSalida: { fecha: { gte: new Date("2026-10-01T00:00:00.000Z"), lte: new Date("2026-10-30T00:00:00.000Z") } }
            }
        });
    });
});
