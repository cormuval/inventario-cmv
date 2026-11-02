import type * as React from "react";

// components
import { Table, Td, Th } from "@/shared/components/ui/table";

// utils
import type { ColumnaMes } from "@/modules/reporte/utils/periodo";
import type { FilaReporte } from "@/modules/reporte/utils/reporte-consulta";
import { formatDate, formatNumber } from "@/shared/utils/format";

export function ReporteTabla({ filas, columnas }: { filas: FilaReporte[]; columnas: ColumnaMes[] }): React.ReactElement {
    return (
        <Table>
            <thead>
                <tr>
                    <Th>Centro</Th>
                    <Th>Bodega</Th>
                    <Th>Producto</Th>
                    <Th>Línea</Th>
                    <Th className="text-right">Stock actual</Th>
                    <Th>Últ. actualización</Th>
                    {columnas.map((columna) => (
                        <Th key={columna.clave} className="text-right">
                            {columna.etiqueta}
                        </Th>
                    ))}
                    <Th className="text-right">Consumo período</Th>
                </tr>
            </thead>
            <tbody>
                {filas.map((fila) => (
                    <tr key={`${fila.bodegaId}:${fila.productoId}`}>
                        <Td>{fila.centro}</Td>
                        <Td>{fila.bodega}</Td>
                        <Td>{fila.descripcion} #{fila.productoId}</Td>
                        <Td>{fila.linea}</Td>
                        <Td className="text-right">{formatNumber(fila.stockActual)}</Td>
                        <Td>{fila.ultimaActualizacion ? formatDate(fila.ultimaActualizacion) : "—"}</Td>
                        {columnas.map((columna) => (
                            <Td key={columna.clave} className="text-right">
                                {formatNumber(fila.meses[columna.clave] ?? 0)}
                            </Td>
                        ))}
                        <Td className="text-right font-semibold">{formatNumber(fila.consumoPeriodo)}</Td>
                    </tr>
                ))}
                {filas.length === 0 ? (
                    <tr>
                        <Td colSpan={7 + columnas.length} className="text-muted-foreground">
                            No hay stock ni consumo para los filtros seleccionados.
                        </Td>
                    </tr>
                ) : null}
            </tbody>
        </Table>
    );
}
