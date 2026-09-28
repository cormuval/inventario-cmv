# Plan de Implementación: Exclusión Total de Lotes sin Stock en Salidas

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Impedir la visualización y selección de lotes con saldo en cero (`cantidadDisponible <= 0`) en el módulo de Salidas tanto para despachos clínicos como para mermas, y blindar el backend con validación explícita para evitar transacciones con lotes inexistentes o fantasma.

**Architecture:** La solución se estructura en tres capas defensivas: (1) función pura de filtrado y aserción en `movimientos.ts` con cobertura de pruebas unitarias en `movimientos.test.ts`, (2) exclusión estricta en el frontend dentro de `orden-salida-detalles-field.tsx` para que los lotes con saldo $\le 0$ no existan en el selector ni puedan escribirse, (3) control atómico en el Server Action `orden-salida.action.ts` en `descontarStock` rechazando cualquier intento con saldo cero, y (4) actualización del producto de prueba `#999` incorporando el lote `TEST-ZERO-00` (saldo 0) para verificación controlada.

**Tech Stack:** Next.js 15, React 19, TypeScript, Zod, Prisma ORM, Vitest, Tailwind CSS + shadcn/ui.

**Spec:** [`docs/specs/procedimiento-exclusion-lotes-sin-stock.md`](file:///c:/Users/benja/OneDrive/Escritorio/inventario-cmv-main/docs/specs/procedimiento-exclusion-lotes-sin-stock.md)

## Global Constraints

- Prohibido listar o permitir la selección de un lote con `cantidadDisponible <= 0` en cualquier tipo de salida (incluyendo "Merma").
- El backend debe arrojar un error específico cuando un lote tiene saldo 0: *"El lote '[X]' no tiene stock disponible (saldo: 0)."*
- Mantener la suite de tests existente pasando al 100% (`npx vitest run`).
- Todo el código, nombres de funciones y mensajes de error deben seguir las convenciones en español del proyecto.

---

### Task 1: Utilidad Pura de Filtrado de Existencias Operables

**Files:**
- Modify: `src/modules/stock/utils/movimientos.ts`
- Test: `src/__tests__/movimientos.test.ts`

**Interfaces:**
- Consumes: `StockDisponible` o lista de objetos con `cantidadDisponible: number`
- Produces: `filtrarLotesConStockDisponible<T extends { cantidadDisponible: number }>(lotes: T[]): T[]`

- [ ] **Step 1: Escribir la prueba unitaria que falla en `movimientos.test.ts`**

Agregar un nuevo bloque `describe` al final de `src/__tests__/movimientos.test.ts`:
```typescript
describe("filtrarLotesConStockDisponible", () => {
    it("excluye lotes con saldo 0 o negativo y conserva los de saldo mayor a 0", () => {
        const lotes = [
            { id: "1", lote: "L1", cantidadDisponible: 10 },
            { id: "2", lote: "L2", cantidadDisponible: 0 },
            { id: "3", lote: "L3", cantidadDisponible: -2 },
            { id: "4", lote: "L4", cantidadDisponible: 5 }
        ];

        const resultado = filtrarLotesConStockDisponible(lotes);
        expect(resultado).toHaveLength(2);
        expect(resultado.map((l) => l.lote)).toEqual(["L1", "L4"]);
    });
});
```

- [ ] **Step 2: Ejecutar vitest para verificar que falla**

Run: `npx vitest run src/__tests__/movimientos.test.ts`
Expected: FAIL indicando que `filtrarLotesConStockDisponible` no está definida o exportada.

- [ ] **Step 3: Implementar `filtrarLotesConStockDisponible` en `movimientos.ts`**

En `src/modules/stock/utils/movimientos.ts`:
```typescript
export function filtrarLotesConStockDisponible<T extends { cantidadDisponible: number }>(lotes: T[]): T[] {
    return lotes.filter((lote) => lote.cantidadDisponible > 0);
}
```

- [ ] **Step 4: Ejecutar vitest para verificar que pasa**

Run: `npx vitest run src/__tests__/movimientos.test.ts`
Expected: PASS.

---

### Task 2: Blindaje de Frontend en Formulario de Salidas

**Files:**
- Modify: `src/modules/orden-salida/components/orden-salida-detalles-field.tsx`

**Interfaces:**
- Consumes: `filtrarLotesConStockDisponible`, `esLoteCaducado`
- Produces: `stocksFiltrados` garantizando `cantidadDisponible > 0` en todo momento y mensaje descriptivo si no hay saldo disponible.

- [ ] **Step 1: Aplicar el filtro de saldo mayor a cero en `stocksFiltrados`**

En `src/modules/orden-salida/components/orden-salida-detalles-field.tsx`:
1. Importar `filtrarLotesConStockDisponible` desde `@/modules/stock/utils/movimientos`.
2. Actualizar el cálculo de `stocksFiltrados`:
```typescript
    const stocksFiltrados = useMemo(() => {
        return stocks.filter((stock) => {
            if (stock.bodegaId !== bodegaId) {
                return false;
            }
            if (stock.cantidadDisponible <= 0) {
                return false;
            }
            if (!esMerma && esLoteCaducado(stock.fechaCaducidad)) {
                return false;
            }
            return true;
        });
    }, [bodegaId, stocks, esMerma]);
```
3. En el renderizado de mensaje cuando no hay stock (línea ~166):
```tsx
    {stocksFiltrados.length === 0 && (
        <p className="text-sm text-muted-foreground">
            No hay existencias con stock disponible para la bodega seleccionada.
        </p>
    )}
```

- [ ] **Step 2: Ejecutar los tests existentes para asegurar que no hay regresiones**

Run: `npx vitest run`
Expected: PASS.

---

### Task 3: Protección Atómica en Server Action (Defensa en Profundidad)

**Files:**
- Modify: `src/modules/orden-salida/actions/orden-salida.action.ts`
- Modify: `src/__tests__/orden-salida-schema.test.ts` (o pruebas de action)

**Interfaces:**
- Consumes: `descontarStock`
- Produces: Error específico si `stock.cantidadDisponible <= 0` abortando con rollback antes de evaluar la resta de cantidad.

- [ ] **Step 1: Escribir prueba unitaria para verificar rechazo de lote con saldo cero**

En `src/__tests__/orden-salida-schema.test.ts` o en prueba correspondiente, comprobar que si un lote reporta saldo cero o no disponible se emita el error correspondiente.

- [ ] **Step 2: Modificar `descontarStock` en `orden-salida.action.ts`**

En `src/modules/orden-salida/actions/orden-salida.action.ts`:
Actualizar la comprobación en `descontarStock`:
```typescript
    if (!stock || stock.cantidadDisponible <= 0) {
        throw new Error(`El lote "${input.lote}" no tiene stock disponible (saldo: 0).`);
    }

    if (stock.cantidadDisponible < input.cantidad) {
        throw new Error(`Stock insuficiente para el lote "${input.lote}". Solicitado: ${input.cantidad}, disponible: ${stock.cantidadDisponible}.`);
    }
```

- [ ] **Step 3: Ejecutar la suite de pruebas unitarias**

Run: `npx vitest run`
Expected: PASS.

---

### Task 4: Semilla de Prueba con Lote Fantasma (`TEST-ZERO-00`)

**Files:**
- Modify: `prisma/seed-test-caducado.ts`

**Interfaces:**
- Produces:
  - Lote `TEST-ZERO-00` en producto `#999`: `cantidadDisponible: 0`, `fechaCaducidad: +6 meses`.

- [ ] **Step 1: Modificar `prisma/seed-test-caducado.ts` para agregar el lote en cero**

En `prisma/seed-test-caducado.ts`:
```typescript
    // Lote Fantasma / Agotado: Saldo 0 unidades
    await prisma.stock.upsert({
        where: {
            stock_lote_unico: {
                productoId: productoTest.id,
                bodegaId: bodega.id,
                lote: "TEST-ZERO-00",
                fechaCaducidad: fechaFutura
            }
        },
        update: {
            cantidadDisponible: 0,
            stockMinimo: 5,
            fechaCaducidad: fechaFutura,
            fechaUltimaActualizacion: new Date()
        },
        create: {
            productoId: productoTest.id,
            bodegaId: bodega.id,
            lote: "TEST-ZERO-00",
            fechaCaducidad: fechaFutura,
            cantidadDisponible: 0,
            stockMinimo: 5,
            fechaUltimaActualizacion: new Date()
        }
    });
```

- [ ] **Step 2: Ejecutar el script para sembrar los datos de prueba**

Run: `npm run db:seed:test-caducado`
Expected: Consola confirmando la creación de `TEST-ZERO-00 (Saldo: 0)`.

---

### Task 5: Verificación Integral del Protocolo y Certificación

**Files:**
- Test: `npx vitest run`
- TypeScript: `npx tsc --noEmit`
- Verificación manual en `http://localhost:3000/orden-salida`

- [ ] **Step 1: Ejecutar la suite completa de tests automatizados**

Run: `npx vitest run`
Expected: Todos los archivos de prueba pasando al 100%.

- [ ] **Step 2: Chequeo de compilación estricta de TypeScript**

Run: `npx tsc --noEmit`
Expected: 0 errores.

- [ ] **Step 3: Comprobación interactiva en el navegador**

1. Ir a `/orden-salida` con bodega `Bodega Clinica`.
2. En el campo *"Producto / lote disponible"*, escribir `TEST`.
3. **Verificación:** Comprobar que solo aparece `TEST-VIG-02`. El lote en cero `TEST-ZERO-00` **no aparece en la lista**.
4. Cambiar a "Merma": Comprobar que aparece `[CADUCADO] TEST-CAD-01` y `TEST-VIG-02`, pero `TEST-ZERO-00` **sigue excluido** porque no tiene existencia física.
