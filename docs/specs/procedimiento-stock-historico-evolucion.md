# Procedimiento Técnico: Consulta de Stock Histórico y Evolución por Producto y Rango de Fechas (INV-25)

**Proyecto:** Sistema de Inventario APS — Corporación Municipal de Valparaíso (CMV)  
**Documento:** Especificación Técnica de Reconstrucción de Saldos y Evolución Histórica  
**Versión:** 1.0  
**Fecha:** 10 de Noviembre de 2026  
**Issue:** [INV-25 #31] Reconstrucción de saldo histórico por producto, centro/bodega y rango de fechas  

---

## 1. Contexto y Objetivos

Actualmente, el sistema gestiona y visualiza únicamente el stock en tiempo real (`Stock.Cantidad_Disponible`) y consultas aisladas de salidas recientes. No existía un mecanismo para responder preguntas críticas de auditoría y gestión como:
* *¿Cuánto stock de Paracetamol 500mg había en la Bodega Central del CESFAM el 1 de octubre?*
* *¿Cuál fue la evolución diaria del stock de un producto durante el último mes o período epidémico?*
* *¿Qué movimientos específicos (entradas, salidas, traspasos, préstamos o anulaciones) explicaron la variación del saldo?*

### Objetivos Específicos:
1. Permitir consultar el **saldo exacto** a una fecha de corte pasada y su **evolución cronológica** dentro de un rango de fechas.
2. Filtrar por **Producto** (obligatorio), **Centro** y **Bodega** (respetando estrictamente el alcance y roles del usuario: `validarCentroBodegaEnAlcance`).
3. Trazabilidad completa de movimientos considerados:
   - Entradas ordinarias.
   - Salidas ordinarias (consumo, merma, vencimiento, otros).
   - Traspasos internos entre bodegas del mismo centro (egreso en origen, ingreso en destino).
   - Préstamos intercentros (egreso en bodega origen al emitir en tránsito).
   - Recepción de préstamos intercentros (ingreso en bodega destino vía `OrdenEntrada`).
   - Anulaciones de préstamos (restitución de stock en bodega emisora).
4. **Límite de Trazabilidad (Migración AppSheet y Datos Históricos):**
   Si la consulta abarca un período anterior a la fecha límite con datos verificables (fecha del primer movimiento o corte de migración), el sistema debe **exponer explícitamente esa limitación**, sin presentar saldos ficticios o estimados como si fueran exactos.
5. **Fuera de Alcance:**
   El paquete general de reportes financieros/kardex contable global de INV-26 (se mantiene acotado a la consulta puntual por producto/bodega requerida en INV-25).

---

## 2. Modelo Matemático de Reconstrucción de Saldos

Dado que la tabla `Stock` almacena el saldo físico actual en tiempo real y no se cuenta con snapshots históricos diarios previos a la migración, el cálculo adopta un **modelo retrospectivo auditable con límite de frontera**:

### 2.1. Saldo a la Fecha de Fin de Consulta ($T_{hasta}$)
Sea $S_{actual}$ la sumatoria de `Cantidad_Disponible` del producto en la bodega seleccionada al momento presente ($T_{ahora}$):

$$S(T_{hasta}) = S_{actual} - \sum_{\tau = T_{hasta}}^{T_{ahora}} \text{Ingresos}(\tau) + \sum_{\tau = T_{hasta}}^{T_{ahora}} \text{Egresos}(\tau)$$

Donde:
* **Ingresos:**
  - `OrdenEntradaDetalle` con fecha posterior a $T_{hasta}$.
  - Traspasos internos recibidos (`OrdenSalida` con `tipoSalida = "A otra bodega"` y `bodegaDestinoId = BodegaConsultada`) con fecha posterior a $T_{hasta}$.
  - Anulaciones de préstamos emitidos desde la bodega que restituyeron stock con posterioridad a $T_{hasta}$.
* **Egresos:**
  - `OrdenSalidaDetalle` de órdenes emitidas desde la bodega consultada con fecha posterior a $T_{hasta}$ (incluyendo consumo interno, mermas, traspasos a otra bodega y préstamos emitidos en tránsito o recepcionados).

### 2.2. Evolución Cronológica dentro del Rango $[T_{desde}, T_{hasta}]$
1. Se recopilan todos los movimientos ocurridos en el intervalo $[T_{desde}, T_{hasta}]$, ordenados cronológicamente por `fecha ASC, id ASC`.
2. Se deduce el **Saldo Inicial a $T_{desde}$**:
   $$S(T_{desde}) = S(T_{hasta}) - \sum_{m \in [T_{desde}, T_{hasta}]} \Delta(m)$$
   Donde $\Delta(m) = +\text{cantidad}$ para ingresos y $-\text{cantidad}$ para egresos.
3. Se itera secuencialmente cada movimiento para calcular el saldo acumulado paso a paso:
   $$S_i = S_{i-1} + \Delta(m_i)$$
   El último saldo $S_n$ coincide exactamente con $S(T_{hasta})$.

### 2.3. Límite de Trazabilidad y Datos Insuficientes
Para la bodega y producto consultados, se calcula:
$$T_{limite} = \min(\text{fecha de primer movimiento conocido}, \text{fecha de registro base})$$

* Si $T_{desde} < T_{limite}$:
  - `datosCompletos = false`
  - `fechaLimite = T_{limite}`
  - `mensaje = "Datos insuficientes para reconstruir el saldo exacto con anterioridad al DD/MM/AAAA. Los saldos anteriores no se presentan como exactos para evitar inconsistencias."`
  - En la interfaz se presenta una alerta visual destacada indicando la fecha a partir de la cual el saldo es verificable.

---

## 3. Arquitectura y Componentes Técnicos

```
src/
├── app/
│   └── stock/
│       └── historico/
│           └── page.tsx                     # Página Server Component protegida con AppLayout
├── modules/
│   └── stock/
│       ├── actions/
│       │   └── stock-historico.action.ts    # Server Action con sesión, validación Zod y alcance
│       ├── components/
│       │   ├── stock-historico-filtros.tsx  # Formulario con producto, centro, bodega y fechas
│       │   ├── stock-historico-resumen.tsx  # Tarjetas: Saldo Inicial, Entradas, Salidas, Saldo Final
│       │   └── stock-historico-tabla.tsx    # Timeline/Tabla detallada de movimientos y trazabilidad
│       ├── schemas/
│       │   └── stock-historico.schema.ts    # Validación Zod de parámetros
│       └── utils/
│           └── stock-historico-consulta.ts  # Lógica pura de reconstrucción matemática y consultas Prisma
```

---

## 4. Tipos de Movimientos y Detalle de Trazabilidad

Cada movimiento en la línea de tiempo expondrá:
1. **Fecha y Hora**: Fecha contable del movimiento.
2. **Tipo de Movimiento**:
   - `ENTRADA`: Ingreso ordinario a bodega.
   - `SALIDA_CONSUMO`: Despacho por consumo interno.
   - `SALIDA_MERMA`: Baja sanitaria / pérdida justificada.
   - `TRASPASO_SALIDA`: Traspaso hacia otra bodega (descuenta de origen).
   - `TRASPASO_ENTRADA`: Traspaso recibido desde otra bodega (incrementa en destino).
   - `PRESTAMO_EMITIDO`: Préstamo intercentros emitido (`EN_TRANSITO` o posterior).
   - `PRESTAMO_RECEPCIONADO`: Préstamo intercentros recibido en destino (vía `OrdenEntrada`).
   - `PRESTAMO_ANULADO`: Devolución de stock por anulación de préstamo intercentros.
3. **Documento / Referencia**: Número o ID de Orden, código de salida o guía de despacho.
4. **Origen / Destino**: Bodega/Centro contraparte o Servicio/Clínica solicitante.
5. **Cantidad**: Variación con signo ($+\text{cant}$ o $-\text{cant}$).
6. **Saldo Resultante**: Saldo que quedó inmediatamente tras la aplicación de ese movimiento.
7. **Lote / Caducidad**: Información de los lotes involucrados en la transacción.

---

## 5. Criterios de Aceptación (Verificación)

- [ ] **CA-1: Filtros Obligatorios y Opcionales:** Exige producto válido; centro y bodega validados según el perfil y alcance del usuario (administrador o usuario con alcance sobre la bodega). Rango de fechas por defecto a los últimos 30 días si no se especifica.
- [ ] **CA-2: Cálculo Exacto de Saldo a la Fecha:** El saldo final calculado para hoy coincide con el stock consolidado actual en la base de datos.
- [ ] **CA-3: Reconstrucción de Evolución Cronológica:** Los movimientos de entrada, salida ordinaria, traspasos internos y préstamos intercentros alteran el saldo de forma coherente en orden cronológico.
- [ ] **CA-4: Manejo de Anulaciones de Préstamos:** La restitución de un préstamo anulado se refleja en la bodega de origen en la fecha correspondiente sin duplicar saldo.
- [ ] **CA-5: Manejo de Frontera / Límite de Trazabilidad:** Si el rango consultado antecede al primer registro histórico o a la fecha de corte, el sistema notifica la limitación y no muestra un saldo estimado como verificado.
- [ ] **CA-6: Suite de Pruebas Automatizadas:** Pruebas unitarias de cálculo puro y pruebas de integración del Server Action con diferentes roles y alcances.

