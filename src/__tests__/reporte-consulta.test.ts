import { describe, expect, it } from "vitest";

// lib
import { condicionMovimientosSql } from "@/shared/lib/inventario-alcance-sql";

// utils
import { construirArbol } from "@/modules/reporte/utils/arbol";
import { columnasDelPeriodo } from "@/modules/reporte/utils/periodo";
import {
    armarFilasReporte,
    construirClavesReporte,
    construirConsumoReporte,
    construirConteoReporte,
    type ConsultaReporte
} from "@/modules/reporte/utils/reporte-consulta";

function plano(sql: { sql: string }): string {
    return sql.sql.replace(/\s+/g, " ");
}

const CONSULTA: ConsultaReporte = {
    filtroMovimientos: { centroId: { in: ["c1"] }, bodegaId: { in: ["b1", "b2"] } },
    bodegaIdsStock: ["b1", "b2"],
    gte: new Date("2026-01-01T00:00:00.000Z"),
    lt: new Date("2027-01-01T00:00:00.000Z"),
    busqueda: ""
};

describe("condicionMovimientosSql", () => {
    it("traduce el filtro de alcance a SQL sobre el alias o", () => {
        expect(plano(condicionMovimientosSql({}))).toBe("1 = 1");

        const condicion = condicionMovimientosSql({ centroId: { in: ["c1"] }, bodegaId: "b1" });
        expect(plano(condicion)).toBe("1 = 1 AND o.ID_Centro IN (?) AND o.ID_Bodega = ?");
        expect(condicion.values).toEqual(["c1", "b1"]);
    });
});

describe("consultas del reporte", () => {
    it("une productos con stock o con consumo del período, excluyendo traspasos", () => {
        const consulta = construirClavesReporte(CONSULTA, { skip: 0, tamano: 50 });
        const texto = plano(consulta);

        expect(texto).toContain("WITH consumo AS");
        expect(texto).toContain("o.Tipo_Salida <> ?");
        expect(texto).toContain("o.Fecha >= ? AND o.Fecha < ?");
        expect(texto).toContain("UNION SELECT productoId, bodegaId FROM consumo");
        expect(texto).toContain("ORDER BY c.Nombre, b.Bodega, p.Descripcion");
        expect(texto).toContain("LIMIT ? OFFSET ?");
        expect(consulta.values).toEqual(expect.arrayContaining(["A otra bodega", "c1", "b1", "b2", 50, 0]));
    });

    it("sin paginación (exportar) no agrega LIMIT", () => {
        expect(plano(construirClavesReporte(CONSULTA, null))).not.toContain("LIMIT");
    });

    it("cuenta con la misma búsqueda", () => {
        const consulta = construirConteoReporte({ ...CONSULTA, busqueda: "guante" });
        expect(plano(consulta)).toContain("SELECT COUNT(*) AS total");
        expect(plano(consulta)).toContain("p.Descripcion LIKE ?");
        expect(consulta.values).toContain("%guante%");
    });

    it("sin bodegas de stock usa una condición vacía en vez de IN ()", () => {
        expect(plano(construirConteoReporte({ ...CONSULTA, bodegaIdsStock: [] }))).toContain("WHERE 1 = 0");
    });

    it("pide el consumo mensual solo de los pares visibles", () => {
        const consulta = construirConsumoReporte(CONSULTA, [{ productoId: 7, bodegaId: "b1" }]);
        expect(plano(consulta)).toContain("DATE_FORMAT(o.Fecha, '%Y-%m') AS mes");
        expect(plano(consulta)).toContain("WHERE (x.productoId, x.bodegaId) IN ((?, ?))");
        expect(consulta.values).toEqual(expect.arrayContaining([7, "b1"]));
    });
});

describe("armarFilasReporte", () => {
    it("pone 0 en meses sin consumo y suma el período", () => {
        const columnas = columnasDelPeriodo("2026-01", "2026-03");
        const filas = armarFilasReporte(
            [{
                productoId: 7,
                bodegaId: "b1",
                centro: "CESFAM Barón",
                bodega: "Farmacia",
                descripcion: "Guantes M",
                linea: "INSUMOS",
                stockActual: BigInt(40),
                ultimaActualizacion: new Date("2026-10-28T12:00:00.000Z")
            }],
            [
                { productoId: 7, bodegaId: "b1", mes: "2026-01", cantidad: BigInt(5) },
                { productoId: 7, bodegaId: "b1", mes: "2026-03", cantidad: 10 },
                { productoId: 8, bodegaId: "b1", mes: "2026-01", cantidad: 99 }
            ],
            columnas
        );

        expect(filas).toEqual([{
            centro: "CESFAM Barón",
            bodega: "Farmacia",
            bodegaId: "b1",
            productoId: 7,
            descripcion: "Guantes M",
            linea: "INSUMOS",
            stockActual: 40,
            ultimaActualizacion: new Date("2026-10-28T12:00:00.000Z"),
            meses: { "2026-01": 5, "2026-02": 0, "2026-03": 10 },
            consumoPeriodo: 15
        }]);
    });
});

describe("construirArbol", () => {
    it("agrupa las bodegas bajo su centro", () => {
        expect(construirArbol(
            [{ id: "c1", nombre: "Barón" }, { id: "c2", nombre: "Placeres" }],
            [{ id: "b1", nombre: "Farmacia", centroId: "c1" }, { id: "b2", nombre: "Dental", centroId: "c2" }]
        )).toEqual([
            { id: "c1", nombre: "Barón", bodegas: [{ id: "b1", nombre: "Farmacia" }] },
            { id: "c2", nombre: "Placeres", bodegas: [{ id: "b2", nombre: "Dental" }] }
        ]);
    });
});
