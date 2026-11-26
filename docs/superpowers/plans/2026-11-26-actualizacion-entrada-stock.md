# Actualización de entrada y filtro de stock Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Clasificar bodegas como `ASEO` o `CLINICA`, impedir entradas de productos incompatibles y agregar el filtro **Sin Stock** exclusivo para Encargados de Bodega.

**Architecture:** Prisma será la fuente de verdad del tipo de bodega. Una utilidad pura del módulo de entradas expresará la regla de compatibilidad y será reutilizada por el formulario y las Server Actions; Stock ampliará su consulta SQL consolidada y normalizará el nuevo filtro según el rol autenticado antes de contar y paginar.

**Tech Stack:** Next.js 15 App Router, React 19, TypeScript strict, Prisma/MySQL, Zod, Vitest y Testing Library.

**Spec:** `docs/superpowers/specs/2026-11-26-actualizacion-entrada-stock-design.md`

## Global Constraints

- Los valores persistidos del tipo de bodega son exactamente `ASEO` y `CLINICA`; la interfaz muestra **Aseo** y **Clínica**.
- La línea de aseo se reconoce únicamente mediante igualdad exacta con `ASEO`.
- Todo cambio en `prisma/schema.prisma` incluye una migración versionada; no usar `db:push`.
- La compatibilidad debe validarse en el servidor antes de abrir la transacción que crea la orden o modifica stock.
- `sinStock=1` está disponible para todos los roles con acceso a `/stock` y respeta su alcance de inventario.
- **Sin Stock** tiene prioridad sobre **Bajo stock mínimo** cuando ambos parámetros llegan activos.
- Las consultas SQL de listado y conteo deben aplicar exactamente los mismos filtros.

## Review Focus

- Una bodega existente con “aseo” en cualquier combinación de mayúsculas se migra a `ASEO`; cualquier otro nombre queda `CLINICA`: prueba de migración/estructura en Task 1.
- Cambiar entre bodegas de tipos distintos no deja productos incompatibles ocultos en inputs del formulario: prueba de interacción en Task 3.
- Una petición manual con producto incompatible se rechaza antes de `prisma.$transaction`: prueba de acción en Task 3.
- Un usuario de cualquier rol con acceso a `/stock` puede activar y conservar `sinStock=1`: prueba de acción y página en Task 4.
- Grupos con varios lotes agotados aparecen con **Sin Stock**, pero productos sin ningún registro de Stock no se inventan: prueba SQL en Task 4.

---

### Task 1: Persistir y administrar el tipo de bodega

**Files:**
- Modify: `prisma/schema.prisma`
- Create: `prisma/migrations/<timestamp>_tipo_bodega_aseo_clinica/migration.sql`
- Modify: `prisma/seed.ts`
- Modify: `src/modules/mantenedores/schemas/mantenedores.schema.ts`
- Modify: `src/modules/mantenedores/actions/mantenedores.action.ts`
- Modify: `src/modules/mantenedores/components/bodegas/bodega-form-modal.tsx`
- Modify: `src/modules/mantenedores/components/bodegas/bodegas-tabla.tsx`
- Test: `src/__tests__/mantenedores-crud.action.test.ts`
- Test: `src/__tests__/mantenedores-crud-ui.test.tsx`

**Interfaces:**
- Produces: Prisma enum `TipoBodega` con `ASEO | CLINICA` y `Bodega.tipo: TipoBodega`.
- Produces: formularios de bodega con `tipo` obligatorio y etiquetas **Aseo** / **Clínica**.
- Consumes: autorización administrativa y auditoría existentes en `mantenedores.action.ts`.

- [ ] **Step 1: Escribir pruebas fallidas del esquema y las acciones de bodega**

  En `mantenedores-crud.action.test.ts`, ampliar los casos `crearBodega` y `editarBodega` para enviar `tipo: "ASEO"` / `"CLINICA"` y afirmar que Prisma recibe ese valor. Agregar un caso que envíe un tipo desconocido y compruebe que no se persiste. En la edición, afirmar que un cambio de tipo se incorpora al detalle auditado.

- [ ] **Step 2: Escribir pruebas fallidas de la interfaz del mantenedor**

  En `mantenedores-crud-ui.test.tsx`, agregar `tipo` a `mockBodegas`; comprobar que la tabla muestra **Aseo** y **Clínica**, que el modal nuevo ofrece ambos valores y que el modal de edición abre con el tipo actual seleccionado.

- [ ] **Step 3: Ejecutar las pruebas focalizadas y confirmar el fallo**

  Run: `npm test -- src/__tests__/mantenedores-crud.action.test.ts src/__tests__/mantenedores-crud-ui.test.tsx`

  Expected: FAIL porque `Bodega` y los formularios aún no exponen `tipo`.

- [ ] **Step 4: Agregar el modelo Prisma y su migración formal**

  En `schema.prisma`, declarar `enum TipoBodega { ASEO CLINICA }` y agregar `tipo TipoBodega @default(CLINICA) @map("Tipo")` a `Bodega`. Crear la migración con `npm run db:migrate -- --name tipo_bodega_aseo_clinica` y ajustar su SQL para que, después de crear la columna, ejecute una actualización equivalente a `CASE WHEN UPPER(Bodega) LIKE '%ASEO%' THEN 'ASEO' ELSE 'CLINICA' END`. No usar `db:push`.

- [ ] **Step 5: Actualizar seed, validación, persistencia y auditoría**

  En `prisma/seed.ts`, fijar `tipo: "CLINICA"` para `bodega-clinica` y `tipo: "ASEO"` para `bodega-aseo`, tanto en `create` como en `update`. En ambos esquemas Zod de bodega aceptar únicamente `z.enum(["ASEO", "CLINICA"])`. En `crearBodega` y `editarBodega`, leer `formData.get("tipo")`, persistirlo y registrar el cambio de tipo en la auditoría de edición.

- [ ] **Step 6: Actualizar modal y tabla de bodegas**

  Incorporar un `Select` etiquetado **Tipo de bodega** en `bodega-form-modal.tsx`, con opciones `CLINICA`/**Clínica** y `ASEO`/**Aseo**, usando `CLINICA` como valor inicial al crear. En `bodegas-tabla.tsx`, agregar la columna **Tipo** y mostrar la etiqueta legible correspondiente.

- [ ] **Step 7: Regenerar Prisma y ejecutar pruebas**

  Run: `npm run db:generate`

  Expected: PASS y cliente Prisma generado con `TipoBodega` y `Bodega.tipo`.

  Run: `npm test -- src/__tests__/mantenedores-crud.action.test.ts src/__tests__/mantenedores-crud-ui.test.tsx`

  Expected: PASS.

- [ ] **Step 8: Commit**

  ```bash
  git add prisma/schema.prisma prisma/migrations prisma/seed.ts src/modules/mantenedores src/__tests__/mantenedores-crud.action.test.ts src/__tests__/mantenedores-crud-ui.test.tsx
  git commit -m "feat: clasificar bodegas por tipo"
  ```

### Task 2: Centralizar la regla de compatibilidad bodega–producto

**Files:**
- Create: `src/modules/orden-entrada/utils/compatibilidad-bodega-producto.ts`
- Create: `src/__tests__/compatibilidad-bodega-producto.test.ts`

**Interfaces:**
- Consumes: `TipoBodega` de `@prisma/client`.
- Produces: `export const LINEA_ASEO = "ASEO" as const`.
- Produces: `export function esProductoCompatibleConBodega(tipoBodega: TipoBodega, lineaProducto: string): boolean`.
- Produces: `export function filtrarProductosCompatibles<T extends { linea: string }>(tipoBodega: TipoBodega, productos: readonly T[]): T[]`.
- Produces: `export function obtenerMensajeIncompatibilidad(tipoBodega: TipoBodega): string`.

- [ ] **Step 1: Escribir las pruebas unitarias fallidas**

  Crear casos que demuestren:

  - `ASEO` acepta exactamente línea `ASEO` y rechaza `CLINICO`, `Aseo` y cualquier otra.
  - `CLINICA` rechaza exactamente `ASEO` y acepta las demás líneas.
  - El filtrado conserva objetos y orden originales.
  - Los mensajes distinguen “no corresponde a una bodega de aseo” y “solo pueden ingresarse en bodegas de aseo”.

- [ ] **Step 2: Ejecutar la prueba y confirmar el fallo**

  Run: `npm test -- src/__tests__/compatibilidad-bodega-producto.test.ts`

  Expected: FAIL porque la utilidad no existe.

- [ ] **Step 3: Implementar la utilidad pura**

  Implementar las tres funciones con igualdad estricta contra `LINEA_ASEO`, sin acceso a Prisma ni estado global. Devolver nuevos arrays desde `filtrarProductosCompatibles`.

- [ ] **Step 4: Ejecutar la prueba y confirmar que pasa**

  Run: `npm test -- src/__tests__/compatibilidad-bodega-producto.test.ts`

  Expected: PASS.

- [ ] **Step 5: Commit**

  ```bash
  git add src/modules/orden-entrada/utils/compatibilidad-bodega-producto.ts src/__tests__/compatibilidad-bodega-producto.test.ts
  git commit -m "feat: definir compatibilidad entre bodegas y productos"
  ```

### Task 3: Aplicar la compatibilidad en Nueva entrada y en el servidor

**Files:**
- Modify: `src/modules/orden-entrada/components/orden-entrada-form.tsx`
- Modify: `src/modules/orden-entrada/components/orden-entrada-detalles-field.tsx`
- Modify: `src/modules/orden-entrada/actions/orden-entrada.action.ts`
- Modify: `src/__tests__/origenes-orden-entrada.test.tsx`
- Modify: `src/__tests__/orden-entrada.action.test.ts`

**Interfaces:**
- Consumes: `Bodega.tipo` y las funciones de Task 2.
- Produces: `OrdenEntradaDetallesField({ productos, resetVersion? })` o un `key` controlado que reinicia filas al cambiar de tipo de bodega.
- Produces: validación de compatibilidad previa a `prisma.$transaction` en `crearOrdenEntrada`.
- Produces: validación de compatibilidad previa a la transacción en `actualizarDetalleEntrada`.

- [ ] **Step 1: Escribir pruebas fallidas del formulario**

  En `origenes-orden-entrada.test.tsx`, actualizar fixtures de bodega con `tipo`. Agregar dos bodegas del mismo centro (`ASEO` y `CLINICA`) y productos `ASEO`, `CLINICO` y otra línea. Comprobar que el combobox solo ofrece el catálogo compatible con la bodega seleccionada. Seleccionar un producto, cambiar a una bodega del otro tipo y afirmar que el input oculto `productoId` vuelve a vacío y desaparece la selección incompatible.

- [ ] **Step 2: Escribir pruebas fallidas de las Server Actions**

  En `orden-entrada.action.test.ts`, ampliar el mock Prisma con `bodega.findFirst` o `findUnique`. Probar:

  - `crearOrdenEntrada`: bodega `ASEO` + producto `CLINICO` rechaza y no llama `$transaction`.
  - `crearOrdenEntrada`: bodega `CLINICA` + producto `ASEO` rechaza y no llama `$transaction`.
  - Ambas combinaciones compatibles conservan creación y stock.
  - Producto inactivo o inexistente conserva el error vigente.
  - `actualizarDetalleEntrada` rechaza una nueva línea incompatible antes de revertir stock.

- [ ] **Step 3: Ejecutar pruebas y confirmar los fallos**

  Run: `npm test -- src/__tests__/origenes-orden-entrada.test.tsx src/__tests__/orden-entrada.action.test.ts`

  Expected: FAIL porque el catálogo aún no depende del tipo y las acciones no cargan `Bodega.tipo`.

- [ ] **Step 4: Filtrar el catálogo y reiniciar detalles al cambiar de bodega**

  En `OrdenEntradaForm`, resolver la bodega seleccionada por ID, derivar `productosCompatibles` con `useMemo` y pasarlos a `OrdenEntradaDetallesField`. Incrementar una clave/versión de detalle al cambiar de centro o al cambiar a una bodega de tipo distinto, de modo que no queden inputs incompatibles en el DOM. Mantener intacto el reinicio completo después de un envío exitoso.

- [ ] **Step 5: Validar compatibilidad en `crearOrdenEntrada`**

  Después de `validarCentroBodegaEnAlcance`, cargar la bodega activa por `id` y `centroId` con `select: { tipo: true }`. Extender la consulta de productos activos para obtener `id` y `linea`; rechazar primero faltantes/inactivos y luego cualquier línea incompatible usando Task 2. Solo después abrir `prisma.$transaction`.

- [ ] **Step 6: Validar compatibilidad en `actualizarDetalleEntrada`**

  Incluir `bodega: { select: { tipo: true } }` al cargar la orden del detalle, o consultar el tipo por su ID. Validar la línea activa del nuevo producto contra ese tipo antes de revertir la entrada anterior y actualizar el detalle.

- [ ] **Step 7: Ejecutar pruebas focalizadas**

  Run: `npm test -- src/__tests__/compatibilidad-bodega-producto.test.ts src/__tests__/origenes-orden-entrada.test.tsx src/__tests__/orden-entrada.action.test.ts`

  Expected: PASS.

- [ ] **Step 8: Commit**

  ```bash
  git add src/modules/orden-entrada src/__tests__/origenes-orden-entrada.test.tsx src/__tests__/orden-entrada.action.test.ts
  git commit -m "feat: restringir productos por tipo de bodega"
  ```

### Task 4: Agregar Sin Stock para todos los roles

**Files:**
- Modify: `src/config/auth.ts`
- Modify: `src/app/stock/page.tsx`
- Modify: `src/modules/stock/actions/stock.action.ts`
- Modify: `src/modules/stock/utils/stock-consulta.ts`
- Modify: `src/__tests__/stock-consulta.test.ts`
- Modify: `src/__tests__/stock-paginado.test.ts`
- Create: `src/__tests__/stock-page.test.tsx`

**Interfaces:**
- Extends: `ListarStockInput.sinStock?: boolean`.
- Extends: `ListarStockResult.sinStock: boolean`.
- Extends: `FiltrosConsultaStock.sinStock: boolean`.
- Consumes: `InventarioAlcance.usuario.rol` para autorizar el filtro.

- [ ] **Step 1: Escribir pruebas SQL fallidas**

  En `stock-consulta.test.ts`, agregar `sinStock: false` al fixture `BASE`. Crear casos que afirmen:

  - Con `sinStock: true`, el agrupado admite grupos sin lotes positivos aunque tengan varios lotes y la condición final exige `g.cantidad = 0`.
  - Sin el filtro se conserva la regla vigente `lotesConExistencia > 0 OR lotes = 1`.
  - `construirConteoStock` y `construirConsultaStock` contienen la misma condición de cero.
  - `bajoMinimo` no añade su condición cuando la acción ya lo normalizó a `false`.

- [ ] **Step 2: Escribir pruebas fallidas de autorización y normalización**

  En `stock-paginado.test.ts`, comprobar que `R03` y `R01` aceptan `sinStock: true` y que ambas consultas reciben el filtro. Para cualquier rol con `sinStock` y `bajoMinimo`, afirmar `sinStock === true` y `bajoMinimo === false`.

- [ ] **Step 3: Escribir pruebas fallidas de la página**

  Crear `stock-page.test.tsx` con mock de `listarStockConsolidado`. Probar que:

  - Todos los roles renderizan el checkbox **Sin Stock** y reflejan `defaultChecked`.
  - `sinStock=1` se envía a la acción y se conserva en los parámetros de tabla/paginación.

- [ ] **Step 4: Ejecutar pruebas y confirmar los fallos**

  Run: `npm test -- src/__tests__/stock-consulta.test.ts src/__tests__/stock-paginado.test.ts src/__tests__/stock-page.test.tsx`

  Expected: FAIL porque `sinStock` aún no forma parte de los contratos ni de la consulta.

- [ ] **Step 5: Implementar la consulta SQL de grupos agotados**

  Extender `FiltrosConsultaStock`. Hacer que `agrupado` reciba `sinStock`: cuando sea `true`, no descartar grupos con varios lotes agotados; cuando sea `false`, mantener el `HAVING` actual. En `condiciones`, agregar `g.cantidad = 0` para el filtro. Conservar el origen en `Stock`, por lo que nunca se generan combinaciones producto–bodega inexistentes.

- [ ] **Step 6: Normalizar el filtro por rol en la acción**

  En `listarStockConsolidado`, calcular `sinStock = input.sinStock ?? false` y `bajoMinimo = sinStock ? false : (input.bajoMinimo ?? false)`. Incluir los valores normalizados tanto en `base` como en `filtros`, conservando el alcance de inventario resuelto para el rol.

- [ ] **Step 7: Incorporar el checkbox y preservar la URL**

  En `src/app/stock/page.tsx`, leer `sinStock=1`, pasarlo a la acción y agregarlo a `parametros` cuando esté activo. Renderizar el checkbox junto a los existentes para todos los roles. Las pruebas deben fijar que el resultado servidor siempre prioriza **Sin Stock** sobre **Bajo stock mínimo**.

- [ ] **Step 8: Ejecutar pruebas focalizadas**

  Run: `npm test -- src/__tests__/stock-consulta.test.ts src/__tests__/stock-paginado.test.ts src/__tests__/stock-page.test.tsx`

  Expected: PASS.

- [ ] **Step 9: Commit**

  ```bash
  git add src/config/auth.ts src/app/stock/page.tsx src/modules/stock src/__tests__/stock-consulta.test.ts src/__tests__/stock-paginado.test.ts src/__tests__/stock-page.test.tsx
  git commit -m "feat: filtrar existencias sin stock"
  ```

### Task 5: Verificación integral y documentación de la migración

**Files:**
- Modify if needed: files changed in Tasks 1–4 only

**Interfaces:**
- Consumes: all deliverables from Tasks 1–4.
- Produces: branch verified against type checking, lint, tests and production build.

- [ ] **Step 1: Aplicar la migración en la base local de desarrollo**

  Run: `npm run db:migrate:deploy`

  Expected: migración `tipo_bodega_aseo_clinica` aplicada sin errores.

- [ ] **Step 2: Verificar la clasificación de datos migrados**

  Consultar mediante Prisma las bodegas locales y comprobar que nombres con “aseo” tienen `tipo: "ASEO"` y el resto `tipo: "CLINICA"`. No modificar datos manualmente para hacer pasar la comprobación.

- [ ] **Step 3: Ejecutar la suite completa**

  Run: `npm test`

  Expected: PASS, cero pruebas fallidas.

- [ ] **Step 4: Ejecutar lint y build**

  Run: `npm run lint`

  Expected: PASS, sin errores.

  Run: `npm run build`

  Expected: PASS, compilación de producción exitosa.

- [ ] **Step 5: Revisar el diff contra el spec**

  Comprobar cada criterio de aceptación del spec, confirmar que no se aplicó la regla a salidas/traspasos/préstamos y revisar que no existan cambios ajenos a la funcionalidad.

- [ ] **Step 6: Commit de ajustes de verificación, si existen**

  ```bash
  git add <solo-archivos-corregidos>
  git commit -m "test: verificar actualización de entrada y stock"
  ```
