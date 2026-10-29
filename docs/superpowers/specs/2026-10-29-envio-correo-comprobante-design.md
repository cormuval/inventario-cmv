# Diseño: Envío del comprobante de salida por correo (Resend)

**Proyecto:** Inventario APS — Corporación Municipal de Valparaíso (CMV)
**Fecha:** 29 de octubre de 2026
**Estado:** Aprobado
**Relacionado:** `docs/specs/procedimiento-descarga-comprobante-pdf-salida.md` (PR #13), PR #14 (traspaso intercentros)

---

## 1. Problema

El formulario de orden de salida pide un **correo destino**, que se guarda en `OrdenSalida.correoDestino`, pero el sistema nunca envía nada. El campo `enviarCorreo` del esquema tampoco se usa. El comprobante PDF existe (PR #13), pero solo se puede descargar.

Además, otras funcionalidades necesitarán enviar correos, como el aviso de préstamo entre centros (PR #14). Hace falta un servicio de correo compartido.

## 2. Objetivo

1. Un servicio de correo compartido sobre **Resend**, reutilizable por cualquier módulo.
2. **Primer uso:** enviar el comprobante PDF de la salida al `correoDestino`:
   - automáticamente al registrar la salida, y
   - a pedido desde el historial ("Enviar comprobante"), con posibilidad de corregir el correo.
3. Dejar registro de cada envío (auditoría) y del estado del último envío en la orden.

## 3. Decisiones

| Tema | Decisión | Alternativa descartada |
|---|---|---|
| Integración | SDK `resend` directo en la app, con API key propia del proyecto | Microservicio `servicio-de-correo-resend`: agrega una dependencia de red y un proceso externo, el PDF viajaría en base64 por HTTP y el servicio no tiene autenticación |
| Momento del envío | Automático al registrar (si hay correo) + botón de reenvío en el historial | Solo automático (sin corrección de tipeo) o solo manual |
| Registro | Auditoría por intento + estado del último envío en `OrdenSalida` | Solo auditoría (el historial no mostraría el estado) |
| Ejecución | Síncrona, después de confirmar la transacción | Cola o segundo plano: innecesario para un PDF de ~40 ms y un envío de menos de 1 s |

## 4. Arquitectura

### 4.1 `src/shared/lib/correo.ts` (servicio genérico)

Es el único archivo que conoce Resend. Es un módulo de servidor sin `"use server"` (no se expone como acción) y solo lo importa código de servidor.

```ts
export interface AdjuntoCorreo {
    nombre: string;
    contenido: Buffer;
}

export interface CorreoInput {
    para: string | string[];
    asunto: string;
    html: string;
    texto: string;
    responderA?: string;
    adjuntos?: AdjuntoCorreo[];
}

export type ResultadoCorreo =
    | { ok: true; id: string }
    | { ok: false; error: string; omitido?: boolean };

export async function enviarCorreo(input: CorreoInput): Promise<ResultadoCorreo>;
```

- **Nunca lanza excepciones.** El SDK devuelve `{ data, error }`; tanto ese error como cualquier excepción de red se traducen a `{ ok: false, error }`.
- **Sin `RESEND_API_KEY`** (CI, tests o entorno local sin clave) devuelve `{ ok: false, omitido: true, error: "Envío de correo no configurado" }` sin llamar a Resend.
- **Remitente:** sale de `CORREO_REMITENTE`, con valor por defecto `Inventario CMV <inventario@gi.cmvalparaiso.cl>`.
- El cliente Resend se crea de forma perezosa, una sola vez por proceso.

### 4.2 `src/modules/orden-salida/utils/correo-comprobante.ts`

Arma el correo del comprobante a partir de los datos de la orden (`OrdenSalidaPDFData`):

- **Asunto:** `Comprobante de salida N° {id} — {centro}`
- **Cuerpo:** HTML simple con los colores de la app, más una versión en texto plano. Incluye fecha, centro, bodega de origen, destino (o bodega destino), cantidad de líneas y emisor (nombre y correo). El detalle completo va en el PDF adjunto.
- **`responderA`:** correo del usuario emisor de la orden.
- **Adjunto:** `comprobante-salida-{id}.pdf`, generado con `generarComprobanteSalidaPDF()`.

Es una función pura (`construirCorreoComprobante(orden, pdf): CorreoInput`), así que se puede probar sin red.

### 4.3 `src/modules/orden-salida/utils/envio-comprobante.ts` y cambios en `orden-salida.action.ts`

La lógica compartida vive en un módulo de servidor sin `"use server"`, para que no quede expuesta como Server Action y se pueda probar de forma aislada:

- **`cargarOrdenParaComprobante(ordenId)`:** el `findUnique` + `include` que hoy está en `descargarComprobanteSalidaAction`. Lo comparten la descarga y el envío.
- **`enviarComprobanteSalida({ ordenId, usuarioId, para, reenvio })`:**
  1. Carga la orden y valida el alcance (`validarCentroBodegaEnAlcance`).
  2. Genera el PDF, construye el correo y llama a `enviarCorreo`.
  3. Actualiza el estado del envío en la orden (sección 5).
  4. Audita el intento (sección 6).
  5. Devuelve el `ResultadoCorreo`.
- **`crearOrdenSalida`:** después de la transacción y de la auditoría de creación, si existe `correoDestino`, llama a `enviarComprobanteSalida(..., reenvio: false)`. La salida **nunca se revierte** por un fallo de correo. El mensaje de respuesta según el resultado:
  - envío exitoso: `"Orden de salida registrada. Comprobante enviado a {correo}."`
  - fallo: `"Orden de salida registrada."` con `ok: true` y el nuevo campo opcional `advertencia?: string` en `src/shared/types/action-state.ts` = `"No se pudo enviar el comprobante: {error}"`
  - omitido o sin correo: `"Orden de salida registrada."`
- **`reenviarComprobanteSalidaAction(ordenId, correo)`:** nueva Server Action exportada.
  - Exige sesión (`requireSessionUser`) y permiso `puedeOperarSalida`.
  - Valida el correo con Zod `.email()`.
  - Si el correo cambió, actualiza `correoDestino`.
  - Llama a `enviarComprobanteSalida(..., reenvio: true)` y ejecuta `revalidatePath("/orden-salida")`.

### 4.4 UI

- **Formulario de salida:** el mensaje se sigue mostrando con `ActionMessage`. Si viene `advertencia`, se muestra en ámbar bajo el recuadro de "Salida registrada con éxito".
- **Historial (`src/app/orden-salida/page.tsx`):**
  - Badge de estado de correo:
    - **Enviado** (`enviarCorreo = true`), con tooltip de fecha y destinatario.
    - **Falló** (`errorEnvioCorreo` presente), con el motivo en el tooltip.
    - **Sin envío**, en los demás casos.
  - Botón **"Enviar comprobante"** junto a "Descargar". Abre un modal (componente nuevo `boton-enviar-comprobante.tsx`) con el correo precargado y editable, y confirma con un toast.

## 5. Modelo de datos

Migración `correo_comprobante_salida` sobre `OrdenSalida`:

| Campo Prisma | Columna | Tipo | Significado |
|---|---|---|---|
| `enviarCorreo` (existente) | `Enviar_Correo` | `Boolean @default(false)` | El último envío fue exitoso |
| `fechaEnvioCorreo` (nuevo) | `Fecha_Envio_Correo` | `DateTime?` | Fecha del último intento real (no omitido) |
| `errorEnvioCorreo` (nuevo) | `Error_Envio_Correo` | `String? @db.VarChar(500)` | Motivo del último fallo; `null` si fue exitoso |

Cómo se actualiza según el resultado:

- **Éxito:** `enviarCorreo = true`, `fechaEnvioCorreo = now`, `errorEnvioCorreo = null`.
- **Fallo:** `enviarCorreo = false`, `fechaEnvioCorreo = now`, `errorEnvioCorreo = error` (truncado a 500 caracteres).
- **Omitido** (sin clave): no se modifica el estado.

## 6. Auditoría

Cada intento, incluidos los omitidos, se registra con `AuditLogger.log`:

- `accion: "enviar_correo"`, `entidad: "OrdenSalida"`, `entidadId: orden.id`
- `usuarioId`, `centroId` y `bodegaId` de la orden
- `detalle: { para, reenvio, resultado: "enviado" | "fallido" | "omitido", resendId?, error? }`

`"enviar_correo"` se agrega al enum `accion` de `src/modules/auditoria/schemas/auditoria.schema.ts` y a las opciones de `auditoria-filtros.tsx`.

## 7. Configuración y deploy

| Variable | Requerida | Descripción |
|---|---|---|
| `RESEND_API_KEY` | No (sin ella no se envía) | API key de Resend del proyecto |
| `CORREO_REMITENTE` | No | Remitente; por defecto `Inventario CMV <inventario@gi.cmvalparaiso.cl>` |

- El subdominio `gi.cmvalparaiso.cl` está verificado en Resend; el remitente debe pertenecer a él.
- Se agregan a `.env.example`, al secret `ENV_PRODUCTION` y a `docs/guias/deploy-produccion.md`.
- El CI (`ci.yml`) corre sin clave, por lo que no envía correos.

## 8. Pruebas

Vitest, con el módulo `resend` mockeado. Ningún test envía correos reales.

- **`correo.ts`:**
  - Sin clave: devuelve `omitido` y no instancia Resend.
  - Error de Resend: `ok: false` con el mensaje.
  - Excepción de red: `ok: false`.
  - Éxito: devuelve `id`.
  - Los adjuntos se mapean a `{ filename, content }`.
- **`correo-comprobante.ts`:** asunto, `responderA`, nombre del adjunto y datos clave en el HTML y el texto.
- **Acciones:**
  - Crear con correo envía y actualiza el estado.
  - Crear con fallo de correo deja la salida registrada con la advertencia.
  - Crear sin correo no envía.
  - Reenviar exige permiso y alcance, valida el correo y actualiza `correoDestino` si cambió.
  - Cada intento se audita.
- **UI:** el badge muestra el estado correcto y el modal de reenvío envía el correo editado.
- **Prueba manual antes de fusionar:** salida de prueba en local con la clave real, enviada al correo del responsable, verificando que llega el PDF adjunto.

## 9. Fuera de alcance

- Aviso por correo del préstamo entre centros. Se conecta en un PR corto, después de fusionar el PR #14 (`notificarPrestamoEnviado` → `enviarCorreo`).
- Plantillas con diseño elaborado (React Email, etc.).
- Reintentos automáticos, cola de envíos y webhooks de entrega o rebote de Resend.
- Múltiples destinatarios o CC.
