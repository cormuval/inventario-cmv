import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import * as React from "react";
import { describe, expect, it, vi } from "vitest";
import { BotonDescargarComprobante } from "@/modules/orden-salida/components/boton-descargar-comprobante";
import * as actions from "@/modules/orden-salida/actions/orden-salida.action";
import * as downloadUtil from "@/shared/utils/descargar-base64";

vi.mock("@/modules/orden-salida/actions/orden-salida.action", () => ({
    descargarComprobanteSalidaAction: vi.fn()
}));

vi.mock("sonner", () => ({
    toast: {
        error: vi.fn(),
        success: vi.fn()
    }
}));

describe("BotonDescargarComprobante", () => {
    it("invoca la Server Action y descarga el archivo al hacer clic", async () => {
        const descargarSpy = vi.spyOn(downloadUtil, "descargarArchivoBase64").mockImplementation(() => {});
        vi.mocked(actions.descargarComprobanteSalidaAction).mockResolvedValue({
            ok: true,
            base64: "dGVzdA==",
            filename: "comprobante-salida-123.pdf"
        });

        render(<BotonDescargarComprobante ordenId="123" />);

        const boton = screen.getByRole("button", { name: /descargar pdf/i });
        fireEvent.click(boton);

        await waitFor(() => {
            expect(actions.descargarComprobanteSalidaAction).toHaveBeenCalledWith("123");
            expect(descargarSpy).toHaveBeenCalledWith("dGVzdA==", "comprobante-salida-123.pdf");
        });
    });
});
