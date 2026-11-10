"use client";

import React, { useActionState, useEffect, useMemo, useState } from "react";
import type { Bodega, Centro, Unidad } from "@prisma/client";
import { toast } from "sonner";

// actions
import { listarLotesDisponibles } from "@/modules/orden-salida/actions/lotes-disponibles.action";
import { crearOrdenSalida } from "@/modules/orden-salida/actions/orden-salida.action";

// components
import { BotonDescargarComprobante } from "@/modules/orden-salida/components/boton-descargar-comprobante";
import { OrdenSalidaDetallesField } from "@/modules/orden-salida/components/orden-salida-detalles-field";
import { ActionMessage } from "@/shared/components/ui/action-message";
import { Button } from "@/shared/components/ui/button";
import { FormSubmit } from "@/shared/components/ui/form-submit";
import { Input } from "@/shared/components/ui/input";
import { Select } from "@/shared/components/ui/select";

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

// types
import type { StockDisponible } from "@/modules/orden-salida/types/stock-disponible";

export function OrdenSalidaForm({
    centros,
    todosCentros = [],
    bodegas,
    bodegasDestino = [],
    unidades = [],
    stocks,
    centroId = null,
    bodegaId: bodegaIdProp = null,
    errorLotes,
    puedeFiltrarCentro = false
}: {
    centros: Centro[];
    todosCentros?: Centro[];
    bodegas: Bodega[];
    bodegasDestino?: Bodega[];
    unidades?: Unidad[];
    stocks: StockDisponible[];
    centroId?: string | null;
    bodegaId?: string | null;
    errorLotes?: string;
    puedeFiltrarCentro?: boolean;
}): React.ReactElement {
    const [state, formAction] = useActionState(crearOrdenSalida, initialActionState);
    const [centroSeleccionado, setCentroSeleccionado] = useState(centroId ?? centros[0]?.id ?? "");
    const bodegasFiltradas = bodegas.filter((bodega) => bodega.centroId === centroSeleccionado);
    const [bodegaId, setBodegaId] = useState(bodegaIdProp ?? bodegasFiltradas[0]?.id ?? "");
    const [lotes, setLotes] = useState<StockDisponible[]>(stocks);
    const [cargandoLotes, setCargandoLotes] = useState(false);
    const [recargas, setRecargas] = useState(0);

    useEffect(() => {
        if (errorLotes) {
            toast.error(errorLotes);
        }
    }, [errorLotes]);

    useEffect(() => {
        if (state.ok) {
            setRecargas((actual) => actual + 1);
        }
    }, [state]);

    useEffect(() => {
        if (!bodegaId) {
            setCargandoLotes(false);
            setLotes([]);
            return;
        }
        if (recargas === 0 && bodegaId === bodegaIdProp) {
            setCargandoLotes(false);
            setLotes(stocks);
            return;
        }

        let vigente = true;
        setCargandoLotes(true);
        listarLotesDisponibles(bodegaId)
            .then((resultado) => {
                if (!vigente) {
                    return;
                }
                if (!resultado.ok) {
                    toast.error(resultado.message);
                }
                setLotes(resultado.lotes);
            })
            .catch(() => {
                if (vigente) {
                    toast.error("No fue posible cargar los lotes de la bodega.");
                    setLotes([]);
                }
            })
            .finally(() => {
                if (vigente) {
                    setCargandoLotes(false);
                }
            });

        return () => {
            vigente = false;
        };
    }, [bodegaId, bodegaIdProp, recargas, stocks]);
    const [tipoSalida, setTipoSalida] = useState("Consumo Interno");
    const esMerma = tipoSalida.trim().toLowerCase() === "merma";
    const esTraspasoBodega = tipoSalida.trim().toLowerCase() === "a otra bodega";
    const esOtrosCentros = tipoSalida.trim().toLowerCase() === "a otros centros";

    const bodegasDestinoDisponibles = useMemo(() => {
        const pool = bodegasDestino && bodegasDestino.length > 0 ? bodegasDestino : bodegas;
        return pool.filter((b) => b.centroId === centroSeleccionado && b.id !== bodegaId && b.estado);
    }, [bodegasDestino, bodegas, centroSeleccionado, bodegaId]);
    const [bodegaDestinoId, setBodegaDestinoId] = useState(bodegasDestinoDisponibles[0]?.id ?? "");

    const poolCentros = todosCentros && todosCentros.length > 0 ? todosCentros : centros;
    const otrosCentrosDisponibles = useMemo(
        () => poolCentros.filter((c) => c.id !== centroSeleccionado && c.estado !== false),
        [poolCentros, centroSeleccionado]
    );
    const [centroDestinoId, setCentroDestinoId] = useState(otrosCentrosDisponibles[0]?.id ?? "");

    const bodegasOtrosCentrosDisponibles = useMemo(() => {
        return bodegasDestino.filter((b) => b.centroId === centroDestinoId && b.estado);
    }, [bodegasDestino, centroDestinoId]);
    const [bodegaDestinoOtroCentroId, setBodegaDestinoOtroCentroId] = useState(
        bodegasOtrosCentrosDisponibles[0]?.id ?? ""
    );

    const opcionesConsumo = useMemo(() => {
        if (unidades && unidades.length > 0) {
            return unidades.map((u) => u.descripcion);
        }
        return DESTINOS_CONSUMO_INTERNO;
    }, [unidades]);

    const opcionesMerma = useMemo(() => {
        if (unidades && unidades.length > 0) {
            return unidades.map((u) => u.descripcion);
        }
        return DESTINOS_MERMA;
    }, [unidades]);

    useEffect(() => {
        if (!bodegasDestinoDisponibles.some((b) => b.id === bodegaDestinoId)) {
            setBodegaDestinoId(bodegasDestinoDisponibles[0]?.id ?? "");
        }
    }, [bodegasDestinoDisponibles, bodegaDestinoId]);

    useEffect(() => {
        if (!bodegasOtrosCentrosDisponibles.some((b) => b.id === bodegaDestinoOtroCentroId)) {
            setBodegaDestinoOtroCentroId(bodegasOtrosCentrosDisponibles[0]?.id ?? "");
        }
    }, [bodegasOtrosCentrosDisponibles, bodegaDestinoOtroCentroId]);

    useEffect(() => {
        if (!otrosCentrosDisponibles.some((c) => c.id === centroDestinoId)) {
            const nuevoCentro = otrosCentrosDisponibles[0]?.id ?? "";
            setCentroDestinoId(nuevoCentro);
            const bods = bodegasDestino.filter((b) => b.centroId === nuevoCentro && b.estado);
            setBodegaDestinoOtroCentroId(bods[0]?.id ?? "");
        }
    }, [otrosCentrosDisponibles, centroDestinoId, bodegasDestino]);

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
                <>
                    <label className="space-y-1 text-sm">
                        <span>Centro de salud destino *</span>
                        <Select
                            key="a-otros-centros"
                            name="centroDestinoId"
                            required
                            value={centroDestinoId}
                            onChange={(event) => {
                                const nuevoCentro = event.currentTarget.value;
                                setCentroDestinoId(nuevoCentro);
                                const bods = bodegasDestino.filter((b) => b.centroId === nuevoCentro && b.estado);
                                setBodegaDestinoOtroCentroId(bods[0]?.id ?? "");
                            }}
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
                    <label className="space-y-1 text-sm">
                        <span>Bodega destino (Centro receptor) *</span>
                        <Select
                            key="bodega-destino-otro-centro"
                            name="bodegaDestinoId"
                            required
                            value={bodegaDestinoOtroCentroId}
                            onChange={(event) => setBodegaDestinoOtroCentroId(event.currentTarget.value)}
                        >
                            {bodegasOtrosCentrosDisponibles.length === 0 && (
                                <option value="">No hay bodegas disponibles en este centro</option>
                            )}
                            {bodegasOtrosCentrosDisponibles.map((bodega) => (
                                <option key={bodega.id} value={bodega.id}>
                                    {bodega.nombre}
                                </option>
                            ))}
                        </Select>
                    </label>
                </>
            ) : esMerma ? (
                <label className="space-y-1 text-sm">
                    <span>Causal / Justificación sanitaria *</span>
                    <Select key="merma" name="destino" required defaultValue={opcionesMerma[0] ?? ""}>
                        {opcionesMerma.map((causal) => (
                            <option key={causal} value={causal}>
                                {causal}
                            </option>
                        ))}
                    </Select>
                </label>
            ) : (
                <label className="space-y-1 text-sm">
                    <span>Servicio / Unidad clínica destino *</span>
                    <Select key="consumo-interno" name="destino" required defaultValue={opcionesConsumo[0] ?? ""}>
                        {opcionesConsumo.map((unidad) => (
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
                {cargandoLotes ? (
                    <p className="text-sm text-muted-foreground">Cargando lotes de la bodega…</p>
                ) : null}
                <OrdenSalidaDetallesField bodegaId={bodegaId} stocks={lotes} tipoSalida={tipoSalida} />
            </div>
            {state.ok && state.id && (
                <div className="flex flex-wrap items-center justify-between gap-3 rounded-md border border-emerald-200 bg-emerald-50 p-3 text-xs text-emerald-900 md:col-span-3">
                    <div className="flex items-center gap-2">
                        <span className="font-semibold text-sm">✓ Salida registrada con éxito</span>
                        <span className="text-muted-foreground">· N°: {state.id}</span>
                    </div>
                    <BotonDescargarComprobante
                        ordenId={state.id}
                        label="Descargar Comprobante PDF"
                        variant="default"
                        size="sm"
                        className="bg-emerald-700 hover:bg-emerald-800 text-white"
                    />
                </div>
            )}
            {state.ok && state.advertencia && (
                <p className="rounded-md border border-amber-200 bg-amber-50 p-3 text-xs text-amber-800 md:col-span-3" role="alert">
                    {state.advertencia}
                </p>
            )}
            <div className="flex items-center gap-3 md:col-span-3">
                <FormSubmit label="Registrar salida" />
                <ActionMessage state={state} enlaceExito={{ href: "/salidas/registros", etiqueta: "Ver registros de salida" }} />
            </div>
        </form>
    );
}
