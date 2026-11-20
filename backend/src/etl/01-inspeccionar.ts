
import fs from "node:fs";
import path from "node:path";
import { parse } from "csv-parse/sync";

const carpeta = path.resolve(
    process.cwd(),
    "data",
    "originales"
);

const archivos = [
    "comunidad_virtual_usuarios.csv",
    "comunidad_virtual_1000_interacciones.csv"
];

for (const archivo of archivos) {
    const ruta = path.join(carpeta, archivo);

    if (!fs.existsSync(ruta)) {
        console.error(`❌ No existe: ${ruta}`);
        process.exitCode = 1;
        continue;
    }

    const contenido = fs.readFileSync(ruta, "utf8");

    const registros = parse(contenido, {
        columns: true,
        skip_empty_lines: true,
        bom: true,
        relax_quotes: true
    }) as Record<string, string>[];

    console.log(`\n📄 Archivo: ${archivo}`);
    console.log(`✅ Registros: ${registros.length}`);


    if (archivo === "comunidad_virtual_usuarios.csv") {
        console.log("\n📋 COLUMNAS DE USUARIOS:");

        Object.keys(registros[0] ?? {}).forEach(
            (columna, indice) => {
                console.log(`${indice + 1}. ${columna}`);
            }
        );
    }


    if (registros.length > 0) {

        console.log("\n📋 COLUMNAS DEL ARCHIVO:");

        Object.keys(registros[0]).forEach((columna, indice) => {
            console.log(`${indice + 1}. ${columna}`);
        });

        console.log("\n📊 PRIMER REGISTRO:");

        Object.entries(registros[0]).forEach(([campo, valor]) => {
            console.log(`${campo}: ${valor}`);
        });

        console.log("\n=============================");

    }
}
