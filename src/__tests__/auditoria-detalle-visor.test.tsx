import { render, screen } from "@testing-library/react";
import type * as React from "react";
import { describe, expect, it } from "vitest";

// components
import { AuditoriaDetalleVisor } from "@/modules/auditoria/components/auditoria-detalle-visor";

describe("AuditoriaDetalleVisor", () => {
    it("muestra mensaje por defecto si detalle es null o undefined", () => {
        const { rerender } = render(<AuditoriaDetalleVisor detalle={null} entidad="Usuario" />);
        expect(screen.getByText(/sin detalle adicional registrado/i)).toBeInTheDocument();

        rerender(<AuditoriaDetalleVisor detalle={undefined} entidad="Usuario" />);
        expect(screen.getByText(/sin detalle adicional registrado/i)).toBeInTheDocument();
    });

    it("muestra el valor como texto cuando el detalle es un string, number o boolean", () => {
        const { rerender } = render(
            <AuditoriaDetalleVisor detalle="Usuario carlos@cmvalparaiso.cl actualizado con 2 bodegas." entidad="Usuario" />
        );
        expect(screen.getByText(/usuario carlos@cmvalparaiso\.cl actualizado con 2 bodegas\./i)).toBeInTheDocument();

        rerender(<AuditoriaDetalleVisor detalle={12345} entidad="OrdenSalida" />);
        expect(screen.getByText("12345")).toBeInTheDocument();

        rerender(<AuditoriaDetalleVisor detalle={true} entidad="OrdenEntrada" />);
        expect(screen.getByText("true")).toBeInTheDocument();
    });

    it("muestra pares clave-valor cuando el detalle es un objeto plano", () => {
        render(
            <AuditoriaDetalleVisor
                detalle={{
                    email: "juan@cmvalparaiso.cl",
                    rolId: "R03",
                    centroId: "centro-1",
                    bodegaIds: ["b1", "b2"],
                    estado: true
                }}
                entidad="Usuario"
            />
        );

        expect(screen.getByText(/detalle estructurado de usuario/i)).toBeInTheDocument();
        expect(screen.getByText("juan@cmvalparaiso.cl")).toBeInTheDocument();
        expect(screen.getByText("R03")).toBeInTheDocument();
        expect(screen.getByText("b1, b2")).toBeInTheDocument();
    });

    it("muestra tabla de 3 columnas (Campo | Antes | Después) cuando el detalle tiene estructura de cambios", () => {
        render(
            <AuditoriaDetalleVisor
                detalle={{
                    cambios: {
                        rolId: { antes: "R07", despues: "R03" },
                        estado: { antes: true, despues: false },
                        bodegaIds: { antes: ["b1"], despues: ["b1", "b2"] }
                    }
                }}
                entidad="Usuario"
            />
        );

        expect(screen.getByText(/cambios registrados en usuario/i)).toBeInTheDocument();

        // Encabezados de la tabla
        expect(screen.getByRole("columnheader", { name: "Campo" })).toBeInTheDocument();
        expect(screen.getByRole("columnheader", { name: "Antes" })).toBeInTheDocument();
        expect(screen.getByRole("columnheader", { name: "Después" })).toBeInTheDocument();

        // Celdas de cambios
        expect(screen.getByRole("cell", { name: "rolId" })).toBeInTheDocument();
        expect(screen.getByRole("cell", { name: "R07" })).toBeInTheDocument();
        expect(screen.getByRole("cell", { name: "R03" })).toBeInTheDocument();

        expect(screen.getByRole("cell", { name: "estado" })).toBeInTheDocument();
        expect(screen.getByRole("cell", { name: "true" })).toBeInTheDocument();
        expect(screen.getByRole("cell", { name: "false" })).toBeInTheDocument();

        expect(screen.getByRole("cell", { name: "bodegaIds" })).toBeInTheDocument();
        expect(screen.getByRole("cell", { name: "b1" })).toBeInTheDocument();
        expect(screen.getByRole("cell", { name: "b1, b2" })).toBeInTheDocument();
    });
});
