import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { toast } from "sonner";

// actions
import * as actions from "@/modules/orden-salida/actions/orden-salida.action";

// components
import { BotonEnviarComprobante } from "@/modules/orden-salida/components/boton-enviar-comprobante";
import { EstadoCorreoBadge } from "@/modules/orden-salida/components/estado-correo-badge";

vi.mock("@/modules/orden-salida/actions/orden-salida.action", () => ({
    reenviarComprobanteSalidaAction: vi.fn()
}));

vi.mock("sonner", () => ({
    toast: { error: vi.fn(), success: vi.fn() }
}));

describe("EstadoCorreoBadge", () => {
    it("muestra Enviado con destinatario en el título", () => {
        render(
            <EstadoCorreoBadge
                enviado
                fechaEnvio={new Date("2026-10-29T12:00:00Z")}
                error={null}
                correoDestino="destino@cmvalparaiso.cl"
            />
        );
        expect(screen.getByText("Enviado")).toHaveAttribute("title", expect.stringContaining("destino@cmvalparaiso.cl"));
    });

    it("muestra Falló con el motivo en el título", () => {
        render(<EstadoCorreoBadge enviado={false} fechaEnvio={new Date()} error="Dominio no verificado" correoDestino="x@cmvalparaiso.cl" />);
        expect(screen.getByText("Falló")).toHaveAttribute("title", "Dominio no verificado");
    });

    it("muestra Sin envío cuando nunca se intentó", () => {
        render(<EstadoCorreoBadge enviado={false} fechaEnvio={null} error={null} correoDestino={null} />);
        expect(screen.getByText("Sin envío")).toBeInTheDocument();
    });
});

describe("BotonEnviarComprobante", () => {
    it("abre el modal con el correo precargado, permite editarlo y envía", async () => {
        vi.mocked(actions.reenviarComprobanteSalidaAction).mockResolvedValue({
            ok: true,
            message: "Comprobante enviado a nuevo@cmvalparaiso.cl."
        });

        render(<BotonEnviarComprobante ordenId="sal-1" correoInicial="antiguo@cmvalparaiso.cl" />);
        fireEvent.click(screen.getByRole("button", { name: /enviar comprobante/i }));

        const input = screen.getByLabelText(/correo destino/i);
        expect(input).toHaveValue("antiguo@cmvalparaiso.cl");
        fireEvent.change(input, { target: { value: "nuevo@cmvalparaiso.cl" } });
        fireEvent.click(screen.getByRole("button", { name: /^enviar$/i }));

        await waitFor(() => {
            expect(actions.reenviarComprobanteSalidaAction).toHaveBeenCalledWith("sal-1", "nuevo@cmvalparaiso.cl");
            expect(toast.success).toHaveBeenCalledWith("Comprobante enviado a nuevo@cmvalparaiso.cl.");
        });
        expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
    });

    it("muestra el error y mantiene el modal abierto", async () => {
        vi.mocked(actions.reenviarComprobanteSalidaAction).mockResolvedValue({
            ok: false,
            message: "No se pudo enviar el comprobante: Dominio no verificado"
        });

        render(<BotonEnviarComprobante ordenId="sal-1" correoInicial={null} />);
        fireEvent.click(screen.getByRole("button", { name: /enviar comprobante/i }));
        fireEvent.change(screen.getByLabelText(/correo destino/i), { target: { value: "x@cmvalparaiso.cl" } });
        fireEvent.click(screen.getByRole("button", { name: /^enviar$/i }));

        await waitFor(() => {
            expect(toast.error).toHaveBeenCalledWith("No se pudo enviar el comprobante: Dominio no verificado");
        });
        expect(screen.getByRole("dialog")).toBeInTheDocument();
    });
});
