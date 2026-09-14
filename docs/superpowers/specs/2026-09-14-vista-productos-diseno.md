# Especificación de Diseño: Vista de Productos y Creación en Modal

| Campo | Valor |
| --- | --- |
| Fecha | 2026-09-14 |
| Estado | Aprobado por el usuario — Listo para plan de implementación |
| Módulo | `src/modules/productos` y `src/app/productos` |
| Autores | Asistente de IA & Renzo Vergara |

---

## 1. Contexto y Objetivo

Actualmente, la vista `/productos` renderiza en una sola columna un formulario fijo embebido y una tabla simple debajo. Se requiere rediseñar la vista de productos inspirándose en la interfaz de gestión institucional solicitada (con navegación por líneas y contadores), extrayendo el formulario hacia un modal de creación accesible activado por un botón `+` en la cabecera superior.

---

## 2. Alcance y Requerimientos

### 2.1 Incluido
1. **Cabecera superior**:
   - Breadcrumb visual: `Menú Principal > Productos`.
   - Botón de acción principal con ícono `+` (`Plus` de `lucide-react`) en el extremo derecho superior.
2. **Modal de creación de producto**:
   - Se abre al hacer clic en el botón `+`.
   - Título: "Nuevo Producto".
   - Formulario de 2 campos:
     - **Línea**: Selector (`<Select>`) con opciones `CLINICO` ("Clínico") y `ASEO` ("Aseo").
     - **Descripción**: Campo de texto (`<Input>`) con validación mínima de 3 caracteres.
   - Estado activo por defecto (`true`).
   - Botones de acción: "Crear producto" (con estado de carga) y "Cancelar" (cierra el modal).
   - Integración con Server Action `crearProducto`. Al completarse: cierra el modal, notifica vía toast y actualiza la lista.
3. **Panel lateral izquierdo de navegación y filtros**:
   - Opción "Todo" con contador de productos totales.
   - Opciones individuales para cada línea (`CLINICO`, `ASEO`) con badges contadores de existencias en tiempo real.
   - Selección activa destacada visualmente.
4. **Tabla de productos**:
   - Columnas: `ID`, `Línea`, `Descripción`.
   - Filtrado reactivo en cliente según la categoría seleccionada en el panel lateral.
   - Estado vacío cuando una línea no contenga registros.

### 2.2 No incluido (Fases futuras)
- Botones de "Importar", "Filtros avanzados" o "Selección masiva".
- Interacción o navegación en las filas de la tabla (`>`).
- Líneas adicionales más allá de `CLINICO` y `ASEO`.

---

## 3. Arquitectura y Componentes

```
src/
  app/productos/
    page.tsx                                  # Server Component: carga datos con listarProductos()
  modules/productos/
    components/
      vista-productos.tsx                     # Client Component principal (layout 2 columnas, estado de filtro)
      barra-lateral-lineas.tsx                # Panel lateral de categorías con badges contadores
      tabla-productos.tsx                     # Tabla de productos (ID, Linea, Descripcion)
      modal-crear-producto.tsx                # Modal que contiene el formulario de creación
      producto-form-modal.tsx                 # Formulario adaptado al modal con manejo de cierre y toasts
    actions/
      productos.action.ts                     # Server Actions existentes (listarProductos, crearProducto)
```

---

## 4. Flujo de Datos e Interacción

1. **Carga inicial**: `ProductosPage` (RSC) consulta `listarProductos()` mediante Prisma y pasa los datos serializados a `VistaProductos`.
2. **Filtrado por categoría**:
   - `VistaProductos` almacena `lineaSeleccionada` (`null` = Todo, `"CLINICO"`, `"ASEO"`).
   - Calcula contadores por línea mediante `useMemo`.
   - Pasa la lista filtrada a `TablaProductos`.
3. **Creación de producto**:
   - El usuario pulsa el botón `+` en la cabecera.
   - Se abre `ModalCrearProducto`.
   - El usuario completa `Línea` y `Descripción` y pulsa "Crear producto".
   - Se ejecuta `crearProducto` (Server Action).
   - Si es exitoso: se muestra `toast.success("Producto creado.")`, se cierra el modal y se ejecuta `router.refresh()` para obtener los nuevos datos.
   - Si falla: se muestra mensaje de error.

---

## 5. Pruebas y Criterios de Aceptación

- **Unit tests**:
  - Pruebas del formulario de creación y sus validaciones (Zod schema).
  - Pruebas de filtrado reactivo de productos por categoría y cálculo de contadores.
- **Criterios de Aceptación**:
  - `npm test` pasa sin errores.
  - La tabla muestra correctamente los productos divididos por línea con sus contadores.
  - Al hacer clic en `+` se despliega el modal y permite registrar un producto nuevo correctamente.
