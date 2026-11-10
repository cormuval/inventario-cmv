# Especificación Técnica y de Negocio: Perfil de Visualización Global de Solo Lectura (Droguería)

**Proyecto:** Sistema de Inventario APS — Corporación Municipal de Valparaíso (CMV)  
**Documento:** Especificación Funcional, de Seguridad y Control de Acceso: Rol Visualizador Global Droguería (`R08`)  
**Versión:** 1.0 (Aprobada para Implementación)  
**Fecha:** 27 de Octubre de 2026  
**Clasificación:** Seguridad Operativa, Control de Acceso y Visibilidad Panorámica (Prioridad Alta)  
**Origen:** Requerimiento del sistema anterior, solicitado en la reunión con Droguería Central del 03-12-2025 (Tarea generada a solicitud de Renzo)

---

## 1. Diagnóstico del Problema y Justificación de Negocio

### El Requerimiento y Contexto Operativo:
> *"Se requiere un perfil de visualización global para el equipo de Droguería Central. Este rol debe poder ver el stock disponible, los movimientos históricos (entradas y salidas) y los reportes de consumo de todos los centros de salud y bodegas comunales.*  
> *Sin embargo, este perfil debe ser estrictamente de solo lectura: no puede registrar entradas ni salidas, no puede recepcionar préstamos ni modificar mantenedores ni usuarios.*  
> *En la especificación de alcance (mínimo privilegio), el punto 3 indicaba originalmente que solo el Administrador Comunal (DAS) goza de vista panorámica. Este nuevo perfil constituye una excepción formal de solo lectura a dicha regla y debe quedar documentado técnica y reglamentariamente."*

### Análisis de Necesidad Logística vs. Seguridad Sanitaria:
1. **Monitoreo Logístico Centralizado (Droguería):**
   - Droguería Central coordina las adquisiciones a gran escala y la distribución comunal hacia los centros de atención primaria (CESFAM, CECOSF, Postas y SAPU/SAR). Para programar despachos y reabastecimientos preventivos, Droguería necesita verificar existencias consolidadas y movimientos de todos los recintos sin depender de llamados telefónicos ni solicitar reportes manuales.
2. **Blindaje de Operaciones Locales (Independencia de Recintos):**
   - Aunque Droguería necesita ver todo, **no debe intervenir en la operación diaria local** de los centros. Los registros de ingresos físicos, las dispensaciones a pacientes, los traspasos internos y la administración de usuarios deben permanecer en manos exclusivas de los encargados de bodega, operadores y administradores designados.
3. **Formalización de la Excepción al Principio de Mínimo Privilegio:**
   - La especificación previa de seguridad ([procedimiento-alcance-visibilidad-minimo-privilegio.md](procedimiento-alcance-visibilidad-minimo-privilegio.md)) dictaba que solo el rol `R01` (Administrador DAS) podía alternar entre centros comunales. La introducción del rol `R08` formaliza la única excepción permitida: **visibilidad panorámica con cero facultades mutativas**.

---

## 2. Matriz de Permisos y Comparativa de Alcance

```
                     ┌────────────────────────────────────────────────────────┐
                     │              VISTA PANORÁMICA COMUNAL                  │
                     │          (Todos los Centros y Todas las Bodegas)       │
                     └───────────────────────────┬────────────────────────────┘
                                                 │
                     ┌───────────────────────────┴────────────────────────────┐
                     │                                                        │
        ┌────────────▼──────────────┐                          ┌──────────────▼─────────────┐
        │   ADMINISTRADOR (R01)     │                          │  VISUALIZADOR DROGUERÍA    │
        │      (DAS Comunal)        │                          │         (Rol R08)          │
        ├───────────────────────────┤                          ├────────────────────────────┤
        │ • Vista de todo           │                          │ • Vista de todo            │
        │ • Entradas y Salidas      │                          │ • CERO mutaciones          │
        │ • Mantenedores y Usuarios │                          │ • Sin acceso Mantenedores  │
        └───────────────────────────┘                          └────────────────────────────┘
```

| Rol | Código | Centros en Alcance | Bodegas en Alcance | Movimientos / Reportes | Operaciones de Stock | Mantenedores |
|---|---|---|---|---|---|---|
| **Administrador Comunal (DAS)** | `R01` | Todos (filtro libre) | Todas | Todo el historial comunal | Total (Entradas, Salidas, Préstamos) | Acceso total (crear, editar, bajas) |
| **Visualizador Global Droguería** | **`R08`** | **Todos (filtro libre)** | **Todas** | **Todo el historial comunal** | **Ninguna (Solo Lectura estricto)** | **Sin acceso (oculto y bloqueado)** |
| **Encargado Centro** | `R02` | Solo su centro | Todas de su centro | Movimientos de su centro | Supervisión local | Sin acceso a mantenedores comunales |
| **Encargado Bodega** | `R03` | Solo su centro | Bodegas asignadas | Solo su(s) bodega(s) | Entradas y Salidas en su(s) bodega(s) | Sin acceso |
| **Operador Entrada** | `R06` | Solo su centro | Bodegas asignadas | Solo su(s) bodega(s) | Solo Entradas en su(s) bodega(s) | Sin acceso |
| **Operador Salida** | `R07` | Solo su centro | Bodegas asignadas | Solo su(s) bodega(s) | Solo Salidas en su(s) bodega(s) | Sin acceso |

---

## 3. Especificación Detallada de Reglas de Negocio

### Regla R-01: Excepción de Segregación Panorámica en el Motor de Alcance
- Se incorpora en `src/config/auth.ts` la constante:
  ```typescript
  export const ROL_VISUALIZADOR_DROGUERIA = "R08";
  ```
- En `src/shared/lib/inventario-alcance.ts`:
  - La función `obtenerAlcanceInventario()` evalúa:
    ```typescript
    if (usuario.rol === ROL_ADMINISTRADOR || usuario.rol === ROL_VISUALIZADOR_DROGUERIA) {
        return obtenerAlcanceAdministrador(usuario, filtros);
    }
    ```
  - Esto garantiza que el perfil `R08` reciba todos los centros activos y todas las bodegas activas de la comuna, con la propiedad `puedeFiltrarCentro: true` habilitada en los selectores de búsqueda.
- En `src/shared/lib/inventario-alcance-filtros.ts`:
  - `crearFiltroMovimientosAlcance(alcance)`: Si `alcance.usuario.rol === ROL_VISUALIZADOR_DROGUERIA`, retorna `{}` (filtro vacío), otorgando visibilidad completa e irrestricta de todas las órdenes de entrada, órdenes de salida y registros históricos de la comuna.
  - `crearFiltroStockAlcance(alcance)`: Opera idénticamente retornando `{}` para consolidar el stock comunal completo.

### Regla R-02: Blindaje de Servidor — Cero Mutaciones (Server Actions)
- En `src/shared/lib/auth.ts`:
  - `puedeOperarEntrada(rol)`: Retorna `true` únicamente para `[ROL_ADMINISTRADOR, "R03", "R06", "R07"]`. El rol `R08` no se incluye.
  - `puedeOperarSalida(rol)`: Retorna `true` únicamente para `[ROL_ADMINISTRADOR, "R03", "R07"]`. El rol `R08` no se incluye.
  - `puedeAdministrar(rol)`: Retorna `true` únicamente para `ROL_ADMINISTRADOR`. El rol `R08` no se incluye.
- Si una petición directa intenta ejecutar `crearOrdenEntrada`, `actualizarDetalleEntrada`, `crearOrdenSalida`, `actualizarDetalleSalida`, `recepcionarPrestamoIntercentros`, `crearProducto` o cualquier acción de mantenedores con sesión `R08`, el servidor aborta inmediatamente con mensaje de error de permisos:
  ```json
  { "ok": false, "message": "No tienes permiso para realizar esta operación." }
  ```

### Regla R-03: Adaptación Visual de Interfaz (UI Limpia de Solo Lectura)
Para evitar confusión en los usuarios de Droguería y presentar una interfaz limpia orientada exclusivamente a la auditoría y análisis:
1. **Módulo Orden de Entrada (`src/app/orden-entrada/page.tsx` y `/entradas`):**
   - Evalúa `puedeOperarEntrada(sessionUser.rol)`.
   - Si es falso (`R08` o perfiles de solo consulta):
     - Redirige directamente a `/entradas/registros`.
     - Si se accede directamente a `/entradas/nueva`, muestra advertencia informativa y oculta `<OrdenEntradaForm>` y el botón *"Recepcionar Préstamo Intercentros (Código)"*.
     - Se mantiene en pantalla completa la tabla histórica de ingresos con sus filtros de búsqueda y fechas.
2. **Módulo Orden de Salida (`src/app/orden-salida/page.tsx` y `/salidas`):**
   - Evalúa `puedeOperarSalida(sessionUser.rol)`.
   - Si es falso:
     - Redirige directamente a `/salidas/registros`.
     - Si se accede directamente a `/salidas/nueva`, se muestra advertencia de falta de permisos sin renderizar `<OrdenSalidaForm>`.
     - Se despliega la tabla histórica de salidas comunales, manteniendo habilitado el botón de **descarga de comprobante oficial en PDF** para cada movimiento.
3. **Módulo Catálogo de Productos (`src/app/productos/page.tsx`):**
   - Evalúa `puedeAdministrar(sessionUser.rol)`.
   - Si es falso:
     - Se **oculta** el formulario `<ProductoForm>` (`Nuevo producto`).
     - Se despliega el catálogo con buscador y estado de productos activos/inactivos.
4. **Módulo Mantenedores (`src/app/mantenedores/page.tsx`):**
   - En la barra lateral de navegación (`src/shared/components/layout/menu.ts`), el enlace `/mantenedores` se oculta si `rol !== ROL_ADMINISTRADOR`.
   - En la página `/mantenedores`, si un usuario que no es administrador ingresa por enlace directo, se redirige inmediatamente a la raíz (`/`) mediante `redirect("/")`.
   - La Server Action `listarMantenedores()` exige una sesión válida y rol administrador antes de consultar datos, incluso si se invoca directamente.

La descarga de PDF usa `validarLecturaComprobanteEnAlcance`: los roles globales `R01` y `R08` autenticados pueden descargar órdenes históricas aunque su centro o bodega esté desactivado. Los demás roles conservan su validación de alcance. Las mutaciones siguen usando la validación operativa de centros y bodegas activos.

### Regla R-04: Módulo de Stock y Reportes
- En `/stock` (`src/app/stock/page.tsx`):
  - El usuario con rol `R08` puede utilizar el selector desplegable para alternar entre cualquier centro de salud comunal y cualquier bodega, o dejar los filtros vacíos para obtener el stock total comunal consolidado.
- En `/reporte` (`src/app/reporte/page.tsx`):
  - El reporte de consumo mensual computa y visualiza la totalidad de despachos y stock de toda la red de salud primaria de Valparaíso.

---

## 4. Plan de Archivos Afectados

1. `src/config/auth.ts`:
   - Definición de constante `ROL_VISUALIZADOR_DROGUERIA = "R08"`.
2. `prisma/seed.ts`:
   - Registro del rol `["R08", "Visualizador Global Droguería"]` en la carga inicial de base de datos.
3. `src/shared/lib/auth.ts`:
   - Exportar helper `esVisualizadorSoloLectura(rol: string): boolean`.
   - Asegurar que `puedeOperarEntrada`, `puedeOperarSalida` y `puedeAdministrar` excluyan a `R08`.
4. `src/shared/lib/inventario-alcance.ts`:
   - Otorgar alcance panorámico (`obtenerAlcanceAdministrador`) tanto a `ROL_ADMINISTRADOR` como a `ROL_VISUALIZADOR_DROGUERIA`.
5. `src/shared/lib/inventario-alcance-filtros.ts`:
   - Configurar filtros de movimientos y stock `{}` (sin restricción comunal) para `ROL_VISUALIZADOR_DROGUERIA`.
6. `src/shared/components/layout/menu.ts`:
   - Condicionar visibilidad de `/mantenedores` a `rol === ROL_ADMINISTRADOR`.
7. `src/app/mantenedores/page.tsx`:
   - Validación al inicio de página: si no es administrador, redirigir a `/`.
8. `src/app/orden-entrada/recepcion-prestamos/page.tsx` y `src/app/entradas/nueva/page.tsx`:
   - Render condicional y protección: ocultar/bloquear recepción si no tiene permiso de entrada.
9. `src/app/productos/page.tsx`:
   - Render condicional: mostrar `<ProductoForm>` solo si `puedeAdministrar(user.rol)`.
10. `docs/specs/procedimiento-alcance-visibilidad-minimo-privilegio.md`:
    - Actualizar diagrama de jerarquía y tabla de roles incorporando la excepción oficial de lectura global de `R08`.

---

## 5. Criterios de Aceptación (Definición de Terminado - DoD)

- [x] **CA-1 (Visualización Panorámica de Stock):** Un usuario con rol `R08` ingresa a `/stock` y puede filtrar y visualizar las existencias de todos los centros de salud y bodegas comunales sin restricciones.
- [x] **CA-2 (Historial Global de Movimientos):** Un usuario `R08` ve la totalidad de órdenes de entrada y órdenes de salida registradas en la comuna en las tablas de `/orden-entrada` y `/orden-salida`.
- [x] **CA-3 (Descarga de Comprobantes PDF):** El usuario `R08` puede emitir y descargar los comprobantes oficiales en PDF de cualquier orden de salida comunal.
- [x] **CA-4 (Reporte Anual Consolidado):** En `/reporte`, el usuario `R08` visualiza la matriz de consumo anual de todos los centros y bodegas de Valparaíso.
- [x] **CA-5 (UI Limpia de Operaciones):** En `/orden-entrada`, `/orden-salida` y `/productos`, los formularios de alta/creación y botones de recepción de préstamos están completamente ocultos para el usuario `R08`.
- [x] **CA-6 (Protección de Mantenedores):** El enlace `/mantenedores` no aparece en la barra lateral del usuario `R08`. Si el usuario navega manualmente a `/mantenedores`, el sistema lo redirige a la página principal `/`.
- [x] **CA-7 (Rechazo en Backend ante Mutación):** Toda llamada a Server Actions de mutación (`crearOrdenEntrada`, `crearOrdenSalida`, `confirmarRecepcionPrestamoAction`, `crearProducto`, etc.) con rol `R08` es rechazada en el servidor con mensaje de falta de privilegios.
- [x] **CA-8 (Pruebas Automatizadas):** Suites de pruebas unitarias y de integración para validar el alcance de `R08`, la no mutación y el renderizado condicional de vistas.
