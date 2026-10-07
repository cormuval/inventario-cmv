# Especificación Técnica y de Interfaz: Renombrar Módulo de "Configuraciones" a "Mantenedores"

**Proyecto:** Sistema de Inventario APS — Corporación Municipal de Valparaíso (CMV)  
**Documento:** Especificación Funcional y de Usabilidad: Transición Terminológica de Configuraciones a Mantenedores  
**Versión:** 1.1 (Aprobada)  
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
 • Ruta: /configuraciones (estable)           • Ruta: /configuraciones (estable, sin cambios innecesarios)
```

### Regla R-01: Estandarización de Etiquetas e Iconografía en UI
- La opción de navegación en la barra lateral (`AppSidebarShell`) cambia de `"Configuraciones"` a `"Mantenedores"`.
- El icono representativo cambia de `Settings` a `SlidersHorizontal`, comunicando claramente la administración de parámetros estructurales del sistema.
- El enlace de la barra lateral se mantiene apuntando a la ruta existente `/configuraciones`.
- El encabezado principal de la página (`src/app/configuraciones/page.tsx`) mostrará:
  - Título principal (`h2`): **Mantenedores**
  - Subtítulo descriptivo (`p`): **Gestión de centros de salud, bodegas, unidades y usuarios del sistema**

*(Nota: La Regla R-02 original referente a renombrar la URL canónica y crear redirecciones 308 en Next.js fue descartada por considerarse innecesaria operativamente, priorizando la estabilidad de rutas existentes y focalizándose en la claridad de la interfaz para el usuario).*

---

## 3. Criterios de Aceptación (Verificados)

- [x] **CA-1: Menú Lateral Actualizado:** El menú lateral muestra "Mantenedores" con el icono `SlidersHorizontal` y apunta a `/configuraciones`.
- [x] **CA-2: Vista de Mantenedores:** La página `/configuraciones` renderiza las tarjetas de Centro, Bodega, Unidad, Usuario y la tabla de usuarios registrados bajo el título principal "Mantenedores".
- [x] **CA-3: Estabilidad de Rutas:** La ruta `/configuraciones` se mantiene operativa sin requerir redirecciones externas ni alterar contratos de integración existentes.
- [x] **CA-4: Cero Regresiones:** El linter, las pruebas unitarias automáticas (70/70) y el compilador estricto de TypeScript (`tsc --noEmit`) pasan al 100%.

---

## 4. Plan de Verificación y Pruebas

1. **Pruebas de Navegación y Renderizado:**
   - Verificar que `AppSidebarShell` renderiza el texto "Mantenedores" con el icono `SlidersHorizontal`.
   - Verificar que al pulsar el enlace carga la vista con el título "Mantenedores".
2. **Pruebas Automatizadas de Funcionalidad:**
   - Ejecutar la suite completa con `npx vitest run` y `npx tsc --noEmit`.
