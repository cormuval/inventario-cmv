// Argumentos de línea de comandos de npm run migracion:appsheet.

export interface Opciones {
    ejecutar: boolean;
    vaciar: string | null;
    salida: string;
    origenEnv: string;
}

export function leerOpciones(args: string[], marca: string): Opciones {
    const valor = (nombre: string): string | null => {
        const argumento = args.find((arg) => arg.startsWith(`--${nombre}=`));
        return argumento === undefined ? null : argumento.slice(nombre.length + 3);
    };
    return {
        ejecutar: args.includes("--ejecutar"),
        vaciar: valor("vaciar"),
        salida: valor("salida") ?? `migracion-appsheet-${marca}`,
        origenEnv: valor("origen-env") ?? ".env.migracion"
    };
}

export function nombreBase(url: string): string {
    return new URL(url).pathname.replace(/^\//, "");
}

// --vaciar borra datos del destino: exige --ejecutar y repetir el nombre de la base para evitar vaciar la equivocada.
export function validarOpciones(opciones: Opciones, baseDestino: string): void {
    if (opciones.vaciar !== null && (!opciones.ejecutar || opciones.vaciar !== baseDestino)) {
        throw new Error(`--vaciar exige --ejecutar y repetir el nombre de la base de destino (${baseDestino})`);
    }
}
