# Especificación Técnica y de Negocio: Descarga de Comprobante PDF en Historial y Registro de Salidas

**Proyecto:** Sistema de Inventario APS — Corporación Municipal de Valparaíso (CMV)  
**Documento:** Especificación Funcional, Técnica y de Respaldo Físico: Generación y Descarga de Comprobante PDF de Orden de Salida  
**Versión:** 1.1 (Actualizado con Paginación Inteligente y Control de Alcance Canónico)  
**Fecha:** 28 de Octubre de 2026  
**Clasificación:** Operación de Inventario, Trazabilidad Sanitaria y Respaldo Documental (Prioridad Alta)  

---

## 1. Diagnóstico del Problema y Justificación Operacional

### Problemática Detectada:
> *"Cada vez que se registre una salida debe existir un apartado dentro del registro en el historial de salidas para descargar un PDF con los detalles de la salida, de modo que el correo electrónico no sea imprescindible en caso de fallo de tipeo o directamente que no haya correo registrado."*

### Análisis de la Operación en Terreno:
1. **Fragilidad de la Notificación por Correo Único:**
   - La entrega de insumos clínicos, fármacos o materiales en la red de Centros de Salud Familiar (CESFAM) y postas de Valparaíso a menudo ocurre en puntos de despacho donde el receptor no cuenta con un correo corporativo activo, se ingresa con faltas ortográficas o no se dispone de conectividad inmediata para revisar la bandeja de entrada.
   - Si el único respaldo era el despacho por email, cualquier error de tipeo dejaba al establecimiento receptor y al bodeguero sin constancia física de los medicamentos o insumos entregados.
2. **Necesidad de Comprobante Impreso con Respaldo de Firma:**
   - Para efectos de auditoría sanitaria, control de fármacos sujetos a control y traspasos inter-bodegas, se requiere un documento formal con firmas físicas del emisor y receptor que respalde la entrega material en el mesón de farmacia o bodega.
3. **Ausencia de Descarga en el Historial:**
   - La tabla actual de "Salidas registradas" en `/orden-salida` lista la fecha, tipo, destino, bodega, usuario y resumen textual de detalles, pero no cuenta con un botón para regenerar o reimprimir el comprobante formal en caso de extravío de la guía original.

---

## 2. Diagrama de Flujo y Casos de Uso

```
                       [ REGISTRO DE NUEVA SALIDA ]
                                     │
                 1. Usuario completa OrdenSalidaForm y guarda
                                     │
                 2. Server Action 'crearOrdenSalida' descuenta stock
                                     │
                    ¿Guardado exitoso en base de datos?
                    ├── SÍ ──► ✔ Diálogo / Toast con botón directo:
                    │          "Descargar Comprobante PDF"
                    │          (Permite respaldo inmediato en mesón)
                    │
                    └── NO ──► ⛔ Notificación de error habitual

                                     ▼

                       [ CONSULTA EN HISTORIAL DE SALIDAS ]
                                     │
                 3. Usuario ingresa a '/orden-salida'
                 4. Tabla "Salidas registradas" muestra columna "Acciones"
                                     │
                 5. Clic en botón "Descargar PDF" (icono FileDown)
                                     │
                 6. Llamada a Server Action 'descargarComprobanteSalidaAction(id)'
                                     │
                    ¿Usuario autenticado y dentro de su alcance?
                    ├── NO ──► ⛔ Retorna { ok: false, error: "No autorizado..." }
                    │          Muestra toast de error al usuario
                    │
                    └── SÍ ──► ✔ Generación server-side nativa (pdfkit)
                               Retorna { ok: true, base64, filename }
                               Cliente genera Blob en memoria y descarga archivo
```

---

## 3. Reglas de Negocio y Requerimientos Funcionales

### Regla R-01: Descarga Inmediata al Registrar Salida
- Al concluir exitosamente el despacho en `OrdenSalidaForm`, la interfaz ofrece de inmediato al usuario la opción de descargar el comprobante PDF recién generado sin necesidad de buscarlo manualmente en la tabla histórica.
- Se implementa mediante un modal de confirmación con el botón destacado **"Descargar Comprobante PDF"** y una acción complementaria en el toast de éxito.

### Regla R-02: Disponibilidad Permanente en el Historial ("Salidas Registradas")
- La tabla de salidas registradas en `/orden-salida` incorpora una columna **"Acciones"** al final de cada fila.
- Cada orden cuenta con un botón accesible con icono de descarga (`FileDown`), estado visual de carga (spinner mientras se genera el PDF) y etiqueta accesible.
- Al hacer clic, invoca la Server Action y descarga el archivo `.pdf` conservando la navegación intacta.

### Regla R-03: Control de Acceso y Arquitectura Server Action (Seguridad)
- Siguiendo la convención arquitectónica del proyecto (`AGENTS.md`: *API Routes solo para integraciones externas; lógica interna mediante Server Actions*), la generación y descarga se implementa como Server Action:
  `descargarComprobanteSalidaAction(ordenId: string)` en `src/modules/orden-salida/actions/orden-salida.action.ts`.
- Reutiliza la función canónica de autorización por alcance del sistema: `validarCentroBodegaEnAlcance(orden.centroId, orden.bodegaId)` de `@/shared/lib/inventario-alcance`, que internamente valida la sesión con `requireSessionUser()`.
- Aplica la matriz de alcance del sistema:
  - **Rol R01 (Administrador Central):** Puede descargar el comprobante de cualquier salida comunal activa.
  - **Rol R02 (Director / Encargado de Centro):** Puede descargar salidas pertenecientes a su `centroId`.
  - **Encargados y Operadores de Bodega (R03, R06, R07):** Solo pueden descargar comprobantes de salidas de bodegas activas asignadas en su alcance.
- Si la orden no existe o el usuario carece de alcance, la acción aborta y el error es capturado devolviendo `{ ok: false, error: error.message }`, notificando al usuario mediante toast sin exponer información interna.

### Regla R-04: Estructura, Contenido y Comportamiento Multipágina del Documento PDF
El PDF se genera en tamaño Carta (Letter) vertical con tipografía legible, márgenes de 40 pt y diseño institucional formal:
1. **Encabezado Institucional (Página 1):**
   - Membrete: *"CORPORACIÓN MUNICIPAL DE VALPARAÍSO — ÁREA SALUD"*.
   - Subtítulo: *"Sistema de Control y Trazabilidad de Inventario APS"*.
   - Recuadro de identificación: Título *"COMPROBANTE DE SALIDA DE INVENTARIO"*, Folio/ID de Orden y Fecha/Hora exacta de emisión.
2. **Bloque Informativo de Origen y Destino:**
   - Centro de Salud de Origen y Bodega Emisora.
   - Funcionario emisor (Nombre, Apellidos y Correo Institucional).
   - Tipo de Salida (Consumo interno, Merma/Caducidad, A otra bodega, A otros centros / Préstamo).
   - Destino del insumo (Establecimiento/Bodega de destino o justificación del retiro).
   - Código de verificación (si la salida es un traspaso/préstamo con código).
3. **Tabla de Insumos y Comportamiento Multipágina:**
   - Columnas: Item N°, Código/Descripción del Producto, Número de Lote, Fecha de Caducidad y Cantidad Despachada.
   - **Paginación Inteligente:** Antes de renderizar cada fila (altura 18 pt), se comprueba si excede el límite inferior de la página (`currentY + rowHeight > LIMITE_INFERIOR - ESPACIO_PIE`). Si no cabe, se invoca `doc.addPage()` y se repite automáticamente el encabezado de la tabla (`dibujarEncabezadoTabla`) al inicio de la nueva página.
   - **Total General:** Fila de totales con suma de unidades despachadas; si no cabe en la página actual, salta de página y repite el encabezado antes de imprimir la fila.
4. **Recuadros de Respaldo y Firma Física (Indivisibles en Última Página):**
   - Bloque de firmas de 80 pt de altura con recuadros para "ENTREGADO POR" y "RECIBIDO CONFORME".
   - Si el bloque de firmas no cabe íntegro en la página actual, se genera una nueva página para garantizar que ambas firmas permanezcan juntas en la última hoja y nunca queden partidas ni desfasadas.
5. **Pie de Página Legal y Paginación Transversal:**
   - Configurado con `bufferPages: true` en `PDFDocument`. Antes de `doc.end()`, se recorren todas las páginas bufferizadas (`doc.bufferedPageRange()`) con `doc.switchToPage(i)` para imprimir en cada una el texto legal y el indicador `"Página X de Y"` (con `margins.bottom = 0` temporal para prevenir saltos accidentales de página).

### Regla R-05: Arquitectura Ultraliviana y de Bajo Costo
- Generación de PDF en el backend utilizando una biblioteca nativa y ligera (`pdfkit`), evitando navegadores headless (como Puppeteer o Playwright) que consumen cientos de megabytes de RAM y ralentizan contenedores Docker.
- La Server Action compila el documento en un `Buffer` en memoria, lo convierte a `base64` y lo transmite al cliente dentro de la respuesta estructurada `{ ok: true, base64: string, filename: string }`.
- En el cliente, una utilidad ligera (`descargarArchivoBase64`) convierte el base64 a un objeto `Blob` y dispara la descarga en el navegador de forma inmediata y sin límite de tamaño de URL.

---

## 4. Diseño Técnico y Componentes Afectados

### 4.1 Server Action: `descargarComprobanteSalidaAction` en `src/modules/orden-salida/actions/orden-salida.action.ts`
- Declarada con `'use server'`.
- Consulta la orden con `prisma.ordenSalida.findUnique` incluyendo `usuario`, `bodega`, `bodegaDestino`, `centro` y `detalles.producto`.
- Valida el alcance ejecutando `await validarCentroBodegaEnAlcance(orden.centroId, orden.bodegaId)`.
- Invoca la función utilitaria `generarComprobanteSalidaPDF(orden)`.
- Retorna `{ ok: true, base64: buffer.toString("base64"), filename: "comprobante-salida-${id}.pdf" }`.

### 4.2 Módulo de Utilidad PDF: `src/modules/orden-salida/utils/pdf-comprobante.ts`
- Encapsula la lógica de maquetación vectorial del documento con `pdfkit`:
  - Instanciado con `bufferPages: true`, tamaño `LETTER` y márgenes de 40 pt.
  - Constantes de límites dinámicos: `LIMITE_INFERIOR = doc.page.height - doc.page.margins.bottom`, `ESPACIO_PIE = 35`, `ALTURA_FIRMAS = 80`.
  - Función de dibujo repetible `dibujarEncabezadoTabla(y)` invocada al inicio de cada página.
  - Verificación de desborde por fila y por bloque de firmas.
  - Recorrido final de `doc.bufferedPageRange()` para renderizar pie de página institucional y número de página `Página X de Y`.
  - Retorna una `Promise<Buffer>`.

### 4.3 Componente Cliente de Descarga: `src/modules/orden-salida/components/boton-descargar-comprobante.tsx`
- Componente de cliente reutilizable para disparar la Server Action:
  - Muestra un botón con icono `FileDown` de Lucide y estado de carga mientras se procesa la acción.
  - Al completar, convierte el base64 a `Blob` y ejecuta la descarga en el navegador.
  - Si la acción falla, despliega un `toast.error(error)`.
- Se incorpora en la tabla de `src/app/orden-salida/page.tsx` en una columna nueva **"Acciones"**.

### 4.4 Actualización del Formulario: `src/modules/orden-salida/components/orden-salida-form.tsx`
- Tras recibir respuesta exitosa de `crearOrdenSalida(formData)`:
  - El resultado retorna el `id` de la orden creada.
  - Se abre un diálogo modal de confirmación con el botón principal: **"Descargar Comprobante PDF"** (utilizando el mismo flujo cliente/Server Action) y botón secundario **"Continuar / Nueva salida"**.

---

## 5. Estrategia de Pruebas Automatizadas

1. **Pruebas de Seguridad y Alcance (`src/__tests__/orden-salida-pdf.test.ts`):**
   - Retorno de error controlado si la orden no existe.
   - Retorno de rechazo cuando `validarCentroBodegaEnAlcance` lanza error por falta de permisos.
   - Retorno de `{ ok: true, base64: string, filename: string }` cuando la orden existe y está dentro del alcance del usuario.
2. **Pruebas de Generación del Documento y Paginación (`src/__tests__/pdf-comprobante.test.ts`):**
   - Verificación de cabecera mágica `%PDF-`.
   - Verificación de generación de exactamente 1 página cuando hay 5 detalles.
   - Verificación de paginación controlada con 80 detalles (número de páginas razonable `<= 4`).
3. **Pruebas de Interfaz (`src/__tests__/boton-descargar-comprobante.test.tsx`):**
   - Verificación de la columna "Acciones" y botón de descarga en la tabla de salidas.
   - Verificación del diálogo de descarga tras guardar la orden.

---

## 6. Criterios de Aceptación (Definición de Terminado)

- [x] **CA-1: Descarga Directa en Historial:** Cada registro en la tabla de salidas cuenta con un botón accesible para descargar su comprobante PDF.
- [x] **CA-2: Descarga Inmediata al Crear:** Al confirmar una nueva salida, la interfaz despliega una opción directa para descargar el comprobante sin buscarlo en la tabla.
- [x] **CA-3: Plantilla Formal Institucional y Paginación:** El PDF contiene membrete CMV, folio, datos de origen y destino, tabla detallada de insumos con repetición de encabezado en saltos de página, firmas indivisibles en última hoja y numeración `Página X de Y`.
- [x] **CA-4: Seguridad y Alcance en Server Action:** La acción `descargarComprobanteSalidaAction` utiliza `validarCentroBodegaEnAlcance` garantizando el principio de mínimo privilegio.
- [x] **CA-5: Cero Dependencias Pesadas ni API Routes Internas:** Se genera en Node.js nativo vía Server Action sin navegadores headless ni rutas API externas.
- [x] **CA-6: Pruebas y Tipado Estricto:** Pasan todos los tests en Vitest (112 tests), cero errores de TypeScript y build exitoso de Next.js.
