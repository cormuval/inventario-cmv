# Diseño: botón Limpiar en filtros de Productos

**Estado:** Aprobado por el usuario  
**Fecha:** 20 de noviembre de 2026

## Intención

Dar a la acción `Limpiar` una apariencia consistente con `Buscar`, manteniendo clara su jerarquía secundaria.

## Diseño aprobado

- `Buscar` conserva su fondo turquesa sólido.
- `Limpiar` se presenta como botón secundario de igual altura, con fondo blanco, borde y texto turquesa.
- Al pasar el cursor, `Limpiar` utiliza un fondo turquesa suave.
- La acción continúa navegando a `/productos` y eliminando todos los filtros.

## Enfoques considerados

- Botón sólido: descartado porque competiría visualmente con la acción principal.
- Enlace sin contenedor: corresponde al estado actual y no entrega la presencia visual solicitada.
- Botón delineado: seleccionado porque conserva la jerarquía y añade color y superficie clickeable.

## Fuera de alcance

- Cambiar el comportamiento de los filtros.
- Modificar el botón `Buscar`.
- Introducir un componente global nuevo.
