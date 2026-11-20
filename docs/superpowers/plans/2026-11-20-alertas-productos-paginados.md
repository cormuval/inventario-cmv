# Alertas globales y productos paginados Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Mostrar al Administrador alertas de caducidad y stock mínimo de todas las bodegas, y ofrecer un catálogo de productos con creación restringida, filtros globales y páginas de 100 filas.

**Architecture:** El Resumen seguirá obteniendo el alcance mediante `obtenerAlcanceInventario`, pero la selección de alertas se aislará en una función pura para probar tipos y exclusiones. Productos incorporará un lector puro de parámetros URL y una consulta Prisma paginada que reutiliza el mismo `where` para `count` y `findMany`; la página renderizará un formulario GET y reutilizará `Paginacion` con tamaño 100.

**Tech Stack:** Next.js 15 App Router, React 19, TypeScript strict, Prisma/MySQL, Vitest y Testing Library.

**Spec:** `docs/superpowers/specs/2026-11-20-alertas-productos-paginados-design.md`

## Global Constraints

- UI, mensajes, comentarios y commits en español; indentación de 4 espacios.
- La búsqueda por descripción se aplica al catálogo completo antes de paginar.
- La página de Productos contiene como máximo 100 filas; el tamaño no es configurable.
- Las reglas existentes de caducidad y stock mínimo no se modifican.
- No se agregan alertas exclusivamente por stock en cero.
- Crear productos requiere perfil Administrador en interfaz y servidor.
- No se requieren cambios en `prisma/schema.prisma` ni migraciones.

## Review Focus

- Una descripción con espacios o distinta capitalización debe encontrar coincidencias globales: prueba en Task 2.
- Parámetros URL repetidos o inválidos no deben derribar Productos: prueba en Task 1.
- Una página mayor al total debe consultar la última página válida, no devolver una grilla falsa vacía: prueba en Task 2.
- Un stock en cero sin condición de caducidad no debe convertirse en alerta por este alcance: prueba en Task 3.
- La paginación debe conservar simultáneamente ID, línea, estado y descripción: prueba de página en Task 4.

---

### Task 1: Normalizar filtros de Productos

**Files:**
- Create: `src/modules/productos/utils/productos-filtros.ts`
- Test: `src/__tests__/productos-filtros.test.ts`

**Interfaces:**
- Consumes: `ParametrosUrl`, `obtenerParametro` y `leerPagina` de `src/shared/utils/filtros-registros.ts`.
- Produces: `EstadoProductoFiltro = "todos" | "activo" | "inactivo"`, `ProductosFiltros`, `leerFiltrosProductos(params?: ParametrosUrl): ProductosFiltros` y `parametrosProductos(filtros: ProductosFiltros): Record<string, string | number | undefined>`.

- [ ] **Step 1: Escribir pruebas fallidas para filtros válidos e inválidos**

  Probar que `leerFiltrosProductos` normaliza `id`, `linea`, `estado`, `descripcion` y `pagina`; recorta espacios; toma un solo valor de parámetros repetidos; usa página 1 para valores no enteros; y registra `advertencias` para ID menor que 1, estado desconocido o línea desconocida cuando se le entregan las líneas permitidas.

- [ ] **Step 2: Ejecutar la prueba y verificar que falla**

  Run: `npm test -- src/__tests__/productos-filtros.test.ts`
  Expected: FAIL porque el módulo aún no existe.

- [ ] **Step 3: Implementar el lector puro**

  Crear `leerFiltrosProductos(params, lineasPermitidas?)` con retorno explícito que incluya `id: number | null`, `linea: string`, `estado`, `descripcion`, `pagina` y `advertencias: string[]`; `parametrosProductos` omitirá valores neutros y nunca incluirá `pagina` para que un envío de filtros vuelva a 1.

- [ ] **Step 4: Ejecutar la prueba y verificar que pasa**

  Run: `npm test -- src/__tests__/productos-filtros.test.ts`
  Expected: PASS.

- [ ] **Step 5: Commit**

  `git add src/modules/productos/utils/productos-filtros.ts src/__tests__/productos-filtros.test.ts && git commit -m "feat: normalizar filtros de productos"`

### Task 2: Consulta global y paginada de Productos

**Files:**
- Modify: `src/modules/productos/actions/productos.action.ts`
- Test: `src/__tests__/productos-action.test.ts`

**Interfaces:**
- Consumes: `ProductosFiltros` de Task 1 y `calcularPaginacion(pagina, total, 100)`.
- Produces: `ListarProductosResult`, `listarLineasProductos(): Promise<string[]>` y `listarProductosPaginados(filtros: ProductosFiltros): Promise<ListarProductosResult>`; conserva `listarProductosActivos()` para formularios de movimientos.

- [ ] **Step 1: Escribir pruebas fallidas de la consulta**

  Mockear Prisma y comprobar: `where` combina ID exacto, línea, estado booleano y descripción `contains`; `count` y `findMany` reciben el mismo `where`; descripción se recorta; `findMany` usa `skip`, `take: 100` y `orderBy: [{ linea: "asc" }, { descripcion: "asc" }, { id: "asc" }]`; 101 coincidencias generan dos páginas; página 99 se normaliza a la última antes de consultar; y filtros vacíos consultan todo el catálogo.

- [ ] **Step 2: Ejecutar la prueba y verificar que falla**

  Run: `npm test -- src/__tests__/productos-action.test.ts`
  Expected: FAIL porque `listarProductosPaginados` no existe.

- [ ] **Step 3: Implementar tipos y consulta paginada**

  Añadir `TAMANO_PAGINA_PRODUCTOS = 100`, `ListarProductosResult { productos, paginacion }`, `listarLineasProductos` y `listarProductosPaginados`. La primera función obtiene líneas distintas para el selector; la segunda construye una sola variable `where`, ejecuta `count`, calcula la página normalizada y luego `findMany` con ese `where` y la paginación resultante.

- [ ] **Step 4: Ejecutar pruebas de Productos**

  Run: `npm test -- src/__tests__/productos-action.test.ts src/__tests__/productos-filtros.test.ts`
  Expected: PASS.

- [ ] **Step 5: Commit**

  `git add src/modules/productos/actions/productos.action.ts src/__tests__/productos-action.test.ts && git commit -m "feat: paginar consulta de productos"`

### Task 3: Delimitar alertas operativas del Resumen

**Files:**
- Create: `src/modules/stock/utils/resumen-alertas.ts`
- Modify: `src/app/page.tsx`
- Test: `src/__tests__/resumen-alertas.test.ts`

**Interfaces:**
- Consumes: elementos consolidados que exponen `alerta: StockAlerta`, `tramoCaducidad: number | null` y `diasCaducidad: number`.
- Produces: `seleccionarAlertasResumen<T extends AlertaResumenFiltrable>(items: T[], limite?: number): T[]`.

- [ ] **Step 1: Escribir pruebas fallidas para inclusión, exclusión y prioridad**

  Probar que se incluyen `stock_minimo`, `caducidad_proxima`, `caducado` y tramos de caducidad vigentes; se excluyen `ok` sin tramo y `sin_stock` sin alerta de caducidad; se ordenan primero las alertas de caducidad y luego stock mínimo; y se limita a 12 registros.

- [ ] **Step 2: Ejecutar la prueba y verificar que falla**

  Run: `npm test -- src/__tests__/resumen-alertas.test.ts`
  Expected: FAIL porque el selector no existe.

- [ ] **Step 3: Implementar el selector puro sin cambiar cálculos existentes**

  Implementar `seleccionarAlertasResumen` reutilizando los valores ya calculados. No cambiar `evaluarAlertaStock`, `calcularStockMinimo`, `obtenerTramoCaducidad` ni el alcance de `obtenerAlcanceInventario`.

- [ ] **Step 4: Integrar el selector en el Resumen**

  Reemplazar el filtro/orden/límite inline de `src/app/page.tsx`; mantener las columnas y etiquetas de caducidad/stock mínimo, y asegurar que `sin_stock` por sí solo no se muestre como alerta operativa.

- [ ] **Step 5: Ejecutar pruebas del Resumen y movimientos**

  Run: `npm test -- src/__tests__/resumen-alertas.test.ts src/__tests__/movimientos.test.ts src/__tests__/inventario-alcance.test.ts`
  Expected: PASS.

- [ ] **Step 6: Commit**

  `git add src/modules/stock/utils/resumen-alertas.ts src/app/page.tsx src/__tests__/resumen-alertas.test.ts && git commit -m "feat: delimitar alertas globales del resumen"`

### Task 4: Interfaz filtrable y paginada de Productos

**Files:**
- Create: `src/modules/productos/components/productos-filtros.tsx`
- Modify: `src/app/productos/page.tsx`
- Test: `src/__tests__/productos-page.test.tsx`

**Interfaces:**
- Consumes: `leerFiltrosProductos`, `parametrosProductos`, `listarLineasProductos`, `listarProductosPaginados`, `Paginacion`, `puedeAdministrar` y `ProductoForm`.
- Produces: página `/productos` con formulario GET, grilla paginada y formulario de creación solo para Administrador.

- [ ] **Step 1: Escribir pruebas fallidas de la página**

  Mockear sesión y consulta para comprobar: el Administrador ve “Nuevo producto”; un perfil no Administrador no lo ve; el formulario GET contiene ID, línea, estado y descripción con valores actuales; la tabla usa los resultados paginados; el estado vacío aparece sin coincidencias; las advertencias se muestran; y los enlaces de paginación conservan simultáneamente los cuatro filtros.

- [ ] **Step 2: Ejecutar la prueba y verificar que falla**

  Run: `npm test -- src/__tests__/productos-page.test.tsx`
  Expected: FAIL porque la página aún no consume la consulta paginada ni representa filtros.

- [ ] **Step 3: Implementar `ProductosFiltros`**

  Crear un formulario `method="get"` y `action="/productos"` con `Input` para `id` y `descripcion`, `Select` para `linea` y `estado`, botón “Buscar” y enlace “Limpiar”. No incluir un campo `pagina`, de modo que aplicar filtros vuelva a 1.

- [ ] **Step 4: Integrar filtros, resultados y paginación en la página**

  Leer `searchParams`, obtener líneas válidas, normalizar filtros, llamar `listarProductosPaginados`, renderizar advertencias y estado vacío, y usar `<Paginacion ruta="/productos" parametros={...} paginacion={resultado.paginacion} />`. Mantener el doble control de creación: visibilidad con `puedeAdministrar` y validación existente en `crearProducto`.

- [ ] **Step 5: Ejecutar pruebas de Productos**

  Run: `npm test -- src/__tests__/productos-page.test.tsx src/__tests__/productos-action.test.ts src/__tests__/productos-filtros.test.ts src/__tests__/paginacion-ui.test.tsx`
  Expected: PASS.

- [ ] **Step 6: Commit**

  `git add src/app/productos/page.tsx src/modules/productos/components/productos-filtros.tsx src/__tests__/productos-page.test.tsx && git commit -m "feat: agregar filtros y paginación de productos"`

### Task 5: Verificación integral

**Files:**
- Modify only if verification reveals an in-scope defect.

**Interfaces:**
- Consumes: entregables de Tasks 1–4.
- Produces: evidencia de pruebas, tipos y compilación correctos.

- [ ] **Step 1: Ejecutar toda la suite**

  Run: `npm test`
  Expected: todas las pruebas pasan.

- [ ] **Step 2: Ejecutar compilación de producción**

  Run: `npm run build`
  Expected: compilación exitosa, sin errores de TypeScript ni de Next.js.

- [ ] **Step 3: Revisar el diff y el estado del repositorio**

  Run: `git diff --check && git status --short`
  Expected: sin errores de espacios; solo archivos previstos o cambios preexistentes identificados.

- [ ] **Step 4: Commit final si la verificación requirió ajustes**

  `git add <archivos-ajustados> && git commit -m "fix: ajustar verificación de productos y alertas"`
