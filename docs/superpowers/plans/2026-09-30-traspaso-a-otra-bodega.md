# Plan de Implementación: Traspaso de Stock "A Otra Bodega" en el Mismo Centro

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Habilitar el flujo de traspaso interno de productos entre bodegas del mismo centro de salud ("A otra bodega"), descontando atómicamente el stock en la bodega emisora e incrementándolo en la bodega receptora, con selección asistida, persistencia relacional (`bodegaDestinoId`) y validación estricta de seguridad.

**Architecture:** Extender el módulo de salidas (`/orden-salida`) para ofrecer la opción `"A otra bodega"`. En el frontend, reemplazar el campo de destino libre por un selector desplegable filtrado de bodegas hermanas del mismo centro mediante la prop `bodegasDestino`. En el backend (`orden-salida.action.ts`), persistir `bodegaDestinoId` en `OrdenSalida` y ejecutar una transacción atómica `prisma.$transaction` que descuente de la bodega origen y aplique `upsert` incrementando el stock del mismo producto/lote/vencimiento en la bodega destino, con compensación simétrica al editar o eliminar.

**Tech Stack:** Next.js 15, React 19, TypeScript strict, Prisma ORM, MySQL 8.4, Vitest.

**Spec:** [`../specs/procedimiento-traspaso-a-otra-bodega.md`](../specs/procedimiento-traspaso-a-otra-bodega.md)

---

## Global Constraints

- TypeScript strict; sin `any`. Tipos explícitos para todas las funciones y componentes.
- Un traspaso solo puede ocurrir entre bodegas del mismo `centroId` y donde `bodegaDestinoId !== bodegaOrigenId`.
- No se permite transferir lotes caducados ni lotes sin stock disponible (`cantidadDisponible > 0`).
- La operación debe ser atómica en `$transaction` y registrada en la tabla `logs` mediante `AuditLogger` con los IDs de origen y destino.
- En caso de edición o eliminación, compensar ambas bodegas simétricamente y emitir error si falta `bodegaDestinoId`.

---

## Tareas de Implementación

### Tarea 1: Modelo de Datos y Esquema Prisma

**Archivos:**
- Modificar: `../../prisma/schema.prisma`

- [x] **Paso 1: Agregar relación `bodegaDestinoId` en `OrdenSalida` y `salidasDestino` en `Bodega`**
- [x] **Paso 2: Ejecutar validación y generación de cliente**
  `npx prisma validate && npx prisma generate`

---

### Tarea 2: Interfaz de Usuario y Selector Asistido de Bodega Destino

**Archivos:**
- Modificar: `../../src/app/orden-salida/page.tsx`
- Modificar: `../../src/modules/orden-salida/components/orden-salida-form.tsx`

- [x] **Paso 1: Resolver bodegas destino del centro en `page.tsx`**
  Pasar prop `bodegasDestino` a `OrdenSalidaForm` para permitir que operadores R03/R07 vean todas las bodegas hermanas de su centro.
- [x] **Paso 2: Estandarizar selectores de destino**
  - Para `"A otra bodega"`: Listar bodegas del mismo centro distintas de la de origen (`bodegaDestinoId`).
  - Para `"A Otros Centros"`, `"Consumo Interno"` y `"Merma"`: Selectores controlados según catálogo.
- [x] **Paso 3: Usar `TIPOS_SALIDA` en el selector de tipo de salida**

---

### Tarea 3: Lógica Transaccional en Servidor (`orden-salida.action.ts`)

**Archivos:**
- Modificar: `../../src/modules/orden-salida/schemas/orden-salida.schema.ts`
- Modificar: `../../src/modules/orden-salida/actions/orden-salida.action.ts`
- Modificar: `../../src/modules/reporte/actions/reporte.action.ts`

- [x] **Paso 1: Validar traspaso y persistir `bodegaDestinoId` en `crearOrdenSalida`**
  Persistir `bodegaDestinoId` en `OrdenSalida` sin modificar `codigoSalida`.
- [x] **Paso 2: Transferencia atómica en `$transaction`**
  Descontar en origen e incrementar en destino.
- [x] **Paso 3: Compensación en `actualizarDetalleSalida` y `eliminarDetalleSalida`**
  Exigir `bodegaDestinoId` (error si falta), revertir en origen y descontar en destino con `esCompensacion: true` (permitiendo saldos caducados tras el traspaso).
- [x] **Paso 4: Auditoría con IDs de origen y destino**
- [x] **Paso 5: Excluir traspasos internos del reporte de consumo mensual**

---

### Tarea 4: Pruebas Unitarias Automatizadas

**Archivos:**
- Modificar: `../../src/__tests__/traspaso-bodega.test.ts`
- Crear: `../../src/__tests__/traspaso-bodega-form.test.tsx`

- [x] **Paso 1: Pruebas de traspaso atómico, validaciones y saldo 0**
- [x] **Paso 2: Pruebas de eliminación y actualización con compensación**
- [x] **Paso 3: Prueba de orden sin `bodegaDestinoId` arrojando error**
- [x] **Paso 4: Prueba de interfaz para operador R07 con una sola bodega viendo destinos**

---

### Tarea 5: Verificación Integral del Sistema

- [x] **Paso 1: Ejecutar toda la suite de pruebas (62/62 pasando)**
  `npx vitest run`
- [x] **Paso 2: Validar tipos con TypeScript (0 errores)**
  `npx tsc --noEmit`
- [x] **Paso 3: Sincronizar y publicar rama en GitHub**
  `git push -u cormuval Traspaso-A-Otra-Bodega`
