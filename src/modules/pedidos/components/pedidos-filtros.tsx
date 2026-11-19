"use client";

import type * as React from "react";
import { useRouter } from "next/navigation";
import { Search, X } from "lucide-react";

// components
import { Button } from "@/shared/components/ui/button";
import { Input } from "@/shared/components/ui/input";
import { Select } from "@/shared/components/ui/select";

// utils
import { crearHrefConParametros } from "@/shared/utils/paginacion";

interface PedidosFiltrosProps {
    centros: Array<{ id: string; nombre: string }>;
    centroId: string | null;
    tipo?: string;
    estado?: string;
    periodo?: string;
    busqueda?: string;
    puedeFiltrarCentro: boolean;
}

export function PedidosFiltros({
    centros,
    centroId,
    tipo = "",
    estado = "",
    periodo = "",
    busqueda = "",
    puedeFiltrarCentro
}: PedidosFiltrosProps): React.ReactElement {
    const router = useRouter();

    function handleSubmit(e: React.FormEvent<HTMLFormElement>): void {
        e.preventDefault();
        const formData = new FormData(e.currentTarget);
        const params: Record<string, string> = {};

        const cId = formData.get("centroId")?.toString();
        if (cId && cId !== "todos") params.centroId = cId;

        const t = formData.get("tipo")?.toString();
        if (t) params.tipo = t;

        const est = formData.get("estado")?.toString();
        if (est) params.estado = est;

        const per = formData.get("periodo")?.toString();
        if (per) params.periodo = per;

        const b = formData.get("busqueda")?.toString();
        if (b && b.trim()) params.busqueda = b.trim();

        router.push(crearHrefConParametros("/pedidos", params));
    }

    function handleReset(): void {
        router.push("/pedidos");
    }

    return (
        <form onSubmit={handleSubmit} className="grid gap-3 sm:grid-cols-2 lg:grid-cols-5 items-end">
            {puedeFiltrarCentro ? (
                <label className="space-y-1 text-sm">
                    <span className="font-medium">Centro</span>
                    <Select name="centroId" defaultValue={centroId ?? "todos"}>
                        <option value="todos">Todos los centros</option>
                        {centros.map((c) => (
                            <option key={c.id} value={c.id}>
                                {c.nombre}
                            </option>
                        ))}
                    </Select>
                </label>
            ) : null}

            <label className="space-y-1 text-sm">
                <span className="font-medium">Tipo</span>
                <Select name="tipo" defaultValue={tipo}>
                    <option value="">Todos los tipos</option>
                    <option value="MENSUAL">Mensual</option>
                    <option value="SUPLEMENTARIO">Suplementario</option>
                </Select>
            </label>

            <label className="space-y-1 text-sm">
                <span className="font-medium">Estado</span>
                <Select name="estado" defaultValue={estado}>
                    <option value="">Todos los estados</option>
                    <option value="BORRADOR">Borrador</option>
                    <option value="FINALIZADO">Finalizado</option>
                    <option value="ANULADO">Anulado</option>
                </Select>
            </label>

            <label className="space-y-1 text-sm">
                <span className="font-medium">Período</span>
                <Input type="month" name="periodo" defaultValue={periodo} />
            </label>

            <label className="space-y-1 text-sm">
                <span className="font-medium">Buscar</span>
                <Input
                    name="busqueda"
                    type="search"
                    placeholder="N° pedido o texto..."
                    defaultValue={busqueda}
                />
            </label>

            <div className="flex items-center gap-2 sm:col-span-2 lg:col-span-5 justify-end pt-1">
                <Button type="button" variant="outline" size="sm" onClick={handleReset}>
                    <X className="h-4 w-4 mr-1" />
                    Limpiar
                </Button>
                <Button type="submit" variant="default" size="sm">
                    <Search className="h-4 w-4 mr-1" />
                    Filtrar
                </Button>
            </div>
        </form>
    );
}

