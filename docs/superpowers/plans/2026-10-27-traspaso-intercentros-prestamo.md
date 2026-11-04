# Traspaso y Préstamos Intercentros con Código de Verificación Implementation Plan

**Goal:** Implementar el flujo completo de transferencias y préstamos entre centros de salud (APS) de la Corporación Municipal de Valparaíso, con descuento inmediato en origen, estado en tránsito con ventana de 1 semana (7 días), código unívoco de 7 caracteres para recepción en destino, advertencia sanitaria consultiva por caducidad próxima, botón de notificación con campana y punto rojo en la cabecera, mecanismo de anulación con restitución de stock, prevención de doble recepción atómica, y validación de alcance por establecimiento.

**Nota de Alcance:** El envío real de correos vía Resend y comprobante PDF se gestionará en el PR dedicado de integración de correos (`feat/envio-correo-comprobante`). En este PR la notificación oficial in-app es la campana en la cabecera con aviso visual e historial de auditoría fail-safe.

**Architecture:** Se extiende el modelo `OrdenSalida` en Prisma para almacenar metadatos de transferencia intercentros (`estadoPrestamo`, `codigoRecepcion`, `fechaLimiteRecepcion`, `centroDestinoId`, `bodegaDestinoId`, etc.) con migración formal en `prisma/migrations/`. Al emitir una salida tipo "A otros centros", una Server Action descuenta de forma inmediata el stock de origen en una transacción atómica, calcula la expiración a 7 días, genera un código de 7 caracteres no ambiguo y registra la notificación interna en auditoría. En el frontend, el header despliega un botón con ícono de campana y punto rojo indicador (`🔔🔴`) con conteo real en paralelo (`Promise.all`) cuando existen envíos en tránsito hacia el centro del usuario, permitiendo desplegar un Popover con accesos rápidos a `/orden-entrada/recepcion-prestamos`, donde el receptor valida el código, revisa alertas por demora (> 7 días), ingresa observaciones opcionales e incrementa el stock en su bodega de forma condicional protegida contra race conditions. Además, se incorpora la anulación con restitución de stock y el bloqueo de edición/eliminación de líneas de préstamo.

**Tech Stack:** Next.js 15 (App Router), React 19, TypeScript strict, Prisma, MySQL 8.4, Tailwind CSS v3, Radix UI Popover, Lucide React, Zod, Sonner, Vitest, Testing Library.

**Spec:** `docs/specs/procedimiento-traspaso-intercentros-prestamo.md`

## Global Constraints

- Backend implementado exclusivamente mediante Server Actions (`'use server'`), sin API Routes para la lógica interna (conforme a `AGENTS.md`).
- Validación estricta de alcance de usuario (`requireSessionUser`, `validarCentroBodegaEnAlcance`).
- Plazo de tránsito establecido en 1 semana (7 días / 168 horas); el cómputo de demora se realiza al vuelo sin cron jobs.
- Criterio de merma consultivo: no bloquear la salida si caduca en $\le 7$ días, sino exigir confirmación explícita mediante diálogo/check sanitario.
- Notificación in-app y auditoría interna fail-safe en este PR.
- Prevención de race conditions mediante `updateMany` condicional dentro de transacción.
- Idioma español en UI, comentarios, mensajes de error y commits; indentación de 4 espacios; tipado TypeScript estricto.
