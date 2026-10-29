import { describe, expect, it, vi } from "vitest";
import { descargarArchivoBase64 } from "@/shared/utils/descargar-base64";

describe("descargarArchivoBase64", () => {
    it("crea un elemento <a> con blob url y ejecuta la descarga", () => {
        const createObjectURLMock = vi.fn().mockReturnValue("blob:http://localhost/mock-blob");
        const revokeObjectURLMock = vi.fn();
        globalThis.URL.createObjectURL = createObjectURLMock;
        globalThis.URL.revokeObjectURL = revokeObjectURLMock;

        const appendChildSpy = vi.spyOn(document.body, "appendChild");
        const removeChildSpy = vi.spyOn(document.body, "removeChild");

        const sampleBase64 = Buffer.from("test content").toString("base64");
        descargarArchivoBase64(sampleBase64, "comprobante.pdf", "application/pdf");

        expect(createObjectURLMock).toHaveBeenCalled();
        expect(appendChildSpy).toHaveBeenCalled();
        expect(removeChildSpy).toHaveBeenCalled();
        expect(revokeObjectURLMock).toHaveBeenCalledWith("blob:http://localhost/mock-blob");
    });
});
