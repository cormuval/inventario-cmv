-- AlterTable
ALTER TABLE `Bodega` ADD COLUMN `Tipo` ENUM('ASEO', 'CLINICA') NOT NULL DEFAULT 'CLINICA';

-- Migrate existing warehouses: names containing ASEO are classified as ASEO, all others remain CLINICA.
UPDATE `Bodega`
SET `Tipo` = 'ASEO'
WHERE UPPER(`Bodega`) LIKE '%ASEO%';
