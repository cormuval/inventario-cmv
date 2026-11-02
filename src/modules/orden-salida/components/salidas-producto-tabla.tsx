import type * as React from "react";

// actions
import type { LineaSalidaProducto } from "@/modules/orden-salida/actions/salidas-producto.action";

// components
import { BotonDescargarComprobante } from "@/modules/orden-salida/components/boton-descargar-comprobante";
import { Table, Td, Th } from "@/shared/components/ui/table";

// utils
import { formatDate, formatNumber } from "@/shared/utils/format";

export function SalidasProductoTabla({ lineas }: { lineas: LineaSalidaProducto[] }): React.ReactElement {
    return (
        <Table>
            <thead>
                <tr>
                    <Th>Fecha</Th>
                    <Th>Bodega</Th>
                    <Th>Tipo</Th>
                    <Th>Destino</Th>
                    <Th>Lote</Th>
                    <Th className="text-right">Cantidad</Th>
                    <Th>Usuario</Th>
                    <Th className="text-right">Comprobante</Th>
                </tr>
            </thead>
            <tbody>
                {lineas.map((linea) => (
                    <tr key={linea.id}>
                        <Td>{formatDate(linea.fecha)}</Td>
                        <Td>{linea.bodegaNombre}</Td>
                        <Td>{linea.tipoSalida}</Td>
                        <Td>{linea.destino}</Td>
                        <Td>{linea.lote}</Td>
                        <Td className="text-right">{formatNumber(linea.cantidad)}</Td>
                        <Td>{linea.usuarioNombre}</Td>
                        <Td className="text-right">
                            <BotonDescargarComprobante ordenId={linea.ordenId} size="sm" label="PDF" />
                        </Td>
                    </tr>
                ))}
                {lineas.length === 0 ? (
                    <tr>
                        <Td colSpan={8} className="text-muted-foreground">
                            No hay salidas de este producto para los filtros seleccionados.
                        </Td>
                    </tr>
                ) : null}
            </tbody>
        </Table>
    );
}
