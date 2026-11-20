import { beforeEach, describe, expect, it, vi } from "vitest";
import { revalidatePath } from "next/cache";

// lib
import * as authLib from "@/shared/lib/auth";
import { AuditLogger } from "@/shared/lib/logger";
import { prisma } from "@/shared/lib/prisma";

// actions
import {
    crearProducto,
    listarLineasProductos,
    listarProductos,
    listarProductosActivos,
    listarProductosPaginados
} from "@/modules/productos/actions/productos.action";

vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));
vi.mock("@/auth", () => ({ auth: vi.fn() }));
vi.mock("@/shared/lib/auth", async (importOriginal) => {
    const original = await importOriginal<typeof import("@/shared/lib/auth")>();
    return { ...original, requireSessionUser: vi.fn() };
});
vi.mock("@/shared/lib/logger", () => ({ AuditLogger: { log: vi.fn() } }));
vi.mock("@/shared/lib/prisma", () => ({
    prisma: {
        producto: { count: vi.fn(), findMany: vi.fn(), create: vi.fn() }
    }
}));

const usuarioAdmin = {
    id: "usuario-1",
    nombre: "Admin",
    apPaterno: "Prueba",
    email: "admin@cmvalparaiso.cl",
    rol: "R01",
    centroId: "centro-1",
    bodegaId: null
};

const filtrosValidos = {
    id: null,
    linea: "",
    estado: "todos" as const,
    descripcion: "",
    pagina: 1,
    advertencias: []
};

beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(authLib.requireSessionUser).mockResolvedValue(usuarioAdmin);
});

describe("lecturas de productos", () => {
    it.each([
        { nombre: "listarProductos", ejecutar: () => listarProductos() },
        { nombre: "listarProductosActivos", ejecutar: () => listarProductosActivos() },
        { nombre: "listarLineasProductos", ejecutar: () => listarLineasProductos() },
        { nombre: "listarProductosPaginados", ejecutar: () => listarProductosPaginados(filtrosValidos) }
    ])("no consulta Prisma cuando la sesión es inválida en $nombre", async ({ ejecutar }) => {
        vi.mocked(authLib.requireSessionUser).mockRejectedValue(new Error("Sesion no valida."));

        await expect(ejecutar()).rejects.toThrow("Sesion no valida.");
        expect(prisma.producto.count).not.toHaveBeenCalled();
        expect(prisma.producto.findMany).not.toHaveBeenCalled();
    });
});

describe("listarProductosPaginados", () => {
    beforeEach(() => {
        vi.mocked(prisma.producto.count).mockResolvedValue(101);
        vi.mocked(prisma.producto.findMany).mockResolvedValue([
            { id: 42, linea: "Farmacia", descripcion: "Paracetamol", estado: true }
        ] as never);
    });

    it("consulta la página con todos los filtros normalizados y el orden estable", async () => {
        const resultado = await listarProductosPaginados({
            id: 42,
            linea: "Farmacia",
            estado: "activo",
            descripcion: "  paracetamol  ",
            pagina: 1,
            advertencias: []
        });

        const where = {
            id: 42,
            linea: "Farmacia",
            estado: true,
            descripcion: { contains: "paracetamol" }
        };
        expect(resultado.paginacion).toMatchObject({ pagina: 1, total: 101, paginasTotales: 2, tamano: 100 });
        expect(prisma.producto.count).toHaveBeenCalledWith({ where });
        expect(prisma.producto.findMany).toHaveBeenCalledWith({
            where,
            orderBy: [{ linea: "asc" }, { descripcion: "asc" }, { id: "asc" }],
            skip: 0,
            take: 100
        });
    });

    it("normaliza una página fuera de rango antes de consultar", async () => {
        await listarProductosPaginados({
            id: null,
            linea: "",
            estado: "todos",
            descripcion: "",
            pagina: 99,
            advertencias: []
        });

        expect(prisma.producto.count).toHaveBeenCalledWith({ where: {} });
        expect(prisma.producto.findMany).toHaveBeenCalledWith({
            where: {},
            orderBy: [{ linea: "asc" }, { descripcion: "asc" }, { id: "asc" }],
            skip: 100,
            take: 100
        });
    });

    it("rechaza un payload falsificado antes de consultar Prisma", async () => {
        await expect(listarProductosPaginados({
            ...filtrosValidos,
            id: "42"
        } as never)).rejects.toThrow();

        expect(prisma.producto.count).not.toHaveBeenCalled();
        expect(prisma.producto.findMany).not.toHaveBeenCalled();
    });
});

describe("listarLineasProductos", () => {
    it("obtiene las líneas distintas ordenadas para el selector", async () => {
        vi.mocked(prisma.producto.findMany).mockResolvedValue([
            { linea: "Aseo" },
            { linea: "Farmacia" }
        ] as never);

        await expect(listarLineasProductos()).resolves.toEqual(["Aseo", "Farmacia"]);
        expect(prisma.producto.findMany).toHaveBeenCalledWith({
            distinct: ["linea"],
            select: { linea: true },
            orderBy: { linea: "asc" }
        });
    });
});

describe("crearProducto", () => {
    it("crea el producto para Administrador R01, audita y revalida el catálogo", async () => {
        vi.mocked(prisma.producto.create).mockResolvedValue({
            id: 77,
            linea: "CLINICO",
            descripcion: "Guantes estériles",
            estado: true
        });
        const formData = new FormData();
        formData.set("linea", "CLINICO");
        formData.set("descripcion", "Guantes estériles");
        formData.set("estado", "on");

        await expect(crearProducto({ ok: false, message: "" }, formData)).resolves.toEqual({
            ok: true,
            message: "Producto creado."
        });
        expect(prisma.producto.create).toHaveBeenCalledWith({
            data: { linea: "CLINICO", descripcion: "Guantes estériles", estado: true }
        });
        expect(AuditLogger.log).toHaveBeenCalledWith({
            usuarioId: "usuario-1",
            accion: "crear",
            entidad: "Producto",
            entidadId: "77"
        });
        expect(revalidatePath).toHaveBeenCalledWith("/productos");
    });
});
