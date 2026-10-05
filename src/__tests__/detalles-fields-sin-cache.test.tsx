import React from "react";
import { render, screen, fireEvent, within } from "@testing-library/react";
import { describe, expect, it } from "vitest";

// components
import { OrdenSalidaDetallesField } from "@/modules/orden-salida/components/orden-salida-detalles-field";
import { OrdenEntradaDetallesField } from "@/modules/orden-entrada/components/orden-entrada-detalles-field";

describe("Estandarización de Selectores y Erradicación de Datalist / Caché", () => {
    describe("OrdenSalidaDetallesField", () => {
        const mockStocks = [
            {
                id: 1,
                bodegaId: "bodega-1",
                productoId: 101,
                lote: "LOT-A1",
                cantidadDisponible: 50,
                cantidadReservada: 0,
                fechaCaducidad: new Date("2028-12-31T00:00:00.000Z"),
                createdAt: new Date(),
                updatedAt: new Date(),
                producto: { descripcion: "PARACETAMOL 500 MG" },
                bodega: { nombre: "Bodega Principal" }
            },
            {
                id: 2,
                bodegaId: "bodega-1",
                productoId: 102,
                lote: "LOT-EXP",
                cantidadDisponible: 20,
                cantidadReservada: 0,
                fechaCaducidad: new Date("2020-01-01T00:00:00.000Z"), // Vencido
                createdAt: new Date(),
                updatedAt: new Date(),
                producto: { descripcion: "AMOXICILINA 500 MG" },
                bodega: { nombre: "Bodega Principal" }
            },
            {
                id: 3,
                bodegaId: "bodega-2", // Otra bodega
                productoId: 103,
                lote: "LOT-B1",
                cantidadDisponible: 15,
                cantidadReservada: 0,
                fechaCaducidad: new Date("2028-05-15T00:00:00.000Z"),
                createdAt: new Date(),
                updatedAt: new Date(),
                producto: { descripcion: "IBUPROFENO 400 MG" },
                bodega: { nombre: "Otra Bodega" }
            }
        ];

        it("no renderiza ningún elemento <datalist> ni atributos list en inputs", () => {
            const { container } = render(
                <OrdenSalidaDetallesField
                    bodegaId="bodega-1"
                    stocks={mockStocks}
                    tipoSalida="Consumo Interno"
                />
            );

            expect(container.querySelector("datalist")).toBeNull();
            expect(container.querySelector("input[list]")).toBeNull();
        });

        it("filtra lotes caducados y bodegas distintas para Consumo Interno", () => {
            render(
                <OrdenSalidaDetallesField
                    bodegaId="bodega-1"
                    stocks={mockStocks}
                    tipoSalida="Consumo Interno"
                />
            );

            const select = screen.getByRole("combobox");
            expect(select).toBeInTheDocument();

            const options = within(select).getAllByRole("option");
            // Placeholder + 1 stock válido (bodega-1 y no vencido)
            expect(options).toHaveLength(2);
            expect(options[0]).toHaveTextContent("Seleccione stock disponible...");
            expect(options[1]).toHaveTextContent("[Disp: 50 un.] PARACETAMOL 500 MG | Lote: LOT-A1");
        });

        it("muestra lotes caducados con prefijo [CADUCADO] cuando el tipo de salida es Merma", () => {
            render(
                <OrdenSalidaDetallesField
                    bodegaId="bodega-1"
                    stocks={mockStocks}
                    tipoSalida="Merma"
                />
            );

            const select = screen.getByRole("combobox");
            const options = within(select).getAllByRole("option");
            // Placeholder + 2 stocks de bodega-1 (incluyendo el vencido)
            expect(options).toHaveLength(3);
            expect(within(select).getByRole("option", { name: /\[CADUCADO\]/i })).toBeInTheDocument();
            expect(within(select).getByRole("option", { name: /AMOXICILINA 500 MG/i })).toBeInTheDocument();
        });

        it("al seleccionar un stock, actualiza los campos ocultos y los indicadores de disponible y max", () => {
            const { container } = render(
                <OrdenSalidaDetallesField
                    bodegaId="bodega-1"
                    stocks={mockStocks}
                    tipoSalida="Consumo Interno"
                />
            );

            const select = screen.getByRole("combobox");
            // Seleccionar el stock disponible de PARACETAMOL
            const optionVal = (within(select).getAllByRole("option")[1] as HTMLOptionElement).value;
            fireEvent.change(select, { target: { value: optionVal } });

            // Verificar inputs ocultos
            const inputProductoId = container.querySelector("input[name='productoId']") as HTMLInputElement;
            const inputLote = container.querySelector("input[name='lote']") as HTMLInputElement;
            const inputFechaCaducidad = container.querySelector("input[name='fechaCaducidad']") as HTMLInputElement;
            const inputCantidad = container.querySelector("input[name='cantidad']") as HTMLInputElement;

            expect(inputProductoId.value).toBe("101");
            expect(inputLote.value).toBe("LOT-A1");
            expect(inputFechaCaducidad.value).toBe("2028-12-31");
            expect(inputCantidad.max).toBe("50");

            // Indicador de disponible visible en pantalla
            expect(screen.getByText("50")).toBeInTheDocument();
        });
    });

    describe("OrdenEntradaDetallesField", () => {
        const mockProductos = [
            {
                id: 104,
                descripcion: "PARACETAMOL 500 MG COMPRIMIDO",
                linea: "Medicamentos",
                categoria: "Analgésicos",
                unidadMedidaId: 1,
                unidadId: 1,
                unidad: "COMPRIMIDO",
                codigoCenabast: null,
                precioReferencial: 50,
                stockMinimo: 100,
                estado: true,
                createdAt: new Date(),
                updatedAt: new Date()
            },
            {
                id: 205,
                descripcion: "JERINGA 5 ML CON AGUJA",
                linea: "Insumos Médicos",
                categoria: "Material Descartable",
                unidadMedidaId: 2,
                unidadId: 2,
                unidad: "UNIDAD",
                codigoCenabast: null,
                precioReferencial: 120,
                stockMinimo: 50,
                estado: true,
                createdAt: new Date(),
                updatedAt: new Date()
            }
        ];

        it("no renderiza ningún elemento <datalist> ni atributos list en inputs", () => {
            const { container } = render(
                <OrdenEntradaDetallesField productos={mockProductos} />
            );

            expect(container.querySelector("datalist")).toBeNull();
            expect(container.querySelector("input[list]")).toBeNull();
        });

        it("renderiza el selector estándar con las opciones formateadas con descripción, línea e id", () => {
            render(<OrdenEntradaDetallesField productos={mockProductos} />);

            const select = screen.getByRole("combobox");
            expect(select).toBeInTheDocument();

            const options = within(select).getAllByRole("option");
            expect(options).toHaveLength(3); // placeholder + 2 productos
            expect(options[0]).toHaveTextContent("Seleccione producto del catálogo...");
            expect(options[1]).toHaveTextContent("PARACETAMOL 500 MG COMPRIMIDO — Medicamentos (#104)");
            expect(options[2]).toHaveTextContent("JERINGA 5 ML CON AGUJA — Insumos Médicos (#205)");
        });

        it("al seleccionar un producto, actualiza el input oculto productoId y el indicador de categoría", () => {
            const { container } = render(
                <OrdenEntradaDetallesField productos={mockProductos} />
            );

            const select = screen.getByRole("combobox");
            fireEvent.change(select, { target: { value: "104" } });

            const inputProductoId = container.querySelector("input[name='productoId']") as HTMLInputElement;
            expect(inputProductoId.value).toBe("104");

            // Verifica que la categoría se refleja en pantalla
            expect(screen.getByText("Medicamentos")).toBeInTheDocument();
        });
    });
});
