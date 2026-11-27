# Compatibilidad en movimientos de stock Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Impedir que traspasos internos y préstamos intercentros acrediten productos en bodegas incompatibles, con validación de servidor y opciones filtradas en UI.

**Architecture:** La regla pura se mueve desde `orden-entrada` a `shared` y se reutiliza en entradas, salidas y recepción. Cada acción valida las líneas reales antes de abrir su transacción; las interfaces filtran bodegas destino usando el tipo de origen o los detalles del préstamo.

**Tech Stack:** Next.js 15, React 19, TypeScript strict, Prisma, Vitest, Testing Library.

**Spec:** `docs/superpowers/specs/2026-11-27-compatibilidad-movimientos-stock-design.md`

## Global Constraints

- Una bodega `ASEO` solo opera productos cuya línea sea exactamente `ASEO`.
- Los productos de línea `ASEO` solo se acreditan en bodegas `ASEO`.
- La validación de servidor ocurre antes de crear órdenes o modificar stock.
- Consumo interno, merma, compensaciones y anulaciones no incorporan una validación de destino nueva.
- No corregir datos existentes.

## Review Focus

- Una operación con varios detalles se rechaza completa si solo uno es incompatible.
- Una petición manipulada no puede eludir el filtro visual.
- Una bodega ASEO no aparece para un préstamo clínico y una CLINICA no aparece para uno ASEO.
- Cambiar la bodega origen recalcula destinos y elimina una selección que dejó de ser válida.
- Consumo interno y merma continúan funcionando sin `bodegaDestinoId`.

---

### Task 1: Regla compartida de compatibilidad

**Files:**
- Create: `src/shared/utils/compatibilidad-bodega-producto.ts`
- Delete: `src/modules/orden-entrada/utils/compatibilidad-bodega-producto.ts`
- Modify: `src/modules/orden-entrada/actions/orden-entrada.action.ts`
- Modify: `src/modules/orden-entrada/components/orden-entrada-detalles-field.tsx`
- Modify: `src/__tests__/compatibilidad-bodega-producto.test.ts`

**Interfaces:**
- Produces: `esProductoCompatibleConBodega(tipoBodega, lineaProducto)`, `sonProductosCompatiblesConBodega(tipoBodega, productos)`, `filtrarProductosCompatibles(...)`, `obtenerMensajeIncompatibilidad(tipoBodega)`.

- [ ] **Step 1: Escribir pruebas fallidas para `sonProductosCompatiblesConBodega` y actualizar imports al módulo compartido.**
- [ ] **Step 2: Ejecutar `npx vitest run src/__tests__/compatibilidad-bodega-producto.test.ts` y confirmar el fallo esperado.**
- [ ] **Step 3: Mover la utilidad, implementar la evaluación de colección con `every` y actualizar consumidores de entrada.**
- [ ] **Step 4: Repetir la prueba y confirmar que pasa.**
- [ ] **Step 5: Commit `refactor: compartir compatibilidad de bodega y producto`.**

### Task 2: Validación de servidor en salidas con destino

**Files:**
- Modify: `src/modules/orden-salida/actions/orden-salida.action.ts`
- Modify: `src/__tests__/traspaso-bodega.test.ts`
- Modify: `src/__tests__/traspaso-intercentros-emision.test.ts`
- Modify: `src/__tests__/validacion-destinos-salida.test.ts`

**Interfaces:**
- Consumes: `sonProductosCompatiblesConBodega` y `obtenerMensajeIncompatibilidad` de Task 1.

- [ ] **Step 1: Agregar pruebas que rechacen un traspaso interno y un préstamo cuando cualquier producto sea incompatible, sin abrir la transacción.**
- [ ] **Step 2: Agregar pruebas que mantengan consumo interno y merma sin exigir bodega destino.**
- [ ] **Step 3: Ejecutar los tres archivos de pruebas y confirmar los fallos nuevos.**
- [ ] **Step 4: Consultar las líneas únicas de `parsed.detalles`, validar contra `bodegaDestino.tipo` para ambos tipos de movimiento y devolver el mensaje compartido antes de la transacción.**
- [ ] **Step 5: Repetir las pruebas y confirmar que pasan.**
- [ ] **Step 6: Commit `fix: validar compatibilidad en salidas con destino`.**

### Task 3: Filtrado de bodegas destino en nueva salida

**Files:**
- Modify: `src/modules/orden-salida/components/orden-salida-form.tsx`
- Modify: `src/__tests__/traspaso-bodega-form.test.tsx`
- Modify: `src/__tests__/orden-salida-ui.test.tsx`

**Interfaces:**
- Consumes: `esProductoCompatibleConBodega`; `Bodega.tipo` identifica ASEO o CLINICA.

- [ ] **Step 1: Agregar pruebas UI para excluir bodegas incompatibles en traspaso interno e intercentros y recalcular al cambiar origen.**
- [ ] **Step 2: Ejecutar ambos archivos y confirmar los fallos.**
- [ ] **Step 3: Filtrar ambos conjuntos de destinos comparando el tipo de bodega origen y destino mediante una línea representativa (`ASEO` para origen ASEO y no ASEO para CLINICA).**
- [ ] **Step 4: Repetir las pruebas y confirmar que pasan.**
- [ ] **Step 5: Commit `fix: filtrar bodegas destino compatibles`.**

### Task 4: Recepción segura de préstamos

**Files:**
- Modify: `src/modules/orden-entrada/actions/recepcion-prestamos.action.ts`
- Modify: `src/modules/orden-entrada/components/recepcion-prestamo-view.tsx`
- Modify: `src/app/orden-entrada/recepcion-prestamos/page.tsx`
- Modify: `src/__tests__/recepcion-prestamos.action.test.ts`
- Modify: `src/__tests__/recepcion-prestamos-ui.test.tsx`

**Interfaces:**
- Consumes: `sonProductosCompatiblesConBodega`; cada opción de bodega expone `tipo`.

- [ ] **Step 1: Agregar una prueba de acción que rechace una bodega incompatible antes de `$transaction`.**
- [ ] **Step 2: Agregar pruebas UI que filtren bodegas por todas las líneas del préstamo y limpien una sugerencia incompatible.**
- [ ] **Step 3: Ejecutar ambos archivos y confirmar los fallos.**
- [ ] **Step 4: Incluir `tipo` en opciones, filtrar con los detalles del préstamo y validar `bodegaDestino.tipo` en servidor antes de la transacción.**
- [ ] **Step 5: Repetir las pruebas y confirmar que pasan.**
- [ ] **Step 6: Commit `fix: validar compatibilidad al recibir prestamos`.**

### Task 5: Verificación integral y actualización del PR

**Files:**
- Modify: `docs/superpowers/plans/2026-11-27-compatibilidad-movimientos-stock.md` (marcar pasos completados)

- [ ] **Step 1: Ejecutar `npm test` y confirmar todos los archivos y pruebas aprobados.**
- [ ] **Step 2: Ejecutar `npm run build` y confirmar compilación y TypeScript aprobados.**
- [ ] **Step 3: Ejecutar `git diff --check` y revisar el diff completo contra `origin/main`.**
- [ ] **Step 4: Commit documental final si corresponde.**
- [ ] **Step 5: Subir `Actualizacion_Entrada_Stock` para actualizar el PR #40.**

