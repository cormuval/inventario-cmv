import type * as React from "react";

// actions
import type { RegistroEntradaFila } from "@/modules/orden-entrada/actions/registros-entrada.action";

// components
import { VerDetalleOrden } from "@/shared/components/inventario/ver-detalle-orden";
import { Table, Td, Th } from "@/shared/components/ui/table";

// utils
import { formatDate } from "@/shared/utils/format";
import { formatearResumenDetalles } from "@/shared/utils/registros";

export function RegistrosEntradaTabla({ filas }: { filas: RegistroEntradaFila[] }): React.ReactElement {
    return (
        <Table>
            <thead>
                <tr>
                    <Th>Fecha</Th>
                    <Th>Origen</Th>
                    <Th>Bodega</Th>
                    <Th>Usuario</Th>
                    <Th>Productos</Th>
                    <Th className="text-right">Acciones</Th>
                </tr>
            </thead>
            <tbody>
                {filas.map((fila) => (
                    <tr key={fila.id}>
                        <Td>{formatDate(fila.fecha)}</Td>
                        <Td>{fila.origen}</Td>
                        <Td>{fila.bodegaNombre}</Td>
                        <Td>{fila.usuarioNombre}</Td>
                        <Td className="whitespace-nowrap">{formatearResumenDetalles(fila)}</Td>
                        <Td className="text-right">
                            <VerDetalleOrden ordenId={fila.id} tipo="entrada" />
                        </Td>
                    </tr>
                ))}
                {filas.length === 0 ? (
                    <tr>
                        <Td colSpan={6} className="text-muted-foreground">
                            No hay entradas para los filtros seleccionados.
                        </Td>
                    </tr>
                ) : null}
            </tbody>
        </Table>
    );
}
