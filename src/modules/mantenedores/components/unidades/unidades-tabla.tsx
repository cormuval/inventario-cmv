"use client";

import * as React from "react";
import { useMemo, useState, useTransition } from "react";
import type { Unidad } from "@prisma/client";
import { Edit2, Plus, Power, Search } from "lucide-react";
import { toast } from "sonner";

// actions
import { toggleEstadoUnidad } from "@/modules/mantenedores/actions/mantenedores.action";

// components
import { UnidadFormModal } from "@/modules/mantenedores/components/unidades/unidad-form-modal";
import { Badge } from "@/shared/components/ui/badge";
import { Button } from "@/shared/components/ui/button";
import { Input } from "@/shared/components/ui/input";
import { Select } from "@/shared/components/ui/select";
import { Table, Td, Th } from "@/shared/components/ui/table";

// types
import { initialActionState } from "@/shared/types/action-state";

interface UnidadesTablaProps {
    unidades: Unidad[];
}

export function UnidadesTabla({ unidades }: UnidadesTablaProps): React.ReactElement {
    const [busqueda, setBusqueda] = useState("");
    const [filtroEstado, setFiltroEstado] = useState<"todos" | "activos" | "inactivos">("todos");
    const [modalAbierto, setModalAbierto] = useState(false);
    const [unidadEditar, setUnidadEditar] = useState<Unidad | null>(null);
    const [isPending, startTransition] = useTransition();

    const unidadesFiltradas = useMemo(() => {
        return unidades.filter((unidad) => {
            const coincideTexto = unidad.descripcion.toLowerCase().includes(busqueda.toLowerCase());
            if (!coincideTexto) return false;

            if (filtroEstado === "activos") return unidad.estado;
            if (filtroEstado === "inactivos") return !unidad.estado;
            return true;
        });
    }, [unidades, busqueda, filtroEstado]);

    function abrirCrear(): void {
        setUnidadEditar(null);
        setModalAbierto(true);
    }

    function abrirEditar(unidad: Unidad): void {
        setUnidadEditar(unidad);
        setModalAbierto(true);
    }

    function handleToggleEstado(unidad: Unidad): void {
        const nuevoEstado = !unidad.estado;
        const confirmMsg = nuevoEstado
            ? `¿Deseas activar la unidad "${unidad.descripcion}"?`
            : `¿Deseas desactivar la unidad "${unidad.descripcion}"? No aparecerá en los nuevos registros de salida.`;

        if (!window.confirm(confirmMsg)) return;

        const formData = new FormData();
        formData.append("id", unidad.id);
        formData.append("estado", String(nuevoEstado));

        startTransition(async () => {
            const res = await toggleEstadoUnidad(initialActionState, formData);
            if (res.ok) {
                toast.success(res.message);
            } else {
                toast.error(res.message);
            }
        });
    }

    return (
        <div className="space-y-4">
            <div className="flex flex-col sm:flex-row items-stretch sm:items-center justify-between gap-3">
                <div className="flex flex-1 items-center gap-2">
                    <div className="relative flex-1 max-w-sm">
                        <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
                        <Input
                            placeholder="Buscar unidad o servicio…"
                            value={busqueda}
                            onChange={(e) => setBusqueda(e.target.value)}
                            className="pl-8"
                        />
                    </div>
                    <Select
                        value={filtroEstado}
                        onChange={(e) => setFiltroEstado(e.target.value as "todos" | "activos" | "inactivos")}
                        className="w-36"
                    >
                        <option value="todos">Todos</option>
                        <option value="activos">Activas</option>
                        <option value="inactivos">Inactivas</option>
                    </Select>
                </div>
                <Button onClick={abrirCrear} className="shrink-0 gap-1.5">
                    <Plus className="h-4 w-4" />
                    Nueva Unidad
                </Button>
            </div>

            <div className="overflow-x-auto rounded-md border bg-card">
                <Table>
                    <thead>
                        <tr>
                            <Th>Descripción</Th>
                            <Th className="w-32">Estado</Th>
                            <Th className="w-28 text-right">Acciones</Th>
                        </tr>
                    </thead>
                    <tbody>
                        {unidadesFiltradas.length === 0 ? (
                            <tr>
                                <Td colSpan={3} className="text-center py-8 text-muted-foreground">
                                    No se encontraron unidades o servicios.
                                </Td>
                            </tr>
                        ) : (
                            unidadesFiltradas.map((unidad) => (
                                <tr key={unidad.id} className="hover:bg-muted/40 transition-colors">
                                    <Td className="font-medium">{unidad.descripcion}</Td>
                                    <Td>
                                        <Badge tone={unidad.estado ? "success" : "muted"}>
                                            {unidad.estado ? "Activa" : "Inactiva"}
                                        </Badge>
                                    </Td>
                                    <Td className="text-right">
                                        <div className="flex items-center justify-end gap-1">
                                            <Button
                                                variant="ghost"
                                                size="sm"
                                                className="h-8 w-8 p-0"
                                                onClick={() => abrirEditar(unidad)}
                                                title="Editar unidad"
                                                aria-label={`Editar ${unidad.descripcion}`}
                                            >
                                                <Edit2 className="h-4 w-4 text-muted-foreground" />
                                            </Button>
                                            <Button
                                                variant="ghost"
                                                size="sm"
                                                className="h-8 w-8 p-0"
                                                onClick={() => handleToggleEstado(unidad)}
                                                disabled={isPending}
                                                title={unidad.estado ? "Desactivar unidad" : "Activar unidad"}
                                                aria-label={`${unidad.estado ? "Desactivar" : "Activar"} ${unidad.descripcion}`}
                                            >
                                                <Power
                                                    className={`h-4 w-4 ${
                                                        unidad.estado
                                                            ? "text-emerald-600 hover:text-emerald-700"
                                                            : "text-muted-foreground hover:text-foreground"
                                                    }`}
                                                />
                                            </Button>
                                        </div>
                                    </Td>
                                </tr>
                            ))
                        )}
                    </tbody>
                </Table>
            </div>

            <UnidadFormModal
                unidad={unidadEditar}
                isOpen={modalAbierto}
                onClose={() => {
                    setModalAbierto(false);
                    setUnidadEditar(null);
                }}
            />
        </div>
    );
}
