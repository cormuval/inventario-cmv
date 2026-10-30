# Diseño: Navegación por gestión, registros paginados y rendimiento

**Proyecto:** Inventario APS — Corporación Municipal de Valparaíso (CMV)
**Fecha:** 30 de octubre de 2026
**Estado:** Aprobado en reunión técnica del equipo (pendiente de implementación)
**Relacionado:** `docs/superpowers/specs/2026-10-29-migracion-appsheet-design.md` (PR #19)

---

## 1. Problema

Tras la migración de AppSheet (PR #19), producción tiene unas 14 mil órdenes de salida, 49 mil detalles de salida y 18 mil lotes de stock. Tres rutas cargan todo de una vez y el proceso de Node supera el límite de 500 MB de pm2 (`max_memory_restart`), que lo reinicia (21 reinicios el 30-10-2026):

| Ruta | Qué carga hoy (usuario administrador) |
|---|---|
| `/orden-salida` | Las 14.106 órdenes con sus 49.150 detalles, sin límite, con `include` de usuario, centro, bodega y producto. El formulario recibe además los 10.140 lotes con existencia de todas las bodegas. |
| `/orden-entrada` | Las órdenes de los últimos 90 días (1.255 órdenes, 8.006 detalles) en una sola tabla. |
| `/reporte` | Los 38.100 detalles de salida del año y todo el stock, agrupados en memoria en Node. |

Síntomas observados:

- Tiempos de carga de decenas de segundos.
- **503 de nginx**: `upstream prematurely closed connection` y `connect() failed (111: Connection refused)` hacia `127.0.0.1:3030` mientras pm2 reinicia la app.
- **"Application error: a client-side exception has occurred"**: la petición RSC (`?_rsc=`) se corta a mitad de respuesta (`NS_BINDING_ABORTED`) y el router de Next.js falla.

La causa es el consumo de datos (consultas sin límite y respuestas enormes), no la configuración de Next.js ni la base de datos. Subir el límite de memoria solo ocultaría el problema.

`/stock` carga bien, pero consolida y ordena en memoria y no tiene paginación.

## 2. Objetivo

1. Reorganizar el menú en **Gestión de entrada** y **Gestión de salida**, separando el registro de nuevas órdenes de los registros históricos.
2. Registros de entrada y salida **paginados en el servidor** y con filtros.
3. Nueva vista **Salidas por producto**.
4. Reporte de consumo mensual al estilo del "Reportes 2" de AppSheet, calculado en SQL, con período móvil y exportación a Excel.
5. Stock paginado en SQL, con filtros nuevos.
6. Formulario de nueva salida que solo carga los lotes de la bodega elegida.

## 3. Decisiones

| Tema | Decisión | Alternativa descartada |
|---|---|---|
| Estrategia de datos | Paginación (`skip`/`take` + `count`) y agregación (`GROUP BY`) en SQL al vuelo, con índices nuevos | Tabla resumen de consumo mensual (hay que mantenerla sincronizada; se puede agregar después sin cambiar las pantallas). Vistas SQL (Prisma las maneja mal en migraciones y no ganan rendimiento) |
| Submenú | Subopciones siempre expandidas e indentadas; el encabezado no navega | Desplegable por clic; padre que navega |
| Carga inicial de registros | Últimos 30 días, todas las bodegas del alcance, 50 por página | Mes en curso; nada hasta presionar Buscar |
| Detalle de una orden en registros | Resumen en la fila ("N productos · total unidades") + botón **Ver** que abre un modal y carga el detalle bajo demanda | Detalle dentro de la fila; fila expandible |
| Salidas por producto | Totales (por bodega y por tipo de salida) + listado paginado | Solo listado; solo totales por mes |
| Selector del reporte | Árbol lateral Todo → centros → bodegas, como AppSheet | Selects arriba |
| Agrupación del reporte | Una fila por producto × bodega | Producto consolidado por nodo |
| Exportación | Excel `.xlsx` con `exceljs`, mediante **server action** que devuelve base64 (mismo patrón que el comprobante PDF) | Ruta de API `GET`: `AGENTS.md` reserva las API Routes para integraciones externas; el archivo (~1 MB) no justifica streaming. CSV: separadores y acentos problemáticos en Excel |
| Stock | Paginación en SQL + filtros de línea, bajo stock mínimo y próximos a caducar (30 días) | Solo paginación |
| Permisos de "Nueva…" | Se oculta la subopción a quien no puede registrar | Mostrarla deshabilitada |
| Entrega | 4 fases desplegables por separado (sección 9) | Un solo PR |

## 4. Navegación y rutas

### 4.1 Menú lateral (`src/shared/components/layout/app-sidebar-shell.tsx`)

```
Resumen                     /
Stock                       /stock
Productos                   /productos
Gestión de entrada          (encabezado, no navega)
   Nueva entrada            /entradas/nueva          ← puedeOperarEntrada (R01, R03, R06, R07)
   Registros de entrada     /entradas/registros
Gestión de salida           (encabezado, no navega)
   Nueva salida             /salidas/nueva           ← puedeOperarSalida (R01, R03, R07)
   Registros de salida      /salidas/registros
   Salidas por producto     /salidas/por-producto
Reporte                     /reporte
Mantenedores                /mantenedores
Auditoría                   /auditoria               ← solo R01
```

- La lista plana `baseNavItems` pasa a ser una estructura con grupos: un ítem es un enlace o un grupo con `label`, `icon` y `items`.
- La función que arma el menú según el rol es pura y testeable (`construirMenu(rol)` en un archivo propio, por ejemplo `src/shared/components/layout/menu.ts`).
- Activo: un enlace está activo si `pathname` coincide con su `href` o empieza con `href + "/"`.
- Menú colapsado: los encabezados de grupo no se muestran; se muestran los íconos de las subopciones con su nombre como `title`/tooltip.

### 4.2 Rutas

| Ruta nueva | Contenido |
|---|---|
| `/entradas/nueva` | Formulario de nueva entrada (hoy en `/orden-entrada`) |
| `/entradas/registros` | Registros de entrada (sección 5) |
| `/salidas/nueva` | Formulario de nueva salida (sección 7.2) |
| `/salidas/registros` | Registros de salida (sección 5) |
| `/salidas/por-producto` | Salidas por producto (sección 6) |

- `/orden-entrada` y `/orden-salida` redirigen (`redirect` en el servidor) a `/…/nueva` si el rol puede registrar, o a `/…/registros` si no. Así no se rompen marcadores ni enlaces existentes.
- Quien entra a `/…/nueva` sin permiso ve una tarjeta "Sin permiso para registrar" con enlace a los registros.
- Después de registrar una orden, el formulario sigue en `/…/nueva`; el toast de éxito ofrece un enlace a los registros.

## 5. Registros de entrada y de salida

### 5.1 Filtros

Quedan en la URL (se pueden compartir y sobreviven a recargar):

| Parámetro | Valor por defecto | Regla |
|---|---|---|
| `desde`, `hasta` (`YYYY-MM-DD`) | hoy − 30 días, hoy | `desde ≤ hasta`; rango máximo 12 meses |
| `centroId` | según alcance | Solo si `puedeFiltrarCentro` |
| `bodegaId` | todas las del alcance | Debe pertenecer al alcance |
| `pagina` | 1 | Entero ≥ 1; si supera el total se lleva a la última |

Se reutiliza `src/shared/components/inventario/inventario-filtros.tsx` agregando campos opcionales de rango de fechas.

Los filtros se leen y validan con Zod en el servidor (`leerFiltrosRegistros(searchParams, hoy)`, función pura). Un valor inválido (fecha mal escrita, rango mayor a 12 meses, `desde > hasta`) vuelve al valor por defecto y la página muestra un aviso; nunca se cae.

### 5.2 Tablas

- **Salidas:** Fecha, Tipo, Destino, Bodega, Usuario, Productos ("N productos · total unidades"), Correo (estado), Acciones (Ver, PDF, Enviar comprobante si `puedeOperarSalida`).
- **Entradas:** Fecha, Origen, Bodega, Usuario, Productos ("N productos · total unidades"), Acciones (Ver).
- Orden: fecha descendente, luego id.
- Paginación: 50 por página, con "Mostrando 51–100 de 1.234" y controles anterior/siguiente/primera/última. Componente nuevo `src/shared/components/inventario/paginacion.tsx` basado en enlaces (`?pagina=`, conservando los demás parámetros), usado también por Stock, Reporte y Salidas por producto. La paginación de Auditoría no se reutiliza porque pagina en el cliente con estado y server action; no se modifica.

### 5.3 Consultas

- `prisma.ordenSalida.count({ where })` + `findMany({ where, select, orderBy, skip, take: 50 })`, con `where` = filtro de alcance (`crearFiltroMovimientosAlcance`) + rango de fechas + bodega.
- `select` trae solo las columnas mostradas (nombre y apellido del usuario, nombre de la bodega), no objetos completos.
- "N productos · total unidades": `prisma.ordenSalidaDetalle.groupBy({ by: ["ordenSalidaId"], where: { ordenSalidaId: { in: idsDeLaPagina } }, _count: true, _sum: { cantidad: true } })`. Igual para entradas.
- **Ver detalle:** server action `obtenerDetalleOrdenSalida(id)` / `obtenerDetalleOrdenEntrada(id)` que valida sesión y alcance y devuelve producto, lote, caducidad y cantidad. El modal la llama al abrirse.

## 6. Salidas por producto (`/salidas/por-producto`)

- **Buscador de producto:** combobox que busca en el servidor por descripción o código (máximo 20 sugerencias). El producto elegido queda en la URL (`?productoId=`).
- **Filtros:** los mismos de la sección 5.1 (rango de fechas, centro, bodega, página).
- **Totales:** total salido en el rango, desglosado por bodega y por tipo de salida (dos `groupBy` sobre `OrdenSalidaDetalle` con el filtro de la orden).
- **Listado:** paginado de a 50 líneas de detalle: Fecha, Bodega, Tipo, Destino, Lote, Cantidad, Usuario y enlace al PDF de la orden.
- **Sin producto elegido:** estado vacío "Busca un producto para ver sus salidas".

## 7. Stock y nueva salida

### 7.1 Stock (`/stock`)

- Se mantienen: centro, bodega, búsqueda (descripción o código) y orden por columna.
- **Filtros nuevos:**
  - `linea`: select con las líneas existentes (`SELECT DISTINCT Linea`).
  - `bajoMinimo=1`: productos cuyo total en la bodega es menor que su stock mínimo.
  - `porCaducar=1`: productos con algún lote con existencia que vence en 30 días o menos. Se excluye la fecha centinela `2099-12-31` ("sin fecha").
- La consolidación por producto × bodega pasa de memoria a SQL (`GROUP BY ID_Product, ID_Bodega` con `SUM(Cantidad_Disponible)`), conservando la regla actual de `filtrarExistenciasVisibles`: si el producto no tiene ningún lote con existencia en esa bodega, se muestra una sola fila con 0.
- El orden por columna se aplica en SQL antes de paginar; 50 por página con conteo total.
- La consulta agregada usa `$queryRaw` con `Prisma.sql` (parámetros, nunca interpolación de texto) y una función pura que convierte las filas crudas en `StockConsolidadoVista`.

### 7.2 Nueva salida (`/salidas/nueva`)

- El formulario deja de recibir todos los lotes del alcance.
- La página precarga en el servidor los lotes con existencia de la bodega inicial.
- Al cambiar la bodega de origen, el formulario llama a una server action `listarLotesDisponibles(bodegaId)` que valida alcance y devuelve los lotes con existencia de esa bodega, ordenados por producto y caducidad.
- El historial de salidas ya no se muestra en esta página (vive en `/salidas/registros`). Lo mismo para entradas.

## 8. Reporte (`/reporte`)

### 8.1 Vista

- **Árbol lateral:** "Todo" → centros → bodegas, solo los del alcance del usuario. El nodo elegido queda en la URL (`?centroId=` o `?bodegaId=`). En pantallas angostas se muestra como select.
- **Período:** `mesDesde` y `mesHasta` (`YYYY-MM`), máximo 12 meses. Por defecto, enero a diciembre del año en curso.
- **Columnas:** Centro, Bodega, Producto, Línea, Stock actual, Fecha última actualización, una columna por mes del período (por ejemplo nov-2025 … oct-2026) y Consumo del período.
- **Filas:** una por producto × bodega con stock o con consumo en el período (igual que hoy).
- **Búsqueda** por producto y **paginación** de a 50.
- **Exportar:** botón que descarga en `.xlsx` todas las filas del filtro (no solo la página).

### 8.2 Cálculo

- Consumo: un `GROUP BY ID_Product, ID_Bodega, mes` sobre `OrdenSalidaDetalle` unido a `OrdenSalida`, filtrando período, alcance y nodo, y excluyendo `Tipo_Salida = 'A otra bodega'` (regla actual).
- Stock actual y fecha de última actualización: `SUM(Cantidad_Disponible)` y `MAX(Fecha_Ultima_Actualizacion)` agrupados por producto y bodega.
- La unión y la paginación se hacen en SQL; una función pura (`armarFilasReporte(filasSql, columnasMes)`) arma las filas con un valor por mes (0 si no hubo consumo).
- `columnasDelPeriodo(mesDesde, mesHasta)` es pura y devuelve la lista de meses con su etiqueta.

### 8.3 Exportación

- `exportarReporteExcelAction(filtros)` en `src/modules/reporte/actions/`: valida sesión, alcance y filtros; ejecuta la misma consulta sin paginar; arma el libro con `exceljs` (columnas numéricas como número, encabezados en negrita) y devuelve `{ ok, base64, nombreArchivo }`.
- Nombre: `reporte-consumo-<nodo>-<mesDesde>_<mesHasta>.xlsx`.
- El botón usa `descargarArchivoBase64` (`src/shared/utils/descargar-base64.ts`), igual que el comprobante PDF.
- Se registra en auditoría (`AuditLogger`) como exportación del reporte.

## 9. Fases de entrega

Cada fase es un PR desplegable por separado.

| Fase | Contenido | Resultado |
|---|---|---|
| 1 | Menú con grupos, rutas nuevas y redirecciones, registros paginados de entrada y salida con modal de detalle, índices | Corrige los 503 de `/orden-salida` y `/orden-entrada` |
| 2 | Lotes por bodega en nueva salida; Stock paginado en SQL con filtros nuevos | Formulario de salida liviano; Stock escalable |
| 3 | Reporte con árbol, período, cálculo en SQL y exportación Excel | Corrige `/reporte` |
| 4 | Salidas por producto | Vista nueva |

## 10. Datos, errores y pruebas

### 10.1 Migración

Una migración de Prisma (fase 1) con índices:

- `OrdenSalida(Fecha)`
- `OrdenEntrada(Fecha)`
- `OrdenSalidaDetalle(ID_Producto, ID_OrdenSalida)`

### 10.2 Errores

- Filtros inválidos: valor por defecto + aviso, nunca error de página.
- Página fuera de rango: se lleva a la última.
- Server actions (detalle, lotes, exportación) devuelven `{ ok: false, message }` ante errores y la UI lo muestra con `toast`.
- Todas las consultas aplican `crearFiltroMovimientosAlcance` / `crearFiltroStockAlcance`: nadie ve bodegas fuera de su alcance, ni por URL ni por server action.

### 10.3 Pruebas (Vitest)

Unitarias, sobre funciones puras:

- `leerFiltrosRegistros`: valores por defecto, fechas inválidas, rango > 12 meses, `desde > hasta`, página.
- Cálculo de paginación (offset, total de páginas, página fuera de rango).
- `columnasDelPeriodo`: año calendario, período que cruza de año, límite de 12 meses.
- `armarFilasReporte`: meses sin consumo en 0, totales del período.
- Filtros de stock: bajo mínimo, por caducar (excluye 2099-12-31), regla de fila en 0.
- `construirMenu(rol)`: subopciones "Nueva…" según el rol, Auditoría solo R01.

De componente (Testing Library):

- Menú: grupos y subopciones visibles según el rol; enlace activo.
- Filtros de rango de fechas.

### 10.4 Criterio de aceptación de rendimiento

Medido en producción con un usuario administrador después de cada fase:

- Cada ruta afectada responde en menos de **1 s** de servidor.
- La respuesta (documento o RSC) pesa menos de **200 KB**.
- pm2 no registra reinicios de `inventario-cmv` por memoria al navegar por esas rutas.

## 11. Fuera de alcance

- Tabla resumen precalculada de consumo.
- Cambiar el límite de memoria de pm2.
- Exportación de registros de entrada/salida o de stock (solo el reporte exporta).
- Filtros adicionales en registros (tipo de salida, usuario, producto); se pueden agregar después sobre la misma estructura.
