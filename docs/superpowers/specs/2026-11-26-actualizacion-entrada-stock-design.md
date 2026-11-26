# Actualización de entrada y filtro de stock

## Intención

Evitar que una orden de entrada mezcle productos clínicos y de aseo en bodegas incompatibles, y permitir que todos los roles con acceso a `/stock` identifiquen rápidamente las existencias agotadas.

## Objetivos

- Clasificar formalmente cada bodega como `ASEO` o `CLINICA`.
- En `/entradas/nueva`, ofrecer únicamente productos de línea `ASEO` cuando la bodega receptora sea de tipo `ASEO`.
- En `/entradas/nueva`, excluir los productos de línea `ASEO` cuando la bodega receptora sea de tipo `CLINICA`.
- Validar la compatibilidad entre bodega y producto en el servidor antes de crear la orden o modificar el stock.
- Incorporar el checkbox **Sin Stock** en `/stock` para todos los roles con acceso a la vista.
- Permitir combinar **Sin Stock** con los demás filtros y conservarlo al ordenar o paginar.

## Fuera de alcance

- Reclasificar las líneas de productos: `Producto.linea` continúa siendo texto y la línea de aseo se identifica mediante el valor exacto `ASEO`.
- Corregir automáticamente stock histórico que ya esté almacenado en una bodega incompatible.
- Impedir consultas o reportes históricos de combinaciones incompatibles existentes.
- Aplicar en esta entrega la compatibilidad de líneas a órdenes de salida, traspasos o recepción de préstamos.
- Crear existencias en cero para productos que nunca han tenido un registro de stock en una bodega.

## Restricciones

- Todo cambio en `prisma/schema.prisma` debe incluir una migración Prisma versionada; no se utilizará `db:push`.
- Los valores persistidos para el tipo de bodega serán exactamente `ASEO` y `CLINICA`. La interfaz mostrará **Aseo** y **Clínica**.
- La comparación de la línea de producto será exacta contra `ASEO` para no clasificar accidentalmente otras líneas.
- El filtro visual del cliente no será la única protección: una petición construida manualmente deberá ser rechazada por la Server Action.
- Los permisos y el alcance por centro y bodega existentes se conservarán.
- Los filtros de Stock seguirán ejecutándose en SQL antes de contar y paginar.

## Enfoques considerados

### 1. Tipo formal de bodega `ASEO` / `CLINICA` — seleccionado

Agregar un tipo persistido a `Bodega` permite que la regla dependa de un dato explícito y administrable. La misma clasificación puede utilizarse en la interfaz y en la validación de servidor, sin quedar ligada al texto visible del nombre.

### 2. Inferir el tipo desde el nombre de la bodega

Evita una migración, pero hace que un cambio de nombre pueda habilitar productos incorrectos. También introduce comparaciones de texto difíciles de mantener en distintos flujos.

### 3. Mantener una lista de IDs de bodegas de aseo

Es explícito, pero obliga a modificar configuración o código cada vez que se crea una bodega y no aprovecha el mantenedor existente.

## Diseño

### Clasificación de bodegas

Se agregará a Prisma un enum con los valores `ASEO` y `CLINICA`, y un campo obligatorio `tipo` en `Bodega`. El valor por defecto será `CLINICA`, de modo que las nuevas bodegas no se conviertan implícitamente en bodegas de aseo.

La migración clasificará las bodegas existentes de forma determinista:

- Nombre que contenga `ASEO`, sin distinguir mayúsculas y minúsculas: `ASEO`.
- Cualquier otro nombre: `CLINICA`.

El seed marcará explícitamente `Bodega Aseo` como `ASEO` y `Bodega Clinica` como `CLINICA`. El mantenedor de bodegas permitirá seleccionar **Aseo** o **Clínica** al crear o editar una bodega, y mostrará su tipo en el listado.

### Catálogo de productos en Nueva entrada

La página continuará cargando los productos activos permitidos por el alcance actual. `OrdenEntradaForm` derivará el catálogo visible a partir de la bodega seleccionada:

- Bodega `ASEO`: solo productos cuya línea sea exactamente `ASEO`.
- Bodega `CLINICA`: solo productos cuya línea sea distinta de `ASEO`.

Al cambiar de centro o bodega se eliminarán del detalle las filas cuyos productos ya no sean compatibles. El selector no conservará silenciosamente productos de la selección anterior.

La regla se centralizará en una utilidad compartida por el módulo de entrada. La interfaz la usará para filtrar opciones y `crearOrdenEntrada` la aplicará de nuevo después de validar el alcance de la bodega y cargar desde la base tanto el tipo de bodega como las líneas de los productos. Si algún producto no es compatible, no se abrirá la transacción que crea la orden y actualiza el stock.

La misma validación se aplicará al editar un detalle existente mediante `actualizarDetalleEntrada`, usando el tipo de la bodega receptora de la orden original.

### Filtro Sin Stock

`/stock` leerá el parámetro `sinStock=1`. El checkbox **Sin Stock** se mostrará en el mismo bloque de los checkbox **Bajo stock mínimo** y **Por caducar (30 días)** para todos los roles con acceso a la vista. La consulta conservará el alcance de centros y bodegas correspondiente al usuario autenticado.

Cuando esté activo, la consulta devolverá únicamente combinaciones producto–bodega que:

- tengan al menos un registro en `Stock`; y
- tengan suma consolidada disponible igual a cero.

El filtro incluirá combinaciones con uno o varios lotes agotados. No inventará filas para productos que nunca hayan tenido stock en esa bodega. El conteo y la consulta paginada utilizarán exactamente la misma condición.

**Sin Stock** será excluyente con **Bajo stock mínimo**, porque este último exige cantidad mayor que cero. Si ambos parámetros llegan activos, la interfaz y el servidor darán prioridad a **Sin Stock** y normalizarán **Bajo stock mínimo** a `false`. Podrá combinarse con línea, búsqueda, centro, bodega y **Por caducar**, aunque esta última combinación normalmente no producirá resultados porque no existen lotes disponibles próximos a caducar.

## Manejo de errores

- Si la bodega no existe, está inactiva o está fuera del alcance, se conservará el error de autorización vigente.
- Si un producto no existe o está inactivo, se conservará el rechazo vigente.
- Si la bodega es `ASEO` y algún producto no pertenece a la línea `ASEO`, se responderá que el producto no corresponde a una bodega de aseo.
- Si la bodega es `CLINICA` y algún producto pertenece a `ASEO`, se responderá que los productos de aseo solo pueden ingresarse en bodegas de aseo.
- Ningún rechazo de compatibilidad creará la orden, sus detalles ni movimientos de stock.

## Criterios de aceptación

1. Cada bodega tiene un tipo persistido obligatorio `ASEO` o `CLINICA`.
2. La migración clasifica como `ASEO` las bodegas existentes cuyo nombre contiene “aseo” y como `CLINICA` las demás.
3. El mantenedor permite crear y editar el tipo de una bodega y lo presenta en su listado.
4. Al seleccionar una bodega `ASEO` en `/entradas/nueva`, cada selector de producto contiene exclusivamente productos activos de línea `ASEO`.
5. Al seleccionar una bodega `CLINICA`, los selectores contienen productos activos de cualquier línea excepto `ASEO`.
6. Cambiar a una bodega de tipo distinto elimina del detalle las selecciones incompatibles.
7. `crearOrdenEntrada` rechaza una combinación incompatible antes de abrir la transacción o modificar stock.
8. `actualizarDetalleEntrada` rechaza un producto incompatible con la bodega de la orden original.
9. Una combinación compatible conserva el comportamiento actual de creación, auditoría y actualización de stock.
10. Todos los roles con acceso a `/stock` ven el checkbox **Sin Stock** junto a los checkbox existentes.
11. El filtro respeta el alcance de centros y bodegas de cada rol.
12. **Sin Stock** devuelve grupos existentes cuya cantidad consolidada es exactamente cero, incluidos los que tienen varios lotes agotados.
13. El filtro se combina con búsqueda, línea y alcance de inventario, y se conserva al paginar u ordenar.
14. Si **Sin Stock** y **Bajo stock mínimo** llegan activos, se aplica **Sin Stock** y **Bajo stock mínimo** queda desactivado.
15. Las consultas de listado y conteo aplican las mismas condiciones, por lo que la paginación informa un total consistente.

## Decisiones dejadas al implementador

- El nombre exacto del enum Prisma y de la utilidad de compatibilidad, respetando las convenciones existentes.
- La disposición exacta de la nueva columna **Tipo** en el listado del mantenedor de bodegas.
- El texto breve del estado vacío cuando la bodega seleccionada no tenga productos compatibles.
