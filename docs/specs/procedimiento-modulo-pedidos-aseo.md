# Especificación Técnica: Módulo de Pedidos de Existencias de Aseo (INV-18 a INV-23)

**Proyecto:** Sistema de Inventario APS — Corporación Municipal de Valparaíso (CMV)  
**Documento:** Especificación Técnica de Flujo, Permisos y Arquitectura del Módulo de Pedidos  
**Versión:** 1.0  
**Fecha:** 11 de Noviembre de 2026  
**Issues:** [INV-18, INV-19, INV-20, INV-21, INV-22, INV-23 #29]  

---

## 1. Contexto y Objetivos

Los centros de salud de la red APS de Valparaíso (CESFAM, CECOSF y postas) requieren un canal formal, estandarizado y trazable para solicitar existencias de aseo (cloro, desinfectantes, papel higiénico, toallas de papel, jabón, etc.) tanto en pedidos mensuales regulares como en pedidos suplementarios o de urgencia.

### Objetivos Específicos:
1. **INV-18:** Acceso desde navegación lateral y creación de pedidos mensuales/suplementarios por centro.
2. **INV-19:** Borrador con catálogo cerrado de aseo (`linea === "ASEO"`), y descarga en Excel (`exceljs`) y PDF (`pdfkit`).
3. **INV-20:** Plantilla persistida reutilizable mes a mes por centro e historial consultable con buscador.
4. **INV-21:** Semáforo visual de stock (rojo para sin stock, amarillo para próximo o bajo el mínimo) y sugerencias automáticas según existencias reales.
5. **INV-22:** Revisión y ajuste de cantidades por parte de Adquisiciones con observación obligatoria y trazabilidad del pedido original.
6. **INV-23:** Exportación formal de la versión revisada para adjuntarla manualmente al sistema de Tramitación Digital (TD).
7. **Regla de Inmutabilidad de Stock:** El pedido no suma ni descuenta stock en ninguna de sus etapas de solicitud, revisión o aprobación. El stock solo se incrementa al recibir físicamente las existencias mediante una `OrdenEntrada` en el centro.

---

## 2. Flujo Operativo y Estados del Pedido

```
[ BORRADOR ] ──(Enviar)──► [ ENVIADO ] ──(Revisar)──► [ REVISADO / APROBADO ] ──(Exportar)──► [ ARCHIVO PARA TD ]
     │                         │                               │
 (Eliminar)                 (Anular)                        (Anular)
     ▼                         ▼                               ▼
[ ELIMINADO ]              [ ANULADO ]                     [ ANULADO ]
```

### Definición de Estados:
- **`BORRADOR`**: El centro está editando el pedido. Puede modificar cantidades, agregar/quitar ítems del catálogo de aseo, guardar cambios o cargar desde la plantilla habitual del centro.
- **`ENVIADO`**: El centro emitió formalmente el pedido hacia Adquisiciones. El centro ya no puede modificarlo. Se puede descargar el comprobante inicial en PDF o Excel.
- **`REVISADO`**: Adquisiciones evaluó el pedido, ajustó las cantidades aprobadas si correspondía y registró las observaciones de ajuste.
- **`ANULADO`**: Pedido cancelado por el solicitante o Adquisiciones con motivo explícito registrado en auditoría.

---

## 3. Modelo de Datos (Prisma Schema)

Se incorporan tres nuevos modelos en `prisma/schema.prisma`:

```prisma
model Pedido {
    id                      String                 @id @default(cuid()) @map("ID_Pedido") @db.VarChar(255)
    numero                  String                 @unique @map("Numero") @db.VarChar(50)
    tipo                    String                 @map("Tipo") @db.VarChar(50) // MENSUAL | SUPLEMENTARIO
    estado                  String                 @default("BORRADOR") @map("Estado") @db.VarChar(50) // BORRADOR | ENVIADO | REVISADO | ANULADO
    periodo                 String?                @map("Periodo") @db.VarChar(7) // AAAA-MM
    centroId                String                 @map("ID_Centro") @db.VarChar(255)
    bodegaId                String?                @map("ID_Bodega") @db.VarChar(255)
    usuarioSolicitanteId    String                 @map("ID_Usuario_Solicitante") @db.VarChar(255)
    fechaSolicitud          DateTime               @default(now()) @map("Fecha_Solicitud")
    observaciones           String?                @map("Observaciones") @db.VarChar(500)
    usuarioRevisionId       String?                @map("ID_Usuario_Revision") @db.VarChar(255)
    fechaRevision           DateTime?              @map("Fecha_Revision")
    observacionesRevision   String?                @map("Observaciones_Revision") @db.VarChar(500)

    centro                  Centro                 @relation(fields: [centroId], references: [id])
    bodega                  Bodega?                @relation(fields: [bodegaId], references: [id])
    usuarioSolicitante      Usuario                @relation("PedidoSolicitante", fields: [usuarioSolicitanteId], references: [id])
    usuarioRevision         Usuario?               @relation("PedidoRevisor", fields: [usuarioRevisionId], references: [id])
    detalles                PedidoDetalle[]

    @@index([centroId])
    @@index([estado])
    @@index([periodo])
    @@map("pedidos")
}

model PedidoDetalle {
    id                      String                 @id @default(cuid()) @map("ID_PedidoDetalle") @db.VarChar(255)
    pedidoId                String                 @map("ID_Pedido") @db.VarChar(255)
    productoId              Int                    @map("ID_Product")
    cantidadSolicitada      Int                    @map("Cantidad_Solicitada")
    cantidadAprobada        Int?                   @map("Cantidad_Aprobada")
    observacionAjuste       String?                @map("Observacion_Ajuste") @db.VarChar(255)
    stockActualMomento      Int?                   @map("Stock_Actual_Momento")
    stockMinimoMomento      Int?                   @map("Stock_Minimo_Momento")

    pedido                  Pedido                 @relation(fields: [pedidoId], references: [id], onDelete: Cascade)
    producto                Producto               @relation(fields: [productoId], references: [id])

    @@index([pedidoId])
    @@index([productoId])
    @@map("pedidos_detalle")
}

model PedidoPlantillaAseo {
    id                      String                 @id @default(cuid()) @map("ID_Plantilla") @db.VarChar(255)
    centroId                String                 @map("ID_Centro") @db.VarChar(255)
    productoId              Int                    @map("ID_Product")
    cantidadHabitual        Int                    @default(0) @map("Cantidad_Habitual")
    actualizadoEn           DateTime               @updatedAt @map("Actualizado_En")

    centro                  Centro                 @relation(fields: [centroId], references: [id])
    producto                Producto               @relation(fields: [productoId], references: [id])

    @@unique([centroId, productoId])
    @@map("pedidos_plantilla_aseo")
}
```

---

## 4. Matriz de Permisos y Roles

- **Crear / Editar Borrador / Enviar:**
  - `R01` (Administrador): En cualquier centro.
  - `R02` (Encargado de Centro): Únicamente en su centro asignado.
  - `R03` (Encargado de Bodega): Únicamente si tiene asignada la bodega del centro.
- **Revisar / Ajustar Cantidades / Aprobar:**
  - `R01` (Administrador / Adquisiciones Central).
- **Consultar Historial y Descargar PDF/Excel:**
  - Todo usuario autenticado dentro del alcance de su centro (`validarCentroBodegaEnAlcance`).

---

## 5. Reglas de Catálogo, Semáforos y Sugerencias (INV-21)

1. **Catálogo Exclusivo:**
   Solo se muestran y permiten productos activos (`estado === true`) donde `linea.toUpperCase() === "ASEO"`.
2. **Semáforo de Stock:**
   - **Rojo (`danger`):** `stockDisponible <= 0`.
   - **Amarillo (`warning`):** `stockDisponible > 0 && stockDisponible <= stockMinimo`.
   - **Verde (`success`):** `stockDisponible > stockMinimo`.
3. **Cálculo de Sugerencia:**
   - Si existe cantidad habitual en la plantilla del centro: sugiere la cantidad de la plantilla.
   - En caso contrario, si el stock está bajo el mínimo: sugiere `max(0, (stockMinimo * 2) - stockDisponible)`.

---

## 6. Generación de Archivos (INV-19 e INV-23)

- **Excel (`exceljs`):**
  - Encabezados institucionales con Corporación Municipal de Valparaíso, centro, fecha, período, tipo de pedido y número correlativo.
  - Columnas: Código, Descripción, Unidad, Stock en Centro, Stock Mínimo, Cantidad Solicitada, Cantidad Aprobada, Observación de Ajuste.
- **PDF (`pdfkit`):**
  - Documento vectorial formal en tamaño Carta.
  - Título, metadatos del pedido, tabla estilizada de ítems, totales, observaciones y bloque de firmas (Solicitante y Responsable de Adquisiciones).

