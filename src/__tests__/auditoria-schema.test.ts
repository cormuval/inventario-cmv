import { describe, expect, it } from "vitest";
import { filtroAuditoriaSchema } from "@/modules/auditoria/schemas/auditoria.schema";

describe("filtroAuditoriaSchema", () => {
    it("acepta la acción enviar_correo", () => {
        expect(filtroAuditoriaSchema.parse({ accion: "enviar_correo" }).accion).toBe("enviar_correo");
    });

    it("acepta la acción migracion", () => {
        expect(filtroAuditoriaSchema.parse({ accion: "migracion" }).accion).toBe("migracion");
    });
});
