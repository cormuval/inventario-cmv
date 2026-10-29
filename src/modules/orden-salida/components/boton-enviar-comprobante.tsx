"use client";

import type * as React from "react";
import { useId, useState } from "react";
import { Loader2, Mail, X } from "lucide-react";
import { toast } from "sonner";

// actions
import { reenviarComprobanteSalidaAction } from "@/modules/orden-salida/actions/orden-salida.action";

// components
import { Button } from "@/shared/components/ui/button";
import { Input } from "@/shared/components/ui/input";

interface BotonEnviarComprobanteProps {
    ordenId: string;
    correoInicial: string | null;
}

export function BotonEnviarComprobante({ ordenId, correoInicial }: BotonEnviarComprobanteProps): React.ReactElement {
    const [abierto, setAbierto] = useState(false);
    const [correo, setCorreo] = useState(correoInicial ?? "");
    const [enviando, setEnviando] = useState(false);
    const titleId = useId();
    const inputId = useId();

    const handleEnviar = async (event: React.FormEvent<HTMLFormElement>) => {
        event.preventDefault();
        try {
            setEnviando(true);
            const resultado = await reenviarComprobanteSalidaAction(ordenId, correo);
            if (resultado.ok) {
                toast.success(resultado.message);
                setAbierto(false);
            } else {
                toast.error(resultado.message);
            }
        } catch {
            toast.error("Ocurrió un error inesperado al enviar el comprobante");
        } finally {
            setEnviando(false);
        }
    };

    return (
        <>
            <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={() => {
                    setCorreo(correoInicial ?? "");
                    setAbierto(true);
                }}
                title="Enviar comprobante por correo"
                aria-label="Enviar comprobante"
            >
                <Mail className="h-3.5 w-3.5" />
                <span className="ml-1.5">Enviar</span>
            </Button>
            {abierto ? (
                <div
                    className="fixed inset-0 z-50 flex items-center justify-center bg-black/45 p-4"
                    role="dialog"
                    aria-modal="true"
                    aria-labelledby={titleId}
                >
                    <div className="w-full max-w-md overflow-hidden rounded-md border bg-background text-left shadow-lg">
                        <div className="flex items-center justify-between border-b px-4 py-3">
                            <h3 id={titleId} className="text-base font-semibold">
                                Enviar comprobante por correo
                            </h3>
                            <Button type="button" variant="ghost" size="sm" onClick={() => setAbierto(false)} aria-label="Cerrar modal">
                                <X className="h-4 w-4" />
                            </Button>
                        </div>
                        <form onSubmit={handleEnviar} className="space-y-3 p-4">
                            <label htmlFor={inputId} className="block space-y-1 text-sm">
                                <span>Correo destino</span>
                                <Input
                                    id={inputId}
                                    type="email"
                                    required
                                    value={correo}
                                    onChange={(event) => setCorreo(event.target.value)}
                                />
                            </label>
                            <div className="flex justify-end gap-2">
                                <Button type="button" variant="ghost" size="sm" onClick={() => setAbierto(false)}>
                                    Cancelar
                                </Button>
                                <Button type="submit" size="sm" disabled={enviando}>
                                    {enviando ? <Loader2 className="mr-1.5 h-3.5 w-3.5 animate-spin" /> : null}
                                    Enviar
                                </Button>
                            </div>
                        </form>
                    </div>
                </div>
            ) : null}
        </>
    );
}
