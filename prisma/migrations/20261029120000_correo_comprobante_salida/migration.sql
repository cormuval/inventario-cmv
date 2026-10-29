-- AlterTable
ALTER TABLE `OrdenSalida` ADD COLUMN `Error_Envio_Correo` VARCHAR(500) NULL,
    ADD COLUMN `Fecha_Envio_Correo` DATETIME(3) NULL;
