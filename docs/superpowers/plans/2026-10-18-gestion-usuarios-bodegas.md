# Plan de Implementación: Gestión Completa de Usuarios (Edición, Desactivación y Multibodega)

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Implementar edición, desactivación y asignación de múltiples bodegas (tabla `EncargadosBodega`) para usuarios desde Mantenedores, asegurando integridad relacional y control de acceso.

**Architecture:** Extender Server Actions (`editarUsuario`, `toggleEstadoUsuario`) con validación Zod, auditoría y transacciones atómicas para sincronizar `EncargadosBodega`. En la UI de Mantenedores, crear componentes modales para editar usuarios con selector de múltiples bodegas reactivo al centro, botón directo de desactivar/activar y visualización de múltiples insignias de bodegas en la tabla.

**Tech Stack:** Next.js 15 (App Router), React 19, TypeScript strict, Prisma (MySQL 8.4), Zod, Tailwind v3 + shadcn/ui (SimpleModal, Badge, Button, Input, Select), Vitest.

**Spec:** `docs/specs/procedimiento-gestion-usuarios-bodegas.md`

## Global Constraints

- Idioma: español (UI, comentarios, commits).
- TypeScript strict; tipos explícitos; 0 `any`.
- Server Actions con `'use server'` y sufijo `.action.ts`.
- Auditoría obligatoria con `AuditLogger.log` en cada mutación.
- Control de acceso: solo administradores (`puedeAdministrar(user.rol)`) pueden gestionar usuarios.
- Protección de seguridad: un administrador no puede auto-desactivarse ni degradar su propio rol.
- Toda bodega asignada debe pertenecer al centro de salud del usuario.

---

### Task 1: Schemas y Server Actions para Edición y Estado de Usuarios

**Files:**
- Modify: `src/modules/configuraciones/schemas/configuracion.schema.ts`
- Modify: `src/modules/configuraciones/actions/configuraciones.action.ts`
- Create: `src/__tests__/gestion-usuarios.action.test.ts`

**Interfaces:**
- Consumes: `prisma`, `requireSessionUser`, `puedeAdministrar`, `AuditLogger`
- Produces:
  - `editarUsuario(prevState: ActionState, formData: FormData): Promise<ActionState>`
  - `toggleEstadoUsuario(prevState: ActionState, formData: FormData): Promise<ActionState>`
  - `usuarioSchema` actualizado con soporte de `bodegaIds`
  - `editarUsuarioSchema`

- [ ] **Step 1: Escribir pruebas unitarias iniciales para Server Actions de usuarios**
- [ ] **Step 2: Ejecutar `npx vitest run src/__tests__/gestion-usuarios.action.test.ts` y verificar que fallen**
- [ ] **Step 3: Implementar schemas `editarUsuarioSchema` y actualizar `usuarioSchema`**
- [ ] **Step 4: Implementar `editarUsuario`, `toggleEstadoUsuario`, actualizar `crearUsuario` y `listarConfiguraciones`**
- [ ] **Step 5: Ejecutar pruebas y verificar que pasen al 100%**
- [ ] **Step 6: Commit de Task 1**

```bash
git add src/modules/configuraciones/schemas/configuracion.schema.ts src/modules/configuraciones/actions/configuraciones.action.ts src/__tests__/gestion-usuarios.action.test.ts
git commit -m "feat(usuarios): agregar acciones de servidor para editar y alternar estado de usuario con multibodega"
```

---

### Task 2: Componente Selector Multibodega Reactivo al Centro

**Files:**
- Create: `src/modules/configuraciones/components/bodegas-multi-select.tsx`

**Interfaces:**
- Produces: `BodegasMultiSelect({ centroId, bodegas, seleccionadas, onChange, disabled }: BodegasMultiSelectProps): React.ReactElement`

- [ ] **Step 1: Crear componente `BodegasMultiSelect` con filtrado dinámico por `centroId`**
- [ ] **Step 2: Verificar tipos con `npx tsc --noEmit`**
- [ ] **Step 3: Commit de Task 2**

```bash
git add src/modules/configuraciones/components/bodegas-multi-select.tsx
git commit -m "feat(ui): crear componente BodegasMultiSelect reactivo al centro seleccionado"
```

---

### Task 3: Modal de Edición de Usuario y Actualización de Creación

**Files:**
- Create: `src/modules/configuraciones/components/usuario-edit-modal.tsx`
- Modify: `src/modules/configuraciones/components/configuracion-forms.tsx`

**Interfaces:**
- Consumes: `BodegasMultiSelect`, `editarUsuario`, `SimpleModal`, `Centro`, `Bodega`, `Rol`
- Produces: `UsuarioEditModal({ usuario, centros, bodegas, roles, open, onClose, currentUserId }: UsuarioEditModalProps): React.ReactElement`

- [ ] **Step 1: Crear `UsuarioEditModal` con formulario interactivo y validaciones de seguridad**
- [ ] **Step 2: Actualizar `UsuarioForm` en `configuracion-forms.tsx` para incorporar `BodegasMultiSelect`**
- [ ] **Step 3: Verificar tipos con `npx tsc --noEmit`**
- [ ] **Step 4: Commit de Task 3**

```bash
git add src/modules/configuraciones/components/usuario-edit-modal.tsx src/modules/configuraciones/components/configuracion-forms.tsx
git commit -m "feat(ui): implementar modal de edicion de usuario y selector multibodega en creacion"
```

---

### Task 4: Tabla de Usuarios con Insignias Multibodega y Acciones de Fila

**Files:**
- Create: `src/modules/configuraciones/components/usuarios-tabla.tsx`
- Modify: `src/app/configuraciones/page.tsx`
- Create: `src/__tests__/gestion-usuarios-ui.test.tsx`

**Interfaces:**
- Consumes: `UsuarioEditModal`, `toggleEstadoUsuario`, `listarConfiguraciones`
- Produces: `UsuariosTabla({ usuarios, centros, bodegas, roles, currentUserId }: UsuariosTablaProps): React.ReactElement`

- [ ] **Step 1: Escribir pruebas unitarias de UI para la tabla de usuarios**
- [ ] **Step 2: Implementar `UsuariosTabla` con badges múltiples, botón de editar y botón de activar/desactivar**
- [ ] **Step 3: Integrar `UsuariosTabla` en `src/app/configuraciones/page.tsx` pasando `currentUserId`**
- [ ] **Step 4: Ejecutar pruebas de UI y verificar que pasen al 100%**
- [ ] **Step 5: Commit de Task 4**

```bash
git add src/modules/configuraciones/components/usuarios-tabla.tsx src/app/configuraciones/page.tsx src/__tests__/gestion-usuarios-ui.test.tsx
git commit -m "feat(ui): integrar tabla interactiva con acciones de edicion y desactivacion de usuarios"
```

---

### Task 5: Verificación Completa del Sistema, Documentación y Pull Request

**Files:**
- Modify: `docs/specs/procedimiento-gestion-usuarios-bodegas.md` (marcar CA-1 a CA-7 como completados)

- [ ] **Step 1: Ejecutar suite completa de pruebas: `npx vitest run`**
- [ ] **Step 2: Ejecutar compilación estricta de tipos: `npx tsc --noEmit`**
- [ ] **Step 3: Actualizar criterios de aceptación en la especificación**
- [ ] **Step 4: Push de la rama `Gestion-Usuarios-Bodegas` a `cormuval`**
- [ ] **Step 5: Presentar el Pull Request al usuario**
