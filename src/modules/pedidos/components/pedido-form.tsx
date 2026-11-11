"use client";

import type * as React from "react";
import { useEffect, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { AlertCircle, Bookmark, CheckCircle2, Loader2, Sparkles } from "lucide-react";
import { toast } from "sonner";

// actions
import {
    crearPedidoAction,
    guardarBorradorPedidoAction,
    guardarPlantillaCentroAction,
    obtenerCatalogoAseoAction
} from "@/modules/pedidos/actions/pedidos.action";

// components
import { Badge } from "@/shared/components/ui/badge";
import { Button } from "@/shared/components/ui/button";
import { Input } from "@/shared/components/ui/input";
import { Select } from "@/shared/components/ui/select";
import { Table, Td, Th } from "@/shared/components/ui/table";

// types
import type { ItemCatalogoAseo } from "@/modules/pedidos/utils/catalogo-aseo";

interface PedidoFormProps {
    centros: Array<{ id: string; nombre: string }>;
    bodegas: Array<{ id: string; nombre: string; centroId: string }>;
    centroIdInicial: string;
    bodegaIdInicial?: string | null;
    puedeFiltrarCentro: boolean;
    pedidoExistente?: {
        id: string;
        numero: string;
        tipo: string;
        periodo?: string | null;
        centroId: string;
        bodegaId?: string | null;
        observaciones?: string | null;
        detalles: Array<{
            productoId: number;
            cantidadSolicitada: number;
        }>;
    } | null;
}

function periodoActualMes(): string {
    const d = new Date();
    const año = d.getFullYear();
    const mes = String(d.getMonth() + 1).padStart(2, "0");
    return `${año}-${mes}`;
}

export function PedidoForm({
    centros,
    bodegas,
    centroIdInicial,
    bodegaIdInicial,
    puedeFiltrarCentro,
    pedidoExistente
}: PedidoFormProps): React.ReactElement {
    const router = useRouter();
    const [isPending, startTransition] = useTransition();

    const [centroId, setCentroId] = useState(pedidoExistente?.centroId ?? centroIdInicial ?? centros[0]?.id ?? "");
    const [bodegaId, setBodegaId] = useState(pedidoExistente?.bodegaId ?? bodegaIdInicial ?? "");
    const [tipo, setTipo] = useState<"MENSUAL" | "SUPLEMENTARIO">(
        (pedidoExistente?.tipo as "MENSUAL" | "SUPLEMENTARIO") ?? "MENSUAL"
    );
    const [periodo, setPeriodo] = useState(pedidoExistente?.periodo ?? periodoActualMes());
    const [observaciones, setObservaciones] = useState(pedidoExistente?.observaciones ?? "");

    const [catalogo, setCatalogo] = useState<ItemCatalogoAseo[]>([]);
    const [cantidades, setCantidades] = useState<Record<number, number>>({});
    const [cargandoCatalogo, setCargandoCatalogo] = useState(false);

    // Cargar catálogo de aseo cuando cambia el centro o bodega
    useEffect(() => {
        if (!centroId) return;

        let activo = true;
        setCargandoCatalogo(true);

        obtenerCatalogoAseoAction(centroId, bodegaId || null)
            .then((items) => {
                if (!activo) return;
                setCatalogo(items);

                // Inicializar mapa de cantidades si no es edición existente
                const mapa: Record<number, number> = {};
                for (const item of items) {
                    if (pedidoExistente) {
                        const encontrado = pedidoExistente.detalles.find((d) => d.productoId === item.productoId);
                        mapa[item.productoId] = encontrado ? encontrado.cantidadSolicitada : 0;
                    } else {
                        mapa[item.productoId] = item.cantidadHabitual > 0 ? item.cantidadHabitual : 0;
                    }
                }
                setCantidades(mapa);
            })
            .catch(() => {
                if (activo) toast.error("Error al cargar el catálogo de productos de aseo.");
            })
            .finally(() => {
                if (activo) setCargandoCatalogo(false);
            });

        return () => {
            activo = false;
        };
    }, [centroId, bodegaId, pedidoExistente]);

    function actualizarCantidad(productoId: number, valor: string): void {
        const num = parseInt(valor, 10);
        setCantidades((prev) => ({
            ...prev,
            [productoId]: isNaN(num) || num < 0 ? 0 : num
        }));
    }

    function aplicarPlantillaHabitual(): void {
        const nuevo: Record<number, number> = {};
        for (const item of catalogo) {
            nuevo[item.productoId] = item.cantidadHabitual;
        }
        setCantidades(nuevo);
        toast.info("Cantidades cargadas desde la plantilla habitual del centro.");
    }

    function aplicarSugerenciasStock(): void {
        const nuevo: Record<number, number> = {};
        for (const item of catalogo) {
            nuevo[item.productoId] = item.sugerencia;
        }
        setCantidades(nuevo);
        toast.info("Cantidades sugeridas según stock disponible y mínimo aplicadas.");
    }

    async function guardarComoPlantilla(): Promise<void> {
        startTransition(async () => {
            const items = Object.entries(cantidades).map(([pid, cant]) => ({
                productoId: Number(pid),
                cantidadHabitual: cant
            }));

            const res = await guardarPlantillaCentroAction({
                centroId,
                items
            });

            if (res.ok) {
                toast.success(res.message);
                // Actualizar estado local del catálogo
                setCatalogo((prev) =>
                    prev.map((c) => ({
                        ...c,
                        cantidadHabitual: cantidades[c.productoId] ?? 0
                    }))
                );
            } else {
                toast.error(res.message);
            }
        });
    }

    async function guardarBorrador(): Promise<void> {
        startTransition(async () => {
            const detalles = Object.entries(cantidades)
                .map(([pid, cant]) => ({
                    productoId: Number(pid),
                    cantidadSolicitada: cant
                }))
                .filter((d) => d.cantidadSolicitada > 0);

            const res = await guardarBorradorPedidoAction({
                pedidoId: pedidoExistente?.id,
                centroId,
                bodegaId: bodegaId || null,
                tipo,
                periodo: tipo === "MENSUAL" ? periodo : null,
                observaciones: observaciones || null,
                detalles
            });

            if (res.ok) {
                toast.success(res.message);
                router.push(res.pedidoId ? `/pedidos/${res.pedidoId}` : "/pedidos");
            } else {
                toast.error(res.message);
            }
        });
    }

    async function enviarPedido(): Promise<void> {
        const detalles = Object.entries(cantidades)
            .map(([pid, cant]) => ({
                productoId: Number(pid),
                cantidadSolicitada: cant
            }))
            .filter((d) => d.cantidadSolicitada > 0);

        if (detalles.length === 0) {
            toast.error("Debe solicitar al menos un insumo de aseo con cantidad mayor a 0.");
            return;
        }

        startTransition(async () => {
            const res = await crearPedidoAction({
                centroId,
                bodegaId: bodegaId || null,
                tipo,
                periodo: tipo === "MENSUAL" ? periodo : null,
                observaciones: observaciones || null,
                detalles,
                enviarInmediatamente: true
            });

            if (res.ok) {
                toast.success(res.message);
                router.push(res.pedidoId ? `/pedidos/${res.pedidoId}` : "/pedidos");
            } else {
                toast.error(res.message);
            }
        });
    }

    const bodegasFiltradas = bodegas.filter((b) => b.centroId === centroId);
    const totalSolicitado = Object.values(cantidades).reduce((a, b) => a + b, 0);

    return (
        <div className="space-y-6">
            <div className="grid gap-4 md:grid-cols-4">
                <label className="space-y-1 text-sm font-medium">
                    <span>Centro</span>
                    {puedeFiltrarCentro ? (
                        <Select
                            value={centroId}
                            onChange={(e) => {
                                setCentroId(e.target.value);
                                setBodegaId("");
                            }}
                            disabled={Boolean(pedidoExistente)}
                        >
                            {centros.map((c) => (
                                <option key={c.id} value={c.id}>
                                    {c.nombre}
                                </option>
                            ))}
                        </Select>
                    ) : (
                        <Input value={centros.find((c) => c.id === centroId)?.nombre ?? ""} disabled />
                    )}
                </label>

                <label className="space-y-1 text-sm font-medium">
                    <span>Bodega Destino</span>
                    <Select
                        value={bodegaId}
                        onChange={(e) => setBodegaId(e.target.value)}
                        disabled={Boolean(pedidoExistente)}
                    >
                        <option value="">Todas las bodegas del centro</option>
                        {bodegasFiltradas.map((b) => (
                            <option key={b.id} value={b.id}>
                                {b.nombre}
                            </option>
                        ))}
                    </Select>
                </label>

                <label className="space-y-1 text-sm font-medium">
                    <span>Tipo de Pedido</span>
                    <Select
                        value={tipo}
                        onChange={(e) => setTipo(e.target.value as "MENSUAL" | "SUPLEMENTARIO")}
                    >
                        <option value="MENSUAL">Mensual Regular</option>
                        <option value="SUPLEMENTARIO">Suplementario / Extraordinario</option>
                    </Select>
                </label>

                {tipo === "MENSUAL" ? (
                    <label className="space-y-1 text-sm font-medium">
                        <span>Período (Mes)</span>
                        <Input
                            type="month"
                            value={periodo}
                            onChange={(e) => setPeriodo(e.target.value)}
                        />
                    </label>
                ) : null}
            </div>

            <div className="flex flex-wrap items-center justify-between gap-3 rounded-lg border bg-muted/30 p-3">
                <div className="flex flex-wrap items-center gap-2">
                    <Button
                        type="button"
                        variant="outline"
                        size="sm"
                        onClick={aplicarPlantillaHabitual}
                        className="flex items-center gap-1.5"
                    >
                        <Bookmark className="h-4 w-4 text-primary" />
                        Cargar plantilla habitual
                    </Button>
                    <Button
                        type="button"
                        variant="outline"
                        size="sm"
                        onClick={aplicarSugerenciasStock}
                        className="flex items-center gap-1.5"
                    >
                        <Sparkles className="h-4 w-4 text-amber-600" />
                        Sugerir según existencias
                    </Button>
                    <Button
                        type="button"
                        variant="ghost"
                        size="sm"
                        onClick={guardarComoPlantilla}
                        disabled={isPending}
                        className="text-xs text-muted-foreground hover:text-foreground"
                    >
                        Guardar estas cantidades como plantilla habitual del centro
                    </Button>
                </div>
                <div className="text-sm font-medium">
                    Total solicitado: <strong className="text-primary">{totalSolicitado}</strong> unidades
                </div>
            </div>

            <div className="overflow-x-auto rounded-md border">
                <Table>
                    <thead>
                        <tr>
                            <Th>Cód.</Th>
                            <Th>Insumo de Aseo</Th>
                            <Th>Línea</Th>
                            <Th className="text-right">Stock Actual</Th>
                            <Th className="text-right">Stock Mínimo</Th>
                            <Th className="text-right">Habitual</Th>
                            <Th className="w-36 text-right">Cant. Solicitada</Th>
                        </tr>
                    </thead>
                    <tbody>
                        {cargandoCatalogo ? (
                            <tr>
                                <Td colSpan={7} className="text-center py-8">
                                    <Loader2 className="mx-auto h-6 w-6 animate-spin text-muted-foreground" />
                                    <p className="mt-2 text-xs text-muted-foreground">Cargando catálogo de aseo...</p>
                                </Td>
                            </tr>
                        ) : catalogo.length === 0 ? (
                            <tr>
                                <Td colSpan={7} className="text-center py-8 text-muted-foreground">
                                    No se encontraron productos activos en la línea de Aseo.
                                </Td>
                            </tr>
                        ) : (
                            catalogo.map((item) => {
                                const cant = cantidades[item.productoId] ?? 0;
                                return (
                                    <tr key={item.productoId} className="hover:bg-muted/30">
                                        <Td className="font-mono text-xs">{item.productoId}</Td>
                                        <Td className="font-medium text-sm">{item.descripcion}</Td>
                                        <Td className="text-xs text-muted-foreground">{item.linea}</Td>
                                        <Td className="text-right">
                                            <div className="flex items-center justify-end gap-1.5">
                                                <span className="font-semibold text-xs">{item.stockDisponible}</span>
                                                {item.estadoStock === "sin_stock" ? (
                                                    <span className="h-2 w-2 rounded-full bg-rose-600 inline-block" title="Sin stock disponible" />
                                                ) : item.estadoStock === "bajo_minimo" ? (
                                                    <span className="h-2 w-2 rounded-full bg-amber-500 inline-block" title="Stock bajo o próximo al mínimo" />
                                                ) : (
                                                    <span className="h-2 w-2 rounded-full bg-emerald-500 inline-block" title="Stock normal" />
                                                )}
                                            </div>
                                        </Td>
                                        <Td className="text-right text-xs text-muted-foreground">{item.stockMinimo}</Td>
                                        <Td className="text-right text-xs text-muted-foreground">{item.cantidadHabitual}</Td>
                                        <Td className="text-right">
                                            <Input
                                                type="number"
                                                min={0}
                                                className="text-right font-bold w-24 ml-auto"
                                                value={cant}
                                                onChange={(e) => actualizarCantidad(item.productoId, e.target.value)}
                                            />
                                        </Td>
                                    </tr>
                                );
                            })
                        )}
                    </tbody>
                </Table>
            </div>

            <div className="space-y-1">
                <label className="text-sm font-medium">Observaciones del Pedido</label>
                <textarea
                    rows={2}
                    className="w-full rounded-md border border-input bg-background p-2 text-sm focus:outline-none focus:ring-2 focus:ring-ring"
                    placeholder="Comentarios adicionales, justificación para pedido suplementario, etc."
                    value={observaciones}
                    onChange={(e) => setObservaciones(e.target.value)}
                />
            </div>

            <div className="flex items-center justify-end gap-3 pt-2">
                <Button
                    type="button"
                    variant="outline"
                    onClick={guardarBorrador}
                    disabled={isPending || cargandoCatalogo}
                >
                    {isPending ? <Loader2 className="h-4 w-4 animate-spin mr-1.5" /> : null}
                    Guardar Borrador
                </Button>
                <Button
                    type="button"
                    variant="default"
                    onClick={enviarPedido}
                    disabled={isPending || cargandoCatalogo}
                >
                    {isPending ? <Loader2 className="h-4 w-4 animate-spin mr-1.5" /> : null}
                    Enviar a Adquisiciones
                </Button>
            </div>
        </div>
    );
}

