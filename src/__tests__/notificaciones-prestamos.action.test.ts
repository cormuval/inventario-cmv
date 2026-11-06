import { beforeEach, describe, expect, it, vi } from "vitest";

// lib
import * as authLib from "@/shared/lib/auth";
import { prisma } from "@/shared/lib/prisma";

// actions
import { obtenerPrestamosEnTransitoCentroAction } from "@/modules/orden-entrada/actions/notificaciones-prestamos.action";

vi.mock("@/auth", () => ({ auth: vi.fn() }));

vi.mock("@/shared/lib/auth", async (importOriginal) => {
    const original = await importOriginal<typeof import("@/shared/lib/auth")>();
    return { ...original, obtenerSessionUser: vi.fn() };
});

vi.mock("@/shared/lib/prisma", () => ({
    prisma: {
        ordenSalida: { count: vi.fn(), findMany: vi.fn() }
    }
}));

function ordenEnTransito(indice: number): Record<string, unknown> {
    return {
        id: `orden-${indice}`,
        codigoRecepcion: `CODIGO${indice}`,
        fecha: new Date("2026-11-01T00:00:00.000Z"),
        fechaLimiteRecepcion: null,
        centro: { nombre: "CESFAM Barón" },
        bodega: { nombre: "Farmacia" },
        detalles: [{ id: `det-${indice}` }]
    };
}

describe("obtenerPrestamosEnTransitoCentroAction", () => {
    beforeEach(() => {
        vi.clearAllMocks();
        vi.mocked(authLib.obtenerSessionUser).mockResolvedValue({
            id: "user-receptor",
            nombre: "Receptor",
            apPaterno: "Playa Ancha",
            email: "receptor@cmvalparaiso.cl",
            rol: "R07",
            centroId: "centro-playa-ancha",
            bodegaId: "bodega-pa-1"
        });
    });

    it("informa el total real aunque la lista se limite a 10 préstamos", async () => {
        vi.mocked(prisma.ordenSalida.count).mockResolvedValue(15);
        vi.mocked(prisma.ordenSalida.findMany).mockResolvedValue(
            Array.from({ length: 10 }, (_, indice) => ordenEnTransito(indice)) as never
        );

        const resultado = await obtenerPrestamosEnTransitoCentroAction();

        expect(resultado.total).toBe(15);
        expect(resultado.ordenes).toHaveLength(10);
        expect(prisma.ordenSalida.count).toHaveBeenCalledWith({
            where: { centroDestinoId: "centro-playa-ancha", estadoPrestamo: "EN_TRANSITO" }
        });
        expect(prisma.ordenSalida.findMany).toHaveBeenCalledWith(expect.objectContaining({ take: 10 }));
    });
});
