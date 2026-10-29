import { beforeEach, describe, expect, it, vi } from "vitest";
import { descargarComprobanteSalidaAction } from "@/modules/orden-salida/actions/orden-salida.action";
import { prisma } from "@/shared/lib/prisma";
import { validarCentroBodegaEnAlcance } from "@/shared/lib/inventario-alcance";

vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));
vi.mock("@/auth", () => ({ auth: vi.fn() }));
vi.mock("@/shared/lib/logger", () => ({ AuditLogger: { log: vi.fn() } }));

vi.mock("@/shared/lib/inventario-alcance", () => ({
    validarCentroBodegaEnAlcance: vi.fn()
}));

vi.mock("@/shared/lib/prisma", () => ({
    prisma: {
        ordenSalida: {
            findUnique: vi.fn()
        }
    }
}));

describe("descargarComprobanteSalidaAction", () => {
    beforeEach(() => {
        vi.clearAllMocks();
    });

    it("retorna error cuando la orden no existe", async () => {
        vi.mocked(prisma.ordenSalida.findUnique).mockResolvedValue(null);

        const res = await descargarComprobanteSalidaAction("orden-inexistente");
        expect(res.ok).toBe(false);
        expect(res.error).toMatch(/no encontrada/i);
    });

    it("retorna error cuando validarCentroBodegaEnAlcance rechaza por falta de permisos de alcance", async () => {
        vi.mocked(prisma.ordenSalida.findUnique).mockResolvedValue({
            id: "sal-ajena",
            bodegaId: "b-otra",
            centroId: "c-1"
        } as any);
        vi.mocked(validarCentroBodegaEnAlcance).mockRejectedValue(
            new Error("No tienes permiso para operar en el centro o bodega seleccionada.")
        );

        const res = await descargarComprobanteSalidaAction("sal-ajena");
        expect(res.ok).toBe(false);
        expect(res.error).toBe("No tienes permiso para operar en el centro o bodega seleccionada.");
        expect(validarCentroBodegaEnAlcance).toHaveBeenCalledWith("c-1", "b-otra");
    });

    it("permite la descarga cuando la orden existe y está en alcance, retornando base64 con nombre de archivo", async () => {
        vi.mocked(validarCentroBodegaEnAlcance).mockResolvedValue(undefined);
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
        expect(validarCentroBodegaEnAlcance).toHaveBeenCalledWith("c-1", "b-1");
    });
});
