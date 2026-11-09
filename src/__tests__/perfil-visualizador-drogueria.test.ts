import { beforeEach, describe, expect, it, vi } from "vitest";

// config
import { ROL_VISUALIZADOR_DROGUERIA } from "@/config/auth";

// lib
import {
    esVisualizadorSoloLectura,
    puedeAdministrar,
    puedeOperarEntrada,
    puedeOperarSalida
} from "@/shared/lib/auth";
import * as authLib from "@/shared/lib/auth";
import { prisma } from "@/shared/lib/prisma";

// actions
import {
    actualizarDetalleEntrada,
    crearOrdenEntrada,
    eliminarDetalleEntrada
} from "@/modules/orden-entrada/actions/orden-entrada.action";
import { confirmarRecepcionPrestamoAction } from "@/modules/orden-entrada/actions/recepcion-prestamos.action";
import { listarRegistrosEntrada } from "@/modules/orden-entrada/actions/registros-entrada.action";
import {
    actualizarDetalleSalida,
    anularPrestamoAction,
    crearOrdenSalida,
    descargarComprobanteSalidaAction,
    eliminarDetalleSalida
} from "@/modules/orden-salida/actions/orden-salida.action";
import { listarRegistrosSalida } from "@/modules/orden-salida/actions/registros-salida.action";
import { crearProducto } from "@/modules/productos/actions/productos.action";
import {
    crearBodega,
    crearCentro,
    crearUnidad,
    crearUsuario,
    toggleEstadoUsuario
} from "@/modules/mantenedores/actions/mantenedores.action";
import { listarStockConsolidado } from "@/modules/stock/actions/stock.action";
import { consultarReporte } from "@/modules/reporte/actions/reporte.action";
import { leerFiltrosReporte } from "@/modules/reporte/utils/periodo";

vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));
vi.mock("@/auth", () => ({ auth: vi.fn() }));

vi.mock("@/shared/lib/auth", async (importOriginal) => {
    const original = await importOriginal<typeof import("@/shared/lib/auth")>();
    return {
        ...original,
        requireSessionUser: vi.fn()
    };
});

vi.mock("@/shared/lib/logger", () => ({ AuditLogger: { log: vi.fn() } }));

vi.mock("@/modules/orden-salida/utils/pdf-comprobante", () => ({
    generarComprobanteSalidaPDF: vi.fn().mockResolvedValue(Buffer.from("dummy-pdf-content"))
}));

vi.mock("@/shared/lib/prisma", () => ({
    prisma: {
        $queryRaw: vi.fn(),
        $transaction: vi.fn(),
        centro: { findMany: vi.fn(), findFirst: vi.fn(), create: vi.fn(), update: vi.fn() },
        bodega: { findMany: vi.fn(), findFirst: vi.fn(), create: vi.fn(), update: vi.fn() },
        unidad: { findMany: vi.fn(), findFirst: vi.fn(), create: vi.fn(), update: vi.fn() },
        usuario: { findMany: vi.fn(), findFirst: vi.fn(), findUnique: vi.fn(), create: vi.fn(), update: vi.fn() },
        encargadosBodega: { findMany: vi.fn() },
        ordenEntrada: { findMany: vi.fn(), count: vi.fn(), create: vi.fn() },
        ordenEntradaDetalle: { findMany: vi.fn(), findUniqueOrThrow: vi.fn() },
        ordenSalida: { findMany: vi.fn(), findFirst: vi.fn(), findUnique: vi.fn(), count: vi.fn(), create: vi.fn(), updateMany: vi.fn() },
        ordenSalidaDetalle: { findMany: vi.fn(), findUniqueOrThrow: vi.fn() },
        producto: { findMany: vi.fn(), create: vi.fn() },
        stock: { findMany: vi.fn() }
    }
}));

const centrosMock = [
    { id: "centro-1", nombre: "CESFAM Barón", estado: true },
    { id: "centro-2", nombre: "CESFAM Esperanza", estado: true }
];

const bodegasMock = [
    { id: "b1", nombre: "Bodega Farmacia Barón", centroId: "centro-1", estado: true },
    { id: "b2", nombre: "Bodega Vacunatorio Barón", centroId: "centro-1", estado: true },
    { id: "b3", nombre: "Bodega General Esperanza", centroId: "centro-2", estado: true }
];

function sesionVisualizadorDrogueria(): void {
    vi.mocked(authLib.requireSessionUser).mockResolvedValue({
        id: "user-drogueria",
        nombre: "Visualizador",
        apPaterno: "Droguería",
        email: "drogueria@cmvalparaiso.cl",
        rol: ROL_VISUALIZADOR_DROGUERIA,
        centroId: "centro-1",
        bodegaId: null
    });
    vi.mocked(prisma.centro.findMany).mockResolvedValue(centrosMock as never);
    vi.mocked(prisma.bodega.findMany).mockResolvedValue(bodegasMock as never);
    vi.mocked(prisma.producto.findMany).mockResolvedValue([
        { linea: "CLINICO" },
        { linea: "ASEO" }
    ] as never);
}

describe("Perfil de Visualización Global Droguería (R08)", () => {
    beforeEach(() => {
        vi.clearAllMocks();
        sesionVisualizadorDrogueria();
    });

    describe("Regla R-01 y R-02: Permisos de Rol y Cero Mutaciones", () => {
        it("identifica correctamente el rol R08 como visualizador de solo lectura", () => {
            expect(esVisualizadorSoloLectura(ROL_VISUALIZADOR_DROGUERIA)).toBe(true);
            expect(esVisualizadorSoloLectura("R01")).toBe(false);
            expect(esVisualizadorSoloLectura("R07")).toBe(false);
        });

        it("excluye a R08 de operar entradas, salidas y administración", () => {
            expect(puedeOperarEntrada(ROL_VISUALIZADOR_DROGUERIA)).toBe(false);
            expect(puedeOperarSalida(ROL_VISUALIZADOR_DROGUERIA)).toBe(false);
            expect(puedeAdministrar(ROL_VISUALIZADOR_DROGUERIA)).toBe(false);
        });

        it("bloquea crearOrdenEntrada para usuario R08", async () => {
            const formData = new FormData();
            formData.set("fecha", new Date().toISOString());
            formData.set("origen", "CENABAST");
            formData.set("centroId", "centro-1");
            formData.set("bodegaId", "b1");

            const res = await crearOrdenEntrada({ ok: false, message: "" }, formData);
            expect(res.ok).toBe(false);
            expect(res.message).toBe("No tienes permiso para registrar entradas.");
            expect(prisma.$transaction).not.toHaveBeenCalled();
        });

        it("bloquea actualizarDetalleEntrada para usuario R08", async () => {
            const res = await actualizarDetalleEntrada("det-1", new FormData());
            expect(res.ok).toBe(false);
            expect(res.message).toBe("No tienes permiso para editar entradas.");
            expect(prisma.$transaction).not.toHaveBeenCalled();
        });

        it("bloquea eliminarDetalleEntrada para usuario R08", async () => {
            const res = await eliminarDetalleEntrada("det-1");
            expect(res.ok).toBe(false);
            expect(res.message).toBe("No tienes permiso para eliminar entradas.");
            expect(prisma.$transaction).not.toHaveBeenCalled();
        });

        it("bloquea confirmarRecepcionPrestamoAction para usuario R08", async () => {
            const res = await confirmarRecepcionPrestamoAction({
                codigo: "ABC1234",
                bodegaDestinoId: "b1"
            });
            expect(res.ok).toBe(false);
            expect(res.message).toBe("No tienes permiso para recepcionar entradas.");
            expect(prisma.$transaction).not.toHaveBeenCalled();
        });

        it("bloquea crearOrdenSalida para usuario R08", async () => {
            const formData = new FormData();
            formData.set("fecha", new Date().toISOString());
            formData.set("tipoSalida", "Consumo Interno");
            formData.set("destino", "Box 1");
            formData.set("centroId", "centro-1");
            formData.set("bodegaId", "b1");

            const res = await crearOrdenSalida({ ok: false, message: "" }, formData);
            expect(res.ok).toBe(false);
            expect(res.message).toBe("No tienes permiso para registrar salidas.");
            expect(prisma.$transaction).not.toHaveBeenCalled();
        });

        it("bloquea actualizarDetalleSalida para usuario R08", async () => {
            const res = await actualizarDetalleSalida("det-1", new FormData());
            expect(res.ok).toBe(false);
            expect(res.message).toBe("No tienes permiso para editar salidas.");
            expect(prisma.$transaction).not.toHaveBeenCalled();
        });

        it("bloquea eliminarDetalleSalida para usuario R08", async () => {
            const res = await eliminarDetalleSalida("det-1");
            expect(res.ok).toBe(false);
            expect(res.message).toBe("No tienes permiso para eliminar salidas.");
            expect(prisma.$transaction).not.toHaveBeenCalled();
        });

        it("bloquea anularPrestamoAction para usuario R08", async () => {
            const res = await anularPrestamoAction("orden-1", "Motivo de prueba");
            expect(res.ok).toBe(false);
            expect(res.message).toBe("No tienes permiso para anular préstamos.");
            expect(prisma.$transaction).not.toHaveBeenCalled();
        });

        it("bloquea crearProducto para usuario R08", async () => {
            const formData = new FormData();
            formData.set("linea", "CLINICO");
            formData.set("descripcion", "Paracetamol 500mg");

            const res = await crearProducto({ ok: false, message: "" }, formData);
            expect(res.ok).toBe(false);
            expect(res.message).toBe("Solo administradores pueden crear productos.");
            expect(prisma.producto.create).not.toHaveBeenCalled();
        });

        it("bloquea acciones de mantenedores para usuario R08", async () => {
            const formDataCentro = new FormData();
            formDataCentro.set("nombre", "CESFAM Nuevo");
            const resCentro = await crearCentro({ ok: false, message: "" }, formDataCentro);
            expect(resCentro.ok).toBe(false);
            expect(resCentro.message).toContain("Solo administradores");

            const formDataBodega = new FormData();
            formDataBodega.set("nombre", "Bodega Nueva");
            formDataBodega.set("centroId", "centro-1");
            const resBodega = await crearBodega({ ok: false, message: "" }, formDataBodega);
            expect(resBodega.ok).toBe(false);
            expect(resBodega.message).toContain("Solo administradores");

            const formDataUnidad = new FormData();
            formDataUnidad.set("descripcion", "Frasco");
            const resUnidad = await crearUnidad({ ok: false, message: "" }, formDataUnidad);
            expect(resUnidad.ok).toBe(false);
            expect(resUnidad.message).toContain("Solo administradores");

            const formDataUsuario = new FormData();
            formDataUsuario.set("nombre", "Juan");
            formDataUsuario.set("apPaterno", "Pérez");
            formDataUsuario.set("email", "jperez@cmvalparaiso.cl");
            formDataUsuario.set("rolId", "R07");
            formDataUsuario.set("centroId", "centro-1");
            const resUsuario = await crearUsuario({ ok: false, message: "" }, formDataUsuario);
            expect(resUsuario.ok).toBe(false);
            expect(resUsuario.message).toContain("Solo administradores");

            const formDataToggle = new FormData();
            formDataToggle.set("id", "user-test");
            formDataToggle.set("estado", "false");
            const resToggle = await toggleEstadoUsuario({ ok: false, message: "" }, formDataToggle);
            expect(resToggle.ok).toBe(false);
            expect(resToggle.message).toContain("Solo administradores");
        });
    });

    describe("Regla R-01 y R-04: Visibilidad Panorámica de Consultas y Reportes", () => {
        it("CA-2: listarRegistrosSalida muestra el historial comunal completo con puedeOperar=false", async () => {
            vi.mocked(prisma.ordenSalida.count).mockResolvedValue(0);
            vi.mocked(prisma.ordenSalida.findMany).mockResolvedValue([]);

            const resultado = await listarRegistrosSalida({
                desde: "2026-10-01",
                hasta: "2026-10-31",
                pagina: 1,
                avisos: []
            });

            expect(resultado.puedeOperar).toBe(false);
            expect(resultado.puedeFiltrarCentro).toBe(true);
            expect(resultado.centros).toHaveLength(2);

            const where = vi.mocked(prisma.ordenSalida.count).mock.calls[0][0]?.where;
            // No debe restringir por bodegaId ni centroId (vista panorámica comunal)
            expect(where).not.toHaveProperty("bodegaId");
            expect(where).not.toHaveProperty("centroId");
        });

        it("CA-2: listarRegistrosEntrada muestra el historial comunal completo", async () => {
            vi.mocked(prisma.ordenEntrada.count).mockResolvedValue(0);
            vi.mocked(prisma.ordenEntrada.findMany).mockResolvedValue([]);

            const resultado = await listarRegistrosEntrada({
                desde: "2026-10-01",
                hasta: "2026-10-31",
                pagina: 1,
                avisos: []
            });

            expect(resultado.puedeFiltrarCentro).toBe(true);
            expect(resultado.centros).toHaveLength(2);

            const where = vi.mocked(prisma.ordenEntrada.count).mock.calls[0][0]?.where;
            expect(where).not.toHaveProperty("bodegaId");
            expect(where).not.toHaveProperty("centroId");
        });

        it("CA-1: listarStockConsolidado permite filtrar centros comunales y consolidar stock", async () => {
            vi.mocked(prisma.$queryRaw).mockResolvedValueOnce([{ total: 0 }]).mockResolvedValueOnce([]);

            const resultado = await listarStockConsolidado({
                pagina: 1
            });

            expect(resultado.puedeFiltrarCentro).toBe(true);
            expect(resultado.centros).toHaveLength(2);
            expect(resultado.bodegas).toHaveLength(3);
        });

        it("CA-4: consultarReporte otorga árbol completo y consulta comunal", async () => {
            vi.mocked(prisma.$queryRaw).mockResolvedValue([] as never);

            const filtros = leerFiltrosReporte(undefined, "2026-10-31");
            const resultado = await consultarReporte(filtros);

            expect(resultado.puedeFiltrarCentro).toBe(true);
            expect(resultado.arbol).toHaveLength(2);
            expect(resultado.nodoNombre).toBe("todo");
        });

        it("CA-3: descargarComprobanteSalidaAction permite a R08 descargar comprobante PDF de cualquier centro comunal", async () => {
            vi.mocked(prisma.ordenSalida.findUnique).mockResolvedValue({
                id: "salida-100",
                fecha: new Date(),
                tipoSalida: "Consumo Interno",
                destino: "Servicio de Urgencia",
                centroId: "centro-2",
                bodegaId: "b3",
                centro: { id: "centro-2", nombre: "CESFAM Esperanza" },
                bodega: { id: "b3", nombre: "Bodega General Esperanza" },
                usuario: { nombre: "Funcionario", apPaterno: "Salud" },
                detalles: [
                    {
                        id: "det-1",
                        productoId: 1,
                        cantidad: 10,
                        lote: "LOTE-01",
                        fechaCaducidad: new Date(),
                        producto: { descripcion: "Guantes M", linea: "CLINICO" }
                    }
                ]
            } as never);

            const res = await descargarComprobanteSalidaAction("salida-100");

            expect(res.ok).toBe(true);
            expect(res.base64).toBeDefined();
            expect(res.filename).toBe("comprobante-salida-salida-100.pdf");
        });
    });
});
