
import "dotenv/config";
import fs from "node:fs";
import path from "node:path";
import couchbase from "couchbase";
import { parse } from "csv-parse/sync";

type Registro = Record<string, string>;

const carpeta = path.resolve("data/procesados");

function leerCSV(nombre: string): Registro[] {
    return parse(
        fs.readFileSync(path.join(carpeta, nombre), "utf8"),
        {
            columns: true,
            bom: true,
            skip_empty_lines: true
        }
    );
}

function textoONull(valor: string | undefined) {
    const texto = (valor ?? "").trim();
    return texto === "" ? null : texto;
}

function numeroONull(valor: string | undefined) {
    const texto = textoONull(valor);
    return texto === null ? null : Number(texto);
}

function convertirDocumento(registro: Registro) {
    return {
        id_interaccion: registro.id_interaccion,
        id_usuario: registro.id_usuario,
        timestamp: registro.timestamp,
        canal: textoONull(registro.canal),
        tipo: textoONull(registro.tipo),
        texto: textoONull(registro.texto),
        tema: textoONull(registro.tema),
        sentimiento: numeroONull(registro.sentimiento),
        idioma: textoONull(registro.idioma),
        pais: textoONull(registro.pais),
        estado: textoONull(registro.estado),
        ciudad: textoONull(registro.ciudad),
        dispositivo: textoONull(registro.dispositivo),
        longitud_texto: numeroONull(registro.longitud_texto),
        reacciones_recibidas:
            numeroONull(registro.reacciones_recibidas),
        etiquetas: (registro.etiquetas ?? "")
            .split(";")
            .map(e => e.trim())
            .filter(Boolean)
    };
}

function sinGeografia(registro: Registro) {
    return ["pais", "estado", "ciudad"].every(
        campo => !(registro[campo] ?? "").trim()
    );
}

async function main() {
    let cluster: couchbase.Cluster | undefined;

    try {
        console.log("🚀 IMPORTACIÓN A COUCHBASE CAPELLA");

        const validas = leerCSV(
            "interacciones_limpias.csv"
        );

        const cuarentena = leerCSV(
            "interacciones_cuarentena.csv"
        );

        console.log("Interacciones válidas:", validas.length);
        console.log("Interacciones en cuarentena:", cuarentena.length);

        // Verificar archivos antes de realizar cambios.
        if (validas.length !== 207 || cuarentena.length !== 793) {
            throw new Error(
                "Las cantidades no coinciden con el reporte ETL"
            );
        }

        const ids = [
            ...validas,
            ...cuarentena
        ].map(r => r.id_interaccion);

        if (
            ids.some(id => !id) ||
            new Set(ids).size !== ids.length
        ) {
            throw new Error(
                "Se encontraron IDs vacíos o duplicados"
            );
        }

        if (!cuarentena.every(sinGeografia)) {
            throw new Error(
                "La cuarentena contiene información geográfica"
            );
        }

        console.log("✅ Validación previa completada");

        // Conectar usando el perfil WAN.
        cluster = await couchbase.connect(
            process.env.COUCHBASE_CONNECTION_STRING!,
            {
                username: process.env.COUCHBASE_USERNAME!,
                password: process.env.COUCHBASE_PASSWORD!,
                configProfile: "wanDevelopment"
            }
        );

        console.log("✅ Conectado a Couchbase Capella");

        const bucket = cluster.bucket(
            process.env.COUCHBASE_BUCKET!
        );

        await bucket.waitUntilReady(30000);

        const scope = bucket.scope(
            process.env.COUCHBASE_SCOPE!
        );

        const coleccionValidas =
            scope.collection("interacciones");

        const coleccionCuarentena =
            scope.collection("interacciones_cuarentena");

        async function cargar(
            registros: Registro[],
            coleccion: couchbase.Collection,
            nombre: string
        ) {
            let procesados = 0;
            const tamanoLote = 20;

            for (
                let inicio = 0;
                inicio < registros.length;
                inicio += tamanoLote
            ) {
                const lote = registros.slice(
                    inicio,
                    inicio + tamanoLote
                );

                // Procesamiento por lotes pequeños.
                await Promise.all(
                    lote.map(async registro => {
                        const documento = convertirDocumento(registro);

                        await coleccion.upsert(
                            documento.id_interaccion,
                            documento
                        );
                    })
                );

                procesados += lote.length;

                console.log(
                    `📥 ${nombre}: ${procesados}/${registros.length}`
                );
            }
        }

        console.log("\n📂 Cargando interacciones válidas...");

        await cargar(
            validas,
            coleccionValidas,
            "Interacciones"
        );

        console.log("\n📂 Cargando cuarentena...");

        await cargar(
            cuarentena,
            coleccionCuarentena,
            "Cuarentena"
        );

        // Confirmar que podemos leer documentos cargados.
        const primeraValida = validas[0];
        const primeraCuarentena = cuarentena[0];

        const documentoValido = await coleccionValidas.get(
            primeraValida.id_interaccion
        );

        const documentoCuarentena =
            await coleccionCuarentena.get(
                primeraCuarentena.id_interaccion
            );

        console.log("\n✅ IMPORTACIÓN FINALIZADA");
        console.log("Interacciones válidas procesadas:", validas.length);
        console.log("Interacciones de cuarentena procesadas:", cuarentena.length);

        console.log("\n🔎 VERIFICACIÓN DE LECTURA");
        console.log(
            "Documento válido:",
            documentoValido.content.id_interaccion
        );
        console.log(
            "Documento en cuarentena:",
            documentoCuarentena.content.id_interaccion
        );

        console.log("\n✅ Ambas colecciones responden correctamente");

    } catch (error) {
        console.error("\n❌ Error durante la importación");

        if (error instanceof Error) {
            console.error("Tipo:", error.name);
            console.error("Mensaje:", error.message);
        }

        process.exitCode = 1;
    } finally {
        if (cluster) {
            await cluster.close();
        }
    }
}

main();
