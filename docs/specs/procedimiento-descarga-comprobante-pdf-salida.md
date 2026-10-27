# Especificación Técnica y de Negocio: Descarga de Comprobante PDF en Historial y Registro de Salidas

**Proyecto:** Sistema de Inventario APS — Corporación Municipal de Valparaíso (CMV)  
**Documento:** Especificación Funcional, Técnica y de Respaldo Físico: Generación y Descarga de Comprobante PDF de Orden de Salida  
**Versión:** 1.0 (Borrador para Aprobación)  
**Fecha:** 23 de Octubre de 2026  
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
- Protegida estrictamente por sesión de usuario con `requireSessionUser()`.
- Aplica la matriz de alcance del sistema:
  - **Rol R01 (Administrador Central):** Puede descargar el comprobante de cualquier salida comunal.
  - **Rol R02 (Director / Encargado de Centro):** Puede descargar salidas pertenecientes a su `centroId`.
  - **Encargados y Operadores de Bodega:** Solo pueden descargar comprobantes de salidas pertenecientes a las bodegas que tienen asignadas (`bodegaId` principal o en `Encargados_Bodegas`).
- Peticiones no autorizadas o inexistentes retornan `{ ok: false, error: "No autorizado o no encontrada" }` sin exponer detalles sensibles.

### Regla R-04: Estructura y Contenido Formal del Documento PDF
El PDF se genera en tamaño Carta (Letter) / A4 vertical con tipografía legible y diseño institucional formal:
1. **Encabezado Institucional:**
   - Membrete: *"CORPORACIÓN MUNICIPAL DE VALPARAÍSO — ÁREA SALUD"*.
   - Subtítulo: *"Sistema de Control y Trazabilidad de Inventario APS"*.
   - Recuadro de identificación: Título *"COMPROBANTE DE SALIDA DE INVENTARIO"*, Folio/ID de Orden y Fecha/Hora exacta de emisión.
2. **Bloque Informativo de Origen y Destino:**
   - Centro de Salud de Origen y Bodega Emisora.
   - Funcionario emisor (Nombre, Apellidos y Correo Institucional).
   - Tipo de Salida (Consumo interno, Merma/Caducidad, A otra bodega, A otros centros / Préstamo).
   - Destino del insumo (Establecimiento/Bodega de destino o justificación del retiro).
   - Código de verificación (si la salida es un traspaso/préstamo con código).
3. **Tabla de Insumos y Fármacos Despachados:**
   - Columnas: Item N°, Código/Descripción del Producto, Número de Lote, Fecha de Caducidad, Cantidad Despachada y Unidad de Medida.
   - Fila de totales con la sumatoria de unidades y conteo de ítems únicos.
4. **Recuadros de Respaldo y Firma Física:**
   - **Recuadro Despachador (Origen):** Línea de firma, timbre, nombre y RUT del encargado que entrega.
   - **Recuadro Receptor (Físico):** Línea de firma, timbre, nombre, RUT y fecha/hora de la persona que retira el insumo.
5. **Pie de Página Legal:**
   - Texto informativo de validez interna de movimiento de existencias y fecha de generación del archivo.

### Regla R-05: Arquitectura Ultraliviana y de Bajo Costo
- Generación de PDF en el backend utilizando una biblioteca nativa y ligera (`pdfkit`), evitando navegadores headless (como Puppeteer o Playwright) que consumen cientos de megabytes de RAM y ralentizan contenedores Docker.
- La Server Action compila el documento en un `Buffer` en memoria, lo convierte a `base64` y lo transmite al cliente dentro de la respuesta estructurada `{ ok: true, base64: string, filename: string }`.
- En el cliente, una utilidad ligera (`descargarArchivoBase64`) convierte el base64 a un objeto `Blob` y dispara la descarga en el navegador de forma inmediata y sin límite de tamaño de URL.

---

## 4. Diseño Técnico y Componentes Afectados

### 4.1 Server Action: `descargarComprobanteSalidaAction` en `src/modules/orden-salida/actions/orden-salida.action.ts`
- Declarada con `'use server'`.
- Obtiene la sesión con `requireSessionUser()`.
- Consulta la orden con `prisma.ordenSalida.findUnique` incluyendo `usuario`, `bodega`, `bodegaDestino`, `centro` y `detalles.producto`.
- Valida los permisos de alcance del usuario solicitante según su rol (`R01`, `R02` o encargado de la bodega de origen).
- Invoca la función utilitaria `generarComprobanteSalidaPDF(orden)`.
- Retorna `{ ok: true, base64: buffer.toString("base64"), filename: "comprobante-salida-${id}.pdf" }`.

### 4.2 Módulo de Utilidad PDF: `src/modules/orden-salida/utils/pdf-comprobante.ts`
- Encapsula la lógica de maquetación vectorial del documento con `pdfkit`:
  - Definición de márgenes, fuentes estándar (`Helvetica`, `Helvetica-Bold`), paleta de grises institucional y cálculo dinámico de coordenadas.
  - Función de dibujo de tablas con soporte para múltiples filas sin desborde.
  - Bloque de recuadros de firma con medidas estandarizadas para timbre de farmacia.
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
   - Retorno de `{ ok: false, error: "No autenticado" }` si no hay sesión.
   - Retorno de `{ ok: false, error: "No autorizado" }` para operadores intentando descargar órdenes de bodegas ajenas.
   - Retorno de `{ ok: false, error: "Orden no encontrada" }` para identificadores inexistentes.
   - Retorno de `{ ok: true, base64: string, filename: string }` con contenido de PDF válido para administradores R01 y encargados legítimos.
2. **Pruebas de Generación del Documento:**
   - Formateo correcto de folios, fechas, nombres de productos, lotes y fechas de vencimiento.
   - Resistencia ante órdenes con gran volumen de ítems (paginación limpia).
3. **Pruebas de Interfaz:**
   - Verificación de la columna "Acciones" y botón de descarga en la tabla de salidas.
   - Verificación del diálogo de descarga tras guardar la orden.

---

## 6. Criterios de Aceptación (Definición de Terminado)

- [x] **CA-1: Descarga Directa en Historial:** Cada registro en la tabla de salidas cuenta con un botón accesible para descargar su comprobante PDF.
- [x] **CA-2: Descarga Inmediata al Crear:** Al confirmar una nueva salida, la interfaz despliega una opción directa para descargar el comprobante sin buscarlo en la tabla.
- [x] **CA-3: Plantilla Formal Institucional:** El PDF contiene membrete CMV, folio, datos de origen y destino, tabla detallada de insumos con lote y caducidad, y recuadros de firma física.
- [x] **CA-4: Seguridad y Alcance en Server Action:** La acción `descargarComprobanteSalidaAction` valida que el usuario tenga privilegios sobre la bodega de la salida antes de generar el documento.
- [x] **CA-5: Cero Dependencias Pesadas ni API Routes Internas:** Se genera en Node.js nativo vía Server Action sin navegadores headless ni rutas API externas.
- [x] **CA-6: Pruebas y Tipado Estricto:** Pasan todos los tests en Vitest, cero errores de TypeScript y build exitoso de Next.js.
