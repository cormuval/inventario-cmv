# Especificación Técnica y de Negocio: Rediseño Integral de Mantenedores con CRUD Homogéneo

**Proyecto:** Sistema de Inventario APS — Corporación Municipal de Valparaíso (CMV)  
**Documento:** Especificación Funcional, Técnica y de Interfaz: CRUD Completo y Homogéneo para Mantenedores  
**Versión:** 1.0 (Aprobada para Implementación)  
**Fecha:** 30 de Octubre de 2026  
**Clasificación:** Mantenimiento de Entidades Base, Integridad Referencial y Usabilidad (Prioridad Alta)  

---

## 1. Diagnóstico del Problema y Justificación Operacional

### Problemática Actual:
1. **Asimetría en Funcionalidades por Entidad:**
   - La página `/mantenedores` (`src/app/mantenedores/page.tsx`) presenta una vista larga y mezclada donde **Centro**, **Bodega** y **Unidad** solo disponen de un formulario suelto de creación (`crearCentro`, `crearBodega`, `crearUnidad`).
   - Los usuarios finales (administradores) **no pueden ver el listado, buscar, editar ni activar/desactivar** centros, bodegas ni unidades desde la interfaz.
   - Únicamente la entidad **Usuario** cuenta con una tabla de consulta, modal de edición (`UsuarioEditModal`) y acción para activar/desactivar (`toggleEstadoUsuario`).
2. **Falta de Modularidad en la Interfaz:**
   - Todos los formularios se muestran abiertos simultáneamente en tarjetas apiladas, ocupando espacio excesivo y dificultando la supervisión ordenada de las entidades del sistema de salud.
3. **Ausencia de Estado Lógico en Unidades:**
   - El modelo `Unidad` en `schema.prisma` carece de columna `estado`, impidiendo el borrado lógico seguro sin romper la integridad con productos históricos.

---

## 2. Decisiones de Arquitectura y Diseño

### 2.1 Navegación Unificada por Pestañas (`/mantenedores?tab=...`)
- Se adopta la **Opción A**: navegación por pestañas en la ruta `/mantenedores` con soporte de URL sincronizada (`?tab=usuarios|centros|bodegas|unidades`).
- Mantiene la jerarquía del menú lateral sin romper rutas existentes, permitiendo recargar la página o compartir enlaces directos a cada pestaña específica.

### 2.2 Patrón de Interfaz Homogéneo (CRUD Modal)
Para cada una de las 4 entidades:
1. **Barra de Herramientas Superior:**
   - Campo de búsqueda reactiva por texto (nombre, descripción, email, etc.).
   - Filtro por estado: `Todos`, `Activos`, `Inactivos`.
   - Selector complementario en **Bodegas**: filtro por **Centro de Salud**.
   - Botón destacado **"+ Nuevo [Entidad]"** alineado a la derecha, que abre el diálogo de creación.
2. **Tabla Estandarizada:**
   - Columnas claras con diseño de `shared/components/ui/table.tsx`.
   - Indicador de estado con `Badge` (`tone="success"` para Activo, `tone="muted"` para Inactivo).
   - Columna **Acciones** al extremo derecho con botones accesibles:
     - **Editar (icono `Edit2`):** Abre el modal de edición correspondiente prellenado con los datos.
     - **Activar / Desactivar (icono `Power`):** Diálogo de confirmación con mutación en Server Action.
   - Estado vacío (*Empty State*) amigable cuando no existan registros o no haya coincidencias de búsqueda.
3. **Modales de Creación y Edición (Drawer / Dialog):**
   - Los formularios no quedan visibles permanentemente; se abren bajo demanda en un modal accesible (reutilizando y extendiendo el patrón de `UsuarioEditModal` y `SimpleModal`).
   - Cierre automático al completar con éxito y retroalimentación mediante `toast` (sonner).

---

## 3. Reglas de Negocio e Integridad Referencial

### Regla R-01: Prohibición de Borrado Físico (Solo Desactivación Lógica)
- Ninguna entidad (Centro, Bodega, Unidad, Usuario) puede eliminarse físicamente con `prisma.delete()`, ya que existen órdenes de entrada, órdenes de salida, lotes de stock y bitácoras de auditoría vinculadas.
- La eliminación se realiza exclusivamente mediante alternancia lógica del atributo `estado` (`true` / `false`).

### Regla R-02: Bloqueo Preventivo al Desactivar Centros de Salud
- Para resguardar la consistencia operativa comunal, un Centro de Salud **no puede ser desactivado** si mantiene dependencias activas:
  - Si el centro posee **bodegas activas** (`bodega.estado === true`): el servidor bloquea la operación y responde:
    *"No se puede desactivar el centro porque contiene X bodega(s) activa(s). Desactívelas primero."*
  - Si el centro posee **usuarios activos** (`usuario.estado === true`): el servidor bloquea la operación y responde:
    *"No se puede desactivar el centro porque contiene X usuario(s) activo(s). Reasígnelos o desactívelos primero."*

### Regla R-03: Validación al Desactivar Bodegas
- Si una bodega tiene stock disponible positivo (`cantidadDisponible > 0`): el servidor bloquea la operación con:
  *"No se puede desactivar la bodega porque mantiene existencias de stock disponibles. Debe realizar los traspasos o salidas correspondientes antes de darla de baja."*

### Regla R-04: Unicidad y Estado en Unidad
- Se incorpora el campo `estado Boolean @default(true) @map("Estado")` en el modelo `Unidad` en `schema.prisma`.
- Al crear o editar una unidad, si la descripción ya existe (violación de restricción única `@unique`, código Prisma `P2002`), el backend captura el error y retorna el mensaje claro:  
  *"Ya existe una unidad con esa descripción."*

### Regla R-05: Restricción Exclusiva de Administrador (R01)
- Todas las Server Actions de consulta y mutación en mantenedores validan estrictamente `puedeAdministrar(user.rol)` (rol `R01`).
- Toda mutación es registrada en la tabla `logs` mediante `AuditLogger.log` con la entidad, ID y detalle correspondiente.

---

## 4. Diseño Técnico y Componentes Afectados

```
src/
  app/mantenedores/
    page.tsx                        # Layout principal con tabs (?tab=...)
  modules/mantenedores/
    actions/mantenedores.action.ts  # CRUD completo para Centro, Bodega, Unidad, Usuario
    schemas/mantenedores.schema.ts  # Schemas Zod de creación y edición
    components/
      mantenedores-tabs.tsx         # Componente cliente con navegación por pestañas
      centros/
        centros-tabla.tsx           # Tabla de centros con búsqueda y estado
        centro-form-modal.tsx       # Modal unificado crear/editar centro
      bodegas/
        bodegas-tabla.tsx           # Tabla de bodegas con filtro de centro
        bodega-form-modal.tsx       # Modal unificado crear/editar bodega
      unidades/
        unidades-tabla.tsx          # Tabla de unidades con búsqueda y estado
        unidad-form-modal.tsx       # Modal unificado crear/editar unidad
      usuarios/
        usuarios-tabla.tsx          # Tabla de usuarios estandarizada
        usuario-edit-modal.tsx      # Modal de usuario existente
```

### 4.1 Server Actions Nuevas / Actualizadas (`mantenedores.action.ts`):
- `editarCentro(prevState, formData)`
- `toggleEstadoCentro(prevState, formData)` (con validación de bodegas y usuarios activos)
- `editarBodega(prevState, formData)`
- `toggleEstadoBodega(prevState, formData)` (con validación de stock positivo)
- `editarUnidad(prevState, formData)`
- `toggleEstadoUnidad(prevState, formData)`

---

## 5. Estrategia de Pruebas Automatizadas

1. **Pruebas Unitarias de Server Actions (`src/__tests__/mantenedores-crud.action.test.ts`):**
   - Creación, edición y cambio de estado exitoso de Centro, Bodega y Unidad.
   - Bloqueo preventivo al intentar desactivar un centro con bodegas o usuarios activos.
   - Bloqueo preventivo al intentar desactivar una bodega con saldo disponible de stock.
   - Manejo amigable de duplicados en Unidad (`P2002`).
   - Rechazo de acceso a usuarios sin rol de Administrador `R01`.
2. **Pruebas de Interfaz de Usuario (`src/__tests__/mantenedores-crud-ui.test.tsx`):**
   - Renderizado de pestañas y conmutación entre entidades.
   - Apertura de modal "Nuevo" y edición en tabla.
   - Búsqueda por texto y filtros de estado.
   - Confirmación de no regresión del bucle de re-renders de `BodegasMultiSelect`.

---

## 6. Criterios de Aceptación (Definición de Terminado)

- [x] **CA-1: CRUD Completo:** Las 4 entidades (Centro, Bodega, Unidad, Usuario) permiten listar, buscar, crear en modal, editar en modal y alternar activación/desactivación desde la UI.
- [x] **CA-2: Navegación por Pestañas:** La interfaz organiza las entidades mediante pestañas con query param `/mantenedores?tab=...` limpio y ordenado.
- [x] **CA-3: Integridad de Centros:** Se bloquea la desactivación de un centro si posee bodegas o usuarios activos.
- [x] **CA-4: Integridad de Bodegas:** Se bloquea la desactivación de una bodega con stock positivo.
- [x] **CA-5: Manejo de Unicidad en Unidad:** Se muestra mensaje de error amigable ante duplicación de descripción.
- [x] **CA-6: Auditoría Completa:** Todas las operaciones de creación, edición y cambio de estado se auditan mediante `AuditLogger`.
- [x] **CA-7: Calidad y Cero Regresiones:** Pasan todos los tests en Vitest, `tsc --noEmit` sin errores y build de producción exitoso.
