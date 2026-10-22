# Vista de Auditoría de Acciones Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Implementar una pantalla exclusiva para Administradores Centrales (`R01`) en `/auditoria` que permita monitorear, auditar y filtrar la trazabilidad de operaciones (`Log`) del sistema de inventario con filtros cronológicos, filtros territoriales en cascada (Centro de Salud → Bodega → Usuario), acciones, entidades y visualización estructurada de detalles de operaciones.

**Architecture:** Se extiende el modelo `Log` de Prisma agregando la columna `fecha` con índices cronológicos y por entidad. En el backend, Server Actions protegidas (`src/modules/auditoria/actions/auditoria.action.ts`) consultan los registros con paginación y filtros validados con Zod. En el frontend, se crea un panel de filtros dependientes en cascada (`auditoria-filtros.tsx`), una tabla interactiva con filas expandibles (`auditoria-tabla.tsx`), la página protegida `src/app/auditoria/page.tsx` y la opción condicional en la barra lateral (`app-sidebar-shell.tsx`) visible únicamente para usuarios con rol `R01`.

**Tech Stack:** Next.js 15 (App Router), React 19, TypeScript strict, Prisma ORM, MySQL 8.4, Zod, Tailwind CSS v3 + Lucide Icons (`History`, `ChevronDown`, `ChevronUp`, `Filter`, `RotateCcw`), Vitest + React Testing Library.

**Spec:** [`docs/specs/procedimiento-vista-auditoria.md`](file:///c:/Users/benja/OneDrive/Escritorio/inventario-cmv-main/docs/specs/procedimiento-vista-auditoria.md)

## Global Constraints

- Acceso estrictamente reservado para rol `R01` (`ROL_ADMINISTRADOR`). Cualquier otro rol es redirigido de inmediato a `/`.
- Idioma español en toda la interfaz de usuario, badges, mensajes y registros de auditoría.
- Dependencia territorial en cascada estricta: Centro de Salud → Bodegas activas de ese centro → Usuarios activos asignados a ese centro y bodega.
- Los detalles JSON almacenados en `Log.detalle` deben ser interpretados y formateados en un visor estructurado y legible para humanos (con opción adicional de ver el JSON crudo).
- Paginación eficiente (`take: 50`) con contador total de eventos.
- Cero regresiones en la suite de pruebas existente y cero errores en `npx tsc --noEmit`.

---

### Task 1: Extensión del Modelo `Log` en Prisma y Actualización de `AuditLogger`

**Files:**
- Modify: `prisma/schema.prisma:205-216`
- Modify: `src/shared/lib/logger.ts:1-26`
- Test: `src/__tests__/logger-auditoria.test.ts`

**Interfaces:**
- Consumes: Prisma schema y `AuditLogger` existente.
- Produces: Modelo `Log` con campo `fecha DateTime @default(now()) @map("Fecha")` e índices `@@index([fecha])`, `@@index([entidad])`.

- [ ] **Step 1: Escribir la prueba unitaria que verifica el timestamp y nuevos campos en Log**

Crear `src/__tests__/logger-auditoria.test.ts`:
```ts
import { describe, expect, it, vi } from "vitest";
import { AuditLogger } from "@/shared/lib/logger";
import { prisma } from "@/shared/lib/prisma";

vi.mock("@/shared/lib/prisma", () => ({
    prisma: {
        log: {
            create: vi.fn().mockResolvedValue({ id: "log-1", fecha: new Date() })
        }
    }
}));

describe("AuditLogger con Timestamp", () => {
    it("registra un evento con los datos completos en la tabla Log", async () => {
        await AuditLogger.log({
            usuarioId: "user-1",
            accion: "crear",
            entidad: "OrdenSalida",
            entidadId: "salida-123",
            detalle: { tipo: "Consumo Interno", lineas: 2 }
        });

        expect(prisma.log.create).toHaveBeenCalledWith({
            data: {
                usuarioId: "user-1",
                accion: "crear",
                entidad: "OrdenSalida",
                entidadId: "salida-123",
                detalle: { tipo: "Consumo Interno", lineas: 2 }
            }
        });
    });
});
```

- [ ] **Step 2: Ejecutar la prueba para verificar su comportamiento inicial**

Run: `npx vitest run src/__tests__/logger-auditoria.test.ts`
Expected: PASS o compatibilidad con el mock existente.

- [ ] **Step 3: Actualizar el modelo `Log` en `prisma/schema.prisma` y sincronizar el cliente Prisma**

En `prisma/schema.prisma`, actualizar el modelo `Log`:
```prisma
model Log {
    id        String   @id @default(cuid()) @map("ID_Log") @db.VarChar(255)
    usuarioId String?  @map("ID_User") @db.VarChar(255)
    accion    String   @map("Accion") @db.VarChar(255)
    entidad   String   @map("Entidad") @db.VarChar(255)
    entidadId String?  @map("Entidad_ID") @db.VarChar(255)
    detalle   Json?    @map("Detalle")
    fecha     DateTime @default(now()) @map("Fecha")
    usuario   Usuario? @relation(fields: [usuarioId], references: [id])

    @@index([usuarioId])
    @@index([fecha])
    @@index([entidad])
    @@map("logs")
}
```

Ejecutar:
```bash
npx prisma generate
```

- [ ] **Step 4: Verificar tipos con tsc**

Run: `npx tsc --noEmit`
Expected: 0 errores.

- [ ] **Step 5: Commit de Task 1**

```bash
git add prisma/schema.prisma src/__tests__/logger-auditoria.test.ts
git commit -m "feat(auditoria): agregar campo fecha e indices al modelo Log en prisma"
```

---

### Task 2: Esquemas Zod y Server Actions de Consulta de Auditoría

**Files:**
- Create: `src/modules/auditoria/schemas/auditoria.schema.ts`
- Create: `src/modules/auditoria/actions/auditoria.action.ts`
- Test: `src/__tests__/auditoria.action.test.ts`

**Interfaces:**
- Consumes: `requireSessionUser` de `@/shared/lib/auth`, `prisma` de `@/shared/lib/prisma`.
- Produces:
  - `filtroAuditoriaSchema`: validación de fechas, centroId, bodegaId, usuarioId, accion, entidad, pagina.
  - `obtenerFiltrosCatalogoAuditoria()`: retorna `{ centros, bodegas, usuarios }` para los combos dependientes.
  - `consultarLogsAuditoria(filtros)`: retorna `{ logs, total, pagina, paginasTotales }`.

- [ ] **Step 1: Escribir las pruebas unitarias para las Server Actions de auditoría**

Crear `src/__tests__/auditoria.action.test.ts`:
```ts
import { beforeEach, describe, expect, it, vi } from "vitest";
import * as authLib from "@/shared/lib/auth";
import { prisma } from "@/shared/lib/prisma";
import {
    consultarLogsAuditoria,
    obtenerFiltrosCatalogoAuditoria
} from "@/modules/auditoria/actions/auditoria.action";

vi.mock("@/shared/lib/auth", () => ({
    requireSessionUser: vi.fn(),
    puedeAdministrar: vi.fn()
}));

vi.mock("@/shared/lib/prisma", () => ({
    prisma: {
        centro: { findMany: vi.fn() },
        bodega: { findMany: vi.fn() },
        usuario: { findMany: vi.fn() },
        encargadosBodega: { findMany: vi.fn() },
        log: {
            findMany: vi.fn(),
            count: vi.fn()
        }
    }
}));

describe("Auditoría - Server Actions", () => {
    beforeEach(() => {
        vi.clearAllMocks();
    });

    it("rechaza el acceso si el usuario no tiene rol R01 de administrador", async () => {
        vi.mocked(authLib.requireSessionUser).mockResolvedValue({
            id: "u-2",
            rol: "R07",
            email: "operador@cmvalparaiso.cl"
        } as any);

        await expect(
            consultarLogsAuditoria({
                fechaDesde: "2026-10-19T00:00:00.000Z",
                fechaHasta: "2026-10-19T23:59:59.999Z"
            })
        ).rejects.toThrow(/solo administradores/i);
    });

    it("permite consultar logs aplicando filtros de fecha, accion y usuario a un admin R01", async () => {
        vi.mocked(authLib.requireSessionUser).mockResolvedValue({
            id: "admin-1",
            rol: "R01",
            email: "admin@cmvalparaiso.cl"
        } as any);

        const mockLogs = [
            {
                id: "log-1",
                usuarioId: "u-1",
                accion: "crear",
                entidad: "OrdenSalida",
                entidadId: "sal-1",
                detalle: { tipo: "Consumo Interno" },
                fecha: new Date("2026-10-19T10:00:00Z"),
                usuario: { id: "u-1", nombre: "Carlos", apPaterno: "Pérez", email: "carlos@cmvalparaiso.cl" }
            }
        ];

        vi.mocked(prisma.log.findMany).mockResolvedValue(mockLogs as any);
        vi.mocked(prisma.log.count).mockResolvedValue(1);

        const resultado = await consultarLogsAuditoria({
            fechaDesde: "2026-10-19T00:00:00.000Z",
            fechaHasta: "2026-10-19T23:59:59.999Z",
            usuarioId: "u-1",
            accion: "crear",
            entidad: "OrdenSalida",
            pagina: 1
        });

        expect(resultado.total).toBe(1);
        expect(resultado.logs).toHaveLength(1);
        expect(resultado.logs[0].id).toBe("log-1");
        expect(prisma.log.findMany).toHaveBeenCalledWith(
            expect.objectContaining({
                where: expect.objectContaining({
                    usuarioId: "u-1",
                    accion: "crear",
                    entidad: "OrdenSalida"
                }),
                orderBy: { fecha: "desc" }
            })
        );
    });

    it("obtiene los datos de catálogo para alimentar los combos en cascada", async () => {
        vi.mocked(authLib.requireSessionUser).mockResolvedValue({
            id: "admin-1",
            rol: "R01",
            email: "admin@cmvalparaiso.cl"
        } as any);

        vi.mocked(prisma.centro.findMany).mockResolvedValue([{ id: "c1", nombre: "Centro 1" }] as any);
        vi.mocked(prisma.bodega.findMany).mockResolvedValue([{ id: "b1", nombre: "Bodega 1", centroId: "c1" }] as any);
        vi.mocked(prisma.usuario.findMany).mockResolvedValue([
            { id: "u1", nombre: "Juan", apPaterno: "Pérez", email: "juan@cmvalparaiso.cl", centroId: "c1", encargos: [{ bodegaId: "b1" }] }
        ] as any);

        const catalogo = await obtenerFiltrosCatalogoAuditoria();

        expect(catalogo.centros).toHaveLength(1);
        expect(catalogo.bodegas).toHaveLength(1);
        expect(catalogo.usuarios).toHaveLength(1);
    });
});
```

- [ ] **Step 2: Ejecutar la prueba para verificar que falla antes de implementar**

Run: `npx vitest run src/__tests__/auditoria.action.test.ts`
Expected: FAIL (módulos no encontrados).

- [ ] **Step 3: Implementar `src/modules/auditoria/schemas/auditoria.schema.ts`**

```ts
import { z } from "zod";

export const filtroAuditoriaSchema = z.object({
    fechaDesde: z.string().optional(),
    fechaHasta: z.string().optional(),
    centroId: z.string().optional(),
    bodegaId: z.string().optional(),
    usuarioId: z.string().optional(),
    accion: z.enum(["todas", "crear", "actualizar", "eliminar"]).default("todas"),
    entidad: z.enum([
        "todas",
        "OrdenSalida",
        "OrdenEntrada",
        "Producto",
        "Usuario",
        "Centro",
        "Bodega",
        "Unidad"
    ]).default("todas"),
    pagina: z.coerce.number().int().positive().default(1),
    limite: z.coerce.number().int().positive().default(50)
});

export type FiltroAuditoriaInput = z.infer<typeof filtroAuditoriaSchema>;
```

- [ ] **Step 4: Implementar `src/modules/auditoria/actions/auditoria.action.ts`**

```ts
"use server";

// lib
import { requireSessionUser } from "@/shared/lib/auth";
import { prisma } from "@/shared/lib/prisma";

// schemas
import {
    filtroAuditoriaSchema,
    type FiltroAuditoriaInput
} from "@/modules/auditoria/schemas/auditoria.schema";

export async function obtenerFiltrosCatalogoAuditoria() {
    const user = await requireSessionUser();
    if (user.rol !== "R01") {
        throw new Error("Solo administradores pueden acceder a los datos de auditoría.");
    }

    const [centros, bodegas, usuarios] = await Promise.all([
        prisma.centro.findMany({
            where: { estado: true },
            select: { id: true, nombre: true },
            orderBy: { nombre: "asc" }
        }),
        prisma.bodega.findMany({
            where: { estado: true },
            select: { id: true, nombre: true, centroId: true },
            orderBy: { nombre: "asc" }
        }),
        prisma.usuario.findMany({
            where: { estado: true },
            select: {
                id: true,
                nombre: true,
                apPaterno: true,
                email: true,
                centroId: true,
                bodegaId: true,
                encargos: {
                    select: { bodegaId: true }
                }
            },
            orderBy: { nombre: "asc" }
        })
    ]);

    return { centros, bodegas, usuarios };
}

export async function consultarLogsAuditoria(inputFiltros: Partial<FiltroAuditoriaInput>) {
    const user = await requireSessionUser();
    if (user.rol !== "R01") {
        throw new Error("Solo administradores pueden consultar el registro de auditoría.");
    }

    const filtros = filtroAuditoriaSchema.parse(inputFiltros);
    const where: any = {};

    // Filtro por Rango Temporal
    if (filtros.fechaDesde || filtros.fechaHasta) {
        where.fecha = {};
        if (filtros.fechaDesde) {
            where.fecha.gte = new Date(filtros.fechaDesde);
        }
        if (filtros.fechaHasta) {
            where.fecha.lte = new Date(filtros.fechaHasta);
        }
    }

    // Filtro por Acción
    if (filtros.accion && filtros.accion !== "todas") {
        where.accion = filtros.accion;
    }

    // Filtro por Entidad
    if (filtros.entidad && filtros.entidad !== "todas") {
        where.entidad = filtros.entidad;
    }

    // Filtro por Usuario específico
    if (filtros.usuarioId && filtros.usuarioId !== "todos") {
        where.usuarioId = filtros.usuarioId;
    } else if (filtros.bodegaId && filtros.bodegaId !== "todas") {
        // Si no se eligió un usuario puntual pero sí una bodega, buscar logs de los usuarios asignados a dicha bodega
        const encargados = await prisma.encargadosBodega.findMany({
            where: { bodegaId: filtros.bodegaId },
            select: { encargadoId: true }
        });
        const usuarioIds = encargados.map((e) => e.encargadoId);
        where.usuarioId = { in: usuarioIds };
    } else if (filtros.centroId && filtros.centroId !== "todos") {
        // Si no se eligió usuario ni bodega pero sí centro, buscar usuarios del centro
        const usuariosDelCentro = await prisma.usuario.findMany({
            where: { centroId: filtros.centroId },
            select: { id: true }
        });
        const usuarioIds = usuariosDelCentro.map((u) => u.id);
        where.usuarioId = { in: usuarioIds };
    }

    const skip = (filtros.pagina - 1) * filtros.limite;

    const [total, logs] = await Promise.all([
        prisma.log.count({ where }),
        prisma.log.findMany({
            where,
            include: {
                usuario: {
                    select: {
                        id: true,
                        nombre: true,
                        apPaterno: true,
                        email: true,
                        rolId: true
                    }
                }
            },
            orderBy: { fecha: "desc" },
            take: filtros.limite,
            skip
        })
    ]);

    const paginasTotales = Math.max(1, Math.ceil(total / filtros.limite));

    return {
        logs,
        total,
        pagina: filtros.pagina,
        limite: filtros.limite,
        paginasTotales
    };
}
```

- [ ] **Step 5: Ejecutar pruebas y verificar que pasen**

Run: `npx vitest run src/__tests__/auditoria.action.test.ts`
Expected: PASS (todas las pruebas aprobadas).

- [ ] **Step 6: Commit de Task 2**

```bash
git add src/modules/auditoria/schemas/auditoria.schema.ts src/modules/auditoria/actions/auditoria.action.ts src/__tests__/auditoria.action.test.ts
git commit -m "feat(auditoria): agregar esquema zod y server actions de consulta y filtros"
```

---

### Task 3: Componente `AuditoriaFiltros` con Cascada Territorial (Centro → Bodega → Usuario)

**Files:**
- Create: `src/modules/auditoria/components/auditoria-filtros.tsx`
- Test: `src/__tests__/auditoria-filtros.test.tsx`

**Interfaces:**
- Consumes: Catálogos `{ centros, bodegas, usuarios }` devueltos por `obtenerFiltrosCatalogoAuditoria`.
- Produces: Formulario interactivo en cascada que actualiza `SearchParams` de la URL o invoca `onFilterChange` con los filtros seleccionados.

- [ ] **Step 1: Escribir la prueba unitaria para la cascada de filtros**

Crear `src/__tests__/auditoria-filtros.test.tsx`:
```tsx
import { fireEvent, render, screen } from "@testing-library/react";
import type * as React from "react";
import { describe, expect, it, vi } from "vitest";
import { AuditoriaFiltros } from "@/modules/auditoria/components/auditoria-filtros";

const mockCentros = [
    { id: "c1", nombre: "CESFAM Centro" },
    { id: "c2", nombre: "CESFAM Playa Ancha" }
];

const mockBodegas = [
    { id: "b1", nombre: "Bodega Farmacia", centroId: "c1" },
    { id: "b2", nombre: "Bodega Vacunatorio", centroId: "c1" },
    { id: "b3", nombre: "Bodega Playa Ancha", centroId: "c2" }
];

const mockUsuarios = [
    { id: "u1", nombre: "Carlos", apPaterno: "Pérez", email: "carlos@cmvalparaiso.cl", centroId: "c1", bodegaId: "b1", encargos: [{ bodegaId: "b1" }] },
    { id: "u2", nombre: "Ana", apPaterno: "Gómez", email: "ana@cmvalparaiso.cl", centroId: "c1", bodegaId: "b2", encargos: [{ bodegaId: "b2" }] },
    { id: "u3", nombre: "Pedro", apPaterno: "Soto", email: "pedro@cmvalparaiso.cl", centroId: "c2", bodegaId: "b3", encargos: [{ bodegaId: "b3" }] }
];

describe("AuditoriaFiltros - Dependencia en Cascada", () => {
    it("filtra las bodegas y usuarios dinámicamente según el centro seleccionado", () => {
        const onFiltrar = vi.fn();

        render(
            <AuditoriaFiltros
                centros={mockCentros}
                bodegas={mockBodegas}
                usuarios={mockUsuarios}
                onFiltrar={onFiltrar}
            />
        );

        // Al inicio con centro 'c1' o al seleccionar 'CESFAM Centro'
        const centroSelect = screen.getByLabelText(/centro de salud/i);
        fireEvent.change(centroSelect, { target: { value: "c1" } });

        // Bodega selector debe mostrar Bodega Farmacia y Bodega Vacunatorio, pero NO Bodega Playa Ancha
        const bodegaSelect = screen.getByLabelText(/bodega/i);
        expect(screen.getByText("Bodega Farmacia")).toBeInTheDocument();
        expect(screen.queryByText("Bodega Playa Ancha")).not.toBeInTheDocument();

        // Al seleccionar Bodega Farmacia, el selector de usuarios solo debe listar a Carlos
        fireEvent.change(bodegaSelect, { target: { value: "b1" } });
        expect(screen.getByText(/carlos pérez/i)).toBeInTheDocument();
        expect(screen.queryByText(/ana gómez/i)).not.toBeInTheDocument();
    });
});
```

- [ ] **Step 2: Ejecutar la prueba y verificar que falle antes de la implementación**

Run: `npx vitest run src/__tests__/auditoria-filtros.test.tsx`
Expected: FAIL.

- [ ] **Step 3: Implementar `src/modules/auditoria/components/auditoria-filtros.tsx`**

```tsx
"use client";

import * as React from "react";
import { useId, useMemo, useState } from "react";
import { Filter, RotateCcw } from "lucide-react";

// components
import { Button } from "@/shared/components/ui/button";
import { Input } from "@/shared/components/ui/input";
import { Select } from "@/shared/components/ui/select";

// types
import type { FiltroAuditoriaInput } from "@/modules/auditoria/schemas/auditoria.schema";

interface CentroOption {
    id: string;
    nombre: string;
}

interface BodegaOption {
    id: string;
    nombre: string;
    centroId: string;
}

interface UsuarioOption {
    id: string;
    nombre: string;
    apPaterno: string | null;
    email: string;
    centroId: string;
    bodegaId?: string | null;
    encargos?: Array<{ bodegaId: string }>;
}

interface AuditoriaFiltrosProps {
    centros: CentroOption[];
    bodegas: BodegaOption[];
    usuarios: UsuarioOption[];
    valoresIniciales?: Partial<FiltroAuditoriaInput>;
    onFiltrar: (filtros: Partial<FiltroAuditoriaInput>) => void;
}

function obtenerFechaHoyString(hora: "inicio" | "fin"): string {
    const hoy = new Date();
    const anio = hoy.getFullYear();
    const mes = String(hoy.getMonth() + 1).padStart(2, "0");
    const dia = String(hoy.getDate()).padStart(2, "0");
    return hora === "inicio" ? `${anio}-${mes}-${dia}T00:00` : `${anio}-${mes}-${dia}T23:59`;
}

export function AuditoriaFiltros({
    centros,
    bodegas,
    usuarios,
    valoresIniciales,
    onFiltrar
}: AuditoriaFiltrosProps): React.ReactElement {
    const centroIdField = useId();
    const bodegaIdField = useId();
    const usuarioIdField = useId();
    const accionField = useId();
    const entidadField = useId();
    const fechaDesdeField = useId();
    const fechaHastaField = useId();

    const [fechaDesde, setFechaDesde] = useState(
        valoresIniciales?.fechaDesde ?? obtenerFechaHoyString("inicio")
    );
    const [fechaHasta, setFechaHasta] = useState(
        valoresIniciales?.fechaHasta ?? obtenerFechaHoyString("fin")
    );
    const [centroId, setCentroId] = useState(valoresIniciales?.centroId ?? "todos");
    const [bodegaId, setBodegaId] = useState(valoresIniciales?.bodegaId ?? "todas");
    const [usuarioId, setUsuarioId] = useState(valoresIniciales?.usuarioId ?? "todos");
    const [accion, setAccion] = useState(valoresIniciales?.accion ?? "todas");
    const [entidad, setEntidad] = useState(valoresIniciales?.entidad ?? "todas");

    // Filtrar bodegas activas según centro seleccionado
    const bodegasFiltradas = useMemo(() => {
        if (!centroId || centroId === "todos") return bodegas;
        return bodegas.filter((b) => b.centroId === centroId);
    }, [bodegas, centroId]);

    // Filtrar usuarios activos según centro y bodega seleccionada
    const usuariosFiltrados = useMemo(() => {
        return usuarios.filter((u) => {
            const matchCentro = centroId === "todos" || u.centroId === centroId;
            if (!matchCentro) return false;

            if (bodegaId === "todas") return true;

            const tieneEncargo = u.encargos?.some((e) => e.bodegaId === bodegaId);
            const esBodegaDirecta = u.bodegaId === bodegaId;
            return tieneEncargo || esBodegaDirecta;
        });
    }, [usuarios, centroId, bodegaId]);

    const handleCentroChange = (nuevoCentro: string) => {
        setCentroId(nuevoCentro);
        setBodegaId("todas");
        setUsuarioId("todos");
    };

    const handleBodegaChange = (nuevaBodega: string) => {
        setBodegaId(nuevaBodega);
        setUsuarioId("todos");
    };

    const handleSubmit = (e: React.FormEvent) => {
        e.preventDefault();
        onFiltrar({
            fechaDesde: fechaDesde ? new Date(fechaDesde).toISOString() : undefined,
            fechaHasta: fechaHasta ? new Date(fechaHasta).toISOString() : undefined,
            centroId,
            bodegaId,
            usuarioId,
            accion: accion as any,
            entidad: entidad as any,
            pagina: 1
        });
    };

    const handleLimpiar = () => {
        const fDesde = obtenerFechaHoyString("inicio");
        const fHasta = obtenerFechaHoyString("fin");
        setFechaDesde(fDesde);
        setFechaHasta(fHasta);
        setCentroId("todos");
        setBodegaId("todas");
        setUsuarioId("todos");
        setAccion("todas");
        setEntidad("todas");

        onFiltrar({
            fechaDesde: new Date(fDesde).toISOString(),
            fechaHasta: new Date(fHasta).toISOString(),
            centroId: "todos",
            bodegaId: "todas",
            usuarioId: "todos",
            accion: "todas",
            entidad: "todas",
            pagina: 1
        });
    };

    return (
        <form onSubmit={handleSubmit} className="space-y-4 rounded-lg border bg-card p-4 shadow-sm">
            <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
                {/* Fechas */}
                <div className="space-y-1">
                    <label htmlFor={fechaDesdeField} className="text-xs font-medium text-muted-foreground">
                        Fecha Desde
                    </label>
                    <Input
                        id={fechaDesdeField}
                        type="datetime-local"
                        value={fechaDesde}
                        onChange={(e) => setFechaDesde(e.target.value)}
                        className="text-xs"
                    />
                </div>

                <div className="space-y-1">
                    <label htmlFor={fechaHastaField} className="text-xs font-medium text-muted-foreground">
                        Fecha Hasta
                    </label>
                    <Input
                        id={fechaHastaField}
                        type="datetime-local"
                        value={fechaHasta}
                        onChange={(e) => setFechaHasta(e.target.value)}
                        className="text-xs"
                    />
                </div>

                {/* Cascada: Centro de Salud */}
                <div className="space-y-1">
                    <label htmlFor={centroIdField} className="text-xs font-medium text-muted-foreground">
                        Centro de Salud
                    </label>
                    <Select
                        id={centroIdField}
                        value={centroId}
                        onChange={(e) => handleCentroChange(e.target.value)}
                    >
                        <option value="todos">Todos los centros</option>
                        {centros.map((c) => (
                            <option key={c.id} value={c.id}>
                                {c.nombre}
                            </option>
                        ))}
                    </Select>
                </div>

                {/* Cascada: Bodega */}
                <div className="space-y-1">
                    <label htmlFor={bodegaIdField} className="text-xs font-medium text-muted-foreground">
                        Bodega
                    </label>
                    <Select
                        id={bodegaIdField}
                        value={bodegaId}
                        onChange={(e) => handleBodegaChange(e.target.value)}
                    >
                        <option value="todas">Todas las bodegas</option>
                        {bodegasFiltradas.map((b) => (
                            <option key={b.id} value={b.id}>
                                {b.nombre}
                            </option>
                        ))}
                    </Select>
                </div>

                {/* Cascada: Usuario */}
                <div className="space-y-1">
                    <label htmlFor={usuarioIdField} className="text-xs font-medium text-muted-foreground">
                        Usuario
                    </label>
                    <Select
                        id={usuarioIdField}
                        value={usuarioId}
                        onChange={(e) => setUsuarioId(e.target.value)}
                    >
                        <option value="todos">Todos los usuarios</option>
                        {usuariosFiltrados.map((u) => (
                            <option key={u.id} value={u.id}>
                                {u.nombre} {u.apPaterno ?? ""} ({u.email})
                            </option>
                        ))}
                    </Select>
                </div>

                {/* Acción */}
                <div className="space-y-1">
                    <label htmlFor={accionField} className="text-xs font-medium text-muted-foreground">
                        Acción
                    </label>
                    <Select
                        id={accionField}
                        value={accion}
                        onChange={(e) => setAccion(e.target.value)}
                    >
                        <option value="todas">Todas las acciones</option>
                        <option value="crear">Crear</option>
                        <option value="actualizar">Actualizar</option>
                        <option value="eliminar">Eliminar</option>
                    </Select>
                </div>

                {/* Entidad */}
                <div className="space-y-1">
                    <label htmlFor={entidadField} className="text-xs font-medium text-muted-foreground">
                        Entidad Afectada
                    </label>
                    <Select
                        id={entidadField}
                        value={entidad}
                        onChange={(e) => setEntidad(e.target.value)}
                    >
                        <option value="todas">Todas las entidades</option>
                        <option value="OrdenSalida">Orden de Salida</option>
                        <option value="OrdenEntrada">Orden de Entrada</option>
                        <option value="Producto">Producto</option>
                        <option value="Usuario">Usuario</option>
                        <option value="Centro">Centro de Salud</option>
                        <option value="Bodega">Bodega</option>
                        <option value="Unidad">Unidad</option>
                    </Select>
                </div>

                {/* Botones de Control */}
                <div className="flex items-end gap-2">
                    <Button type="submit" size="sm" className="gap-1.5 flex-1">
                        <Filter className="h-3.5 w-3.5" />
                        Filtrar
                    </Button>
                    <Button
                        type="button"
                        variant="outline"
                        size="sm"
                        onClick={handleLimpiar}
                        className="gap-1.5"
                        title="Restablecer filtros a valores por defecto"
                    >
                        <RotateCcw className="h-3.5 w-3.5" />
                        Limpiar
                    </Button>
                </div>
            </div>
        </form>
    );
}
```

- [ ] **Step 4: Ejecutar prueba unitaria de filtros**

Run: `npx vitest run src/__tests__/auditoria-filtros.test.tsx`
Expected: PASS.

- [ ] **Step 5: Commit de Task 3**

```bash
git add src/modules/auditoria/components/auditoria-filtros.tsx src/__tests__/auditoria-filtros.test.tsx
git commit -m "feat(auditoria): agregar formulario de filtros con cascada centro bodega usuario"
```

---

### Task 4: Tabla Interactiva con Filas Expandibles e Intérprete de Detalles

**Files:**
- Create: `src/modules/auditoria/components/auditoria-detalle-visor.tsx`
- Create: `src/modules/auditoria/components/auditoria-tabla.tsx`
- Test: `src/__tests__/auditoria-tabla.test.tsx`

**Interfaces:**
- Consumes: lista de `Log` con relación `usuario`, paginación y callbacks de cambio de página.
- Produces: Tabla interactiva con badges según acción (`crear` -> verde, `actualizar` -> azul, `eliminar` -> rojo), formateador de fecha legible y visualizador estructurado del JSON de detalle.

- [ ] **Step 1: Escribir la prueba unitaria para la tabla de auditoría y expansión de detalles**

Crear `src/__tests__/auditoria-tabla.test.tsx`:
```tsx
import { fireEvent, render, screen } from "@testing-library/react";
import type * as React from "react";
import { describe, expect, it } from "vitest";
import { AuditoriaTabla } from "@/modules/auditoria/components/auditoria-tabla";

const mockLogs = [
    {
        id: "log-1",
        usuarioId: "u1",
        accion: "crear",
        entidad: "OrdenSalida",
        entidadId: "salida-999",
        detalle: {
            tipo: "Consumo Interno",
            bodegaOrigen: "Bodega Farmacia",
            lineas: 3
        },
        fecha: new Date("2026-10-19T14:30:00Z"),
        usuario: {
            id: "u1",
            nombre: "Juan",
            apPaterno: "Pérez",
            email: "juan@cmvalparaiso.cl",
            rolId: "R07"
        }
    }
];

describe("AuditoriaTabla", () => {
    it("renderiza columnas principales y expande el visor estructurado de detalle", () => {
        render(
            <AuditoriaTabla
                logs={mockLogs}
                total={1}
                paginaActual={1}
                paginasTotales={1}
                onCambiarPagina={() => {}}
            />
        );

        expect(screen.getByText("OrdenSalida")).toBeInTheDocument();
        expect(screen.getByText("Crear")).toBeInTheDocument();
        expect(screen.getByText(/juan pérez/i)).toBeInTheDocument();

        // Pulsar botón de expansión de detalle
        const btnDetalle = screen.getByRole("button", { name: /ver detalle/i });
        fireEvent.click(btnDetalle);

        expect(screen.getByText(/consumo interno/i)).toBeInTheDocument();
        expect(screen.getByText(/bodega farmacia/i)).toBeInTheDocument();
    });
});
```

- [ ] **Step 2: Ejecutar la prueba y verificar que falle antes de implementar**

Run: `npx vitest run src/__tests__/auditoria-tabla.test.tsx`
Expected: FAIL.

- [ ] **Step 3: Implementar `src/modules/auditoria/components/auditoria-detalle-visor.tsx`**

```tsx
import * as React from "react";
import { Code2 } from "lucide-react";

interface AuditoriaDetalleVisorProps {
    detalle: unknown;
    entidad: string;
}

export function AuditoriaDetalleVisor({
    detalle,
    entidad
}: AuditoriaDetalleVisorProps): React.ReactElement {
    const [mostrarRaw, setMostrarRaw] = React.useState(false);

    if (!detalle || typeof detalle !== "object") {
        return <p className="text-xs italic text-muted-foreground">Sin detalle adicional registrado.</p>;
    }

    const data = detalle as Record<string, any>;

    return (
        <div className="space-y-2 rounded-md border bg-muted/40 p-3 text-xs">
            <div className="flex items-center justify-between border-b pb-1.5">
                <span className="font-semibold text-foreground">
                    Detalle estructurado de {entidad}
                </span>
                <button
                    type="button"
                    onClick={() => setMostrarRaw(!mostrarRaw)}
                    className="flex items-center gap-1 text-[11px] text-muted-foreground hover:text-foreground"
                >
                    <Code2 className="h-3 w-3" />
                    {mostrarRaw ? "Ocultar JSON" : "Ver JSON"}
                </button>
            </div>

            <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
                {Object.entries(data).map(([key, value]) => {
                    const label = key
                        .replace(/([A-Z])/g, " $1")
                        .replace(/^./, (str) => str.toUpperCase());
                    const stringVal =
                        typeof value === "object" ? JSON.stringify(value) : String(value);

                    return (
                        <div key={key} className="space-y-0.5">
                            <span className="text-[10px] font-medium uppercase text-muted-foreground">
                                {label}
                            </span>
                            <p className="font-medium text-foreground truncate" title={stringVal}>
                                {stringVal}
                            </p>
                        </div>
                    );
                })}
            </div>

            {mostrarRaw && (
                <pre className="max-h-40 overflow-auto rounded bg-black/80 p-2 font-mono text-[11px] text-emerald-400">
                    {JSON.stringify(data, null, 2)}
                </pre>
            )}
        </div>
    );
}
```

- [ ] **Step 4: Implementar `src/modules/auditoria/components/auditoria-tabla.tsx`**

```tsx
"use client";

import * as React from "react";
import { useState } from "react";
import { ChevronDown, ChevronUp, ChevronLeft, ChevronRight } from "lucide-react";

// components
import { AuditoriaDetalleVisor } from "@/modules/auditoria/components/auditoria-detalle-visor";
import { Badge } from "@/shared/components/ui/badge";
import { Button } from "@/shared/components/ui/button";
import { Td, Th, Table } from "@/shared/components/ui/table";

export interface LogItem {
    id: string;
    usuarioId: string | null;
    accion: string;
    entidad: string;
    entidadId: string | null;
    detalle: unknown;
    fecha: Date | string;
    usuario?: {
        id: string;
        nombre: string;
        apPaterno: string | null;
        email: string;
        rolId: string;
    } | null;
}

interface AuditoriaTablaProps {
    logs: LogItem[];
    total: number;
    paginaActual: number;
    paginasTotales: number;
    onCambiarPagina: (nuevaPagina: number) => void;
}

function formatearFechaHora(fecha: Date | string): string {
    const d = new Date(fecha);
    return d.toLocaleString("es-CL", {
        day: "2-digit",
        month: "2-digit",
        year: "numeric",
        hour: "2-digit",
        minute: "2-digit",
        second: "2-digit"
    });
}

function getTonePorAccion(accion: string): "success" | "warning" | "danger" | "default" {
    switch (accion.toLowerCase()) {
        case "crear":
            return "success";
        case "actualizar":
            return "default";
        case "eliminar":
            return "danger";
        default:
            return "warning";
    }
}

export function AuditoriaTabla({
    logs,
    total,
    paginaActual,
    paginasTotales,
    onCambiarPagina
}: AuditoriaTablaProps): React.ReactElement {
    const [filaExpandida, setFilaExpandida] = useState<string | null>(null);

    const toggleFila = (id: string) => {
        setFilaExpandida((prev) => (prev === id ? null : id));
    };

    if (logs.length === 0) {
        return (
            <div className="rounded-lg border border-dashed p-8 text-center text-sm text-muted-foreground">
                No se encontraron eventos de auditoría para los filtros especificados.
            </div>
        );
    }

    return (
        <div className="space-y-3">
            <div className="flex items-center justify-between text-xs text-muted-foreground px-1">
                <span>
                    Mostrando {logs.length} de {total} eventos registrados
                </span>
                <span>
                    Página {paginaActual} de {paginasTotales}
                </span>
            </div>

            <div className="overflow-x-auto rounded-lg border bg-card shadow-sm">
                <Table>
                    <thead>
                        <tr>
                            <Th>Fecha y Hora</Th>
                            <Th>Usuario Responsable</Th>
                            <Th>Acción</Th>
                            <Th>Entidad</Th>
                            <Th>Identificador</Th>
                            <Th className="text-right">Detalle</Th>
                        </tr>
                    </thead>
                    <tbody>
                        {logs.map((log) => {
                            const isExpanded = filaExpandida === log.id;
                            return (
                                <React.Fragment key={log.id}>
                                    <tr className="hover:bg-muted/30 transition-colors">
                                        <Td className="whitespace-nowrap text-xs font-mono text-muted-foreground">
                                            {formatearFechaHora(log.fecha)}
                                        </Td>
                                        <Td>
                                            {log.usuario ? (
                                                <div className="space-y-0.5">
                                                    <p className="text-xs font-medium text-foreground">
                                                        {log.usuario.nombre} {log.usuario.apPaterno ?? ""}
                                                    </p>
                                                    <p className="text-[11px] text-muted-foreground">
                                                        {log.usuario.email}
                                                    </p>
                                                </div>
                                            ) : (
                                                <span className="text-xs italic text-muted-foreground">
                                                    Sistema
                                                </span>
                                            )}
                                        </Td>
                                        <Td>
                                            <Badge tone={getTonePorAccion(log.accion)}>
                                                {log.accion.charAt(0).toUpperCase() + log.accion.slice(1)}
                                            </Badge>
                                        </Td>
                                        <Td className="text-xs font-medium">{log.entidad}</Td>
                                        <Td className="text-xs font-mono text-muted-foreground">
                                            {log.entidadId ? log.entidadId.slice(0, 15) : "—"}
                                        </Td>
                                        <Td className="text-right">
                                            <Button
                                                type="button"
                                                variant="ghost"
                                                size="sm"
                                                onClick={() => toggleFila(log.id)}
                                                className="h-7 gap-1 px-2 text-xs"
                                                aria-label={`Ver detalle ${log.id}`}
                                            >
                                                {isExpanded ? (
                                                    <>
                                                        <ChevronUp className="h-3.5 w-3.5" />
                                                        Ocultar
                                                    </>
                                                ) : (
                                                    <>
                                                        <ChevronDown className="h-3.5 w-3.5" />
                                                        Ver detalle
                                                    </>
                                                )}
                                            </Button>
                                        </Td>
                                    </tr>
                                    {isExpanded && (
                                        <tr className="bg-muted/10">
                                            <td colSpan={6} className="p-3">
                                                <AuditoriaDetalleVisor
                                                    detalle={log.detalle}
                                                    entidad={log.entidad}
                                                />
                                            </td>
                                        </tr>
                                    )}
                                </React.Fragment>
                            );
                        })}
                    </tbody>
                </Table>
            </div>

            {/* Paginación */}
            {paginasTotales > 1 && (
                <div className="flex items-center justify-end gap-2 pt-2">
                    <Button
                        type="button"
                        variant="outline"
                        size="sm"
                        disabled={paginaActual <= 1}
                        onClick={() => onCambiarPagina(paginaActual - 1)}
                        className="gap-1 text-xs"
                    >
                        <ChevronLeft className="h-3.5 w-3.5" />
                        Anterior
                    </Button>
                    <span className="text-xs font-medium text-muted-foreground">
                        {paginaActual} / {paginasTotales}
                    </span>
                    <Button
                        type="button"
                        variant="outline"
                        size="sm"
                        disabled={paginaActual >= paginasTotales}
                        onClick={() => onCambiarPagina(paginaActual + 1)}
                        className="gap-1 text-xs"
                    >
                        Siguiente
                        <ChevronRight className="h-3.5 w-3.5" />
                    </Button>
                </div>
            )}
        </div>
    );
}
```

- [ ] **Step 5: Ejecutar la prueba de la tabla de auditoría**

Run: `npx vitest run src/__tests__/auditoria-tabla.test.tsx`
Expected: PASS.

- [ ] **Step 6: Commit de Task 4**

```bash
git add src/modules/auditoria/components/auditoria-detalle-visor.tsx src/modules/auditoria/components/auditoria-tabla.tsx src/__tests__/auditoria-tabla.test.tsx
git commit -m "feat(auditoria): agregar tabla con filas expandibles y visor estructurado de detalles"
```

---

### Task 5: Página `/auditoria`, Cliente Interactivo y Acceso en Barra Lateral

**Files:**
- Create: `src/modules/auditoria/components/auditoria-vista-cliente.tsx`
- Create: `src/app/auditoria/page.tsx`
- Modify: `src/shared/components/layout/app-sidebar-shell.tsx:5-18,48-57`
- Test: `src/__tests__/auditoria-navegacion.test.tsx`

**Interfaces:**
- Consumes: `AppLayout`, `requireSessionUser`, `consultarLogsAuditoria`, `obtenerFiltrosCatalogoAuditoria`.
- Produces: Página funcional `/auditoria` con protección de rol `R01` y opción de navegación en el sidebar con icono `History`.

- [ ] **Step 1: Escribir la prueba de integración de navegación y protección de ruta**

Crear `src/__tests__/auditoria-navegacion.test.tsx`:
```tsx
import { render, screen } from "@testing-library/react";
import type * as React from "react";
import { describe, expect, it, vi } from "vitest";
import { AppSidebarShell } from "@/shared/components/layout/app-sidebar-shell";

vi.mock("next/navigation", () => ({
    usePathname: () => "/auditoria"
}));

describe("Acceso en Barra Lateral a Auditoría", () => {
    it("muestra el enlace a Auditoría únicamente para usuarios con rol R01", () => {
        const { rerender } = render(
            <AppSidebarShell
                profile={{
                    nombreCompleto: "Admin Central",
                    email: "admin@cmvalparaiso.cl",
                    rol: "R01",
                    centro: "CESFAM Centro",
                    bodegas: ["Bodega 1"]
                }}
            >
                <div>Contenido</div>
            </AppSidebarShell>
        );

        expect(screen.getByText("Auditoría")).toBeInTheDocument();

        // Para rol no administrador (ej: R07)
        rerender(
            <AppSidebarShell
                profile={{
                    nombreCompleto: "Operador Bodega",
                    email: "operador@cmvalparaiso.cl",
                    rol: "R07",
                    centro: "CESFAM Centro",
                    bodegas: ["Bodega 1"]
                }}
            >
                <div>Contenido</div>
            </AppSidebarShell>
        );

        expect(screen.queryByText("Auditoría")).not.toBeInTheDocument();
    });
});
```

- [ ] **Step 2: Ejecutar la prueba y verificar que falle antes de la actualización**

Run: `npx vitest run src/__tests__/auditoria-navegacion.test.tsx`
Expected: FAIL.

- [ ] **Step 3: Actualizar `src/shared/components/layout/app-sidebar-shell.tsx`**

En `src/shared/components/layout/app-sidebar-shell.tsx`:
1. Importar `History` de `"lucide-react"`.
2. Actualizar el renderizado de la lista de navegación para incorporar `{ href: "/auditoria", label: "Auditoría", icon: History }` condicionado a `profile.rol === "R01"`.

- [ ] **Step 4: Implementar `src/modules/auditoria/components/auditoria-vista-cliente.tsx`**

Componente cliente que orquesta los filtros y la tabla realizando consultas dinámicas vía Server Actions con transición suave (`useTransition`).

```tsx
"use client";

import * as React from "react";
import { useState, useTransition } from "react";

// actions
import { consultarLogsAuditoria } from "@/modules/auditoria/actions/auditoria.action";

// components
import { AuditoriaFiltros } from "@/modules/auditoria/components/auditoria-filtros";
import { AuditoriaTabla, type LogItem } from "@/modules/auditoria/components/auditoria-tabla";

// types
import type { FiltroAuditoriaInput } from "@/modules/auditoria/schemas/auditoria.schema";

interface AuditoriaVistaClienteProps {
    centros: Array<{ id: string; nombre: string }>;
    bodegas: Array<{ id: string; nombre: string; centroId: string }>;
    usuarios: Array<{
        id: string;
        nombre: string;
        apPaterno: string | null;
        email: string;
        centroId: string;
        bodegaId?: string | null;
        encargos?: Array<{ bodegaId: string }>;
    }>;
    initialLogs: LogItem[];
    initialTotal: number;
    initialPaginasTotales: number;
}

export function AuditoriaVistaCliente({
    centros,
    bodegas,
    usuarios,
    initialLogs,
    initialTotal,
    initialPaginasTotales
}: AuditoriaVistaClienteProps): React.ReactElement {
    const [logs, setLogs] = useState<LogItem[]>(initialLogs);
    const [total, setTotal] = useState(initialTotal);
    const [pagina, setPagina] = useState(1);
    const [paginasTotales, setPaginasTotales] = useState(initialPaginasTotales);
    const [filtrosActuales, setFiltrosActuales] = useState<Partial<FiltroAuditoriaInput>>({});
    const [isPending, startTransition] = useTransition();

    const ejecutarConsulta = (nuevosFiltros: Partial<FiltroAuditoriaInput>, targetPagina = 1) => {
        setFiltrosActuales(nuevosFiltros);
        setPagina(targetPagina);

        startTransition(async () => {
            const res = await consultarLogsAuditoria({
                ...nuevosFiltros,
                pagina: targetPagina
            });
            setLogs(res.logs as LogItem[]);
            setTotal(res.total);
            setPaginasTotales(res.paginasTotales);
        });
    };

    return (
        <div className="space-y-6">
            <AuditoriaFiltros
                centros={centros}
                bodegas={bodegas}
                usuarios={usuarios}
                onFiltrar={(f) => ejecutarConsulta(f, 1)}
            />

            <div className={isPending ? "opacity-50 transition-opacity pointer-events-none" : ""}>
                <AuditoriaTabla
                    logs={logs}
                    total={total}
                    paginaActual={pagina}
                    paginasTotales={paginasTotales}
                    onCambiarPagina={(p) => ejecutarConsulta(filtrosActuales, p)}
                />
            </div>
        </div>
    );
}
```

- [ ] **Step 5: Implementar `src/app/auditoria/page.tsx`**

```tsx
import { redirect } from "next/navigation";
import type * as React from "react";

// actions
import {
    consultarLogsAuditoria,
    obtenerFiltrosCatalogoAuditoria
} from "@/modules/auditoria/actions/auditoria.action";

// components
import { AuditoriaVistaCliente } from "@/modules/auditoria/components/auditoria-vista-cliente";
import { AppLayout } from "@/shared/components/layout/app-layout";

// lib
import { requireSessionUser } from "@/shared/lib/auth";

export const dynamic = "force-dynamic";

export default async function AuditoriaPage(): Promise<React.ReactElement> {
    const sessionUser = await requireSessionUser();

    if (sessionUser.rol !== "R01") {
        redirect("/");
    }

    const hoy = new Date();
    const hoyInicio = new Date(hoy.getFullYear(), hoy.getMonth(), hoy.getDate(), 0, 0, 0);
    const hoyFin = new Date(hoy.getFullYear(), hoy.getMonth(), hoy.getDate(), 23, 59, 59);

    const [catalogo, resultadoInicial] = await Promise.all([
        obtenerFiltrosCatalogoAuditoria(),
        consultarLogsAuditoria({
            fechaDesde: hoyInicio.toISOString(),
            fechaHasta: hoyFin.toISOString(),
            pagina: 1
        })
    ]);

    return (
        <AppLayout>
            <div className="space-y-6">
                <div>
                    <p className="text-sm text-muted-foreground">
                        Registro y trazabilidad cronológica de movimientos y operaciones en el sistema
                    </p>
                    <h2 className="text-2xl font-semibold">Auditoría de Acciones</h2>
                </div>

                <AuditoriaVistaCliente
                    centros={catalogo.centros}
                    bodegas={catalogo.bodegas}
                    usuarios={catalogo.usuarios}
                    initialLogs={resultadoInicial.logs as any}
                    initialTotal={resultadoInicial.total}
                    initialPaginasTotales={resultadoInicial.paginasTotales}
                />
            </div>
        </AppLayout>
    );
}
```

- [ ] **Step 6: Ejecutar suite de pruebas de navegación**

Run: `npx vitest run src/__tests__/auditoria-navegacion.test.tsx`
Expected: PASS.

- [ ] **Step 7: Commit de Task 5**

```bash
git add src/app/auditoria/page.tsx src/modules/auditoria/components/auditoria-vista-cliente.tsx src/shared/components/layout/app-sidebar-shell.tsx src/__tests__/auditoria-navegacion.test.tsx
git commit -m "feat(auditoria): agregar pagina protegida /auditoria y enlace en barra lateral para R01"
```

---

### Task 6: Verificación Integral, Criterios de Aceptación y Build de Producción

**Files:**
- Modify: `docs/specs/procedimiento-vista-auditoria.md` (marcar CA-1 a CA-7 cumplidos)

- [ ] **Step 1: Ejecutar la suite completa de pruebas unitarias y de integración**

Run: `npx vitest run`
Expected: 100% de los tests pasando sin regresiones.

- [ ] **Step 2: Verificar la ausencia de errores de tipado TypeScript**

Run: `npx tsc --noEmit`
Expected: 0 errores.

- [ ] **Step 3: Compilar bundle de producción de Next.js**

Run: `npm run build`
Expected: Compilación exitosa de `/auditoria` con salida de optimización limpia.

- [ ] **Step 4: Marcar los Criterios de Aceptación como completados en la especificación**

En `docs/specs/procedimiento-vista-auditoria.md`, marcar los checkboxes de CA-1 a CA-7 con `[x]`.

- [ ] **Step 5: Commit final y push de la rama**

```bash
git add docs/specs/procedimiento-vista-auditoria.md
git commit -m "docs(auditoria): marcar criterios de aceptacion cumplidos tras verificacion completa"
```
