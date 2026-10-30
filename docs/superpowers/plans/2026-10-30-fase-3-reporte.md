# Fase 3 — Reporte de consumo con árbol de centros, período y Excel: plan de implementación

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Reemplazar `/reporte` por un reporte de consumo mensual al estilo "Reportes 2" de AppSheet (árbol Todo → centros → bodegas, una columna por mes, consumo del período) calculado en SQL, paginado y exportable a Excel.

**Architecture:** Funciones puras para el período (filtros de URL, columnas de meses, rango de fechas) y para armar las filas; constructores `Prisma.sql` con CTE (`consumo`, `existencias`, `claves`) que unen productos con stock o con consumo en el período y paginan en MySQL; una segunda consulta trae el consumo mensual solo de las filas visibles. La exportación es una server action que reutiliza la misma consulta sin paginar, arma el `.xlsx` con `exceljs` y lo devuelve en base64.

**Tech Stack:** Next.js 15, React 19, TypeScript strict, Prisma 6 (`$queryRaw`), MySQL 8.4 (CTE), exceljs 4.4.0, Vitest + Testing Library.

**Spec:** `docs/superpowers/specs/2026-10-30-registros-paginados-navegacion-design.md` (secciones 8, 9 fase 3 y 10).

**Requiere:** fase 1 fusionada (`paginacion.ts`, `filtros-registros.ts`, `crearFiltroMovimientosSeleccion`, componente `Paginacion`).

## Global Constraints

- Idioma español en UI, comentarios, nombres y commits. Indentación de 4 espacios.
- TypeScript strict con tipos explícitos; imports agrupados con comentarios; alias `@/`.
- Server Actions en `*.action.ts` con `"use server"`; solo exportan funciones `async` (y tipos).
- SQL crudo solo con `Prisma.sql` / `Prisma.join`; nunca interpolar texto del usuario.
- Nombres físicos: `OrdenSalida(ID_OrdenSalida, Fecha, ID_Bodega, ID_Centro, Tipo_Salida)`, `OrdenSalidaDetalle(ID_Detalle, ID_Product, Cantidad, ID_OrdenSalida)`, `Stock(ID_Product, ID_Bodega, Cantidad_Disponible, Fecha_Ultima_Actualizacion)`, `Producto(ID_Product, Linea, Descripcion)`, `Bodega(ID_Bodega, Bodega, ID_Centro)`, `Centro(ID_Centro, Nombre)`.
- El consumo excluye `Tipo_Salida = 'A otra bodega'` (regla actual del reporte).
- Período: `mesDesde`/`mesHasta` en formato `YYYY-MM`; por defecto enero a diciembre del año en curso; máximo **12 meses**.
- Filas: una por producto × bodega con stock registrado o con consumo en el período. Orden: centro, bodega, producto. Tamaño de página: **50**.
- Exportación: server action que devuelve `{ ok, message, base64, nombreArchivo }` y se descarga con `descargarArchivoBase64`; MIME `application/vnd.openxmlformats-officedocument.spreadsheetml.sheet`. Se audita con `accion: "exportar"`, `entidad: "Reporte"`.
- Verificación: `npm test`, `npx tsc --noEmit` (restaurar `tsconfig.tsbuildinfo` si cambia), `npm run lint`, `npm run build`.

## Estructura de archivos

| Archivo | Acción | Responsabilidad |
|---|---|---|
| `src/modules/reporte/utils/periodo.ts` | Crear | Filtros del reporte, columnas de meses, rango de fechas, nodo del árbol |
| `src/shared/lib/inventario-alcance-sql.ts` | Crear | `condicionMovimientosSql` (alcance como SQL sobre alias `o`) |
| `src/modules/reporte/utils/reporte-consulta.ts` | Crear | Constructores SQL y `armarFilasReporte` |
| `src/modules/reporte/utils/arbol.ts` | Crear | `construirArbol` (centros con sus bodegas) |
| `src/modules/reporte/utils/excel-reporte.ts` | Crear | `construirExcelReporte` con exceljs |
| `src/modules/reporte/actions/reporte.action.ts` | Reemplazar | `consultarReporte`, `exportarReporteExcelAction` |
| `src/modules/reporte/components/arbol-centros.tsx` | Crear | Árbol lateral (enlaces) |
| `src/modules/reporte/components/filtros-reporte.tsx` | Crear | Período, búsqueda y selector de nodo para móvil |
| `src/modules/reporte/components/reporte-tabla.tsx` | Crear | Tabla con columnas de meses |
| `src/modules/reporte/components/boton-exportar-reporte.tsx` | Crear | Botón "Exportar Excel" |
| `src/app/reporte/page.tsx` | Reemplazar | Página |
| `src/modules/auditoria/schemas/auditoria.schema.ts`, `src/modules/auditoria/components/auditoria-filtros.tsx`, `src/modules/auditoria/constants/entidades.ts` | Modificar | Acción "exportar" y entidad "Reporte" |
| `next.config.ts` | Modificar | `serverExternalPackages: ["exceljs"]` |
| `src/__tests__/alcance-acciones.test.ts` | Modificar | CA-5/CA-6 sobre el nuevo reporte |

---

### Task 1: Período del reporte

**Files:**
- Create: `src/modules/reporte/utils/periodo.ts`
- Test: `src/__tests__/reporte-periodo.test.ts`

**Interfaces:**
- Consumes: `obtenerParametro`, `leerPagina`, `leerSeleccion`, `ParametrosUrl` (fase 1, `src/shared/utils/filtros-registros.ts`); `ValorParametro` (fase 1).
- Produces:
  - `MESES_MAXIMOS_REPORTE = 12`
  - `interface FiltrosReporte { mesDesde: string; mesHasta: string; centroId?: string; bodegaId?: string; busqueda: string; pagina: number; avisos: string[] }`
  - `interface ColumnaMes { clave: string; etiqueta: string }`
  - `esMesValido(valor: string): boolean`
  - `sumarMesesClave(clave: string, meses: number): string`
  - `mesesEntre(desde: string, hasta: string): number` (inclusive)
  - `leerFiltrosReporte(params: ParametrosUrl | undefined, hoy: string): FiltrosReporte`
  - `columnasDelPeriodo(mesDesde: string, mesHasta: string): ColumnaMes[]`
  - `rangoDelPeriodo(mesDesde: string, mesHasta: string): { gte: Date; lt: Date }`
  - `parametrosDeReporte(filtros: FiltrosReporte): Record<string, ValorParametro>` (sin `pagina`)

- [ ] **Step 1: Escribir las pruebas**

`src/__tests__/reporte-periodo.test.ts`:

```ts
import { describe, expect, it } from "vitest";

// utils
import {
    columnasDelPeriodo,
    esMesValido,
    leerFiltrosReporte,
    mesesEntre,
    parametrosDeReporte,
    rangoDelPeriodo,
    sumarMesesClave
} from "@/modules/reporte/utils/periodo";

const HOY = "2026-10-30";

describe("utilidades de meses", () => {
    it("valida el formato YYYY-MM", () => {
        expect(esMesValido("2026-01")).toBe(true);
        expect(esMesValido("2026-13")).toBe(false);
        expect(esMesValido("2026-1")).toBe(false);
    });

    it("suma meses y cuenta meses inclusive", () => {
        expect(sumarMesesClave("2025-11", 2)).toBe("2026-01");
        expect(mesesEntre("2025-11", "2026-10")).toBe(12);
        expect(mesesEntre("2026-01", "2026-01")).toBe(1);
    });
});

describe("leerFiltrosReporte", () => {
    it("usa el año en curso por defecto", () => {
        expect(leerFiltrosReporte(undefined, HOY)).toEqual({
            mesDesde: "2026-01",
            mesHasta: "2026-12",
            centroId: undefined,
            bodegaId: undefined,
            busqueda: "",
            pagina: 1,
            avisos: []
        });
    });

    it("acepta un período que cruza de año", () => {
        const filtros = leerFiltrosReporte({ mesDesde: "2025-11", mesHasta: "2026-10", q: " guante ", pagina: "2" }, HOY);
        expect(filtros).toMatchObject({ mesDesde: "2025-11", mesHasta: "2026-10", busqueda: "guante", pagina: 2, avisos: [] });
    });

    it("vuelve al año en curso con aviso ante período inválido, invertido o mayor a 12 meses", () => {
        expect(leerFiltrosReporte({ mesDesde: "2026-13", mesHasta: "2026-12" }, HOY).avisos).toEqual([
            "El período ingresado no es válido; se muestra el año en curso."
        ]);
        expect(leerFiltrosReporte({ mesDesde: "2026-06", mesHasta: "2026-01" }, HOY).avisos).toEqual([
            "El mes desde es posterior al mes hasta; se muestra el año en curso."
        ]);
        const largo = leerFiltrosReporte({ mesDesde: "2025-10", mesHasta: "2026-10" }, HOY);
        expect(largo.avisos).toEqual(["El período máximo es de 12 meses; se muestra el año en curso."]);
        expect(largo.mesDesde).toBe("2026-01");
    });

    it("lee el nodo del selector móvil", () => {
        expect(leerFiltrosReporte({ nodo: "c:centro-1" }, HOY)).toMatchObject({ centroId: "centro-1", bodegaId: undefined });
        expect(leerFiltrosReporte({ nodo: "b:b1", centroId: "centro-1" }, HOY)).toMatchObject({ centroId: undefined, bodegaId: "b1" });
        expect(leerFiltrosReporte({ nodo: "" , centroId: "centro-1" }, HOY)).toMatchObject({ centroId: undefined, bodegaId: undefined });
    });
});

describe("columnas y rango", () => {
    it("genera una columna por mes con etiqueta corta", () => {
        expect(columnasDelPeriodo("2025-11", "2026-02")).toEqual([
            { clave: "2025-11", etiqueta: "nov-2025" },
            { clave: "2025-12", etiqueta: "dic-2025" },
            { clave: "2026-01", etiqueta: "ene-2026" },
            { clave: "2026-02", etiqueta: "feb-2026" }
        ]);
    });

    it("convierte el período a [primer día, primer día del mes siguiente)", () => {
        expect(rangoDelPeriodo("2026-01", "2026-12")).toEqual({
            gte: new Date("2026-01-01T00:00:00.000Z"),
            lt: new Date("2027-01-01T00:00:00.000Z")
        });
    });

    it("entrega los parámetros de URL sin página", () => {
        expect(parametrosDeReporte(leerFiltrosReporte({ q: "x", bodegaId: "b1", pagina: "3" }, HOY))).toEqual({
            mesDesde: "2026-01",
            mesHasta: "2026-12",
            centroId: undefined,
            bodegaId: "b1",
            q: "x"
        });
    });
});
```

- [ ] **Step 2: Ejecutar y verificar que fallan**

Run: `npx vitest run src/__tests__/reporte-periodo.test.ts`
Expected: FAIL — módulo inexistente.

- [ ] **Step 3: Implementar `periodo.ts`**

`src/modules/reporte/utils/periodo.ts`:

```ts
// utils
import { leerPagina, leerSeleccion, obtenerParametro, type ParametrosUrl } from "@/shared/utils/filtros-registros";
import type { ValorParametro } from "@/shared/utils/paginacion";

export const MESES_MAXIMOS_REPORTE = 12;

const ABREVIATURAS_MES = ["ene", "feb", "mar", "abr", "may", "jun", "jul", "ago", "sep", "oct", "nov", "dic"] as const;
const FORMATO_MES = /^\d{4}-(0[1-9]|1[0-2])$/;

export interface FiltrosReporte {
    mesDesde: string;
    mesHasta: string;
    centroId?: string;
    bodegaId?: string;
    busqueda: string;
    pagina: number;
    avisos: string[];
}

export interface ColumnaMes {
    clave: string;
    etiqueta: string;
}

export function esMesValido(valor: string): boolean {
    return FORMATO_MES.test(valor);
}

export function sumarMesesClave(clave: string, meses: number): string {
    const [anio, mes] = clave.split("-").map(Number);
    return new Date(Date.UTC(anio, mes - 1 + meses, 1)).toISOString().slice(0, 7);
}

export function mesesEntre(desde: string, hasta: string): number {
    const [anioDesde, mesDesde] = desde.split("-").map(Number);
    const [anioHasta, mesHasta] = hasta.split("-").map(Number);
    return (anioHasta - anioDesde) * 12 + (mesHasta - mesDesde) + 1;
}

/**
 * El selector móvil envía `nodo` como "c:<centroId>", "b:<bodegaId>" o "" (Todo).
 * Si viene `nodo`, reemplaza a `centroId`/`bodegaId`.
 */
function leerNodo(params: ParametrosUrl | undefined): { centroId?: string; bodegaId?: string } {
    if (params && "nodo" in params) {
        const nodo = obtenerParametro(params, "nodo") ?? "";
        if (nodo.startsWith("c:")) {
            return { centroId: leerSeleccion(nodo.slice(2)) };
        }
        if (nodo.startsWith("b:")) {
            return { bodegaId: leerSeleccion(nodo.slice(2)) };
        }
        return {};
    }

    return {
        centroId: leerSeleccion(obtenerParametro(params, "centroId")),
        bodegaId: leerSeleccion(obtenerParametro(params, "bodegaId"))
    };
}

export function leerFiltrosReporte(params: ParametrosUrl | undefined, hoy: string): FiltrosReporte {
    const anio = hoy.slice(0, 4);
    const porDefecto = { mesDesde: `${anio}-01`, mesHasta: `${anio}-12` };
    const desdeUrl = obtenerParametro(params, "mesDesde") ?? porDefecto.mesDesde;
    const hastaUrl = obtenerParametro(params, "mesHasta") ?? porDefecto.mesHasta;
    const avisos: string[] = [];
    let periodo = { mesDesde: desdeUrl, mesHasta: hastaUrl };

    if (!esMesValido(desdeUrl) || !esMesValido(hastaUrl)) {
        avisos.push("El período ingresado no es válido; se muestra el año en curso.");
        periodo = porDefecto;
    } else if (desdeUrl > hastaUrl) {
        avisos.push("El mes desde es posterior al mes hasta; se muestra el año en curso.");
        periodo = porDefecto;
    } else if (mesesEntre(desdeUrl, hastaUrl) > MESES_MAXIMOS_REPORTE) {
        avisos.push("El período máximo es de 12 meses; se muestra el año en curso.");
        periodo = porDefecto;
    }

    return {
        ...periodo,
        ...leerNodo(params),
        busqueda: obtenerParametro(params, "q") ?? "",
        pagina: leerPagina(obtenerParametro(params, "pagina")),
        avisos
    };
}

export function columnasDelPeriodo(mesDesde: string, mesHasta: string): ColumnaMes[] {
    return Array.from({ length: mesesEntre(mesDesde, mesHasta) }, (_, indice) => {
        const clave = sumarMesesClave(mesDesde, indice);
        const [anio, mes] = clave.split("-");
        return { clave, etiqueta: `${ABREVIATURAS_MES[Number(mes) - 1]}-${anio}` };
    });
}

/** `Fecha` es `@db.Date` (medianoche UTC): el período es [primer día de mesDesde, primer día del mes siguiente a mesHasta). */
export function rangoDelPeriodo(mesDesde: string, mesHasta: string): { gte: Date; lt: Date } {
    return {
        gte: new Date(`${mesDesde}-01T00:00:00.000Z`),
        lt: new Date(`${sumarMesesClave(mesHasta, 1)}-01T00:00:00.000Z`)
    };
}

export function parametrosDeReporte(filtros: FiltrosReporte): Record<string, ValorParametro> {
    return {
        mesDesde: filtros.mesDesde,
        mesHasta: filtros.mesHasta,
        centroId: filtros.centroId,
        bodegaId: filtros.bodegaId,
        q: filtros.busqueda
    };
}
```

- [ ] **Step 4: Ejecutar y verificar que pasan**

Run: `npx vitest run src/__tests__/reporte-periodo.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/modules/reporte/utils/periodo.ts src/__tests__/reporte-periodo.test.ts
git commit -m "feat(reporte): lectura del período, columnas de meses y rango de fechas"
```

---

### Task 2: Consultas SQL del reporte y armado de filas

**Files:**
- Create: `src/shared/lib/inventario-alcance-sql.ts`
- Create: `src/modules/reporte/utils/reporte-consulta.ts`
- Create: `src/modules/reporte/utils/arbol.ts`
- Test: `src/__tests__/reporte-consulta.test.ts`

**Interfaces:**
- Consumes: `FiltroMovimientosSeleccion` (fase 1); `ColumnaMes` (Task 1); `patronLike` (fase 2, `src/modules/stock/utils/stock-consulta.ts`) — si la fase 2 no está fusionada, copiar la función aquí.
- Produces:
  - `condicionMovimientosSql(filtro: FiltroMovimientosSeleccion): Prisma.Sql` (alias fijo `o` = `OrdenSalida`/`OrdenEntrada`)
  - `TIPO_SALIDA_TRASPASO = "A otra bodega"`
  - `interface ConsultaReporte { filtroMovimientos: FiltroMovimientosSeleccion; bodegaIdsStock: string[]; gte: Date; lt: Date; busqueda: string }`
  - `interface FilaClaveReporte { productoId: number; bodegaId: string; centro: string; bodega: string; descripcion: string; linea: string; stockActual: bigint | number; ultimaActualizacion: Date | null }`
  - `interface FilaConsumoReporte { productoId: number; bodegaId: string; mes: string; cantidad: bigint | number }`
  - `interface FilaReporte { centro: string; bodega: string; bodegaId: string; productoId: number; descripcion: string; linea: string; stockActual: number; ultimaActualizacion: Date | null; meses: Record<string, number>; consumoPeriodo: number }`
  - `construirConteoReporte(consulta: ConsultaReporte): Prisma.Sql`
  - `construirClavesReporte(consulta: ConsultaReporte, pagina: { skip: number; tamano: number } | null): Prisma.Sql`
  - `construirConsumoReporte(consulta: ConsultaReporte, pares: Array<{ productoId: number; bodegaId: string }> | null): Prisma.Sql`
  - `armarFilasReporte(claves: FilaClaveReporte[], consumos: FilaConsumoReporte[], columnas: ColumnaMes[]): FilaReporte[]`
  - `interface NodoCentro { id: string; nombre: string; bodegas: Array<{ id: string; nombre: string }> }`
  - `construirArbol(centros: Array<{ id: string; nombre: string }>, bodegas: Array<{ id: string; nombre: string; centroId: string }>): NodoCentro[]`

- [ ] **Step 1: Escribir las pruebas**

`src/__tests__/reporte-consulta.test.ts`:

```ts
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
```

- [ ] **Step 2: Ejecutar y verificar que fallan**

Run: `npx vitest run src/__tests__/reporte-consulta.test.ts`
Expected: FAIL — módulos inexistentes.

- [ ] **Step 3: Implementar `inventario-alcance-sql.ts`**

`src/shared/lib/inventario-alcance-sql.ts`:

```ts
import { Prisma } from "@prisma/client";

// lib
import type { FiltroMovimientosSeleccion } from "@/shared/lib/inventario-alcance-filtros";

function condicionCampo(columna: Prisma.Sql, valor: string | { in: string[] } | undefined): Prisma.Sql | null {
    if (valor === undefined) {
        return null;
    }

    return typeof valor === "string"
        ? Prisma.sql`${columna} = ${valor}`
        : Prisma.sql`${columna} IN (${Prisma.join(valor.in)})`;
}

/**
 * Versión SQL de `crearFiltroMovimientosSeleccion` para consultas crudas.
 * Las listas `in` nunca vienen vacías: el filtro es `null` cuando no hay alcance.
 * Requiere que la orden tenga el alias `o` en la consulta.
 */
export function condicionMovimientosSql(filtro: FiltroMovimientosSeleccion): Prisma.Sql {
    const partes = [
        Prisma.sql`1 = 1`,
        condicionCampo(Prisma.sql`o.ID_Centro`, filtro.centroId),
        condicionCampo(Prisma.sql`o.ID_Bodega`, filtro.bodegaId)
    ].filter((parte): parte is Prisma.Sql => parte !== null);

    return Prisma.join(partes, " AND ");
}
```

- [ ] **Step 4: Implementar `reporte-consulta.ts`**

`src/modules/reporte/utils/reporte-consulta.ts`:

```ts
import { Prisma } from "@prisma/client";

// lib
import type { FiltroMovimientosSeleccion } from "@/shared/lib/inventario-alcance-filtros";
import { condicionMovimientosSql } from "@/shared/lib/inventario-alcance-sql";

// utils
import type { ColumnaMes } from "@/modules/reporte/utils/periodo";
import { patronLike } from "@/modules/stock/utils/stock-consulta";

export const TIPO_SALIDA_TRASPASO = "A otra bodega";

export interface ConsultaReporte {
    filtroMovimientos: FiltroMovimientosSeleccion;
    bodegaIdsStock: string[];
    gte: Date;
    lt: Date;
    busqueda: string;
}

export interface FilaClaveReporte {
    productoId: number;
    bodegaId: string;
    centro: string;
    bodega: string;
    descripcion: string;
    linea: string;
    stockActual: bigint | number;
    ultimaActualizacion: Date | null;
}

export interface FilaConsumoReporte {
    productoId: number;
    bodegaId: string;
    mes: string;
    cantidad: bigint | number;
}

export interface FilaReporte {
    centro: string;
    bodega: string;
    bodegaId: string;
    productoId: number;
    descripcion: string;
    linea: string;
    stockActual: number;
    ultimaActualizacion: Date | null;
    meses: Record<string, number>;
    consumoPeriodo: number;
}

function consumoMensual(consulta: ConsultaReporte): Prisma.Sql {
    return Prisma.sql`
        SELECT
            d.ID_Product AS productoId,
            o.ID_Bodega AS bodegaId,
            DATE_FORMAT(o.Fecha, '%Y-%m') AS mes,
            CAST(SUM(d.Cantidad) AS SIGNED) AS cantidad
        FROM OrdenSalidaDetalle d
        JOIN OrdenSalida o ON o.ID_OrdenSalida = d.ID_OrdenSalida
        WHERE o.Fecha >= ${consulta.gte} AND o.Fecha < ${consulta.lt}
            AND o.Tipo_Salida <> ${TIPO_SALIDA_TRASPASO}
            AND ${condicionMovimientosSql(consulta.filtroMovimientos)}
        GROUP BY d.ID_Product, o.ID_Bodega, mes`;
}

function existencias(bodegaIds: string[]): Prisma.Sql {
    const condicion = bodegaIds.length > 0 ? Prisma.sql`s.ID_Bodega IN (${Prisma.join(bodegaIds)})` : Prisma.sql`1 = 0`;

    return Prisma.sql`
        SELECT
            s.ID_Product AS productoId,
            s.ID_Bodega AS bodegaId,
            CAST(SUM(s.Cantidad_Disponible) AS SIGNED) AS stockActual,
            MAX(s.Fecha_Ultima_Actualizacion) AS ultimaActualizacion
        FROM Stock s
        WHERE ${condicion}
        GROUP BY s.ID_Product, s.ID_Bodega`;
}

/** CTE + joins comunes al conteo y a la página: productos × bodega con stock o con consumo en el período. */
function baseClaves(consulta: ConsultaReporte): { cte: Prisma.Sql; desde: Prisma.Sql } {
    const busqueda = consulta.busqueda.trim();
    const condicionBusqueda = busqueda.length === 0
        ? Prisma.sql`1 = 1`
        : /^\d+$/.test(busqueda)
            ? Prisma.sql`(p.Descripcion LIKE ${patronLike(busqueda)} OR p.ID_Product = ${Number(busqueda)})`
            : Prisma.sql`p.Descripcion LIKE ${patronLike(busqueda)}`;

    return {
        cte: Prisma.sql`
            WITH consumo AS (${consumoMensual(consulta)}),
            existencias AS (${existencias(consulta.bodegaIdsStock)}),
            claves AS (
                SELECT productoId, bodegaId FROM existencias
                UNION
                SELECT productoId, bodegaId FROM consumo
            )`,
        desde: Prisma.sql`
            FROM claves k
            JOIN Producto p ON p.ID_Product = k.productoId
            JOIN Bodega b ON b.ID_Bodega = k.bodegaId
            JOIN Centro c ON c.ID_Centro = b.ID_Centro
            LEFT JOIN existencias e ON e.productoId = k.productoId AND e.bodegaId = k.bodegaId
            WHERE ${condicionBusqueda}`
    };
}

export function construirConteoReporte(consulta: ConsultaReporte): Prisma.Sql {
    const { cte, desde } = baseClaves(consulta);
    return Prisma.sql`${cte} SELECT COUNT(*) AS total ${desde}`;
}

export function construirClavesReporte(consulta: ConsultaReporte, pagina: { skip: number; tamano: number } | null): Prisma.Sql {
    const { cte, desde } = baseClaves(consulta);
    const limite = pagina ? Prisma.sql`LIMIT ${pagina.tamano} OFFSET ${pagina.skip}` : Prisma.empty;

    return Prisma.sql`
        ${cte}
        SELECT
            k.productoId,
            k.bodegaId,
            c.Nombre AS centro,
            b.Bodega AS bodega,
            p.Descripcion AS descripcion,
            p.Linea AS linea,
            COALESCE(e.stockActual, 0) AS stockActual,
            e.ultimaActualizacion
        ${desde}
        ORDER BY c.Nombre, b.Bodega, p.Descripcion
        ${limite}`;
}

/** Consumo por mes; con `pares` se limita a las filas visibles, con `null` (exportar) trae todo. */
export function construirConsumoReporte(
    consulta: ConsultaReporte,
    pares: Array<{ productoId: number; bodegaId: string }> | null
): Prisma.Sql {
    if (!pares) {
        return consumoMensual(consulta);
    }

    const tuplas = pares.map((par) => Prisma.sql`(${par.productoId}, ${par.bodegaId})`);
    return Prisma.sql`
        SELECT x.productoId, x.bodegaId, x.mes, x.cantidad
        FROM (${consumoMensual(consulta)}) x
        WHERE (x.productoId, x.bodegaId) IN (${Prisma.join(tuplas)})`;
}

export function armarFilasReporte(claves: FilaClaveReporte[], consumos: FilaConsumoReporte[], columnas: ColumnaMes[]): FilaReporte[] {
    const consumoPorClave = new Map<string, number>();

    for (const consumo of consumos) {
        consumoPorClave.set(`${consumo.productoId}:${consumo.bodegaId}:${consumo.mes}`, Number(consumo.cantidad));
    }

    return claves.map((clave) => {
        const meses = Object.fromEntries(
            columnas.map((columna) => [columna.clave, consumoPorClave.get(`${clave.productoId}:${clave.bodegaId}:${columna.clave}`) ?? 0])
        );

        return {
            centro: clave.centro,
            bodega: clave.bodega,
            bodegaId: clave.bodegaId,
            productoId: Number(clave.productoId),
            descripcion: clave.descripcion,
            linea: clave.linea,
            stockActual: Number(clave.stockActual),
            ultimaActualizacion: clave.ultimaActualizacion,
            meses,
            consumoPeriodo: Object.values(meses).reduce((total, cantidad) => total + cantidad, 0)
        };
    });
}
```

> Si la fase 2 aún no está fusionada, reemplazar el import de `patronLike` por una copia local:
> `function patronLike(texto: string): string { return \`%${texto.replace(/[\\%_]/g, (c) => \`\\${c}\`)}%\`; }`

- [ ] **Step 5: Implementar `arbol.ts`**

`src/modules/reporte/utils/arbol.ts`:

```ts
export interface NodoCentro {
    id: string;
    nombre: string;
    bodegas: Array<{ id: string; nombre: string }>;
}

export function construirArbol(
    centros: Array<{ id: string; nombre: string }>,
    bodegas: Array<{ id: string; nombre: string; centroId: string }>
): NodoCentro[] {
    return centros.map((centro) => ({
        id: centro.id,
        nombre: centro.nombre,
        bodegas: bodegas
            .filter((bodega) => bodega.centroId === centro.id)
            .map((bodega) => ({ id: bodega.id, nombre: bodega.nombre }))
    }));
}
```

- [ ] **Step 6: Ejecutar y verificar que pasan**

Run: `npx vitest run src/__tests__/reporte-consulta.test.ts`
Expected: PASS.

- [ ] **Step 7: Probar el SQL contra la base local**

Con la base local cargada (migración AppSheet), ejecutar en `docker exec -it inventario-mysql mysql -uroot -p inventario` la consulta de conteo equivalente para un administrador y el año en curso, y verificar que no hay errores de sintaxis ni de `ONLY_FULL_GROUP_BY`:

```sql
WITH consumo AS (
    SELECT d.ID_Product AS productoId, o.ID_Bodega AS bodegaId, DATE_FORMAT(o.Fecha, '%Y-%m') AS mes, CAST(SUM(d.Cantidad) AS SIGNED) AS cantidad
    FROM OrdenSalidaDetalle d JOIN OrdenSalida o ON o.ID_OrdenSalida = d.ID_OrdenSalida
    WHERE o.Fecha >= '2026-01-01' AND o.Fecha < '2027-01-01' AND o.Tipo_Salida <> 'A otra bodega'
    GROUP BY d.ID_Product, o.ID_Bodega, mes
),
existencias AS (
    SELECT s.ID_Product AS productoId, s.ID_Bodega AS bodegaId, CAST(SUM(s.Cantidad_Disponible) AS SIGNED) AS stockActual, MAX(s.Fecha_Ultima_Actualizacion) AS ultimaActualizacion
    FROM Stock s GROUP BY s.ID_Product, s.ID_Bodega
),
claves AS (SELECT productoId, bodegaId FROM existencias UNION SELECT productoId, bodegaId FROM consumo)
SELECT COUNT(*) FROM claves;
```

Expected: un número cercano a la cantidad de filas del reporte actual en producción; tiempo < 1 s.

- [ ] **Step 8: Commit**

```bash
git add src/shared/lib/inventario-alcance-sql.ts src/modules/reporte/utils/reporte-consulta.ts src/modules/reporte/utils/arbol.ts src/__tests__/reporte-consulta.test.ts
git commit -m "feat(reporte): consultas SQL agregadas por producto, bodega y mes"
```

---

### Task 3: Excel del reporte

**Files:**
- Modify: `package.json` / `package-lock.json` (dependencia `exceljs`)
- Modify: `next.config.ts`
- Create: `src/modules/reporte/utils/excel-reporte.ts`
- Test: `src/__tests__/reporte-excel.test.ts`

**Interfaces:**
- Consumes: `FilaReporte` (Task 2), `ColumnaMes` (Task 1).
- Produces:
  - `MIME_XLSX = "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"`
  - `construirExcelReporte(filas: FilaReporte[], columnas: ColumnaMes[]): Promise<Buffer>`
  - `nombreArchivoReporte(nodo: string, mesDesde: string, mesHasta: string): string`

- [ ] **Step 1: Instalar exceljs y excluirlo del bundle de servidor**

Run: `npm install exceljs@4.4.0`

En `next.config.ts`, agregar al objeto `nextConfig`:

```ts
    // exceljs usa módulos de Node (stream, zlib): se carga tal cual en el servidor.
    serverExternalPackages: ["exceljs"],
```

- [ ] **Step 2: Escribir la prueba**

`src/__tests__/reporte-excel.test.ts`:

```ts
// @vitest-environment node
import ExcelJS from "exceljs";
import { describe, expect, it } from "vitest";

// utils
import { construirExcelReporte, nombreArchivoReporte } from "@/modules/reporte/utils/excel-reporte";
import { columnasDelPeriodo } from "@/modules/reporte/utils/periodo";

describe("construirExcelReporte", () => {
    it("escribe encabezados, meses del período y valores numéricos", async () => {
        const columnas = columnasDelPeriodo("2026-01", "2026-02");
        const buffer = await construirExcelReporte(
            [{
                centro: "CESFAM Barón",
                bodega: "Farmacia",
                bodegaId: "b1",
                productoId: 7,
                descripcion: "Guantes M",
                linea: "INSUMOS",
                stockActual: 40,
                ultimaActualizacion: new Date("2026-10-28T12:00:00.000Z"),
                meses: { "2026-01": 5, "2026-02": 0 },
                consumoPeriodo: 5
            }],
            columnas
        );

        const libro = new ExcelJS.Workbook();
        await libro.xlsx.load(buffer);
        const hoja = libro.getWorksheet("Consumo");

        expect(hoja?.getRow(1).values).toEqual([
            undefined,
            "Centro",
            "Bodega",
            "Código",
            "Producto",
            "Línea",
            "Stock actual",
            "Última actualización",
            "ene-2026",
            "feb-2026",
            "Consumo del período"
        ]);
        expect(hoja?.getRow(2).getCell(6).value).toBe(40);
        expect(hoja?.getRow(2).getCell(8).value).toBe(5);
        expect(hoja?.getRow(2).getCell(10).value).toBe(5);
    });
});

describe("nombreArchivoReporte", () => {
    it("normaliza el nombre del nodo", () => {
        expect(nombreArchivoReporte("Cesfam Las Cañas", "2026-01", "2026-12")).toBe("reporte-consumo-cesfam-las-canas-2026-01_2026-12.xlsx");
    });
});
```

- [ ] **Step 3: Ejecutar y verificar que falla**

Run: `npx vitest run src/__tests__/reporte-excel.test.ts`
Expected: FAIL — módulo inexistente.

- [ ] **Step 4: Implementar `excel-reporte.ts`**

`src/modules/reporte/utils/excel-reporte.ts`:

```ts
import ExcelJS from "exceljs";

// utils
import type { ColumnaMes } from "@/modules/reporte/utils/periodo";
import type { FilaReporte } from "@/modules/reporte/utils/reporte-consulta";

export const MIME_XLSX = "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet";

export async function construirExcelReporte(filas: FilaReporte[], columnas: ColumnaMes[]): Promise<Buffer> {
    const libro = new ExcelJS.Workbook();
    const hoja = libro.addWorksheet("Consumo");

    hoja.columns = [
        { header: "Centro", key: "centro", width: 28 },
        { header: "Bodega", key: "bodega", width: 28 },
        { header: "Código", key: "productoId", width: 10 },
        { header: "Producto", key: "descripcion", width: 42 },
        { header: "Línea", key: "linea", width: 18 },
        { header: "Stock actual", key: "stockActual", width: 14 },
        { header: "Última actualización", key: "ultimaActualizacion", width: 20, style: { numFmt: "dd-mm-yyyy" } },
        ...columnas.map((columna) => ({ header: columna.etiqueta, key: columna.clave, width: 11 })),
        { header: "Consumo del período", key: "consumoPeriodo", width: 20 }
    ];
    hoja.getRow(1).font = { bold: true };
    hoja.views = [{ state: "frozen", ySplit: 1 }];

    for (const fila of filas) {
        hoja.addRow({
            centro: fila.centro,
            bodega: fila.bodega,
            productoId: fila.productoId,
            descripcion: fila.descripcion,
            linea: fila.linea,
            stockActual: fila.stockActual,
            ultimaActualizacion: fila.ultimaActualizacion,
            ...fila.meses,
            consumoPeriodo: fila.consumoPeriodo
        });
    }

    return Buffer.from(await libro.xlsx.writeBuffer());
}

export function nombreArchivoReporte(nodo: string, mesDesde: string, mesHasta: string): string {
    const slug = nodo
        .normalize("NFD")
        .replace(/\p{Diacritic}/gu, "")
        .toLowerCase()
        .replace(/[^a-z0-9]+/g, "-")
        .replace(/^-|-$/g, "");

    return `reporte-consumo-${slug || "todo"}-${mesDesde}_${mesHasta}.xlsx`;
}
```

- [ ] **Step 5: Ejecutar y verificar que pasa**

Run: `npx vitest run src/__tests__/reporte-excel.test.ts`
Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add package.json package-lock.json next.config.ts src/modules/reporte/utils/excel-reporte.ts src/__tests__/reporte-excel.test.ts
git commit -m "feat(reporte): generación del Excel de consumo con exceljs"
```

---

### Task 4: Actions del reporte y auditoría de la exportación

**Files:**
- Replace: `src/modules/reporte/actions/reporte.action.ts`
- Modify: `src/modules/auditoria/schemas/auditoria.schema.ts`
- Modify: `src/modules/auditoria/components/auditoria-filtros.tsx`
- Modify: `src/modules/auditoria/constants/entidades.ts`
- Modify: `src/__tests__/alcance-acciones.test.ts`
- Test: `src/__tests__/reporte.action.test.ts`

**Interfaces:**
- Consumes: Tasks 1–3; `obtenerAlcanceInventario`, `crearFiltroMovimientosSeleccion` (fase 1); `calcularPaginacion`, `Paginacion` (fase 1); `fechaHoyChile` (fase 1); `AuditLogger`; `requireSessionUser`.
- Produces:
  - `interface ResultadoReporte { filas: FilaReporte[]; columnas: ColumnaMes[]; paginacion: Paginacion; arbol: NodoCentro[]; centroId: string | null; bodegaId: string | null; puedeFiltrarCentro: boolean; nodoNombre: string }`
  - `consultarReporte(filtros: FiltrosReporte): Promise<ResultadoReporte>`
  - `interface ResultadoExportacion { ok: boolean; message: string; base64?: string; nombreArchivo?: string }`
  - `exportarReporteExcelAction(parametros: Record<string, string>): Promise<ResultadoExportacion>`
  - Se elimina `listarReporteConsumoMensual` y la interfaz `ReporteConsumoMensual`.

- [ ] **Step 1: Escribir las pruebas**

`src/__tests__/reporte.action.test.ts`:

```ts
// @vitest-environment node
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { Prisma } from "@prisma/client";

// lib
import * as authLib from "@/shared/lib/auth";
import { AuditLogger } from "@/shared/lib/logger";
import { prisma } from "@/shared/lib/prisma";

// actions
import { consultarReporte, exportarReporteExcelAction } from "@/modules/reporte/actions/reporte.action";

// utils
import { leerFiltrosReporte } from "@/modules/reporte/utils/periodo";

vi.mock("@/auth", () => ({ auth: vi.fn() }));
vi.mock("@/shared/lib/logger", () => ({ AuditLogger: { log: vi.fn() } }));

vi.mock("@/shared/lib/auth", async (importOriginal) => {
    const original = await importOriginal<typeof import("@/shared/lib/auth")>();
    return { ...original, requireSessionUser: vi.fn() };
});

vi.mock("@/shared/lib/prisma", () => ({
    prisma: {
        $queryRaw: vi.fn(),
        centro: { findMany: vi.fn() },
        bodega: { findMany: vi.fn() }
    }
}));

const FILTROS = leerFiltrosReporte(undefined, "2026-10-30");

describe("consultarReporte", () => {
    beforeEach(() => {
        vi.clearAllMocks();
        vi.mocked(authLib.requireSessionUser).mockResolvedValue({
            id: "user-admin",
            nombre: "Admin",
            apPaterno: "Comunal",
            email: "admin@cmvalparaiso.cl",
            rol: "R01",
            centroId: "c1",
            bodegaId: null
        });
        vi.mocked(prisma.centro.findMany).mockResolvedValue([{ id: "c1", nombre: "CESFAM Barón", estado: true }] as never);
        vi.mocked(prisma.bodega.findMany).mockResolvedValue([{ id: "b1", nombre: "Farmacia", centroId: "c1", estado: true }] as never);
    });

    it("cuenta, trae la página y el consumo solo de esas filas", async () => {
        vi.mocked(prisma.$queryRaw)
            .mockResolvedValueOnce([{ total: BigInt(1) }] as never)
            .mockResolvedValueOnce([{
                productoId: 7,
                bodegaId: "b1",
                centro: "CESFAM Barón",
                bodega: "Farmacia",
                descripcion: "Guantes M",
                linea: "INSUMOS",
                stockActual: BigInt(40),
                ultimaActualizacion: null
            }] as never)
            .mockResolvedValueOnce([{ productoId: 7, bodegaId: "b1", mes: "2026-03", cantidad: BigInt(12) }] as never);

        const resultado = await consultarReporte(FILTROS);

        expect(resultado.columnas).toHaveLength(12);
        expect(resultado.filas[0].meses["2026-03"]).toBe(12);
        expect(resultado.filas[0].consumoPeriodo).toBe(12);
        expect(resultado.arbol).toEqual([{ id: "c1", nombre: "CESFAM Barón", bodegas: [{ id: "b1", nombre: "Farmacia" }] }]);
        const consumo = vi.mocked(prisma.$queryRaw).mock.calls[2][0] as unknown as Prisma.Sql;
        expect(consumo.values).toEqual(expect.arrayContaining([7, "b1"]));
    });

    it("no pide consumo si la página está vacía", async () => {
        vi.mocked(prisma.$queryRaw).mockResolvedValueOnce([{ total: BigInt(0) }] as never).mockResolvedValueOnce([] as never);

        const resultado = await consultarReporte(FILTROS);

        expect(resultado.filas).toEqual([]);
        expect(prisma.$queryRaw).toHaveBeenCalledTimes(2);
    });
});

describe("exportarReporteExcelAction", () => {
    beforeEach(() => {
        vi.clearAllMocks();
        vi.mocked(authLib.requireSessionUser).mockResolvedValue({
            id: "user-admin",
            nombre: "Admin",
            apPaterno: "Comunal",
            email: "admin@cmvalparaiso.cl",
            rol: "R01",
            centroId: "c1",
            bodegaId: null
        });
        vi.mocked(prisma.centro.findMany).mockResolvedValue([{ id: "c1", nombre: "CESFAM Barón", estado: true }] as never);
        vi.mocked(prisma.bodega.findMany).mockResolvedValue([{ id: "b1", nombre: "Farmacia", centroId: "c1", estado: true }] as never);
    });

    it("devuelve el Excel en base64 sin paginar y audita la exportación", async () => {
        vi.mocked(prisma.$queryRaw).mockResolvedValueOnce([] as never).mockResolvedValueOnce([] as never);

        const resultado = await exportarReporteExcelAction({ mesDesde: "2026-01", mesHasta: "2026-06" });

        expect(resultado.ok).toBe(true);
        expect(resultado.nombreArchivo).toBe("reporte-consumo-todo-2026-01_2026-06.xlsx");
        expect(resultado.base64?.length).toBeGreaterThan(0);
        const claves = vi.mocked(prisma.$queryRaw).mock.calls[0][0] as unknown as Prisma.Sql;
        expect(claves.sql).not.toContain("LIMIT");
        expect(AuditLogger.log).toHaveBeenCalledWith(expect.objectContaining({
            usuarioId: "user-admin",
            accion: "exportar",
            entidad: "Reporte"
        }));
    });
});
```

- [ ] **Step 2: Ejecutar y verificar que fallan**

Run: `npx vitest run src/__tests__/reporte.action.test.ts`
Expected: FAIL — `consultarReporte` no existe.

- [ ] **Step 3: Reemplazar `reporte.action.ts`**

`src/modules/reporte/actions/reporte.action.ts`:

```ts
"use server";

// lib
import { obtenerAlcanceInventario, type InventarioAlcance } from "@/shared/lib/inventario-alcance";
import { crearFiltroMovimientosSeleccion } from "@/shared/lib/inventario-alcance-filtros";
import { AuditLogger } from "@/shared/lib/logger";
import { prisma } from "@/shared/lib/prisma";

// utils
import { construirArbol, type NodoCentro } from "@/modules/reporte/utils/arbol";
import { construirExcelReporte, nombreArchivoReporte } from "@/modules/reporte/utils/excel-reporte";
import { columnasDelPeriodo, leerFiltrosReporte, rangoDelPeriodo, type ColumnaMes, type FiltrosReporte } from "@/modules/reporte/utils/periodo";
import {
    armarFilasReporte,
    construirClavesReporte,
    construirConsumoReporte,
    construirConteoReporte,
    type ConsultaReporte,
    type FilaClaveReporte,
    type FilaConsumoReporte,
    type FilaReporte
} from "@/modules/reporte/utils/reporte-consulta";
import { fechaHoyChile } from "@/shared/utils/filtros-registros";
import { calcularPaginacion, type Paginacion } from "@/shared/utils/paginacion";

export interface ResultadoReporte {
    filas: FilaReporte[];
    columnas: ColumnaMes[];
    paginacion: Paginacion;
    arbol: NodoCentro[];
    centroId: string | null;
    bodegaId: string | null;
    puedeFiltrarCentro: boolean;
    nodoNombre: string;
}

export interface ResultadoExportacion {
    ok: boolean;
    message: string;
    base64?: string;
    nombreArchivo?: string;
}

interface ContextoReporte {
    alcance: InventarioAlcance;
    arbol: NodoCentro[];
    columnas: ColumnaMes[];
    consulta: ConsultaReporte | null;
    nodoNombre: string;
}

function nombreDelNodo(alcance: InventarioAlcance): string {
    if (alcance.bodegaId) {
        return alcance.bodegas.find((bodega) => bodega.id === alcance.bodegaId)?.nombre ?? "bodega";
    }
    if (alcance.puedeFiltrarCentro && alcance.centroId) {
        return alcance.centros.find((centro) => centro.id === alcance.centroId)?.nombre ?? "centro";
    }
    return "todo";
}

async function prepararReporte(filtros: FiltrosReporte): Promise<ContextoReporte> {
    // El árbol se arma con el alcance completo; la consulta, con el nodo elegido.
    const [alcanceCompleto, alcance] = await Promise.all([
        obtenerAlcanceInventario(),
        obtenerAlcanceInventario({ centroId: filtros.centroId, bodegaId: filtros.bodegaId })
    ]);
    const filtroMovimientos = crearFiltroMovimientosSeleccion(alcance);
    const rango = rangoDelPeriodo(filtros.mesDesde, filtros.mesHasta);

    return {
        alcance,
        arbol: construirArbol(alcanceCompleto.centros, alcanceCompleto.bodegas),
        columnas: columnasDelPeriodo(filtros.mesDesde, filtros.mesHasta),
        nodoNombre: nombreDelNodo(alcance),
        consulta: filtroMovimientos
            ? {
                  filtroMovimientos,
                  bodegaIdsStock: alcance.bodegaIds,
                  gte: rango.gte,
                  lt: rango.lt,
                  busqueda: filtros.busqueda
              }
            : null
    };
}

async function cargarFilas(consulta: ConsultaReporte, columnas: ColumnaMes[], pagina: { skip: number; tamano: number } | null): Promise<FilaReporte[]> {
    const claves = await prisma.$queryRaw<FilaClaveReporte[]>(construirClavesReporte(consulta, pagina));

    if (claves.length === 0) {
        return [];
    }

    const pares = pagina ? claves.map((clave) => ({ productoId: Number(clave.productoId), bodegaId: clave.bodegaId })) : null;
    const consumos = await prisma.$queryRaw<FilaConsumoReporte[]>(construirConsumoReporte(consulta, pares));
    return armarFilasReporte(claves, consumos, columnas);
}

export async function consultarReporte(filtros: FiltrosReporte): Promise<ResultadoReporte> {
    const contexto = await prepararReporte(filtros);
    const base = {
        columnas: contexto.columnas,
        arbol: contexto.arbol,
        centroId: contexto.alcance.centroId,
        bodegaId: contexto.alcance.bodegaId,
        puedeFiltrarCentro: contexto.alcance.puedeFiltrarCentro,
        nodoNombre: contexto.nodoNombre
    };

    if (!contexto.consulta) {
        return { ...base, filas: [], paginacion: calcularPaginacion(1, 0) };
    }

    const [conteo] = await prisma.$queryRaw<Array<{ total: bigint | number }>>(construirConteoReporte(contexto.consulta));
    const paginacion = calcularPaginacion(filtros.pagina, Number(conteo?.total ?? 0));
    const filas = await cargarFilas(contexto.consulta, contexto.columnas, paginacion);

    return { ...base, filas, paginacion };
}

export async function exportarReporteExcelAction(parametros: Record<string, string>): Promise<ResultadoExportacion> {
    try {
        const filtros = leerFiltrosReporte(parametros, fechaHoyChile());
        const contexto = await prepararReporte(filtros);
        const filas = contexto.consulta ? await cargarFilas(contexto.consulta, contexto.columnas, null) : [];
        const buffer = await construirExcelReporte(filas, contexto.columnas);

        await AuditLogger.log({
            usuarioId: contexto.alcance.usuario.id,
            centroId: contexto.alcance.centroId,
            bodegaId: contexto.alcance.bodegaId,
            accion: "exportar",
            entidad: "Reporte",
            detalle: { mesDesde: filtros.mesDesde, mesHasta: filtros.mesHasta, busqueda: filtros.busqueda, filas: filas.length }
        });

        return {
            ok: true,
            message: "",
            base64: buffer.toString("base64"),
            nombreArchivo: nombreArchivoReporte(contexto.nodoNombre, filtros.mesDesde, filtros.mesHasta)
        };
    } catch {
        return { ok: false, message: "No fue posible generar el Excel del reporte." };
    }
}
```

> `cargarFilas` en exportación pide la consulta de claves sin `LIMIT` y luego el consumo completo (`pares = null`); el armado descarta los consumos sin clave.

- [ ] **Step 4: Acción y entidad de auditoría**

1. `src/modules/auditoria/schemas/auditoria.schema.ts`: agregar `"exportar"` al `z.enum` de `accion` (después de `"migracion"`).
2. `src/modules/auditoria/components/auditoria-filtros.tsx`: agregar `<option value="exportar">Exportación</option>` después de la opción "Migración".
3. `src/modules/auditoria/constants/entidades.ts`: agregar `{ value: "Reporte", label: "Reporte de consumo" }` al final de `ENTIDADES_AUDITORIA`.

- [ ] **Step 5: Actualizar `alcance-acciones.test.ts`**

1. Reemplazar el import de `listarReporteConsumoMensual` por:

```ts
import type { Prisma } from "@prisma/client";
import { consultarReporte } from "@/modules/reporte/actions/reporte.action";
import { leerFiltrosReporte } from "@/modules/reporte/utils/periodo";
```

2. Agregar `$queryRaw: vi.fn(),` al objeto `prisma` del `vi.mock` y la constante:

```ts
const FILTROS_REPORTE = leerFiltrosReporte(undefined, "2026-10-30");
```

3. Reemplazar el test CA-5 por:

```ts
        it("CA-5: el reporte filtra salidas y stock por las bodegas del funcionario", async () => {
            sesionOperadorFarmacia();
            vi.mocked(prisma.$queryRaw).mockResolvedValue([] as never);

            await consultarReporte(FILTROS_REPORTE);

            const conteo = vi.mocked(prisma.$queryRaw).mock.calls[0][0] as unknown as Prisma.Sql;
            expect(conteo.sql).toContain("o.ID_Centro IN (?)");
            expect(conteo.sql).toContain("o.ID_Bodega IN (?)");
            expect(conteo.sql).toContain("s.ID_Bodega IN (?)");
            expect(conteo.values).toEqual(expect.arrayContaining(["centro-1", "b1"]));
        });
```

4. En "retorna vacío sin consultar…": reemplazar `expect(await listarReporteConsumoMensual(2026)).toEqual([]);` por `expect((await consultarReporte(FILTROS_REPORTE)).filas).toEqual([]);` y `expect(prisma.ordenSalidaDetalle.findMany).not.toHaveBeenCalled();` por `expect(prisma.$queryRaw).not.toHaveBeenCalled();`.

5. En CA-6: reemplazar `await listarReporteConsumoMensual(2026);` por `vi.mocked(prisma.$queryRaw).mockResolvedValue([] as never); await consultarReporte(FILTROS_REPORTE);` y las expectativas del reporte (`whereReporte` y `prisma.stock.findMany`) por:

```ts
            const conteo = vi.mocked(prisma.$queryRaw).mock.calls[0][0] as unknown as Prisma.Sql;
            // Movimientos sin restricción (incluye bodegas desactivadas); stock de las bodegas activas
            expect(conteo.sql).not.toContain("o.ID_Bodega");
            expect(conteo.sql).not.toContain("o.ID_Centro");
            expect(conteo.sql).toContain("s.ID_Bodega IN (?)");
```

- [ ] **Step 6: Ejecutar las pruebas**

Run: `npx vitest run src/__tests__/reporte.action.test.ts src/__tests__/alcance-acciones.test.ts src/__tests__/auditoria-schema.test.ts src/__tests__/auditoria-filtros.test.tsx`
Expected: PASS.

- [ ] **Step 7: Commit**

```bash
git add src/modules/reporte/actions/reporte.action.ts src/modules/auditoria src/__tests__/reporte.action.test.ts src/__tests__/alcance-acciones.test.ts
git commit -m "feat(reporte): consulta paginada en SQL y exportación Excel auditada"
```

---

### Task 5: Página del reporte

**Files:**
- Create: `src/modules/reporte/components/arbol-centros.tsx`
- Create: `src/modules/reporte/components/filtros-reporte.tsx`
- Create: `src/modules/reporte/components/reporte-tabla.tsx`
- Create: `src/modules/reporte/components/boton-exportar-reporte.tsx`
- Replace: `src/app/reporte/page.tsx`
- Test: `src/__tests__/reporte-ui.test.tsx`

**Interfaces:**
- Consumes: `consultarReporte`, `exportarReporteExcelAction`, `ResultadoReporte` (Task 4); `leerFiltrosReporte`, `parametrosDeReporte`, `ColumnaMes`, `FiltrosReporte` (Task 1); `NodoCentro` (Task 2); `MIME_XLSX` (Task 3); `Paginacion` component, `crearHrefConParametros`, `ValorParametro`, `fechaHoyChile`, `ParametrosUrl` (fase 1); `descargarArchivoBase64`.
- Produces:
  - `ArbolCentros({ arbol, centroId, bodegaId, parametros }: { arbol: NodoCentro[]; centroId: string | null; bodegaId: string | null; parametros: Record<string, ValorParametro> })`
  - `FiltrosReporteForm({ filtros, arbol, centroId, bodegaId, variante }: { filtros: FiltrosReporte; arbol: NodoCentro[]; centroId: string | null; bodegaId: string | null; variante: "movil" | "escritorio" })`
  - `ReporteTabla({ filas, columnas }: { filas: FilaReporte[]; columnas: ColumnaMes[] })`
  - `BotonExportarReporte({ parametros }: { parametros: Record<string, string> })`

- [ ] **Step 1: Escribir las pruebas**

`src/__tests__/reporte-ui.test.tsx`:

```tsx
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

// actions
import { exportarReporteExcelAction } from "@/modules/reporte/actions/reporte.action";

// components
import { ArbolCentros } from "@/modules/reporte/components/arbol-centros";
import { BotonExportarReporte } from "@/modules/reporte/components/boton-exportar-reporte";
import { ReporteTabla } from "@/modules/reporte/components/reporte-tabla";

// utils
import { columnasDelPeriodo } from "@/modules/reporte/utils/periodo";
import { descargarArchivoBase64 } from "@/shared/utils/descargar-base64";

vi.mock("@/modules/reporte/actions/reporte.action", () => ({ exportarReporteExcelAction: vi.fn() }));
vi.mock("@/shared/utils/descargar-base64", () => ({ descargarArchivoBase64: vi.fn() }));
vi.mock("sonner", () => ({ toast: { error: vi.fn(), success: vi.fn() } }));

const ARBOL = [
    { id: "c1", nombre: "Cesfam Barón", bodegas: [{ id: "b1", nombre: "Farmacia" }] },
    { id: "c2", nombre: "Cesfam Placeres", bodegas: [{ id: "b2", nombre: "Dental" }] }
];

describe("ArbolCentros", () => {
    it("abre el centro de la bodega elegida y conserva el período en los enlaces", () => {
        render(<ArbolCentros arbol={ARBOL} centroId={null} bodegaId="b1" parametros={{ mesDesde: "2026-01", mesHasta: "2026-12" }} />);

        expect(screen.getByRole("link", { name: "Todo" })).toHaveAttribute("href", "/reporte?mesDesde=2026-01&mesHasta=2026-12");
        expect(screen.getByRole("link", { name: "Farmacia" })).toHaveAttribute("aria-current", "page");
        expect(screen.queryByRole("link", { name: "Dental" })).not.toBeInTheDocument();
        expect(screen.getByRole("link", { name: /Cesfam Placeres/ })).toHaveAttribute(
            "href",
            "/reporte?mesDesde=2026-01&mesHasta=2026-12&centroId=c2"
        );
    });
});

describe("ReporteTabla", () => {
    it("muestra una columna por mes y el consumo del período", () => {
        render(
            <ReporteTabla
                columnas={columnasDelPeriodo("2026-01", "2026-02")}
                filas={[{
                    centro: "Cesfam Barón",
                    bodega: "Farmacia",
                    bodegaId: "b1",
                    productoId: 7,
                    descripcion: "Guantes M",
                    linea: "INSUMOS",
                    stockActual: 1500,
                    ultimaActualizacion: null,
                    meses: { "2026-01": 5, "2026-02": 0 },
                    consumoPeriodo: 5
                }]}
            />
        );

        expect(screen.getByRole("columnheader", { name: "ene-2026" })).toBeInTheDocument();
        expect(screen.getByRole("columnheader", { name: "Consumo período" })).toBeInTheDocument();
        expect(screen.getByText("1.500")).toBeInTheDocument();
    });
});

describe("BotonExportarReporte", () => {
    it("descarga el archivo devuelto por la action", async () => {
        vi.mocked(exportarReporteExcelAction).mockResolvedValue({ ok: true, message: "", base64: "QUJD", nombreArchivo: "r.xlsx" });

        render(<BotonExportarReporte parametros={{ mesDesde: "2026-01", mesHasta: "2026-12" }} />);
        fireEvent.click(screen.getByRole("button", { name: /exportar excel/i }));

        await waitFor(() => expect(descargarArchivoBase64).toHaveBeenCalledWith(
            "QUJD",
            "r.xlsx",
            "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
        ));
        expect(exportarReporteExcelAction).toHaveBeenCalledWith({ mesDesde: "2026-01", mesHasta: "2026-12" });
    });
});
```

- [ ] **Step 2: Ejecutar y verificar que fallan**

Run: `npx vitest run src/__tests__/reporte-ui.test.tsx`
Expected: FAIL — componentes inexistentes.

- [ ] **Step 3: Árbol lateral**

`src/modules/reporte/components/arbol-centros.tsx`:

```tsx
import Link from "next/link";
import type * as React from "react";
import { ChevronDown, ChevronRight } from "lucide-react";

// utils
import type { NodoCentro } from "@/modules/reporte/utils/arbol";
import { cn } from "@/shared/utils/cn";
import { crearHrefConParametros, type ValorParametro } from "@/shared/utils/paginacion";

interface ArbolCentrosProps {
    arbol: NodoCentro[];
    centroId: string | null;
    bodegaId: string | null;
    /** Parámetros a conservar (período, búsqueda), sin centroId, bodegaId ni pagina. */
    parametros: Record<string, ValorParametro>;
}

function claseNodo(activo: boolean): string {
    return cn(
        "flex items-center gap-1 rounded-md px-2 py-1.5 text-sm",
        activo ? "bg-teal-600 text-white" : "text-slate-700 hover:bg-teal-50"
    );
}

export function ArbolCentros({ arbol, centroId, bodegaId, parametros }: ArbolCentrosProps): React.ReactElement {
    const centroAbierto = centroId ?? arbol.find((centro) => centro.bodegas.some((bodega) => bodega.id === bodegaId))?.id ?? null;

    return (
        <nav aria-label="Centros y bodegas" className="space-y-1">
            <Link
                href={crearHrefConParametros("/reporte", parametros)}
                aria-current={!centroId && !bodegaId ? "page" : undefined}
                className={claseNodo(!centroId && !bodegaId)}
            >
                Todo
            </Link>
            <ul className="space-y-1">
                {arbol.map((centro) => {
                    const abierto = centro.id === centroAbierto;
                    const Icono = abierto ? ChevronDown : ChevronRight;

                    return (
                        <li key={centro.id}>
                            <Link
                                href={crearHrefConParametros("/reporte", { ...parametros, centroId: centro.id })}
                                aria-current={centroId === centro.id && !bodegaId ? "page" : undefined}
                                className={claseNodo(centroId === centro.id && !bodegaId)}
                            >
                                <Icono className="h-4 w-4 shrink-0" aria-hidden="true" />
                                <span className="truncate">{centro.nombre}</span>
                            </Link>
                            {abierto ? (
                                <ul className="ml-5 mt-1 space-y-1">
                                    {centro.bodegas.map((bodega) => (
                                        <li key={bodega.id}>
                                            <Link
                                                href={crearHrefConParametros("/reporte", { ...parametros, centroId: centro.id, bodegaId: bodega.id })}
                                                aria-current={bodegaId === bodega.id ? "page" : undefined}
                                                className={claseNodo(bodegaId === bodega.id)}
                                            >
                                                <span className="truncate">{bodega.nombre}</span>
                                            </Link>
                                        </li>
                                    ))}
                                </ul>
                            ) : null}
                        </li>
                    );
                })}
            </ul>
        </nav>
    );
}
```

- [ ] **Step 4: Filtros del reporte**

`src/modules/reporte/components/filtros-reporte.tsx` (formulario GET sin estado de cliente). La página lo renderiza dos veces: `variante="escritorio"` (el nodo lo elige el árbol y se conserva con campos ocultos) y `variante="movil"` (el nodo se elige con el select `nodo`, que `leerFiltrosReporte` prioriza). Así nunca se envían a la vez `nodo` y `centroId`/`bodegaId` desde el mismo formulario:

```tsx
import type * as React from "react";

// components
import { Button } from "@/shared/components/ui/button";
import { Input } from "@/shared/components/ui/input";
import { Select } from "@/shared/components/ui/select";

// utils
import type { NodoCentro } from "@/modules/reporte/utils/arbol";
import type { FiltrosReporte } from "@/modules/reporte/utils/periodo";

interface FiltrosReporteFormProps {
    filtros: FiltrosReporte;
    arbol: NodoCentro[];
    centroId: string | null;
    bodegaId: string | null;
    variante: "movil" | "escritorio";
}

export function FiltrosReporteForm({ filtros, arbol, centroId, bodegaId, variante }: FiltrosReporteFormProps): React.ReactElement {
    const nodoActual = bodegaId ? `b:${bodegaId}` : centroId ? `c:${centroId}` : "";

    return (
        <form action="/reporte" className="grid gap-3 md:grid-cols-2 xl:grid-cols-5">
            {variante === "escritorio" ? (
                <>
                    {centroId ? <input type="hidden" name="centroId" value={centroId} /> : null}
                    {bodegaId ? <input type="hidden" name="bodegaId" value={bodegaId} /> : null}
                </>
            ) : (
                <label className="space-y-1 text-sm">
                    <span>Centro / bodega</span>
                    <Select name="nodo" defaultValue={nodoActual}>
                        <option value="">Todo</option>
                        {arbol.map((centro) => (
                            <optgroup key={centro.id} label={centro.nombre}>
                                <option value={`c:${centro.id}`}>{centro.nombre} (todas las bodegas)</option>
                                {centro.bodegas.map((bodega) => (
                                    <option key={bodega.id} value={`b:${bodega.id}`}>
                                        {bodega.nombre}
                                    </option>
                                ))}
                            </optgroup>
                        ))}
                    </Select>
                </label>
            )}
            <label className="space-y-1 text-sm">
                <span>Mes desde</span>
                <Input type="month" name="mesDesde" defaultValue={filtros.mesDesde} aria-label="Mes desde" />
            </label>
            <label className="space-y-1 text-sm">
                <span>Mes hasta</span>
                <Input type="month" name="mesHasta" defaultValue={filtros.mesHasta} aria-label="Mes hasta" />
            </label>
            <label className="space-y-1 text-sm">
                <span>Buscar producto</span>
                <Input name="q" defaultValue={filtros.busqueda} placeholder="Nombre o código" />
            </label>
            <div className="flex items-end gap-2">
                <Button type="submit">Aplicar</Button>
            </div>
        </form>
    );
}
```


- [ ] **Step 5: Tabla y botón de exportar**

`src/modules/reporte/components/reporte-tabla.tsx`:

```tsx
import type * as React from "react";

// components
import { Table, Td, Th } from "@/shared/components/ui/table";

// utils
import type { ColumnaMes } from "@/modules/reporte/utils/periodo";
import type { FilaReporte } from "@/modules/reporte/utils/reporte-consulta";
import { formatDate, formatNumber } from "@/shared/utils/format";

export function ReporteTabla({ filas, columnas }: { filas: FilaReporte[]; columnas: ColumnaMes[] }): React.ReactElement {
    return (
        <Table>
            <thead>
                <tr>
                    <Th>Centro</Th>
                    <Th>Bodega</Th>
                    <Th>Producto</Th>
                    <Th>Línea</Th>
                    <Th className="text-right">Stock actual</Th>
                    <Th>Últ. actualización</Th>
                    {columnas.map((columna) => (
                        <Th key={columna.clave} className="text-right">
                            {columna.etiqueta}
                        </Th>
                    ))}
                    <Th className="text-right">Consumo período</Th>
                </tr>
            </thead>
            <tbody>
                {filas.map((fila) => (
                    <tr key={`${fila.bodegaId}:${fila.productoId}`}>
                        <Td>{fila.centro}</Td>
                        <Td>{fila.bodega}</Td>
                        <Td>{fila.descripcion} #{fila.productoId}</Td>
                        <Td>{fila.linea}</Td>
                        <Td className="text-right">{formatNumber(fila.stockActual)}</Td>
                        <Td>{fila.ultimaActualizacion ? formatDate(fila.ultimaActualizacion) : "—"}</Td>
                        {columnas.map((columna) => (
                            <Td key={columna.clave} className="text-right">
                                {formatNumber(fila.meses[columna.clave] ?? 0)}
                            </Td>
                        ))}
                        <Td className="text-right font-semibold">{formatNumber(fila.consumoPeriodo)}</Td>
                    </tr>
                ))}
                {filas.length === 0 ? (
                    <tr>
                        <Td colSpan={7 + columnas.length} className="text-muted-foreground">
                            No hay stock ni consumo para los filtros seleccionados.
                        </Td>
                    </tr>
                ) : null}
            </tbody>
        </Table>
    );
}
```

`src/modules/reporte/components/boton-exportar-reporte.tsx`:

```tsx
"use client";

import type * as React from "react";
import { useState } from "react";
import { FileSpreadsheet, Loader2 } from "lucide-react";
import { toast } from "sonner";

// actions
import { exportarReporteExcelAction } from "@/modules/reporte/actions/reporte.action";

// components
import { Button } from "@/shared/components/ui/button";

// utils
import { descargarArchivoBase64 } from "@/shared/utils/descargar-base64";

const MIME_XLSX = "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet";

export function BotonExportarReporte({ parametros }: { parametros: Record<string, string> }): React.ReactElement {
    const [exportando, setExportando] = useState(false);

    async function exportar(): Promise<void> {
        setExportando(true);
        try {
            const resultado = await exportarReporteExcelAction(parametros);

            if (!resultado.ok || !resultado.base64 || !resultado.nombreArchivo) {
                toast.error(resultado.message || "No fue posible generar el Excel del reporte.");
                return;
            }

            descargarArchivoBase64(resultado.base64, resultado.nombreArchivo, MIME_XLSX);
            toast.success("Reporte exportado.");
        } finally {
            setExportando(false);
        }
    }

    return (
        <Button type="button" variant="outline" onClick={() => void exportar()} disabled={exportando}>
            {exportando ? <Loader2 className="h-4 w-4 animate-spin" /> : <FileSpreadsheet className="h-4 w-4" />}
            <span>Exportar Excel</span>
        </Button>
    );
}
```

> `MIME_XLSX` se duplica aquí a propósito: importar `excel-reporte.ts` desde un client component arrastraría `exceljs` al bundle del navegador.

- [ ] **Step 6: Página `/reporte`**

Reemplazar `src/app/reporte/page.tsx`:

```tsx
import type * as React from "react";

// actions
import { consultarReporte } from "@/modules/reporte/actions/reporte.action";

// components
import { ArbolCentros } from "@/modules/reporte/components/arbol-centros";
import { BotonExportarReporte } from "@/modules/reporte/components/boton-exportar-reporte";
import { FiltrosReporteForm } from "@/modules/reporte/components/filtros-reporte";
import { ReporteTabla } from "@/modules/reporte/components/reporte-tabla";
import { Paginacion } from "@/shared/components/inventario/paginacion";
import { AppLayout } from "@/shared/components/layout/app-layout";
import { Card, CardContent, CardHeader, CardTitle } from "@/shared/components/ui/card";

// utils
import { leerFiltrosReporte, parametrosDeReporte } from "@/modules/reporte/utils/periodo";
import { fechaHoyChile, type ParametrosUrl } from "@/shared/utils/filtros-registros";

export const dynamic = "force-dynamic";

interface ReportePageProps {
    searchParams?: Promise<ParametrosUrl>;
}

export default async function ReportePage({ searchParams }: ReportePageProps): Promise<React.ReactElement> {
    const filtros = leerFiltrosReporte(await searchParams, fechaHoyChile());
    const reporte = await consultarReporte(filtros);
    // Para R02/R03/R06/R07 el centro es fijo: no cuenta como selección del árbol.
    const centroSeleccionado = reporte.puedeFiltrarCentro && !reporte.bodegaId ? reporte.centroId : null;
    const parametros = {
        ...parametrosDeReporte(filtros),
        centroId: reporte.bodegaId ? undefined : centroSeleccionado ?? undefined,
        bodegaId: reporte.bodegaId ?? undefined
    };
    const parametrosSinNodo = { mesDesde: filtros.mesDesde, mesHasta: filtros.mesHasta, q: filtros.busqueda };
    const parametrosExportacion = Object.fromEntries(
        Object.entries(parametros).filter((entrada): entrada is [string, string] => typeof entrada[1] === "string" && entrada[1].length > 0)
    );

    return (
        <AppLayout>
            <div className="space-y-6">
                <div className="flex flex-wrap items-end justify-between gap-3">
                    <div>
                        <p className="text-sm text-muted-foreground">Consumo mensual por centro, bodega y producto</p>
                        <h2 className="text-2xl font-semibold">Reporte de consumo</h2>
                    </div>
                    <BotonExportarReporte parametros={parametrosExportacion} />
                </div>
                <div className="grid gap-6 lg:grid-cols-[16rem_minmax(0,1fr)]">
                    <Card className="hidden lg:block">
                        <CardContent className="max-h-[75vh] overflow-y-auto pt-4">
                            <ArbolCentros
                                arbol={reporte.arbol}
                                centroId={centroSeleccionado}
                                bodegaId={reporte.bodegaId}
                                parametros={parametrosSinNodo}
                            />
                        </CardContent>
                    </Card>
                    <div className="min-w-0 space-y-6">
                        <Card>
                            <CardHeader>
                                <CardTitle>Filtros · {reporte.nodoNombre === "todo" ? "Todo" : reporte.nodoNombre}</CardTitle>
                            </CardHeader>
                            <CardContent className="space-y-3">
                                {filtros.avisos.map((aviso) => (
                                    <p key={aviso} role="status" className="rounded-md border border-amber-200 bg-amber-50 px-3 py-2 text-sm text-amber-900">
                                        {aviso}
                                    </p>
                                ))}
                                <div className="lg:hidden">
                                    <FiltrosReporteForm filtros={filtros} arbol={reporte.arbol} centroId={centroSeleccionado} bodegaId={reporte.bodegaId} variante="movil" />
                                </div>
                                <div className="hidden lg:block">
                                    <FiltrosReporteForm filtros={filtros} arbol={reporte.arbol} centroId={centroSeleccionado} bodegaId={reporte.bodegaId} variante="escritorio" />
                                </div>
                            </CardContent>
                        </Card>
                        <Card>
                            <CardContent className="overflow-x-auto pt-4">
                                <ReporteTabla filas={reporte.filas} columnas={reporte.columnas} />
                                <Paginacion ruta="/reporte" parametros={parametros} paginacion={reporte.paginacion} />
                            </CardContent>
                        </Card>
                    </div>
                </div>
            </div>
        </AppLayout>
    );
}
```

- [ ] **Step 7: Ejecutar pruebas y verificación completa**

Run: `npx vitest run src/__tests__/reporte-ui.test.tsx && npm test && npx tsc --noEmit && npm run lint && npm run build`
Expected: todo en verde (restaurar `tsconfig.tsbuildinfo` si cambia). `grep -rn "listarReporteConsumoMensual" src` no devuelve resultados.

- [ ] **Step 8: Prueba manual local**

Run: `npm run dev`, con un R01 en `/reporte`:
1. Por defecto: año en curso, columnas ene–dic, "Todo" activo, 50 filas.
2. Clic en un centro: se despliegan sus bodegas; clic en una bodega: la tabla se acota; la URL conserva `mesDesde`/`mesHasta`.
3. Período `2025-11` a `2026-10`: columnas nov-2025 … oct-2026. Período de 13 meses: aviso y vuelta al año en curso.
4. Para una bodega y un producto, comparar el consumo de un mes con `SELECT SUM(d.Cantidad) FROM OrdenSalidaDetalle d JOIN OrdenSalida o ON o.ID_OrdenSalida = d.ID_OrdenSalida WHERE d.ID_Product = <id> AND o.ID_Bodega = '<bodega>' AND o.Fecha >= '2026-03-01' AND o.Fecha < '2026-04-01' AND o.Tipo_Salida <> 'A otra bodega';`.
5. "Exportar Excel" descarga `reporte-consumo-<nodo>-<desde>_<hasta>.xlsx` con todas las filas del filtro; Auditoría muestra la acción "Exportación" sobre "Reporte de consumo".
6. Ventana angosta (< 1024 px): el árbol desaparece y el select "Centro / bodega" cumple su función.

- [ ] **Step 9: Commit**

```bash
git add src/modules/reporte/components src/app/reporte/page.tsx src/__tests__/reporte-ui.test.tsx
git commit -m "feat(reporte): vista con árbol de centros, período móvil y exportación"
```

---

### Task 6: Verificación de rendimiento en producción (después del merge)

- [ ] **Step 1:** Con un administrador, medir `/reporte` en "Todo" (páginas 1 y 30), un centro y una bodega: TTFB < 1 s y respuesta < 200 KB.
- [ ] **Step 2:** Exportar "Todo" del año en curso: la descarga termina en < 10 s y pm2 no reinicia `inventario-cmv` (mismo comando que la fase 1, Task 9).
- [ ] **Step 3:** Anotar los resultados en el PR de la fase 3.
