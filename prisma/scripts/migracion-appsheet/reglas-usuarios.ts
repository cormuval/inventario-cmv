// Reglas de usuarios (spec, sección 5.1): rol, reasignación por email y usuario técnico.

// migracion
import { claveUnica, email, entero, estado, nuevaTabla, rechazo, recortar, texto } from "./normalizar";
import {
    CENTRO_ADMINISTRACION_ID,
    CENTRO_PRUEBA_ID,
    DOMINIO_INSTITUCIONAL,
    ROL_ADMIN_ASEO_ID,
    ROL_ENCARGADO_CENTRO_ID,
    ROL_VISUALIZADOR_ID,
    ROLES_DESTINO,
    USUARIO_TECNICO_EMAIL,
    USUARIO_TECNICO_ID,
    type Rechazo,
    type Resultado,
    type TablaTransformada,
    type UsuarioDestino,
    type UsuarioExistente,
    type UsuarioOrigen,
    type Valor
} from "./tipos";

export interface ContextoUsuarios {
    centros: Set<string>;
    // bodega -> centro, solo bodegas migradas
    bodegas: Map<string, string>;
    usuariosDestino: UsuarioExistente[];
    ordenesPorUsuario: Map<string, number>;
}

export interface UsuariosTransformados {
    tabla: TablaTransformada<UsuarioDestino>;
    // ID AppSheet -> ID destino
    reasignaciones: Map<string, string>;
}

export type ResolverUsuario = (idOrigen: Valor) => { id: string; advertencia: string | null };

interface Candidato {
    id: string;
    correo: string;
    fila: UsuarioOrigen;
}

export const USUARIO_TECNICO: UsuarioDestino = {
    id: USUARIO_TECNICO_ID,
    nombre: "Migración AppSheet",
    apPaterno: null,
    apMaterno: null,
    rolId: "R01",
    bodegaId: null,
    telefono: null,
    email: USUARIO_TECNICO_EMAIL,
    centroId: CENTRO_ADMINISTRACION_ID,
    estado: false
};

export function contarOrdenesPorUsuario(ids: Valor[]): Map<string, number> {
    const conteo = new Map<string, number>();
    for (const valor of ids) {
        const id = texto(valor);
        if (id !== null) conteo.set(id, (conteo.get(id) ?? 0) + 1);
    }
    return conteo;
}

export function transformarUsuarios(filas: UsuarioOrigen[], contexto: ContextoUsuarios): UsuariosTransformados {
    const tabla = nuevaTabla<UsuarioDestino>(filas.length);
    const reasignaciones = new Map<string, string>();
    const vistos = new Set<string>();

    // Solo cuentan usuarios del destino que no vienen de AppSheet (ejecuciones anteriores).
    const idsOrigen = new Set(filas.map((fila) => texto(fila.ID_User)).filter((id): id is string => id !== null));
    const destinoPorEmail = new Map<string, string>();
    for (const existente of contexto.usuariosDestino) {
        if (!idsOrigen.has(existente.id)) destinoPorEmail.set(existente.email.trim().toLowerCase(), existente.id);
    }

    const grupos = new Map<string, Candidato[]>();
    for (const fila of filas) {
        const id = claveUnica("Usuario", fila.ID_User, vistos, tabla);
        if (id === null) continue;
        const correo = email(fila.Email);
        if (correo === null) {
            tabla.rechazos.push(rechazo("Usuario", id, "campo_requerido", "Email vacío"));
            continue;
        }
        const destinoId = destinoPorEmail.get(correo);
        if (destinoId !== undefined) {
            reasignaciones.set(id, destinoId);
            tabla.advertencias.push(rechazo("Usuario", id, "email_existente_destino", `Email ya existe en el destino: se usa ${destinoId}`));
            continue;
        }
        grupos.set(correo, [...(grupos.get(correo) ?? []), { id, correo, fila }]);
    }

    for (const grupo of grupos.values()) {
        const ordenados = [...grupo].sort(
            (a, b) => (contexto.ordenesPorUsuario.get(b.id) ?? 0) - (contexto.ordenesPorUsuario.get(a.id) ?? 0) || a.id.localeCompare(b.id)
        );
        const [principal, ...resto] = ordenados;
        for (const duplicado of resto) {
            reasignaciones.set(duplicado.id, principal.id);
            tabla.advertencias.push(rechazo("Usuario", duplicado.id, "email_duplicado", `Email repetido: se reasigna a ${principal.id}`));
        }
        const resultado = transformarUsuario(principal, contexto);
        if (resultado.ok) {
            tabla.aceptados.push(resultado.data);
            tabla.advertencias.push(...resultado.advertencias);
        } else {
            tabla.rechazos.push(resultado.rechazo);
        }
    }

    tabla.aceptados.push(USUARIO_TECNICO);
    return { tabla, reasignaciones };
}

function transformarUsuario({ id, correo, fila }: Candidato, contexto: ContextoUsuarios): Resultado<UsuarioDestino> {
    const advertencias: Rechazo[] = [];

    const rolOrigen = texto(fila.Rol);
    let rolId: string;
    if (rolOrigen === ROL_VISUALIZADOR_ID) {
        rolId = ROL_ENCARGADO_CENTRO_ID;
        advertencias.push(rechazo("Usuario", id, "rol_visualizador", "R04 VISUALIZADOR se migra como R02 Encargado Centro"));
    } else if (rolOrigen === ROL_ADMIN_ASEO_ID) {
        return { ok: false, rechazo: rechazo("Usuario", id, "rol_no_migrado", "Rol ADMIN ASEO no se migra") };
    } else if (rolOrigen === null || !ROLES_DESTINO.includes(rolOrigen)) {
        return { ok: false, rechazo: rechazo("Usuario", id, "rol_desconocido", `Rol ${rolOrigen ?? "vacío"} no existe en el destino`) };
    } else {
        rolId = rolOrigen;
    }

    const centroId = texto(fila.ID_Centro);
    if (centroId === CENTRO_PRUEBA_ID) {
        return { ok: false, rechazo: rechazo("Usuario", id, "centro_prueba", "Usuario del centro de prueba") };
    }
    if (centroId === null || !contexto.centros.has(centroId)) {
        return { ok: false, rechazo: rechazo("Usuario", id, "centro_inexistente", `Centro ${centroId ?? "vacío"} no migrado`) };
    }

    const nombre = texto(fila.Nombre);
    if (nombre === null) {
        return { ok: false, rechazo: rechazo("Usuario", id, "campo_requerido", "Nombre vacío") };
    }

    let bodegaId = texto(fila.ID_Bodega);
    if (bodegaId !== null && contexto.bodegas.get(bodegaId) !== centroId) {
        advertencias.push(rechazo("Usuario", id, "bodega_no_migrada", `Bodega ${bodegaId} no migrada o de otro centro: queda sin bodega`));
        bodegaId = null;
    }

    if (!correo.endsWith(DOMINIO_INSTITUCIONAL)) {
        advertencias.push(rechazo("Usuario", id, "email_externo", "Email fuera de @cmvalparaiso.cl: no podrá iniciar sesión"));
    }

    const telefono = entero(fila.Telefono);
    const apPaterno = texto(fila.Ap_Paterno);
    const apMaterno = texto(fila.Ap_Materno);

    return {
        ok: true,
        advertencias,
        data: {
            id,
            nombre: recortar(nombre),
            apPaterno: apPaterno === null ? null : recortar(apPaterno),
            apMaterno: apMaterno === null ? null : recortar(apMaterno),
            rolId,
            bodegaId,
            telefono: telefono === null || telefono === 0 ? null : recortar(String(telefono), 30),
            email: recortar(correo),
            centroId,
            estado: estado(fila.Estado)
        }
    };
}

export function crearResolverUsuario(usuarios: UsuariosTransformados, usuariosDestino: UsuarioExistente[]): ResolverUsuario {
    const validos = new Set<string>([...usuarios.tabla.aceptados.map((u) => u.id), ...usuariosDestino.map((u) => u.id)]);
    return (idOrigen) => {
        const id = texto(idOrigen);
        const destino = id === null ? null : (usuarios.reasignaciones.get(id) ?? id);
        if (destino !== null && validos.has(destino)) return { id: destino, advertencia: null };
        return { id: USUARIO_TECNICO_ID, advertencia: `Usuario ${id ?? "vacío"} no migrado: se asigna al usuario técnico` };
    };
}
