import type * as React from "react";

// actions
import type { RegistroSalidaFila } from "@/modules/orden-salida/actions/registros-salida.action";

// components
import { BotonDescargarComprobante } from "@/modules/orden-salida/components/boton-descargar-comprobante";
import { BotonEnviarComprobante } from "@/modules/orden-salida/components/boton-enviar-comprobante";
import { EstadoCorreoBadge } from "@/modules/orden-salida/components/estado-correo-badge";
import { VerDetalleOrden } from "@/shared/components/inventario/ver-detalle-orden";
import { Table, Td, Th } from "@/shared/components/ui/table";

// utils
import { formatDate } from "@/shared/utils/format";
import { formatearResumenDetalles } from "@/shared/utils/registros";

export function RegistrosSalidaTabla({ filas, puedeOperar }: { filas: RegistroSalidaFila[]; puedeOperar: boolean }): React.ReactElement {
    return (
        <Table>
            <thead>
                <tr>
                    <Th>Fecha</Th>
                    <Th>Tipo</Th>
                    <Th>Destino</Th>
                    <Th>Bodega</Th>
                    <Th>Usuario</Th>
                    <Th>Productos</Th>
                    <Th>Correo</Th>
                    <Th className="text-right">Acciones</Th>
                </tr>
            </thead>
            <tbody>
                {filas.map((fila) => (
                    <tr key={fila.id}>
                        <Td>{formatDate(fila.fecha)}</Td>
                        <Td>{fila.tipoSalida}</Td>
                        <Td>{fila.destino}</Td>
                        <Td>{fila.bodegaNombre}</Td>
                        <Td>{fila.usuarioNombre}</Td>
                        <Td className="whitespace-nowrap">{formatearResumenDetalles(fila)}</Td>
                        <Td>
                            <EstadoCorreoBadge
                                enviado={fila.enviarCorreo}
                                fechaEnvio={fila.fechaEnvioCorreo}
                                error={fila.errorEnvioCorreo}
                                correoDestino={fila.correoDestino}
                            />
                        </Td>
                        <Td className="text-right">
                            <div className="flex justify-end gap-2">
                                <VerDetalleOrden ordenId={fila.id} tipo="salida" />
                                <BotonDescargarComprobante ordenId={fila.id} size="sm" />
                                {puedeOperar ? <BotonEnviarComprobante ordenId={fila.id} correoInicial={fila.correoDestino} /> : null}
                            </div>
                        </Td>
                    </tr>
                ))}
                {filas.length === 0 ? (
                    <tr>
                        <Td colSpan={8} className="text-muted-foreground">
                            No hay salidas para los filtros seleccionados.
                        </Td>
                    </tr>
                ) : null}
            </tbody>
        </Table>
    );
}

