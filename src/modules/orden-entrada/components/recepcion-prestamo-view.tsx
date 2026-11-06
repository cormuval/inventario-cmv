"use client";

import * as React from "react";
import { Search, PackageCheck, AlertTriangle, ArrowRight, ShieldCheck, CheckCircle2 } from "lucide-react";
import { toast } from "sonner";

// actions
import {
    buscarPrestamoPorCodigoAction,
    confirmarRecepcionPrestamoAction,
    type PrestamoEnTransitoDetalle
} from "@/modules/orden-entrada/actions/recepcion-prestamos.action";

// components
import { Button } from "@/shared/components/ui/button";
import { Input } from "@/shared/components/ui/input";
import { Select } from "@/shared/components/ui/select";
import { Badge } from "@/shared/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/shared/components/ui/card";

// utils
import { normalizarCodigoRecepcion } from "@/modules/orden-salida/utils/codigo-recepcion";

interface BodegaOption {
    id: string;
    nombre: string;
    centroId: string;
}

interface RecepcionPrestamoViewProps {
    bodegasDisponibles: BodegaOption[];
    codigoInicial?: string;
}

export function RecepcionPrestamoView({
    bodegasDisponibles,
    codigoInicial = ""
}: RecepcionPrestamoViewProps): React.ReactElement {
    const [codigo, setCodigo] = React.useState(codigoInicial);
    const [buscando, setBuscando] = React.useState(false);
    const [confirmando, setConfirmando] = React.useState(false);
    const [prestamo, setPrestamo] = React.useState<PrestamoEnTransitoDetalle | null>(null);
    const [observacion, setObservacion] = React.useState("");
    const [recepcionadoExitoso, setRecepcionadoExitoso] = React.useState(false);

    // Filtrar bodegas por centroDestinoId del préstamo buscado dentro del alcance del usuario
    const bodegasFiltradas = React.useMemo(() => {
        if (!prestamo) {
            return bodegasDisponibles;
        }
        return bodegasDisponibles.filter((b) => b.centroId === prestamo.centroDestinoId);
    }, [bodegasDisponibles, prestamo]);

    const [bodegaDestinoId, setBodegaDestinoId] = React.useState(
        prestamo?.bodegaDestinoSugeridaId || bodegasFiltradas[0]?.id || ""
    );

    React.useEffect(() => {
        if (bodegasFiltradas.length > 0) {
            if (
                prestamo?.bodegaDestinoSugeridaId &&
                bodegasFiltradas.some((b) => b.id === prestamo.bodegaDestinoSugeridaId)
            ) {
                setBodegaDestinoId(prestamo.bodegaDestinoSugeridaId);
            } else if (!bodegasFiltradas.some((b) => b.id === bodegaDestinoId)) {
                setBodegaDestinoId(bodegasFiltradas[0].id);
            }
        }
    }, [bodegasFiltradas, prestamo, bodegaDestinoId]);

    async function handleBuscar(e: React.FormEvent): Promise<void> {
        e.preventDefault();
        const normalizado = normalizarCodigoRecepcion(codigo);
        if (normalizado.length !== 7) {
            toast.error("El código debe tener exactamente 7 caracteres.");
            return;
        }

        setBuscando(true);
        setRecepcionadoExitoso(false);
        try {
            const res = await buscarPrestamoPorCodigoAction(normalizado);
            if (!res.ok || !res.prestamo) {
                toast.error(res.message);
                setPrestamo(null);
            } else {
                setPrestamo(res.prestamo);
                if (res.prestamo.bodegaDestinoSugeridaId) {
                    setBodegaDestinoId(res.prestamo.bodegaDestinoSugeridaId);
                }
                toast.success("Envío localizado. Revise los insumos antes de confirmar.");
            }
        } catch {
            toast.error("Error al buscar el código de recepción.");
        } finally {
            setBuscando(false);
        }
    }

    async function handleConfirmarRecepcion(e: React.FormEvent): Promise<void> {
        e.preventDefault();
        if (!prestamo) return;

        if (!bodegaDestinoId) {
            toast.error("Debe seleccionar la bodega destino para almacenar el stock.");
            return;
        }

        setConfirmando(true);
        try {
            const res = await confirmarRecepcionPrestamoAction({
                codigo: prestamo.codigo,
                bodegaDestinoId,
                observacionRecepcion: observacion
            });

            if (!res.ok) {
                toast.error(res.message);
            } else {
                toast.success(res.message);
                setRecepcionadoExitoso(true);
                setPrestamo(null);
                setCodigo("");
                setObservacion("");
            }
        } catch {
            toast.error("Error al confirmar la recepción del préstamo.");
        } finally {
            setConfirmando(false);
        }
    }

    return (
        <div className="space-y-6">
            <Card>
                <CardHeader>
                    <CardTitle className="flex items-center gap-2 text-lg">
                        <Search className="h-5 w-5 text-teal-700" />
                        <span>Búsqueda por Código de Recepción</span>
                    </CardTitle>
                    <p className="text-xs text-muted-foreground mt-1">
                        Ingrese el código de 7 caracteres provisto por el centro emisor en la guía de despacho o por correo.
                    </p>
                </CardHeader>
                <CardContent>
                    <form onSubmit={handleBuscar} className="flex flex-col sm:flex-row gap-3 max-w-md">
                        <Input
                            placeholder="Ej: K94J2Q8"
                            value={codigo}
                            onChange={(e) => setCodigo(e.target.value.toUpperCase())}
                            maxLength={7}
                            className="font-mono uppercase tracking-wider text-base"
                            disabled={buscando}
                        />
                        <Button
                            type="submit"
                            disabled={buscando || codigo.trim().length !== 7}
                            className="bg-teal-700 hover:bg-teal-800 text-white font-medium shrink-0"
                        >
                            {buscando ? "Buscando..." : "Localizar Envío"}
                        </Button>
                    </form>
                </CardContent>
            </Card>

            {recepcionadoExitoso && (
                <div className="rounded-lg border border-emerald-200 bg-emerald-50 p-4 text-emerald-900 flex items-center gap-3">
                    <CheckCircle2 className="h-6 w-6 text-emerald-600 shrink-0" />
                    <div>
                        <p className="font-semibold text-sm">¡Préstamo recepcionado con éxito!</p>
                        <p className="text-xs text-emerald-800">
                            El stock ha sido acreditado en la bodega de destino y la orden de entrada asociada fue generada.
                        </p>
                    </div>
                </div>
            )}

            {prestamo && (
                <Card className="border-teal-200 shadow-sm">
                    <CardHeader className="bg-slate-50/70 border-b border-slate-100">
                        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
                            <div>
                                <span className="text-xs font-semibold uppercase tracking-wider text-teal-800">
                                    Transferencia en Tránsito
                                </span>
                                <CardTitle className="text-xl flex items-center gap-2 mt-0.5">
                                    <span className="font-mono text-teal-900">{prestamo.codigo}</span>
                                    {prestamo.esDemorado && (
                                        <Badge tone="danger" className="flex items-center gap-1 text-[11px]">
                                            <AlertTriangle className="h-3 w-3" />
                                            <span>Tránsito Demorado (&gt; 7 días)</span>
                                        </Badge>
                                    )}
                                </CardTitle>
                            </div>
                            <div className="flex items-center gap-2 text-xs text-muted-foreground">
                                <span>Emitido: {new Date(prestamo.fechaEmision).toLocaleDateString("es-CL")}</span>
                            </div>
                        </div>

                        <div className="flex items-center gap-3 pt-3 text-sm">
                            <div className="flex flex-col">
                                <span className="text-[11px] uppercase tracking-wider text-muted-foreground">Origen</span>
                                <span className="font-semibold text-slate-800">{prestamo.centroOrigenNombre}</span>
                                <span className="text-xs text-muted-foreground">{prestamo.bodegaOrigenNombre}</span>
                            </div>
                            <ArrowRight className="h-4 w-4 text-slate-400 shrink-0" />
                            <div className="flex flex-col">
                                <span className="text-[11px] uppercase tracking-wider text-muted-foreground">Destino</span>
                                <span className="font-semibold text-slate-800">Centro Receptor</span>
                            </div>
                        </div>
                    </CardHeader>

                    <CardContent className="pt-6 space-y-6">
                        <div>
                            <h4 className="text-xs font-semibold uppercase tracking-wider text-slate-600 mb-2">
                                Insumos en el Envío ({prestamo.detalles.length})
                            </h4>
                            <div className="rounded-md border border-slate-200 overflow-x-auto">
                                <table className="w-full text-left text-xs">
                                    <thead className="bg-slate-50 text-slate-700 border-b border-slate-200">
                                        <tr>
                                            <th className="px-3 py-2 font-medium">Insumo</th>
                                            <th className="px-3 py-2 font-medium">Línea</th>
                                            <th className="px-3 py-2 font-medium">Lote</th>
                                            <th className="px-3 py-2 font-medium">Vencimiento</th>
                                            <th className="px-3 py-2 font-medium text-right">Cantidad</th>
                                        </tr>
                                    </thead>
                                    <tbody className="divide-y divide-slate-100">
                                        {prestamo.detalles.map((d) => (
                                            <tr key={d.id} className="hover:bg-slate-50/80">
                                                <td className="px-3 py-2.5 font-medium text-slate-900">{d.productoDescripcion}</td>
                                                <td className="px-3 py-2.5 text-slate-600">{d.linea}</td>
                                                <td className="px-3 py-2.5 font-mono text-slate-800">{d.lote}</td>
                                                <td className="px-3 py-2.5 text-slate-600">
                                                    {new Date(d.fechaCaducidad).toLocaleDateString("es-CL")}
                                                </td>
                                                <td className="px-3 py-2.5 font-semibold text-right text-slate-900">{d.cantidad}</td>
                                            </tr>
                                        ))}
                                    </tbody>
                                </table>
                            </div>
                        </div>

                        <form onSubmit={handleConfirmarRecepcion} className="space-y-4 rounded-lg border border-teal-100 bg-teal-50/40 p-4">
                            <div className="flex items-center gap-2 text-teal-900 font-semibold text-sm">
                                <ShieldCheck className="h-4 w-4 text-teal-700" />
                                <span>Confirmación e Ingreso al Inventario Local</span>
                            </div>

                            <div className="grid gap-4 sm:grid-cols-2">
                                <label className="space-y-1 text-xs font-medium text-slate-700">
                                    <span>Bodega de Destino *</span>
                                    {bodegasFiltradas.length === 0 ? (
                                        <p className="text-xs text-rose-600 font-medium">
                                            No tienes bodegas asignadas o activas en el centro de destino de este préstamo.
                                        </p>
                                    ) : (
                                        <Select
                                            value={bodegaDestinoId}
                                            onChange={(e) => setBodegaDestinoId(e.currentTarget.value)}
                                            required
                                            className="bg-white"
                                        >
                                            {bodegasFiltradas.map((b) => (
                                                <option key={b.id} value={b.id}>
                                                    {b.nombre}
                                                </option>
                                            ))}
                                        </Select>
                                    )}
                                </label>

                                <label className="space-y-1 text-xs font-medium text-slate-700">
                                    <span>Observaciones de Recepción (Opcional)</span>
                                    <Input
                                        placeholder="Ej: Cajas intactas, conforme."
                                        value={observacion}
                                        onChange={(e) => setObservacion(e.target.value)}
                                        maxLength={255}
                                        className="bg-white"
                                    />
                                </label>
                            </div>

                            <div className="pt-2 flex justify-end">
                                <Button
                                    type="submit"
                                    disabled={confirmando || bodegasFiltradas.length === 0}
                                    className="bg-teal-700 hover:bg-teal-800 text-white font-medium flex items-center gap-2"
                                >
                                    <PackageCheck className="h-4 w-4" />
                                    <span>{confirmando ? "Procesando..." : "Confirmar Recepción e Ingresar a Bodega"}</span>
                                </Button>
                            </div>
                        </form>
                    </CardContent>
                </Card>
            )}
        </div>
    );
}
