
import fs from "node:fs";
import path from "node:path";
import { parse } from "csv-parse/sync";
import { stringify } from "csv-stringify/sync";

type Registro = Record<string, string>;

const origen = path.resolve("data/originales");
const destino = path.resolve("data/procesados");

fs.mkdirSync(destino, { recursive: true });

function leer(nombre: string): Registro[] {
    return parse(
        fs.readFileSync(path.join(origen, nombre), "utf8"),
        {
            columns: true,
            bom: true,
            skip_empty_lines: true
        }
    );
}

function escribir(
    nombre: string,
    registros: Registro[],
    columnas: string[]
) {
    const contenido = stringify(registros, {
        header: true,
        columns: columnas
    });

    fs.writeFileSync(
        path.join(destino, nombre),
        contenido,
        "utf8"
    );
}

function limpiarTexto(valor: unknown): string {
    const texto = String(valor ?? "").trim();

    return ["null", "n/a", "na", "undefined"].includes(
        texto.toLowerCase()
    ) ? "" : texto;
}

function numero(valor: string): string | null {
    if (!valor) return "";

    const n = Number(valor);
    return Number.isFinite(n) ? String(n) : null;
}

function enteroNoNegativo(valor: string): string | null {
    if (!valor) return "";

    const n = Number(valor);

    return Number.isSafeInteger(n) && n >= 0
        ? String(n)
        : null;
}


function fecha(valor: string): string | null {
    if (!valor) return "";

    const texto = valor.trim();

    let dia: number;
    let mes: number;
    let anio: number;

    // Formato original: DD/MM/YYYY
    const formatoOriginal =
        /^(\d{2})\/(\d{2})\/(\d{4})$/.exec(texto);

    if (formatoOriginal) {
        dia = Number(formatoOriginal[1]);
        mes = Number(formatoOriginal[2]);
        anio = Number(formatoOriginal[3]);
    } else {
        // También permite fechas YYYY-MM-DD
        const formatoSQL =
            /^(\d{4})-(\d{2})-(\d{2})$/.exec(texto);

        if (!formatoSQL) return null;

        anio = Number(formatoSQL[1]);
        mes = Number(formatoSQL[2]);
        dia = Number(formatoSQL[3]);
    }

    // Comprobar que la fecha realmente existe
    const comprobacion = new Date(
        Date.UTC(anio, mes - 1, dia)
    );

    if (
        comprobacion.getUTCFullYear() !== anio ||
        comprobacion.getUTCMonth() !== mes - 1 ||
        comprobacion.getUTCDate() !== dia
    ) {
        return null;
    }

    const yyyy = String(anio).padStart(4, "0");
    const mm = String(mes).padStart(2, "0");
    const dd = String(dia).padStart(2, "0");

    return `${yyyy}-${mm}-${dd}`;
}


function consentimiento(valor: string): string {
    const v = limpiarTexto(valor).toLowerCase();

    return ["si", "sí", "yes", "true", "1"].includes(v)
        ? "si"
        : "no";
}

function booleano(valor: string): string | null {
    const v = limpiarTexto(valor).toLowerCase();

    if (!v) return "";
    if (["si", "sí", "yes", "true", "1"].includes(v)) {
        return "1";
    }
    if (["no", "false", "0"].includes(v)) {
        return "0";
    }

    return null;
}

function quitarUbicacion(
    registro: Registro,
    incluirCoordenadas = false
) {
    for (const campo of ["pais", "estado", "ciudad"]) {
        registro[campo] = "";
    }

    if (incluirCoordenadas) {
        for (const campo of [
            "latitud",
            "longitud",
            "zona_horaria"
        ]) {
            registro[campo] = "";
        }
    }
}

const usuariosOriginales = leer(
    "comunidad_virtual_usuarios.csv"
);

const interaccionesOriginales = leer(
    "comunidad_virtual_1000_interacciones.csv"
);

const usuariosLimpios: Registro[] = [];
const usuariosRechazados: Registro[] = [];
const interaccionesLimpias: Registro[] = [];
const interaccionesCuarentena: Registro[] = [];

const ids = new Set<string>();
const alias = new Set<string>();

let usuariosSinConsentimiento = 0;
let interaccionesSinGeografia = 0;
let duplicadosUsuarios = 0;
let duplicadosInteracciones = 0;

const camposEnterosUsuario = [
    "mensajes_30d",
    "reacciones_30d",
    "eventos_asistidos",
    "comisiones_compradas"
];

// 1. LIMPIAR USUARIOS
for (const original of usuariosOriginales) {
    const u: Registro = {};

    for (const [campo, valor] of Object.entries(original)) {
        u[campo] = limpiarTexto(valor);
    }

    const id = u.id_usuario;
    const nombre = u.alias.toLowerCase();

    if (!id || !nombre || ids.has(id) || alias.has(nombre)) {
        duplicadosUsuarios++;
        quitarUbicacion(u, true);
        usuariosRechazados.push(u);
        continue;
    }

    u.consentimiento_datos = consentimiento(
        u.consentimiento_datos
    );

    if (u.consentimiento_datos === "no") {
        quitarUbicacion(u, true);
        usuariosSinConsentimiento++;
    }

    const ingreso = fecha(u.fecha_ingreso);
    const actividad = fecha(u.ultima_actividad);
    const artista = booleano(u.es_artista);
    const sentimiento = numero(u.sentimiento_promedio);

    let valido =
        ingreso !== null &&
        actividad !== null &&
        artista !== null &&
        sentimiento !== null;

    if (valido) {
        u.fecha_ingreso = ingreso!;
        u.ultima_actividad = actividad!;
        u.es_artista = artista!;
        u.sentimiento_promedio = sentimiento!;
    }

    for (const campo of camposEnterosUsuario) {
        const convertido = enteroNoNegativo(u[campo]);

        if (convertido === null) {
            valido = false;
        } else {
            u[campo] = convertido;
        }
    }

    for (const campo of ["latitud", "longitud"]) {
        const convertido = numero(u[campo]);

        if (convertido === null) {
            valido = false;
        } else {
            u[campo] = convertido;
        }
    }

    if (
        u.latitud !== "" &&
        Math.abs(Number(u.latitud)) > 90
    ) {
        valido = false;
    }

    if (
        u.longitud !== "" &&
        Math.abs(Number(u.longitud)) > 180
    ) {
        valido = false;
    }

    if (!valido) {
        quitarUbicacion(u, true);
        usuariosRechazados.push(u);
        continue;
    }

    ids.add(id);
    alias.add(nombre);
    usuariosLimpios.push(u);
}

// 2. LIMPIAR INTERACCIONES
const usuariosPorId = new Map(
    usuariosLimpios.map(u => [u.id_usuario, u])
);

const idsInteracciones = new Set<string>();

for (const original of interaccionesOriginales) {
    const i: Registro = {};

    for (const [campo, valor] of Object.entries(original)) {
        i[campo] = limpiarTexto(valor);
    }

    const usuario = usuariosPorId.get(i.id_usuario);

    const repetida = idsInteracciones.has(i.id_interaccion);

    if (repetida) {
        duplicadosInteracciones++;
    }

    if (i.id_interaccion) {
        idsInteracciones.add(i.id_interaccion);
    }

    // Privacidad: sin consentimiento comprobable,
    // no se permite conservar información geográfica.
    if (!usuario || usuario.consentimiento_datos !== "si") {
        quitarUbicacion(i);
        interaccionesSinGeografia++;
    }

    const instante = Date.parse(i.timestamp);

    const valido =
        Boolean(i.id_interaccion) &&
        Boolean(i.id_usuario) &&
        Boolean(i.timestamp) &&
        !Number.isNaN(instante) &&
        numero(i.sentimiento) !== null &&
        enteroNoNegativo(i.longitud_texto) !== null &&
        enteroNoNegativo(i.reacciones_recibidas) !== null;

    if (valido) {
        i.timestamp = new Date(instante).toISOString();
        i.sentimiento = numero(i.sentimiento)!;
        i.longitud_texto = enteroNoNegativo(i.longitud_texto)!;
        i.reacciones_recibidas =
            enteroNoNegativo(i.reacciones_recibidas)!;
    }

    // Normalizar etiquetas multivaluadas.
    i.etiquetas = i.etiquetas
        .split(/[;,|]/)
        .map(e => e.trim())
        .filter(Boolean)
        .join(";");

    if (valido && usuario && !repetida) {
        interaccionesLimpias.push(i);
    } else {
        // Las interacciones rechazadas no conservarán ubicación.
        quitarUbicacion(i);
        interaccionesCuarentena.push(i);
    }
}

// 3. GENERAR ARCHIVOS PROCESADOS
const columnasUsuarios = Object.keys(
    usuariosOriginales[0] ?? {}
);

const columnasInteracciones = Object.keys(
    interaccionesOriginales[0] ?? {}
);

escribir(
    "usuarios_limpios.csv",
    usuariosLimpios,
    columnasUsuarios
);

escribir(
    "usuarios_rechazados.csv",
    usuariosRechazados,
    columnasUsuarios
);

escribir(
    "interacciones_limpias.csv",
    interaccionesLimpias,
    columnasInteracciones
);

escribir(
    "interacciones_cuarentena.csv",
    interaccionesCuarentena,
    columnasInteracciones
);

// 4. AUDITORÍA
const reporte = {
    fecha_procesamiento: new Date().toISOString(),
    usuarios: {
        recibidos: usuariosOriginales.length,
        aceptados: usuariosLimpios.length,
        rechazados: usuariosRechazados.length,
        duplicados_detectados: duplicadosUsuarios,
        sin_consentimiento: usuariosSinConsentimiento
    },
    interacciones: {
        recibidas: interaccionesOriginales.length,
        aceptadas: interaccionesLimpias.length,
        cuarentena: interaccionesCuarentena.length,
        duplicados_detectados: duplicadosInteracciones,
        ubicacion_retirada: interaccionesSinGeografia
    }
};

fs.writeFileSync(
    path.join(destino, "reporte_limpieza.json"),
    JSON.stringify(reporte, null, 2),
    "utf8"
);

console.log("\n✅ LIMPIEZA FINALIZADA");
console.log(JSON.stringify(reporte, null, 2));
console.log("\n📁 Archivos generados en data/procesados");
