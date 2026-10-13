# Especificación Técnica y de Interfaz: Renombrar Módulo de "Configuraciones" a "Mantenedores"

**Proyecto:** Sistema de Inventario APS — Corporación Municipal de Valparaíso (CMV)  
**Documento:** Especificación Funcional y de Usabilidad: Transición Terminológica de Configuraciones a Mantenedores  
**Versión:** 1.2 (Aprobada)  
**Fecha:** 07 de Octubre de 2026  
**Clasificación:** Usabilidad, Nomenclatura del Dominio e Interfaz de Usuario (Prioridad Media)  

---

## 1. Diagnóstico del Problema

### El Reporte y Requerimiento:
> *"6.- Renombrar 'Configuraciones' a 'Parámetros' o 'Mantenedores'  
> Detalle: En sistemas de gestión y ERPs de salud, gestionar Centros, Bodegas, Unidades y Catálogo de Productos se denomina 'Mantenedores' o 'Maestros', no 'Configuración'. Llamarlo 'Configuraciones' confunde a los usuarios pensando que cambiarán el fondo de pantalla o su contraseña."*

### Causa Raíz y Confusión Operativa:
1. **Divergencia Terminológica en Salud Pública:**
   - En la administración pública chilena (SSVSA / Corporación Municipal de Valparaíso), la administración de entidades estructurales (Centros de Salud, Bodegas, Unidades de Medida y Funcionarios/Usuarios) es universalmente denominada **Mantenedores** o **Tablas Maestras**.
   - El término *"Configuraciones"* induce al operador a esperar opciones personales (preferencias visuales, contraseñas, temas claro/oscuro o ajustes locales).
2. **Iconografía Ambigua:**
   - El uso de la clásica tuerca de engranaje (`Settings`) en el menú lateral refuerza la percepción de ajuste de software y no de administración de datos maestros operativos.

---

## 2. Reglas de Interfaz y Negocio

```
              [ NAVEGACIÓN Y ACCESO A ENTIDADES BASE ]
                                 │
           ¿A qué sección accede el usuario administrador?
                                 │
       ┌─────────────────────────┴─────────────────────────┐
       ▼                                                   ▼
 [ ⛔ ANTES: "Configuraciones" ]              [ ✔ AHORA: "Mantenedores" ]
 • Etiqueta: "Configuraciones"                • Etiqueta: "Mantenedores"
 • Icono: Settings (Tuerca)                   • Icono: SlidersHorizontal (Parámetros)
 • Ambigüedad con perfil/contraseña           • Terminología estándar ERP salud CMV
 • Título: "Configuraciones"                  • Título: "Mantenedores"
 • Ruta: /configuraciones                     • Ruta: /mantenedores (308 desde /configuraciones)
```

### Regla R-01: Estandarización de Etiquetas e Iconografía en UI
- La opción de navegación en la barra lateral (`AppSidebarShell`) cambia de `"Configuraciones"` a `"Mantenedores"`.
- El icono representativo cambia de `Settings` a `SlidersHorizontal`, comunicando claramente la administración de parámetros estructurales del sistema.
- El enlace de la barra lateral apunta a `/mantenedores`.
- El encabezado principal de la página (`src/app/mantenedores/page.tsx`) mostrará:
  - Título principal (`h2`): **Mantenedores**
  - Subtítulo descriptivo (`p`): **Gestión de centros de salud, bodegas, unidades y usuarios del sistema**

### Regla R-02: Unificación del Nombre en Código y Rutas
Para que interfaz y código usen un único término, todo el módulo adopta el nombre `mantenedores`:

| Antes | Ahora |
|---|---|
| Ruta `/configuraciones` | Ruta `/mantenedores` (`src/app/mantenedores/page.tsx`) |
| `src/modules/configuraciones/` | `src/modules/mantenedores/` |
| `actions/configuraciones.action.ts` | `actions/mantenedores.action.ts` |
| `components/configuracion-forms.tsx` | `components/mantenedores-forms.tsx` |
| `schemas/configuracion.schema.ts` | `schemas/mantenedores.schema.ts` |
| `listarConfiguraciones()` | `listarMantenedores()` |
| `ConfiguracionesPage` | `MantenedoresPage` |
| `revalidatePath("/configuraciones")` | `revalidatePath("/mantenedores")` |

- La ruta histórica `/configuraciones` redirige de forma permanente (308) a `/mantenedores` mediante `redirects()` en `next.config.ts`, para conservar marcadores y enlaces existentes.

---

## 3. Criterios de Aceptación (Verificados)

- [x] **CA-1: Menú Lateral Actualizado:** El menú lateral muestra "Mantenedores" con el icono `SlidersHorizontal` y apunta a `/mantenedores`.
- [x] **CA-2: Vista de Mantenedores:** La página `/mantenedores` renderiza las tarjetas de Centro, Bodega, Unidad, Usuario y la tabla de usuarios registrados bajo el título principal "Mantenedores".
- [x] **CA-3: Unificación y Compatibilidad de Rutas:** No quedan referencias a `configuraciones` en el código del módulo, y `/configuraciones` redirige (308) a `/mantenedores`.
- [x] **CA-4: Cero Regresiones:** Las pruebas unitarias automáticas (`npx vitest run`), el build de Next.js (`npx next build`) y el compilador estricto de TypeScript (`tsc --noEmit`) pasan al 100%.

---

## 4. Plan de Verificación y Pruebas

1. **Pruebas de Navegación y Renderizado:**
   - Verificar que `AppSidebarShell` renderiza el texto "Mantenedores" con el icono `SlidersHorizontal`.
   - Verificar que al pulsar el enlace carga la vista con el título "Mantenedores".
   - Verificar que `next.config.ts` declara la redirección permanente `/configuraciones` → `/mantenedores`.
2. **Pruebas Automatizadas de Funcionalidad:**
   - Ejecutar la suite completa con `npx vitest run` y `npx tsc --noEmit`.
