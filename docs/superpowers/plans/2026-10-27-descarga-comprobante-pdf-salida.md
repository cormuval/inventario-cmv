# Descarga de Comprobante PDF de Salidas Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Implementar la generación y descarga de comprobantes en PDF de órdenes de salida mediante Server Actions para respaldo físico en terreno, tanto de forma inmediata tras el registro como desde el historial de salidas.

**Architecture:** El backend genera un documento PDF nativo en Node.js usando `pdfkit` dentro de una Server Action (`descargarComprobanteSalidaAction`), validando estrictamente la sesión y el alcance institucional de CMV (`R01`, `R02`, o encargado de bodega). El buffer se serializa a base64 y el cliente lo descarga como `Blob` binario mediante un botón reutilizable en la tabla de salidas y en el modal de confirmación tras registrar una nueva salida.

**Tech Stack:** Next.js 15 (App Router), React 19, TypeScript strict, `pdfkit`, `@types/pdfkit`, Prisma, Tailwind CSS v3, shadcn/ui, Vitest, Testing Library.

**Spec:** `docs/specs/procedimiento-descarga-comprobante-pdf-salida.md`

## Global Constraints

- Backend mediante Server Actions (`'use server'`), sin API Routes para lógica interna (regla `AGENTS.md`).
- Validación estricta de alcance de usuario (`requireSessionUser`, permisos sobre centro y bodega).
- Generación de PDF liviana en Node.js sin navegadores headless (evitar Chromium/Puppeteer).
- Idioma español en UI, comentarios y commits; indentación de 4 espacios; TypeScript strict (cero errores `tsc`).
- Documento con formato formal: membrete CMV, folio, datos de origen/destino, tabla de insumos (lote y vencimiento), y recuadros de firma física (emisor y receptor).

---

### Task 1: Instalar dependencias `pdfkit` y `@types/pdfkit`

**Files:**
- Modify: `package.json`

**Interfaces:**
- Consumes: Node.js runtime
- Produces: Módulos `pdfkit` y sus tipos `@types/pdfkit` para generación vectorial de PDFs.

- [ ] **Step 1: Instalar dependencias**

Ejecutar:
```bash
npm install pdfkit
npm install -D @types/pdfkit
```

- [ ] **Step 2: Verificar instalación y tipos**

Ejecutar: `npx tsc --noEmit`
Expected: Código de salida 0 sin errores de tipos.

- [ ] **Step 3: Commit**

```bash
git add package.json package-lock.json
git commit -m "chore: agregar dependencia pdfkit y types para comprobantes pdf"
```

---

### Task 2: Utilidad de descarga de archivos en base64 en cliente

**Files:**
- Create: `src/shared/utils/descargar-base64.ts`
- Test: `src/__tests__/descargar-base64.test.ts`

**Interfaces:**
- Produces: `descargarArchivoBase64(base64: string, filename: string, mimeType?: string): void`

- [ ] **Step 1: Escribir test unitario**

Crear `src/__tests__/descargar-base64.test.ts`:
```ts
import { describe, expect, it, vi } from "vitest";
import { descargarArchivoBase64 } from "@/shared/utils/descargar-base64";

describe("descargarArchivoBase64", () => {
    it("crea un elemento <a> con blob url y ejecuta la descarga", () => {
        const createObjectURLMock = vi.fn().mockReturnValue("blob:http://localhost/mock-blob");
        const revokeObjectURLMock = vi.fn();
        globalThis.URL.createObjectURL = createObjectURLMock;
        globalThis.URL.revokeObjectURL = revokeObjectURLMock;

        const appendChildSpy = vi.spyOn(document.body, "appendChild");
        const removeChildSpy = vi.spyOn(document.body, "removeChild");

        const sampleBase64 = Buffer.from("test content").toString("base64");
        descargarArchivoBase64(sampleBase64, "comprobante.pdf", "application/pdf");

        expect(createObjectURLMock).toHaveBeenCalled();
        expect(appendChildSpy).toHaveBeenCalled();
        expect(removeChildSpy).toHaveBeenCalled();
        expect(revokeObjectURLMock).toHaveBeenCalledWith("blob:http://localhost/mock-blob");
    });
});
```

- [ ] **Step 2: Ejecutar test para verificar que falla**

Ejecutar: `npx vitest run src/__tests__/descargar-base64.test.ts`
Expected: FAIL con "Cannot find module".

- [ ] **Step 3: Implementar `descargarArchivoBase64`**

Crear `src/shared/utils/descargar-base64.ts`:
```ts
/**
 * Convierte una cadena base64 a Blob binario y dispara la descarga en el navegador.
 */
export function descargarArchivoBase64(
    base64: string,
    filename: string,
    mimeType = "application/pdf"
): void {
    if (typeof window === "undefined") return;

    const binaryString = atob(base64);
    const bytes = new Uint8Array(binaryString.length);
    for (let i = 0; i < binaryString.length; i++) {
        bytes[i] = binaryString.charCodeAt(i);
    }

    const blob = new Blob([bytes], { type: mimeType });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = filename;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);
}
```

- [ ] **Step 4: Ejecutar test para verificar que pasa**

Ejecutar: `npx vitest run src/__tests__/descargar-base64.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/shared/utils/descargar-base64.ts src/__tests__/descargar-base64.test.ts
git commit -m "feat: agregar utilidad cliente para descargar archivos en base64"
```

---

### Task 3: Generador de Comprobante PDF institucional con `pdfkit`

**Files:**
- Create: `src/modules/orden-salida/utils/pdf-comprobante.ts`
- Test: `src/__tests__/pdf-comprobante.test.ts`

**Interfaces:**
- Produces: `generarComprobanteSalidaPDF(orden: OrdenSalidaCompleta): Promise<Buffer>`
- Consumes: Tipos de Prisma con relaciones (`OrdenSalida`, `OrdenSalidaDetalle`, `Producto`, `Bodega`, `Centro`, `Usuario`).

- [ ] **Step 1: Escribir test unitario de generación PDF**

Crear `src/__tests__/pdf-comprobante.test.ts`:
```ts
import { describe, expect, it } from "vitest";
import { generarComprobanteSalidaPDF, type OrdenSalidaPDFData } from "@/modules/orden-salida/utils/pdf-comprobante";

describe("generarComprobanteSalidaPDF", () => {
    const mockOrden: OrdenSalidaPDFData = {
        id: "sal-12345",
        fecha: new Date("2026-10-27T10:00:00Z"),
        tipoSalida: "Consumo Interno",
        destino: "Box Curaciones Sala 2",
        codigoSalida: "COD-789",
        centro: { nombre: "CESFAM Barón" },
        bodega: { nombre: "Bodega Farmacia Principal" },
        bodegaDestino: null,
        usuario: {
            nombre: "Ana",
            apPaterno: "Gómez",
            email: "agomez@cmvalparaiso.cl"
        },
        detalles: [
            {
                id: "det-1",
                cantidad: 50,
                lote: "LOT-2026-A",
                fechaCaducidad: new Date("2027-05-15"),
                producto: {
                    descripcion: "Paracetamol 500mg comprimidos"
                }
            },
            {
                id: "det-2",
                cantidad: 10,
                lote: "LOT-GAS-99",
                fechaCaducidad: new Date("2028-01-01"),
                producto: {
                    descripcion: "Gasa estéril 10x10cm"
                }
            }
        ]
    };

    it("genera un buffer binario de PDF con encabezado %PDF-", async () => {
        const buffer = await generarComprobanteSalidaPDF(mockOrden);
        expect(Buffer.isBuffer(buffer)).toBe(true);
        expect(buffer.length).toBeGreaterThan(500);

        // La firma mágica de los archivos PDF debe ser %PDF-
        const magicHeader = buffer.subarray(0, 5).toString("ascii");
        expect(magicHeader).toBe("%PDF-");
    });
});
```

- [ ] **Step 2: Ejecutar test para verificar que falla**

Ejecutar: `npx vitest run src/__tests__/pdf-comprobante.test.ts`
Expected: FAIL con "Cannot find module".

- [ ] **Step 3: Implementar `src/modules/orden-salida/utils/pdf-comprobante.ts`**

Crear el generador con membrete CMV, detalles formateados, tabla con columnas alineadas y recuadros de firma:
```ts
import PDFDocument from "pdfkit";
import { formatDate, formatNumber } from "@/shared/utils/format";

export interface OrdenSalidaPDFData {
    id: string;
    fecha: Date;
    tipoSalida: string;
    destino: string;
    codigoSalida?: string | null;
    centro: { nombre: string };
    bodega: { nombre: string };
    bodegaDestino?: { nombre: string } | null;
    usuario: {
        nombre: string;
        apPaterno: string | null;
        email: string;
    };
    detalles: Array<{
        id: string;
        cantidad: number;
        lote: string;
        fechaCaducidad: Date;
        producto: {
            descripcion: string;
        };
    }>;
}

export function generarComprobanteSalidaPDF(orden: OrdenSalidaPDFData): Promise<Buffer> {
    return new Promise((resolve, reject) => {
        try {
            const doc = new PDFDocument({
                size: "LETTER",
                margin: 40,
                info: {
                    Title: `Comprobante de Salida - ${orden.id}`,
                    Author: "Corporación Municipal de Valparaíso"
                }
            });

            const chunks: Buffer[] = [];
            doc.on("data", (chunk: Buffer) => chunks.push(chunk));
            doc.on("end", () => resolve(Buffer.concat(chunks)));
            doc.on("error", (err: Error) => reject(err));

            const primaryColor = "#0f172a";
            const secondaryColor = "#475569";
            const borderColor = "#cbd5e1";

            // Encabezado CMV
            doc.fontSize(13).font("Helvetica-Bold").fillColor(primaryColor)
                .text("CORPORACIÓN MUNICIPAL DE VALPARAÍSO", 40, 40);
            doc.fontSize(9).font("Helvetica").fillColor(secondaryColor)
                .text("Área de Salud · Sistema de Inventario y Farmacia APS", 40, 56);

            // Folio e Identificación de Documento
            doc.rect(380, 36, 192, 48).strokeColor(borderColor).stroke();
            doc.fontSize(10).font("Helvetica-Bold").fillColor(primaryColor)
                .text("COMPROBANTE DE SALIDA", 385, 42, { width: 182, align: "center" });
            doc.fontSize(9).font("Helvetica").fillColor(secondaryColor)
                .text(`N°: ${orden.id}`, 385, 56, { width: 182, align: "center" });
            doc.fontSize(8).fillColor(secondaryColor)
                .text(`Fecha: ${formatDate(orden.fecha)}`, 385, 69, { width: 182, align: "center" });

            doc.moveTo(40, 96).lineTo(572, 96).strokeColor(borderColor).stroke();

            // Bloque de Datos de la Operación
            let currentY = 108;
            doc.fontSize(9).font("Helvetica-Bold").fillColor(primaryColor)
                .text("DATOS DE LA SALIDA", 40, currentY);

            currentY += 14;
            doc.rect(40, currentY, 532, 54).strokeColor(borderColor).stroke();

            const leftX = 50;
            const midX = 310;
            const row1Y = currentY + 8;
            const row2Y = currentY + 22;
            const row3Y = currentY + 36;

            doc.fontSize(8.5).font("Helvetica-Bold").fillColor(secondaryColor).text("Centro Emisor:", leftX, row1Y);
            doc.font("Helvetica").fillColor(primaryColor).text(orden.centro.nombre, leftX + 80, row1Y);

            doc.font("Helvetica-Bold").fillColor(secondaryColor).text("Bodega Origen:", leftX, row2Y);
            doc.font("Helvetica").fillColor(primaryColor).text(orden.bodega.nombre, leftX + 80, row2Y);

            doc.font("Helvetica-Bold").fillColor(secondaryColor).text("Funcionario:", leftX, row3Y);
            doc.font("Helvetica").fillColor(primaryColor).text(
                `${orden.usuario.nombre} ${orden.usuario.apPaterno || ""} (${orden.usuario.email})`,
                leftX + 80,
                row3Y
            );

            doc.font("Helvetica-Bold").fillColor(secondaryColor).text("Tipo Salida:", midX, row1Y);
            doc.font("Helvetica").fillColor(primaryColor).text(orden.tipoSalida, midX + 75, row1Y);

            doc.font("Helvetica-Bold").fillColor(secondaryColor).text("Destino:", midX, row2Y);
            doc.font("Helvetica").fillColor(primaryColor).text(
                orden.bodegaDestino ? `${orden.bodegaDestino.nombre} (${orden.destino})` : orden.destino,
                midX + 75,
                row2Y
            );

            if (orden.codigoSalida) {
                doc.font("Helvetica-Bold").fillColor(secondaryColor).text("Código Envío:", midX, row3Y);
                doc.font("Helvetica").fillColor(primaryColor).text(orden.codigoSalida, midX + 75, row3Y);
            }

            // Tabla de Insumos
            currentY += 68;
            doc.fontSize(9).font("Helvetica-Bold").fillColor(primaryColor)
                .text("DETALLE DE INSUMOS Y MEDICAMENTOS ENTREGADOS", 40, currentY);

            currentY += 14;
            const tableX = 40;
            const colItem = 40;
            const colDesc = 65;
            const colLote = 330;
            const colVenc = 430;
            const colCant = 510;

            // Encabezado de tabla
            doc.rect(tableX, currentY, 532, 18).fillColor("#f1f5f9").fill();
            doc.fontSize(8).font("Helvetica-Bold").fillColor(primaryColor);
            doc.text("#", colItem + 5, currentY + 5);
            doc.text("Producto / Descripción", colDesc, currentY + 5);
            doc.text("Lote", colLote, currentY + 5);
            doc.text("F. Vencimiento", colVenc, currentY + 5);
            doc.text("Cantidad", colCant, currentY + 5, { width: 55, align: "right" });

            currentY += 18;
            doc.font("Helvetica").fontSize(8).fillColor(primaryColor);

            let totalUnidades = 0;
            orden.detalles.forEach((det, idx) => {
                const rowHeight = 18;
                if (idx % 2 === 1) {
                    doc.rect(tableX, currentY, 532, rowHeight).fillColor("#f8fafc").fill();
                }

                doc.fillColor(primaryColor);
                doc.text(String(idx + 1), colItem + 5, currentY + 5);
                doc.text(det.producto.descripcion, colDesc, currentY + 5, { width: 260, height: 12, ellipsis: true });
                doc.text(det.lote, colLote, currentY + 5);
                doc.text(formatDate(det.fechaCaducidad), colVenc, currentY + 5);
                doc.text(formatNumber(det.cantidad), colCant, currentY + 5, { width: 55, align: "right" });

                totalUnidades += det.cantidad;
                currentY += rowHeight;
            });

            // Fila de totales
            doc.rect(tableX, currentY, 532, 18).strokeColor(borderColor).stroke();
            doc.font("Helvetica-Bold").fontSize(8).fillColor(primaryColor);
            doc.text("TOTAL GENERAL:", 330, currentY + 5, { width: 90, align: "right" });
            doc.text(formatNumber(totalUnidades), colCant, currentY + 5, { width: 55, align: "right" });

            // Recuadros de Firma Física
            currentY = Math.max(currentY + 50, 600);

            // Firma Emisor
            doc.rect(60, currentY, 210, 80).strokeColor(borderColor).stroke();
            doc.moveTo(80, currentY + 55).lineTo(250, currentY + 55).strokeColor(borderColor).stroke();
            doc.fontSize(8).font("Helvetica-Bold").fillColor(secondaryColor)
                .text("ENTREGADO POR (BODEGA/FARMACIA)", 60, currentY + 60, { width: 210, align: "center" });
            doc.fontSize(7.5).font("Helvetica").fillColor(secondaryColor)
                .text("Firma y Timbre Responsable Emisión", 60, currentY + 70, { width: 210, align: "center" });

            // Firma Receptor
            doc.rect(342, currentY, 210, 80).strokeColor(borderColor).stroke();
            doc.moveTo(362, currentY + 55).lineTo(532, currentY + 55).strokeColor(borderColor).stroke();
            doc.fontSize(8).font("Helvetica-Bold").fillColor(secondaryColor)
                .text("RECIBIDO CONFORME (RECEPTOR FÍSICO)", 342, currentY + 60, { width: 210, align: "center" });
            doc.fontSize(7.5).font("Helvetica").fillColor(secondaryColor)
                .text("Nombre, RUT, Firma y Fecha/Hora", 342, currentY + 70, { width: 210, align: "center" });

            // Pie de página legal
            doc.fontSize(7).fillColor("#94a3b8")
                .text(
                    "Documento generado por el Sistema de Inventario CMV · Válido como respaldo físico interno de entrega y recepción de insumos.",
                    40,
                    740,
                    { width: 532, align: "center" }
                );

            doc.end();
        } catch (error) {
            reject(error);
        }
    });
}
```

- [ ] **Step 4: Ejecutar test para verificar que pasa**

Ejecutar: `npx vitest run src/__tests__/pdf-comprobante.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/modules/orden-salida/utils/pdf-comprobante.ts src/__tests__/pdf-comprobante.test.ts
git commit -m "feat: implementar generador de comprobantes de salida en pdf"
```

---

### Task 4: Server Action `descargarComprobanteSalidaAction` con control de alcance

**Files:**
- Modify: `src/modules/orden-salida/actions/orden-salida.action.ts`
- Create: `src/__tests__/orden-salida-pdf.test.ts`

**Interfaces:**
- Consumes: `ordenId: string`, sesión del usuario vía `obtenerSessionUser()`, `prisma.ordenSalida`.
- Produces: `descargarComprobanteSalidaAction(ordenId: string): Promise<{ ok: boolean; base64?: string; filename?: string; error?: string }>`

- [ ] **Step 1: Escribir tests de Server Action de comprobante**

Crear `src/__tests__/orden-salida-pdf.test.ts`:
```ts
import { beforeEach, describe, expect, it, vi } from "vitest";
import { descargarComprobanteSalidaAction } from "@/modules/orden-salida/actions/orden-salida.action";
import { prisma } from "@/shared/lib/prisma";
import * as auth from "@/shared/lib/auth";

vi.mock("@/shared/lib/prisma", () => ({
    prisma: {
        ordenSalida: {
            findUnique: vi.fn()
        },
        encargadosBodega: {
            findMany: vi.fn()
        }
    }
}));

describe("descargarComprobanteSalidaAction", () => {
    beforeEach(() => {
        vi.clearAllMocks();
    });

    it("retorna error cuando no hay sesión de usuario", async () => {
        vi.spyOn(auth, "obtenerSessionUser").mockResolvedValue(null);

        const res = await descargarComprobanteSalidaAction("sal-1");
        expect(res.ok).toBe(false);
        expect(res.error).toMatch(/no autenticado/i);
    });

    it("retorna error cuando la orden no existe", async () => {
        vi.spyOn(auth, "obtenerSessionUser").mockResolvedValue({
            id: "u-1",
            nombre: "Admin",
            apPaterno: "Central",
            email: "admin@cmvalparaiso.cl",
            rol: "R01",
            centroId: "c-1",
            bodegaId: "b-1"
        });
        vi.mocked(prisma.ordenSalida.findUnique).mockResolvedValue(null);

        const res = await descargarComprobanteSalidaAction("orden-inexistente");
        expect(res.ok).toBe(false);
        expect(res.error).toMatch(/no encontrada/i);
    });

    it("retorna error cuando un operador intenta acceder a una orden fuera de su alcance", async () => {
        vi.spyOn(auth, "obtenerSessionUser").mockResolvedValue({
            id: "u-2",
            nombre: "Operador",
            apPaterno: "Bodega 1",
            email: "op@cmvalparaiso.cl",
            rol: "R07",
            centroId: "c-1",
            bodegaId: "b-1"
        });
        vi.mocked(prisma.encargadosBodega.findMany).mockResolvedValue([]);
        vi.mocked(prisma.ordenSalida.findUnique).mockResolvedValue({
            id: "sal-ajena",
            bodegaId: "b-otra",
            centroId: "c-1"
        } as any);

        const res = await descargarComprobanteSalidaAction("sal-ajena");
        expect(res.ok).toBe(false);
        expect(res.error).toMatch(/no autorizado/i);
    });

    it("permite la descarga a un administrador R01 y retorna base64 con nombre de archivo", async () => {
        vi.spyOn(auth, "obtenerSessionUser").mockResolvedValue({
            id: "u-admin",
            nombre: "Admin",
            apPaterno: "Central",
            email: "admin@cmvalparaiso.cl",
            rol: "R01",
            centroId: "c-1",
            bodegaId: "b-1"
        });

        vi.mocked(prisma.ordenSalida.findUnique).mockResolvedValue({
            id: "sal-valida",
            fecha: new Date(),
            tipoSalida: "Consumo Interno",
            destino: "Box 1",
            codigoSalida: null,
            bodegaId: "b-1",
            centroId: "c-1",
            centro: { nombre: "CESFAM Centro" },
            bodega: { nombre: "Bodega Farmacia" },
            bodegaDestino: null,
            usuario: { nombre: "Carlos", apPaterno: "Pérez", email: "carlos@cmvalparaiso.cl" },
            detalles: [
                {
                    id: "det-1",
                    cantidad: 10,
                    lote: "L1",
                    fechaCaducidad: new Date("2027-01-01"),
                    producto: { descripcion: "Ibuprofeno 400mg" }
                }
            ]
        } as any);

        const res = await descargarComprobanteSalidaAction("sal-valida");
        expect(res.ok).toBe(true);
        expect(res.filename).toBe("comprobante-salida-sal-valida.pdf");
        expect(res.base64).toBeDefined();
        expect(typeof res.base64).toBe("string");
    });
});
```

- [ ] **Step 2: Ejecutar test para verificar que falla**

Ejecutar: `npx vitest run src/__tests__/orden-salida-pdf.test.ts`
Expected: FAIL con "descargarComprobanteSalidaAction is not exported".

- [ ] **Step 3: Implementar `descargarComprobanteSalidaAction` en `src/modules/orden-salida/actions/orden-salida.action.ts`**

Agregar la acción exportada al final del archivo:
```ts
export async function descargarComprobanteSalidaAction(
    ordenId: string
): Promise<{ ok: boolean; base64?: string; filename?: string; error?: string }> {
    try {
        const sessionUser = await obtenerSessionUser();
        if (!sessionUser) {
            return { ok: false, error: "Usuario no autenticado" };
        }

        const orden = await prisma.ordenSalida.findUnique({
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

        if (!orden) {
            return { ok: false, error: "Orden de salida no encontrada" };
        }

        // Validación de permisos según rol y alcance
        const esAdmin = sessionUser.rol === "R01";
        const esDirectorCentro = sessionUser.rol === "R02" && sessionUser.centroId === orden.centroId;

        let tienePermiso = esAdmin || esDirectorCentro;

        if (!tienePermiso) {
            // Comprobar si el usuario tiene asignada la bodega emisora
            const encargos = await prisma.encargadosBodega.findMany({
                where: { encargadoId: sessionUser.id },
                select: { bodegaId: true }
            });
            const bodegasPermitidas = new Set([
                ...(sessionUser.bodegaId ? [sessionUser.bodegaId] : []),
                ...encargos.map((e) => e.bodegaId)
            ]);

            tienePermiso = bodegasPermitidas.has(orden.bodegaId);
        }

        if (!tienePermiso) {
            return { ok: false, error: "No autorizado para descargar este comprobante" };
        }

        const pdfBuffer = await generarComprobanteSalidaPDF(orden);

        return {
            ok: true,
            base64: pdfBuffer.toString("base64"),
            filename: `comprobante-salida-${orden.id}.pdf`
        };
    } catch (error) {
        return {
            ok: false,
            error: error instanceof Error ? error.message : "Error al generar comprobante PDF"
        };
    }
}
```

- [ ] **Step 4: Ejecutar test para verificar que pasa**

Ejecutar: `npx vitest run src/__tests__/orden-salida-pdf.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/modules/orden-salida/actions/orden-salida.action.ts src/__tests__/orden-salida-pdf.test.ts
git commit -m "feat: implementar Server Action para descarga de comprobantes pdf con control de alcance"
```

---

### Task 5: Componente cliente `BotonDescargarComprobante`

**Files:**
- Create: `src/modules/orden-salida/components/boton-descargar-comprobante.tsx`
- Test: `src/__tests__/boton-descargar-comprobante.test.tsx`

**Interfaces:**
- Consumes: `ordenId: string`, `label?: string`, `variant?: ButtonVariant`, `size?: ButtonSize`
- Produces: Botón cliente con estado de carga, invocación de Server Action y descarga mediante `descargarArchivoBase64`.

- [ ] **Step 1: Escribir test del botón de descarga**

Crear `src/__tests__/boton-descargar-comprobante.test.tsx`:
```tsx
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import * as React from "react";
import { describe, expect, it, vi } from "vitest";
import { BotonDescargarComprobante } from "@/modules/orden-salida/components/boton-descargar-comprobante";
import * as actions from "@/modules/orden-salida/actions/orden-salida.action";
import * as downloadUtil from "@/shared/utils/descargar-base64";

vi.mock("sonner", () => ({
    toast: {
        error: vi.fn(),
        success: vi.fn()
    }
}));

describe("BotonDescargarComprobante", () => {
    it("invoca la Server Action y descarga el archivo al hacer clic", async () => {
        const descargarSpy = vi.spyOn(downloadUtil, "descargarArchivoBase64").mockImplementation(() => {});
        vi.spyOn(actions, "descargarComprobanteSalidaAction").mockResolvedValue({
            ok: true,
            base64: "dGVzdA==",
            filename: "comprobante-salida-123.pdf"
        });

        render(<BotonDescargarComprobante ordenId="123" />);

        const boton = screen.getByRole("button", { name: /descargar pdf/i });
        fireEvent.click(boton);

        await waitFor(() => {
            expect(actions.descargarComprobanteSalidaAction).toHaveBeenCalledWith("123");
            expect(descargarSpy).toHaveBeenCalledWith("dGVzdA==", "comprobante-salida-123.pdf");
        });
    });
});
```

- [ ] **Step 2: Ejecutar test para verificar que falla**

Ejecutar: `npx vitest run src/__tests__/boton-descargar-comprobante.test.tsx`
Expected: FAIL con "Cannot find module".

- [ ] **Step 3: Implementar `BotonDescargarComprobante`**

Crear `src/modules/orden-salida/components/boton-descargar-comprobante.tsx`:
```tsx
"use client";

import * as React from "react";
import { useState } from "react";
import { FileDown, Loader2 } from "lucide-react";
import { toast } from "sonner";

// actions
import { descargarComprobanteSalidaAction } from "@/modules/orden-salida/actions/orden-salida.action";

// components
import { Button } from "@/shared/components/ui/button";

// utils
import { descargarArchivoBase64 } from "@/shared/utils/descargar-base64";

interface BotonDescargarComprobanteProps {
    ordenId: string;
    label?: string;
    variant?: "default" | "destructive" | "outline" | "secondary" | "ghost" | "link";
    size?: "default" | "sm" | "lg" | "icon";
    className?: string;
}

export function BotonDescargarComprobante({
    ordenId,
    label = "Descargar PDF",
    variant = "outline",
    size = "sm",
    className
}: BotonDescargarComprobanteProps): React.ReactElement {
    const [cargando, setCargando] = useState(false);

    const handleDescargar = async () => {
        try {
            setCargando(true);
            const resultado = await descargarComprobanteSalidaAction(ordenId);

            if (!resultado.ok || !resultado.base64) {
                toast.error(resultado.error || "No fue posible generar el comprobante");
                return;
            }

            descargarArchivoBase64(
                resultado.base64,
                resultado.filename || `comprobante-salida-${ordenId}.pdf`
            );
        } catch {
            toast.error("Ocurrió un error inesperado al descargar el comprobante");
        } finally {
            setCargando(false);
        }
    };

    return (
        <Button
            type="button"
            variant={variant}
            size={size}
            onClick={handleDescargar}
            disabled={cargando}
            className={className}
            title="Descargar comprobante en PDF"
            aria-label="Descargar PDF"
        >
            {cargando ? (
                <Loader2 className="h-3.5 w-3.5 animate-spin" />
            ) : (
                <FileDown className="h-3.5 w-3.5" />
            )}
            {label ? <span className="ml-1.5">{label}</span> : null}
        </Button>
    );
}
```

- [ ] **Step 4: Ejecutar test para verificar que pasa**

Ejecutar: `npx vitest run src/__tests__/boton-descargar-comprobante.test.tsx`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/modules/orden-salida/components/boton-descargar-comprobante.tsx src/__tests__/boton-descargar-comprobante.test.tsx
git commit -m "feat: agregar componente de botón cliente para descarga de comprobantes"
```

---

### Task 6: Integración en tabla de historial y en modal de registro

**Files:**
- Modify: `src/app/orden-salida/page.tsx`
- Modify: `src/modules/orden-salida/components/orden-salida-form.tsx`
- Test: `src/__tests__/orden-salida-ui.test.tsx`

**Interfaces:**
- Consumes: `BotonDescargarComprobante`, `crearOrdenSalida`.
- Produces: Columna "Acciones" en historial de salidas registradas + modal de confirmación con descarga tras guardar en `OrdenSalidaForm`.

- [ ] **Step 1: Escribir test de interfaz para historial y formulario**

Crear `src/__tests__/orden-salida-ui.test.tsx`:
```tsx
import { render, screen } from "@testing-library/react";
import * as React from "react";
import { describe, expect, it, vi } from "vitest";

// components
import { BotonDescargarComprobante } from "@/modules/orden-salida/components/boton-descargar-comprobante";

describe("Integración UI de Comprobante PDF", () => {
    it("renderiza botón de descarga con label accesible en la tabla de salidas", () => {
        render(<BotonDescargarComprobante ordenId="orden-10" />);
        expect(screen.getByRole("button", { name: /descargar pdf/i })).toBeInTheDocument();
    });
});
```

- [ ] **Step 2: Ejecutar test para verificar que pasa**

Ejecutar: `npx vitest run src/__tests__/orden-salida-ui.test.tsx`
Expected: PASS.

- [ ] **Step 3: Actualizar `src/app/orden-salida/page.tsx`**

Agregar columna "Acciones" en la cabecera `<Th>Acciones</Th>` y renderizar `<BotonDescargarComprobante ordenId={orden.id} size="sm" />` en cada fila.

- [ ] **Step 4: Actualizar `src/modules/orden-salida/components/orden-salida-form.tsx`**

En `OrdenSalidaForm`, tras respuesta exitosa (`state.ok`):
- Mostrar modal o aviso destacado con `<BotonDescargarComprobante ordenId={...} label="Descargar Comprobante PDF" />` permitiendo descarga inmediata sin tener que buscar la orden en el historial.

- [ ] **Step 5: Ejecutar suite de pruebas completa**

Ejecutar: `npx vitest run`
Expected: Todos los tests pasando (121+ tests).

- [ ] **Step 6: Commit**

```bash
git add src/app/orden-salida/page.tsx src/modules/orden-salida/components/orden-salida-form.tsx src/__tests__/orden-salida-ui.test.tsx
git commit -m "feat: integrar boton de comprobante pdf en historial y modal de confirmacion"
```

---

### Task 7: Verificación final de calidad y build

**Files:**
- None (verificación global)

- [ ] **Step 1: Verificación de TypeScript**
Ejecutar: `npx tsc --noEmit`
Expected: 0 errores.

- [ ] **Step 2: Verificación de suite de tests completa**
Ejecutar: `npm test`
Expected: Todos los tests pasando.

- [ ] **Step 3: Verificación de build de producción**
Ejecutar: `npm run build`
Expected: Build exitoso de Next.js sin errores de compilación ni de empaquetado.
