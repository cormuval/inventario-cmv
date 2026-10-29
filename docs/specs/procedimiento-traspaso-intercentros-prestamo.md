# Especificación Técnica y de Negocio: Traspaso y Préstamo Intercentros con Código de Verificación

**Proyecto:** Sistema de Inventario APS — Corporación Municipal de Valparaíso (CMV)  
**Documento:** Especificación Funcional, Logística y de Seguridad: Traspaso entre Centros de Salud (Préstamo)  
**Versión:** 1.1 (Actualizado con Ventana de 1 Semana, Advertencia Sanitaria de Merma y Notificaciones)  
**Fecha:** 27 de Octubre de 2026  
**Clasificación:** Operación de Inventario, Seguridad Logística y Trazabilidad (Prioridad Alta)  

---

## 1. Diagnóstico del Problema y Justificación de Negocio

### El Reporte y Requerimiento:
> *"Al momento de hacer un traspaso a otro centro que se considera como préstamo tiene que existir una instancia donde el centro recibidor tiene que ingresar el código de emisión. Una vez ingresado el código, el sistema detecta la transacción y la realiza pasando el o los productos de préstamo al otro centro.*  
> *Preocupación crítica: Si el emisor genera el código y el receptor demora días en ingresarlo, el material en físico ya se transportó pero en el sistema sigue figurando como disponible si no se descuenta, permitiendo manipulación y stock fantasma en la sucursal emisora.*  
> *Requisitos acordados:*  
> *1. Descuento inmediato en el centro emisor al momento del despacho para erradicar el stock fantasma.*  
> *2. Estado transaccional 'En tránsito' durante el trayecto físico.*  
> *3. Código de recepción de 7 caracteres alfanuméricos aleatorios sin ambigüedad visual.*  
> *4. Límite temporal de tránsito de 1 semana (7 días / 168 horas).*  
> *5. Advertencia sanitaria consultiva si el producto vence en el plazo de 1 semana (no bloqueo duro, pues el criterio de bloqueo de merma era muy restrictivo para las urgencias asistenciales).*  
> *6. Botón de notificación con campana y punto rojo en la barra superior que avisa al encargado receptor de cada centro cuando hay préstamos en camino.*  
> *7. Notificación por correo electrónico y en página al centro receptor.*  
> *8. Campo opcional de retroalimentación en la recepción por si hubo alguna incidencia menor en el traslado.*  
> *9. Arquitectura de bajo peso y bajo costo (sin workers pesados ni cron jobs en segundo plano)."*

### Causa Raíz Detectada en Código:
1. **Transferencia Intercentros Asincrónica no Soportada:**
   - Actualmente, las salidas ordinarias tipo `"A Otros Centros"` solo dan de baja existencias en la bodega emisora mediante texto referencial (`Destino`), sin coordinar ni alimentar la bodega del establecimiento receptor.
   - A diferencia de los traspasos internos en el mismo centro (`"A otra bodega"`), donde el movimiento es físico e inmediato dentro del mismo edificio, entre centros de salud comunales distintos (ej. CESFAM Barón → CESFAM Playa Ancha) media un traslado en flete/camioneta que toma horas o días.
2. **El Riesgo del "Stock Fantasma" vs. "Stock Prematuro":**
   - Si el sistema no descuenta en el emisor hasta que el receptor confirme, la farmacia de origen ve existencias que ya no están en las estanterías, arriesgando dispensaciones indebidas.
   - Si el sistema carga de inmediato el stock en el centro destino, dicho centro pasa a tener disponible un insumo que aún va en camino o que podría sufrir accidentes en la ruta.
3. **Manejo Equilibrado de Caducidad / Merma Inminente:**
   - Un bloqueo automático y estricto impedía préstamos urgentes de insumos con vencimiento próximo que el centro destino necesitaba utilizar de inmediato para curaciones o urgencias del día. Se requiere una advertencia consultiva con confirmación explícita en lugar de una restricción invalidante.
4. **Falta de Visibilidad y Comunicación Inmediata:**
   - El personal del centro de destino no tenía forma de enterarse de que venía un envío en camino hasta que la camioneta llegaba a la puerta, perdiendo tiempo de coordinación. Se requiere una alerta visual permanente en el sistema (campana con punto rojo) y un aviso por correo electrónico.

---

## 2. Diagrama de Flujo y Reglas de Negocio

```
                                [ CENTRO EMISOR (A) ]
                                          │
                     1. Emite salida tipo "A Otros Centros" (Préstamo)
                     2. Selecciona Centro Destino (B) y Bodega Receptora
                                          │
                     ¿Algún lote vence en ≤ 1 semana (7 días)?
                     ├── SÍ ──► ⚠️ ADVERTENCIA SANITARIA:
                     │          "El lote vence en el plazo de 1 semana. ¿Confirma coordinación
                     │           para consumo urgente e inmediato en el centro destino?"
                     │          [Cancelar] / [Confirmar y Proceder]
                     │
                     └── NO / Confirmado ──► ✔ ATÓMICO en Emisor:
                                 • Descuenta stock de inmediato en Bodega Origen (Cero stock fantasma)
                                 • Genera código de 7 caracteres (ej: "K94J2Q8")
                                 • Estado de la orden: EN_TRANSITO
                                 • Fecha Límite = Fecha Emisión + 7 días (1 semana)
                                 • Dispara Notificación por Correo a receptores de B (Server Action)
                                 • Activa Punto Rojo 🔔🔴 en la sesión de los usuarios del Centro B
                                          │
                                   [ FLETE FÍSICO ]
                                          │
                                [ CENTRO RECEPTOR (B) ]
                                          │
                     3. El receptor ve la Campana con Punto Rojo (🔔🔴) en la cabecera
                     4. Clic en la campana despliega envíos en camino con enlace directo
                     5. Ingresa a "/orden-entrada/recepcion-prestamos"
                     6. Digita el Código de 7 caracteres ("K94J2Q8")
                                          │
                     ¿Orden encontrada y estado EN_TRANSITO?
                     ├── NO ──► ⛔ ERROR: "Código no válido o ya recepcionado."
                     │
                     └── SÍ ──► ¿Han pasado más de 7 días (1 semana) desde la emisión?
                                ├── SÍ ──► ⚠️ Alerta: "Tránsito con demora (> 1 semana)".
                                │          Permite recibir con observación o solicitar intervención R01.
                                │
                                └── NO / Confirmado con observación opcional ──► ✔ ATÓMICO en Receptor:
                                           • Incrementa stock en Bodega Receptora de B (mismo lote/caducidad)
                                           • Registra Entrada automática vinculada
                                           • Estado de orden pasa a RECEPCIONADO
                                           • Punto rojo se apaga automáticamente si no hay más órdenes
                                           • Auditoría completa de ambas puntas
```

---

### Regla R-01: Descuento Inmediato en Origen y Cero Stock Fantasma
- Cuando el operador emisor guarda una orden de traspaso a otro centro:
  1. Se descuenta el stock **inmediatamente** de la bodega emisora dentro de la transacción de Prisma (`descontarStock`).
  2. Los productos salen del inventario disponible del emisor al instante en que se genera la guía/código.

### Regla R-02: Generación del Código de Recepción (7 Caracteres)
- El sistema genera un código unívoco de **7 caracteres alfanuméricos en mayúsculas** (excluyendo caracteres visualmente ambiguos como `0`, `O`, `1`, `I` para evitar errores de lectura manual en guías físicas, ej. alfabeto base `23456789ABCDEFGHJKLMNPQRSTUVWXYZ`).
- Este código se indexa en la base de datos (`VARCHAR(10)`, `@@index([codigoRecepcion])`).
- La orden almacena:
  - `codigoRecepcion`: Código de 7 caracteres.
  - `estadoPrestamo`: `EN_TRANSITO` (al emitir), `RECEPCIONADO` (al confirmar), `ANULADO` (si se aborta).
  - `fechaLimiteRecepcion`: `fechaEmision + 7 días`.
  - `centroDestinoId` y `bodegaDestinoId`.
  - `advertenciaCaducidadAceptada`: Booleano que audita si se autorizó envío con caducidad próxima.

### Regla R-03: Advertencia Sanitaria de Merma (No Bloqueo Duro)
- Al momento de seleccionar los lotes en la orden del emisor:
  - Si `fechaCaducidad <= now() + 7 días` (1 semana):
    - El sistema **no bloquea** la transacción.
    - Se despliega un diálogo modal de confirmación sanitaria obligatoria:
      > *"⚠️ Advertencia Sanitaria: El lote [X] de [Producto] vencerá el [Fecha] (dentro de la próxima semana). ¿Confirma que el centro receptor está notificado y que el insumo será utilizado de forma urgente antes de su vencimiento?"*
    - El operador debe marcar la casilla de confirmación para habilitar el guardado.
    - Queda registrado en la auditoría con el nombre del usuario emisor que autorizó el despacho.

### Regla R-04: Límite Temporal de Tránsito de 1 Semana (7 Días) sin Sobrecarga Técnica
- Para cumplir el requisito de **bajo peso y bajo costo**:
  - **No se implementan cron jobs ni workers en segundo plano**.
  - El estado de expiración se evalúa al vuelo en las consultas:
    - Si `estadoPrestamo === "EN_TRANSITO"` y `new Date() > fechaLimiteRecepcion`:
      - En la interfaz se despliega una insignia de alerta visual: `"Tránsito Demorado (> 7 días)"` con tono advertencia (ámbar/rojo).
  - En la pantalla de recepción del receptor, si el código ingresado corresponde a un tránsito demorado:
    - Se muestra una advertencia visual destacada, permitiendo al receptor confirmar si el material físico llegó íntegro y en condiciones sanitarias óptimas.

### Regla R-05: Botón de Notificación con Campana y Punto Rojo (Header Navbar)
- En la cabecera general de la aplicación (`src/shared/components/layout/app-sidebar-shell.tsx`), junto a los controles de usuario, se incorpora un botón con ícono de campana (`Bell`).
- **Indicador de Punto Rojo:**
  - Cuando existan órdenes en estado `EN_TRANSITO` donde `centroDestinoId === user.centroId`, se renderiza un punto rojo brillante en la esquina superior derecha del ícono de campana (tal como en el diseño de referencia adjunto).
  - La consulta es liviana (`SELECT COUNT(id) FROM OrdenSalida WHERE centroDestinoId = ? AND estadoPrestamo = 'EN_TRANSITO'`).
- **Interacción del Botón (Popover de Notificaciones):**
  - Al hacer clic en la campana, se abre un popover flotante con:
    - Contador de transferencias pendientes hacia el centro.
    - Tarjeta por cada envío: Centro de origen, Bodega remitente, Cantidad de ítems y fecha de despacho.
    - Botón de acción rápida: *"Recepcionar con Código"*, que redirige directamente a la pantalla de recepción (`/orden-entrada/recepcion-prestamos`).
  - Si el contador es 0, no se muestra el punto rojo y el popover indica: *"No hay transferencias pendientes en tránsito para tu centro"*.

### Regla R-06: Notificación por Correo Electrónico (Server Action y Despacho Asíncrono)
- Al confirmarse la emisión de la orden de salida tipo *"A otros centros"*:
  1. La Server Action busca los correos institucionales de los funcionarios activos con encargo de bodega en el `centroDestinoId`.
  2. Adicionalmente, incluye el correo opcional ingresado en el campo `correoDestino` si fue provisto.
  3. Despacha un correo electrónico estructurado con la información de la transferencia:
     - Asunto: `[Inventario CMV] Notificación de Envío / Préstamo Intercentros - Código: [XXXXXXX]`
     - Detalle: Centro de origen, bodega origen, bodega sugerida de destino, listado de productos, lotes y cantidades.
     - Código de verificación de 7 caracteres destacado para su ingreso al momento de la llegada física.
  4. **Tolerancia a Fallos:** El despacho de correo se ejecuta de forma desacoplada y *fail-safe* (con `try/catch`). Si el servidor de correos no responde o genera error, **la transacción de inventario no se cae ni se cancela**; se registra una advertencia en el log de auditoría.

### Regla R-07: Recepción en Centro Destino con Retroalimentación Opcional
- Se habilita en el módulo de entradas una interfaz accesible: **"Recepción de Préstamos Intercentros"** (con buscador por código de 7 caracteres).
- Al ingresar el código:
  1. El sistema valida que el usuario pertenezca al `centroDestinoId` de la orden (o sea Administrador Central R01).
  2. Muestra el resumen del envío: centro emisor, bodega origen, fecha de envío, productos, cantidades y lotes.
  3. Contiene un campo de texto opcional: **"Observaciones de recepción"** (máximo 255 caracteres, ej. *"Cajas selladas, se recepciona conforme sin anomalías"*).
  4. Botón **"Confirmar Recepción e Ingresar a Bodega"**.
- Al confirmar dentro de `prisma.$transaction`:
  - Se incrementa el stock en la bodega de destino seleccionada (`tx.stock.upsert`) preservando lote y fecha de vencimiento.
  - Se actualiza la orden: `estadoPrestamo = "RECEPCIONADO"`, `fechaRecepcion = now()`, `usuarioReceptorId`, `observacionRecepcion`.
  - El punto rojo de la campana se actualiza/apaga si ya no quedan envíos pendientes.
  - Se audita la acción con `AuditLogger.log` registrando la confirmación del préstamo.

### Regla R-08: Mecanismo de Cancelación y Reintegro (Resolución de Extravíos)
- Si un préstamo nunca llegó a destino o el traslado fue cancelado antes de salir:
  - El Administrador (R01) o el funcionario emisor pueden pulsar **"Anular Traspaso no Recibido"**.
  - Esto revierte el stock a la bodega emisora original (`devolverStock`) y pasa el estado a `ANULADO`, invalidando el código de 7 caracteres.
  - Si el paquete se dañó totalmente en el viaje, se registra como merma en transporte mediante auditoría.

### Regla R-09: Trazabilidad y Auditoría Extremo a Extremo
- Se auditan todas las etapas en la tabla `logs`:
  - **Emisión:** `{ accion: "crear", entidad: "OrdenSalida", detalle: { codigoRecepcion, tipoSalida: "A Otros Centros", centroDestinoId, bodegaDestinoId, estadoPrestamo: "EN_TRANSITO", advertenciaCaducidadAceptada } }`.
  - **Recepción:** `{ accion: "actualizar", entidad: "OrdenSalida", detalle: { codigoRecepcion, estadoPrestamo: "RECEPCIONADO", observacionRecepcion } }`.
  - **Anulación:** `{ accion: "anular", entidad: "OrdenSalida", detalle: { codigoRecepcion, motivo: "Anulación por emisor o administrador" } }`.

---

## 3. Impacto en Componentes y Archivos

| Archivo | Tipo de Cambio | Descripción |
|---|---|---|
| `prisma/schema.prisma` | Modelo de Datos | Columnas en `OrdenSalida`: `centroDestinoId`, `estadoPrestamo` (enum/string), `codigoRecepcion` (indexado), `fechaLimiteRecepcion`, `fechaRecepcion`, `usuarioReceptorId`, `observacionRecepcion`, `advertenciaCaducidadAceptada`. |
| `src/modules/orden-salida/actions/orden-salida.action.ts` | Server Action | Generación de código de 7 caracteres aleatorios, descuento inmediato, cálculo de límite a 1 semana (+7 días), registro `EN_TRANSITO` y llamada al servicio de notificación. |
| `src/modules/orden-salida/actions/notificacion-correo.ts` | Nueva Server Action / Servicio | Búsqueda de destinatarios del centro receptor y despacho asíncrono fail-safe de correo con código de recepción y detalle. |
| `src/modules/orden-salida/components/orden-salida-form.tsx` | Formulario UI | Modal/banner de advertencia sanitaria consultiva si algún lote caduca en $\le 7$ días (con check de confirmación). Despliegue del código de 7 caracteres tras emitir. |
| `src/shared/components/layout/app-sidebar-shell.tsx` | Layout Header | Inclusión del botón de notificación campana con punto rojo (`BotonNotificacionesPrestamos`) en la barra superior. |
| `src/shared/components/layout/boton-notificaciones-prestamos.tsx` | Nuevo Componente UI | Botón de campana con badge de punto rojo condicional y Popover desplegable con los envíos en camino dirigidos al centro del usuario. |
| `src/modules/orden-entrada/actions/prestamos.action.ts` | Nueva Server Action | Validación del código de 7 caracteres, verificación de pertenencia al centro receptor, incremento de stock e ingreso de observación opcional. |
| `src/modules/orden-entrada/components/recepcion-prestamo-dialog.tsx` | Nuevo Componente UI | Diálogo/pantalla de ingreso de código de recepción con vista previa de lotes y campo de retroalimentación opcional. |
| `src/modules/orden-salida/utils/codigo-recepcion.ts` | Utilidad | Generador seguro de cadenas aleatorias de 7 caracteres sin colisiones ni caracteres ambiguos (`0/O`, `1/I`). |
| `src/__tests__/traspaso-intercentros.test.ts` | Pruebas Unitarias | Tests de descuento inmediato, advertencia de caducidad en 7 días, confirmación por código, tiempo límite a 1 semana, notificación y anulación. |

---

## 4. Criterios de Aceptación (Definición de Terminado)

- [ ] **CA-1: Cero Stock Fantasma en Emisor:** Al emitir un préstamo a otro centro, el stock se descuenta inmediatamente de la bodega de origen dentro de la transacción.
- [ ] **CA-2: Código Aleatorio de 7 Caracteres:** Cada préstamo intercentro genera un código único de 7 caracteres en mayúsculas sin caracteres confusos (`0/O`, `1/I`).
- [ ] **CA-3: Advertencia Sanitaria de Lotes Próximos a Vencer (1 Semana):** El sistema advierte en pantalla si un lote vence en $\le 7$ días y exige confirmación explícita del emisor, sin bloquear la emisión médica urgente.
- [ ] **CA-4: Botón de Campana con Punto Rojo en Navbar:** La cabecera superior muestra una campana con punto rojo visible para los usuarios del centro destino mientras existan envíos en estado `EN_TRANSITO` hacia dicho centro.
- [ ] **CA-5: Popover y Acceso Rápido:** Al hacer clic en la campana, se visualizan los envíos entrantes y un botón para dirigirse a recepcionar con código.
- [ ] **CA-6: Notificación por Correo Fail-Safe:** Se despacha un correo a los encargados del centro receptor con el código y detalle sin bloquear la transacción si el servicio de correo falla.
- [ ] **CA-7: Recepción Protegida por Código:** El receptor solo puede ingresar el stock a su bodega ingresando el código emitido y perteneciendo al centro de destino indicado.
- [ ] **CA-8: Tiempo Límite de 1 Semana:** Si transcurren más de 7 días sin ingresar el código, el sistema etiqueta el tránsito como demorado y advierte al receptor antes de confirmar.
- [ ] **CA-9: Retroalimentación Opcional:** El receptor puede ingresar observaciones breves en caso de discrepancias o daños menores de traslado.
- [ ] **CA-10: Mecanismo de Cancelación:** El emisor o administrador puede anular un préstamo no recepcionado para reincorporar el stock a la bodega original.
- [ ] **CA-11: Pruebas y Tipado:** Cobertura de tests unitarios, tipado TypeScript estricto y cero regresiones en los módulos existentes.
