"use client";

import type * as React from "react";
import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Loader2 } from "lucide-react";
import { toast } from "sonner";

// actions
import { anularPedidoAction } from "@/modules/pedidos/actions/pedidos.action";

// components
import { Button } from "@/shared/components/ui/button";
import { Input } from "@/shared/components/ui/input";
import { Table, Td, Th } from "@/shared/components/ui/table";

// utils
import { formatNumber } from "@/shared/utils/format";

interface PedidoDetalleProps {
    pedido: {
        id: string;
        estado: string;
        detalles: Array<{
            id: string;
            productoId: number;
            cantidadSolicitada: number;
            stockActualMomento: number | null;
            producto: { descripcion: string };
        }>;
    };
    puedeAnular: boolean;
    /** En un borrador editable la tabla ya la muestra el formulario: solo se ofrece anular. */
    mostrarDetalle?: boolean;
}

export function PedidoDetalle({ pedido, puedeAnular, mostrarDetalle = true }: PedidoDetalleProps): React.ReactElement {
    const router = useRouter();
    const [isPending, startTransition] = useTransition();
    const [anulando, setAnulando] = useState(false);
    const [motivo, setMotivo] = useState("");

    const totalSolicitado = pedido.detalles.reduce((acc, d) => acc + d.cantidadSolicitada, 0);

    function confirmarAnulacion(): void {
        if (motivo.trim().length < 5) {
            toast.error("Indica el motivo de la anulación (mínimo 5 caracteres).");
            return;
        }
        startTransition(async () => {
            try {
                const res = await anularPedidoAction(pedido.id, motivo.trim());
                if (res.ok) {
                    toast.success(res.message);
                    setAnulando(false);
                    router.refresh();
                } else {
                    toast.error(res.message);
                }
            } catch {
                toast.error("No fue posible anular el pedido.");
            }
        });
    }

    return (
        <div className="space-y-4">
            {mostrarDetalle ? (
            <div className="overflow-x-auto rounded-md border">
                <Table>
                    <thead>
                        <tr>
                            <Th>Cód.</Th>
                            <Th>Insumo de aseo</Th>
                            <Th className="text-right">Stock al pedir</Th>
                            <Th className="text-right">Cantidad solicitada</Th>
                        </tr>
                    </thead>
                    <tbody>
                        {pedido.detalles.map((d) => (
                            <tr key={d.id}>
                                <Td className="font-mono text-xs">{d.productoId}</Td>
                                <Td className="text-sm font-medium">{d.producto.descripcion}</Td>
                                <Td className="text-right text-xs text-muted-foreground">
                                    {d.stockActualMomento === null ? "—" : formatNumber(d.stockActualMomento)}
                                </Td>
                                <Td className="text-right font-semibold">{formatNumber(d.cantidadSolicitada)}</Td>
                            </tr>
                        ))}
                        {pedido.detalles.length === 0 ? (
                            <tr>
                                <Td colSpan={4} className="text-muted-foreground">
                                    El pedido no tiene productos.
                                </Td>
                            </tr>
                        ) : null}
                    </tbody>
                </Table>
            </div>
            ) : null}

            <div className="flex flex-wrap items-center justify-between gap-3 text-sm">
                {mostrarDetalle ? (
                    <span>
                        Total solicitado: <strong>{formatNumber(totalSolicitado)}</strong> unidades en {pedido.detalles.length} productos
                    </span>
                ) : (
                    <span className="text-muted-foreground">¿Ya no necesitas este borrador?</span>
                )}
                {puedeAnular && pedido.estado !== "ANULADO" && !anulando ? (
                    <Button type="button" variant="outline" size="sm" onClick={() => setAnulando(true)}>
                        Anular pedido
                    </Button>
                ) : null}
            </div>

            {anulando ? (
                <div className="space-y-3 rounded-lg border border-rose-200 bg-rose-50/60 p-3">
                    <label className="block space-y-1 text-sm font-medium">
                        <span>Motivo de la anulación</span>
                        <Input
                            value={motivo}
                            maxLength={255}
                            placeholder="Ej.: pedido duplicado, cantidades erróneas"
                            onChange={(event) => setMotivo(event.target.value)}
                        />
                    </label>
                    <div className="flex justify-end gap-2">
                        <Button type="button" variant="ghost" size="sm" onClick={() => setAnulando(false)} disabled={isPending}>
                            Cancelar
                        </Button>
                        <Button type="button" size="sm" onClick={confirmarAnulacion} disabled={isPending}>
                            {isPending ? <Loader2 className="mr-1.5 h-4 w-4 animate-spin" /> : null}
                            Confirmar anulación
                        </Button>
                    </div>
                </div>
            ) : null}
        </div>
    );
}
