# Fase 1 — Navegación por gestión y registros paginados: plan de implementación

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Reorganizar el menú en "Gestión de entrada" y "Gestión de salida", separar el registro de nuevas órdenes de sus registros históricos y paginar esos registros en el servidor, eliminando los 503 de `/orden-salida` y `/orden-entrada`.

**Architecture:** Utilidades puras (filtros por URL, paginación, resumen de detalles) probadas con Vitest; server actions que consultan con `count` + `findMany({ select, skip, take })` y un `groupBy` para el resumen de cada página; páginas de servidor que leen los filtros de `searchParams`. El detalle de una orden se carga bajo demanda desde un modal.

**Tech Stack:** Next.js 15 (App Router, Server Actions), React 19, TypeScript strict, Prisma 6 + MySQL 8.4, Tailwind, Vitest + Testing Library.

**Spec:** `docs/superpowers/specs/2026-10-30-registros-paginados-navegacion-design.md` (secciones 4, 5, 9 fase 1 y 10).

**Fases siguientes (planes aparte):** `2026-10-30-fase-2-stock-nueva-salida.md`, `2026-10-30-fase-3-reporte.md`, `2026-10-30-fase-4-salidas-por-producto.md`.

## Global Constraints

- Idioma español en UI, comentarios, nombres y commits. Indentación de 4 espacios.
- TypeScript strict con tipos explícitos; `interface` para objetos, `type`/`as const` para uniones.
- Imports agrupados con comentarios (`// actions`, `// components`, `// lib`, `// types`, `// utils`, `// config`), alias `@/` → `src/`.
- Server Actions en archivos `*.action.ts` con `"use server"`; solo exportan funciones `async` (los `interface`/`type` exportados se borran al compilar y están permitidos).
- Toda consulta de movimientos o stock aplica el alcance del usuario (`crearFiltroMovimientosAlcance` / `crearFiltroMovimientosSeleccion`).
- Sin `console.log`. Errores de UI con `toast` (sonner).
- Los client components no importan `@/shared/lib/auth` ni `@/shared/lib/prisma` (arrastran NextAuth y Prisma al bundle del navegador).
- Tamaño de página: **50**. Rango por defecto: **últimos 30 días**. Rango máximo: **12 meses**.
- Pruebas en `src/__tests__/*.test.ts(x)` (Vitest solo incluye `src/**`).
- Comandos de verificación: `npm test`, `npx tsc --noEmit` (luego `git checkout tsconfig.tsbuildinfo` si cambió), `npm run lint`, `npm run build`.

## Estructura de archivos

| Archivo | Acción | Responsabilidad |
|---|---|---|
| `prisma/schema.prisma` | Modificar | Índices `OrdenSalida(fecha)`, `OrdenEntrada(fecha)`, `OrdenSalidaDetalle(productoId, ordenSalidaId)` |
| `prisma/migrations/<ts>_indices_registros/` | Crear (generado) | Migración de índices |
| `src/shared/utils/paginacion.ts` | Crear | `TAMANO_PAGINA`, `calcularPaginacion`, `crearHrefConParametros` |
| `src/shared/utils/filtros-registros.ts` | Crear | Lectura y validación de filtros de URL (fechas, centro, bodega, página) |
| `src/shared/utils/registros.ts` | Crear | Resumen "N productos · total unidades" |
| `src/shared/types/registros.ts` | Crear | Tipos compartidos de resultados de registros y detalle de orden |
| `src/shared/lib/inventario-alcance-filtros.ts` | Modificar | `crearFiltroMovimientosSeleccion` (alcance + centro/bodega elegidos) |
| `src/config/auth.ts` | Modificar | `ROLES_OPERAN_ENTRADA`, `ROLES_OPERAN_SALIDA` |
| `src/shared/lib/auth.ts` | Modificar | `puedeOperarEntrada/Salida` usan las constantes |
| `src/shared/components/layout/menu.ts` | Crear | `construirMenu(rolId)`, `aplanarMenu`, `esRutaActiva` |
| `src/shared/components/layout/app-sidebar-shell.tsx` | Modificar | Menú con grupos siempre expandidos; usa `rolId` |
| `src/shared/components/layout/app-layout.tsx` | Modificar | Entrega `rolId` al perfil |
| `src/shared/components/ui/simple-modal.tsx` | Modificar | Prop opcional `onOpenChange` |
| `src/shared/components/inventario/paginacion.tsx` | Crear | Controles de paginación por enlaces |
| `src/shared/components/inventario/inventario-filtros.tsx` | Modificar | Campos opcionales de rango de fechas |
| `src/shared/components/inventario/ver-detalle-orden.tsx` | Crear | Botón "Ver" + modal con detalle cargado bajo demanda |
| `src/shared/components/inventario/sin-permiso-registro.tsx` | Crear | Tarjeta "Sin permiso para registrar" |
| `src/modules/orden-salida/actions/registros-salida.action.ts` | Crear | `listarRegistrosSalida`, `obtenerDetalleOrdenSalida` |
| `src/modules/orden-entrada/actions/registros-entrada.action.ts` | Crear | `listarRegistrosEntrada`, `obtenerDetalleOrdenEntrada` |
| `src/modules/orden-salida/components/registros-salida-tabla.tsx` | Crear | Tabla de registros de salida |
| `src/modules/orden-entrada/components/registros-entrada-tabla.tsx` | Crear | Tabla de registros de entrada |
| `src/app/salidas/registros/page.tsx`, `src/app/entradas/registros/page.tsx` | Crear | Páginas de registros |
| `src/app/salidas/nueva/page.tsx`, `src/app/entradas/nueva/page.tsx` | Crear | Formularios (sin historial) |
| `src/app/orden-salida/page.tsx`, `src/app/orden-entrada/page.tsx` | Reemplazar | Redirecciones |
| `src/modules/orden-salida/actions/orden-salida.action.ts` | Modificar | Quitar `listarOrdenesSalida`; actualizar `revalidatePath` |
| `src/modules/orden-entrada/actions/orden-entrada.action.ts` | Modificar | Quitar `listarOrdenesEntrada`; actualizar `revalidatePath` |
| `src/modules/orden-entrada/components/orden-entrada-table.tsx` | Eliminar | Reemplazada por `registros-entrada-tabla.tsx` |

---

### Task 1: Índices para consultas por fecha y producto

**Files:**
- Modify: `prisma/schema.prisma` (modelos `OrdenEntrada`, `OrdenSalida`, `OrdenSalidaDetalle`)
- Create: `prisma/migrations/<timestamp>_indices_registros/migration.sql` (lo genera Prisma)

**Interfaces:**
- Consumes: nada.
- Produces: índices en base de datos; ningún cambio de tipos.

- [ ] **Step 1: Agregar los índices al esquema**

En `model OrdenEntrada`, junto a los `@@index` existentes:

```prisma
    @@index([fecha])
```

En `model OrdenSalida`:

```prisma
    @@index([fecha])
```

En `model OrdenSalidaDetalle`:

```prisma
    @@index([productoId, ordenSalidaId])
```

- [ ] **Step 2: Generar la migración contra la base local**

Run: `npm run services:up && npm run db:migrate -- --name indices_registros`
Expected: se crea `prisma/migrations/<timestamp>_indices_registros/migration.sql` con tres `CREATE INDEX` y Prisma informa "Your database is now in sync with your schema".

- [ ] **Step 3: Verificar el SQL generado**

Run: `cat prisma/migrations/*_indices_registros/migration.sql`
Expected (nombres pueden variar levemente):

```sql
CREATE INDEX `OrdenEntrada_Fecha_idx` ON `OrdenEntrada`(`Fecha`);
CREATE INDEX `OrdenSalida_Fecha_idx` ON `OrdenSalida`(`Fecha`);
CREATE INDEX `OrdenSalidaDetalle_ID_Product_ID_OrdenSalida_idx` ON `OrdenSalidaDetalle`(`ID_Product`, `ID_OrdenSalida`);
```

- [ ] **Step 4: Commit**

```bash
git add prisma/schema.prisma prisma/migrations
git commit -m "feat(db): índices por fecha de orden y por producto en detalles de salida"
```

---

### Task 2: Utilidades de paginación y filtros de registros

**Files:**
- Create: `src/shared/utils/paginacion.ts`
- Create: `src/shared/utils/filtros-registros.ts`
- Test: `src/__tests__/paginacion.test.ts`
- Test: `src/__tests__/filtros-registros.test.ts`

**Interfaces:**
- Consumes: `obtenerRangoHoyChile` de `src/shared/utils/fechas.ts`.
- Produces:
  - `TAMANO_PAGINA = 50`
  - `interface Paginacion { pagina: number; tamano: number; total: number; paginasTotales: number; skip: number; desde: number; hasta: number }`
  - `calcularPaginacion(paginaSolicitada: number, total: number, tamano?: number): Paginacion`
  - `type ValorParametro = string | number | null | undefined`
  - `crearHrefConParametros(ruta: string, parametros: Record<string, ValorParametro>): string`
  - `type ParametrosUrl = Record<string, string | string[] | undefined>`
  - `interface FiltrosRegistros { desde: string; hasta: string; centroId?: string; bodegaId?: string; pagina: number; avisos: string[] }`
  - `obtenerParametro(params: ParametrosUrl | undefined, clave: string): string | undefined`
  - `fechaHoyChile(referencia?: Date): string` (`YYYY-MM-DD`)
  - `esFechaIsoValida(valor: string): boolean`
  - `sumarDias(fechaIso: string, dias: number): string`
  - `sumarMeses(fechaIso: string, meses: number): string`
  - `leerPagina(valor: string | undefined): number`
  - `leerSeleccion(valor: string | undefined): string | undefined`
  - `leerFiltrosRegistros(params: ParametrosUrl | undefined, hoy: string): FiltrosRegistros`
  - `rangoFechasDb(desde: string, hasta: string): { gte: Date; lte: Date }`
  - `parametrosDeFiltros(filtros: FiltrosRegistros): Record<string, ValorParametro>`

- [ ] **Step 1: Escribir las pruebas de paginación**

`src/__tests__/paginacion.test.ts`:

```ts
import { describe, expect, it } from "vitest";

// utils
import { TAMANO_PAGINA, calcularPaginacion, crearHrefConParametros } from "@/shared/utils/paginacion";

describe("calcularPaginacion", () => {
    it("calcula offset y rango visible de una página intermedia", () => {
        expect(calcularPaginacion(2, 1234)).toEqual({
            pagina: 2,
            tamano: TAMANO_PAGINA,
            total: 1234,
            paginasTotales: 25,
            skip: 50,
            desde: 51,
            hasta: 100
        });
    });

    it("lleva una página fuera de rango a la última", () => {
        const resultado = calcularPaginacion(99, 120);
        expect(resultado.pagina).toBe(3);
        expect(resultado.skip).toBe(100);
        expect(resultado.hasta).toBe(120);
    });

    it("normaliza páginas menores a 1 o no enteras", () => {
        expect(calcularPaginacion(0, 10).pagina).toBe(1);
        expect(calcularPaginacion(-3, 10).pagina).toBe(1);
        expect(calcularPaginacion(Number.NaN, 10).pagina).toBe(1);
    });

    it("sin resultados deja una página y rango 0–0", () => {
        expect(calcularPaginacion(1, 0)).toMatchObject({ pagina: 1, paginasTotales: 1, skip: 0, desde: 0, hasta: 0 });
    });
});

describe("crearHrefConParametros", () => {
    it("omite valores vacíos y conserva el resto", () => {
        expect(crearHrefConParametros("/salidas/registros", {
            desde: "2026-10-01",
            hasta: "2026-10-30",
            bodegaId: undefined,
            centroId: null,
            q: "",
            pagina: 3
        })).toBe("/salidas/registros?desde=2026-10-01&hasta=2026-10-30&pagina=3");
    });

    it("devuelve la ruta sola si no hay parámetros", () => {
        expect(crearHrefConParametros("/stock", {})).toBe("/stock");
    });
});
```

- [ ] **Step 2: Escribir las pruebas de filtros**

`src/__tests__/filtros-registros.test.ts`:

```ts
import { describe, expect, it } from "vitest";

// utils
import {
    esFechaIsoValida,
    fechaHoyChile,
    leerFiltrosRegistros,
    leerPagina,
    parametrosDeFiltros,
    rangoFechasDb,
    sumarDias,
    sumarMeses
} from "@/shared/utils/filtros-registros";

const HOY = "2026-10-30";

describe("fechas ISO", () => {
    it("valida formato y fecha real", () => {
        expect(esFechaIsoValida("2026-10-30")).toBe(true);
        expect(esFechaIsoValida("2026-02-30")).toBe(false);
        expect(esFechaIsoValida("30-10-2026")).toBe(false);
        expect(esFechaIsoValida("")).toBe(false);
    });

    it("suma días y meses respetando fin de mes", () => {
        expect(sumarDias("2026-10-30", -30)).toBe("2026-09-30");
        expect(sumarMeses("2026-10-30", -12)).toBe("2025-10-30");
        expect(sumarMeses("2026-03-31", -1)).toBe("2026-02-28");
    });

    it("obtiene la fecha de hoy en Chile", () => {
        // 30-10-2026 02:00 UTC es 29-10-2026 23:00 en Chile (UTC-3)
        expect(fechaHoyChile(new Date("2026-10-30T02:00:00.000Z"))).toBe("2026-10-29");
    });
});

describe("leerFiltrosRegistros", () => {
    it("usa los últimos 30 días y página 1 por defecto", () => {
        expect(leerFiltrosRegistros(undefined, HOY)).toEqual({
            desde: "2026-09-30",
            hasta: HOY,
            centroId: undefined,
            bodegaId: undefined,
            pagina: 1,
            avisos: []
        });
    });

    it("acepta un rango válido, centro, bodega y página", () => {
        const filtros = leerFiltrosRegistros({
            desde: "2026-01-01",
            hasta: "2026-06-30",
            centroId: "c1",
            bodegaId: ["b1", "b2"],
            pagina: "3"
        }, HOY);

        expect(filtros).toEqual({
            desde: "2026-01-01",
            hasta: "2026-06-30",
            centroId: "c1",
            bodegaId: "b1",
            pagina: 3,
            avisos: []
        });
    });

    it("ignora el valor 'todos' de los selects", () => {
        const filtros = leerFiltrosRegistros({ centroId: "todos", bodegaId: "todos" }, HOY);
        expect(filtros.centroId).toBeUndefined();
        expect(filtros.bodegaId).toBeUndefined();
    });

    it("vuelve al rango por defecto con aviso si una fecha es inválida", () => {
        const filtros = leerFiltrosRegistros({ desde: "2026-13-01", hasta: HOY }, HOY);
        expect(filtros.desde).toBe("2026-09-30");
        expect(filtros.hasta).toBe(HOY);
        expect(filtros.avisos).toEqual(["Las fechas ingresadas no son válidas; se muestran los últimos 30 días."]);
    });

    it("vuelve al rango por defecto con aviso si desde es posterior a hasta", () => {
        const filtros = leerFiltrosRegistros({ desde: "2026-10-10", hasta: "2026-10-01" }, HOY);
        expect(filtros.desde).toBe("2026-09-30");
        expect(filtros.avisos).toEqual(["La fecha desde es posterior a la fecha hasta; se muestran los últimos 30 días."]);
    });

    it("rechaza rangos mayores a 12 meses", () => {
        expect(leerFiltrosRegistros({ desde: "2025-10-30", hasta: HOY }, HOY).avisos).toEqual([]);

        const filtros = leerFiltrosRegistros({ desde: "2025-10-29", hasta: HOY }, HOY);
        expect(filtros.desde).toBe("2026-09-30");
        expect(filtros.avisos).toEqual(["El rango máximo es de 12 meses; se muestran los últimos 30 días."]);
    });

    it("lee la página como entero positivo", () => {
        expect(leerPagina(undefined)).toBe(1);
        expect(leerPagina("abc")).toBe(1);
        expect(leerPagina("0")).toBe(1);
        expect(leerPagina("2.5")).toBe(1);
        expect(leerPagina("7")).toBe(7);
    });
});

describe("rangoFechasDb y parametrosDeFiltros", () => {
    it("convierte el rango a medianoche UTC (columnas @db.Date)", () => {
        expect(rangoFechasDb("2026-10-01", "2026-10-30")).toEqual({
            gte: new Date("2026-10-01T00:00:00.000Z"),
            lte: new Date("2026-10-30T00:00:00.000Z")
        });
    });

    it("devuelve los parámetros de URL sin página ni avisos", () => {
        expect(parametrosDeFiltros({ desde: "2026-10-01", hasta: "2026-10-30", bodegaId: "b1", pagina: 4, avisos: ["x"] })).toEqual({
            desde: "2026-10-01",
            hasta: "2026-10-30",
            centroId: undefined,
            bodegaId: "b1"
        });
    });
});
```

- [ ] **Step 3: Ejecutar las pruebas y verificar que fallan**

Run: `npx vitest run src/__tests__/paginacion.test.ts src/__tests__/filtros-registros.test.ts`
Expected: FAIL — "Failed to resolve import "@/shared/utils/paginacion"".

- [ ] **Step 4: Implementar `paginacion.ts`**

`src/shared/utils/paginacion.ts`:

```ts
export const TAMANO_PAGINA = 50;

export interface Paginacion {
    pagina: number;
    tamano: number;
    total: number;
    paginasTotales: number;
    skip: number;
    desde: number;
    hasta: number;
}

export type ValorParametro = string | number | null | undefined;

/**
 * Normaliza la página pedida contra el total de filas: nunca menor a 1 ni mayor a la última.
 * `desde`/`hasta` son las posiciones (base 1) que se muestran en "Mostrando 51–100 de 1.234".
 */
export function calcularPaginacion(paginaSolicitada: number, total: number, tamano: number = TAMANO_PAGINA): Paginacion {
    const paginasTotales = Math.max(1, Math.ceil(total / tamano));
    const paginaEntera = Number.isInteger(paginaSolicitada) ? paginaSolicitada : 1;
    const pagina = Math.min(Math.max(1, paginaEntera), paginasTotales);
    const skip = (pagina - 1) * tamano;

    return {
        pagina,
        tamano,
        total,
        paginasTotales,
        skip,
        desde: total === 0 ? 0 : skip + 1,
        hasta: Math.min(skip + tamano, total)
    };
}

export function crearHrefConParametros(ruta: string, parametros: Record<string, ValorParametro>): string {
    const busqueda = new URLSearchParams();

    for (const [clave, valor] of Object.entries(parametros)) {
        if (valor === undefined || valor === null || valor === "") {
            continue;
        }
        busqueda.set(clave, String(valor));
    }

    const texto = busqueda.toString();
    return texto.length > 0 ? `${ruta}?${texto}` : ruta;
}
```

- [ ] **Step 5: Implementar `filtros-registros.ts`**

`src/shared/utils/filtros-registros.ts`:

```ts
import { z } from "zod";

// utils
import { obtenerRangoHoyChile } from "@/shared/utils/fechas";
import type { ValorParametro } from "@/shared/utils/paginacion";

export type ParametrosUrl = Record<string, string | string[] | undefined>;

export const DIAS_RANGO_POR_DEFECTO = 30;
export const MESES_RANGO_MAXIMO = 12;

export interface FiltrosRegistros {
    desde: string;
    hasta: string;
    centroId?: string;
    bodegaId?: string;
    pagina: number;
    avisos: string[];
}

const fechaIsoSchema = z.string().regex(/^\d{4}-\d{2}-\d{2}$/);
const paginaSchema = z.coerce.number().int().min(1);

export function obtenerParametro(params: ParametrosUrl | undefined, clave: string): string | undefined {
    const valor = params?.[clave];
    const texto = Array.isArray(valor) ? valor[0] : valor;
    const limpio = texto?.trim();

    return limpio && limpio.length > 0 ? limpio : undefined;
}

export function fechaHoyChile(referencia: Date = new Date()): string {
    return obtenerRangoHoyChile(referencia).fechaInicioLocal.slice(0, 10);
}

export function esFechaIsoValida(valor: string): boolean {
    if (!fechaIsoSchema.safeParse(valor).success) {
        return false;
    }

    const fecha = new Date(`${valor}T00:00:00.000Z`);
    return !Number.isNaN(fecha.getTime()) && fecha.toISOString().slice(0, 10) === valor;
}

export function sumarDias(fechaIso: string, dias: number): string {
    const fecha = new Date(`${fechaIso}T00:00:00.000Z`);
    fecha.setUTCDate(fecha.getUTCDate() + dias);
    return fecha.toISOString().slice(0, 10);
}

/** Suma meses conservando el día; si el mes destino es más corto, usa su último día. */
export function sumarMeses(fechaIso: string, meses: number): string {
    const [anio, mes, dia] = fechaIso.split("-").map(Number);
    const primero = new Date(Date.UTC(anio, mes - 1 + meses, 1));
    const ultimoDia = new Date(Date.UTC(primero.getUTCFullYear(), primero.getUTCMonth() + 1, 0)).getUTCDate();
    primero.setUTCDate(Math.min(dia, ultimoDia));
    return primero.toISOString().slice(0, 10);
}

export function leerPagina(valor: string | undefined): number {
    const resultado = paginaSchema.safeParse(valor);
    return resultado.success ? resultado.data : 1;
}

export function leerSeleccion(valor: string | undefined): string | undefined {
    return valor && valor !== "todos" ? valor : undefined;
}

/**
 * Lee los filtros de los registros desde la URL. Un valor inválido no rompe la página:
 * vuelve al rango por defecto (últimos 30 días) y deja un aviso para mostrar.
 * El centro y la bodega se validan después contra el alcance del usuario.
 */
export function leerFiltrosRegistros(params: ParametrosUrl | undefined, hoy: string): FiltrosRegistros {
    const porDefecto = { desde: sumarDias(hoy, -DIAS_RANGO_POR_DEFECTO), hasta: hoy };
    const desdeUrl = obtenerParametro(params, "desde") ?? porDefecto.desde;
    const hastaUrl = obtenerParametro(params, "hasta") ?? porDefecto.hasta;
    const avisos: string[] = [];
    let rango = { desde: desdeUrl, hasta: hastaUrl };

    if (!esFechaIsoValida(desdeUrl) || !esFechaIsoValida(hastaUrl)) {
        avisos.push("Las fechas ingresadas no son válidas; se muestran los últimos 30 días.");
        rango = porDefecto;
    } else if (desdeUrl > hastaUrl) {
        avisos.push("La fecha desde es posterior a la fecha hasta; se muestran los últimos 30 días.");
        rango = porDefecto;
    } else if (desdeUrl < sumarMeses(hastaUrl, -MESES_RANGO_MAXIMO)) {
        avisos.push("El rango máximo es de 12 meses; se muestran los últimos 30 días.");
        rango = porDefecto;
    }

    return {
        desde: rango.desde,
        hasta: rango.hasta,
        centroId: leerSeleccion(obtenerParametro(params, "centroId")),
        bodegaId: leerSeleccion(obtenerParametro(params, "bodegaId")),
        pagina: leerPagina(obtenerParametro(params, "pagina")),
        avisos
    };
}

/** Las columnas `Fecha` son `@db.Date`: Prisma las guarda a medianoche UTC. */
export function rangoFechasDb(desde: string, hasta: string): { gte: Date; lte: Date } {
    return {
        gte: new Date(`${desde}T00:00:00.000Z`),
        lte: new Date(`${hasta}T00:00:00.000Z`)
    };
}

/** Parámetros de URL que conservan los filtros al paginar (sin `pagina`). */
export function parametrosDeFiltros(filtros: FiltrosRegistros): Record<string, ValorParametro> {
    return {
        desde: filtros.desde,
        hasta: filtros.hasta,
        centroId: filtros.centroId,
        bodegaId: filtros.bodegaId
    };
}
```

- [ ] **Step 6: Ejecutar las pruebas y verificar que pasan**

Run: `npx vitest run src/__tests__/paginacion.test.ts src/__tests__/filtros-registros.test.ts`
Expected: PASS (todas).

- [ ] **Step 7: Commit**

```bash
git add src/shared/utils/paginacion.ts src/shared/utils/filtros-registros.ts src/__tests__/paginacion.test.ts src/__tests__/filtros-registros.test.ts
git commit -m "feat(registros): utilidades de paginación y filtros por URL"
```

---

### Task 3: Filtro de movimientos con la selección de centro y bodega

`crearFiltroMovimientosAlcance` devuelve `{}` para el Administrador aunque haya elegido una bodega; los registros necesitan además aplicar la selección. Para R02/R03/R06/R07 `alcance.centroId` es siempre su propio centro (no una selección), por eso el centro solo se aplica si `puedeFiltrarCentro`.

**Files:**
- Modify: `src/shared/lib/inventario-alcance-filtros.ts`
- Test: `src/__tests__/inventario-alcance-filtros.test.ts`

**Interfaces:**
- Consumes: `InventarioAlcance`, `crearFiltroMovimientosAlcance`.
- Produces:
  - `interface FiltroMovimientosSeleccion { centroId?: string | { in: string[] }; bodegaId?: string | { in: string[] } }`
  - `crearFiltroMovimientosSeleccion(alcance: InventarioAlcance): FiltroMovimientosSeleccion | null`

- [ ] **Step 1: Escribir las pruebas**

Agregar al final de `src/__tests__/inventario-alcance-filtros.test.ts` (reutiliza el helper `crearAlcance` del archivo; importar `crearFiltroMovimientosSeleccion` en el import existente):

```ts
describe("crearFiltroMovimientosSeleccion", () => {
    it("aplica la bodega elegida por el Administrador", () => {
        const alcance = { ...crearAlcance("R01", ["centro-1"], ["b1"]), bodegaId: "b1", centroId: "centro-1" };
        expect(crearFiltroMovimientosSeleccion(alcance)).toEqual({ bodegaId: "b1" });
    });

    it("aplica el centro elegido por el Administrador sin bodega", () => {
        const alcance = { ...crearAlcance("R01", ["centro-1"], ["b1", "b2"]), centroId: "centro-1" };
        expect(crearFiltroMovimientosSeleccion(alcance)).toEqual({ centroId: "centro-1" });
    });

    it("no agrega el centro propio de un Encargado Centro (no es una selección)", () => {
        const alcance = { ...crearAlcance("R02", ["centro-1"], ["b1"]), centroId: "centro-1" };
        expect(crearFiltroMovimientosSeleccion(alcance)).toEqual({ centroId: { in: ["centro-1"] } });
    });

    it("acota a la bodega elegida dentro de las asignadas de un operador", () => {
        const alcance = { ...crearAlcance("R07", ["centro-1"], ["b1"]), bodegaId: "b1" };
        expect(crearFiltroMovimientosSeleccion(alcance)).toEqual({ centroId: { in: ["centro-1"] }, bodegaId: "b1" });
    });

    it("retorna null sin alcance", () => {
        expect(crearFiltroMovimientosSeleccion(crearAlcance("R07", [], []))).toBeNull();
    });
});
```

- [ ] **Step 2: Ejecutar y verificar que fallan**

Run: `npx vitest run src/__tests__/inventario-alcance-filtros.test.ts`
Expected: FAIL — `crearFiltroMovimientosSeleccion is not a function` (o error de import).

- [ ] **Step 3: Implementar**

Agregar en `src/shared/lib/inventario-alcance-filtros.ts`, después de `crearFiltroMovimientosAlcance`:

```ts
export interface FiltroMovimientosSeleccion {
    centroId?: string | { in: string[] };
    bodegaId?: string | { in: string[] };
}

/**
 * Filtro de historiales con el alcance del usuario más la selección de los filtros de pantalla.
 * La bodega elegida ya viene validada contra el alcance (`normalizarSeleccion`).
 * El centro solo se aplica cuando el rol puede elegirlo (R01); para el resto es su centro fijo.
 */
export function crearFiltroMovimientosSeleccion(alcance: InventarioAlcance): FiltroMovimientosSeleccion | null {
    const filtro = crearFiltroMovimientosAlcance(alcance);

    if (!filtro) {
        return null;
    }

    if (alcance.bodegaId) {
        return { ...filtro, bodegaId: alcance.bodegaId };
    }

    if (alcance.puedeFiltrarCentro && alcance.centroId) {
        return { ...filtro, centroId: alcance.centroId };
    }

    return filtro;
}
```

- [ ] **Step 4: Ejecutar y verificar que pasan**

Run: `npx vitest run src/__tests__/inventario-alcance-filtros.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/shared/lib/inventario-alcance-filtros.ts src/__tests__/inventario-alcance-filtros.test.ts
git commit -m "feat(alcance): filtro de movimientos con centro y bodega seleccionados"
```

---

### Task 4: Componentes compartidos — paginación, rango de fechas y modal con apertura notificada

**Files:**
- Create: `src/shared/components/inventario/paginacion.tsx`
- Modify: `src/shared/components/inventario/inventario-filtros.tsx`
- Modify: `src/shared/components/ui/simple-modal.tsx`
- Test: `src/__tests__/paginacion-ui.test.tsx`

**Interfaces:**
- Consumes: `Paginacion`, `ValorParametro`, `crearHrefConParametros` (Task 2).
- Produces:
  - `Paginacion({ ruta, parametros, paginacion }: { ruta: string; parametros: Record<string, ValorParametro>; paginacion: Paginacion }): React.ReactElement` (export `Paginacion` desde `@/shared/components/inventario/paginacion`; el tipo de datos se importa como `type Paginacion as DatosPaginacion`)
  - `InventarioFiltros` acepta además `mostrarRangoFechas?: boolean; desde?: string; hasta?: string`
  - `SimpleModal` acepta además `onOpenChange?: (abierto: boolean) => void`

- [ ] **Step 1: Escribir las pruebas**

`src/__tests__/paginacion-ui.test.tsx`:

```tsx
import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";

// components
import { InventarioFiltros } from "@/shared/components/inventario/inventario-filtros";
import { Paginacion } from "@/shared/components/inventario/paginacion";

// utils
import { calcularPaginacion } from "@/shared/utils/paginacion";

describe("Paginacion", () => {
    it("muestra el rango y enlaces que conservan los filtros", () => {
        render(
            <Paginacion
                ruta="/salidas/registros"
                parametros={{ desde: "2026-10-01", hasta: "2026-10-30" }}
                paginacion={calcularPaginacion(2, 1234)}
            />
        );

        expect(screen.getByText("Mostrando 51–100 de 1.234")).toBeInTheDocument();
        expect(screen.getByRole("link", { name: "Siguiente" })).toHaveAttribute(
            "href",
            "/salidas/registros?desde=2026-10-01&hasta=2026-10-30&pagina=3"
        );
        expect(screen.getByRole("link", { name: "Primera" })).toHaveAttribute(
            "href",
            "/salidas/registros?desde=2026-10-01&hasta=2026-10-30&pagina=1"
        );
    });

    it("deshabilita anterior/primera en la primera página", () => {
        render(<Paginacion ruta="/stock" parametros={{}} paginacion={calcularPaginacion(1, 10)} />);

        expect(screen.queryByRole("link", { name: "Anterior" })).not.toBeInTheDocument();
        expect(screen.getByText("Anterior")).toHaveAttribute("aria-disabled", "true");
    });
});

describe("InventarioFiltros con rango de fechas", () => {
    it("muestra desde y hasta con los valores actuales", () => {
        render(
            <InventarioFiltros
                action="/salidas/registros"
                centros={[]}
                bodegas={[]}
                centroId={null}
                bodegaId={null}
                puedeFiltrarCentro={false}
                mostrarRangoFechas
                desde="2026-10-01"
                hasta="2026-10-30"
            />
        );

        expect(screen.getByLabelText("Desde")).toHaveValue("2026-10-01");
        expect(screen.getByLabelText("Hasta")).toHaveValue("2026-10-30");
    });
});
```

- [ ] **Step 2: Ejecutar y verificar que fallan**

Run: `npx vitest run src/__tests__/paginacion-ui.test.tsx`
Expected: FAIL — no se puede resolver `@/shared/components/inventario/paginacion`.

- [ ] **Step 3: Implementar `paginacion.tsx`**

`src/shared/components/inventario/paginacion.tsx` (componente de servidor, sin `"use client"`):

```tsx
import Link from "next/link";
import type * as React from "react";

// utils
import { formatNumber } from "@/shared/utils/format";
import { crearHrefConParametros, type Paginacion as DatosPaginacion, type ValorParametro } from "@/shared/utils/paginacion";

interface PaginacionProps {
    ruta: string;
    parametros: Record<string, ValorParametro>;
    paginacion: DatosPaginacion;
}

interface EnlacePaginacion {
    etiqueta: string;
    destino: number;
    deshabilitado: boolean;
}

export function Paginacion({ ruta, parametros, paginacion }: PaginacionProps): React.ReactElement {
    const { pagina, paginasTotales, total, desde, hasta } = paginacion;
    const enlaces: EnlacePaginacion[] = [
        { etiqueta: "Primera", destino: 1, deshabilitado: pagina === 1 },
        { etiqueta: "Anterior", destino: pagina - 1, deshabilitado: pagina === 1 },
        { etiqueta: "Siguiente", destino: pagina + 1, deshabilitado: pagina === paginasTotales },
        { etiqueta: "Última", destino: paginasTotales, deshabilitado: pagina === paginasTotales }
    ];

    return (
        <nav aria-label="Paginación" className="flex flex-wrap items-center justify-between gap-3 pt-4 text-sm">
            <p className="text-muted-foreground">
                {total === 0 ? "Sin resultados" : `Mostrando ${formatNumber(desde)}–${formatNumber(hasta)} de ${formatNumber(total)}`}
            </p>
            <div className="flex flex-wrap items-center gap-1">
                {enlaces.map((enlace) =>
                    enlace.deshabilitado ? (
                        <span
                            key={enlace.etiqueta}
                            aria-disabled="true"
                            className="rounded-md border px-3 py-1.5 text-muted-foreground opacity-50"
                        >
                            {enlace.etiqueta}
                        </span>
                    ) : (
                        <Link
                            key={enlace.etiqueta}
                            href={crearHrefConParametros(ruta, { ...parametros, pagina: enlace.destino })}
                            className="rounded-md border px-3 py-1.5 text-slate-700 hover:bg-teal-50"
                        >
                            {enlace.etiqueta}
                        </Link>
                    )
                )}
                <span className="px-2 text-muted-foreground">
                    Página {formatNumber(pagina)} de {formatNumber(paginasTotales)}
                </span>
            </div>
        </nav>
    );
}
```

- [ ] **Step 4: Agregar el rango de fechas a `InventarioFiltros`**

En `src/shared/components/inventario/inventario-filtros.tsx`:

1. Agregar a `InventarioFiltrosProps`:

```ts
    mostrarRangoFechas?: boolean;
    desde?: string;
    hasta?: string;
```

2. Agregarlas a la desestructuración con valores por defecto: `mostrarRangoFechas = false, desde = "", hasta = ""`.

3. Insertar antes del bloque `{mostrarBusqueda ? (`:

```tsx
            {mostrarRangoFechas ? (
                <>
                    <label className="space-y-1 text-sm">
                        <span>Desde</span>
                        <Input type="date" name="desde" defaultValue={desde} aria-label="Desde" />
                    </label>
                    <label className="space-y-1 text-sm">
                        <span>Hasta</span>
                        <Input type="date" name="hasta" defaultValue={hasta} aria-label="Hasta" />
                    </label>
                </>
            ) : null}
```

4. Cambiar la grilla del `<form>` de `md:grid-cols-4` a `md:grid-cols-3 xl:grid-cols-6` para que entren seis campos.

- [ ] **Step 5: Agregar `onOpenChange` a `SimpleModal`**

En `src/shared/components/ui/simple-modal.tsx`:

```tsx
interface SimpleModalProps {
    title: string;
    triggerLabel: string;
    triggerClassName?: string;
    children: React.ReactNode;
    onOpenChange?: (abierto: boolean) => void;
}

export function SimpleModal({ title, triggerLabel, triggerClassName, children, onOpenChange }: SimpleModalProps): React.ReactElement {
    const [open, setOpen] = useState(false);
    const titleId = useId();

    function cambiarApertura(abierto: boolean): void {
        setOpen(abierto);
        onOpenChange?.(abierto);
    }
```

y reemplazar `onClick={() => setOpen(true)}` por `onClick={() => cambiarApertura(true)}` y `onClick={() => setOpen(false)}` por `onClick={() => cambiarApertura(false)}`.

- [ ] **Step 6: Ejecutar las pruebas**

Run: `npx vitest run src/__tests__/paginacion-ui.test.tsx src/__tests__/auditoria-filtros.test.tsx`
Expected: PASS.

- [ ] **Step 7: Commit**

```bash
git add src/shared/components/inventario/paginacion.tsx src/shared/components/inventario/inventario-filtros.tsx src/shared/components/ui/simple-modal.tsx src/__tests__/paginacion-ui.test.tsx
git commit -m "feat(ui): paginación por enlaces, rango de fechas en filtros y apertura notificada del modal"
```

---

### Task 5: Menú lateral con "Gestión de entrada" y "Gestión de salida"

Además corrige un bug existente: el menú comparaba `profile.rol` (la descripción, p. ej. "Administrador") con `"R01"`, así que el enlace a Auditoría nunca aparecía. El perfil pasa a llevar `rolId`.

**Files:**
- Modify: `src/config/auth.ts`
- Modify: `src/shared/lib/auth.ts:79-85`
- Create: `src/shared/components/layout/menu.ts`
- Modify: `src/shared/components/layout/app-sidebar-shell.tsx`
- Modify: `src/shared/components/layout/app-layout.tsx`
- Modify: `src/__tests__/auditoria-navegacion.test.tsx`
- Test: `src/__tests__/menu-lateral.test.tsx`

**Interfaces:**
- Consumes: `ROL_ADMINISTRADOR`.
- Produces:
  - `ROLES_OPERAN_ENTRADA = ["R01", "R03", "R06", "R07"] as const`, `ROLES_OPERAN_SALIDA = ["R01", "R03", "R07"] as const` en `src/config/auth.ts`
  - `interface EnlaceMenu { tipo: "enlace"; href: string; label: string; icon: LucideIcon }`
  - `interface GrupoMenu { tipo: "grupo"; label: string; icon: LucideIcon; items: EnlaceMenu[] }`
  - `type ItemMenu = EnlaceMenu | GrupoMenu`
  - `construirMenu(rolId: string): ItemMenu[]`
  - `aplanarMenu(items: ItemMenu[]): EnlaceMenu[]`
  - `esRutaActiva(pathname: string, href: string): boolean`
  - `LayoutUserProfile` gana `rolId: string`

- [ ] **Step 1: Escribir las pruebas**

`src/__tests__/menu-lateral.test.tsx`:

```tsx
import { render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

// components
import { AppSidebarShell } from "@/shared/components/layout/app-sidebar-shell";
import { aplanarMenu, construirMenu, esRutaActiva } from "@/shared/components/layout/menu";

vi.mock("next/navigation", () => ({
    usePathname: () => "/salidas/registros"
}));

vi.mock("@/modules/auth/actions/auth.action", () => ({
    cerrarSesion: vi.fn()
}));

function hrefs(rolId: string): string[] {
    return aplanarMenu(construirMenu(rolId)).map((item) => item.href);
}

describe("construirMenu", () => {
    it("agrupa entrada y salida con sus subopciones para el Administrador", () => {
        const menu = construirMenu("R01");
        const grupos = menu.filter((item) => item.tipo === "grupo");

        expect(grupos.map((grupo) => grupo.label)).toEqual(["Gestión de entrada", "Gestión de salida"]);
        expect(hrefs("R01")).toEqual([
            "/",
            "/stock",
            "/productos",
            "/entradas/nueva",
            "/entradas/registros",
            "/salidas/nueva",
            "/salidas/registros",
            "/reporte",
            "/mantenedores",
            "/auditoria"
        ]);
    });

    it("oculta 'Nueva…' a quien no puede registrar y Auditoría a quien no es R01", () => {
        expect(hrefs("R02")).not.toContain("/entradas/nueva");
        expect(hrefs("R02")).not.toContain("/salidas/nueva");
        expect(hrefs("R02")).not.toContain("/auditoria");
        expect(hrefs("R06")).toContain("/entradas/nueva");
        expect(hrefs("R06")).not.toContain("/salidas/nueva");
    });
});

describe("esRutaActiva", () => {
    it("marca la ruta exacta y sus subrutas, pero Resumen solo en '/'", () => {
        expect(esRutaActiva("/salidas/registros", "/salidas/registros")).toBe(true);
        expect(esRutaActiva("/stock/algo", "/stock")).toBe(true);
        expect(esRutaActiva("/stocks", "/stock")).toBe(false);
        expect(esRutaActiva("/stock", "/")).toBe(false);
        expect(esRutaActiva("/", "/")).toBe(true);
    });
});

describe("AppSidebarShell", () => {
    it("muestra los encabezados de grupo y marca la subopción activa", () => {
        render(
            <AppSidebarShell
                profile={{
                    nombreCompleto: "Encargado Centro",
                    email: "encargado@cmvalparaiso.cl",
                    rol: "Encargado Centro",
                    rolId: "R02",
                    centro: "CESFAM Barón",
                    bodegas: []
                }}
            >
                <div>Contenido</div>
            </AppSidebarShell>
        );

        expect(screen.getByText("Gestión de entrada")).toBeInTheDocument();
        expect(screen.getByText("Gestión de salida")).toBeInTheDocument();
        expect(screen.queryByText("Nueva salida")).not.toBeInTheDocument();
        expect(screen.getAllByRole("link", { name: "Registros de salida" })[0]).toHaveClass("bg-teal-600");
    });
});
```

- [ ] **Step 2: Actualizar la prueba existente de Auditoría**

En `src/__tests__/auditoria-navegacion.test.tsx`, en ambos `profile`, cambiar `rol: "R01"` por `rol: "Administrador", rolId: "R01"` y `rol: "R07"` por `rol: "Operador Salida", rolId: "R07"`.

- [ ] **Step 3: Ejecutar y verificar que fallan**

Run: `npx vitest run src/__tests__/menu-lateral.test.tsx src/__tests__/auditoria-navegacion.test.tsx`
Expected: FAIL — no existe `@/shared/components/layout/menu`; error de tipos/props por `rolId`.

- [ ] **Step 4: Constantes de roles**

En `src/config/auth.ts`, después de `ROL_ENCARGADO_CENTRO`:

```ts
export const ROLES_OPERAN_ENTRADA = ["R01", "R03", "R06", "R07"] as const;
export const ROLES_OPERAN_SALIDA = ["R01", "R03", "R07"] as const;
```

En `src/shared/lib/auth.ts`, importar ambas constantes en el import de `@/config/auth` y reemplazar:

```ts
export function puedeOperarEntrada(rol: string): boolean {
    return (ROLES_OPERAN_ENTRADA as readonly string[]).includes(rol);
}

export function puedeOperarSalida(rol: string): boolean {
    return (ROLES_OPERAN_SALIDA as readonly string[]).includes(rol);
}
```

- [ ] **Step 5: Crear `menu.ts`**

`src/shared/components/layout/menu.ts`:

```ts
import {
    Archive,
    ArrowDownToLine,
    ArrowUpFromLine,
    Boxes,
    FileBarChart,
    History,
    ListOrdered,
    Package,
    PackageMinus,
    PackagePlus,
    SlidersHorizontal,
    type LucideIcon
} from "lucide-react";

// config
import { ROL_ADMINISTRADOR, ROLES_OPERAN_ENTRADA, ROLES_OPERAN_SALIDA } from "@/config/auth";

export interface EnlaceMenu {
    tipo: "enlace";
    href: string;
    label: string;
    icon: LucideIcon;
}

export interface GrupoMenu {
    tipo: "grupo";
    label: string;
    icon: LucideIcon;
    items: EnlaceMenu[];
}

export type ItemMenu = EnlaceMenu | GrupoMenu;

function enlace(href: string, label: string, icon: LucideIcon): EnlaceMenu {
    return { tipo: "enlace", href, label, icon };
}

function incluyeRol(roles: readonly string[], rolId: string): boolean {
    return roles.includes(rolId);
}

/** Menú lateral según el rol (`rolId`, p. ej. "R01"). Las subopciones "Nueva…" solo para quien puede registrar. */
export function construirMenu(rolId: string): ItemMenu[] {
    const entrada: EnlaceMenu[] = [
        ...(incluyeRol(ROLES_OPERAN_ENTRADA, rolId) ? [enlace("/entradas/nueva", "Nueva entrada", PackagePlus)] : []),
        enlace("/entradas/registros", "Registros de entrada", ListOrdered)
    ];
    const salida: EnlaceMenu[] = [
        ...(incluyeRol(ROLES_OPERAN_SALIDA, rolId) ? [enlace("/salidas/nueva", "Nueva salida", PackageMinus)] : []),
        enlace("/salidas/registros", "Registros de salida", ListOrdered)
    ];

    return [
        enlace("/", "Resumen", Boxes),
        enlace("/stock", "Stock", Archive),
        enlace("/productos", "Productos", Package),
        { tipo: "grupo", label: "Gestión de entrada", icon: ArrowDownToLine, items: entrada },
        { tipo: "grupo", label: "Gestión de salida", icon: ArrowUpFromLine, items: salida },
        enlace("/reporte", "Reporte", FileBarChart),
        enlace("/mantenedores", "Mantenedores", SlidersHorizontal),
        ...(rolId === ROL_ADMINISTRADOR ? [enlace("/auditoria", "Auditoría", History)] : [])
    ];
}

export function aplanarMenu(items: ItemMenu[]): EnlaceMenu[] {
    return items.flatMap((item) => (item.tipo === "grupo" ? item.items : [item]));
}

export function esRutaActiva(pathname: string, href: string): boolean {
    if (href === "/") {
        return pathname === "/";
    }

    return pathname === href || pathname.startsWith(`${href}/`);
}
```

- [ ] **Step 6: Renderizar el menú con grupos en `app-sidebar-shell.tsx`**

1. Agregar `rolId: string;` a `LayoutUserProfile` (después de `rol`).
2. Eliminar `baseNavItems`, el `useMemo` de `navItems`, el import de `ROL_ADMINISTRADOR` y los íconos que ya no se usan en este archivo (`Archive`, `Boxes`, `ClipboardList`, `FileBarChart`, `History`, `Package`, `SlidersHorizontal`). Conservar `Building2`, `HeartPulse`, `PanelLeftClose`, `PanelLeftOpen`, `ShieldCheck`, `Warehouse`.
3. Importar:

```ts
// components
import { aplanarMenu, construirMenu, esRutaActiva, type EnlaceMenu } from "@/shared/components/layout/menu";
```

4. Dentro del componente:

```ts
    const menu = useMemo(() => construirMenu(profile.rolId), [profile.rolId]);
    const enlacesMoviles = useMemo(() => aplanarMenu(menu).slice(1, 5), [menu]);
```

5. Reemplazar el contenido de `<nav className={cn("space-y-1 p-3", isCollapsed && "px-2")}>` por:

```tsx
                        {menu.map((item) =>
                            item.tipo === "enlace" ? (
                                <EnlaceLateral
                                    key={item.href}
                                    item={item}
                                    activo={esRutaActiva(pathname, item.href)}
                                    colapsado={isCollapsed}
                                />
                            ) : (
                                <div key={item.label} role="group" aria-label={item.label} className="space-y-1">
                                    {!isCollapsed && (
                                        <p className="flex items-center gap-3 px-3 pt-3 text-xs font-semibold uppercase text-slate-500">
                                            <item.icon className="h-4 w-4 shrink-0" />
                                            {item.label}
                                        </p>
                                    )}
                                    {item.items.map((subItem) => (
                                        <EnlaceLateral
                                            key={subItem.href}
                                            item={subItem}
                                            activo={esRutaActiva(pathname, subItem.href)}
                                            colapsado={isCollapsed}
                                            sangria
                                        />
                                    ))}
                                </div>
                            )
                        )}
```

6. En el header móvil, reemplazar `navItems.slice(1, 5).map(` por `enlacesMoviles.map(`.

7. Agregar al final del archivo:

```tsx
function EnlaceLateral({
    item,
    activo,
    colapsado,
    sangria = false
}: {
    item: EnlaceMenu;
    activo: boolean;
    colapsado: boolean;
    sangria?: boolean;
}): React.ReactElement {
    return (
        <Link
            href={item.href}
            title={colapsado ? item.label : undefined}
            aria-label={item.label}
            aria-current={activo ? "page" : undefined}
            className={cn(
                "flex h-10 items-center rounded-md text-sm font-medium transition-colors",
                colapsado ? "justify-center px-2" : "gap-3 px-3",
                sangria && !colapsado && "pl-9",
                activo
                    ? "bg-teal-600 text-white shadow-sm shadow-teal-900/10"
                    : "text-slate-600 hover:bg-teal-50 hover:text-teal-800"
            )}
        >
            <item.icon className="h-4 w-4 shrink-0" />
            {!colapsado && <span className="truncate">{item.label}</span>}
        </Link>
    );
}
```

- [ ] **Step 7: Entregar `rolId` desde `app-layout.tsx`**

En `obtenerLayoutUserProfile`, agregar `rolId: true,` al `select` de `prisma.usuario.findUnique` y `rolId: usuario.rolId,` al objeto retornado (después de `rol`).

- [ ] **Step 8: Ejecutar las pruebas**

Run: `npx vitest run src/__tests__/menu-lateral.test.tsx src/__tests__/auditoria-navegacion.test.tsx`
Expected: PASS.

- [ ] **Step 9: Commit**

```bash
git add src/config/auth.ts src/shared/lib/auth.ts src/shared/components/layout src/__tests__/menu-lateral.test.tsx src/__tests__/auditoria-navegacion.test.tsx
git commit -m "feat(menu): grupos Gestión de entrada y de salida; corrige visibilidad de Auditoría por rolId"
```

---

### Task 6: Registros de salida

**Files:**
- Create: `src/shared/types/registros.ts`
- Create: `src/shared/utils/registros.ts`
- Create: `src/modules/orden-salida/actions/registros-salida.action.ts`
- Create: `src/shared/components/inventario/ver-detalle-orden.tsx`
- Create: `src/modules/orden-salida/components/registros-salida-tabla.tsx`
- Create: `src/app/salidas/registros/page.tsx`
- Test: `src/__tests__/registros-resumen.test.ts`
- Test: `src/__tests__/registros-salida.action.test.ts`

**Interfaces:**
- Consumes: `FiltrosRegistros`, `rangoFechasDb`, `parametrosDeFiltros`, `leerFiltrosRegistros`, `fechaHoyChile` (Task 2); `calcularPaginacion`, `Paginacion` (Task 2); `crearFiltroMovimientosSeleccion` (Task 3); `Paginacion` component, `InventarioFiltros` con fechas, `SimpleModal.onOpenChange` (Task 4); `BotonDescargarComprobante`, `BotonEnviarComprobante`, `EstadoCorreoBadge` existentes.
- Produces:
  - `interface ResultadoRegistros<T> { filas: T[]; paginacion: Paginacion; centros: Centro[]; bodegas: Bodega[]; centroId: string | null; bodegaId: string | null; puedeFiltrarCentro: boolean; puedeOperar: boolean }`
  - `interface DetalleOrdenLinea { id: string; productoId: number; producto: string; lote: string; fechaCaducidad: Date; cantidad: number }`
  - `interface DetalleOrdenResultado { ok: boolean; message: string; lineas: DetalleOrdenLinea[] }`
  - `interface ResumenDetalles { productos: number; unidades: number }`
  - `indexarResumenDetalles(grupos: Array<{ ordenId: string; productos: number; unidades: number | null }>): Map<string, ResumenDetalles>`
  - `formatearResumenDetalles(resumen: ResumenDetalles): string`
  - `interface RegistroSalidaFila { id: string; fecha: Date; tipoSalida: string; destino: string; bodegaNombre: string; usuarioNombre: string; productos: number; unidades: number; enviarCorreo: boolean; fechaEnvioCorreo: Date | null; errorEnvioCorreo: string | null; correoDestino: string | null }`
  - `listarRegistrosSalida(filtros: FiltrosRegistros): Promise<ResultadoRegistros<RegistroSalidaFila>>`
  - `obtenerDetalleOrdenSalida(ordenId: string): Promise<DetalleOrdenResultado>`
  - `VerDetalleOrden({ ordenId, tipo }: { ordenId: string; tipo: TipoOrden })` con `type TipoOrden = "salida"`; Task 7 lo amplía a `"entrada" | "salida"`.

- [ ] **Step 1: Tipos compartidos**

`src/shared/types/registros.ts`:

```ts
import type { Bodega, Centro } from "@prisma/client";

// utils
import type { Paginacion } from "@/shared/utils/paginacion";

export interface ResultadoRegistros<T> {
    filas: T[];
    paginacion: Paginacion;
    centros: Centro[];
    bodegas: Bodega[];
    centroId: string | null;
    bodegaId: string | null;
    puedeFiltrarCentro: boolean;
    puedeOperar: boolean;
}

export interface DetalleOrdenLinea {
    id: string;
    productoId: number;
    producto: string;
    lote: string;
    fechaCaducidad: Date;
    cantidad: number;
}

export interface DetalleOrdenResultado {
    ok: boolean;
    message: string;
    lineas: DetalleOrdenLinea[];
}
```

- [ ] **Step 2: Pruebas del resumen**

`src/__tests__/registros-resumen.test.ts`:

```ts
import { describe, expect, it } from "vitest";

// utils
import { formatearResumenDetalles, indexarResumenDetalles } from "@/shared/utils/registros";

describe("resumen de detalles por orden", () => {
    it("indexa por orden y trata la suma nula como 0", () => {
        const mapa = indexarResumenDetalles([
            { ordenId: "o1", productos: 3, unidades: 120 },
            { ordenId: "o2", productos: 1, unidades: null }
        ]);

        expect(mapa.get("o1")).toEqual({ productos: 3, unidades: 120 });
        expect(mapa.get("o2")).toEqual({ productos: 1, unidades: 0 });
        expect(mapa.get("o3")).toBeUndefined();
    });

    it("formatea con singular y separador de miles", () => {
        expect(formatearResumenDetalles({ productos: 1, unidades: 1 })).toBe("1 producto · 1 unidad");
        expect(formatearResumenDetalles({ productos: 12, unidades: 1500 })).toBe("12 productos · 1.500 unidades");
    });
});
```

- [ ] **Step 3: Pruebas de la action**

`src/__tests__/registros-salida.action.test.ts`:

```ts
import { beforeEach, describe, expect, it, vi } from "vitest";

// lib
import * as authLib from "@/shared/lib/auth";
import { prisma } from "@/shared/lib/prisma";

// actions
import { listarRegistrosSalida, obtenerDetalleOrdenSalida } from "@/modules/orden-salida/actions/registros-salida.action";

vi.mock("@/auth", () => ({ auth: vi.fn() }));

vi.mock("@/shared/lib/auth", async (importOriginal) => {
    const original = await importOriginal<typeof import("@/shared/lib/auth")>();
    return { ...original, requireSessionUser: vi.fn() };
});

vi.mock("@/shared/lib/prisma", () => ({
    prisma: {
        centro: { findMany: vi.fn(), findFirst: vi.fn() },
        bodega: { findMany: vi.fn(), findFirst: vi.fn() },
        encargadosBodega: { findMany: vi.fn() },
        ordenSalida: { count: vi.fn(), findMany: vi.fn(), findFirst: vi.fn() },
        ordenSalidaDetalle: { groupBy: vi.fn() }
    }
}));

const centroBaron = { id: "centro-1", nombre: "CESFAM Barón", estado: true };
const bodegaFarmacia = { id: "b1", nombre: "Bodega Farmacia", centroId: "centro-1", estado: true };
const FILTROS = { desde: "2026-10-01", hasta: "2026-10-30", pagina: 1, avisos: [] };

function sesionOperadorFarmacia(): void {
    vi.mocked(authLib.requireSessionUser).mockResolvedValue({
        id: "user-operador",
        nombre: "Operador",
        apPaterno: "Farmacia",
        email: "operador@cmvalparaiso.cl",
        rol: "R07",
        centroId: "centro-1",
        bodegaId: "b1"
    });
    vi.mocked(prisma.centro.findFirst).mockResolvedValue(centroBaron as never);
    vi.mocked(prisma.encargadosBodega.findMany).mockResolvedValue([]);
    vi.mocked(prisma.bodega.findFirst).mockResolvedValue(bodegaFarmacia as never);
}

describe("listarRegistrosSalida", () => {
    beforeEach(() => {
        vi.clearAllMocks();
    });

    it("pagina en el servidor con alcance, rango de fechas y select acotado", async () => {
        sesionOperadorFarmacia();
        vi.mocked(prisma.ordenSalida.count).mockResolvedValue(120);
        vi.mocked(prisma.ordenSalida.findMany).mockResolvedValue([
            {
                id: "o1",
                fecha: new Date("2026-10-20T00:00:00.000Z"),
                tipoSalida: "Consumo Interno",
                destino: "Box 1",
                enviarCorreo: false,
                fechaEnvioCorreo: null,
                errorEnvioCorreo: null,
                correoDestino: null,
                bodega: { nombre: "Bodega Farmacia" },
                usuario: { nombre: "Ana", apPaterno: "Pérez" }
            }
        ] as never);
        vi.mocked(prisma.ordenSalidaDetalle.groupBy).mockResolvedValue([
            { ordenSalidaId: "o1", _count: { _all: 2 }, _sum: { cantidad: 30 } }
        ] as never);

        const resultado = await listarRegistrosSalida({ ...FILTROS, pagina: 3 });

        const where = {
            centroId: { in: ["centro-1"] },
            bodegaId: { in: ["b1"] },
            fecha: { gte: new Date("2026-10-01T00:00:00.000Z"), lte: new Date("2026-10-30T00:00:00.000Z") }
        };
        expect(prisma.ordenSalida.count).toHaveBeenCalledWith({ where });
        expect(prisma.ordenSalida.findMany).toHaveBeenCalledWith(expect.objectContaining({ where, skip: 100, take: 50 }));
        expect(vi.mocked(prisma.ordenSalida.findMany).mock.calls[0][0]).not.toHaveProperty("include");
        expect(resultado.paginacion).toMatchObject({ pagina: 3, total: 120, paginasTotales: 3 });
        expect(resultado.filas[0]).toMatchObject({ id: "o1", bodegaNombre: "Bodega Farmacia", usuarioNombre: "Ana Pérez", productos: 2, unidades: 30 });
        expect(resultado.puedeOperar).toBe(true);
    });

    it("no consulta sin alcance", async () => {
        sesionOperadorFarmacia();
        vi.mocked(prisma.bodega.findFirst).mockResolvedValue(null);

        const resultado = await listarRegistrosSalida(FILTROS);

        expect(resultado.filas).toEqual([]);
        expect(prisma.ordenSalida.count).not.toHaveBeenCalled();
    });
});

describe("obtenerDetalleOrdenSalida", () => {
    beforeEach(() => {
        vi.clearAllMocks();
    });

    it("busca la orden dentro del alcance y devuelve sus líneas", async () => {
        sesionOperadorFarmacia();
        vi.mocked(prisma.ordenSalida.findFirst).mockResolvedValue({
            detalles: [
                {
                    id: "d1",
                    productoId: 7,
                    lote: "L1",
                    fechaCaducidad: new Date("2027-01-01T00:00:00.000Z"),
                    cantidad: 5,
                    producto: { descripcion: "Guantes M" }
                }
            ]
        } as never);

        const resultado = await obtenerDetalleOrdenSalida("o1");

        expect(prisma.ordenSalida.findFirst).toHaveBeenCalledWith(expect.objectContaining({
            where: { id: "o1", centroId: { in: ["centro-1"] }, bodegaId: { in: ["b1"] } }
        }));
        expect(resultado).toEqual({
            ok: true,
            message: "",
            lineas: [{ id: "d1", productoId: 7, producto: "Guantes M", lote: "L1", fechaCaducidad: new Date("2027-01-01T00:00:00.000Z"), cantidad: 5 }]
        });
    });

    it("informa cuando la orden no existe o está fuera del alcance", async () => {
        sesionOperadorFarmacia();
        vi.mocked(prisma.ordenSalida.findFirst).mockResolvedValue(null);

        expect(await obtenerDetalleOrdenSalida("otra")).toEqual({ ok: false, message: "Orden no encontrada.", lineas: [] });
    });
});
```

- [ ] **Step 4: Ejecutar y verificar que fallan**

Run: `npx vitest run src/__tests__/registros-resumen.test.ts src/__tests__/registros-salida.action.test.ts`
Expected: FAIL — imports inexistentes.

- [ ] **Step 5: Implementar `registros.ts`**

`src/shared/utils/registros.ts`:

```ts
// utils
import { formatNumber } from "@/shared/utils/format";

export interface ResumenDetalles {
    productos: number;
    unidades: number;
}

export function indexarResumenDetalles(
    grupos: Array<{ ordenId: string; productos: number; unidades: number | null }>
): Map<string, ResumenDetalles> {
    return new Map(grupos.map((grupo) => [grupo.ordenId, { productos: grupo.productos, unidades: grupo.unidades ?? 0 }]));
}

export function formatearResumenDetalles(resumen: ResumenDetalles): string {
    const productos = `${formatNumber(resumen.productos)} ${resumen.productos === 1 ? "producto" : "productos"}`;
    const unidades = `${formatNumber(resumen.unidades)} ${resumen.unidades === 1 ? "unidad" : "unidades"}`;
    return `${productos} · ${unidades}`;
}
```

- [ ] **Step 6: Implementar `registros-salida.action.ts`**

`src/modules/orden-salida/actions/registros-salida.action.ts`:

```ts
"use server";

// lib
import { puedeOperarSalida } from "@/shared/lib/auth";
import { obtenerAlcanceInventario } from "@/shared/lib/inventario-alcance";
import { crearFiltroMovimientosAlcance, crearFiltroMovimientosSeleccion } from "@/shared/lib/inventario-alcance-filtros";
import { prisma } from "@/shared/lib/prisma";

// types
import type { DetalleOrdenResultado, ResultadoRegistros } from "@/shared/types/registros";

// utils
import { rangoFechasDb, type FiltrosRegistros } from "@/shared/utils/filtros-registros";
import { calcularPaginacion } from "@/shared/utils/paginacion";
import { indexarResumenDetalles } from "@/shared/utils/registros";

export interface RegistroSalidaFila {
    id: string;
    fecha: Date;
    tipoSalida: string;
    destino: string;
    bodegaNombre: string;
    usuarioNombre: string;
    productos: number;
    unidades: number;
    enviarCorreo: boolean;
    fechaEnvioCorreo: Date | null;
    errorEnvioCorreo: string | null;
    correoDestino: string | null;
}

export async function listarRegistrosSalida(filtros: FiltrosRegistros): Promise<ResultadoRegistros<RegistroSalidaFila>> {
    const alcance = await obtenerAlcanceInventario({ centroId: filtros.centroId, bodegaId: filtros.bodegaId });
    const filtroSeleccion = crearFiltroMovimientosSeleccion(alcance);
    const base = {
        centros: alcance.centros,
        bodegas: alcance.bodegas,
        centroId: alcance.centroId,
        bodegaId: alcance.bodegaId,
        puedeFiltrarCentro: alcance.puedeFiltrarCentro,
        puedeOperar: puedeOperarSalida(alcance.usuario.rol)
    };

    if (!filtroSeleccion) {
        return { ...base, filas: [], paginacion: calcularPaginacion(1, 0) };
    }

    const where = { ...filtroSeleccion, fecha: rangoFechasDb(filtros.desde, filtros.hasta) };
    const total = await prisma.ordenSalida.count({ where });
    const paginacion = calcularPaginacion(filtros.pagina, total);
    const ordenes = await prisma.ordenSalida.findMany({
        where,
        select: {
            id: true,
            fecha: true,
            tipoSalida: true,
            destino: true,
            enviarCorreo: true,
            fechaEnvioCorreo: true,
            errorEnvioCorreo: true,
            correoDestino: true,
            bodega: { select: { nombre: true } },
            usuario: { select: { nombre: true, apPaterno: true } }
        },
        orderBy: [{ fecha: "desc" }, { id: "desc" }],
        skip: paginacion.skip,
        take: paginacion.tamano
    });
    const grupos = ordenes.length > 0
        ? await prisma.ordenSalidaDetalle.groupBy({
              by: ["ordenSalidaId"],
              where: { ordenSalidaId: { in: ordenes.map((orden) => orden.id) } },
              _count: { _all: true },
              _sum: { cantidad: true }
          })
        : [];
    const resumen = indexarResumenDetalles(
        grupos.map((grupo) => ({ ordenId: grupo.ordenSalidaId, productos: grupo._count._all, unidades: grupo._sum.cantidad }))
    );

    return {
        ...base,
        paginacion,
        filas: ordenes.map((orden) => ({
            id: orden.id,
            fecha: orden.fecha,
            tipoSalida: orden.tipoSalida,
            destino: orden.destino,
            bodegaNombre: orden.bodega.nombre,
            usuarioNombre: [orden.usuario.nombre, orden.usuario.apPaterno].filter(Boolean).join(" "),
            enviarCorreo: orden.enviarCorreo,
            fechaEnvioCorreo: orden.fechaEnvioCorreo,
            errorEnvioCorreo: orden.errorEnvioCorreo,
            correoDestino: orden.correoDestino,
            ...(resumen.get(orden.id) ?? { productos: 0, unidades: 0 })
        }))
    };
}

export async function obtenerDetalleOrdenSalida(ordenId: string): Promise<DetalleOrdenResultado> {
    try {
        const filtro = crearFiltroMovimientosAlcance(await obtenerAlcanceInventario());

        if (!filtro) {
            return { ok: false, message: "No tienes centro o bodega asignada.", lineas: [] };
        }

        const orden = await prisma.ordenSalida.findFirst({
            where: { id: ordenId, ...filtro },
            select: {
                detalles: {
                    select: {
                        id: true,
                        productoId: true,
                        lote: true,
                        fechaCaducidad: true,
                        cantidad: true,
                        producto: { select: { descripcion: true } }
                    },
                    orderBy: { producto: { descripcion: "asc" } }
                }
            }
        });

        if (!orden) {
            return { ok: false, message: "Orden no encontrada.", lineas: [] };
        }

        return {
            ok: true,
            message: "",
            lineas: orden.detalles.map((detalle) => ({
                id: detalle.id,
                productoId: detalle.productoId,
                producto: detalle.producto.descripcion,
                lote: detalle.lote,
                fechaCaducidad: detalle.fechaCaducidad,
                cantidad: detalle.cantidad
            }))
        };
    } catch {
        return { ok: false, message: "No fue posible cargar el detalle de la orden.", lineas: [] };
    }
}
```

- [ ] **Step 7: Ejecutar las pruebas**

Run: `npx vitest run src/__tests__/registros-resumen.test.ts src/__tests__/registros-salida.action.test.ts`
Expected: PASS.

- [ ] **Step 8: Componente "Ver detalle"**

`src/shared/components/inventario/ver-detalle-orden.tsx`:

```tsx
"use client";

import type * as React from "react";
import { useState } from "react";

// actions
import { obtenerDetalleOrdenSalida } from "@/modules/orden-salida/actions/registros-salida.action";

// components
import { SimpleModal } from "@/shared/components/ui/simple-modal";
import { Table, Td, Th } from "@/shared/components/ui/table";

// types
import type { DetalleOrdenResultado } from "@/shared/types/registros";

// utils
import { formatDate, formatNumber } from "@/shared/utils/format";

// La Task 7 amplía a "entrada" | "salida".
type TipoOrden = "salida";

const CARGADORES: Record<TipoOrden, (ordenId: string) => Promise<DetalleOrdenResultado>> = {
    salida: obtenerDetalleOrdenSalida
};

export function VerDetalleOrden({ ordenId, tipo }: { ordenId: string; tipo: TipoOrden }): React.ReactElement {
    const [resultado, setResultado] = useState<DetalleOrdenResultado | null>(null);

    async function cargar(abierto: boolean): Promise<void> {
        if (!abierto || resultado?.ok) {
            return;
        }
        setResultado(null);
        setResultado(await CARGADORES[tipo](ordenId));
    }

    return (
        <SimpleModal title="Detalle de la orden" triggerLabel="Ver" onOpenChange={(abierto) => void cargar(abierto)}>
            {resultado === null ? (
                <p className="text-sm text-muted-foreground">Cargando detalle…</p>
            ) : !resultado.ok ? (
                <p className="text-sm text-destructive">{resultado.message}</p>
            ) : (
                <Table>
                    <thead>
                        <tr>
                            <Th>Producto</Th>
                            <Th>Lote</Th>
                            <Th>Caducidad</Th>
                            <Th className="text-right">Cantidad</Th>
                        </tr>
                    </thead>
                    <tbody>
                        {resultado.lineas.map((linea) => (
                            <tr key={linea.id}>
                                <Td>{linea.producto} #{linea.productoId}</Td>
                                <Td>{linea.lote}</Td>
                                <Td>{formatDate(linea.fechaCaducidad)}</Td>
                                <Td className="text-right">{formatNumber(linea.cantidad)}</Td>
                            </tr>
                        ))}
                    </tbody>
                </Table>
            )}
        </SimpleModal>
    );
}
```

- [ ] **Step 9: Tabla de registros de salida**

`src/modules/orden-salida/components/registros-salida-tabla.tsx` (componente de servidor; los botones son client components existentes):

```tsx
import type * as React from "react";

// actions
import type { RegistroSalidaFila } from "@/modules/orden-salida/actions/registros-salida.action";

// components
import { BotonDescargarComprobante } from "@/modules/orden-salida/components/boton-descargar-comprobante";
import { BotonEnviarComprobante } from "@/modules/orden-salida/components/boton-enviar-comprobante";
import { EstadoCorreoBadge } from "@/modules/orden-salida/components/estado-correo-badge";
import { VerDetalleOrden } from "@/shared/components/inventario/ver-detalle-orden";
import { Table, Td, Th } from "@/shared/components/ui/table";

// utils
import { formatDate } from "@/shared/utils/format";
import { formatearResumenDetalles } from "@/shared/utils/registros";

export function RegistrosSalidaTabla({ filas, puedeOperar }: { filas: RegistroSalidaFila[]; puedeOperar: boolean }): React.ReactElement {
    return (
        <Table>
            <thead>
                <tr>
                    <Th>Fecha</Th>
                    <Th>Tipo</Th>
                    <Th>Destino</Th>
                    <Th>Bodega</Th>
                    <Th>Usuario</Th>
                    <Th>Productos</Th>
                    <Th>Correo</Th>
                    <Th className="text-right">Acciones</Th>
                </tr>
            </thead>
            <tbody>
                {filas.map((fila) => (
                    <tr key={fila.id}>
                        <Td>{formatDate(fila.fecha)}</Td>
                        <Td>{fila.tipoSalida}</Td>
                        <Td>{fila.destino}</Td>
                        <Td>{fila.bodegaNombre}</Td>
                        <Td>{fila.usuarioNombre}</Td>
                        <Td className="whitespace-nowrap">{formatearResumenDetalles(fila)}</Td>
                        <Td>
                            <EstadoCorreoBadge
                                enviado={fila.enviarCorreo}
                                fechaEnvio={fila.fechaEnvioCorreo}
                                error={fila.errorEnvioCorreo}
                                correoDestino={fila.correoDestino}
                            />
                        </Td>
                        <Td className="text-right">
                            <div className="flex justify-end gap-2">
                                <VerDetalleOrden ordenId={fila.id} tipo="salida" />
                                <BotonDescargarComprobante ordenId={fila.id} size="sm" />
                                {puedeOperar ? <BotonEnviarComprobante ordenId={fila.id} correoInicial={fila.correoDestino} /> : null}
                            </div>
                        </Td>
                    </tr>
                ))}
                {filas.length === 0 ? (
                    <tr>
                        <Td colSpan={8} className="text-muted-foreground">
                            No hay salidas para los filtros seleccionados.
                        </Td>
                    </tr>
                ) : null}
            </tbody>
        </Table>
    );
}
```

- [ ] **Step 10: Página `/salidas/registros`**

`src/app/salidas/registros/page.tsx`:

```tsx
import type * as React from "react";

// actions
import { listarRegistrosSalida } from "@/modules/orden-salida/actions/registros-salida.action";

// components
import { RegistrosSalidaTabla } from "@/modules/orden-salida/components/registros-salida-tabla";
import { InventarioFiltros } from "@/shared/components/inventario/inventario-filtros";
import { Paginacion } from "@/shared/components/inventario/paginacion";
import { AppLayout } from "@/shared/components/layout/app-layout";
import { Card, CardContent, CardHeader, CardTitle } from "@/shared/components/ui/card";

// utils
import { fechaHoyChile, leerFiltrosRegistros, parametrosDeFiltros, type ParametrosUrl } from "@/shared/utils/filtros-registros";

export const dynamic = "force-dynamic";

interface RegistrosSalidaPageProps {
    searchParams?: Promise<ParametrosUrl>;
}

export default async function RegistrosSalidaPage({ searchParams }: RegistrosSalidaPageProps): Promise<React.ReactElement> {
    const filtros = leerFiltrosRegistros(await searchParams, fechaHoyChile());
    const resultado = await listarRegistrosSalida(filtros);

    return (
        <AppLayout>
            <div className="space-y-6">
                <div>
                    <p className="text-sm text-muted-foreground">Gestión de salida</p>
                    <h2 className="text-2xl font-semibold">Registros de salida</h2>
                </div>
                <Card>
                    <CardHeader>
                        <CardTitle>Filtros</CardTitle>
                    </CardHeader>
                    <CardContent className="space-y-3">
                        {filtros.avisos.map((aviso) => (
                            <p key={aviso} role="status" className="rounded-md border border-amber-200 bg-amber-50 px-3 py-2 text-sm text-amber-900">
                                {aviso}
                            </p>
                        ))}
                        <InventarioFiltros
                            action="/salidas/registros"
                            centros={resultado.centros}
                            bodegas={resultado.bodegas}
                            centroId={resultado.centroId}
                            bodegaId={resultado.bodegaId}
                            puedeFiltrarCentro={resultado.puedeFiltrarCentro}
                            mostrarRangoFechas
                            desde={filtros.desde}
                            hasta={filtros.hasta}
                        />
                    </CardContent>
                </Card>
                <Card>
                    <CardHeader>
                        <CardTitle>Salidas registradas</CardTitle>
                    </CardHeader>
                    <CardContent className="overflow-x-auto">
                        <RegistrosSalidaTabla filas={resultado.filas} puedeOperar={resultado.puedeOperar} />
                        <Paginacion ruta="/salidas/registros" parametros={parametrosDeFiltros(filtros)} paginacion={resultado.paginacion} />
                    </CardContent>
                </Card>
            </div>
        </AppLayout>
    );
}
```

- [ ] **Step 11: Verificar tipos y pruebas**

Run: `npx tsc --noEmit && npm test`
Expected: tsc sin errores; suite en verde. Si `tsconfig.tsbuildinfo` cambió: `git checkout tsconfig.tsbuildinfo`.

- [ ] **Step 12: Commit**

```bash
git add src/shared/types/registros.ts src/shared/utils/registros.ts src/modules/orden-salida/actions/registros-salida.action.ts src/modules/orden-salida/components/registros-salida-tabla.tsx src/shared/components/inventario/ver-detalle-orden.tsx src/app/salidas/registros src/__tests__/registros-resumen.test.ts src/__tests__/registros-salida.action.test.ts
git commit -m "feat(salidas): registros de salida paginados con filtros y detalle bajo demanda"
```

---

### Task 7: Registros de entrada

**Files:**
- Create: `src/modules/orden-entrada/actions/registros-entrada.action.ts`
- Create: `src/modules/orden-entrada/components/registros-entrada-tabla.tsx`
- Create: `src/app/entradas/registros/page.tsx`
- Modify: `src/shared/components/inventario/ver-detalle-orden.tsx`
- Test: `src/__tests__/registros-entrada.action.test.ts`

**Interfaces:**
- Consumes: todo lo de Task 6 (`ResultadoRegistros`, `DetalleOrdenResultado`, `indexarResumenDetalles`, `formatearResumenDetalles`, `VerDetalleOrden`).
- Produces:
  - `interface RegistroEntradaFila { id: string; fecha: Date; origen: string; bodegaNombre: string; usuarioNombre: string; productos: number; unidades: number }`
  - `listarRegistrosEntrada(filtros: FiltrosRegistros): Promise<ResultadoRegistros<RegistroEntradaFila>>`
  - `obtenerDetalleOrdenEntrada(ordenId: string): Promise<DetalleOrdenResultado>`
  - `VerDetalleOrden` acepta `tipo: "entrada" | "salida"`.

- [ ] **Step 1: Pruebas de la action**

`src/__tests__/registros-entrada.action.test.ts`:

```ts
import { beforeEach, describe, expect, it, vi } from "vitest";

// lib
import * as authLib from "@/shared/lib/auth";
import { prisma } from "@/shared/lib/prisma";

// actions
import { listarRegistrosEntrada, obtenerDetalleOrdenEntrada } from "@/modules/orden-entrada/actions/registros-entrada.action";

vi.mock("@/auth", () => ({ auth: vi.fn() }));

vi.mock("@/shared/lib/auth", async (importOriginal) => {
    const original = await importOriginal<typeof import("@/shared/lib/auth")>();
    return { ...original, requireSessionUser: vi.fn() };
});

vi.mock("@/shared/lib/prisma", () => ({
    prisma: {
        centro: { findMany: vi.fn(), findFirst: vi.fn() },
        bodega: { findMany: vi.fn(), findFirst: vi.fn() },
        encargadosBodega: { findMany: vi.fn() },
        ordenEntrada: { count: vi.fn(), findMany: vi.fn(), findFirst: vi.fn() },
        ordenEntradaDetalle: { groupBy: vi.fn() }
    }
}));

const centroBaron = { id: "centro-1", nombre: "CESFAM Barón", estado: true };
const bodegaFarmacia = { id: "b1", nombre: "Bodega Farmacia", centroId: "centro-1", estado: true };
const FILTROS = { desde: "2026-10-01", hasta: "2026-10-30", pagina: 1, avisos: [] };

function sesionAdministrador(): void {
    vi.mocked(authLib.requireSessionUser).mockResolvedValue({
        id: "user-admin",
        nombre: "Admin",
        apPaterno: "Comunal",
        email: "admin@cmvalparaiso.cl",
        rol: "R01",
        centroId: "centro-1",
        bodegaId: null
    });
    vi.mocked(prisma.centro.findMany).mockResolvedValue([centroBaron] as never);
    vi.mocked(prisma.bodega.findMany).mockResolvedValue([bodegaFarmacia] as never);
}

describe("listarRegistrosEntrada", () => {
    beforeEach(() => {
        vi.clearAllMocks();
    });

    it("aplica la bodega elegida por el Administrador y resume los detalles", async () => {
        sesionAdministrador();
        vi.mocked(prisma.ordenEntrada.count).mockResolvedValue(1);
        vi.mocked(prisma.ordenEntrada.findMany).mockResolvedValue([
            {
                id: "e1",
                fecha: new Date("2026-10-15T00:00:00.000Z"),
                origen: "Cenabast",
                bodega: { nombre: "Bodega Farmacia" },
                usuario: { nombre: "Luis", apPaterno: null }
            }
        ] as never);
        vi.mocked(prisma.ordenEntradaDetalle.groupBy).mockResolvedValue([
            { ordenEntradaId: "e1", _count: { _all: 4 }, _sum: { cantidad: 400 } }
        ] as never);

        const resultado = await listarRegistrosEntrada({ ...FILTROS, bodegaId: "b1" });

        expect(prisma.ordenEntrada.count).toHaveBeenCalledWith({
            where: {
                bodegaId: "b1",
                fecha: { gte: new Date("2026-10-01T00:00:00.000Z"), lte: new Date("2026-10-30T00:00:00.000Z") }
            }
        });
        expect(resultado.filas[0]).toEqual({
            id: "e1",
            fecha: new Date("2026-10-15T00:00:00.000Z"),
            origen: "Cenabast",
            bodegaNombre: "Bodega Farmacia",
            usuarioNombre: "Luis",
            productos: 4,
            unidades: 400
        });
    });
});

describe("obtenerDetalleOrdenEntrada", () => {
    it("informa cuando la orden no existe", async () => {
        sesionAdministrador();
        vi.mocked(prisma.ordenEntrada.findFirst).mockResolvedValue(null);

        expect(await obtenerDetalleOrdenEntrada("x")).toEqual({ ok: false, message: "Orden no encontrada.", lineas: [] });
        expect(prisma.ordenEntrada.findFirst).toHaveBeenCalledWith(expect.objectContaining({ where: { id: "x" } }));
    });
});
```

- [ ] **Step 2: Ejecutar y verificar que fallan**

Run: `npx vitest run src/__tests__/registros-entrada.action.test.ts`
Expected: FAIL — módulo inexistente.

- [ ] **Step 3: Implementar `registros-entrada.action.ts`**

`src/modules/orden-entrada/actions/registros-entrada.action.ts`:

```ts
"use server";

// lib
import { puedeOperarEntrada } from "@/shared/lib/auth";
import { obtenerAlcanceInventario } from "@/shared/lib/inventario-alcance";
import { crearFiltroMovimientosAlcance, crearFiltroMovimientosSeleccion } from "@/shared/lib/inventario-alcance-filtros";
import { prisma } from "@/shared/lib/prisma";

// types
import type { DetalleOrdenResultado, ResultadoRegistros } from "@/shared/types/registros";

// utils
import { rangoFechasDb, type FiltrosRegistros } from "@/shared/utils/filtros-registros";
import { calcularPaginacion } from "@/shared/utils/paginacion";
import { indexarResumenDetalles } from "@/shared/utils/registros";

export interface RegistroEntradaFila {
    id: string;
    fecha: Date;
    origen: string;
    bodegaNombre: string;
    usuarioNombre: string;
    productos: number;
    unidades: number;
}

export async function listarRegistrosEntrada(filtros: FiltrosRegistros): Promise<ResultadoRegistros<RegistroEntradaFila>> {
    const alcance = await obtenerAlcanceInventario({ centroId: filtros.centroId, bodegaId: filtros.bodegaId });
    const filtroSeleccion = crearFiltroMovimientosSeleccion(alcance);
    const base = {
        centros: alcance.centros,
        bodegas: alcance.bodegas,
        centroId: alcance.centroId,
        bodegaId: alcance.bodegaId,
        puedeFiltrarCentro: alcance.puedeFiltrarCentro,
        puedeOperar: puedeOperarEntrada(alcance.usuario.rol)
    };

    if (!filtroSeleccion) {
        return { ...base, filas: [], paginacion: calcularPaginacion(1, 0) };
    }

    const where = { ...filtroSeleccion, fecha: rangoFechasDb(filtros.desde, filtros.hasta) };
    const total = await prisma.ordenEntrada.count({ where });
    const paginacion = calcularPaginacion(filtros.pagina, total);
    const ordenes = await prisma.ordenEntrada.findMany({
        where,
        select: {
            id: true,
            fecha: true,
            origen: true,
            bodega: { select: { nombre: true } },
            usuario: { select: { nombre: true, apPaterno: true } }
        },
        orderBy: [{ fecha: "desc" }, { id: "desc" }],
        skip: paginacion.skip,
        take: paginacion.tamano
    });
    const grupos = ordenes.length > 0
        ? await prisma.ordenEntradaDetalle.groupBy({
              by: ["ordenEntradaId"],
              where: { ordenEntradaId: { in: ordenes.map((orden) => orden.id) } },
              _count: { _all: true },
              _sum: { cantidad: true }
          })
        : [];
    const resumen = indexarResumenDetalles(
        grupos.map((grupo) => ({ ordenId: grupo.ordenEntradaId, productos: grupo._count._all, unidades: grupo._sum.cantidad }))
    );

    return {
        ...base,
        paginacion,
        filas: ordenes.map((orden) => ({
            id: orden.id,
            fecha: orden.fecha,
            origen: orden.origen,
            bodegaNombre: orden.bodega.nombre,
            usuarioNombre: [orden.usuario.nombre, orden.usuario.apPaterno].filter(Boolean).join(" "),
            ...(resumen.get(orden.id) ?? { productos: 0, unidades: 0 })
        }))
    };
}

export async function obtenerDetalleOrdenEntrada(ordenId: string): Promise<DetalleOrdenResultado> {
    try {
        const filtro = crearFiltroMovimientosAlcance(await obtenerAlcanceInventario());

        if (!filtro) {
            return { ok: false, message: "No tienes centro o bodega asignada.", lineas: [] };
        }

        const orden = await prisma.ordenEntrada.findFirst({
            where: { id: ordenId, ...filtro },
            select: {
                detalles: {
                    select: {
                        id: true,
                        productoId: true,
                        lote: true,
                        fechaCaducidad: true,
                        cantidad: true,
                        producto: { select: { descripcion: true } }
                    },
                    orderBy: { producto: { descripcion: "asc" } }
                }
            }
        });

        if (!orden) {
            return { ok: false, message: "Orden no encontrada.", lineas: [] };
        }

        return {
            ok: true,
            message: "",
            lineas: orden.detalles.map((detalle) => ({
                id: detalle.id,
                productoId: detalle.productoId,
                producto: detalle.producto.descripcion,
                lote: detalle.lote,
                fechaCaducidad: detalle.fechaCaducidad,
                cantidad: detalle.cantidad
            }))
        };
    } catch {
        return { ok: false, message: "No fue posible cargar el detalle de la orden.", lineas: [] };
    }
}
```

- [ ] **Step 4: Habilitar `"entrada"` en `VerDetalleOrden`**

En `src/shared/components/inventario/ver-detalle-orden.tsx`:

```tsx
// actions
import { obtenerDetalleOrdenEntrada } from "@/modules/orden-entrada/actions/registros-entrada.action";
import { obtenerDetalleOrdenSalida } from "@/modules/orden-salida/actions/registros-salida.action";
```

```tsx
type TipoOrden = "entrada" | "salida";

const CARGADORES: Record<TipoOrden, (ordenId: string) => Promise<DetalleOrdenResultado>> = {
    entrada: obtenerDetalleOrdenEntrada,
    salida: obtenerDetalleOrdenSalida
};
```

- [ ] **Step 5: Tabla de registros de entrada**

`src/modules/orden-entrada/components/registros-entrada-tabla.tsx`:

```tsx
import type * as React from "react";

// actions
import type { RegistroEntradaFila } from "@/modules/orden-entrada/actions/registros-entrada.action";

// components
import { VerDetalleOrden } from "@/shared/components/inventario/ver-detalle-orden";
import { Table, Td, Th } from "@/shared/components/ui/table";

// utils
import { formatDate } from "@/shared/utils/format";
import { formatearResumenDetalles } from "@/shared/utils/registros";

export function RegistrosEntradaTabla({ filas }: { filas: RegistroEntradaFila[] }): React.ReactElement {
    return (
        <Table>
            <thead>
                <tr>
                    <Th>Fecha</Th>
                    <Th>Origen</Th>
                    <Th>Bodega</Th>
                    <Th>Usuario</Th>
                    <Th>Productos</Th>
                    <Th className="text-right">Acciones</Th>
                </tr>
            </thead>
            <tbody>
                {filas.map((fila) => (
                    <tr key={fila.id}>
                        <Td>{formatDate(fila.fecha)}</Td>
                        <Td>{fila.origen}</Td>
                        <Td>{fila.bodegaNombre}</Td>
                        <Td>{fila.usuarioNombre}</Td>
                        <Td className="whitespace-nowrap">{formatearResumenDetalles(fila)}</Td>
                        <Td className="text-right">
                            <VerDetalleOrden ordenId={fila.id} tipo="entrada" />
                        </Td>
                    </tr>
                ))}
                {filas.length === 0 ? (
                    <tr>
                        <Td colSpan={6} className="text-muted-foreground">
                            No hay entradas para los filtros seleccionados.
                        </Td>
                    </tr>
                ) : null}
            </tbody>
        </Table>
    );
}
```

- [ ] **Step 6: Página `/entradas/registros`**

`src/app/entradas/registros/page.tsx`:

```tsx
import type * as React from "react";

// actions
import { listarRegistrosEntrada } from "@/modules/orden-entrada/actions/registros-entrada.action";

// components
import { RegistrosEntradaTabla } from "@/modules/orden-entrada/components/registros-entrada-tabla";
import { InventarioFiltros } from "@/shared/components/inventario/inventario-filtros";
import { Paginacion } from "@/shared/components/inventario/paginacion";
import { AppLayout } from "@/shared/components/layout/app-layout";
import { Card, CardContent, CardHeader, CardTitle } from "@/shared/components/ui/card";

// utils
import { fechaHoyChile, leerFiltrosRegistros, parametrosDeFiltros, type ParametrosUrl } from "@/shared/utils/filtros-registros";

export const dynamic = "force-dynamic";

interface RegistrosEntradaPageProps {
    searchParams?: Promise<ParametrosUrl>;
}

export default async function RegistrosEntradaPage({ searchParams }: RegistrosEntradaPageProps): Promise<React.ReactElement> {
    const filtros = leerFiltrosRegistros(await searchParams, fechaHoyChile());
    const resultado = await listarRegistrosEntrada(filtros);

    return (
        <AppLayout>
            <div className="space-y-6">
                <div>
                    <p className="text-sm text-muted-foreground">Gestión de entrada</p>
                    <h2 className="text-2xl font-semibold">Registros de entrada</h2>
                </div>
                <Card>
                    <CardHeader>
                        <CardTitle>Filtros</CardTitle>
                    </CardHeader>
                    <CardContent className="space-y-3">
                        {filtros.avisos.map((aviso) => (
                            <p key={aviso} role="status" className="rounded-md border border-amber-200 bg-amber-50 px-3 py-2 text-sm text-amber-900">
                                {aviso}
                            </p>
                        ))}
                        <InventarioFiltros
                            action="/entradas/registros"
                            centros={resultado.centros}
                            bodegas={resultado.bodegas}
                            centroId={resultado.centroId}
                            bodegaId={resultado.bodegaId}
                            puedeFiltrarCentro={resultado.puedeFiltrarCentro}
                            mostrarRangoFechas
                            desde={filtros.desde}
                            hasta={filtros.hasta}
                        />
                    </CardContent>
                </Card>
                <Card>
                    <CardHeader>
                        <CardTitle>Entradas registradas</CardTitle>
                    </CardHeader>
                    <CardContent className="overflow-x-auto">
                        <RegistrosEntradaTabla filas={resultado.filas} />
                        <Paginacion ruta="/entradas/registros" parametros={parametrosDeFiltros(filtros)} paginacion={resultado.paginacion} />
                    </CardContent>
                </Card>
            </div>
        </AppLayout>
    );
}
```

- [ ] **Step 7: Ejecutar pruebas y tipos**

Run: `npx vitest run src/__tests__/registros-entrada.action.test.ts && npx tsc --noEmit`
Expected: PASS y tsc sin errores (restaurar `tsconfig.tsbuildinfo` si cambió).

- [ ] **Step 8: Commit**

```bash
git add src/modules/orden-entrada/actions/registros-entrada.action.ts src/modules/orden-entrada/components/registros-entrada-tabla.tsx src/app/entradas/registros src/shared/components/inventario/ver-detalle-orden.tsx src/__tests__/registros-entrada.action.test.ts
git commit -m "feat(entradas): registros de entrada paginados con filtros y detalle bajo demanda"
```

---

### Task 8: Páginas "Nueva entrada" / "Nueva salida", redirecciones y limpieza

**Files:**
- Create: `src/shared/components/inventario/sin-permiso-registro.tsx`
- Create: `src/app/entradas/nueva/page.tsx`
- Create: `src/app/salidas/nueva/page.tsx`
- Replace: `src/app/orden-entrada/page.tsx`
- Replace: `src/app/orden-salida/page.tsx`
- Modify: `src/modules/orden-entrada/actions/orden-entrada.action.ts` (quitar `listarOrdenesEntrada` y sus imports sin uso; `revalidatePath`)
- Modify: `src/modules/orden-salida/actions/orden-salida.action.ts` (quitar `listarOrdenesSalida` y sus imports sin uso; `revalidatePath`)
- Delete: `src/modules/orden-entrada/components/orden-entrada-table.tsx`
- Modify: `src/shared/components/ui/action-message.tsx`, `src/modules/orden-salida/components/orden-salida-form.tsx`, `src/modules/orden-entrada/components/orden-entrada-form.tsx` (enlace a registros tras registrar)
- Modify: `src/__tests__/alcance-acciones.test.ts`, `src/__tests__/paginacion-ui.test.tsx`

**Interfaces:**
- Consumes: `listarRegistrosSalida`, `listarRegistrosEntrada` (Tasks 6–7); `puedeOperarEntrada`, `puedeOperarSalida`, `obtenerSessionUser`; `RUTA_LOGIN`.
- Produces: `SinPermisoRegistro({ mensaje, hrefRegistros, etiquetaRegistros }: { mensaje: string; hrefRegistros: string; etiquetaRegistros: string })`.

- [ ] **Step 1: Tarjeta "Sin permiso"**

`src/shared/components/inventario/sin-permiso-registro.tsx`:

```tsx
import Link from "next/link";
import type * as React from "react";

// components
import { Card, CardContent, CardHeader, CardTitle } from "@/shared/components/ui/card";

interface SinPermisoRegistroProps {
    mensaje: string;
    hrefRegistros: string;
    etiquetaRegistros: string;
}

export function SinPermisoRegistro({ mensaje, hrefRegistros, etiquetaRegistros }: SinPermisoRegistroProps): React.ReactElement {
    return (
        <Card>
            <CardHeader>
                <CardTitle>Sin permiso para registrar</CardTitle>
            </CardHeader>
            <CardContent className="space-y-3 text-sm">
                <p className="text-muted-foreground">{mensaje}</p>
                <Link href={hrefRegistros} className="font-medium text-teal-700 underline-offset-4 hover:underline">
                    {etiquetaRegistros}
                </Link>
            </CardContent>
        </Card>
    );
}
```

- [ ] **Step 2: Página `/entradas/nueva`**

`src/app/entradas/nueva/page.tsx` (el formulario de la página antigua, sin historial):

```tsx
import type * as React from "react";

// actions
import { listarProductosActivos } from "@/modules/productos/actions/productos.action";

// components
import { OrdenEntradaForm } from "@/modules/orden-entrada/components/orden-entrada-form";
import { SinPermisoRegistro } from "@/shared/components/inventario/sin-permiso-registro";
import { AppLayout } from "@/shared/components/layout/app-layout";
import { Card, CardContent, CardHeader, CardTitle } from "@/shared/components/ui/card";

// lib
import { puedeOperarEntrada } from "@/shared/lib/auth";
import { obtenerAlcanceInventario } from "@/shared/lib/inventario-alcance";

export const dynamic = "force-dynamic";

export default async function NuevaEntradaPage(): Promise<React.ReactElement> {
    const alcance = await obtenerAlcanceInventario();
    const puedeRegistrar = puedeOperarEntrada(alcance.usuario.rol);
    const productos = puedeRegistrar ? await listarProductosActivos() : [];

    return (
        <AppLayout>
            <div className="space-y-6">
                <div>
                    <p className="text-sm text-muted-foreground">Recepción de productos y aumento de stock</p>
                    <h2 className="text-2xl font-semibold">Nueva entrada</h2>
                </div>
                {puedeRegistrar ? (
                    <Card>
                        <CardHeader>
                            <CardTitle>Nueva entrada</CardTitle>
                        </CardHeader>
                        <CardContent>
                            <OrdenEntradaForm
                                centros={alcance.centros}
                                bodegas={alcance.bodegas}
                                productos={productos}
                                centroId={alcance.centroId}
                                bodegaId={alcance.bodegaId}
                                puedeFiltrarCentro={alcance.puedeFiltrarCentro}
                            />
                        </CardContent>
                    </Card>
                ) : (
                    <SinPermisoRegistro
                        mensaje="Tu rol no permite registrar entradas."
                        hrefRegistros="/entradas/registros"
                        etiquetaRegistros="Ver registros de entrada"
                    />
                )}
            </div>
        </AppLayout>
    );
}
```

- [ ] **Step 3: Página `/salidas/nueva`**

`src/app/salidas/nueva/page.tsx` (copia de la parte "Nueva salida" de `src/app/orden-salida/page.tsx`; la carga de stock se optimiza en la fase 2):

```tsx
import type * as React from "react";

// components
import { OrdenSalidaForm } from "@/modules/orden-salida/components/orden-salida-form";
import { SinPermisoRegistro } from "@/shared/components/inventario/sin-permiso-registro";
import { AppLayout } from "@/shared/components/layout/app-layout";
import { Card, CardContent, CardHeader, CardTitle } from "@/shared/components/ui/card";

// lib
import { puedeOperarSalida } from "@/shared/lib/auth";
import { obtenerAlcanceInventario } from "@/shared/lib/inventario-alcance";
import { prisma } from "@/shared/lib/prisma";

export const dynamic = "force-dynamic";

export default async function NuevaSalidaPage(): Promise<React.ReactElement> {
    const alcance = await obtenerAlcanceInventario();
    const puedeRegistrar = puedeOperarSalida(alcance.usuario.rol);
    const centrosDisponiblesIds = alcance.centros.map((centro) => centro.id);
    const [stocks, bodegasDestino] = puedeRegistrar
        ? await Promise.all([
              alcance.bodegaIds.length > 0
                  ? prisma.stock.findMany({
                        where: { cantidadDisponible: { gt: 0 }, bodegaId: { in: alcance.bodegaIds } },
                        include: {
                            producto: { select: { descripcion: true } },
                            bodega: { select: { nombre: true } }
                        },
                        orderBy: [{ producto: { descripcion: "asc" } }, { fechaCaducidad: "asc" }]
                    })
                  : Promise.resolve([]),
              centrosDisponiblesIds.length > 0
                  ? prisma.bodega.findMany({
                        where: { centroId: { in: centrosDisponiblesIds }, estado: true },
                        orderBy: { nombre: "asc" }
                    })
                  : Promise.resolve([])
          ])
        : [[], []];

    return (
        <AppLayout>
            <div className="space-y-6">
                <div>
                    <p className="text-sm text-muted-foreground">Despacho y consumo con validación de stock</p>
                    <h2 className="text-2xl font-semibold">Nueva salida</h2>
                </div>
                {puedeRegistrar ? (
                    <Card>
                        <CardHeader>
                            <CardTitle>Nueva salida</CardTitle>
                        </CardHeader>
                        <CardContent>
                            <OrdenSalidaForm
                                centros={alcance.centros}
                                bodegas={alcance.bodegas}
                                bodegasDestino={bodegasDestino}
                                stocks={stocks}
                                centroId={alcance.centroId}
                                bodegaId={alcance.bodegaId}
                                puedeFiltrarCentro={alcance.puedeFiltrarCentro}
                            />
                        </CardContent>
                    </Card>
                ) : (
                    <SinPermisoRegistro
                        mensaje="Tu rol no permite registrar salidas."
                        hrefRegistros="/salidas/registros"
                        etiquetaRegistros="Ver registros de salida"
                    />
                )}
            </div>
        </AppLayout>
    );
}
```

- [ ] **Step 3b: Enlace a los registros después de registrar**

El spec pide que, tras registrar, el aviso de éxito ofrezca ir a los registros. Los formularios muestran el éxito con `ActionMessage` (no con toast), así que el enlace va ahí.

En `src/shared/components/ui/action-message.tsx`:

```tsx
"use client";

import Link from "next/link";
import type * as React from "react";

// types
import type { ActionState } from "@/shared/types/action-state";

interface ActionMessageProps {
    state: ActionState;
    /** Enlace que se muestra junto al mensaje cuando la acción terminó bien. */
    enlaceExito?: { href: string; etiqueta: string };
}

export function ActionMessage({ state, enlaceExito }: ActionMessageProps): React.ReactElement | null {
    if (!state.message) {
        return null;
    }

    return (
        <p className={state.ok ? "text-sm text-emerald-700" : "text-sm text-red-700"} role="status">
            {state.message}
            {state.ok && enlaceExito ? (
                <>
                    {" "}
                    <Link href={enlaceExito.href} className="font-medium underline underline-offset-4">
                        {enlaceExito.etiqueta}
                    </Link>
                </>
            ) : null}
        </p>
    );
}
```

En `orden-salida-form.tsx`, cambiar `<ActionMessage state={state} />` por `<ActionMessage state={state} enlaceExito={{ href: "/salidas/registros", etiqueta: "Ver registros de salida" }} />`.
En `orden-entrada-form.tsx`, cambiar `<ActionMessage state={state} />` por `<ActionMessage state={state} enlaceExito={{ href: "/entradas/registros", etiqueta: "Ver registros de entrada" }} />`.

Agregar a `src/__tests__/paginacion-ui.test.tsx`:

```tsx
import { ActionMessage } from "@/shared/components/ui/action-message";

describe("ActionMessage", () => {
    it("ofrece el enlace a los registros solo cuando la acción terminó bien", () => {
        const enlace = { href: "/salidas/registros", etiqueta: "Ver registros de salida" };
        const { rerender } = render(<ActionMessage state={{ ok: true, message: "Orden de salida registrada." }} enlaceExito={enlace} />);
        expect(screen.getByRole("link", { name: "Ver registros de salida" })).toHaveAttribute("href", "/salidas/registros");

        rerender(<ActionMessage state={{ ok: false, message: "Stock insuficiente." }} enlaceExito={enlace} />);
        expect(screen.queryByRole("link")).not.toBeInTheDocument();
    });
});
```

(mover el import junto a los demás imports de `// components` del archivo).

Run: `npx vitest run src/__tests__/paginacion-ui.test.tsx`
Expected: PASS.

- [ ] **Step 4: Redirecciones de las rutas antiguas**

Reemplazar todo `src/app/orden-entrada/page.tsx` por:

```tsx
import { redirect } from "next/navigation";

// config
import { RUTA_LOGIN } from "@/config/auth";

// lib
import { obtenerSessionUser, puedeOperarEntrada } from "@/shared/lib/auth";

export const dynamic = "force-dynamic";

export default async function OrdenEntradaPage(): Promise<never> {
    const usuario = await obtenerSessionUser();

    if (!usuario) {
        redirect(RUTA_LOGIN);
    }

    redirect(puedeOperarEntrada(usuario.rol) ? "/entradas/nueva" : "/entradas/registros");
}
```

Reemplazar todo `src/app/orden-salida/page.tsx` por:

```tsx
import { redirect } from "next/navigation";

// config
import { RUTA_LOGIN } from "@/config/auth";

// lib
import { obtenerSessionUser, puedeOperarSalida } from "@/shared/lib/auth";

export const dynamic = "force-dynamic";

export default async function OrdenSalidaPage(): Promise<never> {
    const usuario = await obtenerSessionUser();

    if (!usuario) {
        redirect(RUTA_LOGIN);
    }

    redirect(puedeOperarSalida(usuario.rol) ? "/salidas/nueva" : "/salidas/registros");
}
```

- [ ] **Step 5: Quitar los listados antiguos y actualizar `revalidatePath`**

1. En `src/modules/orden-salida/actions/orden-salida.action.ts`: eliminar `listarOrdenesSalida` (líneas 34–53) y el import de `crearFiltroMovimientosAlcance` si queda sin uso. Reemplazar cada `revalidatePath("/orden-salida");` por `revalidatePath("/salidas/registros");`.
2. En `src/modules/orden-entrada/actions/orden-entrada.action.ts`: eliminar `listarOrdenesEntrada` (líneas 31–57) y los imports que queden sin uso. Reemplazar cada `revalidatePath("/orden-entrada");` por `revalidatePath("/entradas/registros");`.
3. Eliminar `src/modules/orden-entrada/components/orden-entrada-table.tsx`.

Run: `grep -rn "listarOrdenesSalida\|listarOrdenesEntrada\|OrdenEntradaTable\|/orden-salida\|/orden-entrada" src`
Expected: solo aparecen `src/app/orden-salida/page.tsx`, `src/app/orden-entrada/page.tsx` (los redirects) y `src/__tests__/alcance-acciones.test.ts` (se corrige en el paso siguiente).

- [ ] **Step 6: Actualizar `alcance-acciones.test.ts`**

1. Imports: quitar `listarOrdenesEntrada` y `listarOrdenesSalida`; agregar:

```ts
import { listarRegistrosEntrada } from "@/modules/orden-entrada/actions/registros-entrada.action";
import { listarRegistrosSalida } from "@/modules/orden-salida/actions/registros-salida.action";
```

2. En el `vi.mock("@/shared/lib/prisma")`, cambiar:

```ts
        ordenEntrada: { findMany: vi.fn(), count: vi.fn() },
        ordenEntradaDetalle: { findMany: vi.fn(), findUniqueOrThrow: vi.fn(), groupBy: vi.fn() },
        ordenSalida: { findMany: vi.fn(), count: vi.fn() },
        ordenSalidaDetalle: { findMany: vi.fn(), findUniqueOrThrow: vi.fn(), groupBy: vi.fn() },
```

3. Agregar junto a las constantes del archivo:

```ts
const FILTROS_REGISTROS = { desde: "2026-10-01", hasta: "2026-10-30", pagina: 1, avisos: [] };
```

4. Reemplazar los tests CA-2 y CA-3 por:

```ts
        it("CA-2: listarRegistrosSalida filtra por las bodegas del funcionario", async () => {
            sesionOperadorFarmacia();
            vi.mocked(prisma.ordenSalida.count).mockResolvedValue(0);
            vi.mocked(prisma.ordenSalida.findMany).mockResolvedValue([]);

            await listarRegistrosSalida(FILTROS_REGISTROS);

            expect(vi.mocked(prisma.ordenSalida.count).mock.calls[0][0]?.where).toMatchObject(filtroOperador);
        });

        it("CA-3: listarRegistrosEntrada filtra por bodega (no por usuario) para dar continuidad de turno", async () => {
            sesionOperadorFarmacia();
            vi.mocked(prisma.ordenEntrada.count).mockResolvedValue(0);
            vi.mocked(prisma.ordenEntrada.findMany).mockResolvedValue([]);

            await listarRegistrosEntrada(FILTROS_REGISTROS);

            const where = vi.mocked(prisma.ordenEntrada.count).mock.calls[0][0]?.where;
            expect(where).toMatchObject(filtroOperador);
            expect(where).not.toHaveProperty("usuarioId");
        });
```

5. En "retorna vacío sin consultar…", reemplazar las dos primeras expectativas por:

```ts
            expect((await listarRegistrosSalida(FILTROS_REGISTROS)).filas).toEqual([]);
            expect((await listarRegistrosEntrada(FILTROS_REGISTROS)).filas).toEqual([]);
```

y `expect(prisma.ordenSalida.findMany).not.toHaveBeenCalled(); expect(prisma.ordenEntrada.findMany).not.toHaveBeenCalled();` por `expect(prisma.ordenSalida.count).not.toHaveBeenCalled(); expect(prisma.ordenEntrada.count).not.toHaveBeenCalled();`.

6. En CA-6, agregar `vi.mocked(prisma.ordenSalida.count).mockResolvedValue(0); vi.mocked(prisma.ordenEntrada.count).mockResolvedValue(0);`, reemplazar `await listarOrdenesSalida(); await listarOrdenesEntrada();` por `await listarRegistrosSalida(FILTROS_REGISTROS); await listarRegistrosEntrada(FILTROS_REGISTROS);`, y las expectativas de historiales por:

```ts
            const whereSalidas = vi.mocked(prisma.ordenSalida.count).mock.calls[0][0]?.where;
            expect(whereSalidas).not.toHaveProperty("bodegaId");
            expect(whereSalidas).not.toHaveProperty("centroId");
            const whereEntradas = vi.mocked(prisma.ordenEntrada.count).mock.calls[0][0]?.where;
            expect(whereEntradas).not.toHaveProperty("bodegaId");
            expect(whereEntradas).not.toHaveProperty("centroId");
```

(renombrar la variable existente `whereSalidas` del reporte a `whereReporte` para evitar el choque de nombres).

- [ ] **Step 7: Verificación completa**

Run: `npm test && npx tsc --noEmit && npm run lint && npm run build`
Expected: todo en verde; `next build` lista las rutas `/entradas/nueva`, `/entradas/registros`, `/salidas/nueva`, `/salidas/registros`. Restaurar `tsconfig.tsbuildinfo` si cambió.

- [ ] **Step 8: Prueba manual local**

Run: `npm run dev` y con un usuario R01:
1. El menú muestra "Gestión de entrada" y "Gestión de salida" con sus subopciones y el enlace Auditoría.
2. `/orden-salida` redirige a `/salidas/nueva`; `/orden-entrada` a `/entradas/nueva`.
3. `/salidas/registros` muestra 50 filas máximo, "Mostrando 1–50 de N", los filtros conservan valores al paginar, y "Ver" abre el detalle.
4. `/salidas/registros?desde=2020-01-01&hasta=2026-10-30` muestra el aviso de 12 meses.
5. Con un usuario R02 no aparecen "Nueva entrada"/"Nueva salida", y `/salidas/nueva` muestra "Sin permiso para registrar".

- [ ] **Step 9: Commit**

```bash
git add -A src
git commit -m "feat(rutas): nueva entrada/salida separadas de sus registros; redirecciones desde rutas antiguas"
```

---

### Task 9: Verificación de rendimiento en producción (después del merge)

No modifica código. Ejecutarla tras el deploy de la fase 1.

- [ ] **Step 1: Medir las rutas**

Con un usuario administrador, en el navegador (DevTools → Red, caché desactivada), abrir `/salidas/registros`, `/entradas/registros` y la página 10 de cada una. Registrar para la petición del documento y la `?_rsc=`: tiempo de espera del servidor (TTFB) y tamaño transferido.
Expected: TTFB < 1 s y tamaño < 200 KB en cada una.

- [ ] **Step 2: Confirmar que pm2 no reinicia**

Run (en server-das): `pm2 jlist | node -e "const a=JSON.parse(require('fs').readFileSync(0));const p=a.find(x=>x.name==='inventario-cmv');console.log('restarts', p.pm2_env.restart_time, 'mem', Math.round(p.monit.memory/1e6)+'MB')"` antes y después de navegar 5 minutos por las rutas.
Expected: el contador `restarts` no sube y la memoria queda bajo 500 MB.

- [ ] **Step 3: Registrar el resultado**

Anotar los tiempos y tamaños medidos en la descripción del PR de la fase 1 (o en un comentario si ya está fusionado).
