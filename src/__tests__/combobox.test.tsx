import React, { useState } from "react";
import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";

// components
import { Combobox } from "@/shared/components/ui/combobox";

const opciones = [
    { value: "1", label: "PARACETAMOL 500 MG" },
    { value: "2", label: "AMOXICILINA 500 MG" }
];

function FormularioPrueba({ required }: { required: boolean }): React.ReactElement {
    const [valor, setValor] = useState("");

    return (
        <form aria-label="formulario">
            <Combobox
                options={opciones}
                value={valor}
                onChange={setValor}
                required={required}
                requiredMessage="Seleccione un producto del catálogo."
            />
        </form>
    );
}

describe("Combobox - selección obligatoria", () => {
    it("impide enviar el formulario sin selección y lo habilita al elegir una opción", () => {
        const { container } = render(<FormularioPrueba required />);
        const form = screen.getByRole("form", { name: "formulario" }) as HTMLFormElement;
        const validacion = container.querySelector("input[required]") as HTMLInputElement;

        expect(form.checkValidity()).toBe(false);
        expect(validacion.validationMessage).toBe("Seleccione un producto del catálogo.");

        fireEvent.click(screen.getByRole("combobox"));
        fireEvent.click(screen.getByText("AMOXICILINA 500 MG"));

        expect(validacion.value).toBe("2");
        expect(validacion.validationMessage).toBe("");
        expect(form.checkValidity()).toBe(true);
    });

    it("no agrega validación cuando no es obligatorio", () => {
        const { container } = render(<FormularioPrueba required={false} />);
        const form = screen.getByRole("form", { name: "formulario" }) as HTMLFormElement;

        expect(container.querySelector("input[required]")).toBeNull();
        expect(form.checkValidity()).toBe(true);
    });
});
