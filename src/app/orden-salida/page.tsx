import { redirect } from "next/navigation";

// config
import { RUTA_LOGIN } from "@/config/auth";

// lib
import { obtenerSessionUser, puedeOperarSalida } from "@/shared/lib/auth";

export const dynamic = "force-dynamic";

export default async function OrdenSalidaPage(): Promise<never> {
    const usuario = await obtenerSessionUser();

    if (!usuario) {
        redirect(RUTA_LOGIN);
    }

    redirect(puedeOperarSalida(usuario.rol) ? "/salidas/nueva" : "/salidas/registros");
}
