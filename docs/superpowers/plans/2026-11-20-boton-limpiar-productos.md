# Botón Limpiar de Productos Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Mostrar `Limpiar` como botón secundario turquesa junto a `Buscar` sin alterar su navegación.

**Architecture:** Se mantiene `Link` porque la acción navega a `/productos`. Solo se actualizan sus clases visuales y la prueba de la página comprueba tanto el destino como el estilo secundario.

**Tech Stack:** React 19, Next.js 15, Tailwind CSS 3, Vitest y Testing Library.

**Spec:** `docs/superpowers/specs/2026-11-20-boton-limpiar-productos-design.md`

## Global Constraints

- `Buscar` no cambia.
- `Limpiar` conserva `href="/productos"`.
- Fondo blanco, borde y texto turquesa; hover con fondo turquesa suave.
- Misma altura y espaciado horizontal que `Buscar`.
- Sin componentes ni dependencias nuevas.

## Review Focus

- La mejora visual no debe convertir `Limpiar` en un botón de envío: la prueba comprueba que sigue siendo enlace a `/productos`.
- El área clickeable debe conservar altura y padding equivalentes a `Buscar`: la prueba comprueba sus clases de layout.
- El hover no debe perder legibilidad: la prueba comprueba fondo suave y texto turquesa.

---

### Task 1: Estilizar la acción Limpiar

**Files:**
- Modify: `src/modules/productos/components/productos-filtros.tsx`
- Modify: `src/__tests__/productos-page.test.tsx`

**Interfaces:**
- Consumes: `Link` de Next.js y las clases Tailwind existentes.
- Produces: enlace `Limpiar` con apariencia de botón secundario.

- [ ] **Step 1: Escribir la prueba fallida**

  Extender la prueba de filtros para obtener el enlace `Limpiar`, comprobar `href="/productos"` y exigir clases de borde, fondo blanco, texto turquesa, altura/padding y hover turquesa suave.

- [ ] **Step 2: Verificar RED**

  Run: `npm test -- src/__tests__/productos-page.test.tsx`
  Expected: FAIL porque el enlace actual no contiene las clases de botón secundario.

- [ ] **Step 3: Aplicar el estilo aprobado**

  Actualizar únicamente `className` del `Link` en `productos-filtros.tsx` con contenedor inline-flex, altura 10, padding horizontal 4, borde turquesa, fondo blanco, texto turquesa, radio, peso medio y hover turquesa suave.

- [ ] **Step 4: Verificar GREEN y regresión**

  Run: `npm test -- src/__tests__/productos-page.test.tsx && npm test`
  Expected: pruebas enfocadas y suite completa en PASS.

- [ ] **Step 5: Compilar y registrar**

  Run: `npm run build`
  Expected: build exitoso.

  Commit: `style: destacar botón limpiar de productos`
