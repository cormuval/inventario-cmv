# Compatibilidad de bodega y producto en movimientos de stock

## Intención

Extender la regla introducida por el PR #40 a todos los caminos que acreditan stock en otra bodega, evitando combinaciones incompatibles tanto desde la interfaz como ante llamadas directas al servidor.

## Regla de negocio

- Una bodega `ASEO` solo puede operar productos cuya línea sea exactamente `ASEO`.
- Un producto de línea `ASEO` solo puede acreditarse en una bodega `ASEO`.
- Una bodega `CLINICA` admite productos de cualquier línea distinta de `ASEO`.

## Alcance

- Traspaso `A otra bodega`: validar todos los productos contra la bodega destino antes de crear la orden o modificar stock; filtrar destinos incompatibles en el formulario.
- Préstamo `A otros centros`: validar todos los productos contra la bodega indicada al emitir; filtrar las bodegas destino incompatibles en el formulario.
- Recepción de préstamos: validar nuevamente todos los productos contra la bodega receptora elegida y filtrar las opciones según las líneas reales del préstamo.
- Entradas manuales: conservar el comportamiento existente utilizando la misma regla compartida.
- Órdenes de salida ordinarias, como consumo interno y merma: no requieren una validación adicional porque no acreditan stock en otra bodega.
- Compensaciones, anulaciones y reversiones: devuelven stock a la bodega original o revierten un movimiento ya registrado; no crean una nueva combinación producto-bodega.

## Fuera de alcance

- Corregir o migrar combinaciones incompatibles ya existentes.
- Cambiar la clasificación actual de bodegas o líneas de productos.
- Modificar el significado funcional de consumo interno, merma, traspaso o préstamo.

## Enfoques considerados

1. **Regla compartida con validación por operación — seleccionado.** Mover la utilidad desde `orden-entrada` a un módulo compartido, reutilizarla en cada acción que acredita stock y filtrar las opciones en las interfaces. Reduce duplicación y mantiene una defensa autoritativa en el servidor.
2. **Duplicar condiciones en cada módulo.** Requiere menos movimiento inicial de archivos, pero permite que mensajes y reglas diverjan entre entradas, salidas y préstamos.
3. **Confiar solo en filtros de interfaz.** Es insuficiente porque una petición manipulada o una carrera de estado podría saltarse la restricción.

## Diseño

La utilidad compartida conservará la evaluación pura por `TipoBodega` y línea, el filtrado genérico y los mensajes actuales. Añadirá una evaluación para colecciones cuando ayude a expresar que todos los productos de una operación deben ser compatibles.

Las acciones de salida cargarán el tipo de la bodega destino y las líneas de los productos incluidos antes de iniciar la transacción que mueve stock. Si cualquier detalle es incompatible, devolverán un error y no crearán la orden ni alterarán existencias. La recepción hará la misma comprobación después de resolver la bodega receptora y antes de la transacción atómica.

En el formulario de salida, las bodegas destino se filtrarán por compatibilidad con el tipo de la bodega origen. Esto refleja el invariante de que el stock seleccionable en origen ya pertenece a líneas compatibles; el servidor seguirá comprobando las líneas reales como defensa. En recepción, donde el préstamo ya expone sus líneas, se exigirán bodegas compatibles con todos sus detalles.

## Pruebas

- Utilidad compartida: compatibilidad individual y de colecciones.
- Traspaso interno: rechazo del servidor y exclusión de destinos incompatibles en UI.
- Emisión intercentros: rechazo del servidor y exclusión de destinos incompatibles en UI.
- Recepción: rechazo antes de la transacción y filtrado según todos los detalles.
- Salidas ordinarias: confirmar que consumo interno y merma siguen sin exigir bodega destino.

