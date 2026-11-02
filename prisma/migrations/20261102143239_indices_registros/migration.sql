-- CreateIndex
CREATE INDEX `OrdenEntrada_Fecha_idx` ON `OrdenEntrada`(`Fecha`);

-- CreateIndex
CREATE INDEX `OrdenSalida_Fecha_idx` ON `OrdenSalida`(`Fecha`);

-- CreateIndex
CREATE INDEX `OrdenSalidaDetalle_ID_Product_ID_OrdenSalida_idx` ON `OrdenSalidaDetalle`(`ID_Product`, `ID_OrdenSalida`);
