import type * as React from "react";

// components
import { Table, Td, Th } from "@/shared/components/ui/table";

// utils
import type { TotalAgrupado } from "@/modules/orden-salida/utils/salidas-producto-consulta";
import { formatNumber } from "@/shared/utils/format";

function TablaTotales({ titulo, filas }: { titulo: string; filas: TotalAgrupado[] }): React.ReactElement {
    return (
        <Table>
            <thead>
                <tr>
                    <Th>{titulo}</Th>
                    <Th className="text-right">Unidades</Th>
                </tr>
            </thead>
            <tbody>
                {filas.map((fila) => (
                    <tr key={fila.clave}>
                        <Td>{fila.etiqueta}</Td>
                        <Td className="text-right">{formatNumber(fila.cantidad)}</Td>
                    </tr>
                ))}
            </tbody>
        </Table>
    );
}

export function SalidasProductoResumen({
    total,
    porBodega,
    porTipo
}: {
    total: number;
    porBodega: TotalAgrupado[];
    porTipo: TotalAgrupado[];
}): React.ReactElement {
    return (
        <div className="grid gap-4 lg:grid-cols-[12rem_1fr_1fr]">
            <div className="rounded-md border bg-teal-50 p-4">
                <p className="text-xs uppercase text-teal-800">Total salido</p>
                <p className="text-3xl font-semibold text-teal-900">{formatNumber(total)}</p>
            </div>
            <TablaTotales titulo="Bodega" filas={porBodega} />
            <TablaTotales titulo="Tipo de salida" filas={porTipo} />
        </div>
    );
}
