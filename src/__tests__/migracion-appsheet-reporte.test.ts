import { describe, expect, it } from "vitest";

// migracion
import { leerOpciones, nombreBase, validarOpciones } from "../../prisma/scripts/migracion-appsheet/opciones";
import { aCsv, archivosReporte, construirResumen, validarCarga, type DestinoCargado } from "../../prisma/scripts/migracion-appsheet/reporte";
import { transformarTodo } from "../../prisma/scripts/migracion-appsheet/transformar";
import { TABLAS, type DatosOrigen, type Tabla } from "../../prisma/scripts/migracion-appsheet/tipos";

function origenMinimo(): DatosOrigen {
    return {
        centros: [{ ID_Centro: "c1", Nombre: "Cesfam", Estado: 1 }],
        bodegas: [{ ID_Bodega: "b1", Bodega: "Farmacia", ID_Centro: "c1", Estado: 1 }],
        unidades: [],
        productos: [{ ID_Product: 10, Linea: "Aseo", Descripcion: "Cloro" }],
        usuarios: [],
        entradas: [],
        entradaDetalles: [],
        salidas: [],
        salidaDetalles: [],
        stock: [
            { ID_Stock: "s1", ID_Product: 10, ID_Bodega: "b1", Cantidad_Disponible: 4, Fecha_Ultima_Actualizacion: "2026-10-01", StockMinimo: 0, Lote: "L1", Fecha_Caducidad: "2027-01-31" },
            { ID_Stock: "s2", ID_Product: 99, ID_Bodega: "b1", Cantidad_Disponible: 1, Fecha_Ultima_Actualizacion: "2026-10-01", StockMinimo: 0, Lote: "L1", Fecha_Caducidad: "2027-01-31" }
        ]
    };
}

const MIGRACION = transformarTodo(origenMinimo(), { usuariosDestino: [], ahora: new Date(Date.UTC(2026, 9, 29)) });

function destinoCompleto(): DestinoCargado {
    const ids = Object.fromEntries(
        TABLAS.map((tabla) => [tabla, (MIGRACION[tabla].aceptados as { id: string | number }[]).map((fila) => String(fila.id))])
    ) as Record<Tabla, string[]>;
    return { ids, stock: MIGRACION.Stock.aceptados.map((fila) => ({ id: fila.id, cantidadDisponible: fila.cantidadDisponible })) };
}

describe("reporte", () => {
    it("construirResumen cuenta por tabla en el orden de TABLAS", () => {
        const resumen = construirResumen(MIGRACION, { Stock: 1 });
        expect(resumen.map((r) => r.tabla)).toEqual([...TABLAS]);
        expect(resumen.find((r) => r.tabla === "Stock")).toEqual({ tabla: "Stock", leidos: 2, aceptados: 1, rechazados: 1, advertencias: 0, insertados: 1 });
        expect(resumen.find((r) => r.tabla === "Centro")?.insertados).toBe(0);
        expect(construirResumen(MIGRACION, null)[0].insertados).toBeNull();
    });

    it("aCsv escapa comillas", () => {
        expect(aCsv([{ tabla: "Stock", clave: "s2", regla: "producto_inexistente", detalle: 'Producto "99"' }])).toBe(
            'clave,regla,detalle\n"s2","producto_inexistente","Producto ""99"""\n'
        );
    });

    it("archivosReporte incluye resumen, rechazos no vacíos, reasignaciones y validación", () => {
        const archivos = archivosReporte(MIGRACION, construirResumen(MIGRACION, null), []);
        expect(Object.keys(archivos).sort()).toEqual(["reasignaciones.json", "rechazos-Stock.csv", "resumen.json", "validacion.json"]);
        expect(Object.keys(archivosReporte(MIGRACION, [], null))).not.toContain("validacion.json");
    });

    it("validarCarga no informa diferencias si el destino coincide", () => {
        expect(validarCarga(MIGRACION, destinoCompleto())).toEqual([]);
    });

    it("validarCarga informa filas faltantes y cantidades distintas", () => {
        const destino = destinoCompleto();
        destino.ids.Centro = [];
        destino.stock = [{ id: "s1", cantidadDisponible: 3 }];
        expect(validarCarga(MIGRACION, destino)).toEqual([
            { tabla: "Centro", clave: "c1", detalle: "Fila aceptada que no está en el destino" },
            { tabla: "Stock", clave: "s1", detalle: "Cantidad esperada 4, obtenida 3" }
        ]);
    });
});

describe("opciones", () => {
    it("leerOpciones interpreta banderas y valores por defecto", () => {
        expect(leerOpciones([], "M")).toEqual({ ejecutar: false, vaciar: null, salida: "migracion-appsheet-M", origenEnv: ".env.migracion" });
        expect(leerOpciones(["--ejecutar", "--vaciar=inventario_cmv", "--salida=/tmp/r", "--origen-env=/srv/.env.migracion"], "M")).toEqual({
            ejecutar: true,
            vaciar: "inventario_cmv",
            salida: "/tmp/r",
            origenEnv: "/srv/.env.migracion"
        });
    });

    it("leerOpciones rechaza argumentos mal formados", () => {
        expect(() => leerOpciones(["--ejecutar", "--vaciar", "inventario_cmv"], "M")).toThrow(/--vaciar/);
        expect(() => leerOpciones(["--vaciar"], "M")).toThrow(/--vaciar/);
        expect(() => leerOpciones(["--vaciar="], "M")).toThrow(/--vaciar=/);
        expect(() => leerOpciones(["--ejecutar=true"], "M")).toThrow(/--ejecutar=true/);
        expect(() => leerOpciones(["--foo"], "M")).toThrow(/--foo/);
    });

    it("nombreBase extrae la base de la URL", () => {
        expect(nombreBase("mysql://u:p@localhost:3306/inventario_cmv?connection_limit=1")).toBe("inventario_cmv");
    });

    it("validarOpciones exige --ejecutar y el nombre exacto de la base para vaciar", () => {
        const base = { ejecutar: true, vaciar: "inventario_cmv", salida: "x", origenEnv: ".env.migracion" };
        expect(() => validarOpciones(base, "inventario_cmv")).not.toThrow();
        expect(() => validarOpciones({ ...base, ejecutar: false }, "inventario_cmv")).toThrow(/--vaciar exige --ejecutar/);
        expect(() => validarOpciones({ ...base, vaciar: "otra" }, "inventario_cmv")).toThrow(/inventario_cmv/);
        expect(() => validarOpciones({ ...base, vaciar: null, ejecutar: false }, "inventario_cmv")).not.toThrow();
    });

    it("validarOpciones rechaza una base de destino vacía", () => {
        const base = { ejecutar: true, vaciar: null, salida: "x", origenEnv: ".env.migracion" };
        expect(() => validarOpciones(base, "")).toThrow(/base de destino/);
    });
});
