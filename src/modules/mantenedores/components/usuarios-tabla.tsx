"use client";

import * as React from "react";
import { useState, useTransition } from "react";
import type { Bodega, Centro, Rol } from "@prisma/client";
import { Edit2, Power } from "lucide-react";

// actions
import { toggleEstadoUsuario } from "@/modules/mantenedores/actions/mantenedores.action";

// components
import {
    UsuarioEditModal,
    type UsuarioConDetalles
} from "@/modules/mantenedores/components/usuario-edit-modal";
import { Badge } from "@/shared/components/ui/badge";
import { Button } from "@/shared/components/ui/button";
import { Td, Th, Table } from "@/shared/components/ui/table";

// types
import { initialActionState } from "@/shared/types/action-state";
import { toast } from "sonner";

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
    const [editingUser, setEditingUser] = useState<UsuarioTablaItem | null>(null);
    const [isPending, startTransition] = useTransition();

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
        <>
            <div className="overflow-x-auto">
                <Table>
                    <thead>
                        <tr>
                            <Th>Nombre</Th>
                            <Th>Email</Th>
                            <Th>Rol</Th>
                            <Th>Centro</Th>
                            <Th>Bodegas Asignadas</Th>
                            <Th>Estado</Th>
                            <Th className="text-right">Acciones</Th>
                        </tr>
                    </thead>
                    <tbody>
                        {usuarios.map((usuario) => {
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
                                        <Badge tone={usuario.estado ? "success" : "danger"}>
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
                        })}
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
        </>
    );
}
