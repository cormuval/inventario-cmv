import type * as React from "react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { render, screen } from "@testing-library/react";

// actions
import { crearOrdenEntrada } from "@/modules/orden-entrada/actions/orden-entrada.action";
import { listarRegistrosEntrada } from "@/modules/orden-entrada/actions/registros-entrada.action";

// components
import { OrdenEntradaForm } from "@/modules/orden-entrada/components/orden-entrada-form";

// lib
import * as authLib from "@/shared/lib/auth";
import * as alcanceLib from "@/shared/lib/inventario-alcance";
import { prisma } from "@/shared/lib/prisma";
import { initialActionState } from "@/shared/types/action-state";

vi.mock("@/auth", () => ({ auth: vi.fn() }));

vi.mock("@/shared/lib/auth", async (importOriginal) => {
    const original = await importOriginal<typeof import("@/shared/lib/auth")>();
    return {
        ...original,
        requireSessionUser: vi.fn()
    };
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
        centro: { findMany: vi.fn() },
        bodega: { findMany: vi.fn() },
        producto: { findMany: vi.fn() },
        ordenEntrada: {
            create: vi.fn(),
            count: vi.fn(),
            findMany: vi.fn()
        },
        ordenEntradaDetalle: {
            create: vi.fn(),
            groupBy: vi.fn()
        },
        stock: {
            upsert: vi.fn(),
            findUnique: vi.fn()
        },
        log: {
            create: vi.fn()
        }
    }
}));

vi.mock("@/shared/lib/logger", () => ({
    AuditLogger: { log: vi.fn() }
}));

vi.mock("next/cache", () => ({
    revalidatePath: vi.fn()
}));

const mockCentros = [{ id: "c1", nombre: "CESFAM Barón", estado: true, direccion: "" }];
const mockBodegas = [{ id: "b1", nombre: "Farmacia", centroId: "c1", estado: true }];
const mockProductos = [{ id: 10, descripcion: "Paracetamol 500mg", categoria: "FARMACOS", linea: "FARMACOS", estado: true, stockMinimo: 10 }];

describe("INV-24: Bodega Central como origen de órdenes de entrada", () => {
    beforeEach(() => {
        vi.clearAllMocks();
    });

    it("renderiza 'Bodega Central' en el selector de origen conservando las opciones previas", () => {
        render(
            <OrdenEntradaForm
                centros={mockCentros as never}
                bodegas={mockBodegas as never}
                productos={mockProductos as never}
                centroId="c1"
                bodegaId="b1"
                puedeFiltrarCentro={true}
            />
        );

        const selectOrigen = screen.getByRole("combobox", { name: /origen/i });
        expect(selectOrigen).toBeDefined();

        const opciones = Array.from(selectOrigen.querySelectorAll("option")).map((opt) => opt.value);
        expect(opciones).toContain("Bodega Central");
        expect(opciones).toContain("Drogueria");
        expect(opciones).toContain("Desde Otros Centros");
        expect(opciones).toContain("Otros Servicios");
    });

    it("guarda la orden de entrada con origen 'Bodega Central' en la base de datos", async () => {
        vi.mocked(authLib.requireSessionUser).mockResolvedValue({
            id: "user-1",
            nombre: "Operador",
            apPaterno: "Bodega",
            email: "operador@cmvalparaiso.cl",
            rol: "R01",
            centroId: "c1",
            bodegaId: "b1"
        });
        vi.mocked(alcanceLib.validarCentroBodegaEnAlcance).mockResolvedValue();
        vi.mocked(prisma.producto.findMany).mockResolvedValue([
            { id: 10, linea: "FARMACOS" }
        ] as never);
        vi.mocked(prisma.ordenEntrada.create).mockResolvedValue({
            id: "ord-ent-100",
            fecha: new Date(),
            usuarioId: "user-1",
            origen: "Bodega Central",
            guiaDespacho: "GD-1234",
            centroId: "c1",
            bodegaId: "b1",
            codigoRecepcion: null
        } as never);

        const formData = new FormData();
        const hoy = new Date().toISOString().split("T")[0];
        formData.append("fecha", hoy);
        formData.append("origen", "Bodega Central");
        formData.append("guiaDespacho", "GD-1234");
        formData.append("centroId", "c1");
        formData.append("bodegaId", "b1");
        formData.append("productoId", "10");
        formData.append("cantidad", "25");
        formData.append("lote", "LOT-BC-1");
        formData.append("fechaCaducidad", "2027-12-31");

        const res = await crearOrdenEntrada(initialActionState, formData);

        expect(res.ok).toBe(true);
        expect(prisma.ordenEntrada.create).toHaveBeenCalledWith({
            data: expect.objectContaining({
                origen: "Bodega Central",
                centroId: "c1",
                bodegaId: "b1",
                guiaDespacho: "GD-1234"
            })
        });
    });

    it("permite listar y visualizar registros de entrada con origen 'Bodega Central'", async () => {
        vi.mocked(authLib.requireSessionUser).mockResolvedValue({
            id: "admin-1",
            nombre: "Admin",
            apPaterno: "Comunal",
            email: "admin@cmvalparaiso.cl",
            rol: "R01",
            centroId: "c1",
            bodegaId: null
        });
        vi.mocked(alcanceLib.obtenerAlcanceInventario).mockResolvedValue({
            usuario: {
                id: "admin-1",
                nombre: "Admin",
                apPaterno: "Comunal",
                email: "admin@cmvalparaiso.cl",
                rol: "R01",
                centroId: "c1",
                bodegaId: null
            },
            centros: mockCentros,
            bodegas: mockBodegas,
            centroId: "c1",
            bodegaId: "b1",
            centroIds: ["c1"],
            bodegaIds: ["b1"],
            puedeFiltrarCentro: true
        } as never);

        vi.mocked(prisma.ordenEntrada.count).mockResolvedValue(1);
        vi.mocked(prisma.ordenEntrada.findMany).mockResolvedValue([
            {
                id: "ord-ent-100",
                fecha: new Date("2026-11-10T10:00:00.000Z"),
                origen: "Bodega Central",
                bodega: { nombre: "Farmacia" },
                usuario: { nombre: "Operador", apPaterno: "Bodega" }
            }
        ] as never);
        vi.mocked(prisma.ordenEntradaDetalle.groupBy).mockResolvedValue([
            {
                ordenEntradaId: "ord-ent-100",
                _count: { _all: 1 },
                _sum: { cantidad: 25 }
            }
        ] as never);

        const resultado = await listarRegistrosEntrada({
            desde: "2026-11-01",
            hasta: "2026-11-30",
            centroId: "c1",
            bodegaId: "b1",
            pagina: 1,
            avisos: []
        });

        expect(resultado.filas).toHaveLength(1);
        expect(resultado.filas[0].origen).toBe("Bodega Central");
        expect(resultado.filas[0].bodegaNombre).toBe("Farmacia");
        expect(resultado.filas[0].unidades).toBe(25);
    });
});
