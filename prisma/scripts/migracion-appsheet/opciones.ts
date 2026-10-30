// Argumentos de línea de comandos de npm run migracion:appsheet.

export interface Opciones {
    ejecutar: boolean;
    vaciar: string | null;
    salida: string;
    origenEnv: string;
}

const CON_VALOR = ["vaciar", "salida", "origen-env"] as const;

// Cualquier argumento mal formado aborta: un error de tipeo no debe cargar sin vaciar ni vaciar sin avisar.
export function leerOpciones(args: string[], marca: string): Opciones {
    let ejecutar = false;
    const valores = new Map<string, string>();
    for (const arg of args) {
        if (arg === "--ejecutar") {
            ejecutar = true;
            continue;
        }
        const nombre = CON_VALOR.find((n) => arg.startsWith(`--${n}=`));
        const valor = nombre === undefined ? "" : arg.slice(nombre.length + 3);
        if (nombre === undefined || valor === "") {
            throw new Error(`Argumento no válido: "${arg}". Se admite --ejecutar, --vaciar=<base>, --salida=<ruta> y --origen-env=<ruta>`);
        }
        valores.set(nombre, valor);
    }
    return {
        ejecutar,
        vaciar: valores.get("vaciar") ?? null,
        salida: valores.get("salida") ?? `migracion-appsheet-${marca}`,
        origenEnv: valores.get("origen-env") ?? ".env.migracion"
    };
}

export function nombreBase(url: string): string {
    return new URL(url).pathname.replace(/^\//, "");
}

// --vaciar borra datos del destino: exige --ejecutar y repetir el nombre de la base para evitar vaciar la equivocada.
export function validarOpciones(opciones: Opciones, baseDestino: string): void {
    if (baseDestino === "") {
        throw new Error("No se pudo determinar la base de destino a partir de la URL");
    }
    if (opciones.vaciar !== null && (!opciones.ejecutar || opciones.vaciar !== baseDestino)) {
        throw new Error(`--vaciar exige --ejecutar y repetir el nombre de la base de destino (${baseDestino})`);
    }
}
