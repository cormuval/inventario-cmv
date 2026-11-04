# Especificación Técnica y de Negocio: Traspaso y Préstamo Intercentros con Código de Verificación

**Proyecto:** Sistema de Inventario APS — Corporación Municipal de Valparaíso (CMV)  
**Documento:** Especificación Funcional, Logística y de Seguridad: Traspaso entre Centros de Salud (Préstamo)  
**Versión:** 1.2 (Actualizado: Correo trasladado al PR de integración Resend; Campana in-app como aviso oficial; Mecanismo de Anulación y Prevención de Concurrencia)  
**Fecha:** 4 de Noviembre de 2026  
**Clasificación:** Operación de Inventario, Seguridad Logística y Trazabilidad (Prioridad Alta)  

---

## 1. Diagnóstico del Problema y Justificación de Negocio

### El Reporte y Requerimiento:
> *"Al momento de hacer un traspaso a otro centro que se considera como préstamo tiene que existir una instancia donde el centro recibidor tiene que ingresar el código de emisión. Una vez ingresado el código, el sistema detecta la transacción y la realiza pasando el o los productos de préstamo al otro centro.*  
> *Preocupación crítica: Si el emisor genera el código y el receptor demora días en ingresarlo, el material en físico ya se transportó pero en el sistema sigue figurando como disponible si no se descuenta, permitiendo manipulación y stock fantasma en la sucursal emisora.*  
> *Requisitos acordados:*  
> *1. Descuento inmediato en el centro emisor al momento del despacho para erradicar el stock fantasma.*  
> *2. Estado transaccional 'En tránsito' durante el trayecto físico.*  
> *3. Código de recepción de 7 caracteres alfanuméricos aleatorios sin ambigüedad visual (excluye 0, O, 1, I) con restricción de unicidad en base de datos.*  
> *4. Límite temporal de tránsito de 1 semana (7 días / 168 horas).*  
> *5. Advertencia sanitaria consultiva si el producto vence en el plazo de 1 semana (no bloqueo duro, pues el criterio de bloqueo de merma era muy restrictivo para las urgencias asistenciales).*  
> *6. Botón de notificación con campana y punto rojo en la barra superior que avisa al personal del centro receptor cuando hay préstamos en camino (conteo total real).*  
> *7. Notificación in-app y auditoría interna en este PR. (Nota de alcance: El envío real de correos vía Resend se traslada al PR de integración de correo).*  
> *8. Campo opcional de retroalimentación en la recepción por si hubo alguna incidencia menor en el traslado.*  
> *9. Mecanismo de anulación con restitución de stock a la bodega de origen para préstamos extraviados o mal emitidos en tránsito.*  
> *10. Bloqueo de edición y eliminación de detalle en órdenes de préstamo para prevenir duplicación o inconsistencia de stock.*  
> *11. Prevención estricta de doble recepción (race condition) mediante actualización condicional atómica.*  
> *12. Arquitectura de bajo peso y bajo costo (sin workers pesados ni cron jobs en segundo plano)."*

---

## 2. Diagrama de Flujo y Reglas de Negocio

```
                                [ CENTRO EMISOR (A) ]
                                          │
                     1. Emite salida tipo "A Otros Centros" (Préstamo)
                     2. Selecciona Centro Destino (B)
                                          │
                     ¿Algún lote vence en ≤ 1 semana (7 días)?
                     ├── SÍ ──► ⚠️ ADVERTENCIA SANITARIA:
                     │          "El lote vence en el plazo de 1 semana. ¿Confirma coordinación
                     │           para consumo urgente e inmediato en el centro destino?"
                     │          [Cancelar] / [Confirmar y Proceder]
                     │
                     └── NO / Confirmado ──► ✔ ATÓMICA TRANSACCIÓN:
                                                - Descuenta Stock inmediato en A (sin stock fantasma).
                                                - Genera Código 7 chars único (K94J2Q8).
                                                - Crea OrdenSalida con estado 'EN_TRANSITO'.
                                                - Notificación interna fail-safe en logs.
                                                - Fecha límite de tránsito: hoy + 7 días.
                                          │
                                   [ EN TRÁNSITO ]
                     (Flete / Transporte físico entre establecimientos)
                                          │
                               [ CENTRO RECEPTOR (B) ]
                                          │
                     1. Campana 🔔 con punto rojo en barra superior alerta envíos en camino.
                     2. Accede a /orden-entrada/recepcion-prestamos.
                     3. Ingresa Código de Recepción (7 chars).
                     4. Sistema valida:
                        - ¿Existe la orden?
                        - ¿Estado es 'EN_TRANSITO'?
                        - ¿El usuario tiene alcance sobre el Centro Destino?
                        - ¿Bodega receptora pertenece al centro destino?
                     5. Revisa insumos, lotes y alerta de demora (> 7 días si aplica).
                                          │
                     ¿Confirmar Recepción física?
                     ├── SÍ ──► ✔ TRANSACCIÓN ATÓMICA CON CONDICIÓN:
                     │          - Update condicional estadoPrestamo = 'EN_TRANSITO' -> 'RECEPCIONADO'.
                     │          - Si count !== 1 -> Error "El préstamo ya fue recibido o anulado".
                     │          - Incrementa Stock en Bodega Receptora en B (lotes y caducidades).
                     │          - Genera OrdenEntrada automática vinculada.
                     │          - Guarda observación de recepción opcional.
                     │          - Auditoría con centro y bodega destino.
                     │
                     └── ANULACIÓN (Si emisor o admin anula en tránsito):
                                - anularPrestamoAction con motivo obligatorio.
                                - Update condicional 'EN_TRANSITO' -> 'ANULADO'.
                                - Restituye stock a la bodega de origen.
```

---

## 3. Impacto en Componentes y Archivos

| Archivo | Tipo de Cambio | Descripción |
|---|---|---|
| `prisma/schema.prisma` | Modelo de Datos | Columnas en `OrdenSalida`: `centroDestinoId`, `estadoPrestamo`, `codigoRecepcion` (@unique), `fechaLimiteRecepcion`, `fechaRecepcion`, `usuarioReceptorId`, `observacionRecepcion`, `advertenciaCaducidadAceptada`. Relaciones y migration formal commiteada. |
| `src/modules/orden-salida/actions/orden-salida.action.ts` | Server Action | Generación de código único (reintento P2002 hasta 3 veces), validación de bodega destino si aplica, descuento inmediato, bloqueo de edición/eliminación de detalle para préstamos, y `anularPrestamoAction` con restitución de stock. |
| `src/modules/orden-salida/utils/notificar-prestamo.ts` | Utilidad Servidor | Fail-safe interno para registro de auditoría (`import "server-only"`). (TODO correo Resend en PR aparte). |
| `src/modules/orden-salida/components/orden-salida-form.tsx` | Formulario UI | Banner/checkbox de advertencia sanitaria y despliegue del código de 7 caracteres con botón copiar al emitir. |
| `src/modules/orden-salida/components/boton-anular-prestamo.tsx` | Componente UI | Modal y botón para anulación con motivo obligatorio en el historial de salidas. |
| `src/modules/orden-salida/components/estado-prestamo-badge.tsx` | Componente UI | Badge de estado (`En tránsito`, `Recepcionado`, `Anulado`) y código. |
| `src/shared/components/layout/boton-notificaciones-prestamos.tsx` | Componente UI | Botón de campana con punto rojo e información de transferencias entrantes con conteo total real. |
| `src/modules/orden-entrada/actions/recepcion-prestamos.action.ts` | Server Action | Búsqueda por código de 7 caracteres y confirmación con protección race-condition (`updateMany` condicional) y validación de alcance. |
| `src/modules/orden-entrada/components/recepcion-prestamo-view.tsx` | Componente UI | Pantalla de búsqueda, detalle de insumos, selector de bodega destino filtrada por alcance, observaciones y confirmación. |

---

## 4. Criterios de Aceptación (Definición de Terminado)

- [x] **CA-1: Cero Stock Fantasma en Emisor:** El stock se descuenta inmediatamente de la bodega de origen al emitir.
- [x] **CA-2: Código Aleatorio Único de 7 Caracteres:** Código de 7 caracteres en mayúsculas sin caracteres ambiguos (`0/O`, `1/I`), con `@unique` y reintento P2002.
- [x] **CA-3: Advertencia Sanitaria Consultiva (1 Semana):** Checkbox de advertencia sanitaria en formulario para lotes con vencimiento $\le 7$ días.
- [x] **CA-4: Botón de Campana con Conteo Real:** Campana con punto rojo en cabecera con conteo real mediante `count()` en paralelo.
- [x] **CA-5: Popover y Acceso Rápido:** Lista de envíos en camino con enlace directo a `/orden-entrada/recepcion-prestamos`.
- [x] **CA-6: Alcance del Usuario en Recepción:** Validación con `validarCentroBodegaEnAlcance` y filtrado dinámico de bodegas del centro destino.
- [x] **CA-7: Prevención de Doble Recepción (Race Condition):** Actualización condicional dentro de transacción; el stock se incrementa una sola vez.
- [x] **CA-8: Bloqueo de Modificación/Eliminación de Detalle:** Bloqueo en servidor y UI para órdenes de préstamo intercentros.
- [x] **CA-9: Mecanismo de Anulación:** `anularPrestamoAction` con motivo obligatorio y restitución de stock a la bodega emisora.
- [x] **CA-10: Auditoría Completa:** Registro con `centroId` y `bodegaId` de destino en recepción, acción `anular` en auditoría.
- [x] **CA-11: Pruebas y Tipado:** Pruebas unitarias completas pasando y TypeScript estricto sin errores.
