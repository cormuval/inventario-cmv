import { describe, expect, it } from "vitest";

// utils
import { leerAdministradoresSeed } from "../../prisma/administradores-seed";

describe("leerAdministradoresSeed", () => {
    it("devuelve una lista vacia si la variable no existe o esta vacia", () => {
        expect(leerAdministradoresSeed(undefined)).toEqual([]);
        expect(leerAdministradoresSeed("   ")).toEqual([]);
    });

    it("lee varias entradas, normaliza el correo y deriva el ID", () => {
        expect(leerAdministradoresSeed(" Admin.Uno@CMValparaiso.cl | Ana | Prueba ; admin2@cmvalparaiso.cl|Luis|Demo;")).toEqual([
            { id: "usuario-admin-admin.uno", nombre: "Ana", apPaterno: "Prueba", email: "admin.uno@cmvalparaiso.cl" },
            { id: "usuario-admin-admin2", nombre: "Luis", apPaterno: "Demo", email: "admin2@cmvalparaiso.cl" }
        ]);
    });

    it("rechaza entradas sin correo, nombre o apellido", () => {
        expect(() => leerAdministradoresSeed("sin-arroba|Ana|Prueba")).toThrow(/entrada invalida/);
        expect(() => leerAdministradoresSeed("admin@cmvalparaiso.cl|Ana")).toThrow(/entrada invalida/);
    });
});
