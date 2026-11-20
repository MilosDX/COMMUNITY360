
import fs from "node:fs";
import path from "node:path";
import { parse } from "csv-parse/sync";

type Registro = Record<string, string>;

const carpeta = path.resolve("data", "originales");

function cargarCSV(nombre: string): Registro[] {
    const contenido = fs.readFileSync(
        path.join(carpeta, nombre),
        "utf8"
    );

    return parse(contenido, {
        columns: true,
        bom: true,
        skip_empty_lines: true
    });
}

const usuarios = cargarCSV(
    "comunidad_virtual_usuarios.csv"
);

const interacciones = cargarCSV(
    "comunidad_virtual_1000_interacciones.csv"
);

function analizarDuplicados(
    registros: Registro[],
    campo: string
) {
    const encontrados = new Set<string>();
    let duplicados = 0;

    for (const registro of registros) {
        const valor = (registro[campo] ?? "").trim();

        if (!valor) continue;

        if (encontrados.has(valor)) {
            duplicados++;
        } else {
            encontrados.add(valor);
        }
    }

    return duplicados;
}

function analizarNulos(registros: Registro[]) {
    const resultado: Record<string, number> = {};

    for (const registro of registros) {
        for (const [campo, valor] of Object.entries(registro)) {
            if (
                valor === undefined ||
                valor === null ||
                valor.trim() === "" ||
                ["null", "n/a", "na"].includes(
                    valor.trim().toLowerCase()
                )
            ) {
                resultado[campo] = (resultado[campo] ?? 0) + 1;
            }
        }
    }

    return resultado;
}

const idsUsuarios = new Set(
    usuarios.map(u => u.id_usuario.trim())
);

const huerfanas = interacciones.filter(
    i => !idsUsuarios.has(i.id_usuario.trim())
);

const sinConsentimiento = usuarios.filter(
    u => u.consentimiento_datos.trim().toLowerCase() === "no"
);

console.log("\n===== REPORTE DE CALIDAD =====");

console.log("\nUSUARIOS:");
console.log("Total:", usuarios.length);
console.log(
    "ID duplicados:",
    analizarDuplicados(usuarios, "id_usuario")
);
console.log(
    "Alias duplicados:",
    analizarDuplicados(usuarios, "alias")
);
console.log(
    "Sin consentimiento:",
    sinConsentimiento.length
);
console.log("Valores nulos:");
console.table(analizarNulos(usuarios));

console.log("\nINTERACCIONES:");
console.log("Total:", interacciones.length);
console.log(
    "ID duplicados:",
    analizarDuplicados(interacciones, "id_interaccion")
);
console.log(
    "Sin usuario relacionado:",
    huerfanas.length
);
console.log(
    "Con usuario relacionado:",
    interacciones.length - huerfanas.length
);
console.log("Valores nulos:");
console.table(analizarNulos(interacciones));
