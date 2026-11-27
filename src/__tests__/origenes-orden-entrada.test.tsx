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
const bodegaClinica = { id: "bodega-1", nombre: "Farmacia", centroId: "centro-1", tipo: "CLINICA" as const, estado: true };
const bodegaAseo = { id: "bodega-2", nombre: "Aseo", centroId: "centro-1", tipo: "ASEO" as const, estado: true };
const productos = [
    { id: 1, linea: "ASEO", descripcion: "Detergente", estado: true },
    { id: 2, linea: "CLINICO", descripcion: "Guantes", estado: true },
    { id: 3, linea: "MEDICAMENTOS", descripcion: "Paracetamol", estado: true }
];

function renderizarFormulario(): void {
    render(
        <OrdenEntradaForm
            centros={[centro]}
            bodegas={[bodegaClinica, bodegaAseo]}
            productos={productos}
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

describe("OrdenEntradaForm — compatibilidad entre bodega y producto", () => {
    it("muestra solo productos de aseo al seleccionar una bodega de aseo", () => {
        renderizarFormulario();

        fireEvent.change(screen.getByLabelText("Bodega"), { target: { value: "bodega-2" } });
        fireEvent.click(screen.getByRole("combobox", { name: "Producto" }));

        expect(screen.getByText("Detergente — ASEO (#1)")).toBeInTheDocument();
        expect(screen.queryByText("Guantes — CLINICO (#2)")).not.toBeInTheDocument();
        expect(screen.queryByText("Paracetamol — MEDICAMENTOS (#3)")).not.toBeInTheDocument();
    });

    it("excluye solo la línea exacta ASEO en una bodega clínica", () => {
        renderizarFormulario();

        fireEvent.click(screen.getByRole("combobox", { name: "Producto" }));

        expect(screen.queryByText("Detergente — ASEO (#1)")).not.toBeInTheDocument();
        expect(screen.getByText("Guantes — CLINICO (#2)")).toBeInTheDocument();
        expect(screen.getByText("Paracetamol — MEDICAMENTOS (#3)")).toBeInTheDocument();
    });

    it("elimina el producto enviado al cambiar a una bodega de distinto tipo", () => {
        renderizarFormulario();

        fireEvent.click(screen.getByRole("combobox", { name: "Producto" }));
        fireEvent.click(screen.getByText("Guantes — CLINICO (#2)"));
        const productoId = document.querySelector<HTMLInputElement>("input[name='productoId']");
        expect(productoId).toHaveValue("2");

        fireEvent.change(screen.getByLabelText("Bodega"), { target: { value: "bodega-2" } });

        expect(document.querySelector<HTMLInputElement>("input[name='productoId']")).toHaveValue("");
        expect(screen.getByRole("combobox", { name: "Producto" })).toHaveTextContent("Seleccione producto del catálogo...");
    });
});
