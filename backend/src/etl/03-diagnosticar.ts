
import fs from "node:fs";
import path from "node:path";
import { parse } from "csv-parse/sync";

const ruta = path.resolve(
    "data/originales/comunidad_virtual_usuarios.csv"
);

const usuarios = parse(
    fs.readFileSync(ruta, "utf8"),
    {
        columns: true,
        bom: true,
        skip_empty_lines: true
    }
) as Record<string, string>[];

const contadores: Record<string, number> = {};

function problema(campo: string) {
    contadores[campo] = (contadores[campo] ?? 0) + 1;
}

function fechaValida(valor: string) {
    const texto = valor.slice(0, 10);

    if (!/^\d{4}-\d{2}-\d{2}$/.test(texto)) {
        return false;
    }

    const fecha = new Date(`${texto}T00:00:00Z`);

    return !Number.isNaN(fecha.getTime()) &&
        fecha.toISOString().slice(0, 10) === texto;
}

const booleanos = new Set([
    "", "si", "sí", "yes", "true", "1",
    "no", "false", "0"
]);

const camposEnteros = [
    "mensajes_30d",
    "reacciones_30d",
    "eventos_asistidos",
    "comisiones_compradas"
];

for (const u of usuarios) {
    if (!fechaValida(u.fecha_ingreso.trim())) {
        problema("fecha_ingreso");
    }

    if (!fechaValida(u.ultima_actividad.trim())) {
        problema("ultima_actividad");
    }

    if (!booleanos.has(u.es_artista.trim().toLowerCase())) {
        problema("es_artista");
    }

    if (
        u.sentimiento_promedio.trim() !== "" &&
        !Number.isFinite(Number(u.sentimiento_promedio))
    ) {
        problema("sentimiento_promedio");
    }

    for (const campo of camposEnteros) {
        const valor = u[campo].trim();

        if (
            valor !== "" &&
            (!Number.isSafeInteger(Number(valor)) ||
                Number(valor) < 0)
        ) {
            problema(campo);
        }
    }

    for (const campo of ["latitud", "longitud"]) {
        const valor = u[campo].trim();

        if (valor !== "" && !Number.isFinite(Number(valor))) {
            problema(campo);
        }
    }
}

console.log("\n🔍 DIAGNÓSTICO DE VALIDACIONES");
console.log("Usuarios analizados:", usuarios.length);
console.table(contadores);

console.log("\nValores encontrados en es_artista:");
console.log(
    [...new Set(usuarios.map(
        u => u.es_artista.trim()
    ))]
);

console.log("\nEjemplos de formato de fecha:");
console.log(
    usuarios.slice(0, 5).map(u => ({
        fecha_ingreso: u.fecha_ingreso,
        ultima_actividad: u.ultima_actividad
    }))
);
