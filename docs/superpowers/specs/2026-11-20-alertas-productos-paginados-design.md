# Diseño: Alertas globales y catálogo de productos paginado

**Proyecto:** Inventario APS — Corporación Municipal de Valparaíso (CMV)  
**Fecha:** 20 de noviembre de 2026  
**Estado:** Aprobado por el usuario  
**Módulos:** Resumen y Productos

## 1. Contexto

El perfil Administrador necesita una visión operativa global de las alertas de inventario, considerando todas las bodegas. Asimismo, el catálogo de productos debe soportar búsquedas sobre el conjunto completo de registros y navegación paginada, manteniendo la creación de productos como una operación exclusiva del Administrador.

## 2. Objetivos

1. Mostrar al Administrador las alertas de caducidad y stock mínimo de todas las bodegas.
2. Restringir la creación de productos al perfil Administrador.
3. Permitir filtrar productos por ID, línea, estado y descripción.
4. Paginar la grilla de productos en el servidor, con un máximo de 100 filas por página.
5. Garantizar que la búsqueda por descripción considere todo el catálogo antes de aplicar la paginación.

## 3. Fuera de alcance

- Incorporar alertas por stock en cero.
- Modificar las reglas vigentes de caducidad.
- Modificar la definición o el cálculo vigente de stock mínimo utilizado por el módulo Stock.
- Crear, editar o eliminar líneas de productos.
- Editar, activar, desactivar o eliminar productos desde la grilla.
- Exportar el catálogo de productos.

## 4. Enfoques considerados

### 4.1 Filtros y paginación en el navegador

Este enfoque cargaría todos los productos y luego aplicaría los filtros y la división en páginas localmente. Su implementación es directa, pero el volumen transferido y el trabajo del navegador crecerían junto con el catálogo.

### 4.2 Filtros y paginación en el servidor — seleccionado

El servidor aplica todos los filtros al catálogo completo, cuenta los resultados y devuelve únicamente las 100 filas de la página solicitada. Este enfoque fue seleccionado porque permite buscar en cualquiera de las páginas sin cargar todos los productos en el navegador y mantiene un rendimiento estable al crecer los datos.

## 5. Resumen: alertas operativas globales

### 5.1 Alcance por perfil

- Cuando el usuario autenticado tenga perfil Administrador, las alertas se consultarán considerando todas las bodegas disponibles en el sistema.
- La consulta global no se limitará al centro o bodega asociados al usuario Administrador.
- Para los demás perfiles se conservará el alcance de visualización definido actualmente por el sistema.

### 5.2 Alertas incluidas

El Resumen mantendrá y mostrará:

- Alertas de caducidad según las reglas vigentes.
- Alertas de stock mínimo según la misma definición, valores y reglas utilizadas actualmente en el módulo Stock.

No se agregarán alertas por stock en cero como parte de este requerimiento.

### 5.3 Información visible

Cada alerta deberá permitir identificar, como mínimo:

- Producto.
- Centro.
- Bodega.
- Stock disponible.
- Información de caducidad aplicable.
- Estado o tipo de alerta.

Si un registro cumple simultáneamente condiciones de caducidad y stock mínimo, la presentación respetará la prioridad visual vigente de las alertas. Este requerimiento no redefine esa prioridad.

### 5.4 Estado vacío

Cuando no existan alertas dentro del alcance consultado, la pantalla mostrará un mensaje explícito indicando que no hay alertas operativas.

## 6. Productos: permisos de creación

- La consulta del catálogo continuará disponible para los perfiles que tengan acceso al módulo Productos.
- El control para crear productos será visible únicamente para el Administrador.
- La operación de creación también validará el perfil en el servidor.
- Intentar ejecutar la operación sin perfil Administrador devolverá un error de autorización y no generará cambios.
- La validación del servidor será obligatoria aunque el control de la interfaz esté oculto.

## 7. Productos: filtros

### 7.1 Campos

| Filtro | Comportamiento |
| --- | --- |
| ID | Coincidencia exacta con el identificador numérico del producto. |
| Línea | Selección de una línea específica o todas las líneas. |
| Estado | Activo, inactivo o todos. |
| Descripción | Coincidencia parcial sobre la descripción, sin distinguir mayúsculas y minúsculas. |

### 7.2 Reglas generales

- Los filtros podrán combinarse y se aplicarán con lógica `AND`.
- Los filtros se representarán en la URL para conservarse al recargar y permitir compartir la vista.
- Aplicar, modificar o limpiar cualquier filtro llevará la navegación a la página 1.
- Los valores vacíos equivaldrán a no aplicar el filtro correspondiente.
- Un ID no numérico o menor que 1 se considerará inválido; la pantalla no deberá fallar y mostrará un aviso de filtro inválido.
- Los valores de línea o estado no reconocidos se ignorarán de forma segura y generarán un aviso.

### 7.3 Búsqueda global por descripción

La búsqueda por descripción se ejecutará sobre todos los productos que cumplan los demás filtros, no solo sobre las 100 filas de la página visible.

El orden obligatorio de procesamiento será:

1. Construir los filtros recibidos.
2. Aplicarlos al catálogo completo.
3. Contar la totalidad de coincidencias.
4. Calcular la cantidad de páginas.
5. Obtener las 100 filas correspondientes a la página solicitada.

Por ejemplo, si un producto estaba en la página 8 antes de buscar y su descripción coincide con el texto ingresado, formará parte del nuevo conjunto filtrado y podrá aparecer desde la primera página de resultados.

## 8. Productos: paginación

- La paginación se realizará en el servidor.
- Cada página mostrará como máximo 100 filas.
- El tamaño de página será fijo y no podrá modificarse desde la interfaz.
- La página predeterminada será la 1.
- El orden de los registros deberá ser determinista antes de paginar. Se mantendrá el orden funcional vigente por línea y descripción, incorporando el ID como último criterio de desempate.
- La interfaz mostrará el rango y el total, por ejemplo: `Mostrando 101–200 de 345`.
- Se ofrecerán controles para ir a la primera, anterior, siguiente y última página.
- Los controles conservarán los filtros activos en la URL.
- Los controles que no tengan un destino válido se mostrarán deshabilitados.
- Si la página solicitada supera el total disponible, se normalizará a la última página válida.
- Si no existen resultados, se conservará la página 1, se mostrará `0 resultados` y un estado vacío.

## 9. Flujo de datos propuesto

1. La página recibe los parámetros de filtros y página desde la URL.
2. El servidor los normaliza y valida.
3. Se construye una única condición de consulta reutilizada para el conteo y la obtención de registros.
4. Se ejecutan:
   - Un conteo total con los filtros activos.
   - Una consulta ordenada con desplazamiento y límite de 100 registros.
5. La página representa filtros, grilla, total y navegación.

La consulta de conteo y la consulta paginada deben usar exactamente las mismas condiciones para evitar diferencias entre el total informado y las filas visibles.

## 10. Manejo de errores y casos límite

- Los parámetros inválidos no provocarán un error general de página.
- Una búsqueda sin coincidencias mostrará un estado vacío y conservará los filtros para permitir su corrección.
- La descripción se normalizará eliminando espacios al inicio y al final.
- Cambiar filtros durante la navegación no conservará un número de página anterior potencialmente inválido.
- Un fallo inesperado de consulta se manejará mediante el mecanismo de errores vigente de la aplicación, sin exponer información interna de la base de datos.

## 11. Pruebas

### 11.1 Permisos

- El Administrador visualiza el control de creación.
- Un usuario no Administrador no visualiza el control de creación.
- El servidor permite crear un producto al Administrador.
- El servidor rechaza la creación solicitada por un usuario no Administrador.

### 11.2 Alertas

- El Administrador recibe alertas correspondientes a bodegas de distintos centros.
- Se incluyen alertas de caducidad según la regla vigente.
- Se incluyen alertas de stock mínimo según la regla vigente del módulo Stock.
- No se incorporan alertas exclusivamente por stock en cero.
- Un resultado sin alertas muestra el estado vacío esperado.

### 11.3 Filtros

- El ID devuelve únicamente la coincidencia exacta.
- Línea y estado filtran correctamente de forma independiente.
- La descripción encuentra coincidencias parciales sin distinguir mayúsculas y minúsculas.
- La combinación de filtros aplica todas las condiciones.
- Cambiar o limpiar un filtro vuelve a la página 1.
- Los filtros se conservan al navegar entre páginas.
- Los parámetros inválidos se manejan sin caída de la pantalla.

### 11.4 Paginación

- Cero resultados produce una sola vista vacía en la página 1.
- 100 resultados se muestran en una página.
- 101 resultados generan dos páginas: 100 filas y 1 fila.
- La navegación entre páginas no repite ni omite productos.
- Una página superior al total se normaliza a la última página válida.
- La búsqueda por descripción encuentra productos que, sin el filtro, estarían ubicados en páginas posteriores.

## 12. Criterios de aceptación

1. Un Administrador puede ver en el Resumen las alertas de caducidad y stock mínimo de todas las bodegas.
2. Las reglas existentes de caducidad y stock mínimo no cambian.
3. Este alcance no agrega alertas por stock en cero.
4. Solo el Administrador puede crear productos, tanto desde la interfaz como mediante la operación del servidor.
5. La grilla permite combinar filtros por ID, línea, estado y descripción.
6. La descripción se busca en todo el catálogo filtrado antes de paginar.
7. Cada página contiene como máximo 100 productos.
8. El total, el rango visible y los controles de navegación corresponden al conjunto filtrado.
9. Los filtros permanecen activos al navegar entre páginas.
10. Las pruebas automatizadas asociadas pasan correctamente.

