# Especificación Técnica y de Interfaz: Menú de Selección Estándar con Búsqueda (Combobox) y Erradicación de Caché de Autocompletado

**Proyecto:** Sistema de Inventario APS — Corporación Municipal de Valparaíso (CMV)  
**Documento:** Especificación Funcional y de Usabilidad: Eliminación de Datalist y Estandarización con Combobox Buscable  
**Versión:** 1.1 (Aprobada)  
**Fecha:** 05 de Octubre de 2026  
**Clasificación:** Usabilidad, Integridad de Datos e Interfaz de Usuario (Prioridad Alta)  

---

## 1. Diagnóstico del Problema

### El Reporte y Requerimiento:
> *"9.- Fondo con la caché y Menú Ajustable al texto:  
> La interfaz actual estaba usando un `<input>` de texto con un `<datalist>` nativo del navegador HTML.  
> El gran defecto del `<datalist>`: Los navegadores (Chrome, Edge) guardan un historial de texto / autocompletado en caché local. Aunque React filtre los datos por detrás, el navegador insiste en sugerir lo que escribiste en sesiones anteriores como texto libre, lo que genera confusión e induce a errores.  
> En resumen: los productos y todo lo seleccionable deben salir con un tamaño estándar predefinido para mejor visibilidad."*

### Causa Raíz Detectada en Código:
1. **Uso de `<datalist>` en Salidas y Entradas:**
   - En `src/modules/orden-salida/components/orden-salida-detalles-field.tsx` y `orden-entrada-detalles-field.tsx` se usaban `<datalist>` asociados a `<Input list="...">`.
2. **Conflicto con la Caché del Navegador:**
   - Los navegadores Chromium/Edge asocian historial a los `<input>` nativos de texto libre y superponen sugerencias obsoletas sobre las opciones reales.
3. **Limitación del `<select>` Nativo Cerrado:**
   - Un `<select>` nativo elimina el caché pero impide la búsqueda en catálogos extensos (cientos de fármacos en APS) y corta los nombres farmacéuticos largos sin permitir salto de línea.
4. **Solución Óptima:**
   - Implementar el patrón **Combobox de shadcn/ui** (`Popover` + `Command` / `cmdk`), que ofrece filtrado en tiempo real sin caché de formulario, despliega nombres completos multilínea y restringe la selección únicamente a opciones válidas del sistema.

---

## 2. Reglas de Interfaz y Negocio

```
              [ REGISTRO DE MOVIMIENTO: SALIDA O ENTRADA ]
                                   │
               ¿Cómo se selecciona el producto / stock?
                                   │
         ┌─────────────────────────┴─────────────────────────┐
         ▼                                                   ▼
   [ ⛔ ANTES: <datalist> ]                       [ ✔ AHORA: <Combobox> shadcn/ui ]
   • Input de texto libre                         • Selector controlado con búsqueda cmdk
   • Navegador abre caché histórica local         • Cero interferencia de caché (autoComplete="off")
   • Nombres largos cortados                      • Popover multilínea con lectura íntegra
   • Permite enviar texto inexistente             • Obliga a seleccionar un ítem real del catálogo
   • Sin búsqueda si se usara <select>            • Búsqueda instantánea por nombre, lote o código
```

### Regla R-01: Erradicación Definitiva de `<datalist>` e Ingreso de Texto Libre
- Se eliminan por completo los elementos `<datalist>` y los atributos `list="..."` de los formularios de movimiento:
  - `OrdenSalidaDetallesField` (`src/modules/orden-salida/components/orden-salida-detalles-field.tsx`)
  - `OrdenEntradaDetallesField` (`src/modules/orden-entrada/components/orden-entrada-detalles-field.tsx`)
- Queda estrictamente prohibido el ingreso de texto libre no perteneciente al catálogo.

### Regla R-02: Componente Reutilizable `Combobox` con Búsqueda y Dimensiones Estándar
- Se utiliza el componente `Combobox` en `src/shared/components/ui/combobox.tsx` basado en `Popover` y `Command` (`cmdk`):
  - **Dimensiones del disparador:** `h-10 w-full text-sm` con el mismo borde (`border-input`), fondo y foco de los demás inputs.
  - **Legibilidad completa:** El disparador trunca con elipsis y expone `title={label}` al pasar el cursor; el `PopoverContent` (`w-[--radix-popover-trigger-width] min-w-[300px]`) permite que los nombres farmacéuticos largos se lean en múltiples líneas sin cortes abruptos.
  - **Sin caché:** El campo de búsqueda de `CommandInput` no tiene atributo `name` de formulario y lleva `autoComplete="off"`.
  - **Accesibilidad:** `role="combobox"`, `aria-expanded`, y soporte completo para navegación por teclado (flechas, Enter, Escape).

### Regla R-03: Criterios de Búsqueda y Formato Estructurado de Opciones

#### A. En Orden de Salida (`OrdenSalidaDetallesField`):
- **Identificador de opción:** `String(stock.id)` como valor unívoco.
- **Formato visual:**
  ```text
  [Disp: {cantidadDisponible} un.] {descripcion} | Lote: {lote} | Vence: {fechaCaducidad}
  ```
  *(Con prefijo `[CADUCADO]` en caso de salidas por Merma).*
- **Criterio de búsqueda:** Permite buscar tanto por descripción del producto como por número de lote o código de producto (vía `keywords`).
- **Comportamiento reactivo:** Al seleccionar, se actualizan de inmediato los campos ocultos (`productoId`, `lote`, `fechaCaducidad`), el indicador de `Caducidad`, el stock visible y el límite `max` de cantidad.

#### B. En Orden de Entrada (`OrdenEntradaDetallesField`):
- **Identificador de opción:** `String(producto.id)`.
- **Formato visual:**
  ```text
  {descripcion} — {linea} (#{id})
  ```
- **Criterio de búsqueda:** Permite buscar por nombre/descripción del producto, por línea/categoría y por código ID.
- **Comportamiento reactivo:** Al seleccionar, se actualiza el campo oculto `productoId` y el contenedor de lectura de `Categoría`.

### Regla R-04: Sincronización y Limpieza de Estado al Cambiar de Bodega o Modo
- Al cambiar de bodega seleccionada o al alternar entre modos (`Consumo Interno` vs `Merma`):
  - La lista de stocks disponibles se recalcula de inmediato.
  - Los detalles de salida resetean sus combobox a la selección vacía inicial para evitar retener stocks pertenecientes a la bodega o estado previo.

---

## 3. Impacto en Componentes y Archivos

| Archivo | Tipo de Cambio | Descripción |
|---|---|---|
| `src/shared/components/ui/popover.tsx` | Componente UI | Componente Popover de shadcn/ui con `@radix-ui/react-popover`. |
| `src/shared/components/ui/command.tsx` | Componente UI | Componente Command de shadcn/ui con `cmdk`. |
| `src/shared/components/ui/combobox.tsx` | Componente UI | Componente Combobox reutilizable con búsqueda rápida, soporte multilínea y cero caché. |
| `src/modules/orden-salida/components/orden-salida-detalles-field.tsx` | Refactorización de UI | Reemplazo de `<datalist>` por `Combobox` con búsqueda por nombre y lote, usando `stock.id` como clave. |
| `src/modules/orden-entrada/components/orden-entrada-detalles-field.tsx` | Refactorización de UI | Reemplazo de `<datalist>` por `Combobox` con búsqueda por catálogo, línea e ID. |
| `vitest.setup.ts` | Configuración de Pruebas | Mock de `ResizeObserver`, `scrollIntoView` y `PointerEvent` para Radix UI y cmdk en jsdom. |
| `src/__tests__/detalles-fields-sin-cache.test.tsx` | Pruebas Unitarias | 8 pruebas completas que verifican ausencia de datalist, filtrado de búsqueda, actualización de campos ocultos y límites. |

---

## 4. Criterios de Aceptación (Verificados)

- [x] **CA-1: Cero caché del navegador:** Al interactuar con el selector de productos en Salidas o Entradas, ningún navegador muestra sugerencias históricas de texto libre o autocompletado local.
- [x] **CA-2: Dimensiones uniformes:** Todos los disparadores de productos y lotes tienen una altura estandarizada de 40px (`h-10`) y ocupan el ancho asignado sin desbordar el diseño.
- [x] **CA-3: Selección obligatoria de catálogo:** No es posible ingresar o enviar texto arbitrario que no pertenezca al catálogo activo o al stock de la bodega.
- [x] **CA-4: Búsqueda ágil y visualización completa:** En Entradas se busca por nombre/línea/ID; en Salidas se busca por fármaco y lote. Los nombres farmacéuticos extensos se leen íntegros en el panel desplegable.
- [x] **CA-5: Calidad de software:** Compilación sin errores (`npx tsc --noEmit`) y 100% de la suite de pruebas pasando (70/70 pruebas aprobadas en Vitest).
