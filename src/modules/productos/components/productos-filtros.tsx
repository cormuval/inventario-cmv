import Link from "next/link";
import type * as React from "react";

// components
import { Input } from "@/shared/components/ui/input";
import { Select } from "@/shared/components/ui/select";

// types
import type { ProductosFiltros as ProductosFiltrosValores } from "@/modules/productos/utils/productos-filtros";

interface ProductosFiltrosProps {
    filtros: ProductosFiltrosValores;
    lineas: readonly string[];
}

export function ProductosFiltros({ filtros, lineas }: ProductosFiltrosProps): React.ReactElement {
    return (
        <form action="/productos" method="get" aria-label="Filtros de productos" className="grid gap-3 md:grid-cols-4">
            <label className="space-y-1 text-sm">
                <span>ID</span>
                <Input name="id" type="number" min="1" defaultValue={filtros.id ?? ""} />
            </label>
            <label className="space-y-1 text-sm">
                <span>Línea</span>
                <Select name="linea" defaultValue={filtros.linea}>
                    <option value="">Todas las líneas</option>
                    {lineas.map((linea) => (
                        <option key={linea} value={linea}>
                            {linea}
                        </option>
                    ))}
                </Select>
            </label>
            <label className="space-y-1 text-sm">
                <span>Estado</span>
                <Select name="estado" defaultValue={filtros.estado}>
                    <option value="todos">Todos los estados</option>
                    <option value="activo">Activo</option>
                    <option value="inactivo">Inactivo</option>
                </Select>
            </label>
            <label className="space-y-1 text-sm">
                <span>Descripción</span>
                <Input name="descripcion" defaultValue={filtros.descripcion} />
            </label>
            <div className="flex items-end gap-3 md:col-span-4">
                <button type="submit" className="rounded-md bg-teal-700 px-4 py-2 text-sm font-medium text-white hover:bg-teal-800">
                    Buscar
                </button>
                <Link href="/productos" className="text-sm text-teal-700 hover:underline">
                    Limpiar
                </Link>
            </div>
        </form>
    );
}
