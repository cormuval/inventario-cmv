import { beforeEach, describe, expect, it, vi } from "vitest";
import { despacharNotificacionPrestamoAction } from "@/modules/orden-salida/actions/notificacion-correo";
import { prisma } from "@/shared/lib/prisma";
import { AuditLogger } from "@/shared/lib/logger";

vi.mock("@/shared/lib/prisma", () => ({
    prisma: {
        usuario: {
            findMany: vi.fn()
        }
    }
}));

vi.mock("@/shared/lib/logger", () => ({
    AuditLogger: {
        log: vi.fn()
    }
}));

describe("despacharNotificacionPrestamoAction", () => {
    beforeEach(() => {
        vi.clearAllMocks();
    });

    it("despacha notificaciones a los encargados del centro receptor y correo opcional", async () => {
        vi.mocked(prisma.usuario.findMany).mockResolvedValue([
            { email: "receptor1@cmvalparaiso.cl" },
            { email: "receptor2@cmvalparaiso.cl" }
        ] as any);

        const res = await despacharNotificacionPrestamoAction({
            ordenSalidaId: "ord-123",
            codigoRecepcion: "K94J2Q8",
            centroOrigenNombre: "CESFAM Barón",
            bodegaOrigenNombre: "Farmacia Barón",
            centroDestinoId: "cen-destino",
            correoDestinoOpcional: "extra@cmvalparaiso.cl",
            items: [{ productoNombre: "Paracetamol", cantidad: 10, lote: "L001" }]
        });

        expect(res.ok).toBe(true);
        expect(res.destinatarios).toEqual(
            expect.arrayContaining([
                "receptor1@cmvalparaiso.cl",
                "receptor2@cmvalparaiso.cl",
                "extra@cmvalparaiso.cl"
            ])
        );
        expect(AuditLogger.log).toHaveBeenCalledWith(
            expect.objectContaining({
                accion: "notificar",
                entidad: "OrdenSalida",
                entidadId: "ord-123"
            })
        );
    });

    it("es fail-safe y no arroja error si prisma o el logger fallan", async () => {
        vi.mocked(prisma.usuario.findMany).mockRejectedValue(new Error("DB Timeout"));

        const res = await despacharNotificacionPrestamoAction({
            ordenSalidaId: "ord-123",
            codigoRecepcion: "K94J2Q8",
            centroOrigenNombre: "CESFAM Barón",
            bodegaOrigenNombre: "Farmacia Barón",
            centroDestinoId: "cen-destino",
            items: []
        });

        expect(res.ok).toBe(false);
        expect(res.destinatarios).toEqual([]);
    });
});
