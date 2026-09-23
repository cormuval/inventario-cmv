# Procedimiento Técnico y Sanitario: Control y Bloqueo de Lotes Caducados y Flujo Exclusivo de Merma

**Proyecto:** Sistema de Inventario APS — Corporación Municipal de Valparaíso (CMV)  
**Documento:** Procedimiento de Control Crítico Sanitario  
**Versión:** 1.0 (Borrador para Aprobación de Superiores / Jefatura)  
**Fecha:** 21 de Septiembre de 2026  
**Clasificación:** Requerimiento Sanitario y Operativo Crítico (Prioridad Máxima)  

---

## 1. Contexto y Diagnóstico Sanitario

En la Red de Atención Primaria de Salud (CESFAM, CECOSF y postas dependientes de la CMV), la dispensación o egreso de medicamentos o insumos clínicos vencidos constituye una **falta grave a las normativas del Ministerio de Salud (MINSAL) y del Instituto de Salud Pública (ISP)** (Decreto 466, Buenas Prácticas de Almacenamiento y Dispensación).

### Problema Detectado en el Estado Actual del Sistema:
1. El módulo de **Orden de Salida** permite seleccionar cualquier lote disponible sin validar si su fecha de vencimiento ya expiró respecto a la fecha actual.
2. Un operador podría despachar accidentalmente a un box o sala clínica un fármaco vencido bajo la tipificación de "Consumo Interno".
3. No existe un flujo forzado que obligue al usuario a tipificar los productos vencidos exclusivamente como **"Merma / Baja Sanitaria"** con registro de justificación y trazabilidad de auditoría.

---

## 2. Definición de Reglas de Negocio Estrictas

Para garantizar la seguridad de los pacientes y la integridad operativa del inventario municipal, se establecen las siguientes reglas intransables:

```
[ STOCK EN BODEGA ]
        │
        ├─ ¿Lote Vigente? ─────► Permitido para:
        │                         • "Consumo Interno" (Clínico)
        │                         • "A Otros Centros" (Traspaso)
        │                         • "Merma" (Daño/Pérdida)
        │
        └─ ¿Lote Caducado? ────► ⛔ BLOQUEO TOTAL para Salida Clínica / Traspasos
                                 ✔ ÚNICA VÍA ADMISIBLE: "Merma / Baja Sanitaria"
                                   (Requiere justificación obligatoria)
```

### Regla R-01: Bloqueo Sanitario en Salidas Ordinarias
* Si un lote tiene una `fechaCaducidad < Hoy`, queda **estrictamente prohibido** para cualquier salida de tipo `"Consumo Interno"` o `"A Otros Centros"`.
* En la interfaz de usuario, estos lotes se excluyen de la lista de selección regular o se presentan visualmente inhabilitados con distintivo de caducado.
* En el backend (Server Action), cualquier intento de registrar una salida clínica con un lote caducado provocará el rechazo inmediato de la transacción.

### Regla R-02: Canal Único para Lotes Vencidos ("Merma / Baja Sanitaria")
* La **única operación admisible** para un producto vencido es su retiro físico y lógico bajo el tipo de salida `"Merma"`.
* **Justificación Obligatoria:** Toda salida por Merma debe exigir obligatoriamente una glosa/motivo explicativo (ej. *"Vencimiento en estantería según protocolo sanitario"*, *"Rotura de frasco"*, *"Falla de refrigeración"*).

### Regla R-03: Inmutabilidad de Modificaciones y Eliminaciones
* No se autoriza editar un detalle de salida previo para sustituirlo por un lote caducado.
* Cualquier reversión o ajuste sobre un lote caducado queda restringida y debe ser registrada en la bitácora de auditoría (`AuditLogger` en tabla `logs`).

### Regla R-04: Alerta Máxima Visual en Módulo Stock
* En la tabla de Stock y en el Dashboard, los lotes vencidos deben destacar con semáforo **Rojo Crítico / Alerta Máxima** (*"Lote Vencido - Trasladar a Cuarentena"*), advirtiendo que no pueden ser utilizados en atención médica.

---

## 3. Arquitectura de Cambios Técnicos Previstos

> **Nota:** Estos cambios están definidos a nivel de diseño técnico y **no se implementarán hasta contar con la autorización formal de jefatura**.

### Capa 1: Validación de Datos (Zod Schemas)
* **Archivo:** `src/modules/orden-salida/schemas/orden-salida.schema.ts`
* **Acción:**
  * Crear validación cruzada con `.superRefine(...)`:
    * Si `tipoSalida !== "Merma"`, verificar que ningún detalle posea `fechaCaducidad < hoy`. Si existe alguno, emitir error: *"El lote [X] se encuentra caducado. No puede egresar como salida clínica."*
    * Si `tipoSalida === "Merma"`, validar que el campo de justificación/motivo contenga al menos 5 caracteres descriptivos.

### Capa 2: Backend y Transacciones Atómicas (Server Actions)
* **Archivo:** `src/modules/orden-salida/actions/orden-salida.action.ts`
* **Acción:**
  * En la función `descontarStock`, verificar a nivel de base de datos la vigencia sanitaria del lote antes de decrementar saldos.
  * Si la orden no es de Merma y el lote venció, abortar con `throw new Error(...)` para forzar el rollback completo de la transacción de Prisma.
  * Registrar la baja en `AuditLogger` con la justificación ingresada.

### Capa 3: Interfaz de Usuario (Frontend / React)
* **Archivos:**
  * `src/modules/orden-salida/components/orden-salida-detalles-field.tsx`
  * `src/modules/orden-salida/components/orden-salida-form.tsx`
* **Acción:**
  * El selector de productos/lotes se adaptará dinámicamente según el `tipoSalida` elegido:
    * Modo Normal: Solo muestra lotes vigentes con saldo $> 0$.
    * Modo Merma: Permite seleccionar lotes caducados o dañados, activando el campo obligatorio de justificación de baja.

---

## 4. Protocolo de Pruebas y Certificación (Plan de Validación)

Para verificar con sus superiores que la solución es 100% infalible antes de su paso a producción, se define el siguiente protocolo de prueba controlada:

### Datos de Prueba a Configurar (Semilla / Script de Test)
* **Producto de Prueba:** *"Producto Test Caducidad - Suero Fisiológico 500ml"*
* **Bodega:** *Bodega Clínica*
* **Lote Vencido (L-CADUCADO):**
  * Saldo: 50 unidades.
  * Fecha de Vencimiento: Fecha en el pasado (ej. 30 días atrás).
* **Lote Vigente (L-VIGENTE):**
  * Saldo: 50 unidades.
  * Fecha de Vencimiento: Fecha futura (+1 año).

### Matriz de Casos de Prueba (Casos de Aceptación)

| ID Caso | Escenario Evaluado | Acción Ejecutada | Resultado Esperado | Criterio de Éxito |
| :--- | :--- | :--- | :--- | :--- |
| **TC-01** | **Entrada con fecha pasada** | Intentar crear una Orden de Entrada con fecha de caducidad de ayer. | El sistema rechaza el formulario. | Mensaje: *"La caducidad no puede ser anterior a hoy"*. |
| **TC-02** | **Salida clínica de lote vencido** | Seleccionar tipo "Consumo Interno" e intentar despachar 5 unidades de `L-CADUCADO`. | Bloqueo en selector y rechazo por backend si se fuerza el envío. | Mensaje de error sanitario impidiendo el registro. |
| **TC-03** | **Salida Merma sin justificación** | Seleccionar tipo "Merma" con `L-CADUCADO`, pero dejando vacía la justificación. | Formulario no permite enviar. | Mensaje: *"La justificación de merma es obligatoria"*. |
| **TC-04** | **Salida Merma autorizada** | Seleccionar "Merma", `L-CADUCADO`, y justificación *"Baja por vencimiento en estantería"*. | La orden se crea exitosamente. | El stock de `L-CADUCADO` baja a 45 y se genera registro de auditoría en `logs`. |
| **TC-05** | **Salida clínica de lote vigente** | Seleccionar "Consumo Interno" con `L-VIGENTE`. | Salida normal exitosa. | Flujo clínico habitual opera sin fricción. |

---

## 5. Acta de Conformidad para Superiores

| Rol | Nombre | Firma / Estado | Fecha |
| :--- | :--- | :--- | :--- |
| **Desarrollador / Alumno en Práctica** | | Elaborado | 21/09/2026 |
| **Jefatura TI / Supervisor CMV** | | [ ] Aprobado<br>[ ] Observado | |
| **Encargado Técnico de Farmacia / APS** | | [ ] Aprobado<br>[ ] Observado | |

**Instrucción Operativa:** Queda suspendida la ejecución de código en `src/` hasta contar con el visto bueno formal de este documento.
