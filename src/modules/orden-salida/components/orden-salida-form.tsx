"use client";

import type * as React from "react";
import { useActionState, useEffect, useMemo, useState } from "react";
import type { Bodega, Centro, Stock } from "@prisma/client";

// actions
import { crearOrdenSalida } from "@/modules/orden-salida/actions/orden-salida.action";

// components
import { OrdenSalidaDetallesField } from "@/modules/orden-salida/components/orden-salida-detalles-field";
import { ActionMessage } from "@/shared/components/ui/action-message";
import { FormSubmit } from "@/shared/components/ui/form-submit";
import { Input } from "@/shared/components/ui/input";
import { Select } from "@/shared/components/ui/select";

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
    stocks,
    centroId = null,
    bodegaId: bodegaIdProp = null,
    puedeFiltrarCentro = false
}: {
    centros: Centro[];
    bodegas: Bodega[];
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

    const bodegasDestinoDisponibles = useMemo(
        () => bodegasFiltradas.filter((b) => b.id !== bodegaId),
        [bodegasFiltradas, bodegaId]
    );
    const [bodegaDestinoId, setBodegaDestinoId] = useState(bodegasDestinoDisponibles[0]?.id ?? "");

    useEffect(() => {
        if (!bodegasDestinoDisponibles.some((b) => b.id === bodegaDestinoId)) {
            setBodegaDestinoId(bodegasDestinoDisponibles[0]?.id ?? "");
        }
    }, [bodegasDestinoDisponibles, bodegaDestinoId]);

    function cambiarCentro(nuevoCentroId: string): void {
        setCentroSeleccionado(nuevoCentroId);
        const disponibles = bodegas.filter((b) => b.centroId === nuevoCentroId);
        setBodegaId(disponibles[0]?.id ?? "");
    }

    return (
        <form action={formAction} className="grid gap-3 md:grid-cols-3">
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
                    <option value="Consumo Interno">Consumo Interno</option>
                    <option value="A otra bodega">A otra bodega</option>
                    <option value="A Otros Centros">A Otros Centros</option>
                    <option value="Merma">Merma</option>
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
            ) : (
                <label className="space-y-1 text-sm">
                    <span>{esMerma ? "Destino / Justificación Sanitaria (Obligatorio) *" : "Destino"}</span>
                    <Input
                        name="destino"
                        required
                        placeholder={esMerma ? "Ej: Baja por vencimiento en estantería según protocolo" : "Unidad o centro destino"}
                    />
                </label>
            )}
            <label className="space-y-1 text-sm">
                <span>Correo destino</span>
                <Input type="email" name="correoDestino" placeholder="Opcional" />
            </label>
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
