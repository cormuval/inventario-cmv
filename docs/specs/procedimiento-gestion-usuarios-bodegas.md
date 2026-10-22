# Especificación Técnica y de Interfaz: Gestión Completa de Usuarios (Edición, Desactivación y Asignación de Múltiples Bodegas)

**Proyecto:** Sistema de Inventario APS — Corporación Municipal de Valparaíso (CMV)  
**Documento:** Especificación Funcional y de Seguridad: Ciclo de Vida de Usuarios y Asignación Multibodega  
**Versión:** 1.0 (Aprobada)  
**Fecha:** 14 de Octubre de 2026  
**Clasificación:** Seguridad, Control de Acceso y Gestión de Datos Maestros (Prioridad Alta)  

---

## 1. Diagnóstico del Problema y Contexto de Negocio

### El Reporte y Requerimiento:
> *"Completar la gestión de usuarios: edición, desactivación y asignación de varias bodegas  
> Origen: borrador de requerimientos, punto 6 (el administrador no modifica roles, solo los asigna al crear el usuario).  
> Ya cumplido: los roles vienen fijos de la carga inicial (seed) y el administrador solo los asigna al crear un usuario.  
> Qué falta:  
> - Editar y desactivar usuarios desde Mantenedores (hoy solo se pueden crear), para quitar el acceso a quien deja el cargo.  
> - Asignar varias bodegas del mismo centro a un usuario desde la pantalla (tabla EncargadosBodega). Hoy solo se puede insertando datos directo en la base, y la visibilidad por bodega (punto 3) depende de esta asignación.  
> - Los permisos internos de cada rol siguen sin poder modificarse desde la aplicación."*

### Causa Raíz Detectada en Código:
1. **Flujo Unidireccional de Solo Creación:**
   - En [`../../src/modules/mantenedores/actions/mantenedores.action.ts`](../../src/modules/mantenedores/actions/mantenedores.action.ts), únicamente existía la acción `crearUsuario`. No existían acciones de servidor para actualizar datos ni modificar el estado (`estado: false`).
2. **Imposibilidad de Revocar Acceso a Exfuncionarios:**
   - La regla de autenticación Google OAuth (`../../src/auth.ts`) exige que `usuario.estado === true`. Al no existir la opción de desactivar usuarios en pantalla, la única forma de dar de baja a un funcionario que deja el cargo era mediante consultas SQL manuales a la base de datos.
3. **Desconexión con la Tabla `EncargadosBodega` en UI:**
   - La lógica de visibilidad por mínimo privilegio (`obtenerAlcanceBodegasAsociadas` en `../../src/shared/lib/inventario-alcance.ts`) y la barra lateral leen las bodegas asignadas desde la tabla `EncargadosBodega`. Sin embargo, el formulario original solo permitía asignar una única `bodegaId` en la tabla `Usuario`.
4. **Tabla de Mantenedores Sin Acciones:**
   - En [`../../src/app/mantenedores/page.tsx`](../../src/app/mantenedores/page.tsx), la tabla de usuarios registrados solo exponía columnas de texto plano sin columna de acciones ("Editar", "Desactivar" / "Activar").

---

## 2. Reglas de Interfaz y Negocio

```
               [ ADMINISTRACIÓN DE USUARIOS EN MANTENEDORES ]
                                      │
            ┌─────────────────────────┴─────────────────────────┐
            ▼                                                   ▼
   [ CREACIÓN / EDICIÓN ]                              [ ACCIONES EN TABLA ]
   • Datos personales y contacto                       • Columna "Acciones"
   • Rol (asignación fija, sin editar permisos)        • Botón "Editar" (abre modal completo)
   • Centro de Salud                                   • Botón rápido "Desactivar" / "Activar"
   • Múltiples bodegas del centro                      • Protección contra auto-desactivación
            │                                                   │
            └─────────────────────────┬─────────────────────────┘
                                      ▼
                        [ PERSISTENCIA ATÓMICA ]
                        • Transacción Prisma:
                          - Actualiza tabla `Usuario`
                          - Sincroniza `EncargadosBodega`
                          - Revalida `/mantenedores`
                          - Registro en tabla `logs`
```

### Regla R-01: Modal de Edición Completa de Usuario
- En cada fila de la tabla de usuarios registrados se incorpora un botón con icono **"Editar"** (`Edit2`).
- Al pulsarlo, se abre un diálogo modal accesible (con cierre vía botón o tecla `Escape`) con los datos del usuario precargados:
  - **Nombre**, **Apellido Paterno**, **Apellido Materno**
  - **Email** (institucional `@cmvalparaiso.cl`, validado estrictamente en servidor)
  - **Teléfono**
  - **Rol:** Selector de roles activos fijos (`R01`, `R02`, `R03`, etc.).
  - **Centro de Salud:** Selector de centros activos.
  - **Bodegas Asignadas:** Selector múltiple reactivo (`BodegasMultiSelect`) con las bodegas pertenecientes al centro seleccionado.
  - **Estado:** Checkbox de "Usuario Activo".
- Botones de acción del modal: "Guardar Cambios" (con estado de carga) y "Cancelar".

### Regla R-02: Asignación Múltiple de Bodegas y Sincronización en `EncargadosBodega`
- La selección de múltiples bodegas está disponible tanto en el formulario de **creación** como en el de **edición**.
- En la base de datos se mantiene la integridad relacional mediante una transacción de Prisma (`prisma.$transaction`):
  1. Se actualizan los datos base del modelo `Usuario`.
  2. `Usuario.bodegaId` se asigna a la primera bodega seleccionada (o `null` si no hay bodegas seleccionadas) para compatibilidad hacia atrás.
  3. Se sincronizan las filas en la tabla `EncargadosBodega`:
     - Se eliminan los encargos antiguos del usuario.
     - Se insertan las nuevas bodegas seleccionadas con `encargadoId: usuario.id`, `centroId: usuario.centroId`, `rolId: usuario.rolId`, y `email: usuario.email`.
     - Se previene duplicidad mediante `[...new Set(bodegaIds)]` y la clave única compuesta `@@unique([encargadoId, centroId, bodegaId])`.

### Regla R-03: Dependencia Reactiva Centro -> Bodegas
- Las bodegas seleccionables dependen estrictamente del `centroId` elegido y deben encontrarse activas (`estado: true`).
- Si el administrador cambia el centro de salud del usuario en el formulario (de creación o edición):
  - La lista de bodegas seleccionables se actualiza dinámicamente para mostrar solo las bodegas activas del nuevo centro.
  - Las bodegas seleccionadas previamente del centro anterior se desmarcan y limpian automáticamente para evitar inconsistencias territoriales.

### Regla R-04: Desactivación Rápida y Protección de Bloqueo Propio (Self-Lockout)
- En la tabla de usuarios se añade un botón directo de acción según el estado del usuario:
  - Si está activo: botón **"Desactivar"** (icono `Power` / tono advertencia).
  - Si está inactivo: botón **"Activar"** (icono `Power` / tono éxito).
- **Feedback visual:** El resultado se despliega con notificaciones `toast` de sonner (`toast.success` / `toast.error`) y el botón permanece deshabilitado durante la transición.
- **Protección contra auto-desactivación:**
  - Si el usuario en sesión es el mismo que se intenta desactivar (`usuarioTarget.id === sessionUser.id`), el sistema bloquea la acción arrojando un error:
    `"No puedes desactivar tu propia cuenta de usuario."`
  - Igualmente, un administrador no puede cambiarse a sí mismo el rol a uno no administrativo mientras esté en sesión (`rolId !== ROL_ADMINISTRADOR`).

### Regla R-05: Inmutabilidad de Permisos de Roles
- Los permisos y descripciones de cada rol se mantienen 100% fijos desde el seed del sistema (`R01` Administrador Central, `R02` Encargado de Centro, `R03` Operador Farmacia, `R07` Operador Bodega, etc.).
- La interfaz no provee ninguna pantalla ni acción para editar los permisos internos de los roles; la administración se limita exclusivamente a asignar el rol al funcionario.

### Regla R-06: Visualización Enriquecida en la Tabla de Mantenedores
- La columna **"Bodegas Asignadas"** en la tabla de usuarios registrados soporta múltiples asignaciones:
  - Si tiene 1 o más bodegas asignadas: se muestran como insignias (`Badge`) con el nombre de cada bodega.
  - Si no tiene bodegas: se visualiza un texto neutro en cursiva *"Sin bodega"*.
- La columna **"Acciones"** agrupa el botón de "Editar" y el de "Desactivar / Activar".

### Regla R-07: Trazabilidad y Auditoría
- Todas las operaciones quedan registradas mediante `AuditLogger.log` con detalle estructurado como objeto JSON:
  - `crear` (entidad `Usuario`):
    `{ email, rolId, centroId, bodegaIds, estado }`
  - `actualizar` (entidad `Usuario` en edición):
    `{ cambios: { [campo]: { antes, despues } } }` registrando únicamente los campos modificados (comparando `bodegaIds` sin importar el orden).
  - `actualizar` (entidad `Usuario` en activación/desactivación):
    `{ cambios: { estado: { antes, despues } } }`

---

## 3. Criterios de Aceptación (Definición de Terminado)

- [x] **CA-1: Edición de Datos de Usuario:** El administrador puede abrir el modal de edición de cualquier usuario, modificar sus nombres, apellidos, teléfono, rol y centro, y guardar con éxito.
- [x] **CA-2: Asignación Múltiple de Bodegas:** El administrador puede marcar 2 o más bodegas para un usuario (en creación o edición), y estas se persisten correctamente en la tabla `EncargadosBodega`.
- [x] **CA-3: Desactivación Efectiva:** Al desactivar a un usuario, su estado pasa a `Inactivo` en la tabla. Si el usuario intenta iniciar sesión con Google OAuth, el sistema deniega el acceso.
- [x] **CA-4: Protección de Auto-desactivación:** El administrador conectado no puede desactivar su propio usuario ni removerse los privilegios de administrador.
- [x] **CA-5: Filtrado Dinámico de Bodegas por Centro:** Al cambiar el centro en el formulario, las opciones de bodegas se actualizan al centro seleccionado y se descartan las del centro anterior.
- [x] **CA-6: Reflejo Inmediato en Alcance y Barra Lateral:** Un operador con múltiples bodegas asignadas visualiza inmediatamente todas sus bodegas en el selector de alcance de stock, en los formularios de orden y en su perfil.
- [x] **CA-7: Cero Regresiones:** Todas las pruebas unitarias y de integración (`npx vitest run`) y la verificación estricta de tipos (`npx tsc --noEmit`) pasan al 100%.

---

## 4. Plan de Verificación y Pruebas

1. **Pruebas de Acciones del Servidor (`gestion-usuarios.action.test.ts`):**
   - Probar `editarUsuario` con actualización de datos personales y rol.
   - Probar asignación y sincronización de múltiples bodegas en `EncargadosBodega`.
   - Probar `toggleEstadoUsuario` (activación y desactivación).
   - Probar que un administrador no puede auto-desactivarse.
   - Probar rechazo de bodegas inactivas y bodegas de otro centro.
   - Probar rechazo de correos no institucionales (`persona@gmail.com`).
   - Probar mensaje amigable para correos duplicados (`P2002`).
   - Probar estructura de auditoría `{ cambios }`.
2. **Pruebas de Interfaz de Usuario (`gestion-usuarios-ui.test.tsx`):**
   - Verificar renderizado de la tabla con columna de acciones ("Editar", "Desactivar/Activar").
   - Verificar apertura y cierre del modal de edición con datos precargados y tecla `Escape`.
   - Verificar feedback visual de `toast.success` y `toast.error`.
   - Verificar visualización de múltiples insignias de bodegas en la tabla.
