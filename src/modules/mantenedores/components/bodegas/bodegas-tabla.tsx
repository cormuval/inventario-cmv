"use client";

import * as React from "react";
import { useMemo, useState, useTransition } from "react";
import type { Bodega, Centro } from "@prisma/client";
import { Edit2, Plus, Power, Search } from "lucide-react";
import { toast } from "sonner";

// actions
import { toggleEstadoBodega } from "@/modules/mantenedores/actions/mantenedores.action";

// components
import { BodegaFormModal } from "@/modules/mantenedores/components/bodegas/bodega-form-modal";
import { Badge } from "@/shared/components/ui/badge";
import { Button } from "@/shared/components/ui/button";
import { Input } from "@/shared/components/ui/input";
import { Select } from "@/shared/components/ui/select";
import { Table, Td, Th } from "@/shared/components/ui/table";

// types
import { initialActionState } from "@/shared/types/action-state";

export type BodegaConCentro = Bodega & { centro?: Centro | null };

interface BodegasTablaProps {
    bodegas: BodegaConCentro[];
    centros: Centro[];
}

export function BodegasTabla({ bodegas, centros }: BodegasTablaProps): React.ReactElement {
    const [busqueda, setBusqueda] = useState("");
    const [filtroCentroId, setFiltroCentroId] = useState<string>("todos");
    const [filtroEstado, setFiltroEstado] = useState<"todos" | "activos" | "inactivos">("todos");
    const [modalAbierto, setModalAbierto] = useState(false);
    const [bodegaEditar, setBodegaEditar] = useState<BodegaConCentro | null>(null);
    const [isPending, startTransition] = useTransition();

    const bodegasFiltradas = useMemo(() => {
        return bodegas.filter((bodega) => {
            const coincideTexto =
                bodega.nombre.toLowerCase().includes(busqueda.toLowerCase()) ||
                (bodega.centro?.nombre ?? "").toLowerCase().includes(busqueda.toLowerCase());
            if (!coincideTexto) return false;

            if (filtroCentroId !== "todos" && bodega.centroId !== filtroCentroId) {
                return false;
            }

            if (filtroEstado === "activos") return bodega.estado;
            if (filtroEstado === "inactivos") return !bodega.estado;
            return true;
        });
    }, [bodegas, busqueda, filtroCentroId, filtroEstado]);

    function abrirCrear(): void {
        setBodegaEditar(null);
        setModalAbierto(true);
    }

    function abrirEditar(bodega: BodegaConCentro): void {
        setBodegaEditar(bodega);
        setModalAbierto(true);
    }

    function handleToggleEstado(bodega: BodegaConCentro): void {
        const nuevoEstado = !bodega.estado;
        const confirmMsg = nuevoEstado
            ? `¿Deseas activar la bodega "${bodega.nombre}"?`
            : `¿Deseas desactivar la bodega "${bodega.nombre}"? Verifique que no mantenga existencias de stock disponibles.`;

        if (!window.confirm(confirmMsg)) return;

        const formData = new FormData();
        formData.append("id", bodega.id);
        formData.append("estado", String(nuevoEstado));

        startTransition(async () => {
            const res = await toggleEstadoBodega(initialActionState, formData);
            if (res.ok) {
                toast.success(res.message);
            } else {
                toast.error(res.message);
            }
        });
    }

    return (
        <div className="space-y-4">
            <div className="flex flex-col md:flex-row items-stretch md:items-center justify-between gap-3">
                <div className="flex flex-1 flex-wrap items-center gap-2">
                    <div className="relative flex-1 min-w-[200px] max-w-sm">
                        <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
                        <Input
                            placeholder="Buscar bodega o centro…"
                            value={busqueda}
                            onChange={(e) => setBusqueda(e.target.value)}
                            className="pl-8"
                        />
                    </div>
                    <Select
                        value={filtroCentroId}
                        onChange={(e) => setFiltroCentroId(e.target.value)}
                        className="w-48"
                    >
                        <option value="todos">Todos los centros</option>
                        {centros.map((c) => (
                            <option key={c.id} value={c.id}>
                                {c.nombre}
                            </option>
                        ))}
                    </Select>
                    <Select
                        value={filtroEstado}
                        onChange={(e) => setFiltroEstado(e.target.value as "todos" | "activos" | "inactivos")}
                        className="w-36"
                    >
                        <option value="todos">Todos los estados</option>
                        <option value="activos">Activas</option>
                        <option value="inactivos">Inactivas</option>
                    </Select>
                </div>
                <Button onClick={abrirCrear} className="shrink-0 gap-1.5">
                    <Plus className="h-4 w-4" />
                    Nueva Bodega
                </Button>
            </div>

            <div className="overflow-x-auto rounded-md border bg-card">
                <Table>
                    <thead>
                        <tr>
                            <Th>Nombre</Th>
                            <Th>Centro de Salud</Th>
                            <Th className="w-32">Estado</Th>
                            <Th className="w-28 text-right">Acciones</Th>
                        </tr>
                    </thead>
                    <tbody>
                        {bodegasFiltradas.length === 0 ? (
                            <tr>
                                <Td colSpan={4} className="text-center py-8 text-muted-foreground">
                                    No se encontraron bodegas registradas.
                                </Td>
                            </tr>
                        ) : (
                            bodegasFiltradas.map((bodega) => (
                                <tr key={bodega.id} className="hover:bg-muted/40 transition-colors">
                                    <Td className="font-medium">{bodega.nombre}</Td>
                                    <Td className="text-muted-foreground">
                                        {bodega.centro?.nombre ?? "Sin centro asignado"}
                                    </Td>
                                    <Td>
                                        <Badge tone={bodega.estado ? "success" : "muted"}>
                                            {bodega.estado ? "Activa" : "Inactiva"}
                                        </Badge>
                                    </Td>
                                    <Td className="text-right">
                                        <div className="flex items-center justify-end gap-1">
                                            <Button
                                                variant="ghost"
                                                size="sm"
                                                className="h-8 w-8 p-0"
                                                onClick={() => abrirEditar(bodega)}
                                                title="Editar bodega"
                                                aria-label={`Editar ${bodega.nombre}`}
                                            >
                                                <Edit2 className="h-4 w-4 text-muted-foreground" />
                                            </Button>
                                            <Button
                                                variant="ghost"
                                                size="sm"
                                                className="h-8 w-8 p-0"
                                                onClick={() => handleToggleEstado(bodega)}
                                                disabled={isPending}
                                                title={bodega.estado ? "Desactivar bodega" : "Activar bodega"}
                                                aria-label={`${bodega.estado ? "Desactivar" : "Activar"} ${bodega.nombre}`}
                                            >
                                                <Power
                                                    className={`h-4 w-4 ${
                                                        bodega.estado
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

            <BodegaFormModal
                bodega={bodegaEditar}
                centros={centros}
                isOpen={modalAbierto}
                onClose={() => {
                    setModalAbierto(false);
                    setBodegaEditar(null);
                }}
            />
        </div>
    );
}
