# Fase 2 — Lotes por bodega en "Nueva salida" y Stock paginado en SQL: plan de implementación

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Que el formulario de nueva salida cargue solo los lotes de la bodega elegida y que `/stock` consolide, filtre, ordene y pagine en SQL, con filtros nuevos de línea, bajo mínimo y por caducar.

**Architecture:** Una server action `listarLotesDisponibles(bodegaId)` alimenta el formulario al cambiar de bodega. El stock se consolida con una consulta `$queryRaw` (construida con `Prisma.sql` en funciones puras y probadas) que agrupa por producto × bodega, aplica los filtros y el orden, y pagina; los lotes de las 50 filas visibles se piden en una segunda consulta.

**Tech Stack:** Next.js 15, React 19, TypeScript strict, Prisma 6 (`$queryRaw`, `Prisma.sql`, `Prisma.join`), MySQL 8.4, Vitest + Testing Library.

**Spec:** `docs/superpowers/specs/2026-10-30-registros-paginados-navegacion-design.md` (secciones 7, 9 fase 2 y 10).

**Requiere:** fase 1 fusionada (`src/shared/utils/paginacion.ts`, `src/shared/utils/filtros-registros.ts`, `src/shared/components/inventario/paginacion.tsx`, `src/app/salidas/nueva/page.tsx`).

## Global Constraints

- Idioma español en UI, comentarios, nombres y commits. Indentación de 4 espacios.
- TypeScript strict con tipos explícitos; imports agrupados con comentarios; alias `@/`.
- Server Actions en `*.action.ts` con `"use server"`; solo exportan funciones `async` (y tipos).
- SQL crudo solo con `Prisma.sql` / `Prisma.join` (parámetros). `Prisma.raw` únicamente para palabras fijas del código (`ASC`/`DESC`), nunca para datos del usuario.
- Nombres físicos de MySQL: `Stock(ID_Stock, ID_Product, ID_Bodega, Cantidad_Disponible, Fecha_Ultima_Actualizacion, StockMinimo, Lote, Fecha_Caducidad)`, `Producto(ID_Product, Linea, Descripcion)`, `Bodega(ID_Bodega, Bodega, ID_Centro, Estado)`, `Centro(ID_Centro, Nombre)`.
- Regla de visibilidad de existencias (igual que `filtrarExistenciasVisibles`): por producto × bodega se muestran los lotes con cantidad > 0; si no hay ninguno y el grupo tiene **un solo** lote, se muestra una fila en 0; si tiene varios lotes todos en 0, el grupo no se muestra.
- "Próximos a caducar": algún lote con existencia que vence en **1 a 30 días**, excluyendo la fecha centinela **`2099-12-31`**.
- "Bajo stock mínimo": igual que la alerta `stock_minimo` actual, `cantidad > 0 AND cantidad <= CEIL(cantidad * 0.1)` (ver nota "Decisión pendiente" en la Task 3).
- Tamaño de página: **50**.
- Los client components no importan `@/shared/lib/auth` ni `@/shared/lib/prisma`.
- Verificación: `npm test`, `npx tsc --noEmit` (restaurar `tsconfig.tsbuildinfo` si cambia), `npm run lint`, `npm run build`.

## Estructura de archivos

| Archivo | Acción | Responsabilidad |
|---|---|---|
| `src/modules/orden-salida/types/stock-disponible.ts` | Crear | Tipo `StockDisponible` compartido (hoy duplicado en dos componentes) |
| `src/modules/orden-salida/actions/lotes-disponibles.action.ts` | Crear | `listarLotesDisponibles(bodegaId)` |
| `src/modules/orden-salida/components/orden-salida-form.tsx` | Modificar | Carga de lotes al cambiar de bodega |
| `src/modules/orden-salida/components/orden-salida-detalles-field.tsx` | Modificar | Usa el tipo compartido |
| `src/app/salidas/nueva/page.tsx` | Modificar | Precarga solo la bodega inicial |
| `src/modules/stock/utils/stock-consulta.ts` | Crear | Constructores SQL puros y mapeo de filas |
| `src/modules/stock/actions/stock.action.ts` | Modificar | `listarStockConsolidado` paginado en SQL |
| `src/modules/stock/components/stock-table.tsx` | Modificar | Enlaces de orden que conservan todos los filtros |
| `src/shared/components/inventario/inventario-filtros.tsx` | Modificar | Prop `children` para filtros extra |
| `src/app/stock/page.tsx` | Modificar | Filtros nuevos y paginación |

---

### Task 1: Server action de lotes disponibles por bodega

**Files:**
- Create: `src/modules/orden-salida/types/stock-disponible.ts`
- Create: `src/modules/orden-salida/actions/lotes-disponibles.action.ts`
- Test: `src/__tests__/lotes-disponibles.action.test.ts`

**Interfaces:**
- Consumes: `obtenerAlcanceInventario`.
- Produces:
  - `interface StockDisponible extends Stock { producto: { descripcion: string }; bodega: { nombre: string } }`
  - `interface LotesDisponiblesResultado { ok: boolean; message: string; lotes: StockDisponible[] }`
  - `listarLotesDisponibles(bodegaId: string): Promise<LotesDisponiblesResultado>`

- [ ] **Step 1: Escribir la prueba**

`src/__tests__/lotes-disponibles.action.test.ts`:

```ts
import { beforeEach, describe, expect, it, vi } from "vitest";

// lib
import * as authLib from "@/shared/lib/auth";
import { prisma } from "@/shared/lib/prisma";

// actions
import { listarLotesDisponibles } from "@/modules/orden-salida/actions/lotes-disponibles.action";

vi.mock("@/auth", () => ({ auth: vi.fn() }));

vi.mock("@/shared/lib/auth", async (importOriginal) => {
    const original = await importOriginal<typeof import("@/shared/lib/auth")>();
    return { ...original, requireSessionUser: vi.fn() };
});

vi.mock("@/shared/lib/prisma", () => ({
    prisma: {
        centro: { findFirst: vi.fn() },
        bodega: { findFirst: vi.fn() },
        encargadosBodega: { findMany: vi.fn() },
        stock: { findMany: vi.fn() }
    }
}));

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
    vi.mocked(prisma.centro.findFirst).mockResolvedValue({ id: "centro-1", nombre: "CESFAM Barón", estado: true } as never);
    vi.mocked(prisma.encargadosBodega.findMany).mockResolvedValue([]);
    vi.mocked(prisma.bodega.findFirst).mockResolvedValue({ id: "b1", nombre: "Bodega Farmacia", centroId: "centro-1", estado: true } as never);
}

describe("listarLotesDisponibles", () => {
    beforeEach(() => {
        vi.clearAllMocks();
    });

    it("devuelve solo los lotes con existencia de la bodega pedida", async () => {
        sesionOperadorFarmacia();
        vi.mocked(prisma.stock.findMany).mockResolvedValue([{ id: "s1" }] as never);

        const resultado = await listarLotesDisponibles("b1");

        expect(resultado).toEqual({ ok: true, message: "", lotes: [{ id: "s1" }] });
        expect(prisma.stock.findMany).toHaveBeenCalledWith(expect.objectContaining({
            where: { bodegaId: "b1", cantidadDisponible: { gt: 0 } }
        }));
    });

    it("rechaza una bodega fuera del alcance sin consultar el stock", async () => {
        sesionOperadorFarmacia();

        const resultado = await listarLotesDisponibles("b-ajena");

        expect(resultado).toEqual({ ok: false, message: "La bodega no está dentro de tu alcance.", lotes: [] });
        expect(prisma.stock.findMany).not.toHaveBeenCalled();
    });
});
```

- [ ] **Step 2: Ejecutar y verificar que falla**

Run: `npx vitest run src/__tests__/lotes-disponibles.action.test.ts`
Expected: FAIL — módulo inexistente.

- [ ] **Step 3: Tipo compartido**

`src/modules/orden-salida/types/stock-disponible.ts`:

```ts
import type { Stock } from "@prisma/client";

export interface StockDisponible extends Stock {
    producto: {
        descripcion: string;
    };
    bodega: {
        nombre: string;
    };
}
```

- [ ] **Step 4: Implementar la action**

`src/modules/orden-salida/actions/lotes-disponibles.action.ts`:

```ts
"use server";

// lib
import { obtenerAlcanceInventario } from "@/shared/lib/inventario-alcance";
import { prisma } from "@/shared/lib/prisma";

// types
import type { StockDisponible } from "@/modules/orden-salida/types/stock-disponible";

export interface LotesDisponiblesResultado {
    ok: boolean;
    message: string;
    lotes: StockDisponible[];
}

/** Lotes con existencia de una bodega del alcance, para el formulario de nueva salida. */
export async function listarLotesDisponibles(bodegaId: string): Promise<LotesDisponiblesResultado> {
    try {
        const alcance = await obtenerAlcanceInventario();

        if (!alcance.bodegaIds.includes(bodegaId)) {
            return { ok: false, message: "La bodega no está dentro de tu alcance.", lotes: [] };
        }

        const lotes = await prisma.stock.findMany({
            where: { bodegaId, cantidadDisponible: { gt: 0 } },
            include: {
                producto: { select: { descripcion: true } },
                bodega: { select: { nombre: true } }
            },
            orderBy: [{ producto: { descripcion: "asc" } }, { fechaCaducidad: "asc" }]
        });

        return { ok: true, message: "", lotes };
    } catch {
        return { ok: false, message: "No fue posible cargar los lotes de la bodega.", lotes: [] };
    }
}
```

- [ ] **Step 5: Ejecutar y verificar que pasa**

Run: `npx vitest run src/__tests__/lotes-disponibles.action.test.ts`
Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add src/modules/orden-salida/types/stock-disponible.ts src/modules/orden-salida/actions/lotes-disponibles.action.ts src/__tests__/lotes-disponibles.action.test.ts
git commit -m "feat(salidas): server action de lotes disponibles por bodega"
```

---

### Task 2: El formulario de nueva salida carga lotes por bodega

**Files:**
- Modify: `src/modules/orden-salida/components/orden-salida-form.tsx`
- Modify: `src/modules/orden-salida/components/orden-salida-detalles-field.tsx`
- Modify: `src/app/salidas/nueva/page.tsx`
- Modify: `src/__tests__/traspaso-bodega-form.test.tsx`, `src/__tests__/orden-salida-ui.test.tsx` (mock de la nueva action)
- Test: `src/__tests__/orden-salida-lotes.test.tsx`

**Interfaces:**
- Consumes: `listarLotesDisponibles`, `StockDisponible` (Task 1).
- Produces: `OrdenSalidaForm` mantiene sus props; `stocks` pasa a significar "lotes de la bodega inicial (`bodegaId`)".

- [ ] **Step 1: Escribir la prueba**

`src/__tests__/orden-salida-lotes.test.tsx`:

```tsx
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

// actions
import { listarLotesDisponibles } from "@/modules/orden-salida/actions/lotes-disponibles.action";

// components
import { OrdenSalidaForm } from "@/modules/orden-salida/components/orden-salida-form";

vi.mock("@/modules/orden-salida/actions/orden-salida.action", () => ({
    crearOrdenSalida: vi.fn(),
    descargarComprobanteSalidaAction: vi.fn()
}));

vi.mock("@/modules/orden-salida/actions/lotes-disponibles.action", () => ({
    listarLotesDisponibles: vi.fn()
}));

vi.mock("sonner", () => ({ toast: { error: vi.fn(), success: vi.fn() } }));

const centro = { id: "c1", nombre: "CESFAM Barón", estado: true };
const bodegas = [
    { id: "b1", nombre: "Farmacia", centroId: "c1", estado: true },
    { id: "b2", nombre: "Dental", centroId: "c1", estado: true }
];

describe("OrdenSalidaForm — lotes por bodega", () => {
    beforeEach(() => {
        vi.clearAllMocks();
        vi.mocked(listarLotesDisponibles).mockResolvedValue({ ok: true, message: "", lotes: [] });
    });

    it("no pide lotes al abrir con la bodega inicial precargada", () => {
        render(<OrdenSalidaForm centros={[centro]} bodegas={bodegas} stocks={[]} centroId="c1" bodegaId="b1" puedeFiltrarCentro />);

        expect(listarLotesDisponibles).not.toHaveBeenCalled();
    });

    it("pide los lotes de la nueva bodega al cambiarla", async () => {
        render(<OrdenSalidaForm centros={[centro]} bodegas={bodegas} stocks={[]} centroId="c1" bodegaId="b1" puedeFiltrarCentro />);

        // El texto de la etiqueta incluye las opciones del select, por eso se usa una regex de prefijo.
        // Con el tipo por defecto ("Consumo Interno") no existe el select de bodega destino.
        fireEvent.change(screen.getByLabelText(/^Bodega/), { target: { value: "b2" } });

        await waitFor(() => expect(listarLotesDisponibles).toHaveBeenCalledWith("b2"));
    });
});
```

- [ ] **Step 2: Ejecutar y verificar que falla**

Run: `npx vitest run src/__tests__/orden-salida-lotes.test.tsx`
Expected: FAIL — `listarLotesDisponibles` nunca se llama con `"b2"`.

- [ ] **Step 3: Usar el tipo compartido en ambos componentes**

En `orden-salida-form.tsx` y `orden-salida-detalles-field.tsx`, eliminar la `interface StockDisponible` local (y el import de `Stock` si queda sin uso) y agregar:

```ts
// types
import type { StockDisponible } from "@/modules/orden-salida/types/stock-disponible";
```

- [ ] **Step 4: Cargar lotes al cambiar de bodega**

En `src/modules/orden-salida/components/orden-salida-form.tsx`:

1. Imports:

```ts
import React, { useActionState, useEffect, useMemo, useState } from "react";
import { toast } from "sonner";

// actions
import { listarLotesDisponibles } from "@/modules/orden-salida/actions/lotes-disponibles.action";
import { crearOrdenSalida } from "@/modules/orden-salida/actions/orden-salida.action";
```

2. Después de `const [bodegaId, setBodegaId] = useState(...)`:

```ts
    // `stocks` trae solo los lotes de la bodega inicial; el resto se pide al cambiar de bodega
    // y se vuelve a pedir tras registrar una salida (las cantidades cambiaron).
    const [lotes, setLotes] = useState<StockDisponible[]>(stocks);
    const [cargandoLotes, setCargandoLotes] = useState(false);
    const [recargas, setRecargas] = useState(0);

    useEffect(() => {
        if (state.ok) {
            setRecargas((actual) => actual + 1);
        }
    }, [state]);

    useEffect(() => {
        if (!bodegaId) {
            setLotes([]);
            return;
        }
        if (recargas === 0 && bodegaId === bodegaIdProp) {
            setLotes(stocks);
            return;
        }

        let vigente = true;
        setCargandoLotes(true);
        listarLotesDisponibles(bodegaId)
            .then((resultado) => {
                if (!vigente) {
                    return;
                }
                if (!resultado.ok) {
                    toast.error(resultado.message);
                }
                setLotes(resultado.lotes);
            })
            .finally(() => {
                if (vigente) {
                    setCargandoLotes(false);
                }
            });

        return () => {
            vigente = false;
        };
    }, [bodegaId, bodegaIdProp, recargas, stocks]);
```

3. Reemplazar `const primerStock = stocks.find(...)` y el `useState` de `bodegaId` por:

```ts
    const [bodegaId, setBodegaId] = useState(bodegaIdProp ?? bodegasFiltradas[0]?.id ?? "");
```

(la página ahora siempre entrega `bodegaId`; ya no se deduce del stock).

4. En el render, reemplazar `<OrdenSalidaDetallesField bodegaId={bodegaId} stocks={stocks} tipoSalida={tipoSalida} />` por:

```tsx
                {cargandoLotes ? (
                    <p className="text-sm text-muted-foreground">Cargando lotes de la bodega…</p>
                ) : null}
                <OrdenSalidaDetallesField bodegaId={bodegaId} stocks={lotes} tipoSalida={tipoSalida} />
```

- [ ] **Step 5: Precargar solo la bodega inicial en la página**

En `src/app/salidas/nueva/page.tsx`:

1. Agregar el import:

```ts
// actions
import { listarLotesDisponibles } from "@/modules/orden-salida/actions/lotes-disponibles.action";
```

2. Reemplazar el bloque `const [stocks, bodegasDestino] = …` por:

```ts
    const centroInicial = alcance.centroId ?? alcance.centros[0]?.id ?? null;
    const bodegaInicial = alcance.bodegaId ?? alcance.bodegas.find((bodega) => bodega.centroId === centroInicial)?.id ?? null;
    const [lotesIniciales, bodegasDestino] = puedeRegistrar
        ? await Promise.all([
              bodegaInicial ? listarLotesDisponibles(bodegaInicial).then((resultado) => resultado.lotes) : Promise.resolve([]),
              centrosDisponiblesIds.length > 0
                  ? prisma.bodega.findMany({
                        where: { centroId: { in: centrosDisponiblesIds }, estado: true },
                        orderBy: { nombre: "asc" }
                    })
                  : Promise.resolve([])
          ])
        : [[], []];
```

3. En `<OrdenSalidaForm …>`: `stocks={lotesIniciales}`, `centroId={centroInicial}`, `bodegaId={bodegaInicial}`.

- [ ] **Step 6: Mockear la nueva action en las pruebas existentes del formulario**

En `src/__tests__/traspaso-bodega-form.test.tsx` y `src/__tests__/orden-salida-ui.test.tsx`, agregar:

```ts
vi.mock("@/modules/orden-salida/actions/lotes-disponibles.action", () => ({
    listarLotesDisponibles: vi.fn().mockResolvedValue({ ok: true, message: "", lotes: [] })
}));
```

- [ ] **Step 7: Ejecutar las pruebas**

Run: `npx vitest run src/__tests__/orden-salida-lotes.test.tsx src/__tests__/traspaso-bodega-form.test.tsx src/__tests__/orden-salida-ui.test.tsx src/__tests__/detalles-fields-sin-cache.test.tsx`
Expected: PASS.

- [ ] **Step 8: Commit**

```bash
git add src/modules/orden-salida src/app/salidas/nueva src/__tests__/orden-salida-lotes.test.tsx src/__tests__/traspaso-bodega-form.test.tsx src/__tests__/orden-salida-ui.test.tsx
git commit -m "perf(salidas): el formulario carga solo los lotes de la bodega elegida"
```

---

### Task 3: Constructores SQL de stock consolidado

**Files:**
- Create: `src/modules/stock/utils/stock-consulta.ts`
- Test: `src/__tests__/stock-consulta.test.ts`

**Interfaces:**
- Consumes: `StockSortKey`, `SortDirection`, `StockConsolidadoVista` (tipos de `stock.action.ts`); `calcularStockMinimo`, `evaluarAlertaStock`, `filtrarExistenciasVisibles`, `obtenerDiasRestantesCaducidad` (`src/modules/stock/utils/movimientos.ts`).
- Produces:
  - `FECHA_SIN_CADUCIDAD = "2099-12-31"`, `DIAS_POR_CADUCAR = 30`
  - `interface FiltrosConsultaStock { bodegaIds: string[]; busqueda: string; linea?: string; bajoMinimo: boolean; porCaducar: boolean; sort: StockSortKey; direction: SortDirection; hoy: string }`
  - `interface FilaStockSql { productoId: number; bodegaId: string; productoDescripcion: string; linea: string; bodegaNombre: string; centroId: string; centroNombre: string; cantidad: bigint | number; caducidadMinima: Date }`
  - `interface LoteStockSql { id: string; productoId: number; bodegaId: string; lote: string; fechaCaducidad: Date; cantidadDisponible: number }`
  - `patronLike(texto: string): string`
  - `construirConteoStock(filtros: FiltrosConsultaStock): Prisma.Sql`
  - `construirConsultaStock(filtros: FiltrosConsultaStock, pagina: { skip: number; tamano: number }): Prisma.Sql`
  - `mapearStockConsolidado(filas: FilaStockSql[], lotes: LoteStockSql[], hoy?: Date): StockConsolidadoVista[]`

> **Decisión pendiente (no bloquea):** la columna "Mínimo" y la alerta `stock_minimo` usan hoy `calcularStockMinimo` (10 % de la cantidad), no la columna `StockMinimo` de la tabla, que sí viene poblada desde AppSheet. Con esa regla el filtro "Bajo stock mínimo" solo encuentra productos con 1 unidad. Este plan conserva la regla actual (coherente con la columna y la alerta que ya se muestran) y la concentra en la constante `EXPR_MINIMO`. Si el equipo decide usar `StockMinimo` de AppSheet, se cambia `EXPR_MINIMO` por `g.minimo` (agregando `MAX(s.StockMinimo) AS minimo` al agrupado) y `calcularStockMinimo` en el mapeo, con sus pruebas.

- [ ] **Step 1: Escribir las pruebas**

`src/__tests__/stock-consulta.test.ts`:

```ts
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
```

- [ ] **Step 2: Ejecutar y verificar que fallan**

Run: `npx vitest run src/__tests__/stock-consulta.test.ts`
Expected: FAIL — módulo inexistente.

- [ ] **Step 3: Implementar `stock-consulta.ts`**

`src/modules/stock/utils/stock-consulta.ts`:

```ts
import { Prisma } from "@prisma/client";

// types
import type { SortDirection, StockConsolidadoVista, StockSortKey } from "@/modules/stock/actions/stock.action";

// utils
import {
    DIAS_ALERTA_CADUCIDAD,
    calcularStockMinimo,
    evaluarAlertaStock,
    filtrarExistenciasVisibles,
    obtenerDiasRestantesCaducidad
} from "@/modules/stock/utils/movimientos";

export const FECHA_SIN_CADUCIDAD = "2099-12-31";
export const DIAS_POR_CADUCAR = 30;

export interface FiltrosConsultaStock {
    bodegaIds: string[];
    busqueda: string;
    linea?: string;
    bajoMinimo: boolean;
    porCaducar: boolean;
    sort: StockSortKey;
    direction: SortDirection;
    hoy: string;
}

export interface FilaStockSql {
    productoId: number;
    bodegaId: string;
    productoDescripcion: string;
    linea: string;
    bodegaNombre: string;
    centroId: string;
    centroNombre: string;
    cantidad: bigint | number;
    caducidadMinima: Date;
}

export interface LoteStockSql {
    id: string;
    productoId: number;
    bodegaId: string;
    lote: string;
    fechaCaducidad: Date;
    cantidadDisponible: number;
}

/** Mínimo por producto × bodega. Ver "Decisión pendiente" en el plan de la fase 2. */
const EXPR_MINIMO = Prisma.sql`CEIL(g.cantidad * 0.1)`;

export function patronLike(texto: string): string {
    return `%${texto.replace(/[\\%_]/g, (caracter) => `\\${caracter}`)}%`;
}

/**
 * Agrupa lotes por producto × bodega con la regla de `filtrarExistenciasVisibles`:
 * suma y caducidad mínima solo de lotes con existencia; si no hay ninguno, el grupo
 * se muestra únicamente cuando tiene un solo lote (fila en 0).
 */
function agrupado(bodegaIds: string[]): Prisma.Sql {
    return Prisma.sql`
        SELECT
            s.ID_Product AS productoId,
            s.ID_Bodega AS bodegaId,
            CAST(SUM(CASE WHEN s.Cantidad_Disponible > 0 THEN s.Cantidad_Disponible ELSE 0 END) AS SIGNED) AS cantidad,
            COALESCE(MIN(CASE WHEN s.Cantidad_Disponible > 0 THEN s.Fecha_Caducidad END), MIN(s.Fecha_Caducidad)) AS caducidadMinima,
            MIN(CASE WHEN s.Cantidad_Disponible > 0 AND s.Fecha_Caducidad <> ${FECHA_SIN_CADUCIDAD} THEN s.Fecha_Caducidad END) AS caducidadReal,
            SUM(s.Cantidad_Disponible > 0) AS lotesConExistencia,
            COUNT(*) AS lotes
        FROM Stock s
        WHERE s.ID_Bodega IN (${Prisma.join(bodegaIds)})
        GROUP BY s.ID_Product, s.ID_Bodega
        HAVING lotesConExistencia > 0 OR lotes = 1`;
}

function condiciones(filtros: FiltrosConsultaStock): Prisma.Sql {
    const partes: Prisma.Sql[] = [Prisma.sql`1 = 1`];
    const busqueda = filtros.busqueda.trim();

    if (busqueda.length > 0) {
        partes.push(
            /^\d+$/.test(busqueda)
                ? Prisma.sql`(p.Descripcion LIKE ${patronLike(busqueda)} OR p.ID_Product = ${Number(busqueda)})`
                : Prisma.sql`p.Descripcion LIKE ${patronLike(busqueda)}`
        );
    }
    if (filtros.linea) {
        partes.push(Prisma.sql`p.Linea = ${filtros.linea}`);
    }
    if (filtros.bajoMinimo) {
        partes.push(Prisma.sql`g.cantidad > 0 AND g.cantidad <= ${EXPR_MINIMO}`);
    }
    if (filtros.porCaducar) {
        partes.push(Prisma.sql`DATEDIFF(g.caducidadReal, ${filtros.hoy}) BETWEEN 1 AND ${DIAS_POR_CADUCAR}`);
    }

    return Prisma.join(partes, " AND ");
}

/** Mismo orden de severidad que `ordenarStockConsolidado`: sin stock, caducado, mínimo, por caducar, ok. */
function pesoAlerta(hoy: string): Prisma.Sql {
    return Prisma.sql`CASE
        WHEN g.cantidad <= 0 THEN 0
        WHEN DATEDIFF(g.caducidadMinima, ${hoy}) <= 0 THEN 1
        WHEN g.cantidad <= ${EXPR_MINIMO} THEN 2
        WHEN DATEDIFF(g.caducidadMinima, ${hoy}) BETWEEN 1 AND ${DIAS_ALERTA_CADUCIDAD[0]} THEN 3
        ELSE 4
    END`;
}

function columnaOrden(sort: StockSortKey, hoy: string): Prisma.Sql {
    switch (sort) {
        case "centro":
            return Prisma.sql`c.Nombre`;
        case "bodega":
            return Prisma.sql`b.Bodega`;
        case "linea":
            return Prisma.sql`p.Linea`;
        case "disponible":
            return Prisma.sql`g.cantidad`;
        case "minimo":
            return EXPR_MINIMO;
        case "alerta":
            return pesoAlerta(hoy);
        default:
            return Prisma.sql`p.Descripcion`;
    }
}

function desdeConJoins(filtros: FiltrosConsultaStock): Prisma.Sql {
    return Prisma.sql`
        FROM (${agrupado(filtros.bodegaIds)}) g
        JOIN Producto p ON p.ID_Product = g.productoId
        JOIN Bodega b ON b.ID_Bodega = g.bodegaId
        JOIN Centro c ON c.ID_Centro = b.ID_Centro
        WHERE ${condiciones(filtros)}`;
}

export function construirConteoStock(filtros: FiltrosConsultaStock): Prisma.Sql {
    return Prisma.sql`SELECT COUNT(*) AS total ${desdeConJoins(filtros)}`;
}

export function construirConsultaStock(filtros: FiltrosConsultaStock, pagina: { skip: number; tamano: number }): Prisma.Sql {
    const direccion = Prisma.raw(filtros.direction === "desc" ? "DESC" : "ASC");

    return Prisma.sql`
        SELECT
            g.productoId,
            g.bodegaId,
            p.Descripcion AS productoDescripcion,
            p.Linea AS linea,
            b.Bodega AS bodegaNombre,
            c.ID_Centro AS centroId,
            c.Nombre AS centroNombre,
            g.cantidad,
            g.caducidadMinima
        ${desdeConJoins(filtros)}
        ORDER BY ${columnaOrden(filtros.sort, filtros.hoy)} ${direccion}, p.Descripcion ASC, b.Bodega ASC
        LIMIT ${pagina.tamano} OFFSET ${pagina.skip}`;
}

export function mapearStockConsolidado(filas: FilaStockSql[], lotes: LoteStockSql[], hoy: Date = new Date()): StockConsolidadoVista[] {
    const lotesPorClave = new Map<string, LoteStockSql[]>();

    for (const lote of filtrarExistenciasVisibles(lotes)) {
        const clave = `${lote.bodegaId}:${lote.productoId}`;
        lotesPorClave.set(clave, [...(lotesPorClave.get(clave) ?? []), lote]);
    }

    return filas.map((fila) => {
        const clave = `${fila.bodegaId}:${fila.productoId}`;
        const cantidad = Number(fila.cantidad);
        const stockMinimo = calcularStockMinimo(cantidad);

        return {
            id: clave,
            centroId: fila.centroId,
            centroNombre: fila.centroNombre,
            bodegaId: fila.bodegaId,
            bodegaNombre: fila.bodegaNombre,
            productoId: Number(fila.productoId),
            productoDescripcion: fila.productoDescripcion,
            linea: fila.linea,
            cantidadDisponible: cantidad,
            stockMinimo,
            alerta: evaluarAlertaStock({ cantidadDisponible: cantidad, stockMinimo, fechaCaducidad: fila.caducidadMinima, hoy }),
            diasCaducidadMinimos: obtenerDiasRestantesCaducidad(fila.caducidadMinima, hoy),
            lotes: (lotesPorClave.get(clave) ?? [])
                .map((lote) => ({
                    id: lote.id,
                    lote: lote.lote,
                    fechaCaducidad: lote.fechaCaducidad,
                    cantidadDisponible: lote.cantidadDisponible
                }))
                .sort((a, b) => a.fechaCaducidad.getTime() - b.fechaCaducidad.getTime())
        };
    });
}
```

- [ ] **Step 4: Ejecutar las pruebas**

Run: `npx vitest run src/__tests__/stock-consulta.test.ts`
Expected: PASS. Si la aserción de `values` falla por el orden, revisar que los valores esperados existan en `consulta.values` (se usa `arrayContaining`, el orden no importa).

- [ ] **Step 5: Commit**

```bash
git add src/modules/stock/utils/stock-consulta.ts src/__tests__/stock-consulta.test.ts
git commit -m "feat(stock): consulta SQL consolidada con filtros, orden y paginación"
```

---

### Task 4: `/stock` paginado con filtros nuevos

**Files:**
- Modify: `src/modules/stock/actions/stock.action.ts`
- Modify: `src/modules/stock/components/stock-table.tsx`
- Modify: `src/shared/components/inventario/inventario-filtros.tsx`
- Modify: `src/app/stock/page.tsx`
- Test: `src/__tests__/stock-paginado.test.ts`

**Interfaces:**
- Consumes: `construirConteoStock`, `construirConsultaStock`, `mapearStockConsolidado`, `FilaStockSql` (Task 3); `calcularPaginacion`, `Paginacion`, `ValorParametro`, `crearHrefConParametros` (fase 1); `fechaHoyChile`, `leerPagina`, `obtenerParametro` (fase 1); `Paginacion` component (fase 1).
- Produces:
  - `ListarStockInput` gana `linea?: string; bajoMinimo?: boolean; porCaducar?: boolean; pagina?: number`
  - `ListarStockResult` gana `linea: string; lineas: string[]; bajoMinimo: boolean; porCaducar: boolean; paginacion: Paginacion`
  - `StockTable` cambia sus props a `{ stocks: StockConsolidadoVista[]; sort: StockSortKey; direction: SortDirection; parametros: Record<string, ValorParametro> }`
  - `InventarioFiltros` acepta `children?: React.ReactNode` (se muestra antes de los botones)

- [ ] **Step 1: Escribir la prueba de la action**

`src/__tests__/stock-paginado.test.ts`:

```ts
import { beforeEach, describe, expect, it, vi } from "vitest";

// lib
import * as authLib from "@/shared/lib/auth";
import { prisma } from "@/shared/lib/prisma";

// actions
import { listarStockConsolidado } from "@/modules/stock/actions/stock.action";

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
        producto: { findMany: vi.fn() },
        stock: { findMany: vi.fn() }
    }
}));

describe("listarStockConsolidado paginado", () => {
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
        vi.mocked(prisma.producto.findMany).mockResolvedValue([{ linea: "DENTAL" }, { linea: "INSUMOS" }] as never);
    });

    it("cuenta, pagina y pide los lotes solo de las filas visibles", async () => {
        vi.mocked(prisma.$queryRaw)
            .mockResolvedValueOnce([{ total: BigInt(120) }] as never)
            .mockResolvedValueOnce([{
                productoId: 7,
                bodegaId: "b1",
                productoDescripcion: "Guantes M",
                linea: "INSUMOS",
                bodegaNombre: "Farmacia",
                centroId: "c1",
                centroNombre: "CESFAM Barón",
                cantidad: BigInt(5),
                caducidadMinima: new Date("2027-01-01T00:00:00.000Z")
            }] as never);
        vi.mocked(prisma.stock.findMany).mockResolvedValue([]);

        const resultado = await listarStockConsolidado({ pagina: 3, linea: "INSUMOS" });

        expect(resultado.paginacion).toMatchObject({ pagina: 3, total: 120, paginasTotales: 3 });
        expect(resultado.lineas).toEqual(["DENTAL", "INSUMOS"]);
        expect(resultado.stocks).toHaveLength(1);
        expect(prisma.stock.findMany).toHaveBeenCalledWith(expect.objectContaining({
            where: { OR: [{ productoId: 7, bodegaId: "b1" }] }
        }));
    });
});
```

- [ ] **Step 2: Ejecutar y verificar que falla**

Run: `npx vitest run src/__tests__/stock-paginado.test.ts`
Expected: FAIL — `resultado.paginacion` indefinido.

- [ ] **Step 3: Reescribir `listarStockConsolidado`**

En `src/modules/stock/actions/stock.action.ts`:

1. Imports nuevos:

```ts
// utils
import { construirConsultaStock, construirConteoStock, mapearStockConsolidado, type FilaStockSql } from "@/modules/stock/utils/stock-consulta";
import { fechaHoyChile } from "@/shared/utils/filtros-registros";
import { calcularPaginacion, type Paginacion } from "@/shared/utils/paginacion";
```

y quitar de `@/modules/stock/utils/movimientos` los imports que queden sin uso.

2. Ampliar los tipos:

```ts
export interface ListarStockInput {
    centroId?: string;
    bodegaId?: string;
    busqueda?: string;
    linea?: string;
    bajoMinimo?: boolean;
    porCaducar?: boolean;
    sort?: StockSortKey;
    direction?: SortDirection;
    pagina?: number;
}
```

Agregar a `ListarStockResult`: `linea: string; lineas: string[]; bajoMinimo: boolean; porCaducar: boolean; paginacion: Paginacion;`.

3. Reemplazar el cuerpo de `listarStockConsolidado` por:

```ts
export async function listarStockConsolidado(input: ListarStockInput = {}): Promise<ListarStockResult> {
    const alcance = await obtenerAlcanceInventario({ centroId: input.centroId, bodegaId: input.bodegaId });
    const busqueda = input.busqueda?.trim() ?? "";
    const linea = input.linea?.trim() ?? "";
    const sort = input.sort ?? "producto";
    const direction = input.direction ?? "asc";
    const bajoMinimo = input.bajoMinimo ?? false;
    const porCaducar = input.porCaducar ?? false;
    const lineas = (await prisma.producto.findMany({
        distinct: ["linea"],
        select: { linea: true },
        orderBy: { linea: "asc" }
    })).map((producto) => producto.linea);
    const base = {
        centros: alcance.centros,
        bodegas: alcance.bodegas,
        centroId: alcance.centroId,
        bodegaId: alcance.bodegaId,
        puedeFiltrarCentro: alcance.puedeFiltrarCentro,
        busqueda,
        linea,
        lineas,
        bajoMinimo,
        porCaducar,
        sort,
        direction
    };

    if (alcance.bodegaIds.length === 0 || alcance.centroIds.length === 0) {
        return { ...base, stocks: [], paginacion: calcularPaginacion(1, 0) };
    }

    const filtros = {
        bodegaIds: alcance.bodegaIds,
        busqueda,
        linea: linea || undefined,
        bajoMinimo,
        porCaducar,
        sort,
        direction,
        hoy: fechaHoyChile()
    };
    const [conteo] = await prisma.$queryRaw<Array<{ total: bigint | number }>>(construirConteoStock(filtros));
    const paginacion = calcularPaginacion(input.pagina ?? 1, Number(conteo?.total ?? 0));
    const filas = await prisma.$queryRaw<FilaStockSql[]>(construirConsultaStock(filtros, paginacion));
    const lotes = filas.length > 0
        ? await prisma.stock.findMany({
              where: { OR: filas.map((fila) => ({ productoId: Number(fila.productoId), bodegaId: fila.bodegaId })) },
              select: { id: true, productoId: true, bodegaId: true, lote: true, fechaCaducidad: true, cantidadDisponible: true }
          })
        : [];

    return { ...base, paginacion, stocks: mapearStockConsolidado(filas, lotes) };
}
```

4. Eliminar las funciones que quedan sin uso: `consolidarLotes`, `crearLoteVista`, `obtenerFechaCaducidadMasProxima`, `ordenarStockConsolidado`, `compararStock` y el tipo `StockLotePrisma`.

- [ ] **Step 4: `children` en `InventarioFiltros`**

En `src/shared/components/inventario/inventario-filtros.tsx`: agregar `children?: React.ReactNode;` a las props, desestructurarla y renderizar `{children}` justo antes del `<div className="flex items-end gap-2">` de los botones.

- [ ] **Step 5: `StockTable` con parámetros genéricos**

En `src/modules/stock/components/stock-table.tsx`:

1. Props:

```ts
interface StockTableProps {
    stocks: StockConsolidadoVista[];
    sort: StockSortKey;
    direction: SortDirection;
    parametros: Record<string, ValorParametro>;
}
```

con el import `import { crearHrefConParametros, type ValorParametro } from "@/shared/utils/paginacion";` en `// utils`.

2. Firma: `export function StockTable({ stocks, sort, direction, parametros }: StockTableProps)`; la llamada a `crearSortHref` pasa `{ columna: columna.key, sort, direction, parametros }`.

3. Reemplazar `crearSortHref` por:

```ts
function crearSortHref(input: {
    columna: StockSortKey;
    sort: StockSortKey;
    direction: SortDirection;
    parametros: Record<string, ValorParametro>;
}): string {
    const direction = input.sort === input.columna && input.direction === "asc" ? "desc" : "asc";

    // Cambiar el orden vuelve a la página 1 (no se incluye `pagina`)
    return crearHrefConParametros("/stock", { ...input.parametros, sort: input.columna, direction });
}
```

- [ ] **Step 6: Página `/stock`**

En `src/app/stock/page.tsx`:

1. Imports:

```ts
// components
import { Paginacion } from "@/shared/components/inventario/paginacion";
import { Select } from "@/shared/components/ui/select";

// utils
import { leerPagina, obtenerParametro } from "@/shared/utils/filtros-registros";
```

(eliminar la función local `obtenerParam` y usar `obtenerParametro`).

2. Llamada:

```ts
    const data = await listarStockConsolidado({
        centroId: obtenerParametro(params, "centroId"),
        bodegaId: obtenerParametro(params, "bodegaId"),
        busqueda: obtenerParametro(params, "q"),
        linea: obtenerParametro(params, "linea"),
        bajoMinimo: obtenerParametro(params, "bajoMinimo") === "1",
        porCaducar: obtenerParametro(params, "porCaducar") === "1",
        sort: obtenerSort(obtenerParametro(params, "sort")),
        direction: obtenerDirection(obtenerParametro(params, "direction")),
        pagina: leerPagina(obtenerParametro(params, "pagina"))
    });
    const parametros = {
        centroId: data.centroId,
        bodegaId: data.bodegaId,
        q: data.busqueda,
        linea: data.linea,
        bajoMinimo: data.bajoMinimo ? "1" : undefined,
        porCaducar: data.porCaducar ? "1" : undefined
    };
```

3. Dentro de `<InventarioFiltros …>` (convertirlo en etiqueta con hijos):

```tsx
                            <label className="space-y-1 text-sm">
                                <span>Línea</span>
                                <Select name="linea" defaultValue={data.linea}>
                                    <option value="">Todas las líneas</option>
                                    {data.lineas.map((linea) => (
                                        <option key={linea} value={linea}>
                                            {linea}
                                        </option>
                                    ))}
                                </Select>
                            </label>
                            <div className="flex flex-col justify-end gap-2 text-sm">
                                <label className="flex items-center gap-2">
                                    <input type="checkbox" name="bajoMinimo" value="1" defaultChecked={data.bajoMinimo} />
                                    Bajo stock mínimo
                                </label>
                                <label className="flex items-center gap-2">
                                    <input type="checkbox" name="porCaducar" value="1" defaultChecked={data.porCaducar} />
                                    Por caducar (30 días)
                                </label>
                            </div>
```

4. `StockTable`: reemplazar las props `centroId`, `bodegaId`, `busqueda` por `parametros={parametros}`, y debajo de la tabla:

```tsx
                        <Paginacion
                            ruta="/stock"
                            parametros={{ ...parametros, sort: data.sort, direction: data.direction }}
                            paginacion={data.paginacion}
                        />
```

- [ ] **Step 7: Verificación**

Run: `npx vitest run src/__tests__/stock-paginado.test.ts && npm test && npx tsc --noEmit && npm run lint`
Expected: todo en verde (restaurar `tsconfig.tsbuildinfo` si cambia).

- [ ] **Step 8: Prueba manual contra la base local con datos migrados**

Run: `npm run dev`. Con un R01 en `/stock`:
1. Se ven 50 filas y "Mostrando 1–50 de N"; N coincide con `SELECT COUNT(*) FROM (SELECT 1 FROM Stock GROUP BY ID_Product, ID_Bodega HAVING SUM(Cantidad_Disponible > 0) > 0 OR COUNT(*) = 1) t;` (si el admin ve todas las bodegas activas).
2. Ordenar por "Alerta" y por "Disponible" en ambas direcciones; paginar conserva el orden y los filtros.
3. "Por caducar (30 días)" solo muestra filas con alerta "caducidad próxima" o cuyo lote más próximo vence en ≤ 30 días.
4. Filtrar por línea y buscar por código numérico.

- [ ] **Step 9: Commit**

```bash
git add src/modules/stock src/shared/components/inventario/inventario-filtros.tsx src/app/stock/page.tsx src/__tests__/stock-paginado.test.ts
git commit -m "feat(stock): paginación en SQL y filtros de línea, bajo mínimo y por caducar"
```

---

### Task 5: Verificación de rendimiento en producción (después del merge)

- [ ] **Step 1:** Con un administrador, medir `/stock` (páginas 1 y 20, con y sin filtros) y `/salidas/nueva` (cambiando de bodega 3 veces): TTFB < 1 s y respuesta < 200 KB; la action de lotes responde en < 500 ms.
- [ ] **Step 2:** Confirmar en server-das que `restart_time` de `inventario-cmv` no sube (mismo comando que la fase 1, Task 9).
- [ ] **Step 3:** Anotar los resultados en el PR de la fase 2.
