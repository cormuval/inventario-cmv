# Especificación Técnica y de Negocio: Exclusión Total de Lotes sin Stock en Salidas

**Proyecto:** Sistema de Inventario APS — Corporación Municipal de Valparaíso (CMV)  
**Documento:** Especificación de Control Operativo contra Lotes Fantasma  
**Versión:** 1.0 (Borrador para Aprobación)  
**Fecha:** 23 de Septiembre de 2026  
**Clasificación:** Control Operativo Crítico (Prioridad Alta)  

---

## 1. Diagnóstico del Problema

### El Reporte:
Al registrar salidas en el módulo de egresos (`/orden-salida`), se ha detectado la presencia de lotes con saldo en cero (`CantidadDisponible <= 0`).

### Causa Raíz Detectada en Código:
1. **Frontend (`orden-salida-detalles-field.tsx`):**
   La función `stocksFiltrados` filtra por `bodegaId` y por `esLoteCaducado`, pero **no evalúa explícitamente `stock.cantidadDisponible > 0`**. Si por caché del cliente, actualización parcial o props llegan registros con saldo $0$, el selector los despliega como seleccionables.
2. **Backend (`orden-salida.action.ts`):**
   Actualmente solo verifica `stock.cantidadDisponible < input.cantidad`. No existe una excepción explícita y preventiva que distinga entre un lote completamente agotado (saldo 0) y saldo insuficiente parcial.

---

## 2. Reglas de Negocio Estrictas

```
[ CATÁLOGO DE EXISTENCIAS DE BODEGA ]
                 │
        ¿CantidadDisponible > 0?
        ├── NO (Saldo <= 0) ───► ⛔ EXCLUSIÓN TOTAL DEL SELECTOR
        │                        (Ni en salida clínica ni en merma se permite seleccionar lote en 0)
        │
        └── SÍ (Saldo > 0)  ───► ✔ EVALUAR VIGENCIA SANITARIA
                                 ├── Vigente   ──► Consumo Interno / Otros Centros / Merma
                                 └── Caducado  ──► Únicamente Merma
```

### Regla R-01: Inexistencia de Lotes Fantasma en el Selector
Bajo ninguna circunstancia (ni en "Consumo Interno", "A Otros Centros" ni en "Merma") se debe mostrar o permitir la selección de un lote con `cantidadDisponible <= 0`. Si no hay producto físico en estantería, el lote no es operable para egresos.

### Regla R-02: Blindaje en Backend (Defensa en Profundidad)
Si una solicitud llega al Server Action intentando descontar de un lote con saldo cero, la transacción debe ser rechazada de inmediato con el mensaje claro:
> *"El lote [X] se encuentra agotado (saldo: 0). No se pueden procesar salidas de existencias inexistentes."*

### Regla R-03: Restricción en Campo Cantidad
El atributo `max` del input de cantidad debe estar ligado de forma obligatoria y estricta a `stock.cantidadDisponible`. No se puede ingresar un número superior al saldo físico real.

---

## 3. Plan de Cambios Técnicos

### Capa 1: Lógica Pura y Utilidades
* **Archivo:** `src/modules/stock/utils/movimientos.ts`
* **Función:** `filtrarLotesConStockDisponible(stocks)`: Función pura que garantiza que solo pasen existencias con `cantidadDisponible > 0`.
* **Pruebas:** Tests unitarios en `src/__tests__/movimientos.test.ts`.

### Capa 2: Interfaz de Usuario (Frontend React)
* **Archivo:** `src/modules/orden-salida/components/orden-salida-detalles-field.tsx`
* **Acción:**
  * En `stocksFiltrados`, incorporar la condición ineludible `stock.cantidadDisponible > 0`.
  * Si el total de existencias con saldo mayor a cero para la bodega es 0, mostrar mensaje amigable: *"No hay existencias con stock disponible en esta bodega."*

### Capa 3: Backend Atómico (Server Actions)
* **Archivo:** `src/modules/orden-salida/actions/orden-salida.action.ts`
* **Acción:**
  * En `descontarStock`, verificar explícitamente `if (stock.cantidadDisponible <= 0)` antes de la comprobación de cantidad solicitada, arrojando error descriptivo y rollback de la transacción.

---

## 4. Protocolo de Pruebas y Certificación

### Producto de Prueba con Lote Fantasma:
En `prisma/seed-test-caducado.ts`, incorporaremos un tercer lote al producto `#999`:
* **Lote `TEST-ZERO-00`:** Saldo **0 unidades**.

### Casos de Prueba (Matriz de Aceptación):

| ID | Escenario | Acción | Resultado Esperado |
| :--- | :--- | :--- | :--- |
| **TC-S01** | Visualización en selector | Abrir `/orden-salida` y tipear `TEST` | Solo aparecen `TEST-CAD-01` (si es Merma) y `TEST-VIG-02`. El lote `TEST-ZERO-00` **nunca aparece**. |
| **TC-S02** | Intento de inyección backend | Enviar payload manual con `TEST-ZERO-00` | Server Action rechaza con error: *"El lote TEST-ZERO-00 se encuentra agotado (saldo: 0)"*. |
| **TC-S03** | Lote que se agota | Registrar salida por el total de `TEST-VIG-02` (50 unidades) | Tras la salida, el lote desaparece automáticamente del selector de salidas para futuras operaciones. |

---

## 5. Estado y Control de Aprobación

* **Estado:** Especificación redactada. Esperando aprobación del usuario para proceder a la implementación.
* **Prohibición:** No modificar código en `src/` hasta contar con la autorización formal.
