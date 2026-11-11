"use client";

import type * as React from "react";
import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { AlertCircle, Ban, CheckCircle, Loader2 } from "lucide-react";
import { toast } from "sonner";

// actions
import {
    anularPedidoAction,
    revisarPedidoAction
} from "@/modules/pedidos/actions/pedidos.action";

// components
import { Button } from "@/shared/components/ui/button";
import { Input } from "@/shared/components/ui/input";
import { Table, Td, Th } from "@/shared/components/ui/table";

interface PedidoRevisionFormProps {
    pedido: {
        id: string;
        numero: string;
        tipo: string;
        estado: string;
        periodo?: string | null;
        centro: { nombre: string };
        bodega?: { nombre: string } | null;
        observaciones?: string | null;
        detalles: Array<{
            id: string;
            productoId: number;
            producto: { descripcion: string; linea: string };
            cantidadSolicitada: number;
            cantidadAprobada?: number | null;
            observacionAjuste?: string | null;
            stockActualMomento?: number | null;
            stockMinimoMomento?: number | null;
        }>;
    };
    esRevisor: boolean;
}

export function PedidoRevisionForm({ pedido, esRevisor }: PedidoRevisionFormProps): React.ReactElement {
    const router = useRouter();
    const [isPending, startTransition] = useTransition();

    const [aprobaciones, setAprobaciones] = useState<Record<string, number>>(() => {
        const mapa: Record<string, number> = {};
        for (const d of pedido.detalles) {
            mapa[d.id] = d.cantidadAprobada !== null && d.cantidadAprobada !== undefined
                ? d.cantidadAprobada
                : d.cantidadSolicitada;
        }
        return mapa;
    });

    const [observacionesAjuste, setObservacionesAjuste] = useState<Record<string, string>>(() => {
        const mapa: Record<string, string> = {};
        for (const d of pedido.detalles) {
            mapa[d.id] = d.observacionAjuste ?? "";
        }
        return mapa;
    });

    const [observacionesGenerales, setObservacionesGenerales] = useState("");
    const [motivoAnulacion, setMotivoAnulacion] = useState("");
    const [mostrarModalAnular, setMostrarModalAnular] = useState(false);

    const puedeRevisar = esRevisor && pedido.estado === "ENVIADO";

    function cambiarCantidadAprobada(id: string, valor: string): void {
        const num = parseInt(valor, 10);
        setAprobaciones((prev) => ({
            ...prev,
            [id]: isNaN(num) || num < 0 ? 0 : num
        }));
    }

    function cambiarObservacionAjuste(id: string, valor: string): void {
        setObservacionesAjuste((prev) => ({
            ...prev,
            [id]: valor
        }));
    }

    async function ejecutarAprobacion(): Promise<void> {
        // Validar observaciones obligatorias cuando se ajusta cantidad
        for (const d of pedido.detalles) {
            const aprobada = aprobaciones[d.id] ?? d.cantidadSolicitada;
            if (aprobada !== d.cantidadSolicitada) {
                const obs = observacionesAjuste[d.id]?.trim();
                if (!obs || obs.length < 3) {
                    toast.error(`Debe justificar el ajuste para: ${d.producto.descripcion}`);
                    return;
                }
            }
        }

        startTransition(async () => {
            const ajustes = pedido.detalles.map((d) => ({
                detalleId: d.id,
                cantidadAprobada: aprobaciones[d.id] ?? d.cantidadSolicitada,
                observacionAjuste: observacionesAjuste[d.id]?.trim() || null
            }));

            const res = await revisarPedidoAction({
                pedidoId: pedido.id,
                observacionesRevision: observacionesGenerales || null,
                ajustes
            });

            if (res.ok) {
                toast.success(res.message);
                router.refresh();
            } else {
                toast.error(res.message);
            }
        });
    }

    async function ejecutarAnulacion(): Promise<void> {
        if (!motivoAnulacion.trim() || motivoAnulacion.trim().length < 5) {
            toast.error("Debe ingresar un motivo de anulación detallado (mínimo 5 caracteres).");
            return;
        }

        startTransition(async () => {
            const res = await anularPedidoAction(pedido.id, motivoAnulacion.trim());
            if (res.ok) {
                toast.success(res.message);
                setMostrarModalAnular(false);
                router.refresh();
            } else {
                toast.error(res.message);
            }
        });
    }

    const totalSolicitado = pedido.detalles.reduce((acc, d) => acc + d.cantidadSolicitada, 0);
    const totalAprobado = pedido.detalles.reduce((acc, d) => acc + (aprobaciones[d.id] ?? d.cantidadSolicitada), 0);

    return (
        <div className="space-y-6">
            <div className="overflow-x-auto rounded-md border">
                <Table>
                    <thead>
                        <tr>
                            <Th>Cód.</Th>
                            <Th>Insumo de Aseo</Th>
                            <Th className="text-right">Stock al Pedir</Th>
                            <Th className="text-right">Stock Mínimo</Th>
                            <Th className="text-right">Cant. Solicitada</Th>
                            <Th className="w-36 text-right">Cant. Aprobada</Th>
                            <Th className="w-64">Justificación de Ajuste</Th>
                        </tr>
                    </thead>
                    <tbody>
                        {pedido.detalles.map((d) => {
                            const cantAprobada = aprobaciones[d.id] ?? d.cantidadSolicitada;
                            const obs = observacionesAjuste[d.id] ?? "";
                            const fueModificado = cantAprobada !== d.cantidadSolicitada;

                            return (
                                <tr
                                    key={d.id}
                                    className={`transition-colors ${fueModificado ? "bg-amber-50/60" : "hover:bg-muted/30"}`}
                                >
                                    <Td className="font-mono text-xs">{d.productoId}</Td>
                                    <Td className="font-medium text-sm">
                                        <div>
                                            <span>{d.producto.descripcion}</span>
                                            {fueModificado ? (
                                                <span className="block text-[11px] text-amber-700 font-semibold">
                                                    (Modificado de {d.cantidadSolicitada} a {cantAprobada})
                                                </span>
                                            ) : null}
                                        </div>
                                    </Td>
                                    <Td className="text-right text-xs text-muted-foreground">
                                        {d.stockActualMomento ?? "—"}
                                    </Td>
                                    <Td className="text-right text-xs text-muted-foreground">
                                        {d.stockMinimoMomento ?? "—"}
                                    </Td>
                                    <Td className="text-right font-semibold text-sm">
                                        {d.cantidadSolicitada}
                                    </Td>
                                    <Td className="text-right">
                                        {puedeRevisar ? (
                                            <Input
                                                type="number"
                                                min={0}
                                                className={`text-right font-bold w-24 ml-auto ${
                                                    fueModificado ? "border-amber-500 text-amber-900 bg-amber-100/50" : ""
                                                }`}
                                                value={cantAprobada}
                                                onChange={(e) => cambiarCantidadAprobada(d.id, e.target.value)}
                                            />
                                        ) : (
                                            <span className="font-bold text-sm">
                                                {d.cantidadAprobada ?? d.cantidadSolicitada}
                                            </span>
                                        )}
                                    </Td>
                                    <Td>
                                        {puedeRevisar ? (
                                            <Input
                                                placeholder={fueModificado ? "Motivo obligatorio del ajuste..." : "Opcional"}
                                                className={`text-xs ${
                                                    fueModificado && !obs.trim() ? "border-rose-400 bg-rose-50" : ""
                                                }`}
                                                value={obs}
                                                onChange={(e) => cambiarObservacionAjuste(d.id, e.target.value)}
                                            />
                                        ) : (
                                            <span className="text-xs text-muted-foreground italic">
                                                {d.observacionAjuste || "—"}
                                            </span>
                                        )}
                                    </Td>
                                </tr>
                            );
                        })}
                    </tbody>
                </Table>
            </div>

            <div className="flex flex-wrap items-center justify-between gap-4 rounded-md border bg-muted/20 p-3 text-sm">
                <div>
                    Total Solicitado: <strong>{totalSolicitado}</strong> unidades
                </div>
                <div className="text-base font-bold text-emerald-700">
                    Total Aprobado: {totalAprobado} unidades
                </div>
            </div>

            {puedeRevisar ? (
                <div className="space-y-4 rounded-lg border bg-slate-50 p-4">
                    <h4 className="font-semibold text-sm">Resolución de Adquisiciones</h4>
                    <label className="block space-y-1 text-sm font-medium">
                        <span>Observaciones Generales de Revisión</span>
                        <textarea
                            rows={2}
                            className="w-full rounded-md border border-input bg-background p-2 text-sm focus:outline-none focus:ring-2 focus:ring-ring"
                            placeholder="Comentarios para el centro solicitante o constancia de compras..."
                            value={observacionesGenerales}
                            onChange={(e) => setObservacionesGenerales(e.target.value)}
                        />
                    </label>

                    <div className="flex items-center justify-between pt-2">
                        <Button
                            type="button"
                            variant="destructive"
                            size="sm"
                            onClick={() => setMostrarModalAnular(true)}
                            className="flex items-center gap-1.5"
                        >
                            <Ban className="h-4 w-4" />
                            Anular Pedido
                        </Button>

                        <Button
                            type="button"
                            variant="default"
                            onClick={ejecutarAprobacion}
                            disabled={isPending}
                            className="flex items-center gap-1.5"
                        >
                            {isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : <CheckCircle className="h-4 w-4" />}
                            Aprobar y Finalizar Revisión
                        </Button>
                    </div>
                </div>
            ) : null}

            {mostrarModalAnular ? (
                <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
                    <div className="w-full max-w-md rounded-lg bg-background p-6 shadow-xl space-y-4">
                        <div className="flex items-center gap-2 text-destructive">
                            <AlertCircle className="h-5 w-5" />
                            <h3 className="text-lg font-bold">Anulación de Pedido</h3>
                        </div>
                        <p className="text-sm text-muted-foreground">
                            ¿Estás seguro de anular el pedido <strong>{pedido.numero}</strong>? Esta acción no se puede deshacer.
                        </p>
                        <label className="block space-y-1 text-sm">
                            <span className="font-medium">Motivo de anulación (obligatorio):</span>
                            <textarea
                                rows={3}
                                className="w-full rounded-md border p-2 text-sm focus:outline-none focus:ring-2 focus:ring-ring"
                                placeholder="Indique la causa..."
                                value={motivoAnulacion}
                                onChange={(e) => setMotivoAnulacion(e.target.value)}
                            />
                        </label>
                        <div className="flex justify-end gap-2 pt-2">
                            <Button
                                type="button"
                                variant="outline"
                                onClick={() => setMostrarModalAnular(false)}
                                disabled={isPending}
                            >
                                Cancelar
                            </Button>
                            <Button
                                type="button"
                                variant="destructive"
                                onClick={ejecutarAnulacion}
                                disabled={isPending}
                            >
                                {isPending ? "Anulando..." : "Confirmar Anulación"}
                            </Button>
                        </div>
                    </div>
                </div>
            ) : null}
        </div>
    );
}

