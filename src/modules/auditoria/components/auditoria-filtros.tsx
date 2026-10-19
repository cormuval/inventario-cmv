"use client";

import * as React from "react";
import { useId, useMemo, useState } from "react";
import { Filter, RotateCcw } from "lucide-react";

// components
import { Button } from "@/shared/components/ui/button";
import { Input } from "@/shared/components/ui/input";
import { Select } from "@/shared/components/ui/select";

// types
import type { FiltroAuditoriaInput } from "@/modules/auditoria/schemas/auditoria.schema";

interface CentroOption {
    id: string;
    nombre: string;
}

interface BodegaOption {
    id: string;
    nombre: string;
    centroId: string;
}

interface UsuarioOption {
    id: string;
    nombre: string;
    apPaterno: string | null;
    email: string;
    centroId: string;
    bodegaId?: string | null;
    encargos?: Array<{ bodegaId: string }>;
}

export interface AuditoriaFiltrosProps {
    centros: CentroOption[];
    bodegas: BodegaOption[];
    usuarios: UsuarioOption[];
    valoresIniciales?: Partial<FiltroAuditoriaInput>;
    onFiltrar: (filtros: Partial<FiltroAuditoriaInput>) => void;
}

function obtenerFechaHoyString(hora: "inicio" | "fin"): string {
    const hoy = new Date();
    const anio = hoy.getFullYear();
    const mes = String(hoy.getMonth() + 1).padStart(2, "0");
    const dia = String(hoy.getDate()).padStart(2, "0");
    return hora === "inicio" ? `${anio}-${mes}-${dia}T00:00` : `${anio}-${mes}-${dia}T23:59`;
}

export function AuditoriaFiltros({
    centros,
    bodegas,
    usuarios,
    valoresIniciales,
    onFiltrar
}: AuditoriaFiltrosProps): React.ReactElement {
    const centroIdField = useId();
    const bodegaIdField = useId();
    const usuarioIdField = useId();
    const accionField = useId();
    const entidadField = useId();
    const fechaDesdeField = useId();
    const fechaHastaField = useId();

    const [fechaDesde, setFechaDesde] = useState(
        valoresIniciales?.fechaDesde ?? obtenerFechaHoyString("inicio")
    );
    const [fechaHasta, setFechaHasta] = useState(
        valoresIniciales?.fechaHasta ?? obtenerFechaHoyString("fin")
    );
    const [centroId, setCentroId] = useState(valoresIniciales?.centroId ?? "todos");
    const [bodegaId, setBodegaId] = useState(valoresIniciales?.bodegaId ?? "todas");
    const [usuarioId, setUsuarioId] = useState(valoresIniciales?.usuarioId ?? "todos");
    const [accion, setAccion] = useState(valoresIniciales?.accion ?? "todas");
    const [entidad, setEntidad] = useState(valoresIniciales?.entidad ?? "todas");

    // Filtrar bodegas activas según centro seleccionado
    const bodegasFiltradas = useMemo(() => {
        if (!centroId || centroId === "todos") return bodegas;
        return bodegas.filter((b) => b.centroId === centroId);
    }, [bodegas, centroId]);

    // Filtrar usuarios activos según centro y bodega seleccionada
    const usuariosFiltrados = useMemo(() => {
        return usuarios.filter((u) => {
            const matchCentro = centroId === "todos" || u.centroId === centroId;
            if (!matchCentro) return false;

            if (bodegaId === "todas") return true;

            const tieneEncargo = u.encargos?.some((e) => e.bodegaId === bodegaId);
            const esBodegaDirecta = u.bodegaId === bodegaId;
            return tieneEncargo || esBodegaDirecta;
        });
    }, [usuarios, centroId, bodegaId]);

    const handleCentroChange = (nuevoCentro: string) => {
        setCentroId(nuevoCentro);
        setBodegaId("todas");
        setUsuarioId("todos");
    };

    const handleBodegaChange = (nuevaBodega: string) => {
        setBodegaId(nuevaBodega);
        setUsuarioId("todos");
    };

    const handleSubmit = (e: React.FormEvent) => {
        e.preventDefault();
        onFiltrar({
            fechaDesde: fechaDesde ? new Date(fechaDesde).toISOString() : undefined,
            fechaHasta: fechaHasta ? new Date(fechaHasta).toISOString() : undefined,
            centroId,
            bodegaId,
            usuarioId,
            accion: accion as any,
            entidad: entidad as any,
            pagina: 1
        });
    };

    const handleLimpiar = () => {
        const fDesde = obtenerFechaHoyString("inicio");
        const fHasta = obtenerFechaHoyString("fin");
        setFechaDesde(fDesde);
        setFechaHasta(fHasta);
        setCentroId("todos");
        setBodegaId("todas");
        setUsuarioId("todos");
        setAccion("todas");
        setEntidad("todas");

        onFiltrar({
            fechaDesde: new Date(fDesde).toISOString(),
            fechaHasta: new Date(fHasta).toISOString(),
            centroId: "todos",
            bodegaId: "todas",
            usuarioId: "todos",
            accion: "todas",
            entidad: "todas",
            pagina: 1
        });
    };

    return (
        <form onSubmit={handleSubmit} className="space-y-4 rounded-lg border bg-card p-4 shadow-sm">
            <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
                {/* Fechas */}
                <div className="space-y-1">
                    <label htmlFor={fechaDesdeField} className="text-xs font-medium text-muted-foreground">
                        Fecha Desde
                    </label>
                    <Input
                        id={fechaDesdeField}
                        type="datetime-local"
                        value={fechaDesde}
                        onChange={(e) => setFechaDesde(e.target.value)}
                        className="text-xs"
                    />
                </div>

                <div className="space-y-1">
                    <label htmlFor={fechaHastaField} className="text-xs font-medium text-muted-foreground">
                        Fecha Hasta
                    </label>
                    <Input
                        id={fechaHastaField}
                        type="datetime-local"
                        value={fechaHasta}
                        onChange={(e) => setFechaHasta(e.target.value)}
                        className="text-xs"
                    />
                </div>

                {/* Cascada: Centro de Salud */}
                <div className="space-y-1">
                    <label htmlFor={centroIdField} className="text-xs font-medium text-muted-foreground">
                        Centro de Salud
                    </label>
                    <Select
                        id={centroIdField}
                        value={centroId}
                        onChange={(e) => handleCentroChange(e.target.value)}
                    >
                        <option value="todos">Todos los centros</option>
                        {centros.map((c) => (
                            <option key={c.id} value={c.id}>
                                {c.nombre}
                            </option>
                        ))}
                    </Select>
                </div>

                {/* Cascada: Bodega */}
                <div className="space-y-1">
                    <label htmlFor={bodegaIdField} className="text-xs font-medium text-muted-foreground">
                        Bodega
                    </label>
                    <Select
                        id={bodegaIdField}
                        value={bodegaId}
                        onChange={(e) => handleBodegaChange(e.target.value)}
                    >
                        <option value="todas">Todas las bodegas</option>
                        {bodegasFiltradas.map((b) => (
                            <option key={b.id} value={b.id}>
                                {b.nombre}
                            </option>
                        ))}
                    </Select>
                </div>

                {/* Cascada: Usuario */}
                <div className="space-y-1">
                    <label htmlFor={usuarioIdField} className="text-xs font-medium text-muted-foreground">
                        Usuario
                    </label>
                    <Select
                        id={usuarioIdField}
                        value={usuarioId}
                        onChange={(e) => setUsuarioId(e.target.value)}
                    >
                        <option value="todos">Todos los usuarios</option>
                        {usuariosFiltrados.map((u) => (
                            <option key={u.id} value={u.id}>
                                {u.nombre} {u.apPaterno ?? ""} ({u.email})
                            </option>
                        ))}
                    </Select>
                </div>

                {/* Acción */}
                <div className="space-y-1">
                    <label htmlFor={accionField} className="text-xs font-medium text-muted-foreground">
                        Acción
                    </label>
                    <Select
                        id={accionField}
                        value={accion}
                        onChange={(e) => setAccion(e.target.value as any)}
                    >
                        <option value="todas">Todas las acciones</option>
                        <option value="crear">Crear</option>
                        <option value="actualizar">Actualizar</option>
                        <option value="eliminar">Eliminar</option>
                    </Select>
                </div>

                {/* Entidad */}
                <div className="space-y-1">
                    <label htmlFor={entidadField} className="text-xs font-medium text-muted-foreground">
                        Entidad Afectada
                    </label>
                    <Select
                        id={entidadField}
                        value={entidad}
                        onChange={(e) => setEntidad(e.target.value as any)}
                    >
                        <option value="todas">Todas las entidades</option>
                        <option value="OrdenSalida">Orden de Salida</option>
                        <option value="OrdenEntrada">Orden de Entrada</option>
                        <option value="Producto">Producto</option>
                        <option value="Usuario">Usuario</option>
                        <option value="Centro">Centro de Salud</option>
                        <option value="Bodega">Bodega</option>
                        <option value="Unidad">Unidad</option>
                    </Select>
                </div>

                {/* Botones de Control */}
                <div className="flex items-end gap-2">
                    <Button type="submit" size="sm" className="gap-1.5 flex-1">
                        <Filter className="h-3.5 w-3.5" />
                        Filtrar
                    </Button>
                    <Button
                        type="button"
                        variant="outline"
                        size="sm"
                        onClick={handleLimpiar}
                        className="gap-1.5"
                        title="Restablecer filtros a valores por defecto"
                    >
                        <RotateCcw className="h-3.5 w-3.5" />
                        Limpiar
                    </Button>
                </div>
            </div>
        </form>
    );
}
