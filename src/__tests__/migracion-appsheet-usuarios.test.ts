import { describe, expect, it } from "vitest";

// migracion
import {
    contarOrdenesPorUsuario,
    crearResolverUsuario,
    transformarUsuarios,
    type ContextoUsuarios
} from "../../prisma/scripts/migracion-appsheet/reglas-usuarios";
import type { UsuarioOrigen } from "../../prisma/scripts/migracion-appsheet/tipos";

function usuario(parcial: Partial<UsuarioOrigen>): UsuarioOrigen {
    return {
        ID_User: "u1",
        Nombre: "Ana",
        Ap_Paterno: "Pérez",
        Ap_Materno: null,
        Rol: "R03",
        ID_Bodega: "b1",
        Telefono: 912345678,
        Email: "ana@cmvalparaiso.cl",
        ID_Centro: "c1",
        Estado: 1,
        ...parcial
    };
}

function contexto(parcial: Partial<ContextoUsuarios> = {}): ContextoUsuarios {
    return {
        centros: new Set(["c1", "c2"]),
        bodegas: new Map([["b1", "c1"], ["b2", "c2"]]),
        usuariosDestino: [],
        ordenesPorUsuario: new Map(),
        ...parcial
    };
}

describe("reglas de usuarios", () => {
    it("migra un usuario válido y agrega el usuario técnico al final", () => {
        const r = transformarUsuarios([usuario({})], contexto());
        expect(r.tabla.aceptados[0]).toEqual({
            id: "u1",
            nombre: "Ana",
            apPaterno: "Pérez",
            apMaterno: null,
            rolId: "R03",
            bodegaId: "b1",
            telefono: "912345678",
            email: "ana@cmvalparaiso.cl",
            centroId: "c1",
            estado: true
        });
        expect(r.tabla.aceptados[1]).toMatchObject({
            id: "migracion-appsheet",
            email: "migracion-appsheet@cmvalparaiso.cl",
            rolId: "R01",
            centroId: "centro-administracion-das",
            estado: false
        });
    });

    it("R04 pasa a R02 con advertencia; ADMIN ASEO y roles desconocidos se rechazan", () => {
        const r = transformarUsuarios(
            [
                usuario({ ID_User: "v", Email: "v@cmvalparaiso.cl", Rol: "R04" }),
                usuario({ ID_User: "a", Email: "a@cmvalparaiso.cl", Rol: "dac3497d" }),
                usuario({ ID_User: "q", Email: "q@cmvalparaiso.cl", Rol: "R05" })
            ],
            contexto()
        );
        expect(r.tabla.aceptados.find((u) => u.id === "v")?.rolId).toBe("R02");
        expect(r.tabla.advertencias.map((a) => [a.clave, a.regla])).toContainEqual(["v", "rol_visualizador"]);
        expect(r.tabla.rechazos.map((x) => [x.clave, x.regla])).toEqual([
            ["a", "rol_no_migrado"],
            ["q", "rol_desconocido"]
        ]);
    });

    it("el email existente en el destino se evalúa antes que rol y centro", () => {
        const r = transformarUsuarios(
            [usuario({ ID_User: "x9", Email: " DSantibanez@cmvalparaiso.cl", Rol: "dac3497d", ID_Centro: "3d3f9a13" })],
            contexto({ usuariosDestino: [{ id: "usuario-admin-dsantibanez", email: "dsantibanez@cmvalparaiso.cl" }] })
        );
        expect(r.reasignaciones.get("x9")).toBe("usuario-admin-dsantibanez");
        expect(r.tabla.rechazos).toEqual([]);
        expect(r.tabla.advertencias.map((a) => a.regla)).toEqual(["email_existente_destino"]);
        expect(r.tabla.aceptados.map((u) => u.id)).toEqual(["migracion-appsheet"]);
    });

    it("no reasigna a usuarios del destino que vienen de una ejecución anterior", () => {
        const r = transformarUsuarios([usuario({})], contexto({ usuariosDestino: [{ id: "u1", email: "ana@cmvalparaiso.cl" }] }));
        expect(r.reasignaciones.size).toBe(0);
        expect(r.tabla.aceptados.map((u) => u.id)).toEqual(["u1", "migracion-appsheet"]);
    });

    it("email duplicado: gana el usuario con más órdenes y el otro se reasigna", () => {
        const r = transformarUsuarios(
            [
                usuario({ ID_User: "d4", Email: "ccastillos@cmvalparaiso.cl" }),
                usuario({ ID_User: "1f", Email: "CCastillos@cmvalparaiso.cl" })
            ],
            contexto({ ordenesPorUsuario: new Map([["d4", 2], ["1f", 9]]) })
        );
        expect(r.tabla.aceptados.map((u) => u.id)).toEqual(["1f", "migracion-appsheet"]);
        expect(r.reasignaciones.get("d4")).toBe("1f");
        expect(r.tabla.advertencias.map((a) => [a.clave, a.regla])).toContainEqual(["d4", "email_duplicado"]);
    });

    it("centro de prueba o inexistente se rechaza; bodega de otro centro queda null", () => {
        const r = transformarUsuarios(
            [
                usuario({ ID_User: "p", Email: "p@cmvalparaiso.cl", ID_Centro: "3d3f9a13" }),
                usuario({ ID_User: "i", Email: "i@cmvalparaiso.cl", ID_Centro: "cx" }),
                usuario({ ID_User: "b", Email: "b@cmvalparaiso.cl", ID_Bodega: "b2" })
            ],
            contexto()
        );
        expect(r.tabla.rechazos.map((x) => [x.clave, x.regla])).toEqual([
            ["p", "centro_prueba"],
            ["i", "centro_inexistente"]
        ]);
        expect(r.tabla.aceptados.find((u) => u.id === "b")?.bodegaId).toBeNull();
        expect(r.tabla.advertencias.map((a) => [a.clave, a.regla])).toContainEqual(["b", "bodega_no_migrada"]);
    });

    it("email externo se migra con advertencia y teléfono 0 queda null", () => {
        const r = transformarUsuarios([usuario({ Email: "x@alumnos.upla.cl", Telefono: 0 })], contexto());
        expect(r.tabla.aceptados[0]).toMatchObject({ email: "x@alumnos.upla.cl", telefono: null });
        expect(r.tabla.advertencias.map((a) => a.regla)).toContain("email_externo");
    });

    it("resolver usuario: reasigna, conserva válidos y usa el técnico para inexistentes", () => {
        const usuarios = transformarUsuarios(
            [usuario({ ID_User: "u1" }), usuario({ ID_User: "x9", Email: "admin@cmvalparaiso.cl" })],
            contexto({ usuariosDestino: [{ id: "admin-seed", email: "admin@cmvalparaiso.cl" }] })
        );
        const resolver = crearResolverUsuario(usuarios, [{ id: "admin-seed", email: "admin@cmvalparaiso.cl" }]);
        expect(resolver("u1")).toEqual({ id: "u1", advertencia: null });
        expect(resolver("x9")).toEqual({ id: "admin-seed", advertencia: null });
        expect(resolver("fantasma").id).toBe("migracion-appsheet");
        expect(resolver("fantasma").advertencia).toContain("fantasma");
        expect(resolver(null).id).toBe("migracion-appsheet");
    });

    it("contarOrdenesPorUsuario ignora nulos", () => {
        expect(contarOrdenesPorUsuario(["a", "a", "b", null])).toEqual(new Map([["a", 2], ["b", 1]]));
    });
});
