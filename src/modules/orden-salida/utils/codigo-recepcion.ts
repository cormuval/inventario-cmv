/**
 * Utilidades para la generación y validación de códigos de recepción para traspasos/préstamos intercentros.
 * Utiliza un alfabeto de 32 caracteres excluyendo '0', 'O', '1', 'I' para evitar ambigüedades en guías físicas.
 */

export const ALFABETO_CODIGO_RECEPCION = "23456789ABCDEFGHJKLMNPQRSTUVWXYZ";
export const LONGITUD_CODIGO_RECEPCION = 7;

/**
 * Genera un código pseudoaleatorio criptográficamente seguro de 7 caracteres.
 */
export function generarCodigoRecepcion(): string {
    let resultado = "";
    const bytes = new Uint8Array(LONGITUD_CODIGO_RECEPCION);
    if (typeof crypto !== "undefined" && crypto.getRandomValues) {
        crypto.getRandomValues(bytes);
        for (let i = 0; i < LONGITUD_CODIGO_RECEPCION; i++) {
            resultado += ALFABETO_CODIGO_RECEPCION[bytes[i] % ALFABETO_CODIGO_RECEPCION.length];
        }
    } else {
        for (let i = 0; i < LONGITUD_CODIGO_RECEPCION; i++) {
            const index = Math.floor(Math.random() * ALFABETO_CODIGO_RECEPCION.length);
            resultado += ALFABETO_CODIGO_RECEPCION[index];
        }
    }
    return resultado;
}

/**
 * Normaliza un código de recepción a mayúsculas y sin espacios laterales.
 */
export function normalizarCodigoRecepcion(codigo: string): string {
    return codigo.trim().toUpperCase();
}

/**
 * Valida si una cadena cumple estrictamente con el formato de código de recepción de 7 caracteres.
 */
export function esCodigoRecepcionValido(codigo: unknown): boolean {
    if (typeof codigo !== "string") {
        return false;
    }
    const normalizado = normalizarCodigoRecepcion(codigo);
    if (normalizado.length !== LONGITUD_CODIGO_RECEPCION) {
        return false;
    }
    for (let i = 0; i < normalizado.length; i++) {
        if (!ALFABETO_CODIGO_RECEPCION.includes(normalizado[i])) {
            return false;
        }
    }
    return true;
}
