# Plan de Implementación: Renombrar "Configuraciones" a "Mantenedores" en Interfaz

**Fecha:** 07 de Octubre de 2026  
**Especificación:** `docs/specs/procedimiento-renombrar-mantenedores.md`  
**Rama:** `Renombrar-Mantenedores`  

---

### Resumen del Plan

Alinear la terminología de la interfaz con los estándares de salud pública de la Corporación Municipal de Valparaíso (CMV), cambiando la etiqueta "Configuraciones" e icono de tuerca (`Settings`) por **"Mantenedores"** con icono `SlidersHorizontal`. Además se unifica el nombre del módulo en código y rutas (`/mantenedores`), con redirección permanente desde `/configuraciones`.

---

### Tareas de Implementación

- [x] **Tarea 1: Actualizar barra lateral de navegación (`AppSidebarShell`)**
  - Archivo: `src/shared/components/layout/app-sidebar-shell.tsx`
  - Reemplazar importación de `Settings` por `SlidersHorizontal`.
  - Cambiar `label: "Configuraciones"` a `label: "Mantenedores"`, apuntando a `href: "/mantenedores"`.

- [x] **Tarea 2: Actualizar vista de mantenedores**
  - Archivo: `src/app/mantenedores/page.tsx`
  - Cambiar título `h2` a `"Mantenedores"`.
  - Cambiar subtítulo a `"Gestión de centros de salud, bodegas, unidades y usuarios del sistema"`.

- [x] **Tarea 3: Agregar pruebas unitarias de navegación y renderizado de mantenedores**
  - Archivo: `src/__tests__/mantenedores-ui.test.tsx`
  - Verificar que la barra lateral renderiza la opción "Mantenedores" vinculada a `/mantenedores`.

- [x] **Tarea 4: Unificar el nombre del módulo en código y rutas**
  - Mover `src/app/configuraciones` → `src/app/mantenedores` y `src/modules/configuraciones` → `src/modules/mantenedores` (archivos `mantenedores.action.ts`, `mantenedores-forms.tsx`, `mantenedores.schema.ts`).
  - Renombrar `listarConfiguraciones` → `listarMantenedores` y `ConfiguracionesPage` → `MantenedoresPage`; actualizar `revalidatePath` y el `href` del menú.
  - Agregar en `next.config.ts` la redirección permanente `/configuraciones` → `/mantenedores`, con su prueba.

- [x] **Tarea 5: Verificación completa y Pull Request**
  - Ejecutar `npx tsc --noEmit` y `npx vitest run`.
  - Subir la rama `Renombrar-Mantenedores` al remoto `cormuval`.
