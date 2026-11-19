"use client";

import * as React from "react";
import { useMemo, useState, useTransition } from "react";
import type { Bodega, Centro, Rol } from "@prisma/client";
import { Edit2, Plus, Power, Search } from "lucide-react";
import { toast } from "sonner";

// actions
import { toggleEstadoUsuario } from "@/modules/mantenedores/actions/mantenedores.action";

// components
import { UsuarioFormModal } from "@/modules/mantenedores/components/usuarios/usuario-form-modal";
import {
    UsuarioEditModal,
    type UsuarioConDetalles
} from "@/modules/mantenedores/components/usuario-edit-modal";
import { Badge } from "@/shared/components/ui/badge";
import { Button } from "@/shared/components/ui/button";
import { Input } from "@/shared/components/ui/input";
import { Select } from "@/shared/components/ui/select";
import { Td, Th, Table } from "@/shared/components/ui/table";

// types
import { initialActionState } from "@/shared/types/action-state";

export interface UsuarioTablaItem extends UsuarioConDetalles {
    rol: Rol;
    centro: Centro;
    bodega?: Bodega | null;
}

interface UsuariosTablaProps {
    usuarios: UsuarioTablaItem[];
    currentUserId: string;
    centros: Centro[];
    bodegas: Bodega[];
    roles: Rol[];
}

export function UsuariosTabla({
    usuarios,
    currentUserId,
    centros,
    bodegas,
    roles
}: UsuariosTablaProps): React.ReactElement {
    const [busqueda, setBusqueda] = useState("");
    const [filtroEstado, setFiltroEstado] = useState<"todos" | "activos" | "inactivos">("todos");
    const [editingUser, setEditingUser] = useState<UsuarioTablaItem | null>(null);
    const [modalCrearAbierto, setModalCrearAbierto] = useState(false);
    const [isPending, startTransition] = useTransition();

    const usuariosFiltrados = useMemo(() => {
        return usuarios.filter((usuario) => {
            const termino = busqueda.toLowerCase();
            const coincideTexto =
                `${usuario.nombre} ${usuario.apPaterno ?? ""}`.toLowerCase().includes(termino) ||
                usuario.email.toLowerCase().includes(termino) ||
                usuario.rol.descripcion.toLowerCase().includes(termino) ||
                usuario.centro.nombre.toLowerCase().includes(termino);

            if (!coincideTexto) return false;

            if (filtroEstado === "activos") return usuario.estado;
            if (filtroEstado === "inactivos") return !usuario.estado;
            return true;
        });
    }, [usuarios, busqueda, filtroEstado]);

    const handleToggleEstado = (usuario: UsuarioTablaItem) => {
        if (usuario.id === currentUserId) return;
        const nuevoEstado = !usuario.estado;
        const confirmMsg = nuevoEstado
            ? `¿Deseas activar al usuario ${usuario.email}? Podrá volver a iniciar sesión.`
            : `¿Deseas desactivar al usuario ${usuario.email}? Perderá el acceso de inmediato.`;

        if (!window.confirm(confirmMsg)) return;

        const formData = new FormData();
        formData.append("id", usuario.id);
        formData.append("estado", String(nuevoEstado));

        startTransition(async () => {
            const resultado = await toggleEstadoUsuario(initialActionState, formData);
            if (resultado.ok) {
                toast.success(resultado.message);
            } else {
                toast.error(resultado.message);
            }
        });
    };

    return (
        <div className="space-y-4">
            <div className="flex flex-col sm:flex-row items-stretch sm:items-center justify-between gap-3">
                <div className="flex flex-1 items-center gap-2">
                    <div className="relative flex-1 max-w-sm">
                        <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
                        <Input
                            placeholder="Buscar por nombre, email o centro…"
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
                <Button onClick={() => setModalCrearAbierto(true)} className="shrink-0 gap-1.5">
                    <Plus className="h-4 w-4" />
                    Nuevo Usuario
                </Button>
            </div>

            <div className="overflow-x-auto rounded-md border bg-card">
                <Table>
                    <thead>
                        <tr>
                            <Th>Nombre</Th>
                            <Th>Email</Th>
                            <Th>Rol</Th>
                            <Th>Centro</Th>
                            <Th>Bodegas Asignadas</Th>
                            <Th className="w-32">Estado</Th>
                            <Th className="w-28 text-right">Acciones</Th>
                        </tr>
                    </thead>
                    <tbody>
                        {usuariosFiltrados.length === 0 ? (
                            <tr>
                                <Td colSpan={7} className="text-center py-8 text-muted-foreground">
                                    No se encontraron usuarios.
                                </Td>
                            </tr>
                        ) : (
                            usuariosFiltrados.map((usuario) => {
                                const isSelf = usuario.id === currentUserId;
                                const encargos = usuario.encargos ?? [];

                                return (
                                    <tr key={usuario.id} className="hover:bg-muted/40 transition-colors">
                                        <Td className="font-medium">
                                            {usuario.nombre} {usuario.apPaterno}
                                            {isSelf && (
                                                <span className="ml-2 inline-flex items-center text-[10px] font-semibold text-primary">
                                                    (Tú)
                                                </span>
                                            )}
                                        </Td>
                                        <Td>{usuario.email}</Td>
                                        <Td>
                                            <Badge tone="muted" className="text-xs">
                                                {usuario.rol.descripcion}
                                            </Badge>
                                        </Td>
                                        <Td>{usuario.centro.nombre}</Td>
                                        <Td>
                                            <div className="flex max-w-xs flex-wrap gap-1">
                                                {encargos.length > 0 ? (
                                                    encargos.map((e) => (
                                                        <Badge
                                                            key={e.bodegaId}
                                                            tone="default"
                                                            className="text-[11px] font-normal"
                                                        >
                                                            {e.bodega?.nombre ?? e.bodegaId}
                                                        </Badge>
                                                    ))
                                                ) : usuario.bodega ? (
                                                    <Badge
                                                        tone="default"
                                                        className="text-[11px] font-normal"
                                                    >
                                                        {usuario.bodega.nombre}
                                                    </Badge>
                                                ) : (
                                                    <span className="text-xs italic text-muted-foreground">
                                                        Sin bodega
                                                    </span>
                                                )}
                                            </div>
                                        </Td>
                                        <Td>
                                            <Badge tone={usuario.estado ? "success" : "muted"}>
                                                {usuario.estado ? "Activo" : "Inactivo"}
                                            </Badge>
                                        </Td>
                                        <Td className="text-right">
                                            <div className="flex items-center justify-end gap-1.5">
                                                <Button
                                                    type="button"
                                                    variant="outline"
                                                    size="sm"
                                                    onClick={() => setEditingUser(usuario)}
                                                    className="h-8 gap-1 px-2.5 text-xs"
                                                    aria-label={`Editar ${usuario.email}`}
                                                >
                                                    <Edit2 className="h-3.5 w-3.5" />
                                                    Editar
                                                </Button>

                                                {isSelf ? (
                                                    <Button
                                                        type="button"
                                                        variant="ghost"
                                                        size="sm"
                                                        disabled
                                                        className="h-8 px-2 text-xs text-muted-foreground opacity-50"
                                                        title="No puedes desactivar tu propia cuenta"
                                                    >
                                                        Propia
                                                    </Button>
                                                ) : (
                                                    <Button
                                                        type="button"
                                                        variant="outline"
                                                        size="sm"
                                                        disabled={isPending}
                                                        onClick={() => handleToggleEstado(usuario)}
                                                        className={
                                                            usuario.estado
                                                                ? "h-8 gap-1 px-2.5 text-xs text-destructive hover:bg-destructive/10 hover:text-destructive"
                                                                : "h-8 gap-1 px-2.5 text-xs text-emerald-600 hover:bg-emerald-50 hover:text-emerald-700"
                                                        }
                                                        aria-label={
                                                            usuario.estado
                                                                ? `Desactivar ${usuario.email}`
                                                                : `Activar ${usuario.email}`
                                                        }
                                                    >
                                                        <Power className="h-3.5 w-3.5" />
                                                        {usuario.estado ? "Desactivar" : "Activar"}
                                                    </Button>
                                                )}
                                            </div>
                                        </Td>
                                    </tr>
                                );
                            })
                        )}
                    </tbody>
                </Table>
            </div>

            {editingUser && (
                <UsuarioEditModal
                    usuario={editingUser}
                    currentUserId={currentUserId}
                    centros={centros}
                    bodegas={bodegas}
                    roles={roles}
                    onClose={() => setEditingUser(null)}
                />
            )}

            <UsuarioFormModal
                centros={centros}
                bodegas={bodegas}
                roles={roles}
                isOpen={modalCrearAbierto}
                onClose={() => setModalCrearAbierto(false)}
            />
        </div>
    );
}
