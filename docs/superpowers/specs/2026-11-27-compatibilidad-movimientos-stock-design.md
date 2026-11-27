# Compatibilidad de bodega y producto en movimientos de stock

## Intención

Extender la regla introducida por el PR #40 a todos los caminos que acreditan stock en otra bodega, evitando combinaciones incompatibles tanto desde la interfaz como ante llamadas directas al servidor.

## Regla de negocio

- Una bodega `ASEO` solo puede operar productos cuya línea sea exactamente `ASEO`.
- Un producto de línea `ASEO` solo puede acreditarse en una bodega `ASEO`.
- Una bodega `CLINICA` admite productos de cualquier línea distinta de `ASEO`.

## Alcance

- Traspaso `A otra bodega`: validar todos los productos contra la bodega destino antes de crear o editar la orden y antes de modificar stock; filtrar destinos incompatibles según las líneas realmente seleccionadas en el formulario.
- Préstamo `A otros centros`: validar todos los productos contra la bodega indicada al emitir; filtrar las bodegas destino según las líneas realmente seleccionadas en el formulario.
- Recepción de préstamos: validar nuevamente todos los productos contra la bodega receptora elegida y filtrar las opciones según las líneas reales del préstamo.
- Entradas manuales: conservar la experiencia actual, pero aplicar el mismo protocolo transaccional de bloqueo y revalidación antes de acreditar stock.
- Órdenes de salida ordinarias, como consumo interno y merma: no requieren una validación adicional porque no acreditan stock en otra bodega.
- Compensaciones, anulaciones y reversiones: validar nuevamente la compatibilidad antes de devolver stock, porque la bodega original pudo haber sido reclasificada después del movimiento. Si ya no es compatible, la operación se rechazará sin cambios parciales y explicará que primero debe restablecerse una clasificación compatible.
- Reclasificación de bodegas: coordinar el cambio de tipo con los movimientos de stock para que una operación concurrente no pueda confirmar una combinación incompatible.

## Fuera de alcance

- Corregir o migrar combinaciones incompatibles ya existentes.
- Cambiar la clasificación actual de bodegas o líneas de productos.
- Modificar el significado funcional de consumo interno, merma, traspaso o préstamo.

El sistema no corregirá automáticamente stock histórico incompatible. Sin embargo, la interfaz podrá seleccionar esos lotes y ofrecer una bodega destino compatible con sus líneas reales, permitiendo resolverlos mediante una operación normal y validada.

## Enfoques considerados

1. **Regla compartida, selección por líneas reales y coordinación mediante bloqueo de filas — seleccionado.** Reutilizar una utilidad compartida, calcular destinos desde los productos seleccionados y serializar movimientos y reclasificaciones sobre la fila de la bodega. Mantiene una defensa autoritativa en el servidor y elimina la ventana concurrente.
2. **Duplicar condiciones en cada módulo.** Requiere menos movimiento inicial de archivos, pero permite que mensajes y reglas diverjan entre entradas, salidas y préstamos.
3. **Confiar solo en filtros de interfaz.** Es insuficiente porque una petición manipulada o una carrera de estado podría saltarse la restricción.
4. **Validar dentro de una transacción sin lectura bloqueante.** Reduce parte de la ventana temporal, pero una lectura MVCC permite que el mantenedor cambie el tipo después de la validación y antes de acreditar stock.
5. **Bloquear únicamente los movimientos.** No preserva el invariante si el mantenedor reclasifica una bodega poblada después de que el movimiento termina; ambos caminos deben compartir el mismo protocolo.

## Diseño

La utilidad compartida conservará la evaluación pura por `TipoBodega` y línea, el filtrado genérico, la evaluación de colecciones y los mensajes actuales. Toda operación con varios detalles será compatible solo cuando todos sus productos lo sean; una mezcla que no tenga un único tipo de bodega compatible no ofrecerá destinos y será rechazada por el servidor.

Toda acción que incremente un saldo —entrada manual, traspaso interno, recepción de préstamo, edición o eliminación con compensación y anulación o reversión— abrirá una transacción y adquirirá un bloqueo de escritura sobre la fila de la bodega que recibirá el stock mediante una lectura bloqueante de MySQL (`SELECT ... FOR UPDATE`). Después del bloqueo releerá el tipo de bodega y las líneas actuales de todos los productos; si cualquier detalle es incompatible, la transacción terminará sin crear órdenes ni alterar existencias. Cuando una operación afecte dos bodegas, adquirirá los bloqueos en orden estable por identificador para reducir el riesgo de interbloqueos.

La emisión de un préstamo intercentros no acredita stock en la bodega sugerida. Al emitir se validará que la sugerencia sea compatible con los detalles en ese momento, pero la garantía definitiva se aplicará al recepcionar, bajo bloqueo y usando la bodega efectivamente elegida. Un cambio de clasificación posterior a la emisión no invalida el préstamo completo: obliga a escoger otra bodega compatible durante la recepción.

La acción de edición de bodegas usará una transacción y adquirirá el mismo bloqueo sobre la bodega antes de reclasificarla. Si cambia el tipo, comprobará el stock positivo existente y rechazará la reclasificación cuando cualquier producto quede incompatible con el nuevo tipo. Así se cubren ambos órdenes concurrentes: si el movimiento obtiene primero el bloqueo, la reclasificación espera y luego ve el stock acreditado; si la reclasificación obtiene primero el bloqueo, el movimiento espera y valida contra el tipo nuevo. Si una bodega sin saldo fue reclasificada, una reversión posterior solo podrá devolver stock compatible con el tipo vigente; de lo contrario será rechazada de forma atómica.

Actualmente la línea de un producto no se edita después de crearlo. Si se incorpora esa capacidad en el futuro, deberá usar el mismo protocolo de bloqueo y validar todo su stock positivo antes de cambiar la línea.

`listarLotesDisponibles` incluirá `producto.linea` en cada lote. `OrdenSalidaDetallesField` comunicará al formulario las líneas seleccionadas y el formulario recalculará ambos selectores de destino usando todas ellas. Al cambiar la bodega origen o cualquier detalle, una selección de destino que deje de ser compatible se limpiará. Antes de elegir productos, el selector no afirmará compatibilidad y solicitará seleccionar los lotes primero.

En recepción, las bodegas se filtrarán usando todas las líneas reales del préstamo. Una bodega sugerida incompatible no quedará almacenada ni se enviará. Si existen bodegas activas dentro del alcance pero ninguna es compatible, la interfaz informará que no hay bodegas compatibles con los productos del préstamo; el mensaje de falta de asignación se reservará para cuando el usuario realmente no tenga bodegas disponibles en el centro.

## Pruebas

- Utilidad compartida: compatibilidad individual y de colecciones.
- Traspaso interno: rechazo del servidor al crear y editar, operación mixta compatible/incompatible, exclusión de destinos según los detalles seleccionados y limpieza del destino al cambiar origen o productos.
- Emisión intercentros: rechazo del servidor para una operación mixta, exclusión de destinos según los detalles seleccionados y ausencia de escritura ante incompatibilidad.
- Recepción: rechazo antes de acreditar stock, filtrado según todos los detalles, limpieza de sugerencias incompatibles y mensaje diferenciado cuando no existe destino compatible.
- Entradas manuales: rechazo atómico y revalidación bajo bloqueo cuando la bodega cambia de tipo concurrentemente.
- Reversiones y anulaciones: aceptación cuando el tipo vigente sigue siendo compatible y rechazo atómico cuando la bodega original fue reclasificada a un tipo incompatible.
- Concurrencia: pruebas de integración con MySQL real que intercalen reclasificación con traspaso interno, recepción y entrada manual en ambos órdenes y demuestren que solo una combinación compatible puede confirmarse. Los mocks unitarios complementarán estos casos, pero no sustituirán las pruebas reales de bloqueo.
- Reclasificación: rechazo al cambiar el tipo de una bodega con stock positivo incompatible y aceptación cuando el stock es compatible o inexistente.
- Salidas ordinarias: confirmar que consumo interno y merma siguen sin exigir bodega destino.
