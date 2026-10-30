# Migración de datos desde AppSheet — Plan de implementación

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Script repetible `npm run migracion:appsheet` que lee la base AppSheet (solo lectura), transforma con reglas puras y carga `inventario_cmv`, con reporte de rechazos, advertencias y validación posterior.

**Architecture:**
- Las reglas de transformación son funciones puras, separadas por entidad, en `prisma/scripts/migracion-appsheet/` y probadas con Vitest sin base de datos.
- `transformar.ts` las orquesta.
- `migrar.ts` es la única pieza con entrada y salida:
  - lee el origen con SQL crudo;
  - vacía el destino de forma opcional;
  - inserta con `createMany({ skipDuplicates: true })`;
  - valida, escribe el reporte y registra un log.

**Tech Stack:** TypeScript strict, Prisma 6 (MySQL), tsx, Vitest, Node 22 (`process.loadEnvFile`).

**Spec:** `docs/superpowers/specs/2026-10-29-migracion-appsheet-design.md`

## Global Constraints

**Convenciones**
- Idioma español en código, comentarios, mensajes y commits. Indentación de **4 espacios**. TypeScript strict con tipos explícitos.
- Imports agrupados con comentarios (`// lib`, `// migracion`, ...), como el resto del repo.
- Ningún test se conecta a una base de datos.
- Commits terminan con:
  ```
  Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>
  Claude-Session: https://claude.ai/code/session_01SXAWNMvQLd1YzkWQdLacdV
  ```

**Constantes (valores exactos)**
- Centro de prueba excluido: `3d3f9a13`.
- Rol ADMIN ASEO no migrado: `dac3497d`.
- R04 se migra como R02.
- Roles válidos del destino: `R01, R02, R03, R06, R07`.
- Centro técnico: `centro-administracion-das`.
- Usuario técnico: id `migracion-appsheet`, email `migracion-appsheet@cmvalparaiso.cl`, nombre `Migración AppSheet`, rol `R01`, `estado: false`.
- Lote vacío: `"SIN LOTE"`. Caducidad nula: `2099-12-31` (UTC).
- Tipo de salida con centro de destino: `"A Otros Centros"`. Destino resultante: `"{Destino} — {nombre centro destino}"`, recortado a 255.
- Dominio institucional: `@cmvalparaiso.cl`.

**Ejecución y archivos**
- Variables:
  - el origen se lee de `ORIGEN_DATABASE_URL`, cargada desde `.env.migracion` (o `--origen-env=<ruta>`);
  - el destino es `DESTINO_DATABASE_URL` o, si no existe, `DATABASE_URL` de `.env`.
- Opciones: `--ejecutar`, `--vaciar=<base>`, `--salida=<dir>` y `--origen-env=<ruta>`. `--vaciar` exige `--ejecutar` y el nombre exacto de la base de destino.
- Se inserta en lotes de 1.000 con `skipDuplicates: true`, por clave primaria original.
- Archivos del reporte: `resumen.json`, `rechazos-<Tabla>.csv`, `advertencias-<Tabla>.csv` (columnas `clave,regla,detalle`), `reasignaciones.json` y `validacion.json` (solo con `--ejecutar`).
- Nunca imprimir credenciales. `.env.migracion` y `migracion-appsheet-*/` ya están en `.gitignore`.

**Comandos**
- Tests: `export PATH=~/.local/bin:$PATH && npx vitest run <archivo>` (Node 22).
- Tipos: `npx tsc --noEmit`. Después restaurar con `git checkout tsconfig.tsbuildinfo` si cambió.

---

## Estructura de archivos

| Archivo | Responsabilidad |
|---|---|
| `prisma/scripts/migracion-appsheet/tipos.ts` | Constantes, tipos de origen y destino, `Rechazo`, `Resultado`, `TablaTransformada`, `MigracionTransformada` |
| `prisma/scripts/migracion-appsheet/normalizar.ts` | Conversión de valores crudos (texto, booleano, entero, fecha, email) y utilidades comunes (`rechazo`, `nuevaTabla`, `claveUnica`, `normalizarLoteCaducidad`) |
| `prisma/scripts/migracion-appsheet/reglas-maestros.ts` | Centro, Bodega, Unidad y Producto |
| `prisma/scripts/migracion-appsheet/reglas-usuarios.ts` | Usuarios: rol, reasignación por email, usuario técnico y resolución de usuarios para las órdenes |
| `prisma/scripts/migracion-appsheet/reglas-ordenes.ts` | Órdenes de entrada y salida, y sus detalles |
| `prisma/scripts/migracion-appsheet/reglas-stock.ts` | Stock, con fusión de claves duplicadas |
| `prisma/scripts/migracion-appsheet/transformar.ts` | `transformarTodo(origen, contexto)`: orquesta las reglas en orden |
| `prisma/scripts/migracion-appsheet/reporte.ts` | Resumen, CSV, archivos de reporte y `validarCarga` |
| `prisma/scripts/migracion-appsheet/opciones.ts` | Lectura y validación de los argumentos de línea de comandos |
| `prisma/scripts/migracion-appsheet/migrar.ts` | Entrada y salida: leer el origen, vaciar, insertar, validar, escribir el reporte y el log |
| `src/__tests__/migracion-appsheet-*.test.ts` | Tests (Vitest solo incluye `src/**`) |

*Ruling sobre la spec (sección 6.1):* la spec nombra un solo `reglas.ts`. Se divide por entidad para mantener archivos enfocados; el contrato y las reglas no cambian.

---

### Task 1: Tipos y normalización

**Files:**
- Create: `prisma/scripts/migracion-appsheet/tipos.ts`
- Create: `prisma/scripts/migracion-appsheet/normalizar.ts`
- Test: `src/__tests__/migracion-appsheet-normalizar.test.ts`

**Interfaces:**
- Produces: todos los tipos y constantes de `tipos.ts`, y de `normalizar.ts` las funciones `texto`, `booleano`, `estado`, `entero`, `fecha`, `email`, `recortar`, `claveFecha`, `rechazo`, `nuevaTabla`, `claveUnica` y `normalizarLoteCaducidad`, con las firmas exactas de abajo.

- [ ] **Step 1: Crear `tipos.ts`**

```ts
// Tipos y constantes de la migración AppSheet -> Inventario CMV.
// Spec: docs/superpowers/specs/2026-10-29-migracion-appsheet-design.md

export const CENTRO_PRUEBA_ID = "3d3f9a13";
export const ROL_ADMIN_ASEO_ID = "dac3497d";
export const ROL_VISUALIZADOR_ID = "R04";
export const ROL_ENCARGADO_CENTRO_ID = "R02";
export const ROLES_DESTINO: readonly string[] = ["R01", "R02", "R03", "R06", "R07"];
export const CENTRO_ADMINISTRACION_ID = "centro-administracion-das";
export const USUARIO_TECNICO_ID = "migracion-appsheet";
export const USUARIO_TECNICO_EMAIL = "migracion-appsheet@cmvalparaiso.cl";
export const LOTE_SIN_LOTE = "SIN LOTE";
export const CADUCIDAD_SIN_FECHA = new Date(Date.UTC(2099, 11, 31));
export const TIPO_SALIDA_OTROS_CENTROS = "A Otros Centros";
export const DOMINIO_INSTITUCIONAL = "@cmvalparaiso.cl";

export const TABLAS = [
    "Centro",
    "Bodega",
    "Unidad",
    "Producto",
    "Usuario",
    "OrdenEntrada",
    "OrdenEntradaDetalle",
    "OrdenSalida",
    "OrdenSalidaDetalle",
    "Stock"
] as const;

export type Tabla = (typeof TABLAS)[number];

// Valor crudo tal como lo entrega $queryRawUnsafe (MySQL sin restricciones en el origen).
export type Valor = string | number | bigint | boolean | Date | null;

export interface Rechazo {
    tabla: Tabla;
    clave: string;
    regla: string;
    detalle: string;
}

export type Resultado<T> = { ok: true; data: T; advertencias: Rechazo[] } | { ok: false; rechazo: Rechazo };

export interface TablaTransformada<T> {
    leidos: number;
    aceptados: T[];
    rechazos: Rechazo[];
    advertencias: Rechazo[];
}

// ---- Origen (nombres de columna de AppSheet) ----

export interface CentroOrigen {
    ID_Centro: Valor;
    Nombre: Valor;
    Estado: Valor;
}

export interface BodegaOrigen {
    ID_Bodega: Valor;
    Bodega: Valor;
    ID_Centro: Valor;
    Estado: Valor;
}

export interface UnidadOrigen {
    ID_Unidad: Valor;
    Descripcion: Valor;
}

export interface ProductoOrigen {
    ID_Product: Valor;
    Linea: Valor;
    Descripcion: Valor;
}

export interface UsuarioOrigen {
    ID_User: Valor;
    Nombre: Valor;
    Ap_Paterno: Valor;
    Ap_Materno: Valor;
    Rol: Valor;
    ID_Bodega: Valor;
    Telefono: Valor;
    Email: Valor;
    ID_Centro: Valor;
    Estado: Valor;
}

export interface OrdenEntradaOrigen {
    ID_OrdenEntrada: Valor;
    Fecha: Valor;
    ID_User: Valor;
    Origen: Valor;
    GuiaDespacho: Valor;
    ID_Centro: Valor;
    ID_Bodega: Valor;
    Codigo_Recepcion: Valor;
}

export interface OrdenEntradaDetalleOrigen {
    ID_Entrada: Valor;
    ID_Product: Valor;
    Categoria: Valor;
    Fecha_Caducidad: Valor;
    Cantidad: Valor;
    Lote: Valor;
    ID_OrdenEntrada: Valor;
}

export interface OrdenSalidaOrigen {
    ID_OrdenSalida: Valor;
    Fecha: Valor;
    ID_User: Valor;
    ID_Bodega: Valor;
    Tipo_Salida: Valor;
    ID_Centro: Valor;
    Destino: Valor;
    Codigo_Salida: Valor;
    Enviar_Correo: Valor;
    Correo_Destino: Valor;
}

export interface OrdenSalidaDetalleOrigen {
    ID_Detalle: Valor;
    ID_Product: Valor;
    Cantidad: Valor;
    ID_OrdenSalida: Valor;
    Lote: Valor;
    Fecha_Caducidad: Valor;
}

export interface StockOrigen {
    ID_Stock: Valor;
    ID_Product: Valor;
    ID_Bodega: Valor;
    Cantidad_Disponible: Valor;
    Fecha_Ultima_Actualizacion: Valor;
    StockMinimo: Valor;
    Lote: Valor;
    Fecha_Caducidad: Valor;
}

export interface DatosOrigen {
    centros: CentroOrigen[];
    bodegas: BodegaOrigen[];
    unidades: UnidadOrigen[];
    productos: ProductoOrigen[];
    usuarios: UsuarioOrigen[];
    entradas: OrdenEntradaOrigen[];
    entradaDetalles: OrdenEntradaDetalleOrigen[];
    salidas: OrdenSalidaOrigen[];
    salidaDetalles: OrdenSalidaDetalleOrigen[];
    stock: StockOrigen[];
}

// ---- Destino (campos de los modelos Prisma) ----

export interface CentroDestino {
    id: string;
    nombre: string;
    estado: boolean;
}

export interface BodegaDestino {
    id: string;
    nombre: string;
    centroId: string;
    estado: boolean;
}

export interface UnidadDestino {
    id: string;
    descripcion: string;
}

export interface ProductoDestino {
    id: number;
    linea: string;
    descripcion: string;
    estado: boolean;
}

export interface UsuarioDestino {
    id: string;
    nombre: string;
    apPaterno: string | null;
    apMaterno: string | null;
    rolId: string;
    bodegaId: string | null;
    telefono: string | null;
    email: string;
    centroId: string;
    estado: boolean;
}

export interface OrdenEntradaDestino {
    id: string;
    fecha: Date;
    usuarioId: string;
    origen: string;
    guiaDespacho: string | null;
    centroId: string;
    bodegaId: string;
    codigoRecepcion: string | null;
}

export interface OrdenEntradaDetalleDestino {
    id: string;
    productoId: number;
    categoria: string;
    fechaCaducidad: Date;
    cantidad: number;
    lote: string;
    ordenEntradaId: string;
}

export interface OrdenSalidaDestino {
    id: string;
    fecha: Date;
    usuarioId: string;
    bodegaId: string;
    tipoSalida: string;
    centroId: string;
    destino: string;
    codigoSalida: string | null;
    enviarCorreo: boolean;
    correoDestino: string | null;
}

export interface OrdenSalidaDetalleDestino {
    id: string;
    productoId: number;
    cantidad: number;
    ordenSalidaId: string;
    lote: string;
    fechaCaducidad: Date;
}

export interface StockDestino {
    id: string;
    productoId: number;
    bodegaId: string;
    cantidadDisponible: number;
    fechaUltimaActualizacion: Date;
    stockMinimo: number;
    lote: string;
    fechaCaducidad: Date;
}

export interface UsuarioExistente {
    id: string;
    email: string;
}

export interface ContextoMigracion {
    usuariosDestino: UsuarioExistente[];
    ahora: Date;
}

export interface MigracionTransformada {
    Centro: TablaTransformada<CentroDestino>;
    Bodega: TablaTransformada<BodegaDestino>;
    Unidad: TablaTransformada<UnidadDestino>;
    Producto: TablaTransformada<ProductoDestino>;
    Usuario: TablaTransformada<UsuarioDestino>;
    OrdenEntrada: TablaTransformada<OrdenEntradaDestino>;
    OrdenEntradaDetalle: TablaTransformada<OrdenEntradaDetalleDestino>;
    OrdenSalida: TablaTransformada<OrdenSalidaDestino>;
    OrdenSalidaDetalle: TablaTransformada<OrdenSalidaDetalleDestino>;
    Stock: TablaTransformada<StockDestino>;
    // ID de usuario AppSheet -> ID de usuario en el destino
    reasignaciones: Record<string, string>;
}
```

- [ ] **Step 2: Escribir el test de normalización (falla)**

`src/__tests__/migracion-appsheet-normalizar.test.ts`:

```ts
import { describe, expect, it } from "vitest";

// migracion
import {
    booleano,
    claveUnica,
    email,
    entero,
    estado,
    fecha,
    normalizarLoteCaducidad,
    nuevaTabla,
    recortar,
    texto
} from "../../prisma/scripts/migracion-appsheet/normalizar";
import { CADUCIDAD_SIN_FECHA, LOTE_SIN_LOTE } from "../../prisma/scripts/migracion-appsheet/tipos";

describe("normalizar", () => {
    it("texto recorta espacios y convierte vacío o null en null", () => {
        expect(texto("  Cesfam  ")).toBe("Cesfam");
        expect(texto("   ")).toBeNull();
        expect(texto(null)).toBeNull();
        expect(texto(123)).toBe("123");
        expect(texto("Cesfam Las Cañas")).toBe("Cesfam Las Cañas");
    });

    it("booleano acepta 1, '1', true y bigint", () => {
        expect(booleano(1)).toBe(true);
        expect(booleano("1")).toBe(true);
        expect(booleano(true)).toBe(true);
        expect(booleano(BigInt(1))).toBe(true);
        expect(booleano(0)).toBe(false);
        expect(booleano(null)).toBe(false);
        expect(booleano("")).toBe(false);
    });

    it("estado nulo se considera activo", () => {
        expect(estado(null)).toBe(true);
        expect(estado(0)).toBe(false);
        expect(estado(BigInt(1))).toBe(true);
    });

    it("entero convierte números, bigint y strings numéricos", () => {
        expect(entero(5)).toBe(5);
        expect(entero(BigInt(7))).toBe(7);
        expect(entero("12")).toBe(12);
        expect(entero("")).toBeNull();
        expect(entero(null)).toBeNull();
        expect(entero("abc")).toBeNull();
        expect(entero(1.5)).toBeNull();
    });

    it("fecha acepta Date válido y string YYYY-MM-DD en UTC", () => {
        const d = new Date(Date.UTC(2026, 4, 2));
        expect(fecha(d)).toEqual(d);
        expect(fecha("2026-05-02")).toEqual(d);
        expect(fecha(new Date("x"))).toBeNull();
        expect(fecha(null)).toBeNull();
    });

    it("email normaliza a minúsculas sin espacios", () => {
        expect(email("  CCastillos@CMValparaiso.cl ")).toBe("ccastillos@cmvalparaiso.cl");
        expect(email("")).toBeNull();
    });

    it("recortar limita a 255 por defecto", () => {
        expect(recortar("a".repeat(300))).toHaveLength(255);
        expect(recortar("abc", 2)).toBe("ab");
    });

    it("claveUnica rechaza clave nula y duplicada", () => {
        const tabla = nuevaTabla<{ id: string }>(3);
        const vistos = new Set<string>();
        expect(claveUnica("Centro", "c1", vistos, tabla)).toBe("c1");
        expect(claveUnica("Centro", "c1", vistos, tabla)).toBeNull();
        expect(claveUnica("Centro", null, vistos, tabla)).toBeNull();
        expect(tabla.rechazos.map((r) => r.regla)).toEqual(["clave_duplicada", "clave_nula"]);
        expect(tabla.leidos).toBe(3);
    });

    it("normalizarLoteCaducidad usa SIN LOTE y 2099-12-31 con advertencias", () => {
        const r = normalizarLoteCaducidad("Stock", "s1", "  ", null);
        expect(r.lote).toBe(LOTE_SIN_LOTE);
        expect(r.fechaCaducidad).toEqual(CADUCIDAD_SIN_FECHA);
        expect(r.advertencias.map((a) => a.regla)).toEqual(["lote_vacio", "caducidad_nula"]);

        const ok = normalizarLoteCaducidad("Stock", "s2", " L-1 ", "2027-01-31");
        expect(ok.lote).toBe("L-1");
        expect(ok.fechaCaducidad).toEqual(new Date(Date.UTC(2027, 0, 31)));
        expect(ok.advertencias).toEqual([]);
    });
});
```

- [ ] **Step 3: Ejecutar el test para verificar que falla**

Run: `export PATH=~/.local/bin:$PATH && npx vitest run src/__tests__/migracion-appsheet-normalizar.test.ts`
Expected: FAIL (no existe `normalizar`).

- [ ] **Step 4: Crear `normalizar.ts`**

```ts
// Conversión de valores crudos de AppSheet y utilidades comunes de las reglas.

// migracion
import { CADUCIDAD_SIN_FECHA, LOTE_SIN_LOTE, type Rechazo, type Tabla, type TablaTransformada, type Valor } from "./tipos";

export function texto(valor: Valor | undefined): string | null {
    if (valor === null || valor === undefined) return null;
    const limpio = (valor instanceof Date ? valor.toISOString() : String(valor)).trim();
    return limpio === "" ? null : limpio;
}

export function booleano(valor: Valor | undefined): boolean {
    if (typeof valor === "boolean") return valor;
    if (typeof valor === "number" || typeof valor === "bigint") return Number(valor) === 1;
    if (typeof valor === "string") return ["1", "true", "si", "sí"].includes(valor.trim().toLowerCase());
    return false;
}

// Estado nulo en AppSheet se considera activo.
export function estado(valor: Valor | undefined): boolean {
    return valor === null || valor === undefined ? true : booleano(valor);
}

export function entero(valor: Valor | undefined): number | null {
    if (valor === null || valor === undefined || typeof valor === "boolean" || valor instanceof Date) return null;
    if (typeof valor === "string" && valor.trim() === "") return null;
    const numero = Number(valor);
    return Number.isSafeInteger(numero) ? numero : null;
}

export function fecha(valor: Valor | undefined): Date | null {
    if (valor instanceof Date) return Number.isNaN(valor.getTime()) ? null : valor;
    if (typeof valor === "string") {
        const partes = /^(\d{4})-(\d{2})-(\d{2})/.exec(valor.trim());
        return partes ? new Date(Date.UTC(Number(partes[1]), Number(partes[2]) - 1, Number(partes[3]))) : null;
    }
    return null;
}

export function email(valor: Valor | undefined): string | null {
    const limpio = texto(valor);
    return limpio === null ? null : limpio.toLowerCase();
}

export function recortar(valor: string, maximo = 255): string {
    return valor.length > maximo ? valor.slice(0, maximo) : valor;
}

export function claveFecha(valor: Date): string {
    return valor.toISOString().slice(0, 10);
}

export function rechazo(tabla: Tabla, clave: string, regla: string, detalle: string): Rechazo {
    return { tabla, clave, regla, detalle };
}

export function nuevaTabla<T>(leidos: number): TablaTransformada<T> {
    return { leidos, aceptados: [], rechazos: [], advertencias: [] };
}

// Devuelve la clave primaria si es válida y no se repite; si no, registra el rechazo.
export function claveUnica<T>(tabla: Tabla, valor: Valor, vistos: Set<string>, resultado: TablaTransformada<T>): string | null {
    const clave = texto(valor);
    if (clave === null) {
        resultado.rechazos.push(rechazo(tabla, "(sin clave)", "clave_nula", "Clave primaria vacía"));
        return null;
    }
    if (vistos.has(clave)) {
        resultado.rechazos.push(rechazo(tabla, clave, "clave_duplicada", "Clave primaria repetida en el origen"));
        return null;
    }
    vistos.add(clave);
    return clave;
}

export interface LoteCaducidad {
    lote: string;
    fechaCaducidad: Date;
    advertencias: Rechazo[];
}

export function normalizarLoteCaducidad(tabla: Tabla, clave: string, lote: Valor, caducidad: Valor): LoteCaducidad {
    const advertencias: Rechazo[] = [];
    const loteLimpio = texto(lote);
    const fechaCaducidad = fecha(caducidad);
    if (loteLimpio === null) {
        advertencias.push(rechazo(tabla, clave, "lote_vacio", `Lote vacío: se usa "${LOTE_SIN_LOTE}"`));
    }
    if (fechaCaducidad === null) {
        advertencias.push(rechazo(tabla, clave, "caducidad_nula", "Caducidad nula: se usa 2099-12-31"));
    }
    return {
        lote: loteLimpio === null ? LOTE_SIN_LOTE : recortar(loteLimpio),
        fechaCaducidad: fechaCaducidad ?? CADUCIDAD_SIN_FECHA,
        advertencias
    };
}
```

- [ ] **Step 5: Ejecutar test y tipos**

Run: `export PATH=~/.local/bin:$PATH && npx vitest run src/__tests__/migracion-appsheet-normalizar.test.ts && npx tsc --noEmit; git checkout tsconfig.tsbuildinfo`
Expected: PASS, tsc sin errores.

- [ ] **Step 6: Commit**

```bash
git add prisma/scripts/migracion-appsheet/tipos.ts prisma/scripts/migracion-appsheet/normalizar.ts src/__tests__/migracion-appsheet-normalizar.test.ts
git commit -m "feat(migracion): tipos y normalización de valores AppSheet"
```

---

### Task 2: Reglas de maestros (Centro, Bodega, Unidad, Producto)

**Files:**
- Create: `prisma/scripts/migracion-appsheet/reglas-maestros.ts`
- Test: `src/__tests__/migracion-appsheet-maestros.test.ts`

**Interfaces:**
- Consumes: `tipos.ts` y `normalizar.ts` (Task 1).
- Produces:
  - `transformarCentros(filas: CentroOrigen[]): TablaTransformada<CentroDestino>`
  - `transformarBodegas(filas: BodegaOrigen[], centros: Set<string>): TablaTransformada<BodegaDestino>`
  - `transformarUnidades(filas: UnidadOrigen[]): TablaTransformada<UnidadDestino>`
  - `transformarProductos(filas: ProductoOrigen[]): TablaTransformada<ProductoDestino>`

- [ ] **Step 1: Escribir el test (falla)**

```ts
import { describe, expect, it } from "vitest";

// migracion
import {
    transformarBodegas,
    transformarCentros,
    transformarProductos,
    transformarUnidades
} from "../../prisma/scripts/migracion-appsheet/reglas-maestros";

describe("reglas de maestros", () => {
    it("centros: excluye Centro Prueba y rechaza nombre vacío", () => {
        const r = transformarCentros([
            { ID_Centro: "c1", Nombre: " Cesfam Barón ", Estado: BigInt(1) },
            { ID_Centro: "3d3f9a13", Nombre: "Centro Prueba", Estado: 1 },
            { ID_Centro: "c2", Nombre: "", Estado: 1 },
            { ID_Centro: "c3", Nombre: "Inactivo", Estado: 0 }
        ]);
        expect(r.aceptados).toEqual([
            { id: "c1", nombre: "Cesfam Barón", estado: true },
            { id: "c3", nombre: "Inactivo", estado: false }
        ]);
        expect(r.rechazos.map((x) => [x.clave, x.regla])).toEqual([
            ["3d3f9a13", "centro_prueba"],
            ["c2", "campo_requerido"]
        ]);
        expect(r.leidos).toBe(4);
    });

    it("bodegas: rechaza las de Centro Prueba y las de centros inexistentes", () => {
        const r = transformarBodegas(
            [
                { ID_Bodega: "b1", Bodega: "Farmacia", ID_Centro: "c1", Estado: 1 },
                { ID_Bodega: "b2", Bodega: "Prueba", ID_Centro: "3d3f9a13", Estado: 1 },
                { ID_Bodega: "b3", Bodega: "Huérfana", ID_Centro: "cx", Estado: 1 }
            ],
            new Set(["c1"])
        );
        expect(r.aceptados).toEqual([{ id: "b1", nombre: "Farmacia", centroId: "c1", estado: true }]);
        expect(r.rechazos.map((x) => [x.clave, x.regla])).toEqual([
            ["b2", "centro_prueba"],
            ["b3", "centro_inexistente"]
        ]);
    });

    it("unidades: rechaza descripción repetida sin distinguir mayúsculas", () => {
        const r = transformarUnidades([
            { ID_Unidad: "u1", Descripcion: "Caja" },
            { ID_Unidad: "u2", Descripcion: "CAJA " },
            { ID_Unidad: "u3", Descripcion: null }
        ]);
        expect(r.aceptados).toEqual([{ id: "u1", descripcion: "Caja" }]);
        expect(r.rechazos.map((x) => [x.clave, x.regla])).toEqual([
            ["u2", "descripcion_duplicada"],
            ["u3", "campo_requerido"]
        ]);
    });

    it("productos: id numérico, estado activo y campos requeridos", () => {
        const r = transformarProductos([
            { ID_Product: 10, Linea: "Aseo", Descripcion: "Cloro" },
            { ID_Product: 10, Linea: "Aseo", Descripcion: "Repetido" },
            { ID_Product: null, Linea: "Aseo", Descripcion: "Sin id" },
            { ID_Product: 11, Linea: "", Descripcion: "Sin línea" }
        ]);
        expect(r.aceptados).toEqual([{ id: 10, linea: "Aseo", descripcion: "Cloro", estado: true }]);
        expect(r.rechazos.map((x) => x.regla)).toEqual(["clave_duplicada", "clave_nula", "campo_requerido"]);
    });
});
```

- [ ] **Step 2: Ejecutar el test para verificar que falla**

Run: `export PATH=~/.local/bin:$PATH && npx vitest run src/__tests__/migracion-appsheet-maestros.test.ts`
Expected: FAIL (no existe el módulo).

- [ ] **Step 3: Implementar `reglas-maestros.ts`**

```ts
// Reglas de maestros: Centro, Bodega, Unidad y Producto (spec, sección 5.1).

// migracion
import { claveUnica, entero, estado, nuevaTabla, rechazo, recortar, texto } from "./normalizar";
import {
    CENTRO_PRUEBA_ID,
    type BodegaDestino,
    type BodegaOrigen,
    type CentroDestino,
    type CentroOrigen,
    type ProductoDestino,
    type ProductoOrigen,
    type TablaTransformada,
    type UnidadDestino,
    type UnidadOrigen
} from "./tipos";

export function transformarCentros(filas: CentroOrigen[]): TablaTransformada<CentroDestino> {
    const resultado = nuevaTabla<CentroDestino>(filas.length);
    const vistos = new Set<string>();
    for (const fila of filas) {
        const id = claveUnica("Centro", fila.ID_Centro, vistos, resultado);
        if (id === null) continue;
        if (id === CENTRO_PRUEBA_ID) {
            resultado.rechazos.push(rechazo("Centro", id, "centro_prueba", "Centro de prueba excluido de la migración"));
            continue;
        }
        const nombre = texto(fila.Nombre);
        if (nombre === null) {
            resultado.rechazos.push(rechazo("Centro", id, "campo_requerido", "Nombre vacío"));
            continue;
        }
        resultado.aceptados.push({ id, nombre: recortar(nombre), estado: estado(fila.Estado) });
    }
    return resultado;
}

export function transformarBodegas(filas: BodegaOrigen[], centros: Set<string>): TablaTransformada<BodegaDestino> {
    const resultado = nuevaTabla<BodegaDestino>(filas.length);
    const vistos = new Set<string>();
    for (const fila of filas) {
        const id = claveUnica("Bodega", fila.ID_Bodega, vistos, resultado);
        if (id === null) continue;
        const centroId = texto(fila.ID_Centro);
        if (centroId === CENTRO_PRUEBA_ID) {
            resultado.rechazos.push(rechazo("Bodega", id, "centro_prueba", "Bodega del centro de prueba"));
            continue;
        }
        if (centroId === null || !centros.has(centroId)) {
            resultado.rechazos.push(rechazo("Bodega", id, "centro_inexistente", `Centro ${centroId ?? "vacío"} no migrado`));
            continue;
        }
        const nombre = texto(fila.Bodega);
        if (nombre === null) {
            resultado.rechazos.push(rechazo("Bodega", id, "campo_requerido", "Nombre de bodega vacío"));
            continue;
        }
        resultado.aceptados.push({ id, nombre: recortar(nombre), centroId, estado: estado(fila.Estado) });
    }
    return resultado;
}

export function transformarUnidades(filas: UnidadOrigen[]): TablaTransformada<UnidadDestino> {
    const resultado = nuevaTabla<UnidadDestino>(filas.length);
    const vistos = new Set<string>();
    const descripciones = new Set<string>();
    for (const fila of filas) {
        const id = claveUnica("Unidad", fila.ID_Unidad, vistos, resultado);
        if (id === null) continue;
        const descripcion = texto(fila.Descripcion);
        if (descripcion === null) {
            resultado.rechazos.push(rechazo("Unidad", id, "campo_requerido", "Descripción vacía"));
            continue;
        }
        // Descripcion es única en el destino y MySQL compara sin distinguir mayúsculas.
        const claveDescripcion = descripcion.toLowerCase();
        if (descripciones.has(claveDescripcion)) {
            resultado.rechazos.push(rechazo("Unidad", id, "descripcion_duplicada", `Descripción "${descripcion}" repetida`));
            continue;
        }
        descripciones.add(claveDescripcion);
        resultado.aceptados.push({ id, descripcion: recortar(descripcion) });
    }
    return resultado;
}

export function transformarProductos(filas: ProductoOrigen[]): TablaTransformada<ProductoDestino> {
    const resultado = nuevaTabla<ProductoDestino>(filas.length);
    const vistos = new Set<string>();
    for (const fila of filas) {
        const id = entero(fila.ID_Product);
        if (claveUnica("Producto", id, vistos, resultado) === null || id === null) continue;
        const linea = texto(fila.Linea);
        const descripcion = texto(fila.Descripcion);
        if (linea === null || descripcion === null) {
            resultado.rechazos.push(rechazo("Producto", String(id), "campo_requerido", "Línea o descripción vacía"));
            continue;
        }
        resultado.aceptados.push({ id, linea: recortar(linea), descripcion: recortar(descripcion), estado: true });
    }
    return resultado;
}
```

- [ ] **Step 4: Ejecutar test y tipos**

Run: `export PATH=~/.local/bin:$PATH && npx vitest run src/__tests__/migracion-appsheet-maestros.test.ts && npx tsc --noEmit; git checkout tsconfig.tsbuildinfo`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add prisma/scripts/migracion-appsheet/reglas-maestros.ts src/__tests__/migracion-appsheet-maestros.test.ts
git commit -m "feat(migracion): reglas de centros, bodegas, unidades y productos"
```

---

### Task 3: Reglas de usuarios

**Files:**
- Create: `prisma/scripts/migracion-appsheet/reglas-usuarios.ts`
- Test: `src/__tests__/migracion-appsheet-usuarios.test.ts`

**Interfaces:**
- Consumes: Task 1.
- Produces:
  - `interface ContextoUsuarios { centros: Set<string>; bodegas: Map<string, string>; usuariosDestino: UsuarioExistente[]; ordenesPorUsuario: Map<string, number> }`. `bodegas` mapea bodega a centro.
  - `interface UsuariosTransformados { tabla: TablaTransformada<UsuarioDestino>; reasignaciones: Map<string, string> }`
  - `transformarUsuarios(filas: UsuarioOrigen[], contexto: ContextoUsuarios): UsuariosTransformados`. Siempre agrega el usuario técnico al final de `aceptados`.
  - `type ResolverUsuario = (idOrigen: Valor) => { id: string; advertencia: string | null }`
  - `crearResolverUsuario(usuarios: UsuariosTransformados, usuariosDestino: UsuarioExistente[]): ResolverUsuario`
  - `contarOrdenesPorUsuario(ids: Valor[]): Map<string, number>`

Orden de evaluación para cada fila (exacto):
1. Clave.
2. Email requerido.
3. **Email existente en el destino** (solo usuarios del destino cuyo id no está entre los ids del origen): se reasigna al usuario del destino y no se migra la fila.
4. Duplicados de email en el origen: gana el que tiene más órdenes; si empatan, el id menor (`localeCompare`). Los demás se reasignan al ganador.
5. Para el ganador, en orden:
   - rol: R04 pasa a R02 con advertencia; `dac3497d` se rechaza con `rol_no_migrado`; uno fuera de `ROLES_DESTINO` se rechaza con `rol_desconocido`;
   - centro: Centro Prueba se rechaza con `centro_prueba`; un centro no migrado, con `centro_inexistente`;
   - nombre requerido;
   - bodega que no está migrada o que es de otro centro: queda `null` con advertencia `bodega_no_migrada`;
   - email externo: advertencia `email_externo`;
   - teléfono `0` o nulo: `null`.

- [ ] **Step 1: Escribir el test (falla)**

```ts
import { describe, expect, it } from "vitest";

// migracion
import {
    contarOrdenesPorUsuario,
    crearResolverUsuario,
    transformarUsuarios,
    type ContextoUsuarios
} from "../../prisma/scripts/migracion-appsheet/reglas-usuarios";
import type { UsuarioOrigen } from "../../prisma/scripts/migracion-appsheet/tipos";

function usuario(parcial: Partial<UsuarioOrigen>): UsuarioOrigen {
    return {
        ID_User: "u1",
        Nombre: "Ana",
        Ap_Paterno: "Pérez",
        Ap_Materno: null,
        Rol: "R03",
        ID_Bodega: "b1",
        Telefono: 912345678,
        Email: "ana@cmvalparaiso.cl",
        ID_Centro: "c1",
        Estado: 1,
        ...parcial
    };
}

function contexto(parcial: Partial<ContextoUsuarios> = {}): ContextoUsuarios {
    return {
        centros: new Set(["c1", "c2"]),
        bodegas: new Map([["b1", "c1"], ["b2", "c2"]]),
        usuariosDestino: [],
        ordenesPorUsuario: new Map(),
        ...parcial
    };
}

describe("reglas de usuarios", () => {
    it("migra un usuario válido y agrega el usuario técnico al final", () => {
        const r = transformarUsuarios([usuario({})], contexto());
        expect(r.tabla.aceptados[0]).toEqual({
            id: "u1",
            nombre: "Ana",
            apPaterno: "Pérez",
            apMaterno: null,
            rolId: "R03",
            bodegaId: "b1",
            telefono: "912345678",
            email: "ana@cmvalparaiso.cl",
            centroId: "c1",
            estado: true
        });
        expect(r.tabla.aceptados[1]).toMatchObject({
            id: "migracion-appsheet",
            email: "migracion-appsheet@cmvalparaiso.cl",
            rolId: "R01",
            centroId: "centro-administracion-das",
            estado: false
        });
    });

    it("R04 pasa a R02 con advertencia; ADMIN ASEO y roles desconocidos se rechazan", () => {
        const r = transformarUsuarios(
            [
                usuario({ ID_User: "v", Email: "v@cmvalparaiso.cl", Rol: "R04" }),
                usuario({ ID_User: "a", Email: "a@cmvalparaiso.cl", Rol: "dac3497d" }),
                usuario({ ID_User: "q", Email: "q@cmvalparaiso.cl", Rol: "R05" })
            ],
            contexto()
        );
        expect(r.tabla.aceptados.find((u) => u.id === "v")?.rolId).toBe("R02");
        expect(r.tabla.advertencias.map((a) => [a.clave, a.regla])).toContainEqual(["v", "rol_visualizador"]);
        expect(r.tabla.rechazos.map((x) => [x.clave, x.regla])).toEqual([
            ["a", "rol_no_migrado"],
            ["q", "rol_desconocido"]
        ]);
    });

    it("el email existente en el destino se evalúa antes que rol y centro", () => {
        const r = transformarUsuarios(
            [usuario({ ID_User: "x9", Email: " DSantibanez@cmvalparaiso.cl", Rol: "dac3497d", ID_Centro: "3d3f9a13" })],
            contexto({ usuariosDestino: [{ id: "usuario-admin-dsantibanez", email: "dsantibanez@cmvalparaiso.cl" }] })
        );
        expect(r.reasignaciones.get("x9")).toBe("usuario-admin-dsantibanez");
        expect(r.tabla.rechazos).toEqual([]);
        expect(r.tabla.advertencias.map((a) => a.regla)).toEqual(["email_existente_destino"]);
        expect(r.tabla.aceptados.map((u) => u.id)).toEqual(["migracion-appsheet"]);
    });

    it("no reasigna a usuarios del destino que vienen de una ejecución anterior", () => {
        const r = transformarUsuarios([usuario({})], contexto({ usuariosDestino: [{ id: "u1", email: "ana@cmvalparaiso.cl" }] }));
        expect(r.reasignaciones.size).toBe(0);
        expect(r.tabla.aceptados.map((u) => u.id)).toEqual(["u1", "migracion-appsheet"]);
    });

    it("email duplicado: gana el usuario con más órdenes y el otro se reasigna", () => {
        const r = transformarUsuarios(
            [
                usuario({ ID_User: "d4", Email: "ccastillos@cmvalparaiso.cl" }),
                usuario({ ID_User: "1f", Email: "CCastillos@cmvalparaiso.cl" })
            ],
            contexto({ ordenesPorUsuario: new Map([["d4", 2], ["1f", 9]]) })
        );
        expect(r.tabla.aceptados.map((u) => u.id)).toEqual(["1f", "migracion-appsheet"]);
        expect(r.reasignaciones.get("d4")).toBe("1f");
        expect(r.tabla.advertencias.map((a) => [a.clave, a.regla])).toContainEqual(["d4", "email_duplicado"]);
    });

    it("centro de prueba o inexistente se rechaza; bodega de otro centro queda null", () => {
        const r = transformarUsuarios(
            [
                usuario({ ID_User: "p", Email: "p@cmvalparaiso.cl", ID_Centro: "3d3f9a13" }),
                usuario({ ID_User: "i", Email: "i@cmvalparaiso.cl", ID_Centro: "cx" }),
                usuario({ ID_User: "b", Email: "b@cmvalparaiso.cl", ID_Bodega: "b2" })
            ],
            contexto()
        );
        expect(r.tabla.rechazos.map((x) => [x.clave, x.regla])).toEqual([
            ["p", "centro_prueba"],
            ["i", "centro_inexistente"]
        ]);
        expect(r.tabla.aceptados.find((u) => u.id === "b")?.bodegaId).toBeNull();
        expect(r.tabla.advertencias.map((a) => [a.clave, a.regla])).toContainEqual(["b", "bodega_no_migrada"]);
    });

    it("email externo se migra con advertencia y teléfono 0 queda null", () => {
        const r = transformarUsuarios([usuario({ Email: "x@alumnos.upla.cl", Telefono: 0 })], contexto());
        expect(r.tabla.aceptados[0]).toMatchObject({ email: "x@alumnos.upla.cl", telefono: null });
        expect(r.tabla.advertencias.map((a) => a.regla)).toContain("email_externo");
    });

    it("resolver usuario: reasigna, conserva válidos y usa el técnico para inexistentes", () => {
        const usuarios = transformarUsuarios(
            [usuario({ ID_User: "u1" }), usuario({ ID_User: "x9", Email: "admin@cmvalparaiso.cl" })],
            contexto({ usuariosDestino: [{ id: "admin-seed", email: "admin@cmvalparaiso.cl" }] })
        );
        const resolver = crearResolverUsuario(usuarios, [{ id: "admin-seed", email: "admin@cmvalparaiso.cl" }]);
        expect(resolver("u1")).toEqual({ id: "u1", advertencia: null });
        expect(resolver("x9")).toEqual({ id: "admin-seed", advertencia: null });
        expect(resolver("fantasma").id).toBe("migracion-appsheet");
        expect(resolver("fantasma").advertencia).toContain("fantasma");
        expect(resolver(null).id).toBe("migracion-appsheet");
    });

    it("contarOrdenesPorUsuario ignora nulos", () => {
        expect(contarOrdenesPorUsuario(["a", "a", "b", null])).toEqual(new Map([["a", 2], ["b", 1]]));
    });
});
```

- [ ] **Step 2: Ejecutar el test para verificar que falla**

Run: `export PATH=~/.local/bin:$PATH && npx vitest run src/__tests__/migracion-appsheet-usuarios.test.ts`
Expected: FAIL.

- [ ] **Step 3: Implementar `reglas-usuarios.ts`**

```ts
// Reglas de usuarios (spec, sección 5.1): rol, reasignación por email y usuario técnico.

// migracion
import { claveUnica, email, entero, estado, nuevaTabla, rechazo, recortar, texto } from "./normalizar";
import {
    CENTRO_ADMINISTRACION_ID,
    CENTRO_PRUEBA_ID,
    DOMINIO_INSTITUCIONAL,
    ROL_ADMIN_ASEO_ID,
    ROL_ENCARGADO_CENTRO_ID,
    ROL_VISUALIZADOR_ID,
    ROLES_DESTINO,
    USUARIO_TECNICO_EMAIL,
    USUARIO_TECNICO_ID,
    type Rechazo,
    type Resultado,
    type TablaTransformada,
    type UsuarioDestino,
    type UsuarioExistente,
    type UsuarioOrigen,
    type Valor
} from "./tipos";

export interface ContextoUsuarios {
    centros: Set<string>;
    // bodega -> centro, solo bodegas migradas
    bodegas: Map<string, string>;
    usuariosDestino: UsuarioExistente[];
    ordenesPorUsuario: Map<string, number>;
}

export interface UsuariosTransformados {
    tabla: TablaTransformada<UsuarioDestino>;
    // ID AppSheet -> ID destino
    reasignaciones: Map<string, string>;
}

export type ResolverUsuario = (idOrigen: Valor) => { id: string; advertencia: string | null };

interface Candidato {
    id: string;
    correo: string;
    fila: UsuarioOrigen;
}

export const USUARIO_TECNICO: UsuarioDestino = {
    id: USUARIO_TECNICO_ID,
    nombre: "Migración AppSheet",
    apPaterno: null,
    apMaterno: null,
    rolId: "R01",
    bodegaId: null,
    telefono: null,
    email: USUARIO_TECNICO_EMAIL,
    centroId: CENTRO_ADMINISTRACION_ID,
    estado: false
};

export function contarOrdenesPorUsuario(ids: Valor[]): Map<string, number> {
    const conteo = new Map<string, number>();
    for (const valor of ids) {
        const id = texto(valor);
        if (id !== null) conteo.set(id, (conteo.get(id) ?? 0) + 1);
    }
    return conteo;
}

export function transformarUsuarios(filas: UsuarioOrigen[], contexto: ContextoUsuarios): UsuariosTransformados {
    const tabla = nuevaTabla<UsuarioDestino>(filas.length);
    const reasignaciones = new Map<string, string>();
    const vistos = new Set<string>();

    // Solo cuentan usuarios del destino que no vienen de AppSheet (ejecuciones anteriores).
    const idsOrigen = new Set(filas.map((fila) => texto(fila.ID_User)).filter((id): id is string => id !== null));
    const destinoPorEmail = new Map<string, string>();
    for (const existente of contexto.usuariosDestino) {
        if (!idsOrigen.has(existente.id)) destinoPorEmail.set(existente.email.trim().toLowerCase(), existente.id);
    }

    const grupos = new Map<string, Candidato[]>();
    for (const fila of filas) {
        const id = claveUnica("Usuario", fila.ID_User, vistos, tabla);
        if (id === null) continue;
        const correo = email(fila.Email);
        if (correo === null) {
            tabla.rechazos.push(rechazo("Usuario", id, "campo_requerido", "Email vacío"));
            continue;
        }
        const destinoId = destinoPorEmail.get(correo);
        if (destinoId !== undefined) {
            reasignaciones.set(id, destinoId);
            tabla.advertencias.push(rechazo("Usuario", id, "email_existente_destino", `Email ya existe en el destino: se usa ${destinoId}`));
            continue;
        }
        grupos.set(correo, [...(grupos.get(correo) ?? []), { id, correo, fila }]);
    }

    for (const grupo of grupos.values()) {
        const ordenados = [...grupo].sort(
            (a, b) => (contexto.ordenesPorUsuario.get(b.id) ?? 0) - (contexto.ordenesPorUsuario.get(a.id) ?? 0) || a.id.localeCompare(b.id)
        );
        const [principal, ...resto] = ordenados;
        for (const duplicado of resto) {
            reasignaciones.set(duplicado.id, principal.id);
            tabla.advertencias.push(rechazo("Usuario", duplicado.id, "email_duplicado", `Email repetido: se reasigna a ${principal.id}`));
        }
        const resultado = transformarUsuario(principal, contexto);
        if (resultado.ok) {
            tabla.aceptados.push(resultado.data);
            tabla.advertencias.push(...resultado.advertencias);
        } else {
            tabla.rechazos.push(resultado.rechazo);
        }
    }

    tabla.aceptados.push(USUARIO_TECNICO);
    return { tabla, reasignaciones };
}

function transformarUsuario({ id, correo, fila }: Candidato, contexto: ContextoUsuarios): Resultado<UsuarioDestino> {
    const advertencias: Rechazo[] = [];

    const rolOrigen = texto(fila.Rol);
    let rolId: string;
    if (rolOrigen === ROL_VISUALIZADOR_ID) {
        rolId = ROL_ENCARGADO_CENTRO_ID;
        advertencias.push(rechazo("Usuario", id, "rol_visualizador", "R04 VISUALIZADOR se migra como R02 Encargado Centro"));
    } else if (rolOrigen === ROL_ADMIN_ASEO_ID) {
        return { ok: false, rechazo: rechazo("Usuario", id, "rol_no_migrado", "Rol ADMIN ASEO no se migra") };
    } else if (rolOrigen === null || !ROLES_DESTINO.includes(rolOrigen)) {
        return { ok: false, rechazo: rechazo("Usuario", id, "rol_desconocido", `Rol ${rolOrigen ?? "vacío"} no existe en el destino`) };
    } else {
        rolId = rolOrigen;
    }

    const centroId = texto(fila.ID_Centro);
    if (centroId === CENTRO_PRUEBA_ID) {
        return { ok: false, rechazo: rechazo("Usuario", id, "centro_prueba", "Usuario del centro de prueba") };
    }
    if (centroId === null || !contexto.centros.has(centroId)) {
        return { ok: false, rechazo: rechazo("Usuario", id, "centro_inexistente", `Centro ${centroId ?? "vacío"} no migrado`) };
    }

    const nombre = texto(fila.Nombre);
    if (nombre === null) {
        return { ok: false, rechazo: rechazo("Usuario", id, "campo_requerido", "Nombre vacío") };
    }

    let bodegaId = texto(fila.ID_Bodega);
    if (bodegaId !== null && contexto.bodegas.get(bodegaId) !== centroId) {
        advertencias.push(rechazo("Usuario", id, "bodega_no_migrada", `Bodega ${bodegaId} no migrada o de otro centro: queda sin bodega`));
        bodegaId = null;
    }

    if (!correo.endsWith(DOMINIO_INSTITUCIONAL)) {
        advertencias.push(rechazo("Usuario", id, "email_externo", "Email fuera de @cmvalparaiso.cl: no podrá iniciar sesión"));
    }

    const telefono = entero(fila.Telefono);
    const apPaterno = texto(fila.Ap_Paterno);
    const apMaterno = texto(fila.Ap_Materno);

    return {
        ok: true,
        advertencias,
        data: {
            id,
            nombre: recortar(nombre),
            apPaterno: apPaterno === null ? null : recortar(apPaterno),
            apMaterno: apMaterno === null ? null : recortar(apMaterno),
            rolId,
            bodegaId,
            telefono: telefono === null || telefono === 0 ? null : recortar(String(telefono), 30),
            email: recortar(correo),
            centroId,
            estado: estado(fila.Estado)
        }
    };
}

export function crearResolverUsuario(usuarios: UsuariosTransformados, usuariosDestino: UsuarioExistente[]): ResolverUsuario {
    const validos = new Set<string>([...usuarios.tabla.aceptados.map((u) => u.id), ...usuariosDestino.map((u) => u.id)]);
    return (idOrigen) => {
        const id = texto(idOrigen);
        const destino = id === null ? null : (usuarios.reasignaciones.get(id) ?? id);
        if (destino !== null && validos.has(destino)) return { id: destino, advertencia: null };
        return { id: USUARIO_TECNICO_ID, advertencia: `Usuario ${id ?? "vacío"} no migrado: se asigna al usuario técnico` };
    };
}
```

- [ ] **Step 4: Ejecutar test y tipos**

Run: `export PATH=~/.local/bin:$PATH && npx vitest run src/__tests__/migracion-appsheet-usuarios.test.ts && npx tsc --noEmit; git checkout tsconfig.tsbuildinfo`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add prisma/scripts/migracion-appsheet/reglas-usuarios.ts src/__tests__/migracion-appsheet-usuarios.test.ts
git commit -m "feat(migracion): reglas de usuarios con reasignación y usuario técnico"
```

---

### Task 4: Reglas de órdenes y detalles

**Files:**
- Create: `prisma/scripts/migracion-appsheet/reglas-ordenes.ts`
- Test: `src/__tests__/migracion-appsheet-ordenes.test.ts`

**Interfaces:**
- Consumes: Task 1, y `ResolverUsuario` de Task 3 (solo el tipo).
- Produces:
  - `interface ContextoOrdenes { bodegas: Map<string, string>; bodegasPrueba: Set<string>; nombresCentro: Map<string, string>; resolverUsuario: ResolverUsuario }`
  - `transformarEntradas(filas: OrdenEntradaOrigen[], contexto: ContextoOrdenes): TablaTransformada<OrdenEntradaDestino>`
  - `transformarSalidas(filas: OrdenSalidaOrigen[], contexto: ContextoOrdenes): TablaTransformada<OrdenSalidaDestino>`
  - `interface ContextoDetalles { ordenesAceptadas: Set<string>; ordenesOrigen: Set<string>; productos: Set<number> }`
  - `transformarDetallesEntrada(filas: OrdenEntradaDetalleOrigen[], contexto: ContextoDetalles): TablaTransformada<OrdenEntradaDetalleDestino>`
  - `transformarDetallesSalida(filas: OrdenSalidaDetalleOrigen[], contexto: ContextoDetalles): TablaTransformada<OrdenSalidaDetalleDestino>`

Reglas de rechazo:
- **Bodega:**
  - no migrada y presente en `bodegasPrueba`: `centro_prueba`;
  - no migrada en otro caso: `bodega_inexistente`;
  - centro distinto del de la bodega: `centro_no_coincide`, **salvo** salidas `"A Otros Centros"` (ver Global Constraints), que llevan la advertencia `centro_destino`.
- **Fecha nula:** `campo_requerido`. También para `Origen`, `Tipo_Salida`, `Destino` y `Categoria` nulos.
- **Usuario no resoluble:** se asigna el técnico, con advertencia `usuario_inexistente`.
- **Detalle:**
  - orden no aceptada: `orden_no_migrada` si existe en el origen, `orden_inexistente` si no;
  - `producto_inexistente`;
  - `cantidad_invalida` (nula o ≤ 0);
  - lote y caducidad con `normalizarLoteCaducidad`.

- [ ] **Step 1: Escribir el test (falla)**

```ts
import { describe, expect, it } from "vitest";

// migracion
import {
    transformarDetallesEntrada,
    transformarDetallesSalida,
    transformarEntradas,
    transformarSalidas,
    type ContextoOrdenes
} from "../../prisma/scripts/migracion-appsheet/reglas-ordenes";
import type { OrdenEntradaOrigen, OrdenSalidaOrigen } from "../../prisma/scripts/migracion-appsheet/tipos";

const FECHA = new Date(Date.UTC(2026, 9, 1));

function contexto(): ContextoOrdenes {
    return {
        bodegas: new Map([["b1", "c1"], ["b2", "c2"]]),
        bodegasPrueba: new Set(["bp"]),
        nombresCentro: new Map([["c1", "Cesfam Placeres"], ["c2", "Cesfam Padre Damian"]]),
        resolverUsuario: (id) =>
            id === "u1" ? { id: "u1", advertencia: null } : { id: "migracion-appsheet", advertencia: `Usuario ${String(id)} no migrado` }
    };
}

function entrada(parcial: Partial<OrdenEntradaOrigen>): OrdenEntradaOrigen {
    return {
        ID_OrdenEntrada: "e1",
        Fecha: FECHA,
        ID_User: "u1",
        Origen: "Droguería",
        GuiaDespacho: null,
        ID_Centro: "c1",
        ID_Bodega: "b1",
        Codigo_Recepcion: null,
        ...parcial
    };
}

function salida(parcial: Partial<OrdenSalidaOrigen>): OrdenSalidaOrigen {
    return {
        ID_OrdenSalida: "s1",
        Fecha: FECHA,
        ID_User: "u1",
        ID_Bodega: "b1",
        Tipo_Salida: "Consumo",
        ID_Centro: "c1",
        Destino: "Enfermería",
        Codigo_Salida: null,
        Enviar_Correo: "1",
        Correo_Destino: " jefa@cmvalparaiso.cl ",
        ...parcial
    };
}

describe("reglas de órdenes", () => {
    it("entradas: acepta válidas y rechaza bodega de prueba, inexistente y centro distinto", () => {
        const r = transformarEntradas(
            [
                entrada({}),
                entrada({ ID_OrdenEntrada: "e2", ID_Bodega: "bp" }),
                entrada({ ID_OrdenEntrada: "e3", ID_Bodega: "bx" }),
                entrada({ ID_OrdenEntrada: "e4", ID_Centro: "c2" })
            ],
            contexto()
        );
        expect(r.aceptados).toEqual([
            { id: "e1", fecha: FECHA, usuarioId: "u1", origen: "Droguería", guiaDespacho: null, centroId: "c1", bodegaId: "b1", codigoRecepcion: null }
        ]);
        expect(r.rechazos.map((x) => [x.clave, x.regla])).toEqual([
            ["e2", "centro_prueba"],
            ["e3", "bodega_inexistente"],
            ["e4", "centro_no_coincide"]
        ]);
    });

    it("órdenes con usuario inexistente quedan con el usuario técnico y advertencia", () => {
        const r = transformarEntradas([entrada({ ID_User: "fantasma" })], contexto());
        expect(r.aceptados[0].usuarioId).toBe("migracion-appsheet");
        expect(r.advertencias.map((a) => [a.clave, a.regla])).toEqual([["e1", "usuario_inexistente"]]);
    });

    it("salidas: convierte Enviar_Correo y recorta el correo destino", () => {
        const r = transformarSalidas([salida({}), salida({ ID_OrdenSalida: "s2", Enviar_Correo: null, Correo_Destino: "" })], contexto());
        expect(r.aceptados[0]).toEqual({
            id: "s1",
            fecha: FECHA,
            usuarioId: "u1",
            bodegaId: "b1",
            tipoSalida: "Consumo",
            centroId: "c1",
            destino: "Enfermería",
            codigoSalida: null,
            enviarCorreo: true,
            correoDestino: "jefa@cmvalparaiso.cl"
        });
        expect(r.aceptados[1]).toMatchObject({ enviarCorreo: false, correoDestino: null });
    });

    it("salidas A Otros Centros: centro de la bodega y destino con el centro de destino", () => {
        const r = transformarSalidas(
            [salida({ Tipo_Salida: "A Otros Centros", ID_Centro: "c2", Destino: "Aseo" }), salida({ ID_OrdenSalida: "s3", ID_Centro: "c2" })],
            contexto()
        );
        expect(r.aceptados).toHaveLength(1);
        expect(r.aceptados[0]).toMatchObject({ centroId: "c1", destino: "Aseo — Cesfam Padre Damian" });
        expect(r.advertencias.map((a) => [a.clave, a.regla])).toEqual([["s1", "centro_destino"]]);
        expect(r.rechazos.map((x) => [x.clave, x.regla])).toEqual([["s3", "centro_no_coincide"]]);
    });

    it("detalles de entrada: huérfanos, producto inexistente, cantidad inválida y lote vacío", () => {
        const base = { ID_Product: 10, Categoria: "Insumo", Fecha_Caducidad: "2027-01-31", Cantidad: 5, Lote: "L1", ID_OrdenEntrada: "e1" };
        const r = transformarDetallesEntrada(
            [
                { ID_Entrada: "d1", ...base },
                { ID_Entrada: "d2", ...base, ID_OrdenEntrada: "e2" },
                { ID_Entrada: "d3", ...base, ID_OrdenEntrada: "ex" },
                { ID_Entrada: "d4", ...base, ID_Product: 99 },
                { ID_Entrada: "d5", ...base, Cantidad: 0 },
                { ID_Entrada: "d6", ...base, Lote: null, Fecha_Caducidad: null }
            ],
            { ordenesAceptadas: new Set(["e1"]), ordenesOrigen: new Set(["e1", "e2"]), productos: new Set([10]) }
        );
        expect(r.aceptados.map((d) => d.id)).toEqual(["d1", "d6"]);
        expect(r.aceptados[0]).toEqual({
            id: "d1",
            productoId: 10,
            categoria: "Insumo",
            fechaCaducidad: new Date(Date.UTC(2027, 0, 31)),
            cantidad: 5,
            lote: "L1",
            ordenEntradaId: "e1"
        });
        expect(r.aceptados[1]).toMatchObject({ lote: "SIN LOTE", fechaCaducidad: new Date(Date.UTC(2099, 11, 31)) });
        expect(r.rechazos.map((x) => [x.clave, x.regla])).toEqual([
            ["d2", "orden_no_migrada"],
            ["d3", "orden_inexistente"],
            ["d4", "producto_inexistente"],
            ["d5", "cantidad_invalida"]
        ]);
        expect(r.advertencias.map((a) => a.regla)).toEqual(["lote_vacio", "caducidad_nula"]);
    });

    it("detalles de salida: mismo tratamiento sin categoría", () => {
        const r = transformarDetallesSalida(
            [
                { ID_Detalle: "x1", ID_Product: 10, Cantidad: 2, ID_OrdenSalida: "s1", Lote: "L1", Fecha_Caducidad: "2027-01-31" },
                { ID_Detalle: "x2", ID_Product: 10, Cantidad: 2, ID_OrdenSalida: "sx", Lote: "L1", Fecha_Caducidad: "2027-01-31" }
            ],
            { ordenesAceptadas: new Set(["s1"]), ordenesOrigen: new Set(["s1"]), productos: new Set([10]) }
        );
        expect(r.aceptados).toEqual([
            { id: "x1", productoId: 10, cantidad: 2, ordenSalidaId: "s1", lote: "L1", fechaCaducidad: new Date(Date.UTC(2027, 0, 31)) }
        ]);
        expect(r.rechazos.map((x) => x.regla)).toEqual(["orden_inexistente"]);
    });
});
```

- [ ] **Step 2: Ejecutar el test para verificar que falla**

Run: `export PATH=~/.local/bin:$PATH && npx vitest run src/__tests__/migracion-appsheet-ordenes.test.ts`
Expected: FAIL.

- [ ] **Step 3: Implementar `reglas-ordenes.ts`**

```ts
// Reglas de órdenes de entrada y salida, y sus detalles (spec, sección 5.2).

// migracion
import { booleano, claveUnica, entero, fecha, normalizarLoteCaducidad, nuevaTabla, rechazo, recortar, texto } from "./normalizar";
import type { ResolverUsuario } from "./reglas-usuarios";
import {
    TIPO_SALIDA_OTROS_CENTROS,
    type OrdenEntradaDestino,
    type OrdenEntradaDetalleDestino,
    type OrdenEntradaDetalleOrigen,
    type OrdenEntradaOrigen,
    type OrdenSalidaDestino,
    type OrdenSalidaDetalleDestino,
    type OrdenSalidaDetalleOrigen,
    type OrdenSalidaOrigen,
    type Rechazo,
    type Tabla,
    type TablaTransformada,
    type Valor
} from "./tipos";

export interface ContextoOrdenes {
    // bodega -> centro, solo bodegas migradas
    bodegas: Map<string, string>;
    bodegasPrueba: Set<string>;
    nombresCentro: Map<string, string>;
    resolverUsuario: ResolverUsuario;
}

export interface ContextoDetalles {
    ordenesAceptadas: Set<string>;
    ordenesOrigen: Set<string>;
    productos: Set<number>;
}

type BodegaValidada = { ok: true; bodegaId: string; centroBodega: string } | { ok: false; rechazo: Rechazo };

function validarBodega(tabla: Tabla, clave: string, valor: Valor, contexto: ContextoOrdenes): BodegaValidada {
    const bodegaId = texto(valor);
    const centroBodega = bodegaId === null ? undefined : contexto.bodegas.get(bodegaId);
    if (bodegaId !== null && centroBodega !== undefined) return { ok: true, bodegaId, centroBodega };
    if (bodegaId !== null && contexto.bodegasPrueba.has(bodegaId)) {
        return { ok: false, rechazo: rechazo(tabla, clave, "centro_prueba", `Bodega ${bodegaId} del centro de prueba`) };
    }
    return { ok: false, rechazo: rechazo(tabla, clave, "bodega_inexistente", `Bodega ${bodegaId ?? "vacía"} no migrada`) };
}

function resolverUsuario(tabla: Tabla, clave: string, valor: Valor, contexto: ContextoOrdenes, advertencias: Rechazo[]): string {
    const resuelto = contexto.resolverUsuario(valor);
    if (resuelto.advertencia !== null) advertencias.push(rechazo(tabla, clave, "usuario_inexistente", resuelto.advertencia));
    return resuelto.id;
}

export function transformarEntradas(filas: OrdenEntradaOrigen[], contexto: ContextoOrdenes): TablaTransformada<OrdenEntradaDestino> {
    const resultado = nuevaTabla<OrdenEntradaDestino>(filas.length);
    const vistos = new Set<string>();
    for (const fila of filas) {
        const id = claveUnica("OrdenEntrada", fila.ID_OrdenEntrada, vistos, resultado);
        if (id === null) continue;
        const bodega = validarBodega("OrdenEntrada", id, fila.ID_Bodega, contexto);
        if (!bodega.ok) {
            resultado.rechazos.push(bodega.rechazo);
            continue;
        }
        if (texto(fila.ID_Centro) !== bodega.centroBodega) {
            resultado.rechazos.push(rechazo("OrdenEntrada", id, "centro_no_coincide", `Centro ${texto(fila.ID_Centro) ?? "vacío"} distinto al de la bodega`));
            continue;
        }
        const fechaOrden = fecha(fila.Fecha);
        const origen = texto(fila.Origen);
        if (fechaOrden === null || origen === null) {
            resultado.rechazos.push(rechazo("OrdenEntrada", id, "campo_requerido", "Fecha u origen vacío"));
            continue;
        }
        const advertencias: Rechazo[] = [];
        const usuarioId = resolverUsuario("OrdenEntrada", id, fila.ID_User, contexto, advertencias);
        const guiaDespacho = texto(fila.GuiaDespacho);
        const codigoRecepcion = texto(fila.Codigo_Recepcion);
        resultado.aceptados.push({
            id,
            fecha: fechaOrden,
            usuarioId,
            origen: recortar(origen),
            guiaDespacho: guiaDespacho === null ? null : recortar(guiaDespacho),
            centroId: bodega.centroBodega,
            bodegaId: bodega.bodegaId,
            codigoRecepcion: codigoRecepcion === null ? null : recortar(codigoRecepcion)
        });
        resultado.advertencias.push(...advertencias);
    }
    return resultado;
}

export function transformarSalidas(filas: OrdenSalidaOrigen[], contexto: ContextoOrdenes): TablaTransformada<OrdenSalidaDestino> {
    const resultado = nuevaTabla<OrdenSalidaDestino>(filas.length);
    const vistos = new Set<string>();
    for (const fila of filas) {
        const id = claveUnica("OrdenSalida", fila.ID_OrdenSalida, vistos, resultado);
        if (id === null) continue;
        const bodega = validarBodega("OrdenSalida", id, fila.ID_Bodega, contexto);
        if (!bodega.ok) {
            resultado.rechazos.push(bodega.rechazo);
            continue;
        }
        const fechaOrden = fecha(fila.Fecha);
        const tipoSalida = texto(fila.Tipo_Salida);
        let destino = texto(fila.Destino);
        if (fechaOrden === null || tipoSalida === null || destino === null) {
            resultado.rechazos.push(rechazo("OrdenSalida", id, "campo_requerido", "Fecha, tipo de salida o destino vacío"));
            continue;
        }
        const advertencias: Rechazo[] = [];
        const centroOrigen = texto(fila.ID_Centro);
        if (centroOrigen !== bodega.centroBodega) {
            if (tipoSalida !== TIPO_SALIDA_OTROS_CENTROS) {
                resultado.rechazos.push(rechazo("OrdenSalida", id, "centro_no_coincide", `Centro ${centroOrigen ?? "vacío"} distinto al de la bodega`));
                continue;
            }
            // AppSheet guarda en ID_Centro el centro de destino de las salidas "A Otros Centros".
            const nombreDestino = (centroOrigen === null ? undefined : contexto.nombresCentro.get(centroOrigen)) ?? centroOrigen ?? "sin centro";
            destino = `${destino} — ${nombreDestino}`;
            advertencias.push(rechazo("OrdenSalida", id, "centro_destino", `Centro de destino ${nombreDestino} se registra en el destino`));
        }
        const usuarioId = resolverUsuario("OrdenSalida", id, fila.ID_User, contexto, advertencias);
        const codigoSalida = texto(fila.Codigo_Salida);
        const correoDestino = texto(fila.Correo_Destino);
        resultado.aceptados.push({
            id,
            fecha: fechaOrden,
            usuarioId,
            bodegaId: bodega.bodegaId,
            tipoSalida: recortar(tipoSalida),
            centroId: bodega.centroBodega,
            destino: recortar(destino),
            codigoSalida: codigoSalida === null ? null : recortar(codigoSalida),
            enviarCorreo: booleano(fila.Enviar_Correo),
            correoDestino: correoDestino === null ? null : recortar(correoDestino)
        });
        resultado.advertencias.push(...advertencias);
    }
    return resultado;
}

interface DetalleValidado {
    ordenId: string;
    productoId: number;
    cantidad: number;
}

function validarDetalle(tabla: Tabla, clave: string, orden: Valor, producto: Valor, cantidad: Valor, contexto: ContextoDetalles): DetalleValidado | Rechazo {
    const ordenId = texto(orden);
    if (ordenId === null || !contexto.ordenesAceptadas.has(ordenId)) {
        return ordenId !== null && contexto.ordenesOrigen.has(ordenId)
            ? rechazo(tabla, clave, "orden_no_migrada", `Orden ${ordenId} rechazada`)
            : rechazo(tabla, clave, "orden_inexistente", `Orden ${ordenId ?? "vacía"} no existe en el origen`);
    }
    const productoId = entero(producto);
    if (productoId === null || !contexto.productos.has(productoId)) {
        return rechazo(tabla, clave, "producto_inexistente", `Producto ${productoId ?? "vacío"} no migrado`);
    }
    const unidades = entero(cantidad);
    if (unidades === null || unidades <= 0) {
        return rechazo(tabla, clave, "cantidad_invalida", `Cantidad ${unidades ?? "vacía"}`);
    }
    return { ordenId, productoId, cantidad: unidades };
}

function esRechazo(valor: DetalleValidado | Rechazo): valor is Rechazo {
    return "regla" in valor;
}

export function transformarDetallesEntrada(
    filas: OrdenEntradaDetalleOrigen[],
    contexto: ContextoDetalles
): TablaTransformada<OrdenEntradaDetalleDestino> {
    const resultado = nuevaTabla<OrdenEntradaDetalleDestino>(filas.length);
    const vistos = new Set<string>();
    for (const fila of filas) {
        const id = claveUnica("OrdenEntradaDetalle", fila.ID_Entrada, vistos, resultado);
        if (id === null) continue;
        const detalle = validarDetalle("OrdenEntradaDetalle", id, fila.ID_OrdenEntrada, fila.ID_Product, fila.Cantidad, contexto);
        if (esRechazo(detalle)) {
            resultado.rechazos.push(detalle);
            continue;
        }
        const categoria = texto(fila.Categoria);
        if (categoria === null) {
            resultado.rechazos.push(rechazo("OrdenEntradaDetalle", id, "campo_requerido", "Categoría vacía"));
            continue;
        }
        const loteCaducidad = normalizarLoteCaducidad("OrdenEntradaDetalle", id, fila.Lote, fila.Fecha_Caducidad);
        resultado.aceptados.push({
            id,
            productoId: detalle.productoId,
            categoria: recortar(categoria),
            fechaCaducidad: loteCaducidad.fechaCaducidad,
            cantidad: detalle.cantidad,
            lote: loteCaducidad.lote,
            ordenEntradaId: detalle.ordenId
        });
        resultado.advertencias.push(...loteCaducidad.advertencias);
    }
    return resultado;
}

export function transformarDetallesSalida(
    filas: OrdenSalidaDetalleOrigen[],
    contexto: ContextoDetalles
): TablaTransformada<OrdenSalidaDetalleDestino> {
    const resultado = nuevaTabla<OrdenSalidaDetalleDestino>(filas.length);
    const vistos = new Set<string>();
    for (const fila of filas) {
        const id = claveUnica("OrdenSalidaDetalle", fila.ID_Detalle, vistos, resultado);
        if (id === null) continue;
        const detalle = validarDetalle("OrdenSalidaDetalle", id, fila.ID_OrdenSalida, fila.ID_Product, fila.Cantidad, contexto);
        if (esRechazo(detalle)) {
            resultado.rechazos.push(detalle);
            continue;
        }
        const loteCaducidad = normalizarLoteCaducidad("OrdenSalidaDetalle", id, fila.Lote, fila.Fecha_Caducidad);
        resultado.aceptados.push({
            id,
            productoId: detalle.productoId,
            cantidad: detalle.cantidad,
            ordenSalidaId: detalle.ordenId,
            lote: loteCaducidad.lote,
            fechaCaducidad: loteCaducidad.fechaCaducidad
        });
        resultado.advertencias.push(...loteCaducidad.advertencias);
    }
    return resultado;
}
```

- [ ] **Step 4: Ejecutar test y tipos**

Run: `export PATH=~/.local/bin:$PATH && npx vitest run src/__tests__/migracion-appsheet-ordenes.test.ts && npx tsc --noEmit; git checkout tsconfig.tsbuildinfo`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add prisma/scripts/migracion-appsheet/reglas-ordenes.ts src/__tests__/migracion-appsheet-ordenes.test.ts
git commit -m "feat(migracion): reglas de órdenes de entrada y salida con sus detalles"
```

---

### Task 5: Reglas de stock y orquestación

**Files:**
- Create: `prisma/scripts/migracion-appsheet/reglas-stock.ts`
- Create: `prisma/scripts/migracion-appsheet/transformar.ts`
- Test: `src/__tests__/migracion-appsheet-stock.test.ts`

**Interfaces:**
- Consumes: Tasks 1-4.
- Produces:
  - `interface ContextoStock { bodegas: Map<string, string>; bodegasPrueba: Set<string>; productos: Set<number>; ahora: Date }`
  - `transformarStock(filas: StockOrigen[], contexto: ContextoStock): TablaTransformada<StockDestino>`
  - `transformarTodo(origen: DatosOrigen, contexto: ContextoMigracion): MigracionTransformada`

Reglas de stock:
- Bodega: `centro_prueba` o `bodega_inexistente`. Producto: `producto_inexistente`.
- `Cantidad_Disponible` nula pasa a 0, con advertencia `cantidad_nula`. `StockMinimo` nulo pasa a 0.
- `Fecha_Ultima_Actualizacion` nula pasa a `contexto.ahora`.
- **Fusión** por la clave `productoId|bodegaId|lote en minúsculas|YYYY-MM-DD de la caducidad`:
  - se conserva la primera fila (orden de entrada);
  - se suman las cantidades;
  - se toma el `stockMinimo` mayor y la fecha más reciente;
  - la fila absorbida genera la advertencia `stock_fusionado`, con `clave` = id absorbido y detalle `Fusionado en <idPrincipal>`.

- [ ] **Step 1: Escribir el test (falla)**

```ts
import { describe, expect, it } from "vitest";

// migracion
import { transformarStock } from "../../prisma/scripts/migracion-appsheet/reglas-stock";
import { transformarTodo } from "../../prisma/scripts/migracion-appsheet/transformar";
import type { DatosOrigen, StockOrigen } from "../../prisma/scripts/migracion-appsheet/tipos";

const AHORA = new Date(Date.UTC(2026, 9, 29, 12));

function stock(parcial: Partial<StockOrigen>): StockOrigen {
    return {
        ID_Stock: "s1",
        ID_Product: 10,
        ID_Bodega: "b1",
        Cantidad_Disponible: 5,
        Fecha_Ultima_Actualizacion: "2026-10-01",
        StockMinimo: 2,
        Lote: "L1",
        Fecha_Caducidad: "2027-01-31",
        ...parcial
    };
}

const CONTEXTO_STOCK = { bodegas: new Map([["b1", "c1"]]), bodegasPrueba: new Set(["bp"]), productos: new Set([10]), ahora: AHORA };

describe("reglas de stock", () => {
    it("fusiona claves duplicadas sumando cantidades", () => {
        const r = transformarStock(
            [
                stock({}),
                stock({ ID_Stock: "s2", Lote: " l1 ", Cantidad_Disponible: 3, StockMinimo: 7, Fecha_Ultima_Actualizacion: "2026-10-20" })
            ],
            CONTEXTO_STOCK
        );
        expect(r.aceptados).toEqual([
            {
                id: "s1",
                productoId: 10,
                bodegaId: "b1",
                cantidadDisponible: 8,
                fechaUltimaActualizacion: new Date(Date.UTC(2026, 9, 20)),
                stockMinimo: 7,
                lote: "L1",
                fechaCaducidad: new Date(Date.UTC(2027, 0, 31))
            }
        ]);
        expect(r.advertencias.map((a) => [a.clave, a.regla, a.detalle])).toEqual([["s2", "stock_fusionado", "Fusionado en s1"]]);
    });

    it("rechaza bodega de prueba, bodega y producto inexistentes; cantidad nula pasa a 0", () => {
        const r = transformarStock(
            [
                stock({ ID_Stock: "a", ID_Bodega: "bp" }),
                stock({ ID_Stock: "b", ID_Bodega: "bx" }),
                stock({ ID_Stock: "c", ID_Product: 99 }),
                stock({ ID_Stock: "d", Cantidad_Disponible: null, Lote: null, Fecha_Ultima_Actualizacion: null })
            ],
            CONTEXTO_STOCK
        );
        expect(r.rechazos.map((x) => [x.clave, x.regla])).toEqual([
            ["a", "centro_prueba"],
            ["b", "bodega_inexistente"],
            ["c", "producto_inexistente"]
        ]);
        expect(r.aceptados[0]).toMatchObject({ id: "d", cantidadDisponible: 0, lote: "SIN LOTE", fechaUltimaActualizacion: AHORA });
        expect(r.advertencias.map((a) => a.regla)).toEqual(["cantidad_nula", "lote_vacio"]);
    });
});

describe("transformarTodo", () => {
    function origen(): DatosOrigen {
        return {
            centros: [
                { ID_Centro: "c1", Nombre: "Cesfam Placeres", Estado: 1 },
                { ID_Centro: "3d3f9a13", Nombre: "Centro Prueba", Estado: 1 }
            ],
            bodegas: [
                { ID_Bodega: "b1", Bodega: "Farmacia", ID_Centro: "c1", Estado: 1 },
                { ID_Bodega: "bp", Bodega: "Prueba", ID_Centro: "3d3f9a13", Estado: 1 }
            ],
            unidades: [{ ID_Unidad: "u", Descripcion: "Caja" }],
            productos: [{ ID_Product: 10, Linea: "Aseo", Descripcion: "Cloro" }],
            usuarios: [
                {
                    ID_User: "u1",
                    Nombre: "Ana",
                    Ap_Paterno: null,
                    Ap_Materno: null,
                    Rol: "R03",
                    ID_Bodega: "b1",
                    Telefono: null,
                    Email: "ana@cmvalparaiso.cl",
                    ID_Centro: "c1",
                    Estado: 1
                }
            ],
            entradas: [
                { ID_OrdenEntrada: "e1", Fecha: "2026-10-01", ID_User: "u1", Origen: "Droguería", GuiaDespacho: null, ID_Centro: "c1", ID_Bodega: "b1", Codigo_Recepcion: null },
                { ID_OrdenEntrada: "e2", Fecha: "2026-10-01", ID_User: "u1", Origen: "Droguería", GuiaDespacho: null, ID_Centro: "3d3f9a13", ID_Bodega: "bp", Codigo_Recepcion: null }
            ],
            entradaDetalles: [
                { ID_Entrada: "d1", ID_Product: 10, Categoria: "Insumo", Fecha_Caducidad: "2027-01-31", Cantidad: 5, Lote: "L1", ID_OrdenEntrada: "e1" },
                { ID_Entrada: "d2", ID_Product: 10, Categoria: "Insumo", Fecha_Caducidad: "2027-01-31", Cantidad: 5, Lote: "L1", ID_OrdenEntrada: "e2" }
            ],
            salidas: [
                {
                    ID_OrdenSalida: "s1",
                    Fecha: "2026-10-02",
                    ID_User: "fantasma",
                    ID_Bodega: "b1",
                    Tipo_Salida: "Consumo",
                    ID_Centro: "c1",
                    Destino: "Enfermería",
                    Codigo_Salida: null,
                    Enviar_Correo: null,
                    Correo_Destino: null
                }
            ],
            salidaDetalles: [{ ID_Detalle: "x1", ID_Product: 10, Cantidad: 1, ID_OrdenSalida: "s1", Lote: "L1", Fecha_Caducidad: "2027-01-31" }],
            stock: [stock({})]
        };
    }

    it("encadena las reglas: excluye Centro Prueba en cascada y asigna el usuario técnico", () => {
        const r = transformarTodo(origen(), { usuariosDestino: [], ahora: AHORA });
        expect(r.Centro.aceptados.map((c) => c.id)).toEqual(["c1"]);
        expect(r.Bodega.rechazos.map((x) => x.regla)).toEqual(["centro_prueba"]);
        expect(r.OrdenEntrada.rechazos.map((x) => [x.clave, x.regla])).toEqual([["e2", "centro_prueba"]]);
        expect(r.OrdenEntradaDetalle.rechazos.map((x) => [x.clave, x.regla])).toEqual([["d2", "orden_no_migrada"]]);
        expect(r.OrdenSalida.aceptados[0].usuarioId).toBe("migracion-appsheet");
        expect(r.OrdenSalidaDetalle.aceptados).toHaveLength(1);
        expect(r.Stock.aceptados).toHaveLength(1);
        expect(r.Usuario.aceptados.map((u) => u.id)).toEqual(["u1", "migracion-appsheet"]);
    });

    it("es determinista", () => {
        const a = transformarTodo(origen(), { usuariosDestino: [], ahora: AHORA });
        const b = transformarTodo(origen(), { usuariosDestino: [], ahora: AHORA });
        expect(a).toEqual(b);
    });

    it("reasigna órdenes de un usuario cuyo email ya existe en el destino", () => {
        const r = transformarTodo(origen(), { usuariosDestino: [{ id: "admin-seed", email: "ana@cmvalparaiso.cl" }], ahora: AHORA });
        expect(r.reasignaciones).toEqual({ u1: "admin-seed" });
        expect(r.OrdenEntrada.aceptados[0].usuarioId).toBe("admin-seed");
    });
});
```

- [ ] **Step 2: Ejecutar el test para verificar que falla**

Run: `export PATH=~/.local/bin:$PATH && npx vitest run src/__tests__/migracion-appsheet-stock.test.ts`
Expected: FAIL.

- [ ] **Step 3: Implementar `reglas-stock.ts`**

```ts
// Reglas de stock (spec, sección 5.3): la tabla Stock de AppSheet es la fuente de verdad.

// migracion
import { claveFecha, claveUnica, entero, fecha, normalizarLoteCaducidad, nuevaTabla, rechazo, texto } from "./normalizar";
import type { StockDestino, StockOrigen, TablaTransformada } from "./tipos";

export interface ContextoStock {
    // bodega -> centro, solo bodegas migradas
    bodegas: Map<string, string>;
    bodegasPrueba: Set<string>;
    productos: Set<number>;
    ahora: Date;
}

export function transformarStock(filas: StockOrigen[], contexto: ContextoStock): TablaTransformada<StockDestino> {
    const resultado = nuevaTabla<StockDestino>(filas.length);
    const vistos = new Set<string>();
    const porClave = new Map<string, StockDestino>();

    for (const fila of filas) {
        const id = claveUnica("Stock", fila.ID_Stock, vistos, resultado);
        if (id === null) continue;

        const bodegaId = texto(fila.ID_Bodega);
        if (bodegaId === null || !contexto.bodegas.has(bodegaId)) {
            const regla = bodegaId !== null && contexto.bodegasPrueba.has(bodegaId) ? "centro_prueba" : "bodega_inexistente";
            resultado.rechazos.push(rechazo("Stock", id, regla, `Bodega ${bodegaId ?? "vacía"} no migrada (cantidad ${entero(fila.Cantidad_Disponible) ?? 0})`));
            continue;
        }
        const productoId = entero(fila.ID_Product);
        if (productoId === null || !contexto.productos.has(productoId)) {
            resultado.rechazos.push(rechazo("Stock", id, "producto_inexistente", `Producto ${productoId ?? "vacío"} no migrado (cantidad ${entero(fila.Cantidad_Disponible) ?? 0})`));
            continue;
        }

        let cantidadDisponible = entero(fila.Cantidad_Disponible);
        if (cantidadDisponible === null) {
            cantidadDisponible = 0;
            resultado.advertencias.push(rechazo("Stock", id, "cantidad_nula", "Cantidad disponible nula: se usa 0"));
        }
        const loteCaducidad = normalizarLoteCaducidad("Stock", id, fila.Lote, fila.Fecha_Caducidad);
        resultado.advertencias.push(...loteCaducidad.advertencias);

        const filaDestino: StockDestino = {
            id,
            productoId,
            bodegaId,
            cantidadDisponible,
            fechaUltimaActualizacion: fecha(fila.Fecha_Ultima_Actualizacion) ?? contexto.ahora,
            stockMinimo: entero(fila.StockMinimo) ?? 0,
            lote: loteCaducidad.lote,
            fechaCaducidad: loteCaducidad.fechaCaducidad
        };

        // stock_lote_unico: MySQL compara el lote sin distinguir mayúsculas.
        const clave = `${productoId}|${bodegaId}|${loteCaducidad.lote.toLowerCase()}|${claveFecha(loteCaducidad.fechaCaducidad)}`;
        const principal = porClave.get(clave);
        if (principal === undefined) {
            porClave.set(clave, filaDestino);
            resultado.aceptados.push(filaDestino);
            continue;
        }
        principal.cantidadDisponible += filaDestino.cantidadDisponible;
        principal.stockMinimo = Math.max(principal.stockMinimo, filaDestino.stockMinimo);
        if (filaDestino.fechaUltimaActualizacion > principal.fechaUltimaActualizacion) {
            principal.fechaUltimaActualizacion = filaDestino.fechaUltimaActualizacion;
        }
        resultado.advertencias.push(rechazo("Stock", id, "stock_fusionado", `Fusionado en ${principal.id}`));
    }
    return resultado;
}
```

- [ ] **Step 4: Implementar `transformar.ts`**

```ts
// Orquesta las reglas en el orden de dependencias (spec, sección 6.1).

// migracion
import { texto } from "./normalizar";
import { transformarBodegas, transformarCentros, transformarProductos, transformarUnidades } from "./reglas-maestros";
import { transformarDetallesEntrada, transformarDetallesSalida, transformarEntradas, transformarSalidas } from "./reglas-ordenes";
import { transformarStock } from "./reglas-stock";
import { contarOrdenesPorUsuario, crearResolverUsuario, transformarUsuarios } from "./reglas-usuarios";
import { CENTRO_PRUEBA_ID, type ContextoMigracion, type DatosOrigen, type MigracionTransformada, type Valor } from "./tipos";

function idsTexto(valores: Valor[]): Set<string> {
    return new Set(valores.map((valor) => texto(valor)).filter((id): id is string => id !== null));
}

export function transformarTodo(origen: DatosOrigen, contexto: ContextoMigracion): MigracionTransformada {
    const Centro = transformarCentros(origen.centros);
    const centros = new Set(Centro.aceptados.map((centro) => centro.id));

    const Bodega = transformarBodegas(origen.bodegas, centros);
    const bodegas = new Map(Bodega.aceptados.map((bodega) => [bodega.id, bodega.centroId]));
    const bodegasPrueba = idsTexto(origen.bodegas.filter((bodega) => texto(bodega.ID_Centro) === CENTRO_PRUEBA_ID).map((bodega) => bodega.ID_Bodega));

    const nombresCentro = new Map<string, string>();
    for (const centro of origen.centros) {
        const id = texto(centro.ID_Centro);
        const nombre = texto(centro.Nombre);
        if (id !== null && nombre !== null) nombresCentro.set(id, nombre);
    }

    const Unidad = transformarUnidades(origen.unidades);
    const Producto = transformarProductos(origen.productos);
    const productos = new Set(Producto.aceptados.map((producto) => producto.id));

    const usuarios = transformarUsuarios(origen.usuarios, {
        centros,
        bodegas,
        usuariosDestino: contexto.usuariosDestino,
        ordenesPorUsuario: contarOrdenesPorUsuario([...origen.entradas.map((e) => e.ID_User), ...origen.salidas.map((s) => s.ID_User)])
    });
    const contextoOrdenes = { bodegas, bodegasPrueba, nombresCentro, resolverUsuario: crearResolverUsuario(usuarios, contexto.usuariosDestino) };

    const OrdenEntrada = transformarEntradas(origen.entradas, contextoOrdenes);
    const OrdenSalida = transformarSalidas(origen.salidas, contextoOrdenes);

    const OrdenEntradaDetalle = transformarDetallesEntrada(origen.entradaDetalles, {
        ordenesAceptadas: new Set(OrdenEntrada.aceptados.map((orden) => orden.id)),
        ordenesOrigen: idsTexto(origen.entradas.map((orden) => orden.ID_OrdenEntrada)),
        productos
    });
    const OrdenSalidaDetalle = transformarDetallesSalida(origen.salidaDetalles, {
        ordenesAceptadas: new Set(OrdenSalida.aceptados.map((orden) => orden.id)),
        ordenesOrigen: idsTexto(origen.salidas.map((orden) => orden.ID_OrdenSalida)),
        productos
    });

    const Stock = transformarStock(origen.stock, { bodegas, bodegasPrueba, productos, ahora: contexto.ahora });

    return {
        Centro,
        Bodega,
        Unidad,
        Producto,
        Usuario: usuarios.tabla,
        OrdenEntrada,
        OrdenEntradaDetalle,
        OrdenSalida,
        OrdenSalidaDetalle,
        Stock,
        reasignaciones: Object.fromEntries(usuarios.reasignaciones)
    };
}
```

- [ ] **Step 5: Ejecutar test y tipos**

Run: `export PATH=~/.local/bin:$PATH && npx vitest run src/__tests__/migracion-appsheet-stock.test.ts && npx tsc --noEmit; git checkout tsconfig.tsbuildinfo`
Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add prisma/scripts/migracion-appsheet/reglas-stock.ts prisma/scripts/migracion-appsheet/transformar.ts src/__tests__/migracion-appsheet-stock.test.ts
git commit -m "feat(migracion): reglas de stock con fusión y orquestación de la transformación"
```

---

### Task 6: Reporte, validación y opciones

**Files:**
- Create: `prisma/scripts/migracion-appsheet/reporte.ts`
- Create: `prisma/scripts/migracion-appsheet/opciones.ts`
- Test: `src/__tests__/migracion-appsheet-reporte.test.ts`

**Interfaces:**
- Consumes: `MigracionTransformada`, `TABLAS`, `Tabla` y `Rechazo` (Task 1). Los tests usan `transformarTodo` (Task 5).
- Produces:
  - `interface ResumenTabla { tabla: Tabla; leidos: number; aceptados: number; rechazados: number; advertencias: number; insertados: number | null }`
  - `construirResumen(migracion: MigracionTransformada, insertados: Partial<Record<Tabla, number>> | null): ResumenTabla[]`
  - `aCsv(filas: Rechazo[]): string`
  - `interface Diferencia { tabla: Tabla; clave: string; detalle: string }`
  - `interface DestinoCargado { ids: Record<Tabla, string[]>; stock: { id: string; cantidadDisponible: number }[] }`
  - `validarCarga(migracion: MigracionTransformada, destino: DestinoCargado): Diferencia[]`
  - `archivosReporte(migracion: MigracionTransformada, resumen: ResumenTabla[], diferencias: Diferencia[] | null): Record<string, string>`
  - `interface Opciones { ejecutar: boolean; vaciar: string | null; salida: string; origenEnv: string }`
  - `leerOpciones(args: string[], marca: string): Opciones`
  - `nombreBase(url: string): string`
  - `validarOpciones(opciones: Opciones, baseDestino: string): void`

*Ruling sobre la spec (sección 7.2):* la validación compara **fila por fila**. Cada fila aceptada debe existir en el destino, y la cantidad de cada fila de stock debe coincidir con la esperada. Esto implica las sumas por bodega y por lote, y además localiza la diferencia.

- [ ] **Step 1: Escribir el test (falla)**

```ts
import { describe, expect, it } from "vitest";

// migracion
import { leerOpciones, nombreBase, validarOpciones } from "../../prisma/scripts/migracion-appsheet/opciones";
import { aCsv, archivosReporte, construirResumen, validarCarga, type DestinoCargado } from "../../prisma/scripts/migracion-appsheet/reporte";
import { transformarTodo } from "../../prisma/scripts/migracion-appsheet/transformar";
import { TABLAS, type DatosOrigen, type Tabla } from "../../prisma/scripts/migracion-appsheet/tipos";

function origenMinimo(): DatosOrigen {
    return {
        centros: [{ ID_Centro: "c1", Nombre: "Cesfam", Estado: 1 }],
        bodegas: [{ ID_Bodega: "b1", Bodega: "Farmacia", ID_Centro: "c1", Estado: 1 }],
        unidades: [],
        productos: [{ ID_Product: 10, Linea: "Aseo", Descripcion: "Cloro" }],
        usuarios: [],
        entradas: [],
        entradaDetalles: [],
        salidas: [],
        salidaDetalles: [],
        stock: [
            { ID_Stock: "s1", ID_Product: 10, ID_Bodega: "b1", Cantidad_Disponible: 4, Fecha_Ultima_Actualizacion: "2026-10-01", StockMinimo: 0, Lote: "L1", Fecha_Caducidad: "2027-01-31" },
            { ID_Stock: "s2", ID_Product: 99, ID_Bodega: "b1", Cantidad_Disponible: 1, Fecha_Ultima_Actualizacion: "2026-10-01", StockMinimo: 0, Lote: "L1", Fecha_Caducidad: "2027-01-31" }
        ]
    };
}

const MIGRACION = transformarTodo(origenMinimo(), { usuariosDestino: [], ahora: new Date(Date.UTC(2026, 9, 29)) });

function destinoCompleto(): DestinoCargado {
    const ids = Object.fromEntries(
        TABLAS.map((tabla) => [tabla, (MIGRACION[tabla].aceptados as { id: string | number }[]).map((fila) => String(fila.id))])
    ) as Record<Tabla, string[]>;
    return { ids, stock: MIGRACION.Stock.aceptados.map((fila) => ({ id: fila.id, cantidadDisponible: fila.cantidadDisponible })) };
}

describe("reporte", () => {
    it("construirResumen cuenta por tabla en el orden de TABLAS", () => {
        const resumen = construirResumen(MIGRACION, { Stock: 1 });
        expect(resumen.map((r) => r.tabla)).toEqual([...TABLAS]);
        expect(resumen.find((r) => r.tabla === "Stock")).toEqual({ tabla: "Stock", leidos: 2, aceptados: 1, rechazados: 1, advertencias: 0, insertados: 1 });
        expect(resumen.find((r) => r.tabla === "Centro")?.insertados).toBe(0);
        expect(construirResumen(MIGRACION, null)[0].insertados).toBeNull();
    });

    it("aCsv escapa comillas", () => {
        expect(aCsv([{ tabla: "Stock", clave: "s2", regla: "producto_inexistente", detalle: 'Producto "99"' }])).toBe(
            'clave,regla,detalle\n"s2","producto_inexistente","Producto ""99"""\n'
        );
    });

    it("archivosReporte incluye resumen, rechazos no vacíos, reasignaciones y validación", () => {
        const archivos = archivosReporte(MIGRACION, construirResumen(MIGRACION, null), []);
        expect(Object.keys(archivos).sort()).toEqual(["reasignaciones.json", "rechazos-Stock.csv", "resumen.json", "validacion.json"]);
        expect(Object.keys(archivosReporte(MIGRACION, [], null))).not.toContain("validacion.json");
    });

    it("validarCarga no informa diferencias si el destino coincide", () => {
        expect(validarCarga(MIGRACION, destinoCompleto())).toEqual([]);
    });

    it("validarCarga informa filas faltantes y cantidades distintas", () => {
        const destino = destinoCompleto();
        destino.ids.Centro = [];
        destino.stock = [{ id: "s1", cantidadDisponible: 3 }];
        expect(validarCarga(MIGRACION, destino)).toEqual([
            { tabla: "Centro", clave: "c1", detalle: "Fila aceptada que no está en el destino" },
            { tabla: "Stock", clave: "s1", detalle: "Cantidad esperada 4, obtenida 3" }
        ]);
    });
});

describe("opciones", () => {
    it("leerOpciones interpreta banderas y valores por defecto", () => {
        expect(leerOpciones([], "M")).toEqual({ ejecutar: false, vaciar: null, salida: "migracion-appsheet-M", origenEnv: ".env.migracion" });
        expect(leerOpciones(["--ejecutar", "--vaciar=inventario_cmv", "--salida=/tmp/r", "--origen-env=/srv/.env.migracion"], "M")).toEqual({
            ejecutar: true,
            vaciar: "inventario_cmv",
            salida: "/tmp/r",
            origenEnv: "/srv/.env.migracion"
        });
    });

    it("nombreBase extrae la base de la URL", () => {
        expect(nombreBase("mysql://u:p@localhost:3306/inventario_cmv?connection_limit=1")).toBe("inventario_cmv");
    });

    it("validarOpciones exige --ejecutar y el nombre exacto de la base para vaciar", () => {
        const base = { ejecutar: true, vaciar: "inventario_cmv", salida: "x", origenEnv: ".env.migracion" };
        expect(() => validarOpciones(base, "inventario_cmv")).not.toThrow();
        expect(() => validarOpciones({ ...base, ejecutar: false }, "inventario_cmv")).toThrow(/--vaciar exige --ejecutar/);
        expect(() => validarOpciones({ ...base, vaciar: "otra" }, "inventario_cmv")).toThrow(/inventario_cmv/);
        expect(() => validarOpciones({ ...base, vaciar: null, ejecutar: false }, "inventario_cmv")).not.toThrow();
    });
});
```

- [ ] **Step 2: Ejecutar el test para verificar que falla**

Run: `export PATH=~/.local/bin:$PATH && npx vitest run src/__tests__/migracion-appsheet-reporte.test.ts`
Expected: FAIL.

- [ ] **Step 3: Implementar `reporte.ts`**

```ts
// Reporte de la migración y validación posterior a la carga (spec, secciones 6.3 y 7.2).

// migracion
import { TABLAS, type MigracionTransformada, type Rechazo, type Tabla } from "./tipos";

export interface ResumenTabla {
    tabla: Tabla;
    leidos: number;
    aceptados: number;
    rechazados: number;
    advertencias: number;
    insertados: number | null;
}

export interface Diferencia {
    tabla: Tabla;
    clave: string;
    detalle: string;
}

export interface DestinoCargado {
    ids: Record<Tabla, string[]>;
    stock: { id: string; cantidadDisponible: number }[];
}

export function construirResumen(migracion: MigracionTransformada, insertados: Partial<Record<Tabla, number>> | null): ResumenTabla[] {
    return TABLAS.map((tabla) => {
        const datos = migracion[tabla];
        return {
            tabla,
            leidos: datos.leidos,
            aceptados: datos.aceptados.length,
            rechazados: datos.rechazos.length,
            advertencias: datos.advertencias.length,
            insertados: insertados === null ? null : (insertados[tabla] ?? 0)
        };
    });
}

function celda(valor: string): string {
    return `"${valor.replace(/"/g, '""')}"`;
}

export function aCsv(filas: Rechazo[]): string {
    const lineas = filas.map((fila) => [fila.clave, fila.regla, fila.detalle].map(celda).join(","));
    return ["clave,regla,detalle", ...lineas].join("\n") + "\n";
}

export function validarCarga(migracion: MigracionTransformada, destino: DestinoCargado): Diferencia[] {
    const diferencias: Diferencia[] = [];
    for (const tabla of TABLAS) {
        const presentes = new Set(destino.ids[tabla]);
        for (const fila of migracion[tabla].aceptados) {
            const clave = String(fila.id);
            if (!presentes.has(clave)) diferencias.push({ tabla, clave, detalle: "Fila aceptada que no está en el destino" });
        }
    }
    const cantidades = new Map(destino.stock.map((fila) => [fila.id, fila.cantidadDisponible]));
    for (const fila of migracion.Stock.aceptados) {
        const obtenida = cantidades.get(fila.id);
        if (obtenida !== undefined && obtenida !== fila.cantidadDisponible) {
            diferencias.push({ tabla: "Stock", clave: fila.id, detalle: `Cantidad esperada ${fila.cantidadDisponible}, obtenida ${obtenida}` });
        }
    }
    return diferencias;
}

function json(valor: unknown): string {
    return JSON.stringify(valor, null, 4) + "\n";
}

export function archivosReporte(migracion: MigracionTransformada, resumen: ResumenTabla[], diferencias: Diferencia[] | null): Record<string, string> {
    const archivos: Record<string, string> = { "resumen.json": json(resumen), "reasignaciones.json": json(migracion.reasignaciones) };
    for (const tabla of TABLAS) {
        const datos = migracion[tabla];
        if (datos.rechazos.length > 0) archivos[`rechazos-${tabla}.csv`] = aCsv(datos.rechazos);
        if (datos.advertencias.length > 0) archivos[`advertencias-${tabla}.csv`] = aCsv(datos.advertencias);
    }
    if (diferencias !== null) archivos["validacion.json"] = json({ diferencias: diferencias.length, detalle: diferencias });
    return archivos;
}
```

- [ ] **Step 4: Implementar `opciones.ts`**

```ts
// Argumentos de línea de comandos de npm run migracion:appsheet.

export interface Opciones {
    ejecutar: boolean;
    vaciar: string | null;
    salida: string;
    origenEnv: string;
}

export function leerOpciones(args: string[], marca: string): Opciones {
    const valor = (nombre: string): string | null => {
        const argumento = args.find((arg) => arg.startsWith(`--${nombre}=`));
        return argumento === undefined ? null : argumento.slice(nombre.length + 3);
    };
    return {
        ejecutar: args.includes("--ejecutar"),
        vaciar: valor("vaciar"),
        salida: valor("salida") ?? `migracion-appsheet-${marca}`,
        origenEnv: valor("origen-env") ?? ".env.migracion"
    };
}

export function nombreBase(url: string): string {
    return new URL(url).pathname.replace(/^\//, "");
}

// --vaciar borra datos del destino: exige --ejecutar y repetir el nombre de la base para evitar vaciar la equivocada.
export function validarOpciones(opciones: Opciones, baseDestino: string): void {
    if (opciones.vaciar !== null && (!opciones.ejecutar || opciones.vaciar !== baseDestino)) {
        throw new Error(`--vaciar exige --ejecutar y repetir el nombre de la base de destino (${baseDestino})`);
    }
}
```

- [ ] **Step 5: Ejecutar test y tipos**

Run: `export PATH=~/.local/bin:$PATH && npx vitest run src/__tests__/migracion-appsheet-reporte.test.ts && npx tsc --noEmit; git checkout tsconfig.tsbuildinfo`
Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add prisma/scripts/migracion-appsheet/reporte.ts prisma/scripts/migracion-appsheet/opciones.ts src/__tests__/migracion-appsheet-reporte.test.ts
git commit -m "feat(migracion): reporte, validación de la carga y opciones del script"
```

---

### Task 7: Script `migrar.ts`, comando npm, auditoría y guía

**Files:**
- Create: `prisma/scripts/migracion-appsheet/migrar.ts`
- Modify: `package.json` (scripts)
- Modify: `src/modules/auditoria/schemas/auditoria.schema.ts:10` (enum `accion`)
- Modify: `src/modules/auditoria/components/auditoria-filtros.tsx:261` (opción del filtro)
- Modify: `src/__tests__/auditoria-schema.test.ts`
- Modify: `docs/guias/deploy-produccion.md` (sección 6)

**Interfaces:**
- Consumes: todo lo anterior.
- Produces: el comando `npm run migracion:appsheet -- [--ejecutar] [--vaciar=<base>] [--salida=<dir>] [--origen-env=<ruta>]`.

- [ ] **Step 1: Test de auditoría (falla)**

Agregar a `src/__tests__/auditoria-schema.test.ts`, dentro del `describe` existente:

```ts
    it("acepta la acción migracion", () => {
        expect(filtroAuditoriaSchema.parse({ accion: "migracion" }).accion).toBe("migracion");
    });
```

Run: `export PATH=~/.local/bin:$PATH && npx vitest run src/__tests__/auditoria-schema.test.ts`
Expected: FAIL.

- [ ] **Step 2: Agregar la acción `migracion`**

En `src/modules/auditoria/schemas/auditoria.schema.ts`:

```ts
    accion: z.enum(["todas", "crear", "actualizar", "eliminar", "enviar_correo", "migracion"]).default("todas"),
```

En `src/modules/auditoria/components/auditoria-filtros.tsx`, después de la opción `enviar_correo`:

```tsx
                        <option value="migracion">Migración</option>
```

Run: `export PATH=~/.local/bin:$PATH && npx vitest run src/__tests__/auditoria-schema.test.ts src/__tests__/auditoria-filtros.test.tsx`
Expected: PASS.

- [ ] **Step 3: Crear `migrar.ts`**

```ts
// Migración de datos AppSheet -> Inventario CMV.
// Spec: docs/superpowers/specs/2026-10-29-migracion-appsheet-design.md
//
// Uso:
//   npm run migracion:appsheet -- [--ejecutar] [--vaciar=<base_destino>] [--salida=<dir>] [--origen-env=<ruta>]
//
// - Origen: ORIGEN_DATABASE_URL desde .env.migracion (o --origen-env). Usuario de solo lectura.
// - Destino: DESTINO_DATABASE_URL, o DATABASE_URL de .env.
// - Sin --ejecutar solo simula: lee, transforma y escribe el reporte, sin tocar el destino.
// - --vaciar=<base> borra los datos migrados del destino antes de cargar (conserva roles, el centro
//   técnico y sus administradores); exige --ejecutar y repetir el nombre de la base.
// - Re-ejecutar no duplica: se inserta por clave primaria original (skipDuplicates).

// lib
import { existsSync, mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { loadEnvFile } from "node:process";
import { PrismaClient, type Prisma } from "@prisma/client";

// migracion
import { leerOpciones, nombreBase, validarOpciones } from "./opciones";
import { archivosReporte, construirResumen, validarCarga, type DestinoCargado, type Diferencia } from "./reporte";
import { transformarTodo } from "./transformar";
import { CENTRO_ADMINISTRACION_ID, ROLES_DESTINO, type DatosOrigen, type MigracionTransformada, type Tabla } from "./tipos";

const LOTE = 1000;

const CONSULTAS: Record<keyof DatosOrigen, string> = {
    centros: "SELECT ID_Centro, Nombre, CAST(Estado AS SIGNED) AS Estado FROM Centro ORDER BY ID_Centro",
    bodegas: "SELECT ID_Bodega, Bodega, ID_Centro, CAST(Estado AS SIGNED) AS Estado FROM Bodega ORDER BY ID_Bodega",
    unidades: "SELECT ID_Unidad, Descripcion FROM Unidad ORDER BY ID_Unidad",
    productos: "SELECT ID_Product, Linea, Descripcion FROM Producto ORDER BY ID_Product",
    usuarios:
        "SELECT ID_User, Nombre, Ap_Paterno, Ap_Materno, Rol, ID_Bodega, Telefono, Email, ID_Centro, CAST(Estado AS SIGNED) AS Estado FROM Usuario ORDER BY ID_User",
    entradas:
        "SELECT ID_OrdenEntrada, Fecha, ID_User, Origen, GuiaDespacho, ID_Centro, ID_Bodega, Codigo_Recepcion FROM OrdenEntrada ORDER BY ID_OrdenEntrada",
    entradaDetalles:
        "SELECT ID_Entrada, ID_Product, Categoria, Fecha_Caducidad, Cantidad, Lote, ID_OrdenEntrada FROM OrdenEntradaDetalle ORDER BY ID_Entrada",
    salidas:
        "SELECT ID_OrdenSalida, Fecha, ID_User, ID_Bodega, Tipo_Salida, ID_Centro, Destino, Codigo_Salida, Enviar_Correo, Correo_Destino FROM OrdenSalida ORDER BY ID_OrdenSalida",
    salidaDetalles: "SELECT ID_Detalle, ID_Product, Cantidad, ID_OrdenSalida, Lote, Fecha_Caducidad FROM OrdenSalidaDetalle ORDER BY ID_Detalle",
    stock:
        "SELECT ID_Stock, ID_Product, ID_Bodega, Cantidad_Disponible, Fecha_Ultima_Actualizacion, StockMinimo, Lote, Fecha_Caducidad FROM Stock ORDER BY ID_Stock"
};

function requerirEnv(nombre: string): string {
    const valor = process.env[nombre];
    if (!valor) throw new Error(`Falta la variable de entorno ${nombre}`);
    return valor;
}

// Una sola conexión para que SET SESSION aplique a todas las consultas del origen.
function conUnaConexion(url: string): string {
    const resultado = new URL(url);
    resultado.searchParams.set("connection_limit", "1");
    return resultado.toString();
}

async function leerOrigen(origen: PrismaClient): Promise<DatosOrigen> {
    await origen.$executeRawUnsafe("SET SESSION TRANSACTION READ ONLY");
    const datos = {} as Record<keyof DatosOrigen, unknown[]>;
    for (const [clave, consulta] of Object.entries(CONSULTAS) as [keyof DatosOrigen, string][]) {
        datos[clave] = await origen.$queryRawUnsafe<unknown[]>(consulta);
    }
    return datos as unknown as DatosOrigen;
}

async function verificarDestino(destino: PrismaClient): Promise<void> {
    const [centro, roles] = await Promise.all([
        destino.centro.findUnique({ where: { id: CENTRO_ADMINISTRACION_ID } }),
        destino.rol.findMany({ select: { id: true } })
    ]);
    if (centro === null) {
        throw new Error(`Falta el centro ${CENTRO_ADMINISTRACION_ID} en el destino: ejecuta SEED_DEMO=false npm run db:seed`);
    }
    const faltantes = ROLES_DESTINO.filter((rol) => !roles.some((existente) => existente.id === rol));
    if (faltantes.length > 0) throw new Error(`Faltan roles en el destino: ${faltantes.join(", ")}`);
}

// Conserva roles, el centro técnico y sus usuarios (administradores del seed y usuario técnico).
async function vaciarDestino(destino: PrismaClient): Promise<void> {
    await destino.$transaction([
        destino.ordenSalidaDetalle.deleteMany(),
        destino.ordenEntradaDetalle.deleteMany(),
        destino.ordenSalida.deleteMany(),
        destino.ordenEntrada.deleteMany(),
        destino.stock.deleteMany(),
        destino.encargadosBodega.deleteMany(),
        destino.log.deleteMany(),
        destino.usuario.updateMany({ where: { centroId: CENTRO_ADMINISTRACION_ID }, data: { bodegaId: null } }),
        destino.usuario.deleteMany({ where: { centroId: { not: CENTRO_ADMINISTRACION_ID } } }),
        destino.producto.deleteMany(),
        destino.unidad.deleteMany(),
        destino.bodega.deleteMany({ where: { centroId: { not: CENTRO_ADMINISTRACION_ID } } }),
        destino.centro.deleteMany({ where: { id: { not: CENTRO_ADMINISTRACION_ID } } })
    ]);
}

async function insertarEnLotes<T>(filas: T[], insertar: (lote: T[]) => Promise<{ count: number }>): Promise<number> {
    let total = 0;
    for (let i = 0; i < filas.length; i += LOTE) {
        total += (await insertar(filas.slice(i, i + LOTE))).count;
    }
    return total;
}

async function insertar(destino: PrismaClient, migracion: MigracionTransformada): Promise<Record<Tabla, number>> {
    const opciones = { skipDuplicates: true };
    const Centro = await insertarEnLotes(migracion.Centro.aceptados, (data) => destino.centro.createMany({ data, ...opciones }));
    const Bodega = await insertarEnLotes(migracion.Bodega.aceptados, (data) => destino.bodega.createMany({ data, ...opciones }));
    const Unidad = await insertarEnLotes(migracion.Unidad.aceptados, (data) => destino.unidad.createMany({ data, ...opciones }));
    const Producto = await insertarEnLotes(migracion.Producto.aceptados, (data) => destino.producto.createMany({ data, ...opciones }));
    const Usuario = await insertarEnLotes(migracion.Usuario.aceptados, (data) => destino.usuario.createMany({ data, ...opciones }));
    const OrdenEntrada = await insertarEnLotes(migracion.OrdenEntrada.aceptados, (data) => destino.ordenEntrada.createMany({ data, ...opciones }));
    const OrdenEntradaDetalle = await insertarEnLotes(migracion.OrdenEntradaDetalle.aceptados, (data) =>
        destino.ordenEntradaDetalle.createMany({ data, ...opciones })
    );
    const OrdenSalida = await insertarEnLotes(migracion.OrdenSalida.aceptados, (data) => destino.ordenSalida.createMany({ data, ...opciones }));
    const OrdenSalidaDetalle = await insertarEnLotes(migracion.OrdenSalidaDetalle.aceptados, (data) =>
        destino.ordenSalidaDetalle.createMany({ data, ...opciones })
    );
    const Stock = await insertarEnLotes(migracion.Stock.aceptados, (data) => destino.stock.createMany({ data, ...opciones }));
    return { Centro, Bodega, Unidad, Producto, Usuario, OrdenEntrada, OrdenEntradaDetalle, OrdenSalida, OrdenSalidaDetalle, Stock };
}

async function leerDestino(destino: PrismaClient): Promise<DestinoCargado> {
    const id = { select: { id: true } } as const;
    const [centros, bodegas, unidades, productos, usuarios, entradas, entradaDetalles, salidas, salidaDetalles, stock] = await Promise.all([
        destino.centro.findMany(id),
        destino.bodega.findMany(id),
        destino.unidad.findMany(id),
        destino.producto.findMany(id),
        destino.usuario.findMany(id),
        destino.ordenEntrada.findMany(id),
        destino.ordenEntradaDetalle.findMany(id),
        destino.ordenSalida.findMany(id),
        destino.ordenSalidaDetalle.findMany(id),
        destino.stock.findMany({ select: { id: true, cantidadDisponible: true } })
    ]);
    const ids = (filas: { id: string | number }[]): string[] => filas.map((fila) => String(fila.id));
    return {
        ids: {
            Centro: ids(centros),
            Bodega: ids(bodegas),
            Unidad: ids(unidades),
            Producto: ids(productos),
            Usuario: ids(usuarios),
            OrdenEntrada: ids(entradas),
            OrdenEntradaDetalle: ids(entradaDetalles),
            OrdenSalida: ids(salidas),
            OrdenSalidaDetalle: ids(salidaDetalles),
            Stock: ids(stock)
        },
        stock
    };
}

function escribirReporte(directorio: string, archivos: Record<string, string>): void {
    mkdirSync(directorio, { recursive: true });
    for (const [nombre, contenido] of Object.entries(archivos)) {
        writeFileSync(join(directorio, nombre), contenido, "utf8");
    }
}

async function main(): Promise<void> {
    const opciones = leerOpciones(process.argv.slice(2), new Date().toISOString().replace(/[:.]/g, "-"));
    if (existsSync(".env")) loadEnvFile(".env");
    if (!existsSync(opciones.origenEnv)) throw new Error(`No existe ${opciones.origenEnv} con ORIGEN_DATABASE_URL`);
    loadEnvFile(opciones.origenEnv);

    const urlDestino = process.env.DESTINO_DATABASE_URL ?? requerirEnv("DATABASE_URL");
    const baseDestino = nombreBase(urlDestino);
    validarOpciones(opciones, baseDestino);

    const origen = new PrismaClient({ datasourceUrl: conUnaConexion(requerirEnv("ORIGEN_DATABASE_URL")) });
    const destino = new PrismaClient({ datasourceUrl: urlDestino });
    try {
        console.log(`Destino: ${baseDestino} · modo: ${opciones.ejecutar ? "EJECUTAR" : "simulación"}${opciones.vaciar ? " · vaciar" : ""}`);
        const datos = await leerOrigen(origen);
        await verificarDestino(destino);
        if (opciones.vaciar !== null) await vaciarDestino(destino);

        const usuariosDestino = await destino.usuario.findMany({ select: { id: true, email: true } });
        const migracion = transformarTodo(datos, { usuariosDestino, ahora: new Date() });

        let insertados: Record<Tabla, number> | null = null;
        let diferencias: Diferencia[] | null = null;
        if (opciones.ejecutar) {
            insertados = await insertar(destino, migracion);
            diferencias = validarCarga(migracion, await leerDestino(destino));
        }

        const resumen = construirResumen(migracion, insertados);
        escribirReporte(opciones.salida, archivosReporte(migracion, resumen, diferencias));

        if (opciones.ejecutar) {
            await destino.log.create({
                data: {
                    accion: "migracion",
                    entidad: "AppSheet",
                    detalle: JSON.parse(JSON.stringify({ resumen, diferencias: diferencias?.length ?? 0, vaciar: opciones.vaciar !== null })) as Prisma.InputJsonValue
                }
            });
        }

        console.table(resumen);
        console.log(`Reporte: ${opciones.salida}`);
        if (diferencias !== null && diferencias.length > 0) {
            console.error(`Validación con ${diferencias.length} diferencias: revisa validacion.json`);
            process.exitCode = 1;
        }
    } finally {
        await origen.$disconnect();
        await destino.$disconnect();
    }
}

main().catch((error: unknown) => {
    console.error(error instanceof Error ? error.message : error);
    process.exit(1);
});
```

- [ ] **Step 4: Agregar el comando npm**

En `package.json`, dentro de `"scripts"`, después de `"db:seed:test-caducado"`:

```json
        "migracion:appsheet": "tsx prisma/scripts/migracion-appsheet/migrar.ts",
```

- [ ] **Step 5: Actualizar la guía de deploy**

En `docs/guias/deploy-produccion.md`, reemplazar la sección `## 6. Migración de datos desde AppSheet (pendiente)` completa (hasta el final del archivo) por:

````markdown
## 6. Migración de datos desde AppSheet

La base de producción actual (AppSheet) está en el VPS de AppSheet y **no se modifica**. Se lee con el usuario `inventario_lectura` (`SELECT, SHOW VIEW` sobre `inventario.*`), restringido a las IPs de server-das y del equipo del responsable. Diseño: `docs/superpowers/specs/2026-10-29-migracion-appsheet-design.md`.

```bash
# .env.migracion (no se versiona):
# ORIGEN_DATABASE_URL="mysql://inventario_lectura:<password>@<host VPS>:3306/inventario"
npm run migracion:appsheet                                   # simulación: solo reporte
npm run migracion:appsheet -- --ejecutar --vaciar=<base>     # vacía lo migrado y carga
```

- **Destino:** `DATABASE_URL` de `.env`, o `DESTINO_DATABASE_URL` si existe.
- **Reporte:** `migracion-appsheet-<fecha>/`, o la ruta de `--salida`. Contiene `resumen.json`, `rechazos-*.csv`, `advertencias-*.csv`, `reasignaciones.json` y `validacion.json`. El script termina con error si la validación encuentra diferencias.
- **`--vaciar`:** conserva los roles, el centro `Administracion DAS` y sus usuarios. **No reasignar a los administradores del seed a centros reales antes del corte**, porque `--vaciar` los borraría.

### 6.1 Ensayo local

```bash
SEED_DEMO=false npm run db:seed        # crea el centro técnico si la base local no lo tiene
npm run migracion:appsheet
npm run migracion:appsheet -- --ejecutar --vaciar=inventario
```

### 6.2 Ensayo y corte en producción (server-das)

`actions/checkout` limpia el directorio de trabajo, así que las credenciales y los reportes viven fuera de él, en `/var/www/inventario-aps/migracion/`.

```bash
ssh informesdiarios
cd /var/www/inventario-aps/actions-runner/_work/inventario-cmv/inventario-cmv
M=/var/www/inventario-aps/migracion
mysqldump --no-tablespaces inventario_cmv > $M/respaldo-$(date +%F-%H%M).sql   # credenciales en ~/.my.cnf
npm run migracion:appsheet -- --origen-env=$M/.env.migracion --salida=$M/reporte-$(date +%F-%H%M)
npm run migracion:appsheet -- --origen-env=$M/.env.migracion --salida=$M/reporte-$(date +%F-%H%M) --ejecutar --vaciar=inventario_cmv
```

Pasos:
1. **Ensayo:** se ejecuta y se revisa https://inventario.cmvalparaiso.cl. La URL no se difunde hasta el corte, porque los usuarios migrados quedan activos.
2. **Corte:**
   - AppSheet pasa a solo lectura;
   - respaldo;
   - `--ejecutar --vaciar=inventario_cmv`;
   - se revisa `validacion.json`;
   - apertura a los usuarios.
3. **Después del corte:** reasignar desde *Mantenedores* a los administradores del centro técnico `Administracion DAS`.
````

- [ ] **Step 6: Verificación completa**

Run: `export PATH=~/.local/bin:$PATH && npx tsc --noEmit && npm test; git checkout tsconfig.tsbuildinfo`
Expected: tsc sin errores y todos los tests en verde (168 previos más los nuevos).

- [ ] **Step 7: Simulación contra el origen real (requiere `.env.migracion` local)**

Run: `export PATH=~/.local/bin:$PATH && npm run migracion:appsheet -- --salida=migracion-appsheet-simulacion`
Expected: tabla de resumen. Centro: 24 leídos y 23 aceptados (Centro Prueba rechazado). Se crea `migracion-appsheet-simulacion/` (ignorado en git). No se escribe nada en el destino.

- [ ] **Step 8: Commit**

```bash
git add prisma/scripts/migracion-appsheet/migrar.ts package.json src/modules/auditoria/schemas/auditoria.schema.ts src/modules/auditoria/components/auditoria-filtros.tsx src/__tests__/auditoria-schema.test.ts docs/guias/deploy-produccion.md
git commit -m "feat(migracion): script migracion:appsheet con vaciado, validación y log de auditoría"
```

---

### Task 8: Ensayo local (lo hace el controlador, no un subagente)

**Files:** ninguno, salvo correcciones que surjan, cada una con su test.

- [ ] **Step 1:** Simular dos veces seguidas en un directorio distinto y comparar con `diff` (criterio de éxito 1):

  ```bash
  npm run migracion:appsheet -- --salida=migracion-appsheet-sim-a
  npm run migracion:appsheet -- --salida=migracion-appsheet-sim-b
  diff -r migracion-appsheet-sim-a migracion-appsheet-sim-b
  ```

  Esperado: sin diferencias.

- [ ] **Step 2:** Base local con el centro técnico (`SEED_DEMO=false npm run db:seed`). Luego `npm run migracion:appsheet -- --ejecutar --vaciar=<base local>`.
  - Esperado: `validacion.json` con `"diferencias": 0` y código de salida 0.

- [ ] **Step 3:** Ejecutar otra vez **sin** `--vaciar`.
  - Esperado: `insertados` = 0 en todas las tablas y validación sin diferencias (criterio de éxito 2).

- [ ] **Step 4:** Revisar el reporte contra el diagnóstico de la spec (sección 4) y las cifras esperadas:
  - `rechazos-OrdenEntradaDetalle.csv` contiene unos 677 `orden_inexistente`;
  - unos 371 `centro_destino` en `advertencias-OrdenSalida.csv`;
  - 15 `stock_fusionado`;
  - 4 `rol_no_migrado`.
  
  Cualquier desviación relevante se corrige con su test antes de seguir.

- [ ] **Step 5:** Levantar la app local (`npm run dev`) y revisar el stock de una bodega real, el historial de salidas y la descarga del comprobante de una salida antigua.

- [ ] **Step 6:** Resumir los resultados al responsable (conteos y rechazos) antes de abrir el PR. El ensayo en producción (guía, sección 6.2) se hace **después** de fusionar el PR y **con aprobación explícita** del responsable.
