import { describe, expect, it } from "vitest";

// utils
import { leerFiltrosProductos, parametrosProductos } from "@/modules/productos/utils/productos-filtros";

describe("leerFiltrosProductos", () => {
    it("usa valores neutros y página 1 cuando no recibe parámetros", () => {
        expect(leerFiltrosProductos()).toEqual({
            id: null,
            linea: "",
            estado: "todos",
            descripcion: "",
            pagina: 1,
            advertencias: []
        });
    });

    it("recorta filtros válidos y toma el primer valor repetido", () => {
        expect(leerFiltrosProductos({
            id: [" 42 ", "99"],
            linea: [" Aseo ", "Farmacia"],
            estado: " activo ",
            descripcion: "  Guantes de nitrilo  ",
            pagina: "3"
        }, ["Aseo", "Farmacia"])).toEqual({
            id: 42,
            linea: "Aseo",
            estado: "activo",
            descripcion: "Guantes de nitrilo",
            pagina: 3,
            advertencias: []
        });
    });

    it("vuelve a la página 1 cuando el valor no es un entero positivo", () => {
        expect(leerFiltrosProductos({ pagina: "2.5" }).pagina).toBe(1);
        expect(leerFiltrosProductos({ pagina: "no-es-un-numero" }).pagina).toBe(1);
    });

    it("neutraliza un ID menor que 1 y registra una advertencia", () => {
        const filtros = leerFiltrosProductos({ id: "0" });

        expect(filtros.id).toBeNull();
        expect(filtros.advertencias).toEqual([
            "El ID del producto debe ser un entero mayor que cero; se ignora el filtro."
        ]);
    });

    it("neutraliza un estado desconocido y registra una advertencia", () => {
        const filtros = leerFiltrosProductos({ estado: "pendiente" });

        expect(filtros.estado).toBe("todos");
        expect(filtros.advertencias).toEqual([
            "El estado del producto no es válido; se muestran todos los estados."
        ]);
    });

    it("neutraliza una línea desconocida entre las líneas permitidas", () => {
        const filtros = leerFiltrosProductos({ linea: "Desconocida" }, ["Aseo", "Farmacia"]);

        expect(filtros.linea).toBe("");
        expect(filtros.advertencias).toEqual([
            "La línea del producto no es válida; se muestran todas las líneas."
        ]);
    });

    it("registra todas las advertencias sin romper los demás filtros", () => {
        const filtros = leerFiltrosProductos({
            id: "-4",
            linea: "Desconocida",
            estado: "pendiente",
            descripcion: "  vendas  "
        }, ["Aseo"]);

        expect(filtros).toMatchObject({
            id: null,
            linea: "",
            estado: "todos",
            descripcion: "vendas",
            pagina: 1
        });
        expect(filtros.advertencias).toHaveLength(3);
    });
});

describe("parametrosProductos", () => {
    it("omite filtros neutros y nunca conserva la página", () => {
        expect(parametrosProductos({
            id: null,
            linea: "",
            estado: "todos",
            descripcion: "",
            pagina: 6,
            advertencias: ["aviso"]
        })).toEqual({});
    });

    it("conserva únicamente los filtros activos", () => {
        expect(parametrosProductos({
            id: 42,
            linea: "Aseo",
            estado: "activo",
            descripcion: "vendas",
            pagina: 2,
            advertencias: []
        })).toEqual({
            id: 42,
            linea: "Aseo",
            estado: "activo",
            descripcion: "vendas"
        });
    });
});
