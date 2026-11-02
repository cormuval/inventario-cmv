import { redirect } from "next/navigation";

// config
import { RUTA_LOGIN } from "@/config/auth";

// lib
import { obtenerSessionUser, puedeOperarEntrada } from "@/shared/lib/auth";

export const dynamic = "force-dynamic";

export default async function OrdenEntradaPage(): Promise<never> {
    const usuario = await obtenerSessionUser();

    if (!usuario) {
        redirect(RUTA_LOGIN);
    }

    redirect(puedeOperarEntrada(usuario.rol) ? "/entradas/nueva" : "/entradas/registros");
}
