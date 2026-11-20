
import fs from "node:fs";
import path from "node:path";
import { parse } from "csv-parse/sync";

type Registro = Record<string, string>;

const carpeta = path.resolve("data/procesados");

function cargar(nombre: string): Registro[] {
    return parse(
        fs.readFileSync(path.join(carpeta, nombre), "utf8"),
        {
            columns: true,
            bom: true,
            skip_empty_lines: true
        }
    );
}

const usuarios = cargar("usuarios_limpios.csv");
const interacciones = cargar("interacciones_limpias.csv");
const cuarentena = cargar("interacciones_cuarentena.csv");

const errores: string[] = [];

function verificar(condicion: boolean, mensaje: string) {
    if (!condicion) {
        errores.push(mensaje);
        console.log("❌", mensaje);
    } else {
        console.log("✅", mensaje);
    }
}

console.log("\n🔎 VALIDACIÓN DE COMMUNITY 360\n");

verificar(usuarios.length === 1068, "1068 usuarios");
verificar(interacciones.length === 207, "207 interacciones válidas");
verificar(cuarentena.length === 793, "793 en cuarentena");

const idsUsuarios = new Set(usuarios.map(u => u.id_usuario));
const idsValidos = interacciones.map(i => i.id_interaccion);

verificar(
    idsUsuarios.size === usuarios.length,
    "Usuarios sin ID duplicados"
);

verificar(
    new Set(idsValidos).size === idsValidos.length,
    "Interacciones válidas sin ID duplicados"
);

verificar(
    interacciones.every(i => idsUsuarios.has(i.id_usuario)),
    "Interacciones válidas con usuario existente"
);

verificar(
    cuarentena.every(i => !idsUsuarios.has(i.id_usuario)),
    "Cuarentena con referencias huérfanas"
);

verificar(
    usuarios.every(u =>
        /^\d{4}-\d{2}-\d{2}$/.test(u.fecha_ingreso) &&
        /^\d{4}-\d{2}-\d{2}$/.test(u.ultima_actividad)
    ),
    "Fechas de usuarios normalizadas"
);

const camposGeograficosUsuario = [
    "pais", "estado", "ciudad",
    "latitud", "longitud", "zona_horaria"
];

verificar(
    usuarios
        .filter(u => u.consentimiento_datos !== "si")
        .every(u =>
            camposGeograficosUsuario.every(
                campo => !u[campo]?.trim()
            )
        ),
    "Privacidad geográfica de usuarios"
);

const camposGeograficosInteraccion = [
    "pais", "estado", "ciudad"
];

verificar(
    [...interacciones, ...cuarentena].every(i => {
        const usuario = usuarios.find(
            u => u.id_usuario === i.id_usuario
        );

        if (usuario?.consentimiento_datos === "si") {
            return true;
        }

        return camposGeograficosInteraccion.every(
            campo => !i[campo]?.trim()
        );
    }),
    "Privacidad geográfica de interacciones"
);

verificar(
    cuarentena.every(i =>
        camposGeograficosInteraccion.every(
            campo => !i[campo]?.trim()
        )
    ),
    "Cuarentena sin datos geográficos"
);

console.log("\n================================");

if (errores.length === 0) {
    console.log("✅ VALIDACIÓN COMPLETADA SIN ERRORES");
    console.log("Archivos listos para la siguiente revisión.");
} else {
    console.log(
        `❌ SE ENCONTRARON ${errores.length} PROBLEMAS`
    );
    process.exitCode = 1;
}
