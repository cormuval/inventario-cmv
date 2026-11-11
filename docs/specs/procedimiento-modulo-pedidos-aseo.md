# Especificación técnica: módulo de pedidos de existencias de aseo (INV-18 a INV-23)

**Proyecto:** Sistema de Inventario APS — Corporación Municipal de Valparaíso
**Versión:** 1.1
**Fecha:** 11 de noviembre de 2026
**Issue:** #29 (INV-18, INV-19, INV-20, INV-21, INV-22, INV-23)
**Origen:** reunión de requerimientos del 26/10/2026.

---

## 1. Objetivo y alcance

Hoy los centros arman su pedido mensual o suplementario de aseo por correo, Drive o documentos sueltos, sin trazabilidad. El módulo **Pedidos** les permite construirlo en el sistema, a partir de un catálogo cerrado de aseo, y guardar un historial consultable.

- El centro arma el pedido, lo guarda como borrador y lo envía.
- El sistema genera el documento en **PDF o Excel**. El centro lo envía a Adquisiciones por correo u otro medio y lo adjunta al TD.
- **Adquisiciones no opera en este sistema** (usa el suyo). Por eso no hay revisión, aprobación ni ajuste de cantidades dentro del módulo. INV-22 se cumple fuera del sistema; si en el futuro Adquisiciones tiene acceso, será con un rol de solo lectura.
- **El pedido no mueve stock.** El stock solo aumenta cuando el centro registra la `OrdenEntrada` al recibir físicamente los productos.

**Fuera de alcance:**
- Comunicación directa con TD (INV-23 v2), dashboard de anomalías (INV-27) y reportes de INV-26.
- Compatibilidad entre bodegas y líneas: una bodega de aseo solo debe operar productos de la línea ASEO, y las demás líneas pueden estar en cualquier otra bodega. Es una regla de negocio general del inventario y se tratará en una especificación aparte.

---

## 2. Estados

```
BORRADOR ──(Enviar)──► ENVIADO
    │                     │
 (Anular)              (Anular)
    ▼                     ▼
 ANULADO               ANULADO
```

- **BORRADOR:** el centro edita cantidades, tipo, período y observaciones. El centro y la bodega quedan fijos desde la creación.
- **ENVIADO:** el centro cerró el pedido; ya no se edita. Se registra `fechaEnvio`.
- **ANULADO:** cancelado con motivo obligatorio (5 a 255 caracteres); se registran `motivoAnulacion` y `fechaAnulacion`.

Las transiciones son condicionales sobre el estado (`updateMany` con `estado` en el `where`): si dos usuarios actúan a la vez, el segundo recibe un aviso y no pisa el cambio del primero.

---

## 3. Modelo de datos

Migración `20261111120000_modulo_pedidos_aseo`, solo tablas nuevas:

- **`pedidos`** (`Pedido`): número correlativo `PED-AAAA-NNNN` único, tipo (`MENSUAL` | `SUPLEMENTARIO`), estado, período `AAAA-MM` (obligatorio en mensual), centro, bodega opcional, solicitante, `fechaSolicitud` (creación), `fechaEnvio`, observaciones (500), `fechaAnulacion` y `motivoAnulacion` (255).
- **`pedidos_detalle`** (`PedidoDetalle`): producto, cantidad solicitada y `stockActualMomento` (stock vigente al guardar). Único por `(pedido, producto)`.
- **`pedidos_plantilla_aseo`** (`PedidoPlantillaAseo`): cantidad habitual por `(centro, producto)`.

El correlativo se calcula con el año de Chile. Si dos pedidos se crean a la vez y chocan en el número, la creación se reintenta hasta 3 veces.

---

## 4. Permisos

| Acción | Roles | Alcance |
|---|---|---|
| Crear, editar borrador, enviar, anular, guardar plantilla | R01, R02, R03 (`ROLES_GESTIONAN_PEDIDOS`) | Centros del alcance del usuario (`obtenerAlcanceInventario`); si se elige bodega, debe pertenecer al centro y al alcance |
| Ver historial, ver detalle, descargar PDF/Excel | Todos los roles | Centros del alcance del usuario. R01 y R08 ven todos los centros activos |

R06, R07 y R08 solo consultan. La página `/pedidos/nuevo` redirige al historial si el rol no gestiona pedidos.

Todas las acciones validan en el servidor: rol, alcance del centro (también para borradores existentes, descargas y el catálogo) y catálogo cerrado.

---

## 5. Catálogo, semáforo y sugerencias (INV-19, INV-21)

1. **Catálogo cerrado:** productos activos de la línea `ASEO`. El servidor rechaza cualquier otro producto, tanto en pedidos como en la plantilla.
2. **Stock considerado:** suma de lotes **vigentes con saldo** (`cantidadDisponible > 0` y `fechaCaducidad` posterior a hoy en Chile) de la bodega elegida o, sin bodega, de todas las bodegas activas del centro. Los lotes vencidos no cuentan.
3. **Umbral:** `UMBRAL_SUGERENCIA_ASEO = 10` unidades.
   - Rojo: 0 unidades.
   - Amarillo: de 1 a 9 unidades.
   - Verde: 10 o más.
4. **Sugerencia:** los productos bajo 10 unidades se marcan como sugeridos. La cantidad sugerida es la habitual de la plantilla o, si no hay, lo que falta para llegar a 10. El botón "Sugerir según existencias" completa solo esos productos; el resto queda a criterio del encargado.

**Criterio provisorio:** la columna `StockMinimo` de `Stock` no sirve como umbral, porque se recalcula en cada entrada (20 % del lote). El umbral fijo se revisará cuando se mejore la regla de stock mínimo.

---

## 6. Plantilla e historial (INV-20)

- "Guardar estas cantidades como plantilla habitual" guarda las cantidades actuales del formulario para el centro.
- "Cargar plantilla habitual" las aplica a un pedido nuevo.
- `/pedidos` lista los pedidos del alcance con filtros por centro, tipo, estado, período y búsqueda por número u observaciones, paginados.

---

## 7. Documentos (INV-19, INV-23)

- **PDF** (pdfkit, carta): encabezado institucional, número, centro, bodega, tipo y período, fecha (envío o creación), estado, solicitante, observaciones, tabla con código, insumo, stock al pedir y cantidad solicitada, total y firmas ("Firma y timbre encargado(a) del centro" y "Recepción Adquisiciones"). Un pedido anulado lo indica junto con su motivo.
- **Excel** (exceljs): los mismos datos en una hoja.
- Cada descarga queda en auditoría con la acción `exportar`.

---

## 8. Auditoría

Entidad `Pedido`: `crear`, `actualizar` (guardar o enviar un borrador, guardar plantilla), `anular` (con estado anterior y motivo) y `exportar` (formato).
