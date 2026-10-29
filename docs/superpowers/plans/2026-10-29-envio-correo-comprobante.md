# Envío del comprobante de salida por correo — Plan de implementación

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Enviar el comprobante PDF de la orden de salida por correo (Resend): automáticamente al registrarla si tiene `correoDestino`, y a pedido desde el historial, dejando el estado del envío en la orden y en la auditoría.

**Architecture:**
- **`src/shared/lib/correo.ts`:** servicio genérico, el único que conoce el SDK `resend`. Nunca lanza excepciones; sin clave, omite el envío.
- **`src/modules/orden-salida/utils/correo-comprobante.ts`:** arma el correo con una función pura.
- **`src/modules/orden-salida/utils/envio-comprobante.ts`:** orquesta carga de la orden, alcance, PDF, envío, actualización del estado y auditoría.
- **Server Actions:** `crearOrdenSalida` y la nueva `reenviarComprobanteSalidaAction` usan ese orquestador.

**Tech Stack:** Next.js 15 (Server Actions), Prisma 6 + MySQL 8.4 (migraciones), SDK `resend`, pdfkit (existente), Zod v3, Vitest + Testing Library.

**Spec:** `docs/superpowers/specs/2026-10-29-envio-correo-comprobante-design.md`

## Global Constraints

- **Convenciones:**
  - Idioma español en UI, comentarios y commits. Indentación de 4 espacios.
  - TypeScript strict con tipos explícitos.
  - Imports agrupados con comentarios (`// lib`, `// components`, …). Alias `@/` → `src/`.
- **Sin `console.log`.**
- **Módulos de servidor:** los que no son acciones (`correo.ts`, `correo-comprobante.ts`, `envio-comprobante.ts`) **no** llevan `"use server"`.
- **Variables:**
  - `RESEND_API_KEY`: sin ella no se envía nada.
  - `CORREO_REMITENTE`: por defecto `Inventario CMV <inventario@cmvalparaiso.cl>`.
- **Seguridad:** nunca imprimir ni commitear `RESEND_API_KEY`. `.env` está en `.gitignore`.
- **Auditoría:** `accion: "enviar_correo"`, `entidad: "OrdenSalida"`, `detalle.resultado ∈ "enviado" | "fallido" | "omitido"`.
- **Columnas nuevas:** `Fecha_Envio_Correo` (`DateTime?`) y `Error_Envio_Correo` (`VarChar(500)`, se trunca a 500). `Enviar_Correo` (existente) significa "último envío exitoso".
- **Un fallo de correo nunca revierte ni hace fallar el registro de la salida.**
- **Esquema:** todo cambio en `prisma/schema.prisma` va con su migración (`npm run db:migrate -- --name <nombre>`). Nunca `db:push`.
- **Tests:** Node 22 vía `export PATH=~/.local/bin:$PATH`. Comando por archivo: `npx vitest run <ruta>`.
- **Commits:** terminan con:
  ```
  Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>
  Claude-Session: https://claude.ai/code/session_01SXAWNMvQLd1YzkWQdLacdV
  ```

## Mapa de archivos

| Archivo | Acción | Responsabilidad |
|---|---|---|
| `package.json` | Modificar | Dependencia `resend` |
| `src/shared/lib/correo.ts` | Crear | `enviarCorreo()`, tipos `CorreoInput`, `ResultadoCorreo` |
| `src/modules/orden-salida/utils/correo-comprobante.ts` | Crear | `construirCorreoComprobante()` |
| `prisma/schema.prisma` + `prisma/migrations/*_correo_comprobante_salida/` | Modificar / Crear | Columnas de estado del envío |
| `src/modules/orden-salida/utils/envio-comprobante.ts` | Crear | `cargarOrdenParaComprobante()`, `enviarComprobanteSalida()` |
| `src/shared/types/action-state.ts` | Modificar | `advertencia?: string` |
| `src/modules/orden-salida/schemas/orden-salida.schema.ts` | Modificar | `reenvioComprobanteSchema` |
| `src/modules/orden-salida/actions/orden-salida.action.ts` | Modificar | Envío en `crearOrdenSalida`, `reenviarComprobanteSalidaAction`, refactor de la descarga |
| `src/modules/orden-salida/components/orden-salida-form.tsx` | Modificar | Muestra `advertencia` |
| `src/modules/orden-salida/components/estado-correo-badge.tsx` | Crear | Badge Enviado / Falló / Sin envío |
| `src/modules/orden-salida/components/boton-enviar-comprobante.tsx` | Crear | Modal de reenvío |
| `src/app/orden-salida/page.tsx` | Modificar | Columna "Correo" y botón en el historial |
| `src/modules/auditoria/schemas/auditoria.schema.ts`, `components/auditoria-filtros.tsx`, `components/auditoria-tabla.tsx` | Modificar | Acción `enviar_correo` filtrable y legible |
| `.env.example`, `docs/guias/deploy-produccion.md` | Modificar | Documentar variables |

---

### Task 1: Servicio de correo compartido (`correo.ts`)

**Files:**
- Modify: `package.json` (vía `npm install resend`)
- Create: `src/shared/lib/correo.ts`
- Modify: `.env.example`
- Test: `src/__tests__/correo.test.ts`

**Interfaces:**
- Produces:
  ```ts
  export interface AdjuntoCorreo { nombre: string; contenido: Buffer }
  export interface CorreoInput { para: string | string[]; asunto: string; html: string; texto: string; responderA?: string; adjuntos?: AdjuntoCorreo[] }
  export type ResultadoCorreo = { ok: true; id: string } | { ok: false; error: string; omitido?: boolean };
  export async function enviarCorreo(input: CorreoInput): Promise<ResultadoCorreo>
  ```

- [ ] **Step 1: Instalar el SDK**

Run: `export PATH=~/.local/bin:$PATH && npm install resend`
Expected: `resend` aparece en `dependencies` de `package.json`.

- [ ] **Step 2: Escribir el test que falla**

`src/__tests__/correo.test.ts`:
```ts
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const { sendMock } = vi.hoisted(() => ({ sendMock: vi.fn() }));

vi.mock("resend", () => ({
    Resend: vi.fn().mockImplementation(() => ({ emails: { send: sendMock } }))
}));

import { enviarCorreo } from "@/shared/lib/correo";

const correoBase = {
    para: "destino@cmvalparaiso.cl",
    asunto: "Asunto",
    html: "<p>Hola</p>",
    texto: "Hola"
};

describe("enviarCorreo", () => {
    beforeEach(() => {
        vi.clearAllMocks();
        vi.stubEnv("RESEND_API_KEY", "re_test");
        vi.stubEnv("CORREO_REMITENTE", "");
    });

    afterEach(() => {
        vi.unstubAllEnvs();
    });

    it("omite el envío cuando no hay RESEND_API_KEY", async () => {
        vi.stubEnv("RESEND_API_KEY", "");

        const resultado = await enviarCorreo(correoBase);

        expect(resultado).toEqual({ ok: false, omitido: true, error: "Envío de correo no configurado" });
        expect(sendMock).not.toHaveBeenCalled();
    });

    it("envía con el remitente por defecto y devuelve el id de Resend", async () => {
        sendMock.mockResolvedValue({ data: { id: "email-123" }, error: null });

        const resultado = await enviarCorreo({ ...correoBase, responderA: "emisor@cmvalparaiso.cl" });

        expect(resultado).toEqual({ ok: true, id: "email-123" });
        expect(sendMock).toHaveBeenCalledWith({
            from: "Inventario CMV <inventario@cmvalparaiso.cl>",
            to: "destino@cmvalparaiso.cl",
            subject: "Asunto",
            html: "<p>Hola</p>",
            text: "Hola",
            replyTo: "emisor@cmvalparaiso.cl"
        });
    });

    it("usa CORREO_REMITENTE y mapea los adjuntos al formato de Resend", async () => {
        vi.stubEnv("CORREO_REMITENTE", "Pruebas <pruebas@cmvalparaiso.cl>");
        sendMock.mockResolvedValue({ data: { id: "email-456" }, error: null });
        const pdf = Buffer.from("pdf");

        await enviarCorreo({ ...correoBase, adjuntos: [{ nombre: "comprobante.pdf", contenido: pdf }] });

        expect(sendMock).toHaveBeenCalledWith(
            expect.objectContaining({
                from: "Pruebas <pruebas@cmvalparaiso.cl>",
                attachments: [{ filename: "comprobante.pdf", content: pdf }]
            })
        );
    });

    it("devuelve ok false cuando Resend responde con error", async () => {
        sendMock.mockResolvedValue({ data: null, error: { name: "validation_error", message: "Dominio no verificado" } });

        const resultado = await enviarCorreo(correoBase);

        expect(resultado).toEqual({ ok: false, error: "Dominio no verificado" });
    });

    it("devuelve ok false cuando el SDK lanza una excepción de red", async () => {
        sendMock.mockRejectedValue(new Error("fetch failed"));

        const resultado = await enviarCorreo(correoBase);

        expect(resultado).toEqual({ ok: false, error: "fetch failed" });
    });
});
```

- [ ] **Step 3: Verificar que falla**

Run: `export PATH=~/.local/bin:$PATH && npx vitest run src/__tests__/correo.test.ts`
Expected: FAIL (`Failed to resolve import "@/shared/lib/correo"`).

- [ ] **Step 4: Implementar `src/shared/lib/correo.ts`**

```ts
// lib
import { Resend } from "resend";

const REMITENTE_POR_DEFECTO = "Inventario CMV <inventario@cmvalparaiso.cl>";

export interface AdjuntoCorreo {
    nombre: string;
    contenido: Buffer;
}

export interface CorreoInput {
    para: string | string[];
    asunto: string;
    html: string;
    texto: string;
    responderA?: string;
    adjuntos?: AdjuntoCorreo[];
}

export type ResultadoCorreo = { ok: true; id: string } | { ok: false; error: string; omitido?: boolean };

let cliente: Resend | null = null;

function obtenerCliente(apiKey: string): Resend {
    if (!cliente) {
        cliente = new Resend(apiKey);
    }
    return cliente;
}

/**
 * Envía un correo con Resend. Nunca lanza: los errores del SDK o de red se devuelven como `ok: false`.
 * Sin `RESEND_API_KEY` (CI, tests, local sin clave) el envío se omite.
 */
export async function enviarCorreo(input: CorreoInput): Promise<ResultadoCorreo> {
    const apiKey = process.env.RESEND_API_KEY;
    if (!apiKey) {
        return { ok: false, omitido: true, error: "Envío de correo no configurado" };
    }

    try {
        const { data, error } = await obtenerCliente(apiKey).emails.send({
            from: process.env.CORREO_REMITENTE || REMITENTE_POR_DEFECTO,
            to: input.para,
            subject: input.asunto,
            html: input.html,
            text: input.texto,
            ...(input.responderA ? { replyTo: input.responderA } : {}),
            ...(input.adjuntos?.length
                ? { attachments: input.adjuntos.map((adjunto) => ({ filename: adjunto.nombre, content: adjunto.contenido })) }
                : {})
        });

        if (error || !data) {
            return { ok: false, error: error?.message ?? "Resend no devolvió respuesta" };
        }

        return { ok: true, id: data.id };
    } catch (error) {
        return { ok: false, error: error instanceof Error ? error.message : "Error desconocido al enviar el correo" };
    }
}
```

- [ ] **Step 5: Verificar que pasa**

Run: `export PATH=~/.local/bin:$PATH && npx vitest run src/__tests__/correo.test.ts`
Expected: PASS (5 tests).

- [ ] **Step 6: Documentar las variables en `.env.example`** (agregar al final)

```
# Envio de correos con Resend (sin clave no se envia nada; el dominio debe estar verificado en Resend)
RESEND_API_KEY=""
CORREO_REMITENTE="Inventario CMV <inventario@cmvalparaiso.cl>"
```

- [ ] **Step 7: Commit**

```bash
git add package.json package-lock.json src/shared/lib/correo.ts src/__tests__/correo.test.ts .env.example
git commit -m "feat(correo): servicio compartido de envio de correos con Resend"
```

---

### Task 2: Contenido del correo del comprobante (`correo-comprobante.ts`)

**Files:**
- Create: `src/modules/orden-salida/utils/correo-comprobante.ts`
- Test: `src/__tests__/correo-comprobante.test.ts`

**Interfaces:**
- Consumes:
  - `CorreoInput` de `@/shared/lib/correo` (Task 1).
  - `OrdenSalidaPDFData` de `@/modules/orden-salida/utils/pdf-comprobante` (existente).
  - `formatDate(value: Date | string): string` de `@/shared/utils/format`.
- Produces: `export function construirCorreoComprobante(orden: OrdenSalidaPDFData, pdf: Buffer, para: string): CorreoInput`

- [ ] **Step 1: Escribir el test que falla**

`src/__tests__/correo-comprobante.test.ts`:
```ts
import { describe, expect, it } from "vitest";
import { construirCorreoComprobante } from "@/modules/orden-salida/utils/correo-comprobante";
import type { OrdenSalidaPDFData } from "@/modules/orden-salida/utils/pdf-comprobante";

const orden: OrdenSalidaPDFData = {
    id: "sal-1",
    fecha: new Date("2026-10-29T12:00:00Z"),
    tipoSalida: "Consumo Interno",
    destino: "Box <1>",
    codigoSalida: null,
    centro: { nombre: "CESFAM Barón" },
    bodega: { nombre: "Bodega Farmacia" },
    bodegaDestino: null,
    usuario: { nombre: "Carla", apPaterno: "Rojas", email: "crojas@cmvalparaiso.cl" },
    detalles: [
        { id: "d1", cantidad: 5, lote: "L1", fechaCaducidad: new Date("2027-01-01"), producto: { descripcion: "Paracetamol" } },
        { id: "d2", cantidad: 2, lote: "L2", fechaCaducidad: new Date("2027-01-01"), producto: { descripcion: "Gasa" } }
    ]
};

describe("construirCorreoComprobante", () => {
    it("arma asunto, destinatario, respuesta al emisor y adjunto PDF", () => {
        const pdf = Buffer.from("pdf");

        const correo = construirCorreoComprobante(orden, pdf, "destino@cmvalparaiso.cl");

        expect(correo.para).toBe("destino@cmvalparaiso.cl");
        expect(correo.asunto).toBe("Comprobante de salida N° sal-1 — CESFAM Barón");
        expect(correo.responderA).toBe("crojas@cmvalparaiso.cl");
        expect(correo.adjuntos).toEqual([{ nombre: "comprobante-salida-sal-1.pdf", contenido: pdf }]);
    });

    it("incluye el resumen en texto y en HTML escapado", () => {
        const correo = construirCorreoComprobante(orden, Buffer.from("pdf"), "destino@cmvalparaiso.cl");

        expect(correo.texto).toContain("Bodega Farmacia");
        expect(correo.texto).toContain("Box <1>");
        expect(correo.texto).toContain("2 productos");
        expect(correo.texto).toContain("Carla Rojas");
        expect(correo.html).toContain("Box &lt;1&gt;");
        expect(correo.html).not.toContain("Box <1>");
    });

    it("usa la bodega destino como destino en traspasos", () => {
        const correo = construirCorreoComprobante(
            { ...orden, tipoSalida: "A otra bodega", bodegaDestino: { nombre: "Bodega Vacunatorio" } },
            Buffer.from("pdf"),
            "destino@cmvalparaiso.cl"
        );

        expect(correo.texto).toContain("Destino: Bodega Vacunatorio");
    });
});
```

- [ ] **Step 2: Verificar que falla**

Run: `export PATH=~/.local/bin:$PATH && npx vitest run src/__tests__/correo-comprobante.test.ts`
Expected: FAIL (módulo inexistente).

- [ ] **Step 3: Implementar `src/modules/orden-salida/utils/correo-comprobante.ts`**

```ts
// lib
import type { CorreoInput } from "@/shared/lib/correo";

// types
import type { OrdenSalidaPDFData } from "@/modules/orden-salida/utils/pdf-comprobante";

// utils
import { formatDate } from "@/shared/utils/format";

function escaparHtml(texto: string): string {
    return texto
        .replace(/&/g, "&amp;")
        .replace(/</g, "&lt;")
        .replace(/>/g, "&gt;")
        .replace(/"/g, "&quot;");
}

/** Arma el correo del comprobante de salida; el detalle completo va en el PDF adjunto. */
export function construirCorreoComprobante(orden: OrdenSalidaPDFData, pdf: Buffer, para: string): CorreoInput {
    const emisor = `${orden.usuario.nombre} ${orden.usuario.apPaterno ?? ""}`.trim();
    const destino = orden.bodegaDestino?.nombre ?? orden.destino;
    const cantidadLineas = orden.detalles.length;

    const filas: Array<[string, string]> = [
        ["Fecha", formatDate(orden.fecha)],
        ["Centro", orden.centro.nombre],
        ["Bodega de origen", orden.bodega.nombre],
        ["Tipo de salida", orden.tipoSalida],
        ["Destino", destino],
        ["Detalle", `${cantidadLineas} ${cantidadLineas === 1 ? "producto" : "productos"}`],
        ["Emitido por", `${emisor} (${orden.usuario.email})`]
    ];

    const texto = [
        `Comprobante de salida N° ${orden.id}`,
        "",
        ...filas.map(([etiqueta, valor]) => `${etiqueta}: ${valor}`),
        "",
        "Se adjunta el comprobante en PDF con el detalle de productos, lotes y cantidades.",
        "Para consultas, responda este correo."
    ].join("\n");

    const html = `
<div style="font-family: Arial, sans-serif; color: #0f172a; max-width: 560px;">
    <h2 style="color: #0f766e; margin: 0 0 12px;">Comprobante de salida N° ${escaparHtml(orden.id)}</h2>
    <table style="border-collapse: collapse; width: 100%; font-size: 14px;">
        ${filas
            .map(
                ([etiqueta, valor]) =>
                    `<tr><td style="padding: 6px 8px; color: #64748b; border-bottom: 1px solid #e2e8f0;">${escaparHtml(etiqueta)}</td><td style="padding: 6px 8px; border-bottom: 1px solid #e2e8f0;">${escaparHtml(valor)}</td></tr>`
            )
            .join("")}
    </table>
    <p style="font-size: 13px; color: #475569; margin-top: 16px;">Se adjunta el comprobante en PDF con el detalle de productos, lotes y cantidades. Para consultas, responda este correo.</p>
    <p style="font-size: 12px; color: #94a3b8;">Inventario APS — Corporación Municipal de Valparaíso</p>
</div>`.trim();

    return {
        para,
        asunto: `Comprobante de salida N° ${orden.id} — ${orden.centro.nombre}`,
        html,
        texto,
        responderA: orden.usuario.email,
        adjuntos: [{ nombre: `comprobante-salida-${orden.id}.pdf`, contenido: pdf }]
    };
}
```

- [ ] **Step 4: Verificar que pasa**

Run: `export PATH=~/.local/bin:$PATH && npx vitest run src/__tests__/correo-comprobante.test.ts`
Expected: PASS (3 tests).

- [ ] **Step 5: Commit**

```bash
git add src/modules/orden-salida/utils/correo-comprobante.ts src/__tests__/correo-comprobante.test.ts
git commit -m "feat(orden-salida): contenido del correo del comprobante de salida"
```

---

### Task 3: Migración y orquestador del envío (`envio-comprobante.ts`)

**Files:**
- Modify: `prisma/schema.prisma` (modelo `OrdenSalida`)
- Create: `prisma/migrations/<timestamp>_correo_comprobante_salida/migration.sql` (generada)
- Create: `src/modules/orden-salida/utils/envio-comprobante.ts`
- Test: `src/__tests__/envio-comprobante.test.ts`

**Interfaces:**
- Consumes:
  - `enviarCorreo` y `ResultadoCorreo` (Task 1).
  - `construirCorreoComprobante` (Task 2).
  - `generarComprobanteSalidaPDF(orden): Promise<Buffer>` y `validarCentroBodegaEnAlcance(centroId, bodegaId): Promise<void>` (existentes).
  - `AuditLogger.log(input)` (existente).
- Produces:
  ```ts
  export async function cargarOrdenParaComprobante(ordenId: string) // Promise<OrdenSalida con centro, bodega, bodegaDestino, usuario, detalles.producto | null>
  export interface EnvioComprobanteInput { ordenId: string; usuarioId: string; para: string; reenvio: boolean }
  export async function enviarComprobanteSalida(input: EnvioComprobanteInput): Promise<ResultadoCorreo>
  ```

- [ ] **Step 1: Agregar columnas al modelo `OrdenSalida`** en `prisma/schema.prisma`, justo después de `correoDestino`:

```prisma
    fechaEnvioCorreo DateTime?            @map("Fecha_Envio_Correo")
    errorEnvioCorreo String?              @map("Error_Envio_Correo") @db.VarChar(500)
```

- [ ] **Step 2: Generar la migración**

Run: `export PATH=~/.local/bin:$PATH && npm run services:up && npm run db:migrate -- --name correo_comprobante_salida`
Expected:
- Se crea `prisma/migrations/<timestamp>_correo_comprobante_salida/migration.sql`, con dos `ALTER TABLE \`OrdenSalida\` ADD COLUMN …`.
- Se regenera el Prisma Client.
- Si `migrate dev` reporta drift porque la base local se creó con `db:push`, ejecutar una vez `npx prisma migrate resolve --applied 0_init` y repetir.

Verificar con `cat prisma/migrations/*_correo_comprobante_salida/migration.sql` que **solo** agrega las dos columnas.

- [ ] **Step 3: Escribir el test que falla**

`src/__tests__/envio-comprobante.test.ts`:
```ts
import { beforeEach, describe, expect, it, vi } from "vitest";

// lib
import { enviarCorreo } from "@/shared/lib/correo";
import { validarCentroBodegaEnAlcance } from "@/shared/lib/inventario-alcance";
import { AuditLogger } from "@/shared/lib/logger";
import { prisma } from "@/shared/lib/prisma";

// utils
import { enviarComprobanteSalida } from "@/modules/orden-salida/utils/envio-comprobante";

vi.mock("@/auth", () => ({ auth: vi.fn() }));
vi.mock("@/shared/lib/correo", () => ({ enviarCorreo: vi.fn() }));
vi.mock("@/shared/lib/logger", () => ({ AuditLogger: { log: vi.fn() } }));
vi.mock("@/shared/lib/inventario-alcance", () => ({ validarCentroBodegaEnAlcance: vi.fn() }));
vi.mock("@/modules/orden-salida/utils/pdf-comprobante", () => ({
    generarComprobanteSalidaPDF: vi.fn().mockResolvedValue(Buffer.from("pdf"))
}));
vi.mock("@/shared/lib/prisma", () => ({
    prisma: { ordenSalida: { findUnique: vi.fn(), update: vi.fn() } }
}));

const ordenCompleta = {
    id: "sal-1",
    fecha: new Date("2026-10-29T12:00:00Z"),
    tipoSalida: "Consumo Interno",
    destino: "Box 1",
    codigoSalida: null,
    centroId: "c-1",
    bodegaId: "b-1",
    centro: { nombre: "CESFAM Barón" },
    bodega: { nombre: "Bodega Farmacia" },
    bodegaDestino: null,
    usuario: { nombre: "Carla", apPaterno: "Rojas", email: "crojas@cmvalparaiso.cl" },
    detalles: []
};

const input = { ordenId: "sal-1", usuarioId: "u-1", para: "destino@cmvalparaiso.cl", reenvio: false };

describe("enviarComprobanteSalida", () => {
    beforeEach(() => {
        vi.clearAllMocks();
        vi.mocked(prisma.ordenSalida.findUnique).mockResolvedValue(ordenCompleta as never);
        vi.mocked(validarCentroBodegaEnAlcance).mockResolvedValue(undefined);
    });

    it("envía, marca la orden como enviada y audita el éxito", async () => {
        vi.mocked(enviarCorreo).mockResolvedValue({ ok: true, id: "email-1" });

        const resultado = await enviarComprobanteSalida(input);

        expect(resultado).toEqual({ ok: true, id: "email-1" });
        expect(validarCentroBodegaEnAlcance).toHaveBeenCalledWith("c-1", "b-1");
        expect(enviarCorreo).toHaveBeenCalledWith(
            expect.objectContaining({ para: "destino@cmvalparaiso.cl", asunto: expect.stringContaining("sal-1") })
        );
        expect(prisma.ordenSalida.update).toHaveBeenCalledWith({
            where: { id: "sal-1" },
            data: { enviarCorreo: true, fechaEnvioCorreo: expect.any(Date), errorEnvioCorreo: null }
        });
        expect(AuditLogger.log).toHaveBeenCalledWith({
            usuarioId: "u-1",
            centroId: "c-1",
            bodegaId: "b-1",
            accion: "enviar_correo",
            entidad: "OrdenSalida",
            entidadId: "sal-1",
            detalle: { para: "destino@cmvalparaiso.cl", reenvio: false, resultado: "enviado", resendId: "email-1" }
        });
    });

    it("registra el fallo truncado a 500 caracteres", async () => {
        const errorLargo = "x".repeat(600);
        vi.mocked(enviarCorreo).mockResolvedValue({ ok: false, error: errorLargo });

        const resultado = await enviarComprobanteSalida({ ...input, reenvio: true });

        expect(resultado.ok).toBe(false);
        expect(prisma.ordenSalida.update).toHaveBeenCalledWith({
            where: { id: "sal-1" },
            data: { enviarCorreo: false, fechaEnvioCorreo: expect.any(Date), errorEnvioCorreo: "x".repeat(500) }
        });
        expect(AuditLogger.log).toHaveBeenCalledWith(
            expect.objectContaining({
                detalle: { para: "destino@cmvalparaiso.cl", reenvio: true, resultado: "fallido", error: errorLargo }
            })
        );
    });

    it("cuando el envío se omite (sin clave) audita pero no modifica el estado de la orden", async () => {
        vi.mocked(enviarCorreo).mockResolvedValue({ ok: false, omitido: true, error: "Envío de correo no configurado" });

        await enviarComprobanteSalida(input);

        expect(prisma.ordenSalida.update).not.toHaveBeenCalled();
        expect(AuditLogger.log).toHaveBeenCalledWith(
            expect.objectContaining({ detalle: expect.objectContaining({ resultado: "omitido" }) })
        );
    });

    it("no envía ni audita si la orden no existe", async () => {
        vi.mocked(prisma.ordenSalida.findUnique).mockResolvedValue(null);

        const resultado = await enviarComprobanteSalida(input);

        expect(resultado).toEqual({ ok: false, error: "Orden de salida no encontrada" });
        expect(enviarCorreo).not.toHaveBeenCalled();
        expect(AuditLogger.log).not.toHaveBeenCalled();
    });

    it("no envía si la orden está fuera del alcance del usuario", async () => {
        vi.mocked(validarCentroBodegaEnAlcance).mockRejectedValue(
            new Error("No tienes permiso para operar en el centro o bodega seleccionada.")
        );

        const resultado = await enviarComprobanteSalida(input);

        expect(resultado).toEqual({ ok: false, error: "No tienes permiso para operar en el centro o bodega seleccionada." });
        expect(enviarCorreo).not.toHaveBeenCalled();
        expect(prisma.ordenSalida.update).not.toHaveBeenCalled();
    });
});
```

- [ ] **Step 4: Verificar que falla**

Run: `export PATH=~/.local/bin:$PATH && npx vitest run src/__tests__/envio-comprobante.test.ts`
Expected: FAIL (módulo inexistente).

- [ ] **Step 5: Implementar `src/modules/orden-salida/utils/envio-comprobante.ts`**

```ts
// lib
import { enviarCorreo, type ResultadoCorreo } from "@/shared/lib/correo";
import { validarCentroBodegaEnAlcance } from "@/shared/lib/inventario-alcance";
import { AuditLogger } from "@/shared/lib/logger";
import { prisma } from "@/shared/lib/prisma";

// utils
import { construirCorreoComprobante } from "@/modules/orden-salida/utils/correo-comprobante";
import { generarComprobanteSalidaPDF } from "@/modules/orden-salida/utils/pdf-comprobante";

const LARGO_MAXIMO_ERROR = 500;

export interface EnvioComprobanteInput {
    ordenId: string;
    usuarioId: string;
    para: string;
    reenvio: boolean;
}

/** Carga la orden con los datos que necesita el comprobante PDF (descarga y envío por correo). */
export async function cargarOrdenParaComprobante(ordenId: string) {
    return prisma.ordenSalida.findUnique({
        where: { id: ordenId },
        include: {
            centro: { select: { nombre: true } },
            bodega: { select: { nombre: true } },
            bodegaDestino: { select: { nombre: true } },
            usuario: { select: { nombre: true, apPaterno: true, email: true } },
            detalles: {
                include: {
                    producto: { select: { descripcion: true } }
                }
            }
        }
    });
}

/**
 * Genera el comprobante, lo envía por correo, deja el estado del último envío en la orden y audita el intento.
 * Solo devuelve errores: no lanza, para que el registro de la salida nunca falle por el correo.
 */
export async function enviarComprobanteSalida(input: EnvioComprobanteInput): Promise<ResultadoCorreo> {
    let orden: NonNullable<Awaited<ReturnType<typeof cargarOrdenParaComprobante>>>;
    try {
        const encontrada = await cargarOrdenParaComprobante(input.ordenId);
        if (!encontrada) {
            return { ok: false, error: "Orden de salida no encontrada" };
        }
        await validarCentroBodegaEnAlcance(encontrada.centroId, encontrada.bodegaId);
        orden = encontrada;
    } catch (error) {
        return { ok: false, error: error instanceof Error ? error.message : "No fue posible cargar la orden de salida" };
    }

    let resultado: ResultadoCorreo;
    try {
        const pdf = await generarComprobanteSalidaPDF(orden);
        resultado = await enviarCorreo(construirCorreoComprobante(orden, pdf, input.para));
    } catch (error) {
        resultado = { ok: false, error: error instanceof Error ? error.message : "Error al generar el comprobante" };
    }

    if (resultado.ok || !resultado.omitido) {
        await prisma.ordenSalida.update({
            where: { id: orden.id },
            data: resultado.ok
                ? { enviarCorreo: true, fechaEnvioCorreo: new Date(), errorEnvioCorreo: null }
                : {
                      enviarCorreo: false,
                      fechaEnvioCorreo: new Date(),
                      errorEnvioCorreo: resultado.error.slice(0, LARGO_MAXIMO_ERROR)
                  }
        });
    }

    await AuditLogger.log({
        usuarioId: input.usuarioId,
        centroId: orden.centroId,
        bodegaId: orden.bodegaId,
        accion: "enviar_correo",
        entidad: "OrdenSalida",
        entidadId: orden.id,
        detalle: {
            para: input.para,
            reenvio: input.reenvio,
            ...(resultado.ok
                ? { resultado: "enviado", resendId: resultado.id }
                : { resultado: resultado.omitido ? "omitido" : "fallido", error: resultado.error })
        }
    });

    return resultado;
}
```

- [ ] **Step 6: Verificar que pasa**

Run: `export PATH=~/.local/bin:$PATH && npx vitest run src/__tests__/envio-comprobante.test.ts`
Expected: PASS (5 tests).

- [ ] **Step 7: Commit**

```bash
git add prisma/schema.prisma prisma/migrations src/modules/orden-salida/utils/envio-comprobante.ts src/__tests__/envio-comprobante.test.ts
git commit -m "feat(orden-salida): envio del comprobante por correo con estado y auditoria"
```

---

### Task 4: Enviar al registrar la salida

**Files:**
- Modify: `src/shared/types/action-state.ts`
- Modify: `src/modules/orden-salida/actions/orden-salida.action.ts`:
  - `crearOrdenSalida`: el `return` exitoso, alrededor de la línea 155.
  - `descargarComprobanteSalidaAction`, alrededor de las líneas 418-435.
- Modify: `src/modules/orden-salida/components/orden-salida-form.tsx` (bloque `state.ok && state.id`, alrededor de la línea 219)
- Test: `src/__tests__/crear-salida-correo.test.ts`

**Interfaces:**
- Consumes: `enviarComprobanteSalida`, `cargarOrdenParaComprobante` (Task 3); `ResultadoCorreo` (Task 1).
- Produces: `ActionState.advertencia?: string`.

- [ ] **Step 1: Escribir el test que falla**

`src/__tests__/crear-salida-correo.test.ts`:
```ts
import { beforeEach, describe, expect, it, vi } from "vitest";

// lib
import * as authLib from "@/shared/lib/auth";
import { prisma } from "@/shared/lib/prisma";

// actions
import { crearOrdenSalida } from "@/modules/orden-salida/actions/orden-salida.action";

// utils
import { enviarComprobanteSalida } from "@/modules/orden-salida/utils/envio-comprobante";

vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));
vi.mock("@/auth", () => ({ auth: vi.fn() }));
vi.mock("@/shared/lib/logger", () => ({ AuditLogger: { log: vi.fn() } }));
vi.mock("@/shared/lib/inventario-alcance", async (importOriginal) => ({
    ...(await importOriginal<typeof import("@/shared/lib/inventario-alcance")>()),
    validarCentroBodegaEnAlcance: vi.fn().mockResolvedValue(undefined)
}));
vi.mock("@/shared/lib/auth", async (importOriginal) => ({
    ...(await importOriginal<typeof import("@/shared/lib/auth")>()),
    requireSessionUser: vi.fn()
}));
vi.mock("@/modules/orden-salida/utils/envio-comprobante", () => ({
    enviarComprobanteSalida: vi.fn(),
    cargarOrdenParaComprobante: vi.fn()
}));
vi.mock("@/shared/lib/prisma", () => ({ prisma: { $transaction: vi.fn() } }));

function formDataSalida(correoDestino?: string): FormData {
    const formData = new FormData();
    formData.set("fecha", new Date().toISOString());
    formData.set("centroId", "centro-1");
    formData.set("bodegaId", "b1");
    formData.set("tipoSalida", "Consumo Interno");
    formData.set("destino", "Box 1");
    if (correoDestino) {
        formData.set("correoDestino", correoDestino);
    }
    formData.append("productoId", "1");
    formData.append("cantidad", "2");
    formData.append("lote", "LOTE-01");
    formData.append("fechaCaducidad", new Date(Date.now() + 365 * 24 * 60 * 60 * 1000).toISOString());
    return formData;
}

describe("crearOrdenSalida con envío de comprobante", () => {
    beforeEach(() => {
        vi.clearAllMocks();
        vi.mocked(authLib.requireSessionUser).mockResolvedValue({
            id: "user-1",
            nombre: "Operador",
            apPaterno: "Salida",
            email: "operador@cmvalparaiso.cl",
            rol: "R07",
            centroId: "centro-1",
            bodegaId: "b1"
        });
        const tx = {
            ordenSalida: { create: vi.fn().mockResolvedValue({ id: "sal-1" }) },
            ordenSalidaDetalle: { create: vi.fn().mockResolvedValue({ id: "det-1" }) },
            stock: {
                findUnique: vi.fn().mockResolvedValue({
                    id: "stock-1",
                    cantidadDisponible: 20,
                    fechaCaducidad: new Date(Date.now() + 365 * 24 * 60 * 60 * 1000)
                }),
                update: vi.fn().mockResolvedValue({}),
                upsert: vi.fn().mockResolvedValue({})
            }
        };
        vi.mocked(prisma.$transaction).mockImplementation((async (fn: (client: unknown) => Promise<unknown>) => fn(tx)) as never);
    });

    it("no envía correo cuando la salida no tiene correo destino", async () => {
        const resultado = await crearOrdenSalida({ ok: false, message: "" }, formDataSalida());

        expect(resultado).toEqual({ ok: true, message: "Orden de salida registrada.", id: "sal-1" });
        expect(enviarComprobanteSalida).not.toHaveBeenCalled();
    });

    it("envía el comprobante y lo informa en el mensaje", async () => {
        vi.mocked(enviarComprobanteSalida).mockResolvedValue({ ok: true, id: "email-1" });

        const resultado = await crearOrdenSalida({ ok: false, message: "" }, formDataSalida("destino@cmvalparaiso.cl"));

        expect(enviarComprobanteSalida).toHaveBeenCalledWith({
            ordenId: "sal-1",
            usuarioId: "user-1",
            para: "destino@cmvalparaiso.cl",
            reenvio: false
        });
        expect(resultado).toEqual({
            ok: true,
            message: "Orden de salida registrada. Comprobante enviado a destino@cmvalparaiso.cl.",
            id: "sal-1"
        });
    });

    it("mantiene la salida registrada y devuelve advertencia si el correo falla", async () => {
        vi.mocked(enviarComprobanteSalida).mockResolvedValue({ ok: false, error: "Dominio no verificado" });

        const resultado = await crearOrdenSalida({ ok: false, message: "" }, formDataSalida("destino@cmvalparaiso.cl"));

        expect(resultado).toEqual({
            ok: true,
            message: "Orden de salida registrada.",
            id: "sal-1",
            advertencia: "No se pudo enviar el comprobante: Dominio no verificado"
        });
    });

    it("no muestra advertencia cuando el envío está omitido por falta de configuración", async () => {
        vi.mocked(enviarComprobanteSalida).mockResolvedValue({
            ok: false,
            omitido: true,
            error: "Envío de correo no configurado"
        });

        const resultado = await crearOrdenSalida({ ok: false, message: "" }, formDataSalida("destino@cmvalparaiso.cl"));

        expect(resultado).toEqual({ ok: true, message: "Orden de salida registrada.", id: "sal-1" });
    });

    it("mantiene la salida registrada aunque el envío lance una excepción inesperada", async () => {
        vi.mocked(enviarComprobanteSalida).mockRejectedValue(new Error("Base de datos no disponible"));

        const resultado = await crearOrdenSalida({ ok: false, message: "" }, formDataSalida("destino@cmvalparaiso.cl"));

        expect(resultado.ok).toBe(true);
        expect(resultado.advertencia).toBe("No se pudo enviar el comprobante: Base de datos no disponible");
    });
});
```

- [ ] **Step 2: Verificar que falla**

Run: `export PATH=~/.local/bin:$PATH && npx vitest run src/__tests__/crear-salida-correo.test.ts`
Expected: FAIL. El caso sin correo pasa; los demás fallan porque `enviarComprobanteSalida` no se llama.

- [ ] **Step 3: Agregar `advertencia` a `ActionState`**

En `src/shared/types/action-state.ts`:
```ts
export interface ActionState {
    ok: boolean;
    message: string;
    id?: string;
    advertencia?: string;
}
```

- [ ] **Step 4: Integrar en `orden-salida.action.ts`**

Imports (reemplazar el import de `generarComprobanteSalidaPDF` en la sección `// utils` y agregar los nuevos):
```ts
// lib
import type { ResultadoCorreo } from "@/shared/lib/correo";

// utils
import { validarSalidaLoteCaducado } from "@/modules/stock/utils/movimientos";
import { generarComprobanteSalidaPDF } from "@/modules/orden-salida/utils/pdf-comprobante";
import { cargarOrdenParaComprobante, enviarComprobanteSalida } from "@/modules/orden-salida/utils/envio-comprobante";
```
(El `import type` va dentro del bloque `// lib` existente.)

Función local, no exportada, ubicada antes de `crearOrdenSalida`:
```ts
function respuestaSalidaRegistrada(id: string, envio: ResultadoCorreo | null, para?: string): ActionState {
    if (envio?.ok) {
        return { ok: true, message: `Orden de salida registrada. Comprobante enviado a ${para}.`, id };
    }
    if (envio && !envio.omitido) {
        return { ok: true, message: "Orden de salida registrada.", id, advertencia: `No se pudo enviar el comprobante: ${envio.error}` };
    }
    return { ok: true, message: "Orden de salida registrada.", id };
}
```

En `crearOrdenSalida`:
- Después de `AuditLogger.log(...)` de creación, agregar el envío.
- Reemplazar `return { ok: true, message: "Orden de salida registrada.", id: orden.id };` por el `return` nuevo.

Los `revalidatePath` quedan después del envío:
```ts
        const envio = parsed.correoDestino
            ? await enviarComprobanteSalida({
                  ordenId: orden.id,
                  usuarioId: user.id,
                  para: parsed.correoDestino,
                  reenvio: false
              }).catch(
                  (error: unknown): ResultadoCorreo => ({
                      ok: false,
                      error: error instanceof Error ? error.message : "Error inesperado al enviar el comprobante"
                  })
              )
            : null;

        revalidatePath("/");
        revalidatePath("/stock");
        revalidatePath("/orden-salida");
        revalidatePath("/reporte");
        return respuestaSalidaRegistrada(orden.id, envio, parsed.correoDestino);
```

En `descargarComprobanteSalidaAction`, reemplazar el `prisma.ordenSalida.findUnique({...})` completo por:
```ts
        const orden = await cargarOrdenParaComprobante(ordenId);
```

- [ ] **Step 5: Mostrar la advertencia en el formulario**

En `orden-salida-form.tsx`, inmediatamente después del bloque `{state.ok && state.id && ( ... )}`:
```tsx
            {state.ok && state.advertencia && (
                <p className="rounded-md border border-amber-200 bg-amber-50 p-3 text-xs text-amber-800 md:col-span-3" role="alert">
                    {state.advertencia}
                </p>
            )}
```

- [ ] **Step 6: Verificar los tests nuevos y existentes**

Run: `export PATH=~/.local/bin:$PATH && npx vitest run src/__tests__/crear-salida-correo.test.ts src/__tests__/orden-salida-pdf.test.ts src/__tests__/traspaso-bodega.test.ts src/__tests__/alcance-acciones.test.ts`
Expected: PASS. La descarga sigue funcionando con el helper compartido, porque `orden-salida-pdf.test.ts` mockea `prisma.ordenSalida.findUnique`, que el helper usa.

- [ ] **Step 7: Commit**

```bash
git add src/shared/types/action-state.ts src/modules/orden-salida/actions/orden-salida.action.ts src/modules/orden-salida/components/orden-salida-form.tsx src/__tests__/crear-salida-correo.test.ts
git commit -m "feat(orden-salida): enviar comprobante por correo al registrar la salida"
```

---

### Task 5: Acción de reenvío desde el historial

**Files:**
- Modify: `src/modules/orden-salida/schemas/orden-salida.schema.ts`
- Modify: `src/modules/orden-salida/actions/orden-salida.action.ts` (nueva acción al final del archivo)
- Test: `src/__tests__/reenviar-comprobante.test.ts`

**Interfaces:**
- Consumes: `enviarComprobanteSalida` (Task 3); `requireSessionUser`, `puedeOperarSalida`, `validarCentroBodegaEnAlcance` (existentes).
- Produces:
  - `export const reenvioComprobanteSchema` (Zod: `{ ordenId: string, correo: string email }`).
  - `export async function reenviarComprobanteSalidaAction(ordenId: string, correo: string): Promise<ActionState>`.

- [ ] **Step 1: Escribir el test que falla**

`src/__tests__/reenviar-comprobante.test.ts`:
```ts
import { beforeEach, describe, expect, it, vi } from "vitest";

// lib
import * as authLib from "@/shared/lib/auth";
import { validarCentroBodegaEnAlcance } from "@/shared/lib/inventario-alcance";
import { prisma } from "@/shared/lib/prisma";

// actions
import { reenviarComprobanteSalidaAction } from "@/modules/orden-salida/actions/orden-salida.action";

// utils
import { enviarComprobanteSalida } from "@/modules/orden-salida/utils/envio-comprobante";

vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));
vi.mock("@/auth", () => ({ auth: vi.fn() }));
vi.mock("@/shared/lib/logger", () => ({ AuditLogger: { log: vi.fn() } }));
vi.mock("@/shared/lib/inventario-alcance", async (importOriginal) => ({
    ...(await importOriginal<typeof import("@/shared/lib/inventario-alcance")>()),
    validarCentroBodegaEnAlcance: vi.fn()
}));
vi.mock("@/shared/lib/auth", async (importOriginal) => ({
    ...(await importOriginal<typeof import("@/shared/lib/auth")>()),
    requireSessionUser: vi.fn()
}));
vi.mock("@/modules/orden-salida/utils/envio-comprobante", () => ({
    enviarComprobanteSalida: vi.fn(),
    cargarOrdenParaComprobante: vi.fn()
}));
vi.mock("@/shared/lib/prisma", () => ({
    prisma: { ordenSalida: { findUnique: vi.fn(), update: vi.fn() } }
}));

function sesion(rol: string): void {
    vi.mocked(authLib.requireSessionUser).mockResolvedValue({
        id: "user-1",
        nombre: "Operador",
        apPaterno: "Salida",
        email: "operador@cmvalparaiso.cl",
        rol,
        centroId: "c-1",
        bodegaId: "b-1"
    });
}

describe("reenviarComprobanteSalidaAction", () => {
    beforeEach(() => {
        vi.clearAllMocks();
        sesion("R07");
        vi.mocked(validarCentroBodegaEnAlcance).mockResolvedValue(undefined);
        vi.mocked(prisma.ordenSalida.findUnique).mockResolvedValue({
            id: "sal-1",
            centroId: "c-1",
            bodegaId: "b-1",
            correoDestino: "antiguo@cmvalparaiso.cl"
        } as never);
    });

    it("rechaza usuarios sin permiso de salida", async () => {
        sesion("R06");

        const resultado = await reenviarComprobanteSalidaAction("sal-1", "nuevo@cmvalparaiso.cl");

        expect(resultado.ok).toBe(false);
        expect(enviarComprobanteSalida).not.toHaveBeenCalled();
    });

    it("rechaza un correo inválido", async () => {
        const resultado = await reenviarComprobanteSalidaAction("sal-1", "no-es-correo");

        expect(resultado).toEqual({ ok: false, message: "Ingrese un correo válido." });
        expect(enviarComprobanteSalida).not.toHaveBeenCalled();
    });

    it("rechaza órdenes fuera del alcance sin modificar el correo", async () => {
        vi.mocked(validarCentroBodegaEnAlcance).mockRejectedValue(
            new Error("No tienes permiso para operar en el centro o bodega seleccionada.")
        );

        const resultado = await reenviarComprobanteSalidaAction("sal-1", "nuevo@cmvalparaiso.cl");

        expect(resultado).toEqual({ ok: false, message: "No tienes permiso para operar en el centro o bodega seleccionada." });
        expect(prisma.ordenSalida.update).not.toHaveBeenCalled();
        expect(enviarComprobanteSalida).not.toHaveBeenCalled();
    });

    it("corrige el correo destino y reenvía", async () => {
        vi.mocked(enviarComprobanteSalida).mockResolvedValue({ ok: true, id: "email-2" });

        const resultado = await reenviarComprobanteSalidaAction("sal-1", " nuevo@cmvalparaiso.cl ");

        expect(prisma.ordenSalida.update).toHaveBeenCalledWith({
            where: { id: "sal-1" },
            data: { correoDestino: "nuevo@cmvalparaiso.cl" }
        });
        expect(enviarComprobanteSalida).toHaveBeenCalledWith({
            ordenId: "sal-1",
            usuarioId: "user-1",
            para: "nuevo@cmvalparaiso.cl",
            reenvio: true
        });
        expect(resultado).toEqual({ ok: true, message: "Comprobante enviado a nuevo@cmvalparaiso.cl." });
    });

    it("no actualiza el correo si no cambió", async () => {
        vi.mocked(enviarComprobanteSalida).mockResolvedValue({ ok: true, id: "email-3" });

        await reenviarComprobanteSalidaAction("sal-1", "antiguo@cmvalparaiso.cl");

        expect(prisma.ordenSalida.update).not.toHaveBeenCalled();
    });

    it("informa el error de envío y el envío no configurado", async () => {
        vi.mocked(enviarComprobanteSalida).mockResolvedValueOnce({ ok: false, error: "Dominio no verificado" });
        expect(await reenviarComprobanteSalidaAction("sal-1", "antiguo@cmvalparaiso.cl")).toEqual({
            ok: false,
            message: "No se pudo enviar el comprobante: Dominio no verificado"
        });

        vi.mocked(enviarComprobanteSalida).mockResolvedValueOnce({
            ok: false,
            omitido: true,
            error: "Envío de correo no configurado"
        });
        expect(await reenviarComprobanteSalidaAction("sal-1", "antiguo@cmvalparaiso.cl")).toEqual({
            ok: false,
            message: "El envío de correos no está configurado en este entorno."
        });
    });
});
```

- [ ] **Step 2: Verificar que falla**

Run: `export PATH=~/.local/bin:$PATH && npx vitest run src/__tests__/reenviar-comprobante.test.ts`
Expected: FAIL (`reenviarComprobanteSalidaAction` no existe).

- [ ] **Step 3: Agregar el schema** al final de `orden-salida.schema.ts`:

```ts
export const reenvioComprobanteSchema = z.object({
    ordenId: z.string().min(1),
    correo: z.string().trim().email("Ingrese un correo válido.")
});
```

- [ ] **Step 4: Implementar la acción** al final de `orden-salida.action.ts`

Agregar `reenvioComprobanteSchema` al import de schemas existente.

```ts
export async function reenviarComprobanteSalidaAction(ordenId: string, correo: string): Promise<ActionState> {
    try {
        const user = await requireSessionUser();
        if (!puedeOperarSalida(user.rol)) {
            return { ok: false, message: "No tienes permiso para enviar comprobantes." };
        }

        const parsed = reenvioComprobanteSchema.safeParse({ ordenId, correo });
        if (!parsed.success) {
            return { ok: false, message: parsed.error.issues[0]?.message ?? "Datos inválidos." };
        }

        const orden = await prisma.ordenSalida.findUnique({
            where: { id: parsed.data.ordenId },
            select: { id: true, centroId: true, bodegaId: true, correoDestino: true }
        });
        if (!orden) {
            return { ok: false, message: "Orden de salida no encontrada." };
        }
        await validarCentroBodegaEnAlcance(orden.centroId, orden.bodegaId);

        if (orden.correoDestino !== parsed.data.correo) {
            await prisma.ordenSalida.update({
                where: { id: orden.id },
                data: { correoDestino: parsed.data.correo }
            });
        }

        const envio = await enviarComprobanteSalida({
            ordenId: orden.id,
            usuarioId: user.id,
            para: parsed.data.correo,
            reenvio: true
        });
        revalidatePath("/orden-salida");

        if (envio.ok) {
            return { ok: true, message: `Comprobante enviado a ${parsed.data.correo}.` };
        }
        if (envio.omitido) {
            return { ok: false, message: "El envío de correos no está configurado en este entorno." };
        }
        return { ok: false, message: `No se pudo enviar el comprobante: ${envio.error}` };
    } catch (error) {
        return { ok: false, message: error instanceof Error ? error.message : "No se pudo enviar el comprobante." };
    }
}
```

`puedeOperarSalida` (`src/shared/lib/auth.ts`) permite R01, R03 y R07; el test usa R06 como rol sin permiso.

- [ ] **Step 5: Verificar que pasa**

Run: `export PATH=~/.local/bin:$PATH && npx vitest run src/__tests__/reenviar-comprobante.test.ts`
Expected: PASS (6 tests).

- [ ] **Step 6: Commit**

```bash
git add src/modules/orden-salida/schemas/orden-salida.schema.ts src/modules/orden-salida/actions/orden-salida.action.ts src/__tests__/reenviar-comprobante.test.ts
git commit -m "feat(orden-salida): accion para reenviar el comprobante por correo"
```

---

### Task 6: UI del historial (estado y botón de envío)

**Files:**
- Create: `src/modules/orden-salida/components/estado-correo-badge.tsx`
- Create: `src/modules/orden-salida/components/boton-enviar-comprobante.tsx`
- Modify: `src/app/orden-salida/page.tsx` (tabla "Salidas registradas")
- Test: `src/__tests__/correo-comprobante-ui.test.tsx`

**Interfaces:**
- Consumes: `reenviarComprobanteSalidaAction(ordenId, correo): Promise<ActionState>` (Task 5); `Badge` (`tone: "success" | "danger" | "muted"`); `formatDate`.
- Produces:
  - `EstadoCorreoBadge({ enviado, fechaEnvio, error, correoDestino })`.
  - `BotonEnviarComprobante({ ordenId, correoInicial })`.

- [ ] **Step 1: Escribir el test que falla**

`src/__tests__/correo-comprobante-ui.test.tsx`:
```tsx
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { toast } from "sonner";

// actions
import * as actions from "@/modules/orden-salida/actions/orden-salida.action";

// components
import { BotonEnviarComprobante } from "@/modules/orden-salida/components/boton-enviar-comprobante";
import { EstadoCorreoBadge } from "@/modules/orden-salida/components/estado-correo-badge";

vi.mock("@/modules/orden-salida/actions/orden-salida.action", () => ({
    reenviarComprobanteSalidaAction: vi.fn()
}));

vi.mock("sonner", () => ({
    toast: { error: vi.fn(), success: vi.fn() }
}));

describe("EstadoCorreoBadge", () => {
    it("muestra Enviado con destinatario en el título", () => {
        render(
            <EstadoCorreoBadge
                enviado
                fechaEnvio={new Date("2026-10-29T12:00:00Z")}
                error={null}
                correoDestino="destino@cmvalparaiso.cl"
            />
        );
        expect(screen.getByText("Enviado")).toHaveAttribute("title", expect.stringContaining("destino@cmvalparaiso.cl"));
    });

    it("muestra Falló con el motivo en el título", () => {
        render(<EstadoCorreoBadge enviado={false} fechaEnvio={new Date()} error="Dominio no verificado" correoDestino="x@cmvalparaiso.cl" />);
        expect(screen.getByText("Falló")).toHaveAttribute("title", "Dominio no verificado");
    });

    it("muestra Sin envío cuando nunca se intentó", () => {
        render(<EstadoCorreoBadge enviado={false} fechaEnvio={null} error={null} correoDestino={null} />);
        expect(screen.getByText("Sin envío")).toBeInTheDocument();
    });
});

describe("BotonEnviarComprobante", () => {
    it("abre el modal con el correo precargado, permite editarlo y envía", async () => {
        vi.mocked(actions.reenviarComprobanteSalidaAction).mockResolvedValue({
            ok: true,
            message: "Comprobante enviado a nuevo@cmvalparaiso.cl."
        });

        render(<BotonEnviarComprobante ordenId="sal-1" correoInicial="antiguo@cmvalparaiso.cl" />);
        fireEvent.click(screen.getByRole("button", { name: /enviar comprobante/i }));

        const input = screen.getByLabelText(/correo destino/i);
        expect(input).toHaveValue("antiguo@cmvalparaiso.cl");
        fireEvent.change(input, { target: { value: "nuevo@cmvalparaiso.cl" } });
        fireEvent.click(screen.getByRole("button", { name: /^enviar$/i }));

        await waitFor(() => {
            expect(actions.reenviarComprobanteSalidaAction).toHaveBeenCalledWith("sal-1", "nuevo@cmvalparaiso.cl");
            expect(toast.success).toHaveBeenCalledWith("Comprobante enviado a nuevo@cmvalparaiso.cl.");
        });
        expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
    });

    it("muestra el error y mantiene el modal abierto", async () => {
        vi.mocked(actions.reenviarComprobanteSalidaAction).mockResolvedValue({
            ok: false,
            message: "No se pudo enviar el comprobante: Dominio no verificado"
        });

        render(<BotonEnviarComprobante ordenId="sal-1" correoInicial={null} />);
        fireEvent.click(screen.getByRole("button", { name: /enviar comprobante/i }));
        fireEvent.change(screen.getByLabelText(/correo destino/i), { target: { value: "x@cmvalparaiso.cl" } });
        fireEvent.click(screen.getByRole("button", { name: /^enviar$/i }));

        await waitFor(() => {
            expect(toast.error).toHaveBeenCalledWith("No se pudo enviar el comprobante: Dominio no verificado");
        });
        expect(screen.getByRole("dialog")).toBeInTheDocument();
    });
});
```

- [ ] **Step 2: Verificar que falla**

Run: `export PATH=~/.local/bin:$PATH && npx vitest run src/__tests__/correo-comprobante-ui.test.tsx`
Expected: FAIL (componentes inexistentes).

- [ ] **Step 3: Implementar `estado-correo-badge.tsx`**

```tsx
import type * as React from "react";

// components
import { Badge } from "@/shared/components/ui/badge";

// utils
import { formatDate } from "@/shared/utils/format";

interface EstadoCorreoBadgeProps {
    enviado: boolean;
    fechaEnvio: Date | null;
    error: string | null;
    correoDestino: string | null;
}

export function EstadoCorreoBadge({ enviado, fechaEnvio, error, correoDestino }: EstadoCorreoBadgeProps): React.ReactElement {
    if (enviado && fechaEnvio) {
        return (
            <Badge tone="success" title={`Enviado a ${correoDestino ?? "-"} el ${formatDate(fechaEnvio)}`}>
                Enviado
            </Badge>
        );
    }
    if (error) {
        return (
            <Badge tone="danger" title={error}>
                Falló
            </Badge>
        );
    }
    return <Badge tone="muted">Sin envío</Badge>;
}
```

- [ ] **Step 4: Implementar `boton-enviar-comprobante.tsx`**

```tsx
"use client";

import type * as React from "react";
import { useId, useState } from "react";
import { Loader2, Mail, X } from "lucide-react";
import { toast } from "sonner";

// actions
import { reenviarComprobanteSalidaAction } from "@/modules/orden-salida/actions/orden-salida.action";

// components
import { Button } from "@/shared/components/ui/button";
import { Input } from "@/shared/components/ui/input";

interface BotonEnviarComprobanteProps {
    ordenId: string;
    correoInicial: string | null;
}

export function BotonEnviarComprobante({ ordenId, correoInicial }: BotonEnviarComprobanteProps): React.ReactElement {
    const [abierto, setAbierto] = useState(false);
    const [correo, setCorreo] = useState(correoInicial ?? "");
    const [enviando, setEnviando] = useState(false);
    const titleId = useId();
    const inputId = useId();

    const handleEnviar = async (event: React.FormEvent<HTMLFormElement>) => {
        event.preventDefault();
        try {
            setEnviando(true);
            const resultado = await reenviarComprobanteSalidaAction(ordenId, correo);
            if (resultado.ok) {
                toast.success(resultado.message);
                setAbierto(false);
            } else {
                toast.error(resultado.message);
            }
        } catch {
            toast.error("Ocurrió un error inesperado al enviar el comprobante");
        } finally {
            setEnviando(false);
        }
    };

    return (
        <>
            <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={() => setAbierto(true)}
                title="Enviar comprobante por correo"
                aria-label="Enviar comprobante"
            >
                <Mail className="h-3.5 w-3.5" />
                <span className="ml-1.5">Enviar</span>
            </Button>
            {abierto ? (
                <div
                    className="fixed inset-0 z-50 flex items-center justify-center bg-black/45 p-4"
                    role="dialog"
                    aria-modal="true"
                    aria-labelledby={titleId}
                >
                    <div className="w-full max-w-md overflow-hidden rounded-md border bg-background text-left shadow-lg">
                        <div className="flex items-center justify-between border-b px-4 py-3">
                            <h3 id={titleId} className="text-base font-semibold">
                                Enviar comprobante por correo
                            </h3>
                            <Button type="button" variant="ghost" size="sm" onClick={() => setAbierto(false)} aria-label="Cerrar modal">
                                <X className="h-4 w-4" />
                            </Button>
                        </div>
                        <form onSubmit={handleEnviar} className="space-y-3 p-4">
                            <label htmlFor={inputId} className="block space-y-1 text-sm">
                                <span>Correo destino</span>
                                <Input
                                    id={inputId}
                                    type="email"
                                    required
                                    value={correo}
                                    onChange={(event) => setCorreo(event.target.value)}
                                />
                            </label>
                            <div className="flex justify-end gap-2">
                                <Button type="button" variant="ghost" size="sm" onClick={() => setAbierto(false)}>
                                    Cancelar
                                </Button>
                                <Button type="submit" size="sm" disabled={enviando}>
                                    {enviando ? <Loader2 className="mr-1.5 h-3.5 w-3.5 animate-spin" /> : null}
                                    Enviar
                                </Button>
                            </div>
                        </form>
                    </div>
                </div>
            ) : null}
        </>
    );
}
```

Nota: el botón de apertura tiene `aria-label="Enviar comprobante"` y el de envío tiene texto "Enviar", así que el test los distingue con `/enviar comprobante/i` y `/^enviar$/i`. Verificar que `Input` existe en `@/shared/components/ui/input` y reenvía `id` y `type`; ya se usa en `orden-salida-form.tsx`.

- [ ] **Step 5: Verificar que pasa**

Run: `export PATH=~/.local/bin:$PATH && npx vitest run src/__tests__/correo-comprobante-ui.test.tsx`
Expected: PASS (5 tests).

- [ ] **Step 6: Integrar en el historial** (`src/app/orden-salida/page.tsx`)

Imports en `// components`:
```tsx
import { BotonEnviarComprobante } from "@/modules/orden-salida/components/boton-enviar-comprobante";
import { EstadoCorreoBadge } from "@/modules/orden-salida/components/estado-correo-badge";
```
En el `<thead>`, agregar `<Th>Correo</Th>` entre `<Th>Detalle</Th>` y `<Th className="text-right">Acciones</Th>`.

En cada fila:
- Agregar la celda del estado antes de la de acciones.
- Reemplazar la celda de acciones por la versión con los dos botones.

```tsx
                                        <Td>
                                            <EstadoCorreoBadge
                                                enviado={orden.enviarCorreo}
                                                fechaEnvio={orden.fechaEnvioCorreo}
                                                error={orden.errorEnvioCorreo}
                                                correoDestino={orden.correoDestino}
                                            />
                                        </Td>
                                        <Td className="text-right">
                                            <div className="flex justify-end gap-2">
                                                <BotonDescargarComprobante ordenId={orden.id} size="sm" />
                                                <BotonEnviarComprobante ordenId={orden.id} correoInicial={orden.correoDestino} />
                                            </div>
                                        </Td>
```
`listarOrdenesSalida` usa `include`, así que ya trae los escalares `enviarCorreo`, `fechaEnvioCorreo`, `errorEnvioCorreo` y `correoDestino`.

- [ ] **Step 7: Verificar tipos**

Run: `export PATH=~/.local/bin:$PATH && npx prisma generate && npx tsc --noEmit`
Expected: sin errores.

- [ ] **Step 8: Commit**

```bash
git add src/modules/orden-salida/components/estado-correo-badge.tsx src/modules/orden-salida/components/boton-enviar-comprobante.tsx src/app/orden-salida/page.tsx src/__tests__/correo-comprobante-ui.test.tsx
git commit -m "feat(orden-salida): estado de envio y boton para enviar el comprobante desde el historial"
```

---

### Task 7: Acción `enviar_correo` en la vista de auditoría

**Files:**
- Modify: `src/modules/auditoria/schemas/auditoria.schema.ts:10`
- Modify: `src/modules/auditoria/components/auditoria-filtros.tsx` (opciones del select de acción, alrededor de la línea 257)
- Modify: `src/modules/auditoria/components/auditoria-tabla.tsx` (etiqueta del badge de acción, alrededor de la línea 120)
- Test: `src/__tests__/auditoria-tabla.test.tsx`, `src/__tests__/auditoria-filtros.test.tsx` (agregar casos)

**Interfaces:**
- Consumes: logs con `accion: "enviar_correo"` (Task 3).
- Produces: `FiltroAuditoriaInput["accion"]` incluye `"enviar_correo"`.

- [ ] **Step 1: Escribir los tests que fallan**

Agregar en `src/__tests__/auditoria-tabla.test.tsx`, dentro del `describe`:
```tsx
    it("muestra acciones compuestas con espacios y sin guion bajo", () => {
        render(
            <AuditoriaTabla
                logs={[{ ...mockLogs[0], id: "log-2", accion: "enviar_correo" }]}
                total={1}
                paginaActual={1}
                paginasTotales={1}
                onCambiarPagina={() => {}}
            />
        );

        expect(screen.getByText("Enviar correo")).toBeInTheDocument();
    });
```
Agregar un test de schema en un archivo nuevo `src/__tests__/auditoria-schema.test.ts`:
```ts
import { describe, expect, it } from "vitest";
import { filtroAuditoriaSchema } from "@/modules/auditoria/schemas/auditoria.schema";

describe("filtroAuditoriaSchema", () => {
    it("acepta la acción enviar_correo", () => {
        expect(filtroAuditoriaSchema.parse({ accion: "enviar_correo" }).accion).toBe("enviar_correo");
    });
});
```

- [ ] **Step 2: Verificar que fallan**

Run: `export PATH=~/.local/bin:$PATH && npx vitest run src/__tests__/auditoria-tabla.test.tsx src/__tests__/auditoria-schema.test.ts`
Expected: FAIL. La tabla muestra "Enviar_correo" y el schema rechaza la acción.

- [ ] **Step 3: Implementar**

`auditoria.schema.ts`:
```ts
    accion: z.enum(["todas", "crear", "actualizar", "eliminar", "enviar_correo"]).default("todas"),
```
`auditoria-filtros.tsx`, después de `<option value="eliminar">Eliminar</option>`:
```tsx
                        <option value="enviar_correo">Enviar correo</option>
```
`auditoria-tabla.tsx`, contenido del `<Badge>` de acción:
```tsx
                                                {(log.accion.charAt(0).toUpperCase() + log.accion.slice(1)).replace(/_/g, " ")}
```

- [ ] **Step 4: Verificar que pasan junto con el resto de auditoría**

Run: `export PATH=~/.local/bin:$PATH && npx vitest run src/__tests__/auditoria`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/modules/auditoria src/__tests__/auditoria-tabla.test.tsx src/__tests__/auditoria-schema.test.ts
git commit -m "feat(auditoria): filtrar y mostrar la accion enviar_correo"
```

---

### Task 8: Documentación, secret de producción, verificación y PR

**Files:**
- Modify: `docs/guias/deploy-produccion.md` (sección 3)
- Secret GitHub: `ENV_PRODUCTION` (environment `produccion`)

- [ ] **Step 1: Documentar las variables en la guía de deploy**

En `docs/guias/deploy-produccion.md`:
- Al bloque de la sección 3, agregar estas dos líneas después de `AUTH_TRUST_HOST="true"`:
```
RESEND_API_KEY="<api key de Resend del proyecto>"
CORREO_REMITENTE="Inventario CMV <inventario@cmvalparaiso.cl>"
```
- Y debajo del bloque, este párrafo:
```markdown
El envío de correos (comprobante de salida) usa Resend. El dominio `cmvalparaiso.cl` está verificado en la cuenta de Resend; sin `RESEND_API_KEY` la app funciona igual pero no envía correos (queda registrado como `omitido` en auditoría).
```

- [ ] **Step 2: Suite completa, tipos y build**

Run: `export PATH=~/.local/bin:$PATH && npx tsc --noEmit && npm test && npm run build`
Expected: sin errores de tipos, todos los tests en verde y build exitoso.

- [ ] **Step 3: Prueba manual con envío real**

1. Con `RESEND_API_KEY` y `CORREO_REMITENTE` en el `.env` local, ejecutar `npm run dev`.
2. Registrar una salida con `correoDestino` = correo del responsable (rvergara@cmvalparaiso.cl). Debe aparecer "Comprobante enviado a …" y llegar el correo con el PDF adjunto.
3. En el historial, el badge muestra "Enviado". Usar "Enviar" con otro correo y verificar el toast y el nuevo correo.
4. Forzar un fallo (por ejemplo, con `CORREO_REMITENTE` de un dominio no verificado) y comprobar tres cosas: la salida se registra, aparece la advertencia ámbar y el badge muestra "Falló" con el motivo.
5. En `/auditoria`, filtrar por la acción "Enviar correo" y ver los intentos.

- [ ] **Step 4: Actualizar el secret `ENV_PRODUCTION` sin exponer valores**

Reconstruirlo desde el `.env` del servidor y agregar las dos variables que se leen del `.env` local, sin imprimirlas.

Script `scratchpad/actualizar-env-produccion.sh` (bash):
```bash
#!/usr/bin/env bash
set -euo pipefail
TMP="$(mktemp)"
trap 'rm -f "$TMP"' EXIT
ssh informesdiarios 'cat /var/www/inventario-aps/actions-runner/_work/inventario-cmv/inventario-cmv/.env' \
    | grep -v -e '^RESEND_API_KEY=' -e '^CORREO_REMITENTE=' > "$TMP"
grep -e '^RESEND_API_KEY=' -e '^CORREO_REMITENTE=' /Users/usuario/Projects/InventarioCMV/.env >> "$TMP"
gh secret set ENV_PRODUCTION --env produccion --repo cormuval/inventario-cmv < "$TMP"
cut -d= -f1 "$TMP"
```
Expected: lista **solo los nombres** de las 8 variables (DATABASE_URL, AUTH_SECRET, AUTH_GOOGLE_ID, AUTH_GOOGLE_SECRET, AUTH_URL, AUTH_TRUST_HOST, RESEND_API_KEY, CORREO_REMITENTE).

- [ ] **Step 5: Commit, push y PR**

```bash
git add docs/guias/deploy-produccion.md
git commit -m "docs(deploy): variables de Resend para el envio de correos"
git push -u origin feat/envio-correo-comprobante
gh pr create --base main --title "feat: envío del comprobante de salida por correo (Resend)" --body-file <cuerpo>
```
El cuerpo del PR:
- Resume la spec y enlaza `docs/superpowers/specs/2026-10-29-envio-correo-comprobante-design.md`.
- Indica que incluye la migración `correo_comprobante_salida`.
- Detalla la prueba manual realizada.
- Termina con:
```
🤖 Generated with [Claude Code](https://claude.com/claude-code)

https://claude.ai/code/session_01SXAWNMvQLd1YzkWQdLacdV
```

Expected: el CI del PR (tsc, tests y build sin clave) queda en verde.
