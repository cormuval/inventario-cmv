# Plan de Implementación: Bloqueo de Lotes Caducados y Flujo Exclusivo de Merma

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Implementar el control sanitario estricto que prohíbe despachar o registrar salidas clínicas ordinarias ("Consumo Interno" y "A Otros Centros") de productos con lotes vencidos, habilitando exclusivamente el tipo de salida "Merma" con justificación obligatoria, alerta visual máxima en stock y un producto de prueba para verificar las restricciones.

**Architecture:** La solución se basa en una validación multi-capa: (1) utilidades puras de lógica sanitaria y clasificación de alertas (`movimientos.ts`), (2) validación estricta de payloads con Zod (`orden-salida.schema.ts`), (3) protección atómica en transacciones de Server Actions con rollback (`orden-salida.action.ts`), (4) adaptación dinámica de la interfaz de usuario para inhabilitar caducados en salidas regulares (`orden-salida-detalles-field.tsx` y `stock-table.tsx`), y (5) script de seed para producto de prueba con lotes vencidos y vigentes.

**Tech Stack:** Next.js 15 (App Router, Server Actions), React 19, TypeScript, Zod, Prisma ORM, Vitest, Tailwind CSS + shadcn/ui.

**Spec:** [`docs/specs/procedimiento-bloqueo-caducados-y-mermas.md`](file:///c:/Users/benja/OneDrive/Escritorio/inventario-cmv-main/docs/specs/procedimiento-bloqueo-caducados-y-mermas.md)

## Global Constraints

- Prohibido cualquier salida clínica ("Consumo Interno", "A Otros Centros") de un lote cuya `fechaCaducidad <= hoy`.
- La única salida admisible para un lote vencido es `tipoSalida === "Merma"`.
- En salidas tipo "Merma", el campo de justificación/destino es obligatorio y descriptivo ($\ge 5$ caracteres).
- No permitir editar un detalle de salida para asignar un lote vencido si la orden no es de Merma.
- Mantener la suite de tests existente pasando al 100% (`npx vitest run`).
- Idioma en español para código de negocio, mensajes de error y comentarios.

---

### Task 1: Utilidades de Negocio Sanitario y Alerta de Caducidad

**Files:**
- Modify: `src/modules/stock/utils/movimientos.ts:13-63`
- Modify: `src/modules/stock/actions/stock.action.ts:213-219`
- Test: `src/__tests__/movimientos.test.ts`

**Interfaces:**
- Consumes: `StockAlertaInput`, `Date`
- Produces: 
  - `StockAlerta`: unión extendida `"sin_stock" | "caducado" | "stock_minimo" | "caducidad_proxima" | "ok"`
  - `esLoteCaducado(fechaCaducidad: Date, hoy?: Date): boolean`
  - `validarSalidaLoteCaducado(tipoSalida: string, fechaCaducidad: Date, hoy?: Date): { valido: boolean; motivo?: string }`

- [ ] **Step 1: Escribir pruebas unitarias que fallen en `movimientos.test.ts`**

Agregar pruebas para verificar:
1. `evaluarAlertaStock` retorna `"caducado"` cuando `fechaCaducidad <= hoy` y `cantidadDisponible > 0`.
2. `esLoteCaducado` retorna `true` para fechas pasadas y `false` para fechas futuras.
3. `validarSalidaLoteCaducado` rechaza salida para `"Consumo Interno"` con lote caducado, y la aprueba si `tipoSalida === "Merma"`.

```typescript
describe("alertas sanitarias y validacion de caducados", () => {
    const hoy = new Date(2026, 6, 20, 12);

    it("clasifica como 'caducado' un lote con fecha pasada y existencia disponible", () => {
        expect(evaluarAlertaStock({
            cantidadDisponible: 10,
            stockMinimo: 5,
            fechaCaducidad: new Date(2026, 6, 19),
            hoy
        })).toBe("caducado");
    });

    it("detecta si un lote esta caducado", () => {
        expect(esLoteCaducado(new Date(2026, 6, 19), hoy)).toBe(true);
        expect(esLoteCaducado(new Date(2026, 6, 20), hoy)).toBe(true);
        expect(esLoteCaducado(new Date(2026, 6, 21), hoy)).toBe(false);
    });

    it("valida salidas permitiendo solo Merma en lotes caducados", () => {
        const fechaCaducada = new Date(2026, 6, 19);
        const fechaVigente = new Date(2026, 8, 20);

        expect(validarSalidaLoteCaducado("Consumo Interno", fechaCaducada, hoy).valido).toBe(false);
        expect(validarSalidaLoteCaducado("A Otros Centros", fechaCaducada, hoy).valido).toBe(false);
        expect(validarSalidaLoteCaducado("Merma", fechaCaducada, hoy).valido).toBe(true);
        expect(validarSalidaLoteCaducado("Consumo Interno", fechaVigente, hoy).valido).toBe(true);
    });
});
```

- [ ] **Step 2: Ejecutar el test para verificar que falla**

Run: `npx vitest run src/__tests__/movimientos.test.ts`
Expected: FAIL con errores de tipo o funciones no definidas.

- [ ] **Step 3: Implementar la lógica en `movimientos.ts` y actualizar `stock.action.ts`**

En `src/modules/stock/utils/movimientos.ts`:
1. Agregar `"caducado"` a `StockAlerta`.
2. Actualizar `evaluarAlertaStock`:
   ```typescript
   export function evaluarAlertaStock(input: StockAlertaInput): StockAlerta {
       if (input.cantidadDisponible <= 0) {
           return "sin_stock";
       }

       const hoy = soloFecha(input.hoy ?? new Date()).getTime();
       const caducidad = soloFecha(input.fechaCaducidad).getTime();
       const diasRestantes = Math.ceil((caducidad - hoy) / (24 * 60 * 60 * 1000));

       if (diasRestantes <= 0) {
           return "caducado";
       }

       if (input.cantidadDisponible <= input.stockMinimo) {
           return "stock_minimo";
       }

       if (diasRestantes >= 1 && diasRestantes <= DIAS_ALERTA_CADUCIDAD[0]) {
           return "caducidad_proxima";
       }

       return "ok";
   }

   export function esLoteCaducado(fechaCaducidad: Date, hoy: Date = new Date()): boolean {
       const hoyNormalizado = soloFecha(hoy).getTime();
       const caducidadNormalizada = soloFecha(fechaCaducidad).getTime();
       return caducidadNormalizada <= hoyNormalizado;
   }

   export function validarSalidaLoteCaducado(
       tipoSalida: string,
       fechaCaducidad: Date,
       hoy: Date = new Date()
   ): { valido: boolean; motivo?: string } {
       const caducado = esLoteCaducado(fechaCaducidad, hoy);
       if (caducado && tipoSalida.trim().toLowerCase() !== "merma") {
           return {
               valido: false,
               motivo: "El lote seleccionado se encuentra caducado. Solo puede egresar mediante el tipo de salida 'Merma'."
           };
       }
       return { valido: true };
   }
   ```
3. En `src/modules/stock/actions/stock.action.ts`, añadir `caducado: 1` a `alertaPeso`.

- [ ] **Step 4: Ejecutar el test para verificar que pasa**

Run: `npx vitest run src/__tests__/movimientos.test.ts`
Expected: PASS (todos los tests pasan).

---

### Task 2: Validación Zod Condicionada en Esquema de Orden de Salida

**Files:**
- Modify: `src/modules/orden-salida/schemas/orden-salida.schema.ts`
- Test: `src/__tests__/orden-salida-schema.test.ts`

**Interfaces:**
- Consumes: `crearOrdenSalidaSchema`, `esLoteCaducado`
- Produces: `CrearOrdenSalidaInput` validado con rechazo sanitario para salidas no-Merma con productos vencidos y justificación obligatoria en Merma.

- [ ] **Step 1: Escribir test unitario que falle para `orden-salida.schema.ts`**

Crear `src/__tests__/orden-salida-schema.test.ts`:

```typescript
import { describe, expect, it } from "vitest";
import { crearOrdenSalidaSchema } from "@/modules/orden-salida/schemas/orden-salida.schema";

describe("crearOrdenSalidaSchema - validaciones sanitarias", () => {
    const hoy = new Date();
    const ayer = new Date(Date.now() - 24 * 60 * 60 * 1000);
    const manana = new Date(Date.now() + 24 * 60 * 60 * 1000);

    it("rechaza salida 'Consumo Interno' si contiene un lote caducado", () => {
        const payload = {
            fecha: hoy,
            bodegaId: "bodega-1",
            centroId: "centro-1",
            tipoSalida: "Consumo Interno",
            destino: "Box 3 CESFAM",
            detalles: [{
                productoId: 1,
                cantidad: 5,
                lote: "LOT-CADUCADO",
                fechaCaducidad: ayer
            }]
        };

        const result = crearOrdenSalidaSchema.safeParse(payload);
        expect(result.success).toBe(false);
        if (!result.success) {
            expect(result.error.issues[0]?.message).toMatch(/caducado/i);
        }
    });

    it("permite salida 'Merma' con lote caducado si incluye justificacion en destino", () => {
        const payload = {
            fecha: hoy,
            bodegaId: "bodega-1",
            centroId: "centro-1",
            tipoSalida: "Merma",
            destino: "Baja sanitaria por vencimiento en estante",
            detalles: [{
                productoId: 1,
                cantidad: 5,
                lote: "LOT-CADUCADO",
                fechaCaducidad: ayer
            }]
        };

        const result = crearOrdenSalidaSchema.safeParse(payload);
        expect(result.success).toBe(true);
    });

    it("rechaza salida 'Merma' si el destino/justificacion es demasiado corto o vacio", () => {
        const payload = {
            fecha: hoy,
            bodegaId: "bodega-1",
            centroId: "centro-1",
            tipoSalida: "Merma",
            destino: "baja",
            detalles: [{
                productoId: 1,
                cantidad: 5,
                lote: "LOT-CADUCADO",
                fechaCaducidad: ayer
            }]
        };

        const result = crearOrdenSalidaSchema.safeParse(payload);
        expect(result.success).toBe(false);
        if (!result.success) {
            expect(result.error.issues[0]?.message).toMatch(/justificaci[oó]n/i);
        }
    });
});
```

- [ ] **Step 2: Ejecutar el test para verificar que falla**

Run: `npx vitest run src/__tests__/orden-salida-schema.test.ts`
Expected: FAIL.

- [ ] **Step 3: Implementar validación `.superRefine` en `orden-salida.schema.ts`**

En `src/modules/orden-salida/schemas/orden-salida.schema.ts`:
```typescript
import { z } from "zod";
import { validarFechaSalida, esLoteCaducado } from "@/modules/stock/utils/movimientos";

export const ordenSalidaDetalleSchema = z.object({
    productoId: z.coerce.number().int().positive(),
    cantidad: z.coerce.number().int().positive("La cantidad debe ser positiva."),
    lote: z.string().trim().min(3, "El lote debe tener al menos 3 caracteres."),
    fechaCaducidad: z.coerce.date()
});

export const crearOrdenSalidaSchema = z.object({
    fecha: z.coerce.date().refine((fecha) => validarFechaSalida(fecha), {
        message: "La fecha debe estar entre hoy y los ultimos 7 dias."
    }),
    bodegaId: z.string().min(1),
    centroId: z.string().min(1),
    tipoSalida: z.string().min(1),
    destino: z.string().min(1),
    codigoSalida: z.string().optional(),
    correoDestino: z.string().email().optional().or(z.literal("")),
    detalles: z.array(ordenSalidaDetalleSchema).min(1, "Debe ingresar al menos un detalle.")
}).superRefine((data, ctx) => {
    const esMerma = data.tipoSalida.trim().toLowerCase() === "merma";

    if (esMerma) {
        if (data.destino.trim().length < 5) {
            ctx.addIssue({
                code: z.ZodIssueCode.custom,
                message: "Para registrar una salida por Merma se requiere una justificación detallada de al menos 5 caracteres.",
                path: ["destino"]
            });
        }
    } else {
        data.detalles.forEach((detalle, index) => {
            if (esLoteCaducado(detalle.fechaCaducidad)) {
                ctx.addIssue({
                    code: z.ZodIssueCode.custom,
                    message: `El lote "${detalle.lote}" se encuentra caducado. Solo puede ser retirado mediante el tipo de salida "Merma".`,
                    path: ["detalles", index, "fechaCaducidad"]
                });
            }
        });
    }
});
```

- [ ] **Step 4: Ejecutar el test para verificar que pasa**

Run: `npx vitest run src/__tests__/orden-salida-schema.test.ts`
Expected: PASS.

---

### Task 3: Protección Backend en Server Actions y Auditoría Sanitaria

**Files:**
- Modify: `src/modules/orden-salida/actions/orden-salida.action.ts:58-185`

**Interfaces:**
- Consumes: `crearOrdenSalida`, `actualizarDetalleSalida`, `validarSalidaLoteCaducado`
- Produces: Protección atómica con rollback transaccional si se intenta salida no-Merma de un lote caducado, y registro en `AuditLogger` con tipificación de merma.

- [ ] **Step 1: Aplicar verificación en `crearOrdenSalida`, `descontarStock` y `actualizarDetalleSalida`**

En `src/modules/orden-salida/actions/orden-salida.action.ts`:
1. Importar `esLoteCaducado`, `validarSalidaLoteCaducado` desde `@/modules/stock/utils/movimientos`.
2. En `descontarStock`, verificar que si `stock.fechaCaducidad` es caducado, la orden origen sea de tipo `Merma`:
   ```typescript
   async function descontarStock(
       tx: Tx,
       input: { productoId: number; bodegaId: string; cantidad: number; lote: string; fechaCaducidad: Date; tipoSalida: string }
   ): Promise<void> {
       const stock = await tx.stock.findUnique({
           where: {
               stock_lote_unico: {
                   productoId: input.productoId,
                   bodegaId: input.bodegaId,
                   lote: input.lote,
                   fechaCaducidad: input.fechaCaducidad
               }
           }
       });

       if (!stock || stock.cantidadDisponible < input.cantidad) {
           throw new Error("Stock insuficiente para el producto, lote y bodega seleccionados.");
       }

       const validacion = validarSalidaLoteCaducado(input.tipoSalida, stock.fechaCaducidad);
       if (!validacion.valido) {
           throw new Error(validacion.motivo);
       }

       await tx.stock.update({
           where: { id: stock.id },
           data: {
               cantidadDisponible: { decrement: input.cantidad },
               fechaUltimaActualizacion: new Date()
           }
       });
   }
   ```
3. En `actualizarDetalleSalida`, verificar que no se modifique una salida ordinaria asignándole un lote caducado a menos que la orden sea de `Merma`.
4. En `AuditLogger.log`, registrar el campo `tipoSalida` y si hubo lotes caducados dados de baja para trazabilidad sanitaria.

- [ ] **Step 2: Ejecutar los tests existentes para asegurar que no hay regresiones**

Run: `npx vitest run src/__tests__/movimientos.test.ts src/__tests__/orden-salida-schema.test.ts`
Expected: PASS.

---

### Task 4: Adaptación Dinámica de la Interfaz (Formulario de Salida y Stock)

**Files:**
- Modify: `src/modules/orden-salida/components/orden-salida-form.tsx:75-95`
- Modify: `src/modules/orden-salida/components/orden-salida-detalles-field.tsx:30-110`
- Modify: `src/modules/stock/components/stock-table.tsx:65-155`

**Interfaces:**
- Consumes: `tipoSalida` seleccionado en el formulario
- Produces:
  - `OrdenSalidaDetallesField` filtrando lotes caducados en modo clínico y resaltándolos en modo Merma con prefijo `[CADUCADO]`.
  - Etiqueta dinámica de "Destino" $\rightarrow$ "Destino / Justificación Sanitaria (Obligatorio)" cuando `tipoSalida === "Merma"`.
  - `StockTable` con badge rojo `"Caducado (Merma)"` para `alerta === "caducado"`.

- [ ] **Step 1: Modificar `orden-salida-form.tsx` para sincronizar `tipoSalida` con el campo de detalles**

En `orden-salida-form.tsx`:
1. Mantener un estado local `tipoSalida` con valor inicial `"Consumo Interno"`.
2. Actualizar el estado en el evento `onChange` del select de `tipoSalida`.
3. Pasar `tipoSalida={tipoSalida}` a `<OrdenSalidaDetallesField />`.
4. Cambiar el label de Destino condicionalmente:
   `<span>{tipoSalida === "Merma" ? "Destino / Justificación Sanitaria de la Merma *" : "Destino"}</span>`
   y el placeholder:
   `placeholder={tipoSalida === "Merma" ? "Ej: Vencimiento en estante / Rotura de frasco" : "Unidad o centro destino"}`.

- [ ] **Step 2: Modificar `orden-salida-detalles-field.tsx` para filtrar u ordenar según `tipoSalida`**

En `orden-salida-detalles-field.tsx`:
1. Recibir `tipoSalida: string` en las props.
2. Usar `esLoteCaducado` para clasificar las opciones:
   - Si `tipoSalida !== "Merma"`: filtrar `!esLoteCaducado(stock.fechaCaducidad)`. Los caducados no aparecen en la lista.
   - Si `tipoSalida === "Merma"`: mostrar todos los stocks, pero para los caducados anteponer `[CADUCADO] ` al label del stock para identificación visual clara.

- [ ] **Step 3: Modificar `stock-table.tsx` para incorporar el badge de Caducado**

En `stock-table.tsx`:
1. En `alertaTone(alerta)`: si `alerta === "caducado"`, retornar `"danger"`.
2. En `alertaLabel(alerta)`: si `alerta === "caducado"`, retornar `"Caducado (Merma)"`.
3. En el modal de lotes individuales, si `lote.fechaCaducidad <= hoy`, mostrar un badge pequeño `<Badge tone="danger">Vencido</Badge>`.

---

### Task 5: Producto de Prueba para Verificación Interactiva (Semilla / Script de Test)

**Files:**
- Create: `prisma/seed-test-caducado.ts`
- Modify: `package.json` (agregar script `db:seed:test-caducado`)

**Interfaces:**
- Produces:
  - Producto ID 999: `"Paracetamol 500mg (TEST CONTROL SANITARIO)"`
  - Lote `TEST-CAD-01`: vencido hace 30 días, 50 unidades en Bodega Clínica.
  - Lote `TEST-VIG-02`: vence en 1 año, 50 unidades en Bodega Clínica.

- [ ] **Step 1: Crear `prisma/seed-test-caducado.ts`**

```typescript
import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();

async function main(): Promise<void> {
    const bodega = await prisma.bodega.findFirstOrThrow({
        where: { id: "bodega-clinica" }
    });

    const productoTest = await prisma.producto.upsert({
        where: { id: 999 },
        update: {
            linea: "CLINICO",
            descripcion: "Paracetamol 500mg (TEST CONTROL SANITARIO)",
            estado: true
        },
        create: {
            id: 999,
            linea: "CLINICO",
            descripcion: "Paracetamol 500mg (TEST CONTROL SANITARIO)",
            estado: true
        }
    });

    const hoy = new Date();
    const fechaAyer = new Date(hoy);
    fechaAyer.setDate(fechaAyer.getDate() - 30);
    fechaAyer.setHours(0, 0, 0, 0);

    const fechaFutura = new Date(hoy);
    fechaFutura.setFullYear(fechaFutura.getFullYear() + 1);
    fechaFutura.setHours(0, 0, 0, 0);

    // Lote Caducado
    await prisma.stock.upsert({
        where: {
            stock_lote_unico: {
                productoId: productoTest.id,
                bodegaId: bodega.id,
                lote: "TEST-CAD-01",
                fechaCaducidad: fechaAyer
            }
        },
        update: { cantidadDisponible: 50, fechaCaducidad: fechaAyer },
        create: {
            productoId: productoTest.id,
            bodegaId: bodega.id,
            lote: "TEST-CAD-01",
            fechaCaducidad: fechaAyer,
            cantidadDisponible: 50,
            stockMinimo: 5
        }
    });

    // Lote Vigente
    await prisma.stock.upsert({
        where: {
            stock_lote_unico: {
                productoId: productoTest.id,
                bodegaId: bodega.id,
                lote: "TEST-VIG-02",
                fechaCaducidad: fechaFutura
            }
        },
        update: { cantidadDisponible: 50, fechaCaducidad: fechaFutura },
        create: {
            productoId: productoTest.id,
            bodegaId: bodega.id,
            lote: "TEST-VIG-02",
            fechaCaducidad: fechaFutura,
            cantidadDisponible: 50,
            stockMinimo: 5
        }
    });

    console.log("Producto de prueba sanitario creado exitosamente con Lote Caducado y Vigente.");
}

main()
    .catch(console.error)
    .finally(() => prisma.$disconnect());
```

- [ ] **Step 2: Ejecutar el script para sembrar el producto de prueba**

Run: `npx tsx prisma/seed-test-caducado.ts`
Expected: "Producto de prueba sanitario creado exitosamente con Lote Caducado y Vigente."

---

### Task 6: Verificación Integral del Protocolo y Pase a Demostración

**Files:**
- Test: `npx vitest run`
- Manual Verification en navegador (`http://localhost:3000`)

- [ ] **Step 1: Ejecutar la suite completa de tests automatizados**

Run: `npx vitest run`
Expected: Todos los archivos de prueba pasando (`movimientos.test.ts`, `orden-salida-schema.test.ts`, `auth-dominio.test.ts`, `producto-form.test.tsx`).

- [ ] **Step 2: Ejecutar verificación del caso TC-01 (Entrada de lote caducado)**

Ir a `/orden-entrada`: Intentar ingresar un producto con fecha de vencimiento anterior a hoy.
Resultado esperado: Formulario bloqueado con mensaje *"La caducidad no puede ser anterior a hoy."*

- [ ] **Step 3: Ejecutar verificación del caso TC-02 (Salida clínica de lote caducado)**

Ir a `/orden-salida`: Seleccionar "Consumo Interno". Verificar que el lote `TEST-CAD-01` no aparece disponible en el selector de existencias.

- [ ] **Step 4: Ejecutar verificación del caso TC-03 y TC-04 (Salida Merma)**

Ir a `/orden-salida`: Seleccionar "Merma". Verificar que `TEST-CAD-01` aparece rotulado como `[CADUCADO]`. Intentar enviar sin justificación $\rightarrow$ Error de validación. Enviar con justificación *"Baja por vencimiento en estantería"* $\rightarrow$ Orden registrada con éxito y stock descontado.
