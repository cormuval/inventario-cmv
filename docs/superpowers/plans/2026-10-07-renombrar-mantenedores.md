# Plan de Implementación: Renombrar "Configuraciones" a "Mantenedores" en Interfaz

**Fecha:** 07 de Octubre de 2026  
**Especificación:** `docs/specs/procedimiento-renombrar-mantenedores.md`  
**Rama:** `Renombrar-Mantenedores`  

---

### Resumen del Plan

Alinear la terminología de la interfaz con los estándares de salud pública de la Corporación Municipal de Valparaíso (CMV), cambiando la etiqueta "Configuraciones" e icono de tuerca (`Settings`) por **"Mantenedores"** con icono `SlidersHorizontal`. Se conserva la ruta estable `/configuraciones` omitiendo redirecciones innecesarias.

---

### Tareas de Implementación

- [ ] **Tarea 1: Actualizar barra lateral de navegación (`AppSidebarShell`)**
  - Archivo: `src/shared/components/layout/app-sidebar-shell.tsx`
  - Reemplazar importación de `Settings` por `SlidersHorizontal`.
  - Cambiar `label: "Configuraciones"` a `label: "Mantenedores"`, manteniendo `href: "/configuraciones"`.

- [ ] **Tarea 2: Actualizar vista de mantenedores**
  - Archivo: `src/app/configuraciones/page.tsx`
  - Cambiar título `h2` a `"Mantenedores"`.
  - Cambiar subtítulo a `"Gestión de centros de salud, bodegas, unidades y usuarios del sistema"`.

- [ ] **Tarea 3: Agregar pruebas unitarias de navegación y renderizado de mantenedores**
  - Archivo: `src/__tests__/mantenedores-ui.test.tsx`
  - Verificar que la barra lateral renderiza la opción "Mantenedores" vinculada a `/configuraciones`.

- [ ] **Tarea 4: Verificación completa y Pull Request**
  - Ejecutar `npx tsc --noEmit` y `npx vitest run`.
  - Subir la rama `Renombrar-Mantenedores` al remoto `cormuval`.
