# Compatibilidad Concurrente en Movimientos de Stock Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Garantizar que ningún camino que acredite stock pueda confirmar una combinación incompatible, incluso ante reclasificaciones concurrentes, y que la UI filtre destinos usando las líneas realmente seleccionadas.

**Architecture:** Una utilidad compartida adquirirá bloqueos `SELECT ... FOR UPDATE` sobre todas las bodegas receptoras, ordenadas por ID, y validará dentro de la misma transacción las líneas actuales. Movimientos y reclasificación compartirán ese protocolo; la UI elevará las líneas seleccionadas desde el detalle y las pruebas de concurrencia usarán un MySQL 8.4 dedicado.

**Tech Stack:** Next.js 15, React 19, TypeScript strict, Prisma 6, MySQL 8.4, Vitest y Testing Library.

**Spec:** `docs/superpowers/specs/2026-11-27-compatibilidad-movimientos-stock-design.md`

## Global Constraints

- Bodega `ASEO`: solo línea exacta `ASEO`; bodega `CLINICA`: cualquier línea distinta de `ASEO`.
- Toda acreditación valida y bloquea antes del primer cambio de stock; un rechazo no deja escrituras parciales.
- Si se bloquean varias bodegas, todas las IDs se deduplican y ordenan antes del primer `FOR UPDATE`.
- La emisión intercentros valida la sugerencia, pero la garantía definitiva ocurre al recepcionar.
- No migrar ni corregir automáticamente datos existentes; sí permitir trasladarlos a un destino compatible.
- No usar `prisma db push`; la suite dedicada aplica las migraciones versionadas existentes.

## Review Focus

- Una bodega desaparece entre la selección y el bloqueo: la operación falla sin alterar stock (Task 1).
- Dos movimientos bloquean las mismas bodegas en órdenes de entrada opuestos: ambos usan el mismo orden estable y no forman un ciclo (Task 1 y Task 7).
- Una operación contiene productos duplicados y uno incompatible: se deduplican consultas, pero se rechaza toda la operación (Task 1 y Task 4).
- La bodega sugerida de un préstamo deja de ser compatible antes de recibirlo: se limpia la sugerencia y se exige otra selección (Task 6).
- Una reversión falla por reclasificación: estado de orden, detalle y ambos saldos permanecen sin cambios (Task 4 y Task 7).

---

### Task 1: Protocolo compartido de bloqueo y compatibilidad

**Files:**
- Create: `src/shared/lib/compatibilidad-stock-transaccional.ts`
- Test: `src/__tests__/compatibilidad-stock-transaccional.test.ts`

**Interfaces:**
- Produces: `bloquearBodegasPorId(tx: Prisma.TransactionClient, bodegaIds: readonly string[]): Promise<Map<string, { tipo: TipoBodega; estado: boolean }>>`.
- Produces: `bloquearYValidarAcreditaciones(tx: Prisma.TransactionClient, acreditaciones: readonly { bodegaId: string; productoIds: readonly number[] }[]): Promise<Map<number, { linea: string }>>`; el mapa es la instantánea autoritativa de productos releída dentro de la transacción.
- Consumes: `sonProductosCompatiblesConBodega` y `obtenerMensajeIncompatibilidad` de `src/shared/utils/compatibilidad-bodega-producto.ts`.

- [ ] **Step 1: Escribir pruebas fallidas para IDs deduplicadas/ordenadas, consulta parametrizada `FOR UPDATE`, bodega ausente/inactiva, varios productos y una acreditación mixta incompatible.**
- [ ] **Step 2: Ejecutar `npx vitest run src/__tests__/compatibilidad-stock-transaccional.test.ts`; esperar fallos por módulo inexistente.**
- [ ] **Step 3: Implementar las dos interfaces; ejecutar una sola lectura bloqueante para todas las bodegas ordenadas y una sola consulta de líneas para productos deduplicados. Devolver la instantánea de líneas usada en la validación para que las acciones no reutilicen datos preliminares.**
- [ ] **Step 4: Repetir la prueba; esperar todas aprobadas.**
- [ ] **Step 5: Commit `feat: centralizar bloqueo de compatibilidad de stock`.**

### Task 2: Reclasificación segura de bodegas

**Files:**
- Modify: `src/modules/mantenedores/actions/mantenedores.action.ts`
- Modify: `src/__tests__/mantenedores-crud.action.test.ts`

**Interfaces:**
- Consumes: `bloquearBodegasPorId` de Task 1.

- [ ] **Step 1: Agregar pruebas que rechacen cambiar `CLINICA → ASEO` con stock positivo no ASEO y `ASEO → CLINICA` con stock ASEO, y acepten bodega vacía o stock compatible.**
- [ ] **Step 2: Agregar una prueba que compruebe que bloqueo, lectura de stock y `bodega.update` ocurren dentro del mismo callback transaccional.**
- [ ] **Step 3: Ejecutar `npx vitest run src/__tests__/mantenedores-crud.action.test.ts`; esperar que las nuevas pruebas fallen.**
- [ ] **Step 4: Mover la reclasificación a `$transaction`, bloquear la bodega, consultar stock positivo con `producto.linea`, validar contra `parsed.tipo` y actualizar solo si todo es compatible.**
- [ ] **Step 5: Repetir la prueba; esperar todas aprobadas.**
- [ ] **Step 6: Commit `fix: coordinar reclasificacion de bodegas con stock`.**

### Task 3: Entradas manuales bajo el protocolo común

**Files:**
- Modify: `src/modules/orden-entrada/actions/orden-entrada.action.ts`
- Modify: `src/__tests__/orden-entrada.action.test.ts`

**Interfaces:**
- Consumes: `bloquearYValidarAcreditaciones` de Task 1.

- [ ] **Step 1: Agregar pruebas para creación con varios detalles, edición que cambia producto y revalidación dentro de la transacción antes del primer `ordenEntrada.create`, `detalle.update` o `stock.upsert`.**
- [ ] **Step 2: Agregar prueba de reclasificación simulada entre la validación preliminar y el bloqueo; esperar rechazo sin escrituras.**
- [ ] **Step 3: Ejecutar `npx vitest run src/__tests__/orden-entrada.action.test.ts`; esperar fallos nuevos.**
- [ ] **Step 4: Invocar el protocolo común dentro de las transacciones de crear y actualizar; usar las líneas releídas bajo bloqueo como categoría persistida.**
- [ ] **Step 5: Repetir la prueba; esperar todas aprobadas.**
- [ ] **Step 6: Commit `fix: bloquear compatibilidad en entradas manuales`.**

### Task 4: Traspasos, ediciones y reversiones atómicas

**Files:**
- Modify: `src/modules/orden-salida/actions/orden-salida.action.ts`
- Modify: `src/__tests__/traspaso-bodega.test.ts`
- Modify: `src/__tests__/traspaso-intercentros-emision.test.ts`
- Modify: `src/__tests__/validacion-destinos-salida.test.ts`

**Interfaces:**
- Consumes: `bloquearYValidarAcreditaciones` de Task 1.

- [ ] **Step 1: Agregar pruebas con dos detalles (uno compatible y uno incompatible) para traspaso interno y emisión intercentros; esperar rechazo completo.**
- [ ] **Step 2: Agregar pruebas para `actualizarDetalleSalida`, `eliminarDetalleSalida` y `anularPrestamoAction`: una reclasificación incompatible rechaza antes de devolver stock y conserva orden, detalle y saldos.**
- [ ] **Step 3: Agregar prueba de una operación bilateral cuyas IDs llegan invertidas y comprobar que el helper recibe ambas antes del primer cambio de stock.**
- [ ] **Step 4: Ejecutar los tres archivos focalizados; esperar fallos nuevos.**
- [ ] **Step 5: Sustituir las lecturas MVCC actuales por el protocolo común en cada acreditación; para operaciones bilaterales declarar todas las bodegas receptoras en una sola llamada. Mantener emisión intercentros como validación sin acreditación.**
- [ ] **Step 6: Repetir las pruebas; esperar todas aprobadas.**
- [ ] **Step 7: Commit `fix: proteger traspasos y reversiones incompatibles`.**

### Task 5: Destinos de salida según líneas seleccionadas

**Files:**
- Modify: `src/modules/orden-salida/types/stock-disponible.ts`
- Modify: `src/modules/orden-salida/actions/lotes-disponibles.action.ts`
- Modify: `src/modules/orden-salida/components/orden-salida-detalles-field.tsx`
- Modify: `src/modules/orden-salida/components/orden-salida-form.tsx`
- Modify: `src/__tests__/orden-salida-lotes.test.tsx`
- Modify: `src/__tests__/traspaso-bodega-form.test.tsx`

**Interfaces:**
- Produces: `StockDisponible.producto.linea: string`.
- Produces: prop `onLineasSeleccionadasChange?: (lineas: string[]) => void` en `OrdenSalidaDetallesField`.

- [ ] **Step 1: Agregar pruebas para propagar líneas al seleccionar/quitar lotes, incluyendo productos repetidos y mezcla `ASEO`/no ASEO.**
- [ ] **Step 2: Agregar pruebas del formulario: sin detalles pide seleccionar productos; solo ASEO ofrece bodegas ASEO; solo clínicas ofrece CLINICA; mezcla no ofrece destino; cambiar origen o detalle limpia un destino inválido.**
- [ ] **Step 3: Ejecutar `npx vitest run src/__tests__/orden-salida-lotes.test.tsx src/__tests__/traspaso-bodega-form.test.tsx`; esperar fallos nuevos.**
- [ ] **Step 4: Incluir `linea` en la consulta/tipo, elevar las líneas seleccionadas y reemplazar la línea representativa del origen por validación de todas las líneas seleccionadas.**
- [ ] **Step 5: Repetir las pruebas; esperar todas aprobadas.**
- [ ] **Step 6: Commit `fix: filtrar destinos por productos seleccionados`.**

### Task 6: Recepción autoritativa y estados claros de UI

**Files:**
- Modify: `src/modules/orden-entrada/actions/recepcion-prestamos.action.ts`
- Modify: `src/modules/orden-entrada/components/recepcion-prestamo-view.tsx`
- Modify: `src/__tests__/recepcion-prestamos.action.test.ts`
- Modify: `src/__tests__/recepcion-prestamos-ui.test.tsx`

**Interfaces:**
- Consumes: `bloquearYValidarAcreditaciones` de Task 1.

- [ ] **Step 1: Agregar prueba de servidor con préstamo mixto y prueba de reclasificación entre búsqueda y bloqueo; ambas rechazan antes de `updateMany`/`stock.upsert`.**
- [ ] **Step 2: Agregar pruebas UI que limpien una sugerencia incompatible, nunca la envíen y distingan “sin bodegas asignadas” de “sin bodegas compatibles”.**
- [ ] **Step 3: Ejecutar `npx vitest run src/__tests__/recepcion-prestamos.action.test.ts src/__tests__/recepcion-prestamos-ui.test.tsx`; esperar fallos nuevos.**
- [ ] **Step 4: Usar el protocolo común al inicio de la transacción de recepción; sanear `bodegaDestinoId` también cuando el filtro quede vacío y renderizar los dos mensajes diferenciados.**
- [ ] **Step 5: Repetir las pruebas; esperar todas aprobadas.**
- [ ] **Step 6: Commit `fix: asegurar recepcion compatible de prestamos`.**

### Task 7: Pruebas reales de concurrencia con MySQL 8.4

**Files:**
- Create: `docker-compose.integration.yml`
- Create: `vitest.integration.config.ts`
- Create: `scripts/run-stock-integration-tests.ts`
- Create: `src/__tests__/integration/compatibilidad-stock-concurrencia.integration.test.ts`
- Modify: `vitest.config.ts`
- Modify: `package.json`
- Modify: `.github/workflows/ci.yml`

**Interfaces:**
- Produces: `npm run services:integration:up`, `npm run services:integration:down` y `npm run test:integration:stock` contra una base dedicada en puerto `3309`.
- Consumes: migraciones versionadas mediante `prisma migrate deploy`; nunca `db push`.

- [ ] **Step 1: Crear el entorno MySQL dedicado y el runner multiplataforma en TypeScript que inicia el servicio, fija `DATABASE_URL` desde `DATABASE_URL_INTEGRATION`, espera salud, aplica `prisma migrate deploy`, ejecuta solo `*.integration.test.ts` en entorno Node y siempre detiene el contenedor. Excluir esos archivos de Vitest unitario.**
- [ ] **Step 2: Extraer de las Server Actions callbacks transaccionales internos, sin autenticación ni parseo HTTP, para entrada manual, traspaso, recepción y reversión; las acciones y las pruebas de integración deben consumir exactamente esos callbacks, evitando duplicar la lógica de stock en el test.**
- [ ] **Step 3: Escribir pruebas concurrentes fallidas usando dos `PrismaClient`: movimiento primero y reclasificación primero para entrada manual, traspaso interno y recepción; agregar reversión posterior a reclasificación y orden estable con dos bodegas.**
- [ ] **Step 4: Ejecutar `npm run test:integration:stock`; esperar que al menos una intercalación demuestre la carrera antes de los bloqueos definitivos.**
- [ ] **Step 5: Completar cualquier adaptación mínima de los callbacks/utilidades necesaria para que todas las rutas usen el protocolo real.**
- [ ] **Step 6: Repetir `npm run test:integration:stock`; esperar todas aprobadas y cero combinaciones incompatibles.**
- [ ] **Step 7: Integrar el comando en `.github/workflows/ci.yml`; el runner debe garantizar la limpieza del contenedor aun cuando migren o fallen las pruebas.**
- [ ] **Step 8: Commit `test: verificar compatibilidad concurrente en mysql`.**

### Task 8: Documentación, verificación y actualización del PR

**Files:**
- Modify: `docs/superpowers/plans/2026-11-27-compatibilidad-movimientos-stock.md`
- Modify: `docs/superpowers/specs/2026-11-27-compatibilidad-movimientos-stock-design.md` solo si la implementación revela una precisión necesaria.

- [ ] **Step 1: Marcar las tareas ejecutadas y registrar que el PR vigente es #42, no #40.**
- [ ] **Step 2: Ejecutar `npm test`; esperar todos los archivos unitarios aprobados.**
- [ ] **Step 3: Ejecutar `npm run test:integration:stock`; esperar todas las intercalaciones MySQL aprobadas.**
- [ ] **Step 4: Ejecutar `npm run build` y `npx tsc --noEmit`; esperar éxito.**
- [ ] **Step 5: Ejecutar `git diff --check origin/main...HEAD`; esperar salida vacía.**
- [ ] **Step 6: Revisar el diff completo, solicitar revisión independiente y corregir cualquier hallazgo Critical/Important con RED→GREEN.**
- [ ] **Step 7: Commit documental final y subir `Actualizacion_Entrada_Stock` para actualizar el PR #42.**
