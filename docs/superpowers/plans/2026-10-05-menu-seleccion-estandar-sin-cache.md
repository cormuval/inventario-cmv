# Plan de Implementación: Menú de Selección Estándar y Erradicación de Caché de Autocompletado

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Erradicar definitivamente los elementos `<datalist>` e `<input list="...">` en los formularios de Orden de Salida y Orden de Entrada, reemplazándolos por selectores `<Select>` con tamaño estándar uniforme (`h-10`, `w-full`), eliminando la caché de texto libre del navegador y formateando las opciones con datos claros de stock, lote y vencimiento.

**Architecture:** Modificar `OrdenSalidaDetallesField` y `OrdenEntradaDetallesField` para sustituir el campo de texto y datalist por componentes `<Select>` estilizados. En Salida, cada opción expone `[Disp: X un.] Producto | Lote: L | Vence: F`, actualizando reactivamente los campos ocultos (`productoId`, `lote`, `fechaCaducidad`), el límite de cantidad (`max`) y la caja de vencimiento. En Entrada, cada opción expone `Producto — Categoría (#ID)`, vinculando el `productoId` y actualizando la caja de categoría. Se complementa con pruebas unitarias que garanticen la ausencia de etiquetas `<datalist>`.

**Tech Stack:** Next.js 15, React 19, TypeScript strict, Tailwind v3 / shadcn, Vitest, React Testing Library.

**Spec:** [`../specs/procedimiento-menu-seleccion-estandar-sin-cache.md`](../specs/procedimiento-menu-seleccion-estandar-sin-cache.md)

---

## Global Constraints

- TypeScript strict; sin `any`. Tipos explícitos para todas las funciones y componentes.
- Cero elementos `<datalist>` ni atributos `list="..."` en los formularios.
- Todos los selectores de productos y lotes deben tener altura estándar `h-10` y ancho completo `w-full`.
- Las opciones deben incluir una opción inicial vacía obligatoria (`"Seleccione stock disponible..."` / `"Seleccione producto del catálogo..."`).
- No alterar las firmas ni nombres de campos que consumen los Server Actions (`productoId`, `lote`, `fechaCaducidad`, `cantidad`).

---

## Tareas de Implementación

### Tarea 1: Estandarización de `OrdenSalidaDetallesField` sin Datalist

**Archivos:**
- Modificar: `../../src/modules/orden-salida/components/orden-salida-detalles-field.tsx`

**Interfaces:**
- Consumes: `stocks: StockDisponible[]`, `bodegaId: string`, `tipoSalida?: string`
- Produces: Formulario con campos `productoId`, `lote`, `fechaCaducidad`, `cantidad` validados sin texto libre

- [ ] **Paso 1: Modificar `opciones` con identificador único y formato de etiqueta enriquecido**
  Cada opción debe identificar unívocamente la tupla de stock (`${stock.productoId}-${stock.lote}-${stock.fechaCaducidad}`):
  ```ts
  const opciones = useMemo(() => stocksFiltrados.map((stock) => ({
      key: `${stock.productoId}-${stock.lote}-${toDateInputValue(stock.fechaCaducidad)}`,
      label: `[Disp: ${stock.cantidadDisponible} un.] ${stock.producto.descripcion} | Lote: ${stock.lote} | Vence: ${formatDate(stock.fechaCaducidad)}`,
      productoId: String(stock.productoId),
      lote: stock.lote,
      fechaCaducidad: toDateInputValue(stock.fechaCaducidad),
      disponible: stock.cantidadDisponible
  })), [stocksFiltrados]);
  ```

- [ ] **Paso 2: Reemplazar `<datalist>` y `<Input list="...">` por `<Select>`**
  En el JSX de `OrdenSalidaDetallesField`:
  - Remover `<datalist id={datalistId}>...</datalist>`.
  - Sustituir el `<Input>` por:
    ```tsx
    <Select
        value={detalle.stockKey || ""}
        onChange={(event) => seleccionarStock(detalle.id, event.currentTarget.value)}
        required
    >
        <option value="">Seleccione stock disponible...</option>
        {opciones.map((opcion) => (
            <option key={opcion.key} value={opcion.key}>
                {opcion.label}
            </option>
        ))}
    </Select>
    ```

- [ ] **Paso 3: Actualizar la función `seleccionarStock`**
  Al seleccionar por `key`:
  - Si es cadena vacía, limpiar campos dependientes (`productoId: ""`, `lote: ""`, `fechaCaducidad: ""`, `disponible: null`).
  - Si coincide con una opción, poblar `productoId`, `lote`, `fechaCaducidad` y `disponible`.

- [ ] **Paso 4: Ejecutar verificación de tipos**
  `npx tsc --noEmit`

- [ ] **Paso 5: Commit del cambio**
  `git add src/modules/orden-salida/components/orden-salida-detalles-field.tsx`
  `git commit -m "feat(salidas): reemplazar datalist por selector estandar en detalles de salida"`

---

### Tarea 2: Estandarización de `OrdenEntradaDetallesField` sin Datalist

**Archivos:**
- Modificar: `../../src/modules/orden-entrada/components/orden-entrada-detalles-field.tsx`

**Interfaces:**
- Consumes: `productos: Producto[]`
- Produces: Formulario con campos `productoId`, `cantidad`, `lote`, `fechaCaducidad`

- [ ] **Paso 1: Modificar `opciones` con formato estándar de producto**
  ```ts
  const opciones = useMemo(() => productos.map((producto) => ({
      id: String(producto.id),
      label: `${producto.descripcion} — ${producto.linea} (#${producto.id})`,
      linea: producto.linea
  })), [productos]);
  ```

- [ ] **Paso 2: Reemplazar `<datalist>` y `<Input list="...">` por `<Select>`**
  En el JSX de `OrdenEntradaDetallesField`:
  - Remover `<datalist id={datalistId}>...</datalist>`.
  - Sustituir el `<Input>` por:
    ```tsx
    <Select
        value={detalle.productoId || ""}
        onChange={(event) => seleccionarProducto(detalle.id, event.currentTarget.value)}
        required
    >
        <option value="">Seleccione producto del catálogo...</option>
        {opciones.map((opcion) => (
            <option key={opcion.id} value={opcion.id}>
                {opcion.label}
            </option>
        ))}
    </Select>
    ```

- [ ] **Paso 3: Actualizar la función `seleccionarProducto`**
  Al seleccionar por `id`:
  - Si es cadena vacía, limpiar `productoId: ""` y `linea: ""`.
  - Si coincide con un producto, asignar su `id` y su `linea`.

- [ ] **Paso 4: Ejecutar verificación de tipos**
  `npx tsc --noEmit`

- [ ] **Paso 5: Commit del cambio**
  `git add src/modules/orden-entrada/components/orden-entrada-detalles-field.tsx`
  `git commit -m "feat(entradas): reemplazar datalist por selector estandar en detalles de entrada"`

---

### Tarea 3: Pruebas Unitarias Automatizadas para Erradicación de Datalist

**Archivos:**
- Crear: `../../src/__tests__/detalles-fields-sin-cache.test.tsx`

- [ ] **Paso 1: Escribir tests de integración de interfaz**
  - Verificar que `OrdenSalidaDetallesField` renderiza `<select>` y no renderiza ningún elemento `<datalist>`.
  - Verificar que al seleccionar un stock en Salida se actualiza la fecha de vencimiento y el saldo disponible.
  - Verificar que `OrdenEntradaDetallesField` renderiza `<select>` y no renderiza ningún elemento `<datalist>`.
  - Verificar que al seleccionar un producto en Entrada se actualiza la categoría visual.

- [ ] **Paso 2: Ejecutar los tests con vitest**
  `npx vitest run src/__tests__/detalles-fields-sin-cache.test.tsx`

- [ ] **Paso 3: Commit del cambio**
  `git add src/__tests__/detalles-fields-sin-cache.test.tsx`
  `git commit -m "test: agregar pruebas unitarias para selectores estandar sin datalist"`

---

### Tarea 4: Verificación Integral del Sistema

- [ ] **Paso 1: Ejecutar toda la suite de pruebas**
  `npx vitest run` (deben pasar todas las pruebas).
- [ ] **Paso 2: Validar tipos con TypeScript**
  `npx tsc --noEmit` (0 errores).
- [ ] **Paso 3: Publicar rama en GitHub**
  `git push -u cormuval Estandarizacion-Menu-Sin-Cache`
