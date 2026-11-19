"use client";

import * as React from "react";
import { useMemo, useState, useTransition } from "react";
import type { Centro } from "@prisma/client";
import { Edit2, Plus, Power, Search } from "lucide-react";
import { toast } from "sonner";

// actions
import { toggleEstadoCentro } from "@/modules/mantenedores/actions/mantenedores.action";

// components
import { CentroFormModal } from "@/modules/mantenedores/components/centros/centro-form-modal";
import { Badge } from "@/shared/components/ui/badge";
import { Button } from "@/shared/components/ui/button";
import { Input } from "@/shared/components/ui/input";
import { Select } from "@/shared/components/ui/select";
import { Table, Td, Th } from "@/shared/components/ui/table";

// types
import { initialActionState } from "@/shared/types/action-state";

interface CentrosTablaProps {
    centros: Centro[];
}

export function CentrosTabla({ centros }: CentrosTablaProps): React.ReactElement {
    const [busqueda, setBusqueda] = useState("");
    const [filtroEstado, setFiltroEstado] = useState<"todos" | "activos" | "inactivos">("todos");
    const [modalAbierto, setModalAbierto] = useState(false);
    const [centroEditar, setCentroEditar] = useState<Centro | null>(null);
    const [isPending, startTransition] = useTransition();

    const centrosFiltrados = useMemo(() => {
        return centros.filter((centro) => {
            const coincideTexto = centro.nombre.toLowerCase().includes(busqueda.toLowerCase());
            if (!coincideTexto) return false;

            if (filtroEstado === "activos") return centro.estado;
            if (filtroEstado === "inactivos") return !centro.estado;
            return true;
        });
    }, [centros, busqueda, filtroEstado]);

    function abrirCrear(): void {
        setCentroEditar(null);
        setModalAbierto(true);
    }

    function abrirEditar(centro: Centro): void {
        setCentroEditar(centro);
        setModalAbierto(true);
    }

    function handleToggleEstado(centro: Centro): void {
        const nuevoEstado = !centro.estado;
        const confirmMsg = nuevoEstado
            ? `¿Deseas activar el centro "${centro.nombre}"?`
            : `¿Deseas desactivar el centro "${centro.nombre}"? No podrá recibir ni emitir movimientos mientras esté inactivo.`;

        if (!window.confirm(confirmMsg)) return;

        const formData = new FormData();
        formData.append("id", centro.id);
        formData.append("estado", String(nuevoEstado));

        startTransition(async () => {
            const res = await toggleEstadoCentro(initialActionState, formData);
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
                            placeholder="Buscar centro por nombre…"
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
                        <option value="activos">Activos</option>
                        <option value="inactivos">Inactivos</option>
                    </Select>
                </div>
                <Button onClick={abrirCrear} className="shrink-0 gap-1.5">
                    <Plus className="h-4 w-4" />
                    Nuevo Centro
                </Button>
            </div>

            <div className="overflow-x-auto rounded-md border bg-card">
                <Table>
                    <thead>
                        <tr>
                            <Th>Nombre</Th>
                            <Th className="w-32">Estado</Th>
                            <Th className="w-28 text-right">Acciones</Th>
                        </tr>
                    </thead>
                    <tbody>
                        {centrosFiltrados.length === 0 ? (
                            <tr>
                                <Td colSpan={3} className="text-center py-8 text-muted-foreground">
                                    No se encontraron centros de salud.
                                </Td>
                            </tr>
                        ) : (
                            centrosFiltrados.map((centro) => (
                                <tr key={centro.id} className="hover:bg-muted/40 transition-colors">
                                    <Td className="font-medium">{centro.nombre}</Td>
                                    <Td>
                                        <Badge tone={centro.estado ? "success" : "muted"}>
                                            {centro.estado ? "Activo" : "Inactivo"}
                                        </Badge>
                                    </Td>
                                    <Td className="text-right">
                                        <div className="flex items-center justify-end gap-1">
                                            <Button
                                                variant="ghost"
                                                size="sm"
                                                className="h-8 w-8 p-0"
                                                onClick={() => abrirEditar(centro)}
                                                title="Editar centro"
                                                aria-label={`Editar ${centro.nombre}`}
                                            >
                                                <Edit2 className="h-4 w-4 text-muted-foreground" />
                                            </Button>
                                            <Button
                                                variant="ghost"
                                                size="sm"
                                                className="h-8 w-8 p-0"
                                                onClick={() => handleToggleEstado(centro)}
                                                disabled={isPending}
                                                title={centro.estado ? "Desactivar centro" : "Activar centro"}
                                                aria-label={`${centro.estado ? "Desactivar" : "Activar"} ${centro.nombre}`}
                                            >
                                                <Power
                                                    className={`h-4 w-4 ${
                                                        centro.estado
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

            <CentroFormModal
                centro={centroEditar}
                isOpen={modalAbierto}
                onClose={() => {
                    setModalAbierto(false);
                    setCentroEditar(null);
                }}
            />
        </div>
    );
}
