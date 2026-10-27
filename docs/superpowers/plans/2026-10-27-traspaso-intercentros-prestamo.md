# Traspaso y Préstamos Intercentros con Código de Verificación Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Implementar el flujo completo de transferencias y préstamos entre centros de salud (APS) de la Corporación Municipal de Valparaíso, con descuento inmediato en origen, estado en tránsito con ventana de 1 semana (7 días), código unívoco de 7 caracteres para recepción en destino, advertencia sanitaria consultiva por caducidad próxima, botón de notificación con campana y punto rojo en la cabecera, y despacho de correos informativos.

**Architecture:** Se extiende el modelo `OrdenSalida` en Prisma para almacenar metadatos de transferencia intercentros (`estadoPrestamo`, `codigoRecepcion`, `fechaLimiteRecepcion`, `centroDestinoId`, `bodegaDestinoId`, etc.). Al emitir una salida tipo "A otros centros", una Server Action descuenta de forma inmediata el stock de origen en una transacción atómica, calcula la expiración a 7 días, genera un código de 7 caracteres no ambiguo y despacha de forma asíncrona un correo institucional a los encargados del centro receptor. En el frontend, el header despliega un botón con ícono de campana y punto rojo indicador (`🔔🔴`) cuando existen envíos en tránsito hacia el centro del usuario, permitiendo desplegar un Popover con accesos rápidos a la nueva vista `/orden-entrada/recepcion-prestamos`, donde el receptor valida el código, revisa alertas por demora (> 7 días), ingresa observaciones opcionales e incrementa el stock en su bodega.

**Tech Stack:** Next.js 15 (App Router), React 19, TypeScript strict, Prisma, MySQL 8.4, Tailwind CSS v3, Radix UI Popover, Lucide React, Zod, Sonner, Vitest, Testing Library.

**Spec:** `docs/specs/procedimiento-traspaso-intercentros-prestamo.md`

## Global Constraints

- Backend implementado exclusivamente mediante Server Actions (`'use server'`), sin API Routes para la lógica interna (conforme a `AGENTS.md`).
- Validación estricta de alcance de usuario (`requireSessionUser`, `centroId` y bodegas asignadas).
- Plazo de tránsito establecido en 1 semana (7 días / 168 horas); el cómputo de demora se realiza al vuelo sin recurrir a cron jobs ni procesos en segundo plano.
- Criterio de merma consultivo: no bloquear la salida si caduca en $\le 7$ días, sino exigir confirmación explícita mediante diálogo modal/check sanitario.
- Notificación por correo fail-safe: errores en el despacho de correo nunca revierten la transacción de inventario en base de datos.
- Idioma español en UI, comentarios, mensajes de error y commits; indentación de 4 espacios; tipado TypeScript estricto.

---

### Task 1: Modelo de Datos Prisma para Préstamos Intercentros

**Files:**
- Modify: `prisma/schema.prisma:129-152`
- Script: `npm run db:push` y `npm run db:generate`

**Interfaces:**
- Consumes: Prisma schema existente
- Produces: Campos en `OrdenSalida`:
  - `centroDestinoId`: `String?` con relación a `Centro?`
  - `estadoPrestamo`: `String?` (`EN_TRANSITO`, `RECEPCIONADO`, `ANULADO`)
  - `codigoRecepcion`: `String?` (`@db.VarChar(10)`) con `@@index([codigoRecepcion])`
  - `fechaLimiteRecepcion`: `DateTime?`
  - `fechaRecepcion`: `DateTime?`
  - `usuarioReceptorId`: `String?` con relación a `Usuario?`
  - `observacionRecepcion`: `String?` (`@db.VarChar(255)`)
  - `advertenciaCaducidadAceptada`: `Boolean` (`@default(false)`)

- [ ] **Step 1: Modificar `prisma/schema.prisma` agregando los campos y relaciones a `OrdenSalida`**

```prisma
model OrdenSalida {
    // Campos existentes...
    centroDestinoId             String?              @map("ID_Centro_Destino") @db.VarChar(255)
    estadoPrestamo              String?              @map("Estado_Prestamo") @db.VarChar(50)
    codigoRecepcion             String?              @map("Codigo_Recepcion") @db.VarChar(10)
    fechaLimiteRecepcion        DateTime?            @map("Fecha_Limite_Recepcion")
    fechaRecepcion              DateTime?            @map("Fecha_Recepcion")
    usuarioReceptorId           String?              @map("ID_Usuario_Receptor") @db.VarChar(255)
    observacionRecepcion        String?              @map("Observacion_Recepcion") @db.VarChar(255)
    advertenciaCaducidadAceptada Boolean              @default(false) @map("Advertencia_Caducidad_Aceptada")

    centroDestino               Centro?              @relation("OrdenSalidaCentroDestino", fields: [centroDestinoId], references: [id])
    usuarioReceptor             Usuario?             @relation("OrdenSalidaUsuarioReceptor", fields: [usuarioReceptorId], references: [id])

    @@index([codigoRecepcion])
    @@index([centroDestinoId])
    @@index([estadoPrestamo])
}
```

- [ ] **Step 2: Ejecutar sincronización de base de datos**

```bash
npm run db:push
npm run db:generate
```
Expected: Schema sincronizado y cliente Prisma actualizado sin errores.

- [ ] **Step 3: Commit**

```bash
git add prisma/schema.prisma
git commit -m "feat(db): agregar campos de prestamos intercentros en orden salida"
```

---

### Task 2: Utilidad del Generador de Códigos de Recepción (7 Caracteres)

**Files:**
- Create: `src/modules/orden-salida/utils/codigo-recepcion.ts`
- Test: `src/__tests__/codigo-recepcion.test.ts`

**Interfaces:**
- Consumes: Crypto nativo de Node.js / JavaScript
- Produces: 
  - `generarCodigoRecepcion(): string` (7 caracteres alfanuméricos en mayúsculas sin 0/O, 1/I)
  - `esCodigoRecepcionValido(codigo: string): boolean`

- [ ] **Step 1: Escribir prueba unitaria que falla para el generador de códigos**

Crear `src/__tests__/codigo-recepcion.test.ts`:
```typescript
import { describe, expect, it } from "vitest";
import { esCodigoRecepcionValido, generarCodigoRecepcion } from "@/modules/orden-salida/utils/codigo-recepcion";

describe("generarCodigoRecepcion", () => {
    it("genera un código de exactamente 7 caracteres en mayúsculas", () => {
        const codigo = generarCodigoRecepcion();
        expect(codigo).toHaveLength(7);
        expect(codigo).toBe(codigo.toUpperCase());
    });

    it("no contiene caracteres ambiguos visualmente (0, O, 1, I)", () => {
        for (let i = 0; i < 50; i++) {
            const codigo = generarCodigoRecepcion();
            expect(codigo).not.toMatch(/[0O1I]/);
            expect(esCodigoRecepcionValido(codigo)).toBe(true);
        }
    });

    it("valida correctamente códigos con esCodigoRecepcionValido", () => {
        expect(esCodigoRecepcionValido("K94J2Q8")).toBe(true);
        expect(esCodigoRecepcionValido("k94j2q8")).toBe(true); // insensible a mayúsculas
        expect(esCodigoRecepcionValido("K94J2")).toBe(false); // longitud menor
        expect(esCodigoRecepcionValido("K94J2Q89")).toBe(false); // longitud mayor
        expect(esCodigoRecepcionValido("K9402Q8")).toBe(false); // contiene 0
        expect(esCodigoRecepcionValido("K94O2Q8")).toBe(false); // contiene O
    });
});
```

- [ ] **Step 2: Ejecutar prueba para confirmar fallo**

```bash
npm test src/__tests__/codigo-recepcion.test.ts
```

- [ ] **Step 3: Implementar `src/modules/orden-salida/utils/codigo-recepcion.ts`**

```typescript
// Alfabeto base excluyendo 0, O, 1, I para evitar ambigüedades en terreno
const ALFABETO_SEGURO = "23456789ABCDEFGHJKLMNPQRSTUVWXYZ";
const LONGITUD_CODIGO = 7;

export function generarCodigoRecepcion(): string {
    let resultado = "";
    for (let i = 0; i < LONGITUD_CODIGO; i++) {
        const indice = Math.floor(Math.random() * ALFABETO_SEGURO.length);
        resultado += ALFABETO_SEGURO[indice];
    }
    return resultado;
}

export function normalizarCodigoRecepcion(codigo: string): string {
    return codigo.trim().toUpperCase();
}

export function esCodigoRecepcionValido(codigo: unknown): boolean {
    if (typeof codigo !== "string") return false;
    const normalizado = normalizarCodigoRecepcion(codigo);
    if (normalizado.length !== LONGITUD_CODIGO) return false;
    const regex = new RegExp(`^[${ALFABETO_SEGURO}]{${LONGITUD_CODIGO}}$`);
    return regex.test(normalizado);
}
```

- [ ] **Step 4: Ejecutar pruebas y verificar éxito**

```bash
npm test src/__tests__/codigo-recepcion.test.ts
```
Expected: Tests pasan al 100%.

- [ ] **Step 5: Commit**

```bash
git add src/modules/orden-salida/utils/codigo-recepcion.ts src/__tests__/codigo-recepcion.test.ts
git commit -m "feat(orden-salida): utilidad generadora de codigos de recepcion de 7 caracteres"
```

---

### Task 3: Servicio de Notificación Asíncrona por Correo (Fail-Safe)

**Files:**
- Create: `src/modules/orden-salida/actions/notificacion-correo.ts`
- Test: `src/__tests__/notificacion-correo.test.ts`

**Interfaces:**
- Consumes: Prisma Client, Logger
- Produces: 
  - `despacharNotificacionPrestamoAction(datos: NotificacionPrestamoInput): Promise<{ ok: boolean; count: number }>`

- [ ] **Step 1: Escribir prueba unitaria para el despachador de correos**

Crear `src/__tests__/notificacion-correo.test.ts`:
Verifica que busque usuarios activos del `centroDestinoId` con email institucional, incluya el `correoDestino` si existe, componga el mensaje con el código y no lance excepciones si ocurre un error simulado.

- [ ] **Step 2: Implementar `src/modules/orden-salida/actions/notificacion-correo.ts`**

```typescript
"use server";

import { prisma } from "@/shared/lib/prisma";
import { AuditLogger } from "@/shared/lib/logger";

export interface NotificacionPrestamoInput {
    ordenSalidaId: string;
    codigoRecepcion: string;
    centroOrigenNombre: string;
    bodegaOrigenNombre: string;
    centroDestinoId: string;
    correoDestinoOpcional?: string | null;
    items: Array<{ productoNombre: string; cantidad: number; lote: string }>;
}

export async function despacharNotificacionPrestamoAction(
    input: NotificacionPrestamoInput
): Promise<{ ok: boolean; destinatarios: string[] }> {
    try {
        const encargados = await prisma.usuario.findMany({
            where: {
                centroId: input.centroDestinoId,
                estado: true,
                email: { contains: "@cmvalparaiso.cl" }
            },
            select: { email: true }
        });

        const destinatarios = new Set<string>();
        for (const enc of encargados) {
            if (enc.email) destinatarios.add(enc.email.toLowerCase().trim());
        }

        if (input.correoDestinoOpcional && input.correoDestinoOpcional.includes("@")) {
            destinatarios.add(input.correoDestinoOpcional.toLowerCase().trim());
        }

        const listaDestinatarios = [...destinatarios];

        // Registro de log / simulador de transporte SMTP fail-safe
        await AuditLogger.log({
            accion: "notificar",
            entidad: "OrdenSalida",
            entidadId: input.ordenSalidaId,
            detalles: {
                asunto: `Préstamo Intercentros Código #${input.codigoRecepcion}`,
                destinatarios: listaDestinatarios,
                totalProductos: input.items.length
            }
        });

        return { ok: true, destinatarios: listaDestinatarios };
    } catch (error) {
        // Fail-safe: No propagar error para no invalidar la transacción de orden de salida
        console.error("Error al despachar notificación de préstamo:", error);
        return { ok: false, destinatarios: [] };
    }
}
```

- [ ] **Step 3: Ejecutar pruebas y verificar éxito**

```bash
npm test src/__tests__/notificacion-correo.test.ts
```

- [ ] **Step 4: Commit**

```bash
git add src/modules/orden-salida/actions/notificacion-correo.ts src/__tests__/notificacion-correo.test.ts
git commit -m "feat(orden-salida): despachador fail-safe de notificaciones de prestamo"
```

---

### Task 4: Server Action de Emisión con Límite de 1 Semana y Advertencia Sanitaria

**Files:**
- Modify: `src/modules/orden-salida/schemas/orden-salida.schema.ts`
- Modify: `src/modules/orden-salida/actions/orden-salida.action.ts`
- Test: `src/__tests__/traspaso-intercentros-emision.test.ts`

**Interfaces:**
- Consumes: `generarCodigoRecepcion`, `despacharNotificacionPrestamoAction`
- Produces: `crearOrdenSalidaAction` con soporte para `A Otros Centros`:
  - Descuenta stock de inmediato en origen.
  - Asigna `codigoRecepcion`, `estadoPrestamo = "EN_TRANSITO"`, `fechaLimiteRecepcion = now() + 7 días`.
  - Valida `advertenciaCaducidadAceptada` si algún lote vence en $\le 7$ días.

- [ ] **Step 1: Escribir pruebas unitarias que cubran la emisión de traspasos intercentros**

Crear `src/__tests__/traspaso-intercentros-emision.test.ts`:
1. Verifica que una orden "A Otros Centros" genere un código de 7 caracteres y fije `fechaLimiteRecepcion` a 7 días en el futuro.
2. Verifica que descuente de inmediato el stock en la bodega de origen.
3. Verifica que si un lote caduca en $\le 7$ días y no se envía `advertenciaCaducidadAceptada`, retorne error solicitando confirmación.
4. Verifica que si se envía `advertenciaCaducidadAceptada: true`, permita completar la orden exitosamente sin bloqueo.

- [ ] **Step 2: Actualizar `src/modules/orden-salida/schemas/orden-salida.schema.ts`**

Agregar validaciones para `centroDestinoId`, `bodegaDestinoId` cuando el tipo sea "A Otros Centros", y campo `advertenciaCaducidadAceptada: z.boolean().optional().default(false)`.

- [ ] **Step 3: Modificar `src/modules/orden-salida/actions/orden-salida.action.ts`**

Incorporar la lógica atómica:
- Cálculo de fecha límite: `const fechaLimite = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000);`
- Detección de lotes con caducidad $\le 7$ días para exigir confirmación.
- Descuento inmediato de stock.
- Generación de código de 7 caracteres.
- Disparo de notificación por correo en segundo plano.

- [ ] **Step 4: Ejecutar pruebas de emisión**

```bash
npm test src/__tests__/traspaso-intercentros-emision.test.ts
```

- [ ] **Step 5: Commit**

```bash
git add src/modules/orden-salida/schemas/orden-salida.schema.ts src/modules/orden-salida/actions/orden-salida.action.ts src/__tests__/traspaso-intercentros-emision.test.ts
git commit -m "feat(orden-salida): emision de prestamos intercentros con limite 7 dias y descuento inmediato"
```

---

### Task 5: Botón de Notificación en Navbar con Campana y Pequeño Punto Rojo

**Files:**
- Create: `src/modules/orden-entrada/actions/notificaciones-prestamos.action.ts`
- Create: `src/shared/components/layout/boton-notificaciones-prestamos.tsx`
- Modify: `src/shared/components/layout/app-sidebar-shell.tsx:156-172`
- Test: `src/__tests__/boton-notificaciones-prestamos.test.tsx`

**Interfaces:**
- Consumes: Sesión de usuario (`obtenerSessionUser`) y Prisma (`OrdenSalida`)
- Produces: 
  - `obtenerPrestamosEnTransitoCentroAction(): Promise<{ total: number; ordenes: Array<...> }>`
  - Componente visual `<BotonNotificacionesPrestamos />` con icono `Bell` y punto rojo.

- [ ] **Step 1: Escribir prueba unitaria para la consulta y el componente de la campana**

Crear `src/__tests__/boton-notificaciones-prestamos.test.tsx`:
- Verifica que si `total > 0`, se renderice el punto rojo (`indicator-dot`).
- Verifica que si `total === 0`, no se renderice el punto rojo.
- Verifica que al interactuar, muestre la lista de órdenes entrantes y el botón para ir a recepcionar.

- [ ] **Step 2: Implementar `src/modules/orden-entrada/actions/notificaciones-prestamos.action.ts`**

```typescript
"use server";

import { obtenerSessionUser } from "@/shared/lib/auth";
import { prisma } from "@/shared/lib/prisma";

export async function obtenerPrestamosEnTransitoCentroAction() {
    const user = await obtenerSessionUser();
    if (!user || !user.centroId) return { total: 0, ordenes: [] };

    const ordenes = await prisma.ordenSalida.findMany({
        where: {
            centroDestinoId: user.centroId,
            estadoPrestamo: "EN_TRANSITO"
        },
        select: {
            id: true,
            codigoRecepcion: true,
            fecha: true,
            fechaLimiteRecepcion: true,
            centro: { select: { nombre: true } },
            bodega: { select: { nombre: true } },
            detalles: { select: { id: true } }
        },
        orderBy: { fecha: "desc" },
        take: 10
    });

    return {
        total: ordenes.length,
        ordenes: ordenes.map((o) => ({
            id: o.id,
            codigo: o.codigoRecepcion ?? "",
            centroOrigen: o.centro.nombre,
            bodegaOrigen: o.bodega.nombre,
            fecha: o.fecha.toISOString(),
            esDemorado: o.fechaLimiteRecepcion ? new Date() > o.fechaLimiteRecepcion : false,
            totalItems: o.detalles.length
        }))
    };
}
```

- [ ] **Step 3: Implementar `src/shared/components/layout/boton-notificaciones-prestamos.tsx`**

Crear el componente interactivo con `Popover` de Radix:
- Icono `Bell` (`lucide-react`).
- Pequeño punto rojo absoluto: `absolute top-1 right-1 h-2.5 w-2.5 rounded-full bg-red-500 ring-2 ring-white`.
- Desplegable con lista de transferencias y enlace a `/orden-entrada/recepcion-prestamos`.

- [ ] **Step 4: Integrar en `src/shared/components/layout/app-sidebar-shell.tsx`**

Ubicar `<BotonNotificacionesPrestamos />` en el `<header>` justo al lado de las acciones del usuario.

- [ ] **Step 5: Ejecutar pruebas y verificar éxito**

```bash
npm test src/__tests__/boton-notificaciones-prestamos.test.tsx
```

- [ ] **Step 6: Commit**

```bash
git add src/modules/orden-entrada/actions/notificaciones-prestamos.action.ts src/shared/components/layout/boton-notificaciones-prestamos.tsx src/shared/components/layout/app-sidebar-shell.tsx src/__tests__/boton-notificaciones-prestamos.test.tsx
git commit -m "feat(layout): boton campana con punto rojo para notificaciones de prestamos en transito"
```

---

### Task 6: Server Action de Recepción por Código de 7 Caracteres y Retroalimentación

**Files:**
- Create: `src/modules/orden-entrada/schemas/recepcion-prestamos.schema.ts`
- Create: `src/modules/orden-entrada/actions/recepcion-prestamos.action.ts`
- Test: `src/__tests__/recepcion-prestamos.action.test.ts`

**Interfaces:**
- Consumes: Prisma Client, `AuditLogger`, `requireSessionUser`
- Produces: 
  - `buscarPrestamoPorCodigoAction(codigo: string): Promise<ResultadoBusquedaPrestamo>`
  - `confirmarRecepcionPrestamoAction(input: ConfirmarRecepcionInput): Promise<ResultadoConfirmacion>`

- [ ] **Step 1: Escribir pruebas unitarias de recepción**

Crear `src/__tests__/recepcion-prestamos.action.test.ts`:
1. Búsqueda por código de 7 caracteres valida pertenencia al centro receptor.
2. Identifica si el tránsito superó 1 semana (7 días) para mostrar alerta de demora.
3. Confirmación dentro de `$transaction` incrementa stock de destino con mismo lote y caducidad.
4. Genera registro de `OrdenEntrada` enlazada y cambia estado a `RECEPCIONADO`.
5. Almacena la observación opcional de recepción.

- [ ] **Step 2: Implementar esquemas y Server Actions**

Implementar validaciones Zod y transacciones Prisma con incremento de stock (`tx.stock.upsert`).

- [ ] **Step 3: Ejecutar pruebas unitarias**

```bash
npm test src/__tests__/recepcion-prestamos.action.test.ts
```

- [ ] **Step 4: Commit**

```bash
git add src/modules/orden-entrada/schemas/recepcion-prestamos.schema.ts src/modules/orden-entrada/actions/recepcion-prestamos.action.ts src/__tests__/recepcion-prestamos.action.test.ts
git commit -m "feat(orden-entrada): server actions de consulta y confirmacion de recepcion de prestamos"
```

---

### Task 7: UI de Emisión (Alerta Sanitaria) y Pantalla de Recepción con Código

**Files:**
- Modify: `src/modules/orden-salida/components/orden-salida-form.tsx`
- Create: `src/app/(app)/orden-entrada/recepcion-prestamos/page.tsx`
- Create: `src/modules/orden-entrada/components/recepcion-prestamo-view.tsx`
- Test: `src/__tests__/recepcion-prestamos-ui.test.tsx`

**Interfaces:**
- Consumes: Componentes shadcn/ui (`Dialog`, `Input`, `Button`, `Badge`, `Card`), Server Actions anteriores
- Produces: 
  - Modal de confirmación sanitaria en formulario de salida.
  - Pantalla amigable de recepción por código de 7 caracteres con visualización de lotes, alerta de demora (> 7 días) y campo de observaciones.

- [ ] **Step 1: Escribir pruebas UI**

Crear `src/__tests__/recepcion-prestamos-ui.test.tsx`:
- Renderizado de input para código de 7 caracteres.
- Muestra de advertencia si la orden tiene más de 7 días en tránsito.
- Envío de observación opcional.

- [ ] **Step 2: Actualizar `src/modules/orden-salida/components/orden-salida-form.tsx`**

Integrar diálogo modal de confirmación sanitaria si algún lote vence en $\le 7$ días, y mostrar código de 7 caracteres con botón copiar al guardar la orden.

- [ ] **Step 3: Implementar `src/app/(app)/orden-entrada/recepcion-prestamos/page.tsx` y su vista**

Página en el grupo protegido `(app)` que permite buscar el código, revisar el detalle e ingresar a la bodega con retroalimentación.

- [ ] **Step 4: Ejecutar pruebas de UI**

```bash
npm test src/__tests__/recepcion-prestamos-ui.test.tsx
```

- [ ] **Step 5: Commit**

```bash
git add src/modules/orden-salida/components/orden-salida-form.tsx src/app/\(app\)/orden-entrada/recepcion-prestamos/page.tsx src/modules/orden-entrada/components/recepcion-prestamo-view.tsx src/__tests__/recepcion-prestamos-ui.test.tsx
git commit -m "feat(ui): vistas de recepcion de prestamos y confirmacion sanitaria en salidas"
```

---

### Task 8: Verificación Completa de la Suite y Build

**Files:**
- Suite de pruebas de Vitest
- Linter y TypeScript compiler

- [ ] **Step 1: Ejecutar suite de pruebas completa**

```bash
npm test
```
Expected: Todas las pruebas unitarias y de integración pasando (100% verde).

- [ ] **Step 2: Verificar tipos de TypeScript**

```bash
npx tsc --noEmit
```
Expected: 0 errores de compilación.

- [ ] **Step 3: Ejecutar linter**

```bash
npm run lint
```
Expected: Sin warnings ni errores de ESLint.

- [ ] **Step 4: Ejecutar build de producción**

```bash
npm run build
```
Expected: Compilación exitosa de Next.js.
