# NV-24: Orígenes de órdenes de entrada

## Intención

Permitir que quien registra una entrada en `/entradas/nueva` identifique correctamente como origen de la orden a **Bodega Central** o **Fondo Global Menor**, además de las alternativas ya disponibles. El origen describe de dónde proviene la entrada y no representa la bodega física que recibe el stock.

## Objetivos

- Conservar las opciones actuales: `Drogueria`, `Desde Otros Centros` y `Otros Servicios`.
- Agregar las opciones `Bodega Central` y `Fondo Global Menor` al campo **Origen**.
- Guardar exactamente el valor seleccionado en `OrdenEntrada.origen`.
- Mostrar ese mismo valor en la columna **Origen** de `/entradas/registros`.
- Rechazar en el servidor valores que no pertenezcan al catálogo permitido.
- Cubrir con pruebas la presentación de las opciones, la validación, la persistencia y la visualización.

## Fuera de alcance

- Crear, modificar o asociar registros de `Bodega` o `Centro`.
- Cambiar la bodega receptora, el cálculo de stock o el alcance de permisos.
- Migrar o normalizar órdenes históricas.
- Cambiar los textos de las tres opciones existentes, incluido `Drogueria`.
- Agregar filtros por origen en la vista de registros.

## Restricciones

- No se modifica `prisma/schema.prisma` y no se crea una migración: `OrdenEntrada.origen` ya es un `String` de hasta 255 caracteres.
- El destino físico y el incremento de stock continúan determinados por `centroId` y `bodegaId`.
- `Drogueria` continúa seleccionada por defecto y vuelve a ser el valor inicial después de un registro exitoso.
- El catálogo debe tener una única definición reutilizable por la interfaz y por la validación del servidor.

## Enfoques considerados

### 1. Agregar dos elementos directamente al selector

Es el cambio mínimo de interfaz y la persistencia funcionaría porque el servidor ya acepta cualquier texto no vacío. Sin embargo, duplicaría implícitamente la regla en la interfaz y mantendría la posibilidad de enviar orígenes arbitrarios mediante una petición construida manualmente.

### 2. Catálogo compartido y validación estricta — seleccionado

Definir una constante inmutable con las cinco opciones, renderizar el selector desde ella y derivar la validación Zod del mismo catálogo. Mantiene sincronizados cliente y servidor, conserva el almacenamiento actual como texto y evita agregar una entidad o migración innecesaria.

### 3. Modelar el origen como una bodega o tabla maestra

Permitiría administración dinámica, pero contradice el issue: **Bodega Central** es el origen de la orden, no una bodega física receptora. También agregaría esquema, migración y mantenedores sin necesidad funcional.

## Diseño

Se incorporará un catálogo compartido en el módulo de orden de entrada con estos valores y este orden:

1. `Drogueria`
2. `Desde Otros Centros`
3. `Otros Servicios`
4. `Bodega Central`
5. `Fondo Global Menor`

`OrdenEntradaForm` recorrerá el catálogo para construir las opciones. El estado inicial y el reinicio exitoso conservarán `Drogueria`.

`crearOrdenEntradaSchema` validará `origen` contra los cinco literales. `crearOrdenEntrada` seguirá enviando `parsed.origen` directamente a Prisma, por lo que no requiere cambios de persistencia adicionales. `listarRegistrosEntrada` ya selecciona `orden.origen` y `RegistrosEntradaTabla` ya lo presenta sin transformación; se conservará ese recorrido y se fijará mediante pruebas.

## Criterios de aceptación

1. En `/entradas/nueva`, el selector **Origen** presenta las cinco opciones definidas, sin eliminar ni renombrar las actuales.
2. `Drogueria` continúa seleccionada por defecto.
3. Una entrada enviada con `Bodega Central` se valida y Prisma recibe `origen: "Bodega Central"`.
4. Una entrada enviada con `Fondo Global Menor` se valida y Prisma recibe `origen: "Fondo Global Menor"`.
5. Un valor ajeno al catálogo es rechazado antes de persistir la orden.
6. Los registros devueltos y la tabla muestran literalmente `Bodega Central` o `Fondo Global Menor` según lo almacenado.
7. Registrar cualquiera de estos orígenes no crea ni consulta una bodega adicional y no cambia la bodega receptora seleccionada.

## Decisiones dejadas al implementador

- El nombre exacto del archivo de prueba nuevo, siguiendo la convención de `src/__tests__`.
- Si los dos valores nuevos se ejercitan en casos independientes o parametrizados, siempre que ambos queden cubiertos.
