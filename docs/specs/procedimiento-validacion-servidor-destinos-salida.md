# Especificación Técnica y de Negocio: Validación en Servidor de Destinos, Causales Dinámicas y Traspasos en Órdenes de Salida

**Proyecto:** Sistema de Inventario APS — Corporación Municipal de Valparaíso (CMV)  
**Documento:** Especificación Funcional, de Integridad y Validación en Servidor: Destinos, Causales (`Unidad`) y Traspasos Intercentros (`OrdenSalida`)  
**Versión:** 1.1 (Ampliación de Alcance Aprobada: Tipificación desde tabla `Unidad` y Bodega Destino Obligatoria en Préstamos)  
**Fecha:** 10 de Noviembre de 2026  
**Clasificación:** Integridad de Datos, Validación Backend y Deuda Técnica (Prioridad Alta)  
**Origen:** Deuda técnica identificada en la revisión de código del PR #7 (*Traspaso a otra bodega*, punto 6) y ampliación de requerimientos de Jefatura / Dirección TI

---

## 1. Diagnóstico del Problema y Justificación Técnica

### 1.1. Situación Previa y Deuda Técnica:
En la implementación inicial del formulario de egresos (`src/modules/orden-salida/components/orden-salida-form.tsx`), el campo **Destino** se seleccionaba mediante listas estáticas en controles `<Select>` según el tipo de salida:
- Para **Consumo Interno**: utilizaba una lista cerrada hardcodeada en código TypeScript (`DESTINOS_CONSUMO_INTERNO`).
- Para **Merma**: utilizaba otra lista estática (`DESTINOS_MERMA`).
- Para **A otra bodega**: utilizaba la lista de bodegas hermanas del centro.
- Para **A Otros Centros**: únicamente solicitaba el centro de destino (`centroDestinoId`), sin requerir la bodega receptora del préstamo.

En el backend (`src/modules/orden-salida/schemas/orden-salida.schema.ts`):
1. El schema Zod declaraba `destino: z.string().min(1)`, aceptando cualquier texto arbitrario si se enviaba una petición manipulada.
2. No se validaba la existencia del servicio clínico o causal en la base de datos.
3. Para **A Otros Centros**, se omitía la selección obligatoria de la bodega receptora específica (`bodegaDestinoId`), dejando una brecha de trazabilidad logística respecto a qué recinto físico de destino custodiaría el material en tránsito.

### 1.2. Requerimientos de Ampliación de Alcance (Instrucción de Jefatura):
> *"Está bien que se apliquen las validaciones de backend que menciona la spec, pero además se debe ampliar su alcance para que en las salidas, específicamente el select de servicio (consumo) y/o causa (merma), sus opciones se completen dinámicamente desde la tabla `Unidad` de la base de datos.*  
> *Además, cuando el tipo de salida es 'A Otros Centros', además de seleccionar el centro, se debe seleccionar obligatoriamente la bodega de destino del centro que recibirá el préstamo."*

---

## 2. Matriz de Validación por Tipo de Salida

```
                                  [ TIPO DE SALIDA ]
                                          │
       ┌──────────────────┬───────────────┴────────────────┬──────────────────┐
       │                  │                                │                  │
┌──────▼──────┐    ┌──────▼──────┐                  ┌──────▼──────┐    ┌──────▼──────┐
│  CONSUMO    │    │    MERMA    │                  │   A OTRA    │    │   A OTROS   │
│  INTERNO    │    │  SANITARIA  │                  │   BODEGA    │    │   CENTROS   │
├─────────────┤    ├─────────────┤                  ├─────────────┤    ├─────────────┤
│ Validar     │    │ Validar     │                  │ Validar     │    │ Validar     │
│ existencia  │    │ causal/glosa│                  │ bodega en   │    │ centro y    │
│ en tabla    │    │ contra tabla│                  │ BD (activa, │    │ BODEGA en   │
│ Unidad (BD) │    │ Unidad (BD) │                  │ mismo cent, │    │ BD (activas,│
│             │    │             │                  │ != origen)  │    │ != origen)  │
└─────────────┘    └─────────────┘                  └─────────────┘    └─────────────┘
```

| Tipo de Salida | Campos Obligatorios | Regla en Schema Zod | Regla en Server Action (BD) | Mensaje de Error en Rechazo |
|---|---|---|---|---|
| **Consumo Interno** | `destino` | `min(1)` no vacío | Debe coincidir con una `Unidad` registrada que **no** sea causal de merma (`UNIDADES_MERMA`) | *"El servicio o unidad clínica seleccionada no es válida."* |
| **Merma** | `destino` | `min(1)` no vacío | Debe coincidir con una `Unidad` registrada que sea causal de merma (`UNIDADES_MERMA`: "Regularización de Bodega", "REAS") | *"La causal de merma seleccionada no es válida."* |
| **A otra bodega** | `bodegaDestinoId` | `bodegaDestinoId` obligatorio y `!= bodegaId` | Debe existir en BD, estar activa (`estado: true`), pertenecer al mismo `centroId` y persistir su nombre oficial en `destino` | *"La bodega destino seleccionada no existe o no pertenece al mismo centro de salud."* |
| **A Otros Centros** | `centroDestinoId` y `bodegaDestinoId` | Ambos IDs obligatorios; `centroDestinoId != centroId` | El centro debe existir y estar activo. La bodega destino debe existir, estar activa y pertenecer estrictamente a `centroDestinoId`. Se persiste el nombre del centro en `destino` | *"Debe seleccionar la bodega de destino del centro receptor."* / *"La bodega de destino seleccionada no pertenece al centro receptor o no está activa."* |

---

## 3. Especificación Detallada de Reglas de Negocio

### Regla R-01: Poblamiento Dinámico desde la Tabla `Unidad` (Sin Listas Hardcodeadas)
- En el formulario de emisión (`/salidas/nueva`), las opciones del selector de **Servicio / Unidad clínica destino** (para *"Consumo Interno"*) y/o causales sanitarias (para *"Merma"*) se obtienen en tiempo de ejecución consultando la tabla `Unidad` de la base de datos:
  ```typescript
  const unidades = await prisma.unidad.findMany({ orderBy: { descripcion: "asc" } });
  ```
- Se erradica la dependencia de arrays estáticos en código (`DESTINOS_CONSUMO_INTERNO` y `DESTINOS_MERMA` de `destinos.ts`), permitiendo que el mantenedor de unidades en `/mantenedores` administre directamente los puntos asistenciales comunales.
- **Deuda técnica heredada de AppSheet:** la tabla `Unidad` mezcla servicios clínicos y causales de merma. Para no alterar el modelo antes de la migración definitiva, `UNIDADES_MERMA` (`src/modules/orden-salida/constants/destinos.ts`) lista las únicas descripciones válidas para *"Merma"* ("Regularización de Bodega" y "REAS"); todas las demás unidades corresponden a *"Consumo Interno"*. La comparación ignora mayúsculas y tildes.
- Si la tabla `Unidad` está vacía o un servicio fue deshabilitado, el selector lo refleja de inmediato sin redespliegue de código.

### Regla R-02: Selección Obligatoria de Bodega Destino en Traspasos Intercentros
- Cuando `tipoSalida === "A Otros Centros"`:
  1. El formulario exige seleccionar el **Centro de Salud Destino** (`centroDestinoId`).
  2. Al seleccionar el centro receptor, se despliega y filtra en cascada el selector de **Bodega de Destino** (`bodegaDestinoId`), alimentado con las bodegas activas de ese establecimiento.
  3. Ambos selectores son obligatorios para enviar el formulario.
- En el backend:
  - Zod valida que `bodegaDestinoId` no sea nulo ni vacío.
  - La Server Action valida que `bodegaDestinoId` pertenezca a `centroDestinoId` y tenga `estado: true`.
  - Se persiste `bodegaDestinoId` en la columna relacional de `OrdenSalida`, garantizando que al recibir el préstamo en `/orden-entrada/recepcion-prestamos`, la bodega receptora esté preseleccionada sin ambigüedad.

### Regla R-03: Validación en Schema Zod (`orden-salida.schema.ts`)
En `crearOrdenSalidaSchema.superRefine((data, ctx) => { ... })`:
1. **Traspaso a otra bodega (mismo centro):**
   - Exige `bodegaDestinoId` presente y distinto a `data.bodegaId`.
2. **Traspaso intercentros ("A Otros Centros"):**
   - Exige `centroDestinoId` presente y distinto a `data.centroId`.
   - Exige `bodegaDestinoId` presente y no vacío.
   - Mantiene la advertencia sanitaria consultiva si algún lote caduca en $\le 7$ días sin confirmación.
3. **Consumo Interno y Merma:**
   - Exige `destino` no vacío. La validez del servicio o causal se verifica en el servidor (R-04), porque "REAS" tiene menos de 5 caracteres.

### Regla R-04: Garantía de Integridad y Validación en Servidor (`orden-salida.action.ts`)
En `crearOrdenSalida`:
1. **Consumo Interno:**
   - El servidor verifica contra `prisma.unidad` que `parsed.destino` corresponda a una unidad válida registrada. Si no coincide, retorna error:
     *"El servicio o unidad clínica seleccionada no es válida."*
   - Una causal de merma (`UNIDADES_MERMA`) no es un destino válido de Consumo Interno.
   - **Merma:** `parsed.destino` debe ser una `Unidad` registrada incluida en `UNIDADES_MERMA`. Si no, retorna *"La causal de merma seleccionada no es válida."*
2. **Traspaso a otra bodega:**
   - Consulta `prisma.bodega.findUnique`. Verifica `estado === true` y `centroId === parsed.centroId`.
   - Sobrescribe `parsed.destino = bodegaDestino.nombre`.
3. **Traspaso intercentros:**
   - Consulta `prisma.centro.findUnique`. Verifica `estado === true` y `id !== parsed.centroId`.
   - Consulta `prisma.bodega.findUnique` para `bodegaDestinoId`. Verifica `estado === true` y `centroId === centroDestinoId`.
   - Sobrescribe `parsed.destino = centroDestino.nombre`.
   - Persiste `bodegaDestinoId` en la creación de `OrdenSalida`.

---

## 4. Plan de Archivos Afectados

1. `src/modules/orden-salida/schemas/orden-salida.schema.ts`:
   - En `crearOrdenSalidaSchema`, exigir `bodegaDestinoId` obligatorio cuando `tipoSalida === "A Otros Centros"`.
2. `src/modules/orden-salida/actions/orden-salida.action.ts`:
   - Validar obligatoriedad y pertenencia relacional de `bodegaDestinoId` en traspasos a otros centros.
   - Validar pertenencia de `destino` en `prisma.unidad` para consumo interno.
   - Asignar `bodegaDestinoId` al crear la orden de salida intercentros.
3. `src/app/salidas/nueva/page.tsx`:
   - Consultar `unidades` desde `prisma.unidad.findMany({ orderBy: { descripcion: "asc" } })`.
   - Consultar todas las bodegas activas comunales para permitir cascada a cualquier centro receptor.
   - Pasar `unidades` y `bodegasDestino` completas a `OrdenSalidaForm`.
4. `src/modules/orden-salida/components/orden-salida-form.tsx`:
   - Aceptar prop `unidades: Unidad[]`.
   - Poblar el select de Consumo Interno con las unidades que no son causales de merma, y el de Merma solo con `UNIDADES_MERMA` (`clasificarUnidadesSalida`). Sin listas de respaldo: si no hay opciones, el selector lo indica.
   - La bodega destino de "A Otros Centros" no se preselecciona: el usuario debe elegirla.
   - Incorporar selector en cascada de `bodegaDestinoId` para `A Otros Centros`, filtrado por `centroDestinoId`.
5. `prisma/seed.ts`:
   - Asegurar que la semilla inicial contenga servicios clínicos representativos en la tabla `Unidad` para desarrollo y testing.
6. `src/__tests__/`:
   - Actualizar y agregar tests en `orden-salida-schema.test.ts`, `traspaso-intercentros-emision.test.ts` y crear suite de validación de destinos.

---

## 5. Criterios de Aceptación (Definición de Terminado - DoD)

- [ ] **CA-1 (Poblamiento Dinámico desde `Unidad`):** En `/salidas/nueva`, al seleccionar "Consumo Interno", el select de destino despliega los registros de la tabla `Unidad` de la BD. Si se añade una unidad en `/mantenedores`, aparece de inmediato.
- [ ] **CA-2 (Validación de Unidad en Backend):** Si una petición envía un servicio de consumo interno inventado o inexistente en `Unidad`, el servidor la rechaza con mensaje de error de servicio no válido.
- [ ] **CA-3 (Bodega Destino Obligatoria en Intercentros):** Al seleccionar "A Otros Centros", se despliegan en cascada tanto el centro destino como las bodegas activas de ese centro. No se permite emitir el traspaso sin seleccionar la bodega destino.
- [ ] **CA-4 (Validación de Pertenencia de Bodega en Intercentros):** El backend rechaza cualquier salida intercentros si `bodegaDestinoId` está vacía o si pertenece a un centro distinto a `centroDestinoId`.
- [ ] **CA-5 (Persistencia Relacional de Bodega Destino):** La orden de salida creada guarda `bodegaDestinoId`, visible en el registro y precargada en la recepción del préstamo.
- [ ] **CA-6 (Traspaso a Otra Bodega Mismo Centro):** Se mantiene la validación que exige `bodegaDestinoId` activa y perteneciente al mismo centro.
- [ ] **CA-7 (Suites de Test Verificadas):** Toda la suite de pruebas unitarias y de integración pasa al 100% (`npm test`) y la compilación TypeScript es limpia.
