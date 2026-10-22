import { describe, expect, it, vi } from "vitest";
import { AuditLogger } from "@/shared/lib/logger";
import { prisma } from "@/shared/lib/prisma";

vi.mock("@/shared/lib/prisma", () => ({
    prisma: {
        log: {
            create: vi.fn().mockResolvedValue({ id: "log-1", fecha: new Date() })
        }
    }
}));

describe("AuditLogger con Timestamp", () => {
    it("registra un evento con los datos completos en la tabla Log", async () => {
        await AuditLogger.log({
            usuarioId: "user-1",
            accion: "crear",
            entidad: "OrdenSalida",
            entidadId: "salida-123",
            detalle: { tipo: "Consumo Interno", lineas: 2 }
        });

        expect(prisma.log.create).toHaveBeenCalledWith({
            data: {
                usuarioId: "user-1",
                accion: "crear",
                entidad: "OrdenSalida",
                entidadId: "salida-123",
                detalle: { tipo: "Consumo Interno", lineas: 2 }
            }
        });
    });
});
