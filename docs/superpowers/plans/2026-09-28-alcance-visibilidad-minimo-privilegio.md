# Plan de Implementación: Alcance de Visibilidad por Usuario, Bodega y Centro (Principio de Mínimo Privilegio)

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Implementar el control de acceso y visibilidad por alcance (principio de mínimo privilegio) en los módulos de Salidas, Entradas y Reportes, asegurando que los funcionarios solo operen y visualicen las bodegas y centros asignados, manteniendo la vista panorámica exclusiva para el Administrador Comunal (DAS).

**Architecture:** Centralizar la resolución de permisos y alcance en `src/shared/lib/inventario-alcance.ts` (`obtenerAlcanceInventario` y `validarCentroBodegaEnAlcance`), aplicándolo en cascada sobre las consultas de lectura (`listarOrdenesSalida`, `listarOrdenesEntrada`, `listarReporteConsumoMensual`), las Server Actions de mutación (creación, edición y eliminación de detalles) y los selectores de las páginas UI (`/orden-salida`).

**Tech Stack:** Next.js 15 (App Router), React 19, TypeScript strict, Prisma ORM, MySQL 8.4, Vitest.

**Spec:** [`docs/specs/procedimiento-alcance-visibilidad-minimo-privilegio.md`](../../specs/procedimiento-alcance-visibilidad-minimo-privilegio.md)

---

## Global Constraints

- TypeScript strict; sin `any`. Tipos explícitos para todas las funciones.
- No romper flujos existentes para el Administrador (`R01`), quien conserva vista panorámica de toda la comuna.
- Toda mutación debe auditarse con `AuditLogger` y validar autorización en backend antes de ejecutar cambios en la base de datos.
- Mantener pruebas unitarias automatizadas con Vitest en `src/__tests__`.

---

## Tareas de Implementación

### Tarea 1: Robustecer Resolución de Bodegas Asignadas en `inventario-alcance.ts` y Crear Pruebas

**Archivos:**
- Modificar: `src/shared/lib/inventario-alcance.ts`
- Crear: `src/__tests__/inventario-alcance.test.ts`

- [ ] **Paso 1: Escribir prueba unitaria para `inventario-alcance`**
  Crear `src/__tests__/inventario-alcance.test.ts` simulando `requireSessionUser` y Prisma para validar que un usuario con `bodegaId` asignada o con `EncargadosBodega` reciba sus bodegas correctamente.
- [ ] **Paso 2: Ejecutar prueba y verificar que falle o requiera la unión**
  Ejecutar: `npx vitest run src/__tests__/inventario-alcance.test.ts`
- [ ] **Paso 3: Implementar la unión de bodegas en `obtenerAlcanceBodegasAsociadas`**
  En `src/shared/lib/inventario-alcance.ts`:
  Consultar tanto `EncargadosBodega` como la bodega directa en `usuario.bodegaId` (si pertenece a `usuario.centroId`), unificando y deduplicando por `id`.
- [ ] **Paso 4: Ejecutar prueba y confirmar que pase**
  Ejecutar: `npx vitest run src/__tests__/inventario-alcance.test.ts`
- [ ] **Paso 5: Commit del cambio**
  `git add src/shared/lib/inventario-alcance.ts src/__tests__/inventario-alcance.test.ts; git commit -m "feat(auth): unificar resolución de bodegas asignadas en alcance de inventario"`

---

### Tarea 2: Blindar Módulo de Salidas (`orden-salida.action.ts`, `app/orden-salida/page.tsx`, `orden-salida-form.tsx`)

**Archivos:**
- Modificar: `src/modules/orden-salida/actions/orden-salida.action.ts`
- Modificar: `src/app/orden-salida/page.tsx`
- Modificar: `src/modules/orden-salida/components/orden-salida-form.tsx`

- [ ] **Paso 1: Aplicar filtro de alcance en `listarOrdenesSalida()`**
  En `src/modules/orden-salida/actions/orden-salida.action.ts`:
  Obtener alcance con `const alcance = await obtenerAlcanceInventario()`.
  Filtrar con:
  ```ts
  where: {
      bodegaId: { in: alcance.bodegaIds },
      centroId: { in: alcance.centroIds }
  }
  ```
- [ ] **Paso 2: Validar alcance en `crearOrdenSalida`, `actualizarDetalleSalida` y `eliminarDetalleSalida`**
  En `crearOrdenSalida`: agregar `await validarCentroBodegaEnAlcance(parsed.centroId, parsed.bodegaId);`.
  En `actualizarDetalleSalida`: tras obtener `previo`, invocar `await validarCentroBodegaEnAlcance(previo.ordenSalida.centroId, previo.ordenSalida.bodegaId);`.
  En `eliminarDetalleSalida`: tras obtener `detalle`, invocar `await validarCentroBodegaEnAlcance(detalle.ordenSalida.centroId, detalle.ordenSalida.bodegaId);`.
- [ ] **Paso 3: Actualizar `src/app/orden-salida/page.tsx` para suministrar alcance filtrado**
  Usar `const alcance = await obtenerAlcanceInventario()`.
  Filtrar stocks con `bodegaId: { in: alcance.bodegaIds }`.
  Pasar a `OrdenSalidaForm`:
  - `centros={alcance.centros}`
  - `bodegas={alcance.bodegas}`
  - `centroId={alcance.centroId}`
  - `bodegaId={alcance.bodegaId}`
  - `puedeFiltrarCentro={alcance.puedeFiltrarCentro}`
- [ ] **Paso 4: Actualizar `OrdenSalidaForm` para respetar `puedeFiltrarCentro` y sincronizar bodega seleccionada**
  Adaptar `OrdenSalidaForm` para bloquear el centro si `!puedeFiltrarCentro` y filtrar las bodegas según el centro seleccionado.
- [ ] **Paso 5: Commit del cambio**
  `git add src/modules/orden-salida/actions/orden-salida.action.ts src/app/orden-salida/page.tsx src/modules/orden-salida/components/orden-salida-form.tsx; git commit -m "feat(salidas): aplicar segregación por alcance y validar centro/bodega en salidas"`

---

### Tarea 3: Corregir Alcance en Módulo de Entradas (`orden-entrada.action.ts`)

**Archivos:**
- Modificar: `src/modules/orden-entrada/actions/orden-entrada.action.ts`

- [ ] **Paso 1: Actualizar `listarOrdenesEntrada()` con filtro por alcance**
  Reemplazar el filtro restrictivo `usuarioId: user.id` por `bodegaId: { in: alcance.bodegaIds }` y `centroId: { in: alcance.centroIds }`, permitiendo que funcionarios de la misma bodega vean el historial común de ingresos de los últimos 90 días sin exponer otras bodegas.
- [ ] **Paso 2: Validar alcance en `actualizarDetalleEntrada` y `eliminarDetalleEntrada`**
  Verificar que `previo.ordenEntrada.centroId` y `previo.ordenEntrada.bodegaId` pertenezcan al alcance del usuario mediante `validarCentroBodegaEnAlcance`.
- [ ] **Paso 3: Commit del cambio**
  `git add src/modules/orden-entrada/actions/orden-entrada.action.ts; git commit -m "feat(entradas): habilitar continuidad de turno en historial y blindar mutaciones por alcance"`

---

### Tarea 4: Restringir Módulo de Reportes (`reporte.action.ts`)

**Archivos:**
- Modificar: `src/modules/reporte/actions/reporte.action.ts`

- [ ] **Paso 1: Aplicar `obtenerAlcanceInventario()` en `listarReporteConsumoMensual`**
  Filtrar las consultas de `ordenSalidaDetalle` y `stock` limitando las bodegas a `alcance.bodegaIds` y centros a `alcance.centroIds`.
  Si `alcance.bodegaIds.length === 0`, retornar arreglo vacío.
- [ ] **Paso 2: Commit del cambio**
  `git add src/modules/reporte/actions/reporte.action.ts; git commit -m "feat(reporte): acotar reporte mensual de consumo al alcance del funcionario"`

---

### Tarea 5: Verificación Integral del Sistema

- [ ] **Paso 1: Ejecutar suite de pruebas unitarias**
  `npx vitest run`
- [ ] **Paso 2: Ejecutar validación de tipos TypeScript**
  `npx tsc --noEmit`
- [ ] **Paso 3: Verificación manual de los flujos con usuarios de distintos roles**
