# NV-24: Orígenes de órdenes de entrada Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Agregar `Bodega Central` y `Fondo Global Menor` como orígenes válidos de órdenes de entrada, conservando las opciones existentes y comprobando su persistencia y visualización.

**Architecture:** Un catálogo inmutable dentro del módulo será la fuente única para el selector y el esquema Zod. La persistencia continuará usando el campo de texto existente y la vista de registros seguirá proyectando el valor almacenado sin transformación.

**Tech Stack:** Next.js 15, React 19, TypeScript strict, Zod, Prisma y Vitest con Testing Library.

**Spec:** `docs/superpowers/specs/2026-11-20-origenes-orden-entrada-design.md`

## Global Constraints

- Conservar exactamente `Drogueria`, `Desde Otros Centros` y `Otros Servicios`.
- Agregar exactamente `Bodega Central` y `Fondo Global Menor`.
- No crear ni modificar registros físicos de `Bodega` o `Centro`.
- No modificar `prisma/schema.prisma` ni crear una migración.
- Mantener `Drogueria` como origen inicial y como valor tras un registro exitoso.
- Mantener la indentación de cuatro espacios y los imports categorizados del proyecto.

## Review Focus

- Un origen enviado manualmente que no figure en el catálogo debe fallar la validación y no llegar a Prisma; se cubre en la Tarea 1.
- Las tres opciones históricas deben permanecer visibles y válidas; se cubre en las Tareas 1 y 2.
- Ambos valores nuevos deben conservarse literalmente, sin normalización ni cambio de mayúsculas; se cubre en las Tareas 1, 2 y 3.
- El valor inicial y el reinicio del formulario deben seguir siendo `Drogueria`; se cubre en la Tarea 2.
- El origen no debe sustituir ni alterar `bodegaId`, que continúa siendo la bodega receptora; se cubre en la Tarea 3.

---

## Estructura de archivos

- Crear `src/modules/orden-entrada/constants/origenes-orden-entrada.ts`: fuente única del catálogo y del tipo literal de origen.
- Modificar `src/modules/orden-entrada/schemas/orden-entrada.schema.ts`: validar `origen` contra el catálogo.
- Modificar `src/modules/orden-entrada/components/orden-entrada-form.tsx`: renderizar todas las opciones desde el catálogo.
- Crear `src/__tests__/origenes-orden-entrada.test.tsx`: probar catálogo, esquema, selector y reinicio del formulario.
- Crear `src/__tests__/orden-entrada.action.test.ts`: probar que la acción persiste ambos orígenes nuevos y conserva la bodega receptora.
- Modificar `src/__tests__/registros-entrada.action.test.ts`: fijar el recorrido literal del origen almacenado hacia los registros.

### Task 1: Definir y validar el catálogo de orígenes

**Files:**
- Create: `src/modules/orden-entrada/constants/origenes-orden-entrada.ts`
- Modify: `src/modules/orden-entrada/schemas/orden-entrada.schema.ts`
- Create: `src/__tests__/origenes-orden-entrada.test.tsx`

**Interfaces:**
- Consumes: ninguna interfaz nueva.
- Produces: `ORIGENES_ORDEN_ENTRADA` como tupla `readonly` con los cinco literales y `OrigenOrdenEntrada` derivado de esa tupla; `crearOrdenEntradaSchema` acepta solo esos valores.

- [ ] **Step 1: Escribir pruebas fallidas del catálogo y del esquema**

En `src/__tests__/origenes-orden-entrada.test.tsx`, agregar casos que:

- esperen que `ORIGENES_ORDEN_ENTRADA` sea exactamente `['Drogueria', 'Desde Otros Centros', 'Otros Servicios', 'Bodega Central', 'Fondo Global Menor']`;
- construyan un input base válido y comprueben con `safeParse` que cada uno de los cinco valores es aceptado;
- comprueben que `origen: 'Bodega inventada'` es rechazado.

- [ ] **Step 2: Ejecutar la prueba y verificar que falla**

Run: `npm test -- src/__tests__/origenes-orden-entrada.test.tsx`

Expected: FAIL porque el módulo del catálogo aún no existe y el esquema todavía acepta cualquier texto no vacío.

- [ ] **Step 3: Implementar el catálogo compartido**

Crear `ORIGENES_ORDEN_ENTRADA` con `as const` y exportar `type OrigenOrdenEntrada = (typeof ORIGENES_ORDEN_ENTRADA)[number]`.

- [ ] **Step 4: Restringir el esquema al catálogo**

En `crearOrdenEntradaSchema`, reemplazar `z.string().min(...)` por un `z.enum(ORIGENES_ORDEN_ENTRADA, { required_error: 'El origen es requerido.', invalid_type_error: 'El origen no es válido.' })`; conservar el resto del esquema sin cambios.

- [ ] **Step 5: Ejecutar la prueba y verificar que pasa**

Run: `npm test -- src/__tests__/origenes-orden-entrada.test.tsx`

Expected: PASS para catálogo, cinco valores admitidos y valor desconocido rechazado.

- [ ] **Step 6: Commit**

```bash
git add src/modules/orden-entrada/constants/origenes-orden-entrada.ts src/modules/orden-entrada/schemas/orden-entrada.schema.ts src/__tests__/origenes-orden-entrada.test.tsx
git commit -m "feat: definir origenes de ordenes de entrada"
```

### Task 2: Presentar todas las opciones en el formulario

**Files:**
- Modify: `src/modules/orden-entrada/components/orden-entrada-form.tsx`
- Modify: `src/__tests__/origenes-orden-entrada.test.tsx`

**Interfaces:**
- Consumes: `ORIGENES_ORDEN_ENTRADA` y `OrigenOrdenEntrada` de la Tarea 1.
- Produces: selector **Origen** con las cinco opciones, tipado y con `Drogueria` como valor inicial y de reinicio.

- [ ] **Step 1: Agregar una prueba fallida del selector**

Mockear `crearOrdenEntrada` y renderizar `OrdenEntradaForm` con un centro, una bodega y un producto mínimos. Comprobar dentro del selector **Origen** que existen exactamente las cinco opciones, en el orden del catálogo, con `value` igual a su texto, y que el selector tiene el valor `Drogueria`. Agregar un caso que simule un `ActionState` exitoso después de seleccionar `Bodega Central` y compruebe que el efecto restablece el selector a `Drogueria`.

- [ ] **Step 2: Ejecutar la prueba y verificar que falla por las opciones nuevas**

Run: `npm test -- src/__tests__/origenes-orden-entrada.test.tsx`

Expected: FAIL porque `Bodega Central` y `Fondo Global Menor` todavía no aparecen.

- [ ] **Step 3: Renderizar el selector desde la fuente única**

Importar el catálogo y el tipo. Tipar el estado `origen` como `OrigenOrdenEntrada`, recorrer `ORIGENES_ORDEN_ENTRADA` para crear cada `<option>` y mantener `Drogueria` en la inicialización y en el efecto de reinicio.

- [ ] **Step 4: Ejecutar la prueba del formulario**

Run: `npm test -- src/__tests__/origenes-orden-entrada.test.tsx`

Expected: PASS con las cinco opciones exactas y `Drogueria` seleccionada.

- [ ] **Step 5: Commit**

```bash
git add src/modules/orden-entrada/components/orden-entrada-form.tsx src/__tests__/origenes-orden-entrada.test.tsx
git commit -m "feat: mostrar nuevos origenes de entrada"
```

### Task 3: Verificar persistencia y visualización literal

**Files:**
- Create: `src/__tests__/orden-entrada.action.test.ts`
- Modify: `src/__tests__/registros-entrada.action.test.ts`

**Interfaces:**
- Consumes: `crearOrdenEntrada(prevState: ActionState, formData: FormData): Promise<ActionState>` y `listarRegistrosEntrada(filtros: FiltrosRegistros): Promise<ResultadoRegistros<RegistroEntradaFila>>`.
- Produces: cobertura que garantiza que ambos orígenes nuevos llegan literalmente a Prisma y regresan literalmente en los registros.

- [ ] **Step 1: Escribir pruebas de acción para los dos orígenes nuevos**

Mockear sesión autorizada, alcance, productos, transacción, creación de orden/detalle, stock, auditoría y revalidación. Parametrizar `Bodega Central` y `Fondo Global Menor`; para cada valor, enviar un `FormData` válido y verificar que `tx.ordenEntrada.create` recibe `data` con `origen` igual al valor probado y `bodegaId` igual a la bodega receptora enviada (`b1`). Verificar además resultado `{ ok: true, message: 'Orden de entrada registrada.' }`.

- [ ] **Step 2: Ejecutar las pruebas de persistencia**

Run: `npm test -- src/__tests__/orden-entrada.action.test.ts`

Expected: PASS; la acción existente ya persiste `parsed.origen`, y esta prueba fija explícitamente el contrato para ambos valores.

- [ ] **Step 3: Ampliar la prueba de registros**

En `src/__tests__/registros-entrada.action.test.ts`, parametrizar o agregar casos para que `prisma.ordenEntrada.findMany` entregue primero `origen: 'Bodega Central'` y luego `origen: 'Fondo Global Menor'`; verificar que cada `resultado.filas[0].origen` coincide literalmente con el valor almacenado. Renderizar `RegistrosEntradaTabla` con cada fila resultante y comprobar que la celda visible contiene el mismo texto.

- [ ] **Step 4: Ejecutar las pruebas de registros**

Run: `npm test -- src/__tests__/registros-entrada.action.test.ts`

Expected: PASS y ambos orígenes se proyectan y renderizan sin transformación.

- [ ] **Step 5: Ejecutar la verificación completa**

Run: `npm test`

Expected: todas las pruebas PASS.

Run: `npm run build`

Expected: compilación de producción exitosa, sin errores de TypeScript ni de Next.js.

- [ ] **Step 6: Commit**

```bash
git add src/__tests__/orden-entrada.action.test.ts src/__tests__/registros-entrada.action.test.ts
git commit -m "test: verificar origenes de ordenes de entrada"
```
