import type * as React from "react";
import Link from "next/link";
import { Eye } from "lucide-react";

// components
import { BotonDescargarPedido } from "@/modules/pedidos/components/boton-descargar-pedido";
import { Badge } from "@/shared/components/ui/badge";
import { Table, Td, Th } from "@/shared/components/ui/table";

// types
import type { PedidoFilaLista } from "@/modules/pedidos/actions/consultar-pedidos.action";

// utils
import { formatDate } from "@/shared/utils/format";

interface PedidosTablaProps {
    pedidos: PedidoFilaLista[];
    esAdquisiciones: boolean;
}

function renderBadgeEstado(estado: string): React.ReactElement {
    switch (estado) {
        case "BORRADOR":
            return <Badge tone="default">Borrador</Badge>;
        case "ENVIADO":
            return <Badge tone="muted">Enviado</Badge>;
        case "REVISADO":
            return <Badge tone="success">Revisado / Aprobado</Badge>;
        case "ANULADO":
            return <Badge tone="danger">Anulado</Badge>;
        default:
            return <Badge tone="default">{estado}</Badge>;
    }
}

export function PedidosTabla({ pedidos, esAdquisiciones }: PedidosTablaProps): React.ReactElement {
    if (pedidos.length === 0) {
        return (
            <div className="rounded-md border border-dashed p-8 text-center text-sm text-muted-foreground">
                No se encontraron pedidos de existencias con los filtros seleccionados.
            </div>
        );
    }

    return (
        <div className="overflow-x-auto rounded-md border">
            <Table>
                <thead>
                    <tr>
                        <Th>N° Pedido</Th>
                        <Th>Tipo</Th>
                        <Th>Período</Th>
                        <Th>Centro</Th>
                        <Th>Fecha Solicitud</Th>
                        <Th>Solicitante</Th>
                        <Th className="text-right">Ítems</Th>
                        <Th className="text-right">Solicitado</Th>
                        <Th className="text-right">Aprobado</Th>
                        <Th>Estado</Th>
                        <Th className="text-right">Acciones</Th>
                    </tr>
                </thead>
                <tbody>
                    {pedidos.map((p) => (
                        <tr key={p.id} className="hover:bg-muted/40 transition-colors">
                            <Td className="font-mono font-semibold text-xs whitespace-nowrap">
                                <Link
                                    href={`/pedidos/${p.id}`}
                                    className="text-primary hover:underline"
                                    title="Ver detalle del pedido"
                                >
                                    {p.numero}
                                </Link>
                            </Td>
                            <Td className="text-xs whitespace-nowrap">
                                <span className={p.tipo === "SUPLEMENTARIO" ? "font-semibold text-amber-700" : ""}>
                                    {p.tipo}
                                </span>
                            </Td>
                            <Td className="text-xs whitespace-nowrap">{p.periodo || "—"}</Td>
                            <Td className="text-xs font-medium">{p.centroNombre}</Td>
                            <Td className="text-xs whitespace-nowrap text-muted-foreground">
                                {formatDate(p.fechaSolicitud)}
                            </Td>
                            <Td className="text-xs text-muted-foreground truncate max-w-[150px]">
                                {p.solicitanteNombre}
                            </Td>
                            <Td className="text-right text-xs">{p.totalItems}</Td>
                            <Td className="text-right text-xs font-semibold">{p.totalUnidadesSolicitadas}</Td>
                            <Td className="text-right text-xs font-bold text-emerald-600">
                                {p.totalUnidadesAprobadas !== null ? p.totalUnidadesAprobadas : "—"}
                            </Td>
                            <Td className="whitespace-nowrap">{renderBadgeEstado(p.estado)}</Td>
                            <Td className="text-right whitespace-nowrap">
                                <div className="inline-flex items-center gap-2">
                                    <Link
                                        href={`/pedidos/${p.id}`}
                                        className="inline-flex items-center gap-1 rounded border border-input bg-background px-2 py-1 text-xs font-medium hover:bg-accent hover:text-accent-foreground"
                                    >
                                        <Eye className="h-3.5 w-3.5" />
                                        <span>{p.estado === "ENVIADO" && esAdquisiciones ? "Revisar" : "Ver"}</span>
                                    </Link>
                                    <BotonDescargarPedido pedidoId={p.id} numero={p.numero} />
                                </div>
                            </Td>
                        </tr>
                    ))}
                </tbody>
            </Table>
        </div>
    );
}

