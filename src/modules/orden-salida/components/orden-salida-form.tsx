"use client";

import React, { useActionState, useEffect, useMemo, useState } from "react";
import type { Bodega, Centro, Stock } from "@prisma/client";

// actions
import { crearOrdenSalida } from "@/modules/orden-salida/actions/orden-salida.action";

// components
import { OrdenSalidaDetallesField } from "@/modules/orden-salida/components/orden-salida-detalles-field";
import { ActionMessage } from "@/shared/components/ui/action-message";
import { FormSubmit } from "@/shared/components/ui/form-submit";
import { Input } from "@/shared/components/ui/input";
import { Select } from "@/shared/components/ui/select";
import { Button } from "@/shared/components/ui/button";
import { toast } from "sonner";

// constants
import {
    TIPOS_SALIDA,
    DESTINOS_CONSUMO_INTERNO,
    DESTINOS_MERMA
} from "@/modules/orden-salida/constants/destinos";

// types
import { initialActionState } from "@/shared/types/action-state";

// utils
import { toDateInputValue } from "@/shared/utils/format";

interface StockDisponible extends Stock {
    producto: {
        descripcion: string;
    };
    bodega: {
        nombre: string;
    };
}

export function OrdenSalidaForm({
    centros,
    bodegas,
    bodegasDestino = [],
    stocks,
    centroId = null,
    bodegaId: bodegaIdProp = null,
    puedeFiltrarCentro = false
}: {
    centros: Centro[];
    bodegas: Bodega[];
    bodegasDestino?: Bodega[];
    stocks: StockDisponible[];
    centroId?: string | null;
    bodegaId?: string | null;
    puedeFiltrarCentro?: boolean;
}): React.ReactElement {
    const [state, formAction] = useActionState(crearOrdenSalida, initialActionState);
    const [centroSeleccionado, setCentroSeleccionado] = useState(centroId ?? centros[0]?.id ?? "");
    const bodegasFiltradas = bodegas.filter((bodega) => bodega.centroId === centroSeleccionado);
    const primerStock = stocks.find((s) => s.bodegaId === (bodegaIdProp ?? bodegasFiltradas[0]?.id));
    const [bodegaId, setBodegaId] = useState(bodegaIdProp ?? primerStock?.bodegaId ?? bodegasFiltradas[0]?.id ?? "");
    const [tipoSalida, setTipoSalida] = useState("Consumo Interno");
    const esMerma = tipoSalida.trim().toLowerCase() === "merma";
    const esTraspasoBodega = tipoSalida.trim().toLowerCase() === "a otra bodega";
    const esOtrosCentros = tipoSalida.trim().toLowerCase() === "a otros centros";

    const bodegasDestinoDisponibles = useMemo(() => {
        const pool = bodegasDestino && bodegasDestino.length > 0 ? bodegasDestino : bodegas;
        return pool.filter((b) => b.centroId === centroSeleccionado && b.id !== bodegaId && b.estado);
    }, [bodegasDestino, bodegas, centroSeleccionado, bodegaId]);
    const [bodegaDestinoId, setBodegaDestinoId] = useState(bodegasDestinoDisponibles[0]?.id ?? "");

    const otrosCentrosDisponibles = useMemo(
        () => centros.filter((c) => c.id !== centroSeleccionado && c.estado !== false),
        [centros, centroSeleccionado]
    );
    const [centroDestinoId, setCentroDestinoId] = useState(otrosCentrosDisponibles[0]?.id ?? "");

    useEffect(() => {
        if (!bodegasDestinoDisponibles.some((b) => b.id === bodegaDestinoId)) {
            setBodegaDestinoId(bodegasDestinoDisponibles[0]?.id ?? "");
        }
    }, [bodegasDestinoDisponibles, bodegaDestinoId]);

    useEffect(() => {
        if (!otrosCentrosDisponibles.some((c) => c.id === centroDestinoId)) {
            setCentroDestinoId(otrosCentrosDisponibles[0]?.id ?? "");
        }
    }, [otrosCentrosDisponibles, centroDestinoId]);

    function cambiarCentro(nuevoCentroId: string): void {
        setCentroSeleccionado(nuevoCentroId);
        const disponibles = bodegas.filter((b) => b.centroId === nuevoCentroId);
        setBodegaId(disponibles[0]?.id ?? "");
    }

    return (
        <form action={formAction} className="grid gap-3 md:grid-cols-3">
            {state.ok && state.codigoRecepcion && (
                <div className="md:col-span-3 rounded-lg border border-teal-200 bg-teal-50 p-4 shadow-sm flex flex-col sm:flex-row items-center justify-between gap-3">
                    <div className="flex items-center gap-3">
                        <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-teal-600 text-white font-bold">
                            ✔
                        </div>
                        <div>
                            <p className="text-xs uppercase tracking-wider font-semibold text-teal-800">
                                Código de Recepción Generado (Traspaso en Tránsito)
                            </p>
                            <p className="text-xl font-mono font-bold text-teal-950 tracking-wider">
                                {state.codigoRecepcion}
                            </p>
                            <p className="text-xs text-teal-700">
                                Comparta este código de 7 caracteres con el centro receptor para su ingreso físico.
                            </p>
                        </div>
                    </div>
                    <Button
                        type="button"
                        variant="outline"
                        size="sm"
                        className="border-teal-300 bg-white hover:bg-teal-100 text-teal-900 shrink-0"
                        onClick={() => {
                            if (state.codigoRecepcion) {
                                navigator.clipboard.writeText(state.codigoRecepcion);
                                toast.success("Código copiado al portapapeles");
                            }
                        }}
                    >
                        Copiar Código
                    </Button>
                </div>
            )}

            <label className="space-y-1 text-sm">
                <span>Fecha</span>
                <Input type="date" name="fecha" defaultValue={toDateInputValue()} required />
            </label>
            <label className="space-y-1 text-sm">
                <span>Centro</span>
                {puedeFiltrarCentro ? (
                    <Select
                        name="centroId"
                        value={centroSeleccionado}
                        onChange={(event) => cambiarCentro(event.currentTarget.value)}
                        required
                    >
                        {centros.map((centro) => (
                            <option key={centro.id} value={centro.id}>
                                {centro.nombre}
                            </option>
                        ))}
                    </Select>
                ) : (
                    <>
                        <input type="hidden" name="centroId" value={centroSeleccionado} readOnly />
                        <div className="flex h-10 items-center rounded-md border bg-muted/30 px-3 text-sm text-muted-foreground">
                            {centros.find((centro) => centro.id === centroSeleccionado)?.nombre ?? "Centro asignado"}
                        </div>
                    </>
                )}
            </label>
            <label className="space-y-1 text-sm">
                <span>Bodega</span>
                <Select
                    name="bodegaId"
                    required
                    value={bodegaId}
                    onChange={(event) => setBodegaId(event.currentTarget.value)}
                >
                    {bodegasFiltradas.length === 0 && <option value="">Sin bodegas disponibles</option>}
                    {bodegasFiltradas.map((bodega) => (
                        <option key={bodega.id} value={bodega.id}>
                            {bodega.nombre}
                        </option>
                    ))}
                </Select>
            </label>
            <label className="space-y-1 text-sm">
                <span>Tipo salida</span>
                <Select
                    name="tipoSalida"
                    required
                    value={tipoSalida}
                    onChange={(event) => setTipoSalida(event.currentTarget.value)}
                >
                    {TIPOS_SALIDA.map((tipo) => (
                        <option key={tipo} value={tipo}>
                            {tipo}
                        </option>
                    ))}
                </Select>
            </label>
            {esTraspasoBodega ? (
                <label className="space-y-1 text-sm">
                    <span>Bodega destino (Mismo centro) *</span>
                    <Select
                        name="bodegaDestinoId"
                        required
                        value={bodegaDestinoId}
                        onChange={(event) => setBodegaDestinoId(event.currentTarget.value)}
                    >
                        {bodegasDestinoDisponibles.length === 0 && (
                            <option value="">No hay otras bodegas en este centro</option>
                        )}
                        {bodegasDestinoDisponibles.map((bodega) => (
                            <option key={bodega.id} value={bodega.id}>
                                {bodega.nombre}
                            </option>
                        ))}
                    </Select>
                    <input
                        type="hidden"
                        name="destino"
                        value={bodegasDestinoDisponibles.find((b) => b.id === bodegaDestinoId)?.nombre ?? ""}
                    />
                </label>
            ) : esOtrosCentros ? (
                <label className="space-y-1 text-sm">
                    <span>Centro de salud destino *</span>
                    <Select
                        key="a-otros-centros"
                        name="centroDestinoId"
                        required
                        value={centroDestinoId}
                        onChange={(event) => setCentroDestinoId(event.currentTarget.value)}
                    >
                        {otrosCentrosDisponibles.length === 0 && (
                            <option value="">No hay otros centros disponibles</option>
                        )}
                        {otrosCentrosDisponibles.map((centro) => (
                            <option key={centro.id} value={centro.id}>
                                {centro.nombre}
                            </option>
                        ))}
                    </Select>
                    <input
                        type="hidden"
                        name="destino"
                        value={otrosCentrosDisponibles.find((c) => c.id === centroDestinoId)?.nombre ?? ""}
                    />
                </label>
            ) : esMerma ? (
                <label className="space-y-1 text-sm">
                    <span>Causal / Justificación sanitaria *</span>
                    <Select key="merma" name="destino" required defaultValue={DESTINOS_MERMA[0]}>
                        {DESTINOS_MERMA.map((causal) => (
                            <option key={causal} value={causal}>
                                {causal}
                            </option>
                        ))}
                    </Select>
                </label>
            ) : (
                <label className="space-y-1 text-sm">
                    <span>Servicio / Unidad clínica destino *</span>
                    <Select key="consumo-interno" name="destino" required defaultValue={DESTINOS_CONSUMO_INTERNO[0]}>
                        {DESTINOS_CONSUMO_INTERNO.map((unidad) => (
                            <option key={unidad} value={unidad}>
                                {unidad}
                            </option>
                        ))}
                    </Select>
                </label>
            )}
            <label className="space-y-1 text-sm">
                <span>Correo destino</span>
                <Input type="email" name="correoDestino" placeholder="Opcional" />
            </label>

            {esOtrosCentros && (
                <div className="md:col-span-3 rounded-lg border border-amber-200 bg-amber-50/70 p-3 text-xs text-amber-900 flex items-start gap-2.5">
                    <input
                        type="checkbox"
                        id="advertenciaCaducidadAceptada"
                        name="advertenciaCaducidadAceptada"
                        value="true"
                        className="mt-0.5 rounded border-amber-300 text-amber-600 focus:ring-amber-500"
                    />
                    <label htmlFor="advertenciaCaducidadAceptada" className="cursor-pointer select-none">
                        <span className="font-semibold text-amber-950">Advertencia sanitaria (Insumos con vencimiento próximo): </span>
                        Confirmo que si alguno de los insumos seleccionados vence dentro del plazo de 1 semana, el centro de salud de destino está debidamente notificado y se destinará a uso urgente e inmediato antes de su fecha de caducidad.
                    </label>
                </div>
            )}

            <div className="border-t pt-3 md:col-span-3">
                <p className="mb-3 text-sm font-medium">Detalle</p>
                <OrdenSalidaDetallesField bodegaId={bodegaId} stocks={stocks} tipoSalida={tipoSalida} />
            </div>
            <div className="flex items-center gap-3 md:col-span-3">
                <FormSubmit label="Registrar salida" />
                <ActionMessage state={state} />
            </div>
        </form>
    );
}
