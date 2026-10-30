# Fase 4 — Salidas por producto: plan de implementación

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Nueva vista `/salidas/por-producto` que, para un producto buscado, muestra el total salido en el rango (por bodega y por tipo de salida) y el listado paginado de cada salida.

**Architecture:** Buscador con server action (máx. 20 sugerencias) que lleva el producto a la URL (`?productoId=`). La página lee los mismos filtros que los registros (rango de fechas, centro, bodega, página), calcula los totales con dos `GROUP BY` en SQL y pagina las líneas de detalle con Prisma (`count` + `findMany` con `select`).

**Tech Stack:** Next.js 15, React 19, TypeScript strict, Prisma 6 (`$queryRaw`, `Prisma.sql`), MySQL 8.4, Vitest + Testing Library.

**Spec:** `docs/superpowers/specs/2026-10-30-registros-paginados-navegacion-design.md` (secciones 6, 9 fase 4 y 10).

**Requiere:** fases 1, 2 y 3 fusionadas: `filtros-registros.ts`, `paginacion.ts`, `crearFiltroMovimientosSeleccion`, `Paginacion`, `menu.ts` (fase 1); prop `children` de `InventarioFiltros` (fase 2); `condicionMovimientosSql` (fase 3).

## Global Constraints

- Idioma español en UI, comentarios, nombres y commits. Indentación de 4 espacios.
- TypeScript strict con tipos explícitos; imports agrupados con comentarios; alias `@/`.
- Server Actions en `*.action.ts` con `"use server"`; solo exportan funciones `async` (y tipos).
- SQL crudo solo con `Prisma.sql` / `Prisma.join`.
- Filtros: rango de fechas por defecto **últimos 30 días**, máximo **12 meses**; centro (si el rol puede elegirlo); bodega; página de **50** líneas.
- Los totales incluyen todos los tipos de salida (también "A otra bodega"), porque se desglosan por tipo.
- Buscador: mínimo 2 caracteres (o un código numérico), máximo **20** sugerencias, espera de 300 ms tras dejar de escribir.
- Los client components no importan `@/shared/lib/auth` ni `@/shared/lib/prisma`.
- Verificación: `npm test`, `npx tsc --noEmit` (restaurar `tsconfig.tsbuildinfo` si cambia), `npm run lint`, `npm run build`.

## Estructura de archivos

| Archivo | Acción | Responsabilidad |
|---|---|---|
| `src/modules/orden-salida/utils/salidas-producto-consulta.ts` | Crear | SQL de totales por bodega y por tipo; mapeo; lectura de `productoId` |
| `src/modules/orden-salida/actions/salidas-producto.action.ts` | Crear | `buscarProductosAction`, `consultarSalidasProducto` |
| `src/modules/orden-salida/components/buscador-producto.tsx` | Crear | Buscador con sugerencias |
| `src/modules/orden-salida/components/salidas-producto-resumen.tsx` | Crear | Tarjetas de totales |
| `src/modules/orden-salida/components/salidas-producto-tabla.tsx` | Crear | Listado de líneas |
| `src/app/salidas/por-producto/page.tsx` | Crear | Página |
| `src/shared/components/layout/menu.ts` | Modificar | Subopción "Salidas por producto" |
| `src/__tests__/menu-lateral.test.tsx` | Modificar | Nueva ruta en el menú |

---

### Task 1: Consultas de totales y lectura del producto

**Files:**
- Create: `src/modules/orden-salida/utils/salidas-producto-consulta.ts`
- Test: `src/__tests__/salidas-producto-consulta.test.ts`

**Interfaces:**
- Consumes: `condicionMovimientosSql` (fase 3), `FiltroMovimientosSeleccion` (fase 1).
- Produces:
  - `interface ConsultaSalidasProducto { productoId: number; filtroMovimientos: FiltroMovimientosSeleccion; gte: Date; lte: Date }`
  - `interface FilaTotalSql { clave: string; etiqueta: string; cantidad: bigint | number }`
  - `interface TotalAgrupado { clave: string; etiqueta: string; cantidad: number }`
  - `construirTotalesPorBodega(consulta: ConsultaSalidasProducto): Prisma.Sql`
  - `construirTotalesPorTipo(consulta: ConsultaSalidasProducto): Prisma.Sql`
  - `mapearTotales(filas: FilaTotalSql[]): TotalAgrupado[]`
  - `leerProductoId(valor: string | undefined): number | undefined`

- [ ] **Step 1: Escribir las pruebas**

`src/__tests__/salidas-producto-consulta.test.ts`:

```ts
import { describe, expect, it } from "vitest";

// utils
import {
    construirTotalesPorBodega,
    construirTotalesPorTipo,
    leerProductoId,
    mapearTotales,
    type ConsultaSalidasProducto
} from "@/modules/orden-salida/utils/salidas-producto-consulta";

function plano(sql: { sql: string }): string {
    return sql.sql.replace(/\s+/g, " ");
}

const CONSULTA: ConsultaSalidasProducto = {
    productoId: 7,
    filtroMovimientos: { bodegaId: "b1" },
    gte: new Date("2026-10-01T00:00:00.000Z"),
    lte: new Date("2026-10-30T00:00:00.000Z")
};

describe("totales de salidas por producto", () => {
    it("agrupa por bodega con producto, rango y alcance", () => {
        const consulta = construirTotalesPorBodega(CONSULTA);
        const texto = plano(consulta);

        expect(texto).toContain("WHERE d.ID_Product = ? AND o.Fecha >= ? AND o.Fecha <= ? AND 1 = 1 AND o.ID_Bodega = ?");
        expect(texto).toContain("GROUP BY o.ID_Bodega, b.Bodega");
        expect(consulta.values).toEqual([7, CONSULTA.gte, CONSULTA.lte, "b1"]);
    });

    it("agrupa por tipo de salida", () => {
        expect(plano(construirTotalesPorTipo(CONSULTA))).toContain("GROUP BY o.Tipo_Salida");
    });

    it("convierte cantidades a número", () => {
        expect(mapearTotales([{ clave: "b1", etiqueta: "Farmacia", cantidad: BigInt(15) }])).toEqual([
            { clave: "b1", etiqueta: "Farmacia", cantidad: 15 }
        ]);
    });
});

describe("leerProductoId", () => {
    it("acepta solo enteros positivos", () => {
        expect(leerProductoId("7")).toBe(7);
        expect(leerProductoId("0")).toBeUndefined();
        expect(leerProductoId("abc")).toBeUndefined();
        expect(leerProductoId(undefined)).toBeUndefined();
    });
});
```

- [ ] **Step 2: Ejecutar y verificar que fallan**

Run: `npx vitest run src/__tests__/salidas-producto-consulta.test.ts`
Expected: FAIL — módulo inexistente.

- [ ] **Step 3: Implementar**

`src/modules/orden-salida/utils/salidas-producto-consulta.ts`:

```ts
import { Prisma } from "@prisma/client";

// lib
import type { FiltroMovimientosSeleccion } from "@/shared/lib/inventario-alcance-filtros";
import { condicionMovimientosSql } from "@/shared/lib/inventario-alcance-sql";

export interface ConsultaSalidasProducto {
    productoId: number;
    filtroMovimientos: FiltroMovimientosSeleccion;
    gte: Date;
    lte: Date;
}

export interface FilaTotalSql {
    clave: string;
    etiqueta: string;
    cantidad: bigint | number;
}

export interface TotalAgrupado {
    clave: string;
    etiqueta: string;
    cantidad: number;
}

function filtroComun(consulta: ConsultaSalidasProducto): Prisma.Sql {
    return Prisma.sql`
        WHERE d.ID_Product = ${consulta.productoId}
            AND o.Fecha >= ${consulta.gte}
            AND o.Fecha <= ${consulta.lte}
            AND ${condicionMovimientosSql(consulta.filtroMovimientos)}`;
}

export function construirTotalesPorBodega(consulta: ConsultaSalidasProducto): Prisma.Sql {
    return Prisma.sql`
        SELECT o.ID_Bodega AS clave, b.Bodega AS etiqueta, CAST(SUM(d.Cantidad) AS SIGNED) AS cantidad
        FROM OrdenSalidaDetalle d
        JOIN OrdenSalida o ON o.ID_OrdenSalida = d.ID_OrdenSalida
        JOIN Bodega b ON b.ID_Bodega = o.ID_Bodega
        ${filtroComun(consulta)}
        GROUP BY o.ID_Bodega, b.Bodega
        ORDER BY cantidad DESC, b.Bodega`;
}

export function construirTotalesPorTipo(consulta: ConsultaSalidasProducto): Prisma.Sql {
    return Prisma.sql`
        SELECT o.Tipo_Salida AS clave, o.Tipo_Salida AS etiqueta, CAST(SUM(d.Cantidad) AS SIGNED) AS cantidad
        FROM OrdenSalidaDetalle d
        JOIN OrdenSalida o ON o.ID_OrdenSalida = d.ID_OrdenSalida
        ${filtroComun(consulta)}
        GROUP BY o.Tipo_Salida
        ORDER BY cantidad DESC, o.Tipo_Salida`;
}

export function mapearTotales(filas: FilaTotalSql[]): TotalAgrupado[] {
    return filas.map((fila) => ({ clave: fila.clave, etiqueta: fila.etiqueta, cantidad: Number(fila.cantidad) }));
}

export function leerProductoId(valor: string | undefined): number | undefined {
    const numero = Number(valor);
    return valor !== undefined && Number.isInteger(numero) && numero > 0 ? numero : undefined;
}
```

- [ ] **Step 4: Ejecutar y verificar que pasan**

Run: `npx vitest run src/__tests__/salidas-producto-consulta.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/modules/orden-salida/utils/salidas-producto-consulta.ts src/__tests__/salidas-producto-consulta.test.ts
git commit -m "feat(salidas): totales SQL de salidas de un producto por bodega y por tipo"
```

---

### Task 2: Server actions de búsqueda y consulta

**Files:**
- Create: `src/modules/orden-salida/actions/salidas-producto.action.ts`
- Test: `src/__tests__/salidas-producto.action.test.ts`

**Interfaces:**
- Consumes: Task 1; `FiltrosRegistros`, `rangoFechasDb` (fase 1); `calcularPaginacion`, `Paginacion` (fase 1); `obtenerAlcanceInventario`, `crearFiltroMovimientosSeleccion`; `requireSessionUser`.
- Produces:
  - `interface ProductoBuscado { id: number; descripcion: string; linea: string }`
  - `buscarProductosAction(texto: string): Promise<ProductoBuscado[]>`
  - `interface LineaSalidaProducto { id: string; ordenId: string; fecha: Date; bodegaNombre: string; tipoSalida: string; destino: string; lote: string; cantidad: number; usuarioNombre: string }`
  - `interface ResultadoSalidasProducto { producto: ProductoBuscado | null; total: number; porBodega: TotalAgrupado[]; porTipo: TotalAgrupado[]; lineas: LineaSalidaProducto[]; paginacion: Paginacion; centros: Centro[]; bodegas: Bodega[]; centroId: string | null; bodegaId: string | null; puedeFiltrarCentro: boolean }`
  - `consultarSalidasProducto(filtros: FiltrosRegistros, productoId: number | undefined): Promise<ResultadoSalidasProducto>`

- [ ] **Step 1: Escribir las pruebas**

`src/__tests__/salidas-producto.action.test.ts`:

```ts
import { beforeEach, describe, expect, it, vi } from "vitest";

// lib
import * as authLib from "@/shared/lib/auth";
import { prisma } from "@/shared/lib/prisma";

// actions
import { buscarProductosAction, consultarSalidasProducto } from "@/modules/orden-salida/actions/salidas-producto.action";

vi.mock("@/auth", () => ({ auth: vi.fn() }));

vi.mock("@/shared/lib/auth", async (importOriginal) => {
    const original = await importOriginal<typeof import("@/shared/lib/auth")>();
    return { ...original, requireSessionUser: vi.fn() };
});

vi.mock("@/shared/lib/prisma", () => ({
    prisma: {
        $queryRaw: vi.fn(),
        centro: { findMany: vi.fn() },
        bodega: { findMany: vi.fn() },
        producto: { findMany: vi.fn(), findUnique: vi.fn() },
        ordenSalidaDetalle: { count: vi.fn(), findMany: vi.fn() }
    }
}));

const FILTROS = { desde: "2026-10-01", hasta: "2026-10-30", pagina: 1, avisos: [] };

function sesionAdministrador(): void {
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
}

describe("buscarProductosAction", () => {
    beforeEach(() => {
        vi.clearAllMocks();
        sesionAdministrador();
    });

    it("no busca con menos de 2 caracteres", async () => {
        expect(await buscarProductosAction("g")).toEqual([]);
        expect(prisma.producto.findMany).not.toHaveBeenCalled();
    });

    it("busca por descripción y por código, máximo 20", async () => {
        vi.mocked(prisma.producto.findMany).mockResolvedValue([{ id: 7, descripcion: "Guantes M", linea: "INSUMOS" }] as never);

        await buscarProductosAction("7");

        expect(prisma.producto.findMany).toHaveBeenCalledWith(expect.objectContaining({
            where: { OR: [{ descripcion: { contains: "7" } }, { id: 7 }] },
            take: 20
        }));
    });
});

describe("consultarSalidasProducto", () => {
    beforeEach(() => {
        vi.clearAllMocks();
        sesionAdministrador();
    });

    it("sin producto no consulta movimientos", async () => {
        const resultado = await consultarSalidasProducto(FILTROS, undefined);

        expect(resultado.producto).toBeNull();
        expect(prisma.ordenSalidaDetalle.count).not.toHaveBeenCalled();
        expect(prisma.$queryRaw).not.toHaveBeenCalled();
    });

    it("calcula totales y pagina las líneas del producto", async () => {
        vi.mocked(prisma.producto.findUnique).mockResolvedValue({ id: 7, descripcion: "Guantes M", linea: "INSUMOS" } as never);
        vi.mocked(prisma.$queryRaw)
            .mockResolvedValueOnce([{ clave: "b1", etiqueta: "Farmacia", cantidad: BigInt(15) }] as never)
            .mockResolvedValueOnce([{ clave: "Consumo Interno", etiqueta: "Consumo Interno", cantidad: BigInt(15) }] as never);
        vi.mocked(prisma.ordenSalidaDetalle.count).mockResolvedValue(1);
        vi.mocked(prisma.ordenSalidaDetalle.findMany).mockResolvedValue([{
            id: "d1",
            lote: "L1",
            cantidad: 15,
            ordenSalida: {
                id: "o1",
                fecha: new Date("2026-10-20T00:00:00.000Z"),
                tipoSalida: "Consumo Interno",
                destino: "Box 1",
                bodega: { nombre: "Farmacia" },
                usuario: { nombre: "Ana", apPaterno: "Pérez" }
            }
        }] as never);

        const resultado = await consultarSalidasProducto(FILTROS, 7);

        expect(resultado.total).toBe(15);
        expect(resultado.porBodega).toEqual([{ clave: "b1", etiqueta: "Farmacia", cantidad: 15 }]);
        expect(resultado.lineas[0]).toEqual({
            id: "d1",
            ordenId: "o1",
            fecha: new Date("2026-10-20T00:00:00.000Z"),
            bodegaNombre: "Farmacia",
            tipoSalida: "Consumo Interno",
            destino: "Box 1",
            lote: "L1",
            cantidad: 15,
            usuarioNombre: "Ana Pérez"
        });
        expect(prisma.ordenSalidaDetalle.count).toHaveBeenCalledWith({
            where: {
                productoId: 7,
                ordenSalida: { fecha: { gte: new Date("2026-10-01T00:00:00.000Z"), lte: new Date("2026-10-30T00:00:00.000Z") } }
            }
        });
    });
});
```

- [ ] **Step 2: Ejecutar y verificar que fallan**

Run: `npx vitest run src/__tests__/salidas-producto.action.test.ts`
Expected: FAIL — módulo inexistente.

- [ ] **Step 3: Implementar**

`src/modules/orden-salida/actions/salidas-producto.action.ts`:

```ts
"use server";

import type { Bodega, Centro } from "@prisma/client";

// lib
import { requireSessionUser } from "@/shared/lib/auth";
import { obtenerAlcanceInventario } from "@/shared/lib/inventario-alcance";
import { crearFiltroMovimientosSeleccion } from "@/shared/lib/inventario-alcance-filtros";
import { prisma } from "@/shared/lib/prisma";

// utils
import {
    construirTotalesPorBodega,
    construirTotalesPorTipo,
    mapearTotales,
    type FilaTotalSql,
    type TotalAgrupado
} from "@/modules/orden-salida/utils/salidas-producto-consulta";
import { rangoFechasDb, type FiltrosRegistros } from "@/shared/utils/filtros-registros";
import { calcularPaginacion, type Paginacion } from "@/shared/utils/paginacion";

const MAXIMO_SUGERENCIAS = 20;

export interface ProductoBuscado {
    id: number;
    descripcion: string;
    linea: string;
}

export interface LineaSalidaProducto {
    id: string;
    ordenId: string;
    fecha: Date;
    bodegaNombre: string;
    tipoSalida: string;
    destino: string;
    lote: string;
    cantidad: number;
    usuarioNombre: string;
}

export interface ResultadoSalidasProducto {
    producto: ProductoBuscado | null;
    total: number;
    porBodega: TotalAgrupado[];
    porTipo: TotalAgrupado[];
    lineas: LineaSalidaProducto[];
    paginacion: Paginacion;
    centros: Centro[];
    bodegas: Bodega[];
    centroId: string | null;
    bodegaId: string | null;
    puedeFiltrarCentro: boolean;
}

export async function buscarProductosAction(texto: string): Promise<ProductoBuscado[]> {
    await requireSessionUser();
    const termino = texto.trim();
    const esCodigo = /^\d+$/.test(termino);

    if (termino.length < 2 && !esCodigo) {
        return [];
    }

    return prisma.producto.findMany({
        where: {
            OR: [
                { descripcion: { contains: termino } },
                ...(esCodigo ? [{ id: Number(termino) }] : [])
            ]
        },
        select: { id: true, descripcion: true, linea: true },
        orderBy: { descripcion: "asc" },
        take: MAXIMO_SUGERENCIAS
    });
}

export async function consultarSalidasProducto(
    filtros: FiltrosRegistros,
    productoId: number | undefined
): Promise<ResultadoSalidasProducto> {
    const alcance = await obtenerAlcanceInventario({ centroId: filtros.centroId, bodegaId: filtros.bodegaId });
    const filtroSeleccion = crearFiltroMovimientosSeleccion(alcance);
    const vacio = {
        total: 0,
        porBodega: [],
        porTipo: [],
        lineas: [],
        paginacion: calcularPaginacion(1, 0),
        centros: alcance.centros,
        bodegas: alcance.bodegas,
        centroId: alcance.centroId,
        bodegaId: alcance.bodegaId,
        puedeFiltrarCentro: alcance.puedeFiltrarCentro
    };

    if (!productoId || !filtroSeleccion) {
        return { ...vacio, producto: null };
    }

    const producto = await prisma.producto.findUnique({
        where: { id: productoId },
        select: { id: true, descripcion: true, linea: true }
    });

    if (!producto) {
        return { ...vacio, producto: null };
    }

    const rango = rangoFechasDb(filtros.desde, filtros.hasta);
    const consulta = { productoId, filtroMovimientos: filtroSeleccion, gte: rango.gte, lte: rango.lte };
    const where = { productoId, ordenSalida: { ...filtroSeleccion, fecha: rango } };
    const [filasBodega, filasTipo, totalLineas] = await Promise.all([
        prisma.$queryRaw<FilaTotalSql[]>(construirTotalesPorBodega(consulta)),
        prisma.$queryRaw<FilaTotalSql[]>(construirTotalesPorTipo(consulta)),
        prisma.ordenSalidaDetalle.count({ where })
    ]);
    const porBodega = mapearTotales(filasBodega);
    const paginacion = calcularPaginacion(filtros.pagina, totalLineas);
    const detalles = await prisma.ordenSalidaDetalle.findMany({
        where,
        select: {
            id: true,
            lote: true,
            cantidad: true,
            ordenSalida: {
                select: {
                    id: true,
                    fecha: true,
                    tipoSalida: true,
                    destino: true,
                    bodega: { select: { nombre: true } },
                    usuario: { select: { nombre: true, apPaterno: true } }
                }
            }
        },
        orderBy: [{ ordenSalida: { fecha: "desc" } }, { id: "desc" }],
        skip: paginacion.skip,
        take: paginacion.tamano
    });

    return {
        ...vacio,
        producto,
        total: porBodega.reduce((suma, fila) => suma + fila.cantidad, 0),
        porBodega,
        porTipo: mapearTotales(filasTipo),
        paginacion,
        lineas: detalles.map((detalle) => ({
            id: detalle.id,
            ordenId: detalle.ordenSalida.id,
            fecha: detalle.ordenSalida.fecha,
            bodegaNombre: detalle.ordenSalida.bodega.nombre,
            tipoSalida: detalle.ordenSalida.tipoSalida,
            destino: detalle.ordenSalida.destino,
            lote: detalle.lote,
            cantidad: detalle.cantidad,
            usuarioNombre: [detalle.ordenSalida.usuario.nombre, detalle.ordenSalida.usuario.apPaterno].filter(Boolean).join(" ")
        }))
    };
}
```

- [ ] **Step 4: Ejecutar y verificar que pasan**

Run: `npx vitest run src/__tests__/salidas-producto.action.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/modules/orden-salida/actions/salidas-producto.action.ts src/__tests__/salidas-producto.action.test.ts
git commit -m "feat(salidas): búsqueda de productos y consulta de salidas por producto"
```

---

### Task 3: Buscador, vista y menú

**Files:**
- Create: `src/modules/orden-salida/components/buscador-producto.tsx`
- Create: `src/modules/orden-salida/components/salidas-producto-resumen.tsx`
- Create: `src/modules/orden-salida/components/salidas-producto-tabla.tsx`
- Create: `src/app/salidas/por-producto/page.tsx`
- Modify: `src/shared/components/layout/menu.ts`
- Modify: `src/__tests__/menu-lateral.test.tsx`
- Test: `src/__tests__/salidas-producto-ui.test.tsx`

**Interfaces:**
- Consumes: Task 2 (`buscarProductosAction`, `consultarSalidasProducto`, `ProductoBuscado`, `LineaSalidaProducto`); `TotalAgrupado`, `leerProductoId` (Task 1); `crearHrefConParametros`, `ValorParametro`, `Paginacion` component, `leerFiltrosRegistros`, `parametrosDeFiltros`, `fechaHoyChile`, `obtenerParametro`, `ParametrosUrl`, `InventarioFiltros` con `children`, `BotonDescargarComprobante`.
- Produces:
  - `BuscadorProducto({ productoActual, parametros }: { productoActual: ProductoBuscado | null; parametros: Record<string, ValorParametro> })`
  - `SalidasProductoResumen({ total, porBodega, porTipo }: { total: number; porBodega: TotalAgrupado[]; porTipo: TotalAgrupado[] })`
  - `SalidasProductoTabla({ lineas }: { lineas: LineaSalidaProducto[] })`

- [ ] **Step 1: Escribir las pruebas**

`src/__tests__/salidas-producto-ui.test.tsx`:

```tsx
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

// actions
import { buscarProductosAction } from "@/modules/orden-salida/actions/salidas-producto.action";

// components
import { BuscadorProducto } from "@/modules/orden-salida/components/buscador-producto";
import { SalidasProductoResumen } from "@/modules/orden-salida/components/salidas-producto-resumen";

const push = vi.fn();

vi.mock("next/navigation", () => ({ useRouter: () => ({ push }) }));
vi.mock("@/modules/orden-salida/actions/salidas-producto.action", () => ({ buscarProductosAction: vi.fn() }));

describe("BuscadorProducto", () => {
    beforeEach(() => {
        vi.clearAllMocks();
    });

    it("sugiere productos y navega conservando los filtros", async () => {
        vi.mocked(buscarProductosAction).mockResolvedValue([{ id: 7, descripcion: "Guantes M", linea: "INSUMOS" }]);

        render(<BuscadorProducto productoActual={null} parametros={{ desde: "2026-10-01", hasta: "2026-10-30" }} />);
        fireEvent.change(screen.getByLabelText("Buscar producto"), { target: { value: "guan" } });

        const opcion = await screen.findByRole("option", { name: /Guantes M/ });
        expect(buscarProductosAction).toHaveBeenCalledWith("guan");

        fireEvent.click(opcion);
        expect(push).toHaveBeenCalledWith("/salidas/por-producto?desde=2026-10-01&hasta=2026-10-30&productoId=7");
    });

    it("no busca con un solo carácter", async () => {
        render(<BuscadorProducto productoActual={null} parametros={{}} />);
        fireEvent.change(screen.getByLabelText("Buscar producto"), { target: { value: "g" } });

        await new Promise((resolver) => setTimeout(resolver, 400));
        expect(buscarProductosAction).not.toHaveBeenCalled();
    });
});

describe("SalidasProductoResumen", () => {
    it("muestra el total y los desgloses", () => {
        render(
            <SalidasProductoResumen
                total={1500}
                porBodega={[{ clave: "b1", etiqueta: "Farmacia", cantidad: 1500 }]}
                porTipo={[{ clave: "Consumo Interno", etiqueta: "Consumo Interno", cantidad: 1500 }]}
            />
        );

        expect(screen.getAllByText("1.500").length).toBeGreaterThanOrEqual(3);
        expect(screen.getByText("Farmacia")).toBeInTheDocument();
        expect(screen.getByText("Consumo Interno")).toBeInTheDocument();
    });
});
```

- [ ] **Step 2: Ejecutar y verificar que fallan**

Run: `npx vitest run src/__tests__/salidas-producto-ui.test.tsx`
Expected: FAIL — componentes inexistentes.

- [ ] **Step 3: Buscador**

`src/modules/orden-salida/components/buscador-producto.tsx`:

```tsx
"use client";

import type * as React from "react";
import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";

// actions
import { buscarProductosAction, type ProductoBuscado } from "@/modules/orden-salida/actions/salidas-producto.action";

// components
import { Input } from "@/shared/components/ui/input";

// utils
import { crearHrefConParametros, type ValorParametro } from "@/shared/utils/paginacion";

const ESPERA_BUSQUEDA_MS = 300;

interface BuscadorProductoProps {
    productoActual: ProductoBuscado | null;
    /** Filtros a conservar al elegir un producto (sin `productoId` ni `pagina`). */
    parametros: Record<string, ValorParametro>;
}

export function BuscadorProducto({ productoActual, parametros }: BuscadorProductoProps): React.ReactElement {
    const router = useRouter();
    const [texto, setTexto] = useState("");
    const [opciones, setOpciones] = useState<ProductoBuscado[]>([]);
    const [buscando, setBuscando] = useState(false);

    useEffect(() => {
        const termino = texto.trim();

        if (termino.length < 2 && !/^\d+$/.test(termino)) {
            setOpciones([]);
            return;
        }

        let vigente = true;
        const temporizador = setTimeout(() => {
            setBuscando(true);
            buscarProductosAction(termino)
                .then((resultado) => {
                    if (vigente) {
                        setOpciones(resultado);
                    }
                })
                .finally(() => {
                    if (vigente) {
                        setBuscando(false);
                    }
                });
        }, ESPERA_BUSQUEDA_MS);

        return () => {
            vigente = false;
            clearTimeout(temporizador);
        };
    }, [texto]);

    function elegir(productoId: number): void {
        setTexto("");
        setOpciones([]);
        router.push(crearHrefConParametros("/salidas/por-producto", { ...parametros, productoId }));
    }

    return (
        <div className="space-y-2">
            <label className="block space-y-1 text-sm">
                <span>Producto</span>
                <Input
                    value={texto}
                    onChange={(evento) => setTexto(evento.currentTarget.value)}
                    placeholder={productoActual ? `${productoActual.descripcion} #${productoActual.id}` : "Busca por nombre o código"}
                    aria-label="Buscar producto"
                />
            </label>
            {buscando ? <p className="text-sm text-muted-foreground">Buscando…</p> : null}
            {opciones.length > 0 ? (
                <ul role="listbox" aria-label="Productos encontrados" className="max-h-64 overflow-auto rounded-md border bg-background">
                    {opciones.map((opcion) => (
                        <li key={opcion.id}>
                            <button
                                type="button"
                                role="option"
                                aria-selected={productoActual?.id === opcion.id}
                                onClick={() => elegir(opcion.id)}
                                className="w-full px-3 py-2 text-left text-sm hover:bg-teal-50"
                            >
                                {opcion.descripcion} <span className="text-muted-foreground">#{opcion.id} · {opcion.linea}</span>
                            </button>
                        </li>
                    ))}
                </ul>
            ) : null}
        </div>
    );
}
```

- [ ] **Step 4: Resumen y tabla**

`src/modules/orden-salida/components/salidas-producto-resumen.tsx`:

```tsx
import type * as React from "react";

// components
import { Table, Td, Th } from "@/shared/components/ui/table";

// utils
import type { TotalAgrupado } from "@/modules/orden-salida/utils/salidas-producto-consulta";
import { formatNumber } from "@/shared/utils/format";

function TablaTotales({ titulo, filas }: { titulo: string; filas: TotalAgrupado[] }): React.ReactElement {
    return (
        <Table>
            <thead>
                <tr>
                    <Th>{titulo}</Th>
                    <Th className="text-right">Unidades</Th>
                </tr>
            </thead>
            <tbody>
                {filas.map((fila) => (
                    <tr key={fila.clave}>
                        <Td>{fila.etiqueta}</Td>
                        <Td className="text-right">{formatNumber(fila.cantidad)}</Td>
                    </tr>
                ))}
            </tbody>
        </Table>
    );
}

export function SalidasProductoResumen({
    total,
    porBodega,
    porTipo
}: {
    total: number;
    porBodega: TotalAgrupado[];
    porTipo: TotalAgrupado[];
}): React.ReactElement {
    return (
        <div className="grid gap-4 lg:grid-cols-[12rem_1fr_1fr]">
            <div className="rounded-md border bg-teal-50 p-4">
                <p className="text-xs uppercase text-teal-800">Total salido</p>
                <p className="text-3xl font-semibold text-teal-900">{formatNumber(total)}</p>
            </div>
            <TablaTotales titulo="Bodega" filas={porBodega} />
            <TablaTotales titulo="Tipo de salida" filas={porTipo} />
        </div>
    );
}
```

`src/modules/orden-salida/components/salidas-producto-tabla.tsx`:

```tsx
import type * as React from "react";

// actions
import type { LineaSalidaProducto } from "@/modules/orden-salida/actions/salidas-producto.action";

// components
import { BotonDescargarComprobante } from "@/modules/orden-salida/components/boton-descargar-comprobante";
import { Table, Td, Th } from "@/shared/components/ui/table";

// utils
import { formatDate, formatNumber } from "@/shared/utils/format";

export function SalidasProductoTabla({ lineas }: { lineas: LineaSalidaProducto[] }): React.ReactElement {
    return (
        <Table>
            <thead>
                <tr>
                    <Th>Fecha</Th>
                    <Th>Bodega</Th>
                    <Th>Tipo</Th>
                    <Th>Destino</Th>
                    <Th>Lote</Th>
                    <Th className="text-right">Cantidad</Th>
                    <Th>Usuario</Th>
                    <Th className="text-right">Comprobante</Th>
                </tr>
            </thead>
            <tbody>
                {lineas.map((linea) => (
                    <tr key={linea.id}>
                        <Td>{formatDate(linea.fecha)}</Td>
                        <Td>{linea.bodegaNombre}</Td>
                        <Td>{linea.tipoSalida}</Td>
                        <Td>{linea.destino}</Td>
                        <Td>{linea.lote}</Td>
                        <Td className="text-right">{formatNumber(linea.cantidad)}</Td>
                        <Td>{linea.usuarioNombre}</Td>
                        <Td className="text-right">
                            <BotonDescargarComprobante ordenId={linea.ordenId} size="sm" label="PDF" />
                        </Td>
                    </tr>
                ))}
                {lineas.length === 0 ? (
                    <tr>
                        <Td colSpan={8} className="text-muted-foreground">
                            No hay salidas de este producto para los filtros seleccionados.
                        </Td>
                    </tr>
                ) : null}
            </tbody>
        </Table>
    );
}
```

- [ ] **Step 5: Página**

`src/app/salidas/por-producto/page.tsx`:

```tsx
import type * as React from "react";

// actions
import { consultarSalidasProducto } from "@/modules/orden-salida/actions/salidas-producto.action";

// components
import { BuscadorProducto } from "@/modules/orden-salida/components/buscador-producto";
import { SalidasProductoResumen } from "@/modules/orden-salida/components/salidas-producto-resumen";
import { SalidasProductoTabla } from "@/modules/orden-salida/components/salidas-producto-tabla";
import { InventarioFiltros } from "@/shared/components/inventario/inventario-filtros";
import { Paginacion } from "@/shared/components/inventario/paginacion";
import { AppLayout } from "@/shared/components/layout/app-layout";
import { Card, CardContent, CardHeader, CardTitle } from "@/shared/components/ui/card";

// utils
import { leerProductoId } from "@/modules/orden-salida/utils/salidas-producto-consulta";
import {
    fechaHoyChile,
    leerFiltrosRegistros,
    obtenerParametro,
    parametrosDeFiltros,
    type ParametrosUrl
} from "@/shared/utils/filtros-registros";

export const dynamic = "force-dynamic";

interface SalidasPorProductoPageProps {
    searchParams?: Promise<ParametrosUrl>;
}

export default async function SalidasPorProductoPage({ searchParams }: SalidasPorProductoPageProps): Promise<React.ReactElement> {
    const params = await searchParams;
    const filtros = leerFiltrosRegistros(params, fechaHoyChile());
    const productoId = leerProductoId(obtenerParametro(params, "productoId"));
    const resultado = await consultarSalidasProducto(filtros, productoId);
    const parametros = parametrosDeFiltros(filtros);

    return (
        <AppLayout>
            <div className="space-y-6">
                <div>
                    <p className="text-sm text-muted-foreground">Gestión de salida</p>
                    <h2 className="text-2xl font-semibold">Salidas por producto</h2>
                </div>
                <Card>
                    <CardHeader>
                        <CardTitle>Producto y filtros</CardTitle>
                    </CardHeader>
                    <CardContent className="space-y-4">
                        <BuscadorProducto productoActual={resultado.producto} parametros={parametros} />
                        {filtros.avisos.map((aviso) => (
                            <p key={aviso} role="status" className="rounded-md border border-amber-200 bg-amber-50 px-3 py-2 text-sm text-amber-900">
                                {aviso}
                            </p>
                        ))}
                        {resultado.producto ? (
                            <InventarioFiltros
                                action="/salidas/por-producto"
                                centros={resultado.centros}
                                bodegas={resultado.bodegas}
                                centroId={resultado.centroId}
                                bodegaId={resultado.bodegaId}
                                puedeFiltrarCentro={resultado.puedeFiltrarCentro}
                                mostrarRangoFechas
                                desde={filtros.desde}
                                hasta={filtros.hasta}
                            >
                                <input type="hidden" name="productoId" value={resultado.producto.id} />
                            </InventarioFiltros>
                        ) : null}
                    </CardContent>
                </Card>
                {resultado.producto ? (
                    <>
                        <Card>
                            <CardHeader>
                                <CardTitle>
                                    {resultado.producto.descripcion} #{resultado.producto.id}
                                </CardTitle>
                            </CardHeader>
                            <CardContent>
                                <SalidasProductoResumen total={resultado.total} porBodega={resultado.porBodega} porTipo={resultado.porTipo} />
                            </CardContent>
                        </Card>
                        <Card>
                            <CardHeader>
                                <CardTitle>Salidas</CardTitle>
                            </CardHeader>
                            <CardContent className="overflow-x-auto">
                                <SalidasProductoTabla lineas={resultado.lineas} />
                                <Paginacion
                                    ruta="/salidas/por-producto"
                                    parametros={{ ...parametros, productoId: resultado.producto.id }}
                                    paginacion={resultado.paginacion}
                                />
                            </CardContent>
                        </Card>
                    </>
                ) : (
                    <Card>
                        <CardContent className="py-10 text-center text-sm text-muted-foreground">
                            Busca un producto para ver sus salidas.
                        </CardContent>
                    </Card>
                )}
            </div>
        </AppLayout>
    );
}
```

- [ ] **Step 6: Agregar la subopción al menú**

En `src/shared/components/layout/menu.ts`: agregar `PackageSearch` al import de `lucide-react` y, en `salida`, después de "Registros de salida":

```ts
        enlace("/salidas/por-producto", "Salidas por producto", PackageSearch)
```

En `src/__tests__/menu-lateral.test.tsx`, en la lista esperada para R01, insertar `"/salidas/por-producto",` después de `"/salidas/registros",`, y agregar:

```ts
    it("muestra 'Salidas por producto' a todos los roles", () => {
        expect(hrefs("R02")).toContain("/salidas/por-producto");
        expect(hrefs("R06")).toContain("/salidas/por-producto");
    });
```

- [ ] **Step 7: Ejecutar pruebas y verificación completa**

Run: `npx vitest run src/__tests__/salidas-producto-ui.test.tsx src/__tests__/menu-lateral.test.tsx && npm test && npx tsc --noEmit && npm run lint && npm run build`
Expected: todo en verde (restaurar `tsconfig.tsbuildinfo` si cambia).

- [ ] **Step 8: Prueba manual local**

Run: `npm run dev`, con un R01:
1. "Gestión de salida → Salidas por producto" muestra el estado vacío.
2. Escribir "guant": aparecen hasta 20 sugerencias; elegir una lleva a `?productoId=<id>` con los últimos 30 días.
3. El total coincide con `SELECT SUM(d.Cantidad) FROM OrdenSalidaDetalle d JOIN OrdenSalida o ON o.ID_OrdenSalida = d.ID_OrdenSalida WHERE d.ID_Product = <id> AND o.Fecha BETWEEN '<desde>' AND '<hasta>';` y es igual a la suma por bodega y a la suma por tipo.
4. Filtrar por bodega y cambiar el rango conserva el producto; paginar conserva todo.
5. El botón "PDF" de una línea descarga el comprobante de su orden.

- [ ] **Step 9: Commit**

```bash
git add src/modules/orden-salida/components src/app/salidas/por-producto src/shared/components/layout/menu.ts src/__tests__/salidas-producto-ui.test.tsx src/__tests__/menu-lateral.test.tsx
git commit -m "feat(salidas): vista de salidas por producto con totales y listado paginado"
```

---

### Task 4: Verificación en producción (después del merge)

- [ ] **Step 1:** Con un administrador, buscar un producto de alto consumo (p. ej. el de mayor `SUM(Cantidad)` del año) y medir `/salidas/por-producto?productoId=<id>` con el rango por defecto y con 12 meses: TTFB < 1 s y respuesta < 200 KB.
- [ ] **Step 2:** Confirmar en server-das que `restart_time` de `inventario-cmv` no sube (mismo comando que la fase 1, Task 9).
- [ ] **Step 3:** Anotar los resultados en el PR de la fase 4.
