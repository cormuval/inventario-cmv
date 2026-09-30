# Plan de Implementación: Traspaso de Stock "A Otra Bodega" en el Mismo Centro

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Habilitar el flujo de traspaso interno de productos entre bodegas del mismo centro de salud ("A otra bodega"), descontando atómicamente el stock en la bodega emisora e incrementándolo en la bodega receptora, con selección asistida y validación estricta de seguridad.

**Architecture:** Extender el módulo de salidas (`/orden-salida`) para ofrecer la opción `"A otra bodega"`. En el frontend, reemplazar el campo de destino libre por un selector desplegable filtrado de bodegas hermanas del mismo centro. En el backend (`orden-salida.action.ts`), ejecutar una transacción atómica `prisma.$transaction` que descuente de la bodega origen y aplique `upsert` incrementando el stock del mismo producto/lote/vencimiento en la bodega destino.

**Tech Stack:** Next.js 15, React 19, TypeScript strict, Prisma ORM, MySQL 8.4, Vitest.

**Spec:** [`docs/specs/procedimiento-traspaso-a-otra-bodega.md`](file:///c:/Users/benja/OneDrive/Escritorio/inventario-cmv-main/docs/specs/procedimiento-traspaso-a-otra-bodega.md)

---

## Global Constraints

- TypeScript strict; sin `any`. Tipos explícitos para todas las funciones y componentes.
- Un traspaso solo puede ocurrir entre bodegas del mismo `centroId` y donde `bodegaDestinoId !== bodegaOrigenId`.
- No se permite transferir lotes caducados ni lotes sin stock disponible (`cantidadDisponible > 0`).
- La operación debe ser atómica en `$transaction` y registrada en la tabla `logs` mediante `AuditLogger`.

---

## Tareas de Implementación

### Tarea 1: Interfaz de Usuario y Selector Asistido de Bodega Destino

**Archivos:**
- Modificar: `src/modules/orden-salida/components/orden-salida-form.tsx`

- [ ] **Paso 1: Agregar opción "A otra bodega" en el selector de tipo de salida**
  En `src/modules/orden-salida/components/orden-salida-form.tsx`, agregar:
  ```tsx
  <option value="A otra bodega">A otra bodega</option>
  ```
- [ ] **Paso 2: Calcular bodegas destino disponibles del mismo centro**
  Derivar la lista `bodegasDestinoDisponibles`:
  ```tsx
  const esTraspasoBodega = tipoSalida.trim().toLowerCase() === "a otra bodega";
  const bodegasDestinoDisponibles = bodegasFiltradas.filter((b) => b.id !== bodegaId);
  const [bodegaDestinoId, setBodegaDestinoId] = useState(bodegasDestinoDisponibles[0]?.id ?? "");
  ```
- [ ] **Paso 3: Renderizar selector desplegable asistido cuando sea traspaso**
  Cuando `esTraspasoBodega` sea verdadero:
  - Renderizar un `<Select name="bodegaDestinoId">` con las `bodegasDestinoDisponibles`.
  - Renderizar un input oculto `<input type="hidden" name="destino" value={nombreDeBodegaDestino} />` para mantener la compatibilidad con el esquema y la tabla.
  - Si no existen otras bodegas en el centro (`bodegasDestinoDisponibles.length === 0`), mostrar mensaje informativo deshabilitando el envío.
- [ ] **Paso 4: Probar visualmente y verificar compilación**
  Verificar que `npx tsc --noEmit` pase sin errores.
- [ ] **Paso 5: Commit del cambio**
  `git add src/modules/orden-salida/components/orden-salida-form.tsx; git commit -m "feat(salidas): habilitar opcion y selector asistido para traspaso a otra bodega"`

---

### Tarea 2: Lógica Transaccional en Servidor (`orden-salida.action.ts`)

**Archivos:**
- Modificar: `src/modules/orden-salida/actions/orden-salida.action.ts`

- [ ] **Paso 1: Validar traspaso en `crearOrdenSalida`**
  En `crearOrdenSalida`:
  Obtener `bodegaDestinoId = formData.get("bodegaDestinoId")?.toString()`.
  Si `parsed.tipoSalida.trim().toLowerCase() === "a otra bodega"`:
  - Validar que `bodegaDestinoId` esté definido y sea distinto de `parsed.bodegaId`.
  - Validar que la bodega destino exista en la base de datos, esté activa (`estado === true`) y pertenezca a `parsed.centroId`.
  - Asignar `parsed.destino = bodegaDestino.nombre`.
- [ ] **Paso 2: Implementar incremento en bodega receptora dentro de `$transaction`**
  Crear función interna:
  ```ts
  async function incrementarStock(
      tx: Tx,
      input: { productoId: number; bodegaId: string; cantidad: number; lote: string; fechaCaducidad: Date }
  ): Promise<void>
  ```
  Al iterar los detalles, ejecutar:
  ```ts
  await descontarStock(tx, { ... });
  if (esTraspasoBodega) {
      await incrementarStock(tx, {
          productoId: detalle.productoId,
          bodegaId: bodegaDestinoId,
          cantidad: detalle.cantidad,
          lote: detalle.lote,
          fechaCaducidad: detalle.fechaCaducidad
      });
  }
  ```
- [ ] **Paso 3: Compensar traspaso en `actualizarDetalleSalida` y `eliminarDetalleSalida`**
  Si `ordenSalida.tipoSalida === "A otra bodega"`, resolver la bodega destino (mediante `codigoSalida` o por nombre en el mismo `centroId`) y:
  - Revertir stock en la bodega origen (`devolverStock`).
  - Descontar el stock transferido en la bodega destino (`descontarStock` o decremento) para evitar inconsistencias.
- [ ] **Paso 4: Commit del cambio**
  `git add src/modules/orden-salida/actions/orden-salida.action.ts; git commit -m "feat(salidas): ejecutar traspaso atomico bidireccional entre bodegas en backend"`

---

### Tarea 3: Pruebas Unitarias Automatizadas

**Archivos:**
- Crear: `src/__tests__/traspaso-bodega.test.ts`

- [ ] **Paso 1: Escribir casos de prueba para el traspaso a otra bodega**
  - Traspaso exitoso: descuenta en origen e incrementa en destino dentro de `$transaction`.
  - Rechazo si la bodega destino es igual a la bodega origen.
  - Rechazo si la bodega destino pertenece a otro centro de salud.
  - Rechazo si el lote a transferir está caducado.
  - Rechazo si el lote no tiene saldo disponible.
- [ ] **Paso 2: Ejecutar vitest y verificar aprobación**
  `npx vitest run src/__tests__/traspaso-bodega.test.ts`
- [ ] **Paso 3: Commit del cambio**
  `git add src/__tests__/traspaso-bodega.test.ts; git commit -m "test(salidas): agregar pruebas unitarias para traspaso a otra bodega"`

---

### Tarea 4: Verificación Integral del Sistema

- [ ] **Paso 1: Ejecutar toda la suite de pruebas**
  `npx vitest run`
- [ ] **Paso 2: Validar tipos con TypeScript**
  `npx tsc --noEmit`
- [ ] **Paso 3: Sincronizar y publicar rama en GitHub**
  `git push -u cormuval Traspaso-A-Otra-Bodega`
