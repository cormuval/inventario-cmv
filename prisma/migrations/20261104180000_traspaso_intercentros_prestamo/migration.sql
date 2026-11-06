-- AlterTable
ALTER TABLE `OrdenSalida` ADD COLUMN `ID_Centro_Destino` VARCHAR(255) NULL,
    ADD COLUMN `Estado_Prestamo` VARCHAR(50) NULL,
    ADD COLUMN `Codigo_Recepcion` VARCHAR(10) NULL,
    ADD COLUMN `Fecha_Limite_Recepcion` DATETIME(3) NULL,
    ADD COLUMN `Fecha_Recepcion` DATETIME(3) NULL,
    ADD COLUMN `ID_Usuario_Receptor` VARCHAR(255) NULL,
    ADD COLUMN `Observacion_Recepcion` VARCHAR(255) NULL,
    ADD COLUMN `Advertencia_Caducidad_Aceptada` BOOLEAN NOT NULL DEFAULT false;

-- CreateIndex
CREATE UNIQUE INDEX `OrdenSalida_Codigo_Recepcion_key` ON `OrdenSalida`(`Codigo_Recepcion`);

-- CreateIndex
CREATE INDEX `OrdenSalida_ID_Usuario_Receptor_idx` ON `OrdenSalida`(`ID_Usuario_Receptor`);

-- CreateIndex
CREATE INDEX `OrdenSalida_ID_Centro_Destino_idx` ON `OrdenSalida`(`ID_Centro_Destino`);

-- CreateIndex
CREATE INDEX `OrdenSalida_Estado_Prestamo_idx` ON `OrdenSalida`(`Estado_Prestamo`);

-- AddForeignKey
ALTER TABLE `OrdenSalida` ADD CONSTRAINT `OrdenSalida_ID_Usuario_Receptor_fkey` FOREIGN KEY (`ID_Usuario_Receptor`) REFERENCES `Usuario`(`ID_User`) ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `OrdenSalida` ADD CONSTRAINT `OrdenSalida_ID_Centro_Destino_fkey` FOREIGN KEY (`ID_Centro_Destino`) REFERENCES `Centro`(`ID_Centro`) ON DELETE SET NULL ON UPDATE CASCADE;
