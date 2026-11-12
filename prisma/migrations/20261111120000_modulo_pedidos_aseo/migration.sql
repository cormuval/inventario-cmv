-- CreateTable
CREATE TABLE `pedidos` (
    `ID_Pedido` VARCHAR(255) NOT NULL,
    `Numero` VARCHAR(50) NOT NULL,
    `Tipo` VARCHAR(50) NOT NULL,
    `Estado` VARCHAR(50) NOT NULL DEFAULT 'BORRADOR',
    `Periodo` VARCHAR(7) NULL,
    `ID_Centro` VARCHAR(255) NOT NULL,
    `ID_Bodega` VARCHAR(255) NULL,
    `ID_Usuario_Solicitante` VARCHAR(255) NOT NULL,
    `Fecha_Solicitud` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `Observaciones` VARCHAR(500) NULL,
    `Fecha_Finalizacion` DATETIME(3) NULL,
    `Fecha_Anulacion` DATETIME(3) NULL,
    `Motivo_Anulacion` VARCHAR(255) NULL,

    UNIQUE INDEX `pedidos_Numero_key`(`Numero`),
    INDEX `pedidos_ID_Centro_idx`(`ID_Centro`),
    INDEX `pedidos_Estado_idx`(`Estado`),
    INDEX `pedidos_Periodo_idx`(`Periodo`),
    PRIMARY KEY (`ID_Pedido`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `pedidos_detalle` (
    `ID_PedidoDetalle` VARCHAR(255) NOT NULL,
    `ID_Pedido` VARCHAR(255) NOT NULL,
    `ID_Product` INTEGER NOT NULL,
    `Cantidad_Solicitada` INTEGER NOT NULL,
    `Stock_Actual_Momento` INTEGER NULL,

    INDEX `pedidos_detalle_ID_Product_idx`(`ID_Product`),
    UNIQUE INDEX `pedidos_detalle_ID_Pedido_ID_Product_key`(`ID_Pedido`, `ID_Product`),
    PRIMARY KEY (`ID_PedidoDetalle`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `pedidos_plantilla_aseo` (
    `ID_Plantilla` VARCHAR(255) NOT NULL,
    `ID_Centro` VARCHAR(255) NOT NULL,
    `ID_Product` INTEGER NOT NULL,
    `Cantidad_Habitual` INTEGER NOT NULL DEFAULT 0,
    `Actualizado_En` DATETIME(3) NOT NULL,

    UNIQUE INDEX `pedidos_plantilla_aseo_ID_Centro_ID_Product_key`(`ID_Centro`, `ID_Product`),
    PRIMARY KEY (`ID_Plantilla`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- AddForeignKey
ALTER TABLE `pedidos` ADD CONSTRAINT `pedidos_ID_Centro_fkey` FOREIGN KEY (`ID_Centro`) REFERENCES `Centro`(`ID_Centro`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `pedidos` ADD CONSTRAINT `pedidos_ID_Bodega_fkey` FOREIGN KEY (`ID_Bodega`) REFERENCES `Bodega`(`ID_Bodega`) ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `pedidos` ADD CONSTRAINT `pedidos_ID_Usuario_Solicitante_fkey` FOREIGN KEY (`ID_Usuario_Solicitante`) REFERENCES `Usuario`(`ID_User`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `pedidos_detalle` ADD CONSTRAINT `pedidos_detalle_ID_Pedido_fkey` FOREIGN KEY (`ID_Pedido`) REFERENCES `pedidos`(`ID_Pedido`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `pedidos_detalle` ADD CONSTRAINT `pedidos_detalle_ID_Product_fkey` FOREIGN KEY (`ID_Product`) REFERENCES `Producto`(`ID_Product`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `pedidos_plantilla_aseo` ADD CONSTRAINT `pedidos_plantilla_aseo_ID_Centro_fkey` FOREIGN KEY (`ID_Centro`) REFERENCES `Centro`(`ID_Centro`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `pedidos_plantilla_aseo` ADD CONSTRAINT `pedidos_plantilla_aseo_ID_Product_fkey` FOREIGN KEY (`ID_Product`) REFERENCES `Producto`(`ID_Product`) ON DELETE RESTRICT ON UPDATE CASCADE;

