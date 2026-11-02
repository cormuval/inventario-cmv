import { describe, expect, it } from "vitest";

// utils
import {
    construirConsultaStock,
    construirConteoStock,
    mapearStockConsolidado,
    patronLike,
    type FiltrosConsultaStock
} from "@/modules/stock/utils/stock-consulta";

const BASE: FiltrosConsultaStock = {
    bodegaIds: ["b1", "b2"],
    busqueda: "",
    bajoMinimo: false,
    porCaducar: false,
    sort: "producto",
    direction: "asc",
    hoy: "2026-10-30"
};

function sqlPlano(sql: { sql: string }): string {
    return sql.sql.replace(/\s+/g, " ");
}

describe("patronLike", () => {
    it("escapa comodines de LIKE", () => {
        expect(patronLike("50%_x")).toBe("%50\\%\\_x%");
    });
});

describe("construirConsultaStock", () => {
    it("agrupa por producto y bodega con la regla de visibilidad y pagina", () => {
        const consulta = construirConsultaStock(BASE, { skip: 50, tamano: 50 });
        const texto = sqlPlano(consulta);

        expect(texto).toContain("GROUP BY s.ID_Product, s.ID_Bodega");
        expect(texto).toContain("HAVING lotesConExistencia > 0 OR lotes = 1");
        expect(texto).toContain("ORDER BY p.Descripcion ASC");
        expect(texto).toContain("LIMIT ? OFFSET ?");
        expect(consulta.values).toEqual(expect.arrayContaining(["b1", "b2", 50]));
    });

    it("busca por descripción o por código numérico", () => {
        const porTexto = construirConsultaStock({ ...BASE, busqueda: "guante" }, { skip: 0, tamano: 50 });
        expect(sqlPlano(porTexto)).toContain("p.Descripcion LIKE ?");
        expect(porTexto.values).toContain("%guante%");

        const porCodigo = construirConsultaStock({ ...BASE, busqueda: "123" }, { skip: 0, tamano: 50 });
        expect(sqlPlano(porCodigo)).toContain("(p.Descripcion LIKE ? OR p.ID_Product = ?)");
        expect(porCodigo.values).toContain(123);
    });

    it("aplica línea, bajo mínimo y por caducar", () => {
        const consulta = construirConsultaStock({ ...BASE, linea: "DENTAL", bajoMinimo: true, porCaducar: true }, { skip: 0, tamano: 50 });
        const texto = sqlPlano(consulta);

        expect(texto).toContain("p.Linea = ?");
        expect(texto).toContain("g.cantidad > 0 AND g.cantidad <= CEIL(g.cantidad * 0.1)");
        expect(texto).toContain("DATEDIFF(g.caducidadReal, ?) BETWEEN 1 AND ?");
        expect(consulta.values).toEqual(expect.arrayContaining(["DENTAL", "2026-10-30", 30, "2099-12-31"]));
    });

    it("ordena por alerta con el mismo peso que la vista", () => {
        const texto = sqlPlano(construirConsultaStock({ ...BASE, sort: "alerta", direction: "desc" }, { skip: 0, tamano: 50 }));
        expect(texto).toContain("ORDER BY CASE WHEN g.cantidad <= 0 THEN 0");
        expect(texto).toContain("END DESC");
    });
});

describe("construirConteoStock", () => {
    it("cuenta sobre el mismo agrupado y filtros, sin LIMIT", () => {
        const texto = sqlPlano(construirConteoStock({ ...BASE, linea: "DENTAL" }));
        expect(texto).toContain("SELECT COUNT(*) AS total");
        expect(texto).toContain("p.Linea = ?");
        expect(texto).not.toContain("LIMIT");
    });
});

describe("mapearStockConsolidado", () => {
    const hoy = new Date(2026, 9, 30);

    it("arma la vista con lotes visibles, mínimo y alerta", () => {
        const [fila] = mapearStockConsolidado(
            [{
                productoId: 7,
                bodegaId: "b1",
                productoDescripcion: "Guantes M",
                linea: "INSUMOS",
                bodegaNombre: "Farmacia",
                centroId: "c1",
                centroNombre: "CESFAM Barón",
                cantidad: BigInt(30),
                caducidadMinima: new Date(2026, 10, 15)
            }],
            [
                { id: "s2", productoId: 7, bodegaId: "b1", lote: "B", fechaCaducidad: new Date(2027, 0, 1), cantidadDisponible: 20 },
                { id: "s1", productoId: 7, bodegaId: "b1", lote: "A", fechaCaducidad: new Date(2026, 10, 15), cantidadDisponible: 10 },
                { id: "s3", productoId: 7, bodegaId: "b1", lote: "C", fechaCaducidad: new Date(2026, 0, 1), cantidadDisponible: 0 }
            ],
            hoy
        );

        expect(fila).toMatchObject({
            id: "b1:7",
            cantidadDisponible: 30,
            stockMinimo: 3,
            alerta: "caducidad_proxima",
            diasCaducidadMinimos: 16
        });
        expect(fila.lotes.map((lote) => lote.lote)).toEqual(["A", "B"]);
    });
});
