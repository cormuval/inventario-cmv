// Administradores que crea el seed. Se definen en la variable de entorno
// SEED_ADMINISTRADORES para no versionar correos del personal en el repositorio.
// Formato: "correo|Nombre|Apellido" separados por ";".
// Ejemplo: SEED_ADMINISTRADORES="admin@cmvalparaiso.cl|Nombre|Apellido;otro@cmvalparaiso.cl|Otro|Admin"

export interface AdministradorSeed {
    id: string;
    nombre: string;
    apPaterno: string;
    email: string;
}

export function leerAdministradoresSeed(valor: string | undefined): AdministradorSeed[] {
    if (!valor?.trim()) {
        return [];
    }

    return valor
        .split(";")
        .map((entrada) => entrada.trim())
        .filter((entrada) => entrada.length > 0)
        .map((entrada) => {
            const [emailCrudo, nombre, apPaterno] = entrada.split("|").map((parte) => parte.trim());
            const email = (emailCrudo ?? "").toLowerCase();

            if (!email.includes("@") || !nombre || !apPaterno) {
                throw new Error(`SEED_ADMINISTRADORES: entrada invalida "${entrada}" (formato correo|Nombre|Apellido)`);
            }

            // El ID se deriva del correo para que coincida con los administradores ya creados.
            return { id: `usuario-admin-${email.split("@")[0]}`, nombre, apPaterno, email };
        });
}
