import { beforeEach, describe, expect, it, vi } from "vitest";
import { Prisma } from "@prisma/client";

// lib
import * as authLib from "@/shared/lib/auth";
import * as alcanceLib from "@/shared/lib/inventario-alcance";
import { AuditLogger } from "@/shared/lib/logger";
import { prisma } from "@/shared/lib/prisma";

// actions
import {
    anularPedidoAction,
    descargarPedidoPdfAction,
    guardarPedidoAction,
    guardarPlantillaCentroAction
} from "@/modules/pedidos/actions/pedidos.action";

// utils
import { obtenerCatalogoAseo } from "@/modules/pedidos/utils/catalogo-aseo";

vi.mock("@/auth", () => ({ auth: vi.fn() }));

vi.mock("@/shared/lib/auth", async (importOriginal) => {
    const original = await importOriginal<typeof import("@/shared/lib/auth")>();
    return { ...original, requireSessionUser: vi.fn() };
});

vi.mock("@/shared/lib/inventario-alcance", () => ({
    obtenerAlcanceInventario: vi.fn(),
    validarCentroBodegaEnAlcance: vi.fn()
}));

vi.mock("@/modules/pedidos/utils/catalogo-aseo", () => ({ obtenerCatalogoAseo: vi.fn() }));
vi.mock("@/modules/pedidos/utils/correlativo", () => ({ generarNumeroPedido: vi.fn().mockResolvedValue("PED-2026-0001") }));
vi.mock("@/modules/pedidos/utils/pedidos-pdf", () => ({ generarPedidoPDF: vi.fn().mockResolvedValue(Buffer.from("pdf")) }));
vi.mock("@/modules/pedidos/utils/pedidos-excel", () => ({ construirExcelPedido: vi.fn() }));

vi.mock("@/shared/lib/prisma", () => ({
    prisma: {
        $transaction: vi.fn(),
        pedido: { create: vi.fn(), findUnique: vi.fn(), updateMany: vi.fn() },
        pedidoDetalle: { createMany: vi.fn(), deleteMany: vi.fn() },
        pedidoPlantillaAseo: { upsert: vi.fn() }
    }
}));

vi.mock("@/shared/lib/logger", () => ({ AuditLogger: { log: vi.fn() } }));
vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));

function sesion(rol: string) {
    return {
        id: `user-${rol}`,
        nombre: "Usuario",
        apPaterno: "Prueba",
        email: "usuario@cmvalparaiso.cl",
        rol,
        centroId: "c1",
        bodegaId: "b1"
    };
}

const catalogo = [
    { productoId: 1, descripcion: "Cloro", stockDisponible: 3, estadoStock: "bajo_umbral", sugerido: true, sugerencia: 7, cantidadHabitual: 0 },
    { productoId: 2, descripcion: "Jabón", stockDisponible: 40, estadoStock: "ok", sugerido: false, sugerencia: 0, cantidadHabitual: 0 }
];

const pedidoNuevo = {
    centroId: "c1",
    bodegaId: null,
    tipo: "MENSUAL" as const,
    periodo: "2026-11",
    detalles: [
        { productoId: 1, cantidadSolicitada: 12 },
        { productoId: 2, cantidadSolicitada: 0 }
    ]
};

describe("pedidos.action (INV-18 a INV-23)", () => {
    beforeEach(() => {
        vi.clearAllMocks();
        vi.mocked(authLib.requireSessionUser).mockResolvedValue(sesion("R02") as never);
        vi.mocked(alcanceLib.obtenerAlcanceInventario).mockResolvedValue({ centroIds: ["c1"] } as never);
        vi.mocked(obtenerCatalogoAseo).mockResolvedValue(catalogo as never);
        vi.mocked(prisma.$transaction).mockImplementation((async (arg: unknown) =>
            typeof arg === "function" ? (arg as (tx: typeof prisma) => unknown)(prisma) : Promise.all(arg as unknown[])) as never);
        vi.mocked(prisma.pedido.create).mockResolvedValue({ id: "ped-1", numero: "PED-2026-0001" } as never);
    });

    describe("permisos por rol", () => {
        it.each(["R06", "R07", "R08"])("el rol %s solo consulta: no crea pedidos", async (rol) => {
            vi.mocked(authLib.requireSessionUser).mockResolvedValue(sesion(rol) as never);

            const res = await guardarPedidoAction(pedidoNuevo);

            expect(res).toMatchObject({ ok: false, message: "Tu rol solo permite consultar pedidos de aseo." });
            expect(prisma.pedido.create).not.toHaveBeenCalled();
        });

        it("el visualizador R08 no puede anular", async () => {
            vi.mocked(authLib.requireSessionUser).mockResolvedValue(sesion("R08") as never);

            const res = await anularPedidoAction("ped-1", "Pedido duplicado");

            expect(res.ok).toBe(false);
            expect(prisma.pedido.updateMany).not.toHaveBeenCalled();
        });

        it("rechaza crear pedidos para un centro fuera del alcance", async () => {
            const res = await guardarPedidoAction({ ...pedidoNuevo, centroId: "c2" });

            expect(res).toMatchObject({ ok: false, message: "No tienes permiso para operar pedidos de este centro." });
            expect(prisma.pedido.create).not.toHaveBeenCalled();
        });
    });

    describe("crear y finalizar", () => {
        it("crea un borrador solo con filas mayores a 0 y la foto del stock", async () => {
            const res = await guardarPedidoAction(pedidoNuevo);

            expect(res).toMatchObject({ ok: true, pedidoId: "ped-1", message: "Borrador PED-2026-0001 guardado." });
            expect(prisma.pedido.create).toHaveBeenCalledWith(
                expect.objectContaining({ data: expect.objectContaining({ estado: "BORRADOR", fechaFinalizacion: null, usuarioSolicitanteId: "user-R02" }) })
            );
            expect(prisma.pedidoDetalle.createMany).toHaveBeenCalledWith({
                data: [{ productoId: 1, cantidadSolicitada: 12, stockActualMomento: 3, pedidoId: "ped-1" }]
            });
            expect(AuditLogger.log).toHaveBeenCalledWith(expect.objectContaining({ accion: "crear", entidad: "Pedido" }));
        });

        it("rechaza productos fuera del catálogo de aseo", async () => {
            const res = await guardarPedidoAction({ ...pedidoNuevo, detalles: [{ productoId: 99, cantidadSolicitada: 1 }] });

            expect(res).toMatchObject({ ok: false, message: "El producto 99 no pertenece al catálogo de aseo." });
            expect(prisma.pedido.create).not.toHaveBeenCalled();
        });

        it("muestra el mensaje de validación, no el error técnico", async () => {
            const res = await guardarPedidoAction({ ...pedidoNuevo, periodo: null });

            expect(res).toMatchObject({ ok: false, message: "Debe indicar el período del pedido mensual." });
        });

        it("reintenta cuando dos pedidos obtienen el mismo correlativo", async () => {
            const duplicado = new Prisma.PrismaClientKnownRequestError("Unique", { code: "P2002", clientVersion: "6" });
            vi.mocked(prisma.pedido.create).mockRejectedValueOnce(duplicado).mockResolvedValueOnce({
                id: "ped-2",
                numero: "PED-2026-0002"
            } as never);

            const res = await guardarPedidoAction({ ...pedidoNuevo, finalizar: true });

            expect(res).toMatchObject({ ok: true, pedidoId: "ped-2", message: "Pedido PED-2026-0002 finalizado." });
            expect(prisma.pedido.create).toHaveBeenCalledTimes(2);
        });

        it("finalizar un borrador existente lo actualiza, sin crear otro pedido", async () => {
            vi.mocked(prisma.pedido.findUnique).mockResolvedValue({
                id: "ped-1",
                numero: "PED-2026-0001",
                estado: "BORRADOR",
                centroId: "c1",
                bodegaId: null
            } as never);
            vi.mocked(prisma.pedido.updateMany).mockResolvedValue({ count: 1 } as never);

            const res = await guardarPedidoAction({ ...pedidoNuevo, pedidoId: "ped-1", finalizar: true });

            expect(res).toMatchObject({ ok: true, message: "Pedido PED-2026-0001 finalizado." });
            expect(prisma.pedido.create).not.toHaveBeenCalled();
            expect(prisma.pedido.updateMany).toHaveBeenCalledWith({
                where: { id: "ped-1", estado: "BORRADOR" },
                data: expect.objectContaining({ estado: "FINALIZADO", fechaFinalizacion: expect.any(Date) })
            });
        });

        it("no modifica el borrador de un centro fuera del alcance", async () => {
            vi.mocked(prisma.pedido.findUnique).mockResolvedValue({
                id: "ped-9",
                numero: "PED-2026-0009",
                estado: "BORRADOR",
                centroId: "c2",
                bodegaId: null
            } as never);

            const res = await guardarPedidoAction({ ...pedidoNuevo, pedidoId: "ped-9" });

            expect(res.ok).toBe(false);
            expect(prisma.pedido.updateMany).not.toHaveBeenCalled();
        });

        it("no pisa un borrador que otro usuario finalizó entretanto", async () => {
            vi.mocked(prisma.pedido.findUnique).mockResolvedValue({
                id: "ped-1",
                numero: "PED-2026-0001",
                estado: "BORRADOR",
                centroId: "c1",
                bodegaId: null
            } as never);
            vi.mocked(prisma.pedido.updateMany).mockResolvedValue({ count: 0 } as never);

            const res = await guardarPedidoAction({ ...pedidoNuevo, pedidoId: "ped-1", finalizar: true });

            expect(res).toMatchObject({ ok: false, message: "El pedido ya no está en borrador. Recarga la página." });
            expect(prisma.pedidoDetalle.deleteMany).not.toHaveBeenCalled();
        });
    });

    describe("anular", () => {
        beforeEach(() => {
            vi.mocked(prisma.pedido.findUnique).mockResolvedValue({
                id: "ped-1",
                numero: "PED-2026-0001",
                estado: "FINALIZADO",
                centroId: "c1",
                bodegaId: null
            } as never);
        });

        it("anula un pedido finalizado con su motivo", async () => {
            vi.mocked(prisma.pedido.updateMany).mockResolvedValue({ count: 1 } as never);

            const res = await anularPedidoAction("ped-1", "Pedido duplicado");

            expect(res.ok).toBe(true);
            expect(prisma.pedido.updateMany).toHaveBeenCalledWith({
                where: { id: "ped-1", estado: { in: ["BORRADOR", "FINALIZADO"] } },
                data: expect.objectContaining({ estado: "ANULADO", motivoAnulacion: "Pedido duplicado" })
            });
        });

        it("informa si el pedido ya estaba anulado", async () => {
            vi.mocked(prisma.pedido.updateMany).mockResolvedValue({ count: 0 } as never);

            const res = await anularPedidoAction("ped-1", "Pedido duplicado");

            expect(res).toMatchObject({ ok: false, message: "El pedido ya se encuentra anulado." });
        });
    });

    describe("descargas y plantilla", () => {
        it("no entrega el PDF de un pedido de otro centro", async () => {
            vi.mocked(prisma.pedido.findUnique).mockResolvedValue({ id: "ped-9", numero: "PED-2026-0009", centroId: "c2" } as never);

            const res = await descargarPedidoPdfAction("ped-9");

            expect(res).toMatchObject({ ok: false, error: "No tienes permiso para operar pedidos de este centro." });
        });

        it("el visualizador descarga el PDF de un pedido de su alcance y queda auditado", async () => {
            vi.mocked(authLib.requireSessionUser).mockResolvedValue(sesion("R08") as never);
            vi.mocked(prisma.pedido.findUnique).mockResolvedValue({ id: "ped-1", numero: "PED-2026-0001", centroId: "c1" } as never);

            const res = await descargarPedidoPdfAction("ped-1");

            expect(res).toMatchObject({ ok: true, nombreArchivo: "PED-2026-0001.pdf" });
            expect(AuditLogger.log).toHaveBeenCalledWith(expect.objectContaining({ accion: "exportar", detalle: expect.objectContaining({ formato: "pdf" }) }));
        });

        it("la plantilla rechaza productos fuera del catálogo de aseo", async () => {
            const res = await guardarPlantillaCentroAction({ centroId: "c1", items: [{ productoId: 99, cantidadHabitual: 5 }] });

            expect(res).toMatchObject({ ok: false, message: "El producto 99 no pertenece al catálogo de aseo." });
            expect(prisma.pedidoPlantillaAseo.upsert).not.toHaveBeenCalled();
        });
    });
});
