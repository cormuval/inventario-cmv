# Especificación Técnica y de Negocio: Traspaso de Stock "A Otra Bodega" en el Mismo Centro

**Proyecto:** Sistema de Inventario APS — Corporación Municipal de Valparaíso (CMV)  
**Documento:** Especificación Funcional y Transaccional de Traspasos Internos  
**Versión:** 1.0 (Borrador para Aprobación)  
**Fecha:** 28 de Septiembre de 2026  
**Clasificación:** Operación de Inventario y Trazabilidad (Prioridad Alta)  

---

## 1. Diagnóstico del Problema

### El Reporte y Requerimiento:
> *"4.- 'A otra bodega' para que entre bodegas de un mismo centro se pueden hacer traspasos.  
> Diagnóstico: Crítico.  
> Detalle: Debido a metodología de pruebas este método estaba bloqueado por instrucciones de desarrollo, Se pide levantarlo como requerimiento para su selección y fase de pruebas."*

### Causa Raíz Detectada en Código:
1. **Frontend (`orden-salida-form.tsx`):**
   El selector de `tipoSalida` solo expone `"Consumo Interno"`, `"A Otros Centros"` y `"Merma"`. La opción `"A otra bodega"` no está disponible en la interfaz.
2. **Interfaz de Destino (`orden-salida-form.tsx`):**
   El campo "Destino" es un campo de texto libre. Para un traspaso interno entre bodegas del mismo centro de salud (CESFAM), el usuario debe seleccionar obligatoriamente una bodega receptora válida del mismo centro, excluyendo la bodega origen actual.
3. **Backend Transaccional (`orden-salida.action.ts`):**
   Actualmente, toda salida solo descuenta existencias de la bodega emisora mediante `descontarStock`. Para un traspaso interno de tipo `"A otra bodega"`, el sistema debe ejecutar una transferencia atómica completa en MySQL: descontar de la bodega emisora e incrementar automáticamente el stock de la bodega receptora con el mismo lote y fecha de vencimiento.

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
                   │                                            3. Registrar OrdenSalida con destino
                   │
                   └── NO ───► Flujo ordinario (Consumo Interno / A Otros Centros / Merma)
```

### Regla R-01: Disponibilidad de la Opción en la Interfaz
- Se habilita `"A otra bodega"` como opción seleccionable en el desplegable de `tipoSalida`.
- La opción queda sujeta a las mismas validaciones de vigencia sanitaria: **no se permite traspasar lotes caducados** ni lotes sin stock disponible (`cantidadDisponible > 0`).

### Regla R-02: Selección Asistida de Bodega Receptora
- Cuando `tipoSalida === "A otra bodega"`, el campo "Destino" deja de ser texto libre y se transforma en un selector desplegable (`<Select>`) que lista las bodegas activas pertenecientes al mismo `centroId`.
- El selector filtra y excluye automáticamente la bodega origen seleccionada (`bodega.id !== bodegaOrigenId`).
- Si el centro cuenta con una sola bodega, el sistema advierte que no existen otras bodegas en el centro para realizar traspasos.

### Regla R-03: Traspaso Atómico Completo en Servidor
- En `crearOrdenSalida`, dentro de `prisma.$transaction`:
  1. Se valida que la bodega destino exista, esté activa y pertenezca al mismo `centroId`.
  2. Se valida que `bodegaDestinoId !== bodegaOrigenId`.
  3. Para cada detalle de la orden:
     - Se descuenta el stock de la bodega origen (`descontarStock`).
     - Se incrementa o crea el stock en la bodega destino (`tx.stock.upsert`), manteniendo exactamente el mismo `productoId`, `lote` y `fechaCaducidad`.
  4. La orden se registra con `tipoSalida: "A otra bodega"` y `destino: bodegaDestino.nombre` (con el ID de bodega registrado en auditoría y trazabilidad).

### Regla R-04: Compensación en Edición y Eliminación
- Si una orden de tipo `"A otra bodega"` es modificada o eliminada mediante `actualizarDetalleSalida` o `eliminarDetalleSalida`:
  - Se repone el stock a la bodega origen.
  - Se descuenta correspondientemente el stock de la bodega destino para evitar duplicación o creación de stock fantasma.

---

## 3. Plan de Archivos Afectados

1. [`src/modules/orden-salida/components/orden-salida-form.tsx`](file:///c:/Users/benja/OneDrive/Escritorio/inventario-cmv-main/src/modules/orden-salida/components/orden-salida-form.tsx):
   - Agregar opción `<option value="A otra bodega">A otra bodega</option>`.
   - Cuando `tipoSalida === "A otra bodega"`, renderizar selector de `bodegaDestinoId` filtrando las bodegas del centro actual distintas de `bodegaId`.
   - Enviar `bodegaDestinoId` y el nombre en `destino`.
2. [`src/modules/orden-salida/actions/orden-salida.action.ts`](file:///c:/Users/benja/OneDrive/Escritorio/inventario-cmv-main/src/modules/orden-salida/actions/orden-salida.action.ts):
   - Validar coherencia del traspaso (mismo centro, bodegas distintas).
   - En `crearOrdenSalida`: aplicar `incrementarStockDestino` dentro de la transacción.
   - En `actualizarDetalleSalida` y `eliminarDetalleSalida`: compensar ambas bodegas si la orden es de traspaso interno.
3. [`src/modules/stock/utils/movimientos.ts`](file:///c:/Users/benja/OneDrive/Escritorio/inventario-cmv-main/src/modules/stock/utils/movimientos.ts):
   - Confirmar que `validarSalidaLoteCaducado` rechaza lotes caducados cuando `tipoSalida === "A otra bodega"`.
4. [`src/__tests__/orden-salida-schema.test.ts`](file:///c:/Users/benja/OneDrive/Escritorio/inventario-cmv-main/src/__tests__/orden-salida-schema.test.ts):
   - Agregar pruebas unitarias para el tipo de salida "A otra bodega".

---

## 4. Criterios de Aceptación (Definición de Terminado)

- [ ] **CA-1 (Opción visible):** El usuario puede seleccionar "A otra bodega" en el tipo de salida.
- [ ] **CA-2 (Selector de destino):** Al seleccionar "A otra bodega", se muestra un desplegable con las demás bodegas del mismo centro (excluyendo la de origen).
- [ ] **CA-3 (Traspaso bidireccional atómico):** Al confirmar, el stock del lote disminuye en la bodega origen e incrementa en la bodega destino.
- [ ] **CA-4 (Bloqueo de caducados y sin stock):** No se permite transferir lotes con fecha vencida ni con saldo 0.
- [ ] **CA-5 (Seguridad en Backend):** Si se envían bodegas de distintos centros o la misma bodega como destino, el servidor rechaza la transacción.
