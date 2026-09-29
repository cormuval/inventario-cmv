# Especificación Técnica y de Negocio: Alcance de Visibilidad por Usuario, Bodega y Centro (Principio de Mínimo Privilegio)

**Proyecto:** Sistema de Inventario APS — Corporación Municipal de Valparaíso (CMV)  
**Documento:** Especificación de Seguridad Operativa y Control de Acceso por Alcance  
**Versión:** 1.1 (Aprobada)  
**Fecha:** 25 de Septiembre de 2026  
**Clasificación:** Seguridad Operativa y Segregación de Datos Crítica (Prioridad Alta)  

---

## 1. Diagnóstico del Problema

### El Reporte y Requerimiento:
> *"En salud municipal rige el principio de mínimo privilegio. Si un funcionario está asignado a la 'Bodega Farmacia' del CESFAM Barón, no debe ver ni manipular los movimientos de la 'Bodega Vacunatorio' o del CESFAM Esperanza. El Administrador Comunal (DAS) es el único que debe tener vista panorámica."*

### Causa Raíz Detectada en Código:
1. **Módulo Orden de Salida (`/orden-salida` y `orden-salida.action.ts`):**
   - `app/orden-salida/page.tsx` realiza consultas directas a Prisma (`findMany` sin filtro) para `centros`, `bodegas`, `stocks` y `listarOrdenesSalida()`. Cualquier usuario de cualquier rol o centro ve y puede desplegar todas las bodegas de toda la comuna.
   - `crearOrdenSalida`, `actualizarDetalleSalida` y `eliminarDetalleSalida` no ejecutan `validarCentroBodegaEnAlcance()`, permitiendo a un usuario malicioso o confundido descontar stock de bodegas ajenas.
2. **Módulo Orden de Entrada (`/orden-entrada` y `orden-entrada.action.ts`):**
   - `listarOrdenesEntrada` filtra únicamente por `usuarioId: user.id`. Esto impide que compañeros del mismo turno en una bodega vean los ingresos de su bodega, y causa que un Encargado de Centro o Administrador no vea el historial de su alcance.
   - `actualizarDetalleEntrada` y `eliminarDetalleEntrada` no comprueban si la orden intervenida pertenece al centro/bodega en el alcance del usuario.
3. **Módulo de Reportes (`/reporte` y `reporte.action.ts`):**
   - `listarReporteConsumoMensual` suma todas las salidas y stocks a nivel comunal sin evaluar el rol ni el centro/bodega del funcionario que consulta.
4. **Resolución de Alcance (`inventario-alcance.ts`):**
   - Actualmente solo busca bodegas en `EncargadosBodega`. Si un operador fue asignado mediante `Usuario.bodegaId` pero no tiene registro en la tabla intermedia, su alcance queda en cero.

---

## 2. Matriz de Roles y Reglas de Negocio

```
                     ┌──────────────────────────────────────────────┐
                     │          ADMINISTRADOR COMUNAL (DAS)         │
                     │          (Rol R01) — Vista Panorámica        │
                     └──────────────────────┬───────────────────────┘
                                            │
                     ┌──────────────────────┴───────────────────────┐
                     │            ENCARGADO DE CENTRO               │
                     │  (Rol R02) — Solo su CESFAM (todas sus bod.) │
                     └──────────────────────┬───────────────────────┘
                                            │
                     ┌──────────────────────┴───────────────────────┐
                     │     ENCARGADOS / OPERADORES DE BODEGA        │
                     │ (Roles R03, R06, R07) — Solo bodegas asignadas│
                     └──────────────────────────────────────────────┘
```

| Rol | Código | Alcance de Centros | Alcance de Bodegas | Movimientos Visibles | Operaciones Permitidas |
|---|---|---|---|---|---|
| **Administrador Comunal** | `R01` | Todos los centros comunales (filtro libre) | Todas las bodegas comunales | Todo el historial comunal | Entradas, Salidas, Configuración, Auditoría |
| **Encargado Centro** | `R02` | Exclusivamente su `centroId` | Todas las bodegas de su centro | Todos los movimientos de su centro | Supervisión, consultas y reportes de su centro |
| **Encargado Bodega** | `R03` | Exclusivamente su `centroId` | Bodegas asignadas (`EncargadosBodega` $\cup$ `Usuario.bodegaId`) | Movimientos de su(s) bodega(s) asignada(s) | Entradas y Salidas en su(s) bodega(s) |
| **Operador Entrada** | `R06` | Exclusivamente su `centroId` | Bodegas asignadas | Movimientos de su(s) bodega(s) asignada(s) | Entradas en su(s) bodega(s) |
| **Operador Salida** | `R07` | Exclusivamente su `centroId` | Bodegas asignadas | Movimientos de su(s) bodega(s) asignada(s) | Salidas en su(s) bodega(s) |

---

## 3. Especificación de Reglas de Negocio

### Regla R-01: Segregación Panorámica vs. Local
- Solo el Administrador Comunal (`R01`) tiene selector para cambiar entre centros de salud.
- Para todos los demás roles (`R02`, `R03`, `R06`, `R07`), el `centroId` queda estrictamente bloqueado al centro de su perfil.
- Para los roles de bodega (`R03`, `R06`, `R07`), el selector de bodegas solo despliega aquellas bodegas formalmente asignadas al funcionario.

### Regla R-02: Blindaje de Salidas (`/orden-salida`)
- La página `/orden-salida` debe resolver centros, bodegas y stocks filtrados por `obtenerAlcanceInventario()`.
- En el servidor, `crearOrdenSalida`, `actualizarDetalleSalida` y `eliminarDetalleSalida` deben ejecutar `validarCentroBodegaEnAlcance(centroId, bodegaId)`. Si no pertenece al alcance, abortar con error:  
  *"No tienes permiso para operar en el centro o bodega seleccionada."*

### Regla R-03: Continuidad de Turno en Historial de Entradas y Salidas
- `listarOrdenesSalida` y `listarOrdenesEntrada` deben filtrar por `bodegaId: { in: alcance.bodegaIds }` y `centroId: { in: alcance.centroIds }`.
- De esta manera, los funcionarios que comparten turno en la misma bodega ven el historial completo de su bodega (garantizando continuidad operativa), pero tienen ceguera total frente a otras bodegas y otros centros.
- El historial **no** se acota a centros/bodegas activos (una bodega desactivada conserva sus movimientos):
  - `R01` no recibe filtro de centro ni bodega (vista panorámica completa, incluidas bodegas desactivadas).
  - `R02` se filtra solo por `centroId: { in: alcance.centroIds }` (todas las bodegas de su centro, activas o no).
  - `R03`, `R06`, `R07` se filtran por `bodegaId` y `centroId` de su alcance.
- La construcción de estos filtros se centraliza en `src/shared/lib/inventario-alcance-filtros.ts` (`crearFiltroMovimientosAlcance`, `crearFiltroStockAlcance`), y aplica igual al reporte (R-04).

### Regla R-04: Reportes Acorde al Mínimo Privilegio (`/reporte`)
- `listarReporteConsumoMensual` debe resolver el `obtenerAlcanceInventario()`.
- Las consultas de `ordenSalidaDetalle` y `stock` deben condicionarse a `bodegaId: { in: alcance.bodegaIds }`.
- Un encargado de bodega solo verá las estadísticas de sus bodegas; un director/encargado de CESFAM verá su centro completo; la DAS verá la panorámica global.

### Regla R-05: Robustez en la Asignación de Bodegas
- En `src/shared/lib/inventario-alcance.ts`, la resolución de bodegas asignadas para roles `R03`, `R06`, `R07` unirá:
  1. Las bodegas registradas en `EncargadosBodega` para dicho funcionario.
  2. La bodega directa configurada en `Usuario.bodegaId` (si existe y pertenece a su centro).
  Esto evita bloqueos accidentales a funcionarios creados antes de la tabla intermedia o mediante importaciones.

---

## 4. Plan de Archivos Afectados

1. [`src/shared/lib/inventario-alcance.ts`](../../src/shared/lib/inventario-alcance.ts):
   - Mejorar `obtenerAlcanceBodegasAsociadas` para incluir unión con `usuario.bodegaId`.
2. [`src/modules/orden-salida/actions/orden-salida.action.ts`](../../src/modules/orden-salida/actions/orden-salida.action.ts):
   - En `listarOrdenesSalida()`: incorporar filtro por alcance (`bodegaId in alcance.bodegaIds`).
   - En `crearOrdenSalida()`: agregar validación `validarCentroBodegaEnAlcance(parsed.centroId, parsed.bodegaId)`.
   - En `actualizarDetalleSalida()` y `eliminarDetalleSalida()`: validar que la orden pertenezca al alcance antes de modificar o eliminar.
3. [`src/app/orden-salida/page.tsx`](../../src/app/orden-salida/page.tsx):
   - Usar `obtenerAlcanceInventario()` para alimentar `centros`, `bodegas` y `stocks` restringidos.
4. [`src/modules/orden-salida/components/orden-salida-form.tsx`](../../src/modules/orden-salida/components/orden-salida-form.tsx):
   - Aceptar `centroId`, `bodegaId` y `puedeFiltrarCentro` (igual que `OrdenEntradaForm`) para bloquear selección al usuario local.
5. [`src/modules/orden-entrada/actions/orden-entrada.action.ts`](../../src/modules/orden-entrada/actions/orden-entrada.action.ts):
   - En `listarOrdenesEntrada()`: filtrar por `bodegaId in alcance.bodegaIds` en lugar de únicamente `usuarioId: user.id`.
   - En `actualizarDetalleEntrada()` y `eliminarDetalleEntrada()`: validar alcance antes de operar.
6. [`src/modules/reporte/actions/reporte.action.ts`](../../src/modules/reporte/actions/reporte.action.ts):
   - En `listarReporteConsumoMensual()`: aplicar `obtenerAlcanceInventario()` en las consultas de salidas y stocks.
7. [`src/shared/lib/inventario-alcance-filtros.ts`](../../src/shared/lib/inventario-alcance-filtros.ts):
   - Filtros Prisma por rol para historiales y stock (ver R-03).

---

## 5. Criterios de Aceptación (Definición de Terminado)

- [x] **CA-1 (Salidas UI):** Un funcionario asignado a "Bodega Farmacia" de "CESFAM Barón" no ve en el selector de salidas ninguna bodega que no sea la suya, ni otros centros.
- [x] **CA-2 (Historial Salidas):** La tabla de salidas solo muestra despachos realizados en las bodegas que el funcionario tiene asignadas.
- [x] **CA-3 (Historial Entradas):** La tabla de entradas muestra recepciones de la bodega asignada (continuidad de turno) sin revelar entradas de otros CESFAMs o bodegas.
- [x] **CA-4 (Backend Defense):** Si se envía por API/Action un `bodegaId` o `centroId` no autorizado, el backend rechaza la transacción con error de permisos.
- [x] **CA-5 (Reportes):** El reporte mensual se ciñe automáticamente al alcance del usuario.
- [x] **CA-6 (Vista Panorámica DAS):** El usuario `R01` (Administrador) mantiene visibilidad completa y capacidad de filtrar por cualquier centro y bodega.
