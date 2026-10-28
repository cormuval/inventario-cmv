-- CreateTable
CREATE TABLE `Centro` (
    `ID_Centro` VARCHAR(255) NOT NULL,
    `Nombre` VARCHAR(255) NOT NULL,
    `Estado` BOOLEAN NOT NULL DEFAULT true,

    PRIMARY KEY (`ID_Centro`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `Bodega` (
    `ID_Bodega` VARCHAR(255) NOT NULL,
    `Bodega` VARCHAR(255) NOT NULL,
    `ID_Centro` VARCHAR(255) NOT NULL,
    `Estado` BOOLEAN NOT NULL DEFAULT true,

    INDEX `Bodega_ID_Centro_idx`(`ID_Centro`),
    PRIMARY KEY (`ID_Bodega`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `Rol` (
    `ID_Rol` VARCHAR(255) NOT NULL,
    `Descripcion` VARCHAR(255) NOT NULL,

    PRIMARY KEY (`ID_Rol`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `Usuario` (
    `ID_User` VARCHAR(255) NOT NULL,
    `Nombre` VARCHAR(255) NOT NULL,
    `Ap_Paterno` VARCHAR(255) NULL,
    `Ap_Materno` VARCHAR(255) NULL,
    `Rol` VARCHAR(255) NOT NULL,
    `ID_Bodega` VARCHAR(255) NULL,
    `Telefono` VARCHAR(30) NULL,
    `Email` VARCHAR(255) NOT NULL,
    `ID_Centro` VARCHAR(255) NOT NULL,
    `Estado` BOOLEAN NOT NULL DEFAULT true,

    UNIQUE INDEX `Usuario_Email_key`(`Email`),
    INDEX `Usuario_Rol_idx`(`Rol`),
    INDEX `Usuario_ID_Centro_idx`(`ID_Centro`),
    INDEX `Usuario_ID_Bodega_idx`(`ID_Bodega`),
    PRIMARY KEY (`ID_User`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `Unidad` (
    `ID_Unidad` VARCHAR(255) NOT NULL,
    `Descripcion` VARCHAR(255) NOT NULL,

    UNIQUE INDEX `Unidad_Descripcion_key`(`Descripcion`),
    PRIMARY KEY (`ID_Unidad`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `Producto` (
    `ID_Product` INTEGER NOT NULL AUTO_INCREMENT,
    `Linea` VARCHAR(255) NOT NULL,
    `Descripcion` VARCHAR(255) NOT NULL,
    `Estado` BOOLEAN NOT NULL DEFAULT true,

    PRIMARY KEY (`ID_Product`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `OrdenEntrada` (
    `ID_OrdenEntrada` VARCHAR(255) NOT NULL,
    `Fecha` DATE NOT NULL,
    `ID_User` VARCHAR(255) NOT NULL,
    `Origen` VARCHAR(255) NOT NULL,
    `GuiaDespacho` VARCHAR(255) NULL,
    `ID_Centro` VARCHAR(255) NOT NULL,
    `ID_Bodega` VARCHAR(255) NOT NULL,
    `Codigo_Recepcion` VARCHAR(255) NULL,

    INDEX `OrdenEntrada_ID_User_idx`(`ID_User`),
    INDEX `OrdenEntrada_ID_Centro_idx`(`ID_Centro`),
    INDEX `OrdenEntrada_ID_Bodega_idx`(`ID_Bodega`),
    PRIMARY KEY (`ID_OrdenEntrada`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `OrdenEntradaDetalle` (
    `ID_Entrada` VARCHAR(255) NOT NULL,
    `ID_Product` INTEGER NOT NULL,
    `Categoria` VARCHAR(255) NOT NULL,
    `Fecha_Caducidad` DATE NOT NULL,
    `Cantidad` INTEGER NOT NULL,
    `Lote` VARCHAR(255) NOT NULL,
    `ID_OrdenEntrada` VARCHAR(255) NOT NULL,

    INDEX `OrdenEntradaDetalle_ID_Product_idx`(`ID_Product`),
    INDEX `OrdenEntradaDetalle_ID_OrdenEntrada_idx`(`ID_OrdenEntrada`),
    PRIMARY KEY (`ID_Entrada`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `OrdenSalida` (
    `ID_OrdenSalida` VARCHAR(255) NOT NULL,
    `Fecha` DATE NOT NULL,
    `ID_User` VARCHAR(255) NOT NULL,
    `ID_Bodega` VARCHAR(255) NOT NULL,
    `ID_Bodega_Destino` VARCHAR(255) NULL,
    `Tipo_Salida` VARCHAR(255) NOT NULL,
    `ID_Centro` VARCHAR(255) NOT NULL,
    `Destino` VARCHAR(255) NOT NULL,
    `Codigo_Salida` VARCHAR(255) NULL,
    `Enviar_Correo` BOOLEAN NOT NULL DEFAULT false,
    `Correo_Destino` VARCHAR(255) NULL,

    INDEX `OrdenSalida_ID_User_idx`(`ID_User`),
    INDEX `OrdenSalida_ID_Bodega_idx`(`ID_Bodega`),
    INDEX `OrdenSalida_ID_Bodega_Destino_idx`(`ID_Bodega_Destino`),
    INDEX `OrdenSalida_ID_Centro_idx`(`ID_Centro`),
    PRIMARY KEY (`ID_OrdenSalida`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `OrdenSalidaDetalle` (
    `ID_Detalle` VARCHAR(255) NOT NULL,
    `ID_Product` INTEGER NOT NULL,
    `Cantidad` INTEGER NOT NULL,
    `ID_OrdenSalida` VARCHAR(255) NOT NULL,
    `Lote` VARCHAR(255) NOT NULL,
    `Fecha_Caducidad` DATE NOT NULL,

    INDEX `OrdenSalidaDetalle_ID_Product_idx`(`ID_Product`),
    INDEX `OrdenSalidaDetalle_ID_OrdenSalida_idx`(`ID_OrdenSalida`),
    PRIMARY KEY (`ID_Detalle`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `Stock` (
    `ID_Stock` VARCHAR(255) NOT NULL,
    `ID_Product` INTEGER NOT NULL,
    `ID_Bodega` VARCHAR(255) NOT NULL,
    `Cantidad_Disponible` INTEGER NOT NULL DEFAULT 0,
    `Fecha_Ultima_Actualizacion` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `StockMinimo` INTEGER NOT NULL DEFAULT 0,
    `Lote` VARCHAR(255) NOT NULL,
    `Fecha_Caducidad` DATE NOT NULL,

    INDEX `Stock_ID_Bodega_idx`(`ID_Bodega`),
    UNIQUE INDEX `Stock_ID_Product_ID_Bodega_Lote_Fecha_Caducidad_key`(`ID_Product`, `ID_Bodega`, `Lote`, `Fecha_Caducidad`),
    PRIMARY KEY (`ID_Stock`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `Encargados_Bodegas` (
    `ID_EncargadoBodega` VARCHAR(255) NOT NULL,
    `ID_Encargado` VARCHAR(255) NOT NULL,
    `ID_Centro` VARCHAR(255) NOT NULL,
    `ID_Bodega` VARCHAR(255) NOT NULL,
    `Rol_Enc` VARCHAR(255) NOT NULL,
    `email_Enc` VARCHAR(255) NOT NULL,

    INDEX `Encargados_Bodegas_ID_Centro_idx`(`ID_Centro`),
    INDEX `Encargados_Bodegas_ID_Bodega_idx`(`ID_Bodega`),
    INDEX `Encargados_Bodegas_Rol_Enc_idx`(`Rol_Enc`),
    UNIQUE INDEX `Encargados_Bodegas_ID_Encargado_ID_Centro_ID_Bodega_key`(`ID_Encargado`, `ID_Centro`, `ID_Bodega`),
    PRIMARY KEY (`ID_EncargadoBodega`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `logs` (
    `ID_Log` VARCHAR(255) NOT NULL,
    `ID_User` VARCHAR(255) NULL,
    `ID_Centro` VARCHAR(255) NULL,
    `ID_Bodega` VARCHAR(255) NULL,
    `Accion` VARCHAR(255) NOT NULL,
    `Entidad` VARCHAR(255) NOT NULL,
    `Entidad_ID` VARCHAR(255) NULL,
    `Detalle` JSON NULL,
    `Fecha` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),

    INDEX `logs_ID_User_idx`(`ID_User`),
    INDEX `logs_ID_Centro_idx`(`ID_Centro`),
    INDEX `logs_ID_Bodega_idx`(`ID_Bodega`),
    INDEX `logs_Fecha_idx`(`Fecha`),
    INDEX `logs_Entidad_idx`(`Entidad`),
    PRIMARY KEY (`ID_Log`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- AddForeignKey
ALTER TABLE `Bodega` ADD CONSTRAINT `Bodega_ID_Centro_fkey` FOREIGN KEY (`ID_Centro`) REFERENCES `Centro`(`ID_Centro`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `Usuario` ADD CONSTRAINT `Usuario_Rol_fkey` FOREIGN KEY (`Rol`) REFERENCES `Rol`(`ID_Rol`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `Usuario` ADD CONSTRAINT `Usuario_ID_Bodega_fkey` FOREIGN KEY (`ID_Bodega`) REFERENCES `Bodega`(`ID_Bodega`) ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `Usuario` ADD CONSTRAINT `Usuario_ID_Centro_fkey` FOREIGN KEY (`ID_Centro`) REFERENCES `Centro`(`ID_Centro`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `OrdenEntrada` ADD CONSTRAINT `OrdenEntrada_ID_User_fkey` FOREIGN KEY (`ID_User`) REFERENCES `Usuario`(`ID_User`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `OrdenEntrada` ADD CONSTRAINT `OrdenEntrada_ID_Centro_fkey` FOREIGN KEY (`ID_Centro`) REFERENCES `Centro`(`ID_Centro`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `OrdenEntrada` ADD CONSTRAINT `OrdenEntrada_ID_Bodega_fkey` FOREIGN KEY (`ID_Bodega`) REFERENCES `Bodega`(`ID_Bodega`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `OrdenEntradaDetalle` ADD CONSTRAINT `OrdenEntradaDetalle_ID_Product_fkey` FOREIGN KEY (`ID_Product`) REFERENCES `Producto`(`ID_Product`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `OrdenEntradaDetalle` ADD CONSTRAINT `OrdenEntradaDetalle_ID_OrdenEntrada_fkey` FOREIGN KEY (`ID_OrdenEntrada`) REFERENCES `OrdenEntrada`(`ID_OrdenEntrada`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `OrdenSalida` ADD CONSTRAINT `OrdenSalida_ID_User_fkey` FOREIGN KEY (`ID_User`) REFERENCES `Usuario`(`ID_User`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `OrdenSalida` ADD CONSTRAINT `OrdenSalida_ID_Bodega_fkey` FOREIGN KEY (`ID_Bodega`) REFERENCES `Bodega`(`ID_Bodega`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `OrdenSalida` ADD CONSTRAINT `OrdenSalida_ID_Bodega_Destino_fkey` FOREIGN KEY (`ID_Bodega_Destino`) REFERENCES `Bodega`(`ID_Bodega`) ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `OrdenSalida` ADD CONSTRAINT `OrdenSalida_ID_Centro_fkey` FOREIGN KEY (`ID_Centro`) REFERENCES `Centro`(`ID_Centro`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `OrdenSalidaDetalle` ADD CONSTRAINT `OrdenSalidaDetalle_ID_Product_fkey` FOREIGN KEY (`ID_Product`) REFERENCES `Producto`(`ID_Product`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `OrdenSalidaDetalle` ADD CONSTRAINT `OrdenSalidaDetalle_ID_OrdenSalida_fkey` FOREIGN KEY (`ID_OrdenSalida`) REFERENCES `OrdenSalida`(`ID_OrdenSalida`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `Stock` ADD CONSTRAINT `Stock_ID_Product_fkey` FOREIGN KEY (`ID_Product`) REFERENCES `Producto`(`ID_Product`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `Stock` ADD CONSTRAINT `Stock_ID_Bodega_fkey` FOREIGN KEY (`ID_Bodega`) REFERENCES `Bodega`(`ID_Bodega`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `Encargados_Bodegas` ADD CONSTRAINT `Encargados_Bodegas_ID_Encargado_fkey` FOREIGN KEY (`ID_Encargado`) REFERENCES `Usuario`(`ID_User`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `Encargados_Bodegas` ADD CONSTRAINT `Encargados_Bodegas_ID_Centro_fkey` FOREIGN KEY (`ID_Centro`) REFERENCES `Centro`(`ID_Centro`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `Encargados_Bodegas` ADD CONSTRAINT `Encargados_Bodegas_ID_Bodega_fkey` FOREIGN KEY (`ID_Bodega`) REFERENCES `Bodega`(`ID_Bodega`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `Encargados_Bodegas` ADD CONSTRAINT `Encargados_Bodegas_Rol_Enc_fkey` FOREIGN KEY (`Rol_Enc`) REFERENCES `Rol`(`ID_Rol`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `logs` ADD CONSTRAINT `logs_ID_User_fkey` FOREIGN KEY (`ID_User`) REFERENCES `Usuario`(`ID_User`) ON DELETE SET NULL ON UPDATE CASCADE;

