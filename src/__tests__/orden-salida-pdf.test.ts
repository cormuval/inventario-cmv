import { beforeEach, describe, expect, it, vi } from "vitest";
import { descargarComprobanteSalidaAction } from "@/modules/orden-salida/actions/orden-salida.action";
import { prisma } from "@/shared/lib/prisma";
import * as auth from "@/shared/lib/auth";

vi.mock("@/shared/lib/auth", () => ({
    obtenerSessionUser: vi.fn(),
    requireSessionUser: vi.fn()
}));

vi.mock("@/shared/lib/prisma", () => ({
    prisma: {
        ordenSalida: {
            findUnique: vi.fn()
        },
        encargadosBodega: {
            findMany: vi.fn()
        }
    }
}));

describe("descargarComprobanteSalidaAction", () => {
    beforeEach(() => {
        vi.clearAllMocks();
    });

    it("retorna error cuando no hay sesión de usuario", async () => {
        vi.spyOn(auth, "obtenerSessionUser").mockResolvedValue(null);

        const res = await descargarComprobanteSalidaAction("sal-1");
        expect(res.ok).toBe(false);
        expect(res.error).toMatch(/no autenticado/i);
    });

    it("retorna error cuando la orden no existe", async () => {
        vi.spyOn(auth, "obtenerSessionUser").mockResolvedValue({
            id: "u-1",
            nombre: "Admin",
            apPaterno: "Central",
            email: "admin@cmvalparaiso.cl",
            rol: "R01",
            centroId: "c-1",
            bodegaId: "b-1"
        });
        vi.mocked(prisma.ordenSalida.findUnique).mockResolvedValue(null);

        const res = await descargarComprobanteSalidaAction("orden-inexistente");
        expect(res.ok).toBe(false);
        expect(res.error).toMatch(/no encontrada/i);
    });

    it("retorna error cuando un operador intenta acceder a una orden fuera de su alcance", async () => {
        vi.spyOn(auth, "obtenerSessionUser").mockResolvedValue({
            id: "u-2",
            nombre: "Operador",
            apPaterno: "Bodega 1",
            email: "op@cmvalparaiso.cl",
            rol: "R07",
            centroId: "c-1",
            bodegaId: "b-1"
        });
        vi.mocked(prisma.encargadosBodega.findMany).mockResolvedValue([]);
        vi.mocked(prisma.ordenSalida.findUnique).mockResolvedValue({
            id: "sal-ajena",
            bodegaId: "b-otra",
            centroId: "c-1"
        } as any);

        const res = await descargarComprobanteSalidaAction("sal-ajena");
        expect(res.ok).toBe(false);
        expect(res.error).toMatch(/no autorizado/i);
    });

    it("permite la descarga a un administrador R01 y retorna base64 con nombre de archivo", async () => {
        vi.spyOn(auth, "obtenerSessionUser").mockResolvedValue({
            id: "u-admin",
            nombre: "Admin",
            apPaterno: "Central",
            email: "admin@cmvalparaiso.cl",
            rol: "R01",
            centroId: "c-1",
            bodegaId: "b-1"
        });

        vi.mocked(prisma.ordenSalida.findUnique).mockResolvedValue({
            id: "sal-valida",
            fecha: new Date(),
            tipoSalida: "Consumo Interno",
            destino: "Box 1",
            codigoSalida: null,
            bodegaId: "b-1",
            centroId: "c-1",
            centro: { nombre: "CESFAM Centro" },
            bodega: { nombre: "Bodega Farmacia" },
            bodegaDestino: null,
            usuario: { nombre: "Carlos", apPaterno: "Pérez", email: "carlos@cmvalparaiso.cl" },
            detalles: [
                {
                    id: "det-1",
                    cantidad: 10,
                    lote: "L1",
                    fechaCaducidad: new Date("2027-01-01"),
                    producto: { descripcion: "Ibuprofeno 400mg" }
                }
            ]
        } as any);

        const res = await descargarComprobanteSalidaAction("sal-valida");
        expect(res.ok).toBe(true);
        expect(res.filename).toBe("comprobante-salida-sal-valida.pdf");
        expect(res.base64).toBeDefined();
        expect(typeof res.base64).toBe("string");
    });
});
