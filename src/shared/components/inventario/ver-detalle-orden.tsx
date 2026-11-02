"use client";

import type * as React from "react";
import { useState } from "react";

// actions
import { obtenerDetalleOrdenEntrada } from "@/modules/orden-entrada/actions/registros-entrada.action";
import { obtenerDetalleOrdenSalida } from "@/modules/orden-salida/actions/registros-salida.action";

// components
import { SimpleModal } from "@/shared/components/ui/simple-modal";
import { Table, Td, Th } from "@/shared/components/ui/table";

// types
import type { DetalleOrdenResultado } from "@/shared/types/registros";

// utils
import { formatDate, formatNumber } from "@/shared/utils/format";

type TipoOrden = "entrada" | "salida";

const CARGADORES: Record<TipoOrden, (ordenId: string) => Promise<DetalleOrdenResultado>> = {
    entrada: obtenerDetalleOrdenEntrada,
    salida: obtenerDetalleOrdenSalida
};

export function VerDetalleOrden({ ordenId, tipo }: { ordenId: string; tipo: TipoOrden }): React.ReactElement {
    const [resultado, setResultado] = useState<DetalleOrdenResultado | null>(null);

    async function cargar(abierto: boolean): Promise<void> {
        if (!abierto || resultado?.ok) {
            return;
        }
        setResultado(null);
        setResultado(await CARGADORES[tipo](ordenId));
    }

    return (
        <SimpleModal title="Detalle de la orden" triggerLabel="Ver" onOpenChange={(abierto) => void cargar(abierto)}>
            {resultado === null ? (
                <p className="text-sm text-muted-foreground">Cargando detalle…</p>
            ) : !resultado.ok ? (
                <p className="text-sm text-destructive">{resultado.message}</p>
            ) : (
                <Table>
                    <thead>
                        <tr>
                            <Th>Producto</Th>
                            <Th>Lote</Th>
                            <Th>Caducidad</Th>
                            <Th className="text-right">Cantidad</Th>
                        </tr>
                    </thead>
                    <tbody>
                        {resultado.lineas.map((linea) => (
                            <tr key={linea.id}>
                                <Td>{linea.producto} #{linea.productoId}</Td>
                                <Td>{linea.lote}</Td>
                                <Td>{formatDate(linea.fechaCaducidad)}</Td>
                                <Td className="text-right">{formatNumber(linea.cantidad)}</Td>
                            </tr>
                        ))}
                    </tbody>
                </Table>
            )}
        </SimpleModal>
    );
}
