import React from "react";
import { render, screen, fireEvent, within } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import type { Stock } from "@prisma/client";

// components
import { OrdenSalidaDetallesField } from "@/modules/orden-salida/components/orden-salida-detalles-field";
import { OrdenEntradaDetallesField } from "@/modules/orden-entrada/components/orden-entrada-detalles-field";

interface StockMock extends Stock {
    producto: {
        descripcion: string;
    };
    bodega: {
        nombre: string;
    };
}

function crearStockMock(overrides: Partial<StockMock> = {}): StockMock {
    return {
        id: "stock-1",
        productoId: 101,
        bodegaId: "bodega-1",
        cantidadDisponible: 50,
        fechaUltimaActualizacion: new Date(),
        stockMinimo: 10,
        lote: "LOT-A1",
        fechaCaducidad: new Date("2028-12-31T00:00:00.000Z"),
        producto: { descripcion: "PARACETAMOL 500 MG" },
        bodega: { nombre: "Bodega Principal" },
        ...overrides
    };
}

describe("Estandarización de Selectores y Erradicación de Datalist / Caché", () => {
    describe("OrdenSalidaDetallesField con Combobox", () => {
        const mockStocks: StockMock[] = [
            crearStockMock({
                id: "stock-1",
                bodegaId: "bodega-1",
                productoId: 101,
                lote: "LOT-A1",
                cantidadDisponible: 50,
                fechaCaducidad: new Date("2028-12-31T00:00:00.000Z"),
                producto: { descripcion: "PARACETAMOL 500 MG" }
            }),
            crearStockMock({
                id: "stock-2",
                bodegaId: "bodega-1",
                productoId: 102,
                lote: "LOT-EXP",
                cantidadDisponible: 20,
                fechaCaducidad: new Date("2020-01-01T00:00:00.000Z"), // Vencido
                producto: { descripcion: "AMOXICILINA 500 MG" }
            }),
            crearStockMock({
                id: "stock-3",
                bodegaId: "bodega-2", // Otra bodega
                productoId: 103,
                lote: "LOT-B1",
                cantidadDisponible: 15,
                fechaCaducidad: new Date("2028-05-15T00:00:00.000Z"),
                producto: { descripcion: "IBUPROFENO 400 MG" }
            })
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

            const trigger = screen.getByRole("combobox");
            expect(trigger).toBeInTheDocument();
            expect(trigger).toHaveTextContent("Seleccione stock disponible...");

            // Abrir el combobox
            fireEvent.click(trigger);

            // Solo debe mostrar stock-1 (PARACETAMOL)
            expect(screen.getByText(/PARACETAMOL 500 MG/i)).toBeInTheDocument();
            expect(screen.queryByText(/AMOXICILINA/i)).toBeNull();
            expect(screen.queryByText(/IBUPROFENO/i)).toBeNull();
        });

        it("muestra lotes caducados con prefijo [CADUCADO] cuando el tipo de salida es Merma", () => {
            render(
                <OrdenSalidaDetallesField
                    bodegaId="bodega-1"
                    stocks={mockStocks}
                    tipoSalida="Merma"
                />
            );

            const trigger = screen.getByRole("combobox");
            fireEvent.click(trigger);

            expect(screen.getByText(/\[CADUCADO\]/i)).toBeInTheDocument();
            expect(screen.getByText(/AMOXICILINA 500 MG/i)).toBeInTheDocument();
        });

        it("permite filtrar en la búsqueda por descripción del producto y por lote", () => {
            render(
                <OrdenSalidaDetallesField
                    bodegaId="bodega-1"
                    stocks={[
                        ...mockStocks,
                        crearStockMock({
                            id: "stock-4",
                            bodegaId: "bodega-1",
                            productoId: 104,
                            lote: "LOT-CLAV-99",
                            cantidadDisponible: 30,
                            fechaCaducidad: new Date("2029-01-01T00:00:00.000Z"),
                            producto: { descripcion: "CLAVULANICO 125 MG" }
                        })
                    ]}
                    tipoSalida="Consumo Interno"
                />
            );

            const trigger = screen.getByRole("combobox");
            fireEvent.click(trigger);

            const searchInput = screen.getByPlaceholderText(/Buscar por producto o lote/i);
            expect(searchInput).toBeInTheDocument();

            // Filtrar por lote
            fireEvent.change(searchInput, { target: { value: "CLAV-99" } });
            expect(screen.getByText(/CLAVULANICO 125 MG/i)).toBeInTheDocument();
            expect(screen.queryByText(/PARACETAMOL/i)).toBeNull();
        });

        it("al seleccionar un stock, actualiza los campos ocultos y los indicadores de disponible y max", () => {
            const { container } = render(
                <OrdenSalidaDetallesField
                    bodegaId="bodega-1"
                    stocks={mockStocks}
                    tipoSalida="Consumo Interno"
                />
            );

            const trigger = screen.getByRole("combobox");
            fireEvent.click(trigger);

            const optionItem = screen.getByText(/PARACETAMOL 500 MG/i);
            fireEvent.click(optionItem);

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
            expect(trigger).toHaveTextContent(/PARACETAMOL 500 MG/i);
        });
    });

    describe("OrdenEntradaDetallesField con Combobox", () => {
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

        it("permite buscar y filtrar por nombre, línea o ID en el catálogo", () => {
            render(<OrdenEntradaDetallesField productos={mockProductos} />);

            const trigger = screen.getByRole("combobox");
            expect(trigger).toHaveTextContent("Seleccione producto del catálogo...");

            fireEvent.click(trigger);

            const searchInput = screen.getByPlaceholderText(/Buscar por nombre, línea o código/i);
            expect(searchInput).toBeInTheDocument();

            // Filtrar por ID "205"
            fireEvent.change(searchInput, { target: { value: "205" } });
            expect(screen.getByText(/JERINGA 5 ML/i)).toBeInTheDocument();
            expect(screen.queryByText(/PARACETAMOL/i)).toBeNull();
        });

        it("al seleccionar un producto, actualiza el input oculto productoId y el indicador de categoría", () => {
            const { container } = render(
                <OrdenEntradaDetallesField productos={mockProductos} />
            );

            const trigger = screen.getByRole("combobox");
            fireEvent.click(trigger);

            const optionItem = screen.getByText(/PARACETAMOL 500 MG COMPRIMIDO/i);
            fireEvent.click(optionItem);

            const inputProductoId = container.querySelector("input[name='productoId']") as HTMLInputElement;
            expect(inputProductoId.value).toBe("104");

            // Verifica que la categoría se refleja en pantalla
            expect(screen.getByText("Medicamentos")).toBeInTheDocument();
            expect(trigger).toHaveTextContent(/PARACETAMOL 500 MG COMPRIMIDO/i);
        });
    });
});
