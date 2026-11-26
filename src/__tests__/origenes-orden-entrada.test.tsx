import { act, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

// actions
import { crearOrdenEntrada } from "@/modules/orden-entrada/actions/orden-entrada.action";

// components
import { OrdenEntradaForm } from "@/modules/orden-entrada/components/orden-entrada-form";

// constants
import { ORIGENES_ORDEN_ENTRADA } from "@/modules/orden-entrada/constants/origenes-orden-entrada";

// schemas
import { crearOrdenEntradaSchema } from "@/modules/orden-entrada/schemas/orden-entrada.schema";

vi.mock("@/modules/orden-entrada/actions/orden-entrada.action", () => ({
    crearOrdenEntrada: vi.fn()
}));

const centro = { id: "centro-1", nombre: "CESFAM Barón", estado: true };
const bodega = { id: "bodega-1", nombre: "Farmacia", centroId: "centro-1", tipo: "CLINICA" as const, estado: true };
const producto = { id: 1, linea: "Medicamentos", descripcion: "Paracetamol", estado: true };

function renderizarFormulario(): void {
    render(
        <OrdenEntradaForm
            centros={[centro]}
            bodegas={[bodega]}
            productos={[producto]}
            centroId="centro-1"
            bodegaId="bodega-1"
            puedeFiltrarCentro
        />
    );
}

describe("Catálogo de orígenes de órdenes de entrada", () => {
    const origenesEsperados = [
        "Drogueria",
        "Desde Otros Centros",
        "Otros Servicios",
        "Bodega Central",
        "Fondo Global Menor"
    ];

    const crearInputBase = (origen: string) => ({
        fecha: new Date(),
        origen,
        guiaDespacho: "GD-001",
        centroId: "centro-1",
        bodegaId: "bodega-1",
        detalles: [{
            productoId: 1,
            fechaCaducidad: new Date(Date.now() + 24 * 60 * 60 * 1000),
            cantidad: 1,
            lote: "LOT-001"
        }]
    });

    it("expone exactamente los cinco orígenes permitidos", () => {
        expect(ORIGENES_ORDEN_ENTRADA).toEqual(origenesEsperados);
    });

    it.each(origenesEsperados)("acepta el origen %s", (origen) => {
        const result = crearOrdenEntradaSchema.safeParse(crearInputBase(origen));

        expect(result.success).toBe(true);
    });

    it("rechaza un origen fuera del catálogo", () => {
        const result = crearOrdenEntradaSchema.safeParse(crearInputBase("Bodega inventada"));

        expect(result.success).toBe(false);
    });
});

describe("OrdenEntradaForm — selector de origen", () => {
    beforeEach(() => {
        vi.clearAllMocks();
    });

    it("presenta los cinco orígenes permitidos con Drogueria seleccionada", () => {
        renderizarFormulario();

        const selectorOrigen = screen.getByLabelText("Origen");
        const opciones = Array.from(selectorOrigen.querySelectorAll("option")).map((opcion) => ({
            texto: opcion.textContent,
            valor: opcion.value
        }));

        expect(opciones).toEqual([
            { texto: "Drogueria", valor: "Drogueria" },
            { texto: "Desde Otros Centros", valor: "Desde Otros Centros" },
            { texto: "Otros Servicios", valor: "Otros Servicios" },
            { texto: "Bodega Central", valor: "Bodega Central" },
            { texto: "Fondo Global Menor", valor: "Fondo Global Menor" }
        ]);
        expect(selectorOrigen).toHaveValue("Drogueria");
    });

    it("conserva el origen válido cuando recibe un valor ajeno al catálogo", () => {
        renderizarFormulario();

        const selectorOrigen = screen.getByLabelText("Origen");
        fireEvent.change(selectorOrigen, { target: { value: "Bodega Central" } });
        expect(selectorOrigen).toHaveValue("Bodega Central");

        fireEvent.change(selectorOrigen, { target: { value: "Origen no permitido" } });

        expect(selectorOrigen).toHaveValue("Bodega Central");
    });

    it("restablece el origen a Drogueria tras registrar exitosamente una entrada", async () => {
        vi.mocked(crearOrdenEntrada).mockResolvedValue({ ok: true, message: "Orden de entrada registrada." });
        renderizarFormulario();

        const selectorOrigen = screen.getByLabelText("Origen");
        fireEvent.change(selectorOrigen, { target: { value: "Bodega Central" } });
        expect(selectorOrigen).toHaveValue("Bodega Central");

        fireEvent.submit(selectorOrigen.closest("form") as HTMLFormElement);

        await waitFor(() => expect(selectorOrigen).toHaveValue("Drogueria"));
    });

    it("restablece el origen tras cada uno de dos registros exitosos consecutivos", async () => {
        const resultadoExitoso = {
            ok: true,
            message: "Orden de entrada registrada."
        };
        const resolverResultados: Array<(resultado: typeof resultadoExitoso) => void> = [];
        vi.mocked(crearOrdenEntrada).mockImplementation(() => new Promise((resolve) => {
            resolverResultados.push(resolve);
        }));
        renderizarFormulario();

        const formulario = screen.getByLabelText("Origen").closest("form") as HTMLFormElement;
        const selectorBodega = screen.getByLabelText("Bodega");
        const selectorOrigen = screen.getByLabelText("Origen");

        fireEvent.change(selectorOrigen, { target: { value: "Bodega Central" } });
        fireEvent.submit(formulario);
        await waitFor(() => expect(resolverResultados).toHaveLength(1));
        await act(async () => resolverResultados[0]({ ...resultadoExitoso }));
        await waitFor(() => expect(selectorOrigen).toHaveValue("Drogueria"));

        fireEvent.change(selectorBodega, { target: { value: "bodega-1" } });
        fireEvent.change(selectorOrigen, { target: { value: "Bodega Central" } });
        expect(selectorOrigen).toHaveValue("Bodega Central");
        fireEvent.submit(formulario);
        await waitFor(() => expect(resolverResultados).toHaveLength(2));
        await act(async () => resolverResultados[1]({ ...resultadoExitoso }));
        fireEvent.change(screen.getByLabelText("Guia despacho"), { target: { value: "GD-002" } });

        await waitFor(() => expect(selectorOrigen).toHaveValue("Drogueria"));
        expect(crearOrdenEntrada).toHaveBeenCalledTimes(2);
    });
});
