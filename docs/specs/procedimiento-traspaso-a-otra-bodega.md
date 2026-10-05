# Especificación Técnica y de Negocio: Traspaso de Stock "A Otra Bodega" en el Mismo Centro

**Proyecto:** Sistema de Inventario APS — Corporación Municipal de Valparaíso (CMV)  
**Documento:** Especificación Funcional y Transaccional de Traspasos Internos  
**Versión:** 1.1 (Aprobada tras revisión de código)  
**Fecha:** 05 de Octubre de 2026  
**Clasificación:** Operación de Inventario y Trazabilidad (Prioridad Alta)  

---

## 1. Diagnóstico del Problema

### El Reporte y Requerimiento:
> *"4.- 'A otra bodega' para que entre bodegas de un mismo centro se pueden hacer traspasos.  
> Diagnóstico: Crítico.  
> Detalle: Debido a metodología de pruebas este método estaba bloqueado por instrucciones de desarrollo, Se pide levantarlo como requerimiento para su selección y fase de pruebas."*

### Causa Raíz Detectada en Código:
1. **Frontend (`orden-salida-form.tsx`):**
   El selector de `tipoSalida` solo exponía `"Consumo Interno"`, `"A Otros Centros"` y `"Merma"`. La opción `"A otra bodega"` no estaba disponible en la interfaz.
2. **Interfaz de Destino (`orden-salida-form.tsx`):**
   El campo "Destino" era texto libre. Para un traspaso interno entre bodegas del mismo centro de salud (CESFAM), el usuario debe seleccionar obligatoriamente una bodega receptora válida del mismo centro, excluyendo la bodega origen actual.
3. **Alcance de Operadores (R03/R07):**
   Para funcionarios con alcance limitado (una sola bodega asignada), las bodegas activas del centro debían resolverse como prop independiente (`bodegasDestino`) para que el operador pueda visualizar las bodegas hermanas como posibles destinos de traspaso sin requerir permisos de administración sobre ellas.
4. **Backend Transaccional y Persistencia Relacional (`schema.prisma` y `orden-salida.action.ts`):**
   Toda salida ordinaria solo descuenta existencias de la bodega emisora. Para traspasos, se requiere:
   - Columna relacional `bodegaDestinoId` en el modelo `OrdenSalida` (evitando codificar IDs en `codigoSalida`).
   - Transferencia atómica en MySQL dentro de `prisma.$transaction`: descontar en origen e incrementar en destino con idéntico lote y fecha de caducidad.
   - Compensación bilateral simétrica al editar o eliminar detalles de salida, con descuento técnico en destino que valide saldo pero no bloquee si el lote venció tras el traspaso.

---

## 2. Reglas de Negocio Estrictas

```
                         [ EGRESO EN BODEGA ORIGEN ]
                                      │
                   ¿Tipo de Salida = "A otra bodega"?
                   ├── SÍ ───► ¿Bodega Destino pertenece al MISMO Centro?
                   │           ├── NO ──► ⛔ RECHAZO: Solo se permiten traspasos
                   │           │          internos entre bodegas del mismo centro.
                   │           │
                   │           └── SÍ ──► ¿Bodega Destino != Bodega Origen?
                   │                      ├── NO ──► ⛔ RECHAZO: No se puede traspasar
                   │                      │          a la misma bodega origen.
                   │                      │
                   │                      └── SÍ ──► ¿Lote Vigente y Saldo > 0?
                   │                                 ├── NO ──► ⛔ BLOQUEO (Sin stock / Caducado)
                   │                                 │
                   │                                 └── SÍ ──► ✔ ATÓMICO ($transaction):
                   │                                            1. Descontar en Bodega Origen
                   │                                            2. Incrementar en Bodega Destino
                   │                                            3. Registrar OrdenSalida con bodegaDestinoId
                   │                                            4. Auditar con bodegaOrigenId y bodegaDestinoId
                   │
                   └── NO ───► Flujo ordinario (Consumo Interno / A Otros Centros / Merma)
```

### Regla R-01: Disponibilidad de la Opción en la Interfaz
- Se habilita `"A otra bodega"` en `TIPOS_SALIDA`.
- La opción queda sujeta a las mismas validaciones de vigencia sanitaria: **no se permite traspasar lotes caducados** ni lotes sin stock disponible (`cantidadDisponible > 0`).

### Regla R-02: Destinos Controlados y Resolución de Alcance para R03/R07
- Para evitar que se ingresen bodegas inexistentes o nombres duplicados, el campo "Destino" deja de ser texto libre:
  1. **"A otra bodega" (Traspaso interno):**
     - Selector desplegable (`<Select>`) que lista las bodegas activas del **mismo centro de salud**, excluyendo la bodega origen (`bodega.id !== bodegaOrigenId`).
     - Para roles operativos (R03/R07), el servidor entrega `bodegasDestino` con todas las bodegas activas de los centros en su alcance, permitiendo seleccionar bodegas hermanas como destino aunque no tenga permiso de operar salida en ellas.
  2. **"A Otros Centros" (Traspaso inter-centro):**
     - Selector desplegable (`<Select>`) que lista los demás **centros de salud** comunales activos.
  3. **"Consumo Interno" (Uso clínico en CESFAM):**
     - Selector desplegable (`<Select>`) con el catálogo de unidades clínicas estándar de APS.
  4. **"Merma" (Baja sanitaria):**
     - Selector desplegable (`<Select>`) con causales sanitarias estándar.

### Regla R-03: Traspaso Atómico Completo en Servidor y Persistencia
- En `prisma/schema.prisma`, `OrdenSalida` almacena `bodegaDestinoId` como clave foránea opcional a `Bodega`.
- En `crearOrdenSalida`, dentro de `prisma.$transaction`:
  1. Se valida que la bodega destino exista, esté activa y pertenezca al mismo `centroId`.
  2. Se valida que `bodegaDestinoId !== bodegaOrigenId`.
  3. Para cada detalle de la orden:
     - Se descuenta el stock de la bodega origen (`descontarStock`).
     - Se incrementa el stock en la bodega destino (`tx.stock.upsert`), manteniendo `productoId`, `lote` y `fechaCaducidad`.
  4. La orden se registra con `bodegaDestinoId` y `destino: bodegaDestino.nombre`. El campo `codigoSalida` permanece como dato de negocio sin prefijos ni IDs embebidos.
  5. Se registra auditoría en `AuditLogger.log` con `bodegaOrigenId` y `bodegaDestinoId`.

### Regla R-04: Compensación en Edición y Eliminación
- Si una orden de tipo `"A otra bodega"` es modificada o eliminada mediante `actualizarDetalleSalida` o `eliminarDetalleSalida`:
  - Se lee `ordenSalida.bodegaDestinoId`. Si no existe, se rechaza la operación con error explícito sin abrir la transacción ni alterar el stock.
  - Se repone el stock en la bodega origen (`devolverStock`).
  - Se descuenta correspondientemente el stock de la bodega destino (`descontarStock` con `esCompensacion: true`), validando saldo disponible pero sin bloquear si el lote venció tras haberse realizado el traspaso.
  - Se audita la reversión con `bodegaOrigenId` y `bodegaDestinoId`.

### Regla R-05: Exclusión de Traspasos Internos del Reporte de Consumo
- En `listarReporteConsumoMensual`, se filtran las órdenes excluyendo `tipoSalida: { not: "A otra bodega" }`, impidiendo que los movimientos internos entre farmacia y vacunatorio o boxes computen falsamente como consumo real del establecimiento.

---

## 3. Plan de Archivos Afectados

1. [`prisma/schema.prisma`](../../prisma/schema.prisma):
   - Agregar `bodegaDestinoId` y relación `bodegaDestino` en `OrdenSalida` y `salidasDestino` en `Bodega`.
2. [`src/app/orden-salida/page.tsx`](../../src/app/orden-salida/page.tsx):
   - Resolver `bodegasDestino` activas de los centros en alcance y transferirlas como prop al formulario.
3. [`src/modules/orden-salida/components/orden-salida-form.tsx`](../../src/modules/orden-salida/components/orden-salida-form.tsx):
   - Incorporar prop `bodegasDestino` y renderizar `TIPOS_SALIDA` en el selector de tipo de salida.
4. [`src/modules/orden-salida/actions/orden-salida.action.ts`](../../src/modules/orden-salida/actions/orden-salida.action.ts):
   - Guardar `bodegaDestinoId`, ejecutar compensación simétrica, validar destino en reversión y auditar con IDs.
5. [`src/modules/reporte/actions/reporte.action.ts`](../../src/modules/reporte/actions/reporte.action.ts):
   - Excluir traspasos internos del reporte mensual de consumo.
6. [`src/__tests__/traspaso-bodega.test.ts`](../../src/__tests__/traspaso-bodega.test.ts):
   - Pruebas unitarias de traspaso atómico, eliminación y actualización con compensación, saldo 0 y orden sin destino.
7. [`src/__tests__/traspaso-bodega-form.test.tsx`](../../src/__tests__/traspaso-bodega-form.test.tsx):
   - Prueba de interfaz que garantiza que operadores R07 con una única bodega pueden seleccionar bodegas hermanas del centro.

---

## 4. Criterios de Aceptación (Definición de Terminado)

- [x] **CA-1 (Opción visible):** El usuario puede seleccionar "A otra bodega" en el tipo de salida desde la lista `TIPOS_SALIDA`.
- [x] **CA-2 (Selector de destino):** Al seleccionar "A otra bodega", se muestra un desplegable con las demás bodegas del mismo centro (excluyendo la de origen), disponible también para operadores R03 y R07 con una sola bodega asignada.
- [x] **CA-3 (Traspaso bidireccional atómico):** Al confirmar, el stock del lote disminuye en la bodega origen e incrementa en la bodega destino dentro de una transacción atómica.
- [x] **CA-4 (Bloqueo de caducados y sin stock):** No se permite transferir lotes con fecha vencida ni con saldo 0.
- [x] **CA-5 (Seguridad en Backend):** Si se envían bodegas de distintos centros o la misma bodega como destino, el servidor rechaza la transacción.
- [x] **CA-6 (Compensación robusta y persistencia relacional):** `bodegaDestinoId` se persiste en la tabla `OrdenSalida`; al editar o eliminar se compensan ambas bodegas simétricamente y se genera error si falta el destino.
