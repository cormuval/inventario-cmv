# Especificación Técnica y de Interfaz: Menú de Selección Estándar y Erradicación de Caché de Autocompletado

**Proyecto:** Sistema de Inventario APS — Corporación Municipal de Valparaíso (CMV)  
**Documento:** Especificación Funcional y de Usabilidad: Eliminación de Datalist y Estandarización de Selectores  
**Versión:** 1.0 (Borrador para Aprobación)  
**Fecha:** 30 de Septiembre de 2026  
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
   - En `src/modules/orden-salida/components/orden-salida-detalles-field.tsx`:
     ```tsx
     <datalist id={datalistId}>...</datalist>
     <Input list={datalistId} ... placeholder="Escribe producto o lote" />
     ```
   - En `src/modules/orden-entrada/components/orden-entrada-detalles-field.tsx`:
     ```tsx
     <datalist id={datalistId}>...</datalist>
     <Input list={datalistId} ... placeholder="Escribe para buscar" />
     ```
2. **Conflicto con la Caché del Navegador:**
   - Los motores Blink/Chromium de navegadores modernos (Google Chrome, Microsoft Edge) asocian el historial de texto introducido en campos `<input>` y lo superponen de forma nativa e incontrolable sobre las opciones reales de React.
   - Aunque el usuario cambie de bodega o centro, el navegador sugiere términos obsoletos, nombres escritos con errores en sesiones pasadas o textos arbitrarios.
3. **Falta de Tamaño Estándar y Problemas de Visibilidad:**
   - El desplegable nativo de un `<datalist>` es renderizado por el sistema operativo, impidiendo controlar su ancho mínimo, altura máxima, tamaño de fuente o márgenes.
   - En medicamentos con nombres farmacéuticos extensos (ej. *"Amoxicilina + Ácido Clavulánico 500/125 mg Comprimidos Recubiertos"*), el texto se trunca abruptamente o genera desbordes visuales en pantallas de consultorio o farmacia.
4. **Riesgo de Datos Incompletos:**
   - Al tratarse de un `<input>` de texto libre, el usuario puede teclear letras sueltas y enviar el formulario sin haber vinculado realmente un lote o producto válido de la base de datos.

---

## 2. Reglas de Interfaz y Negocio

```
              [ REGISTRO DE MOVIMIENTO: SALIDA O ENTRADA ]
                                   │
               ¿Cómo se selecciona el producto / stock?
                                   │
         ┌─────────────────────────┴─────────────────────────┐
         ▼                                                   ▼
   [ ⛔ ANTES: <datalist> ]                       [ ✔ AHORA: <Select> Estándar ]
   • Input de texto libre                         • Selector cerrado controlado
   • Navegador abre caché histórica local         • Cero interferencia de caché del navegador
   • Tamaño variable / texto cortado              • Dimensiones estándar (h-10, w-full, text-sm)
   • Posibilidad de enviar texto inexistente      • Obliga a seleccionar un ítem real del catálogo
```

### Regla R-01: Erradicación Definitiva de `<datalist>` y de Inputs de Búsqueda Libre
- Se eliminan por completo los elementos `<datalist>` y los atributos `list="..."` de los formularios de movimiento:
  - `OrdenSalidaDetallesField` (`src/modules/orden-salida/components/orden-salida-detalles-field.tsx`)
  - `OrdenEntradaDetallesField` (`src/modules/orden-entrada/components/orden-entrada-detalles-field.tsx`)
- Queda prohibido el ingreso de texto libre en la selección de productos y lotes.

### Regla R-02: Selector Estructurado con Dimensiones Estándar
- La selección de productos se implementa mediante el componente `<Select>` estilizado del sistema de diseño (Tailwind/shadcn):
  - **Altura estándar:** `h-10` (40px), idéntica a todos los demás inputs del formulario.
  - **Ancho estándar:** `w-full`, ocupando el espacio asignado en la grilla (`md:col-span-2` o `md:col-span-3`).
  - **Tipografía legible:** `text-sm`, alineada con los estándares de accesibilidad visual del sistema.
  - **Contraste y foco:** Borde sutil `border-input` con anillo de foco `focus-visible:ring-2`.

### Regla R-03: Formato Estandarizado de las Opciones (`<option>`)

#### A. En Orden de Salida (`OrdenSalidaDetallesField`):
- **Opción inicial vacía obligatoria:**
  ```html
  <option value="">Seleccione stock disponible...</option>
  ```
- **Formato estructurado por ítem:**
  ```text
  [Disp: {cantidadDisponible}] {descripcion} | Lote: {lote} | Vence: {fechaCaducidad}
  ```
- **Comportamiento reactivo al seleccionar:**
  - Si el usuario selecciona la opción vacía: limpia los datos de `productoId`, `lote`, `fechaCaducidad` y `disponible`.
  - Si el usuario selecciona un stock:
    - Asigna automáticamente en campos ocultos: `productoId`, `lote` y `fechaCaducidad`.
    - Actualiza el contenedor informativo visual de `Caducidad` con la fecha legible.
    - Configura el atributo `max={stock.cantidadDisponible}` en el input de `cantidad` para impedir egresos superiores al saldo físico.

#### B. En Orden de Entrada (`OrdenEntradaDetallesField`):
- **Opción inicial vacía obligatoria:**
  ```html
  <option value="">Seleccione producto del catálogo...</option>
  ```
- **Formato estructurado por ítem:**
  ```text
  {descripcion} — {linea} (#{id})
  ```
- **Comportamiento reactivo al seleccionar:**
  - Si el usuario selecciona un producto:
    - Asigna automáticamente el `productoId` en el campo oculto correspondiente.
    - Actualiza el contenedor informativo visual de `Categoría` (`linea`).

### Regla R-04: Sincronización y Limpieza de Estado al Cambiar de Bodega o Modo
- Al cambiar de bodega seleccionada o al alternar entre modos (por ejemplo, de `Consumo Interno` a `Merma`):
  - La lista de stocks disponibles se recalcula de inmediato.
  - Los detalles de salida resetean sus selectores a la opción vacía inicial para evitar retener stocks pertenecientes a la bodega o estado previo.

---

## 3. Impacto en Componentes y Archivos

| Archivo | Tipo de Cambio | Descripción |
|---|---|---|
| `src/modules/orden-salida/components/orden-salida-detalles-field.tsx` | Refactorización de UI | Reemplazo de `<datalist>` por `<Select>` con tamaño estándar y opciones estructuradas `[Disp: X] Producto \| Lote \| Vence`. |
| `src/modules/orden-entrada/components/orden-entrada-detalles-field.tsx` | Refactorización de UI | Reemplazo de `<datalist>` por `<Select>` con tamaño estándar y opciones estructuradas `Producto — Categoría (#ID)`. |
| `src/__tests__/detalles-fields-select.test.tsx` (o análogo) | Pruebas Unitarias | Verificación de que no existen etiquetas `<datalist>`, que se renderizan los selectores estándar y que la selección puebla los campos dependientes. |

---

## 4. Criterios de Aceptación

1. **Cero caché del navegador:** Al interactuar con el selector de productos en Salidas o Entradas, ningún navegador (Chrome, Edge, Firefox) muestra sugerencias históricas de texto libre o autocompletado local.
2. **Dimensiones uniformes:** Todos los selectores de productos y lotes tienen una altura estandarizada de 40px (`h-10`) y ocupan el ancho asignado sin desbordar el diseño.
3. **Selección obligatoria de catálogo:** No es posible ingresar o enviar texto arbitrario que no pertenezca al catálogo activo o al stock de la bodega.
4. **Actualización automática de campos dependientes:** Al seleccionar un ítem en Salida, la fecha de caducidad se visualiza en la caja de lectura y el campo de cantidad se limita al saldo disponible. En Entrada, la categoría se visualiza de inmediato en su caja correspondiente.
5. **Calidad de software:** Compilación sin errores (`npx tsc --noEmit`) y 100% de la suite de pruebas pasando (`npx vitest run`).
