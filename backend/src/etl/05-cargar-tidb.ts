
import "dotenv/config";
import fs from "node:fs";
import path from "node:path";
import mysql from "mysql2/promise";
import { parse } from "csv-parse/sync";

type UsuarioCSV = Record<string, string>;

const ruta = path.resolve(
    "data/procesados/usuarios_limpios.csv"
);

const columnas = [
    "id_usuario",
    "alias",
    "fecha_ingreso",
    "pais",
    "estado",
    "ciudad",
    "latitud",
    "longitud",
    "zona_horaria",
    "rango_edad",
    "especie_fursona",
    "interes_principal",
    "plataforma_principal",
    "es_artista",
    "mensajes_30d",
    "reacciones_30d",
    "eventos_asistidos",
    "comisiones_compradas",
    "sentimiento_promedio",
    "ultima_actividad",
    "estatus",
    "consentimiento_datos",
    "id_carga"
] as const;

function textoONull(valor: string | undefined) {
    const v = (valor ?? "").trim();
    return v === "" ? null : v;
}

function numeroONull(valor: string | undefined) {
    const v = textoONull(valor);
    return v === null ? null : Number(v);
}

async function main() {
    let conexion: mysql.Connection | undefined;
    let transaccionIniciada = false;

    try {
        if (!fs.existsSync(ruta)) {
            throw new Error("No existe usuarios_limpios.csv");
        }

        const usuarios = parse(
            fs.readFileSync(ruta, "utf8"),
            {
                columns: true,
                bom: true,
                skip_empty_lines: true
            }
        ) as UsuarioCSV[];

        console.log("🚀 IMPORTACIÓN A TIDB CLOUD");
        console.log("Usuarios encontrados:", usuarios.length);

        if (usuarios.length !== 1068) {
            throw new Error(
                `Se esperaban 1068 usuarios y hay ${usuarios.length}`
            );
        }

        const reporte = JSON.parse(
            fs.readFileSync(
                path.resolve("data/procesados/reporte_limpieza.json"),
                "utf8"
            )
        );

        conexion = await mysql.createConnection({
            host: process.env.TIDB_HOST,
            port: Number(process.env.TIDB_PORT || 4000),
            user: process.env.TIDB_USER,
            password: process.env.TIDB_PASSWORD,
            database: process.env.TIDB_DATABASE,
            ssl: {
                minVersion: "TLSv1.2",
                rejectUnauthorized: true
            }
        });

        console.log("✅ Conexión exitosa con TiDB");

        // Evitar duplicar una carga anterior.
        const [existentes] = await conexion.query<mysql.RowDataPacket[]>(
            "SELECT COUNT(*) AS total FROM usuarios"
        );

        if (Number(existentes[0].total) !== 0) {
            throw new Error(
                "La tabla usuarios ya contiene datos. " +
                "No se realizará otra importación automática."
            );
        }

        // Todos los cambios se confirman juntos.
        await conexion.beginTransaction();
        transaccionIniciada = true;

        // 1. Registrar el inicio de la importación
        const [bitacora] = await conexion.execute<mysql.ResultSetHeader>(
            `INSERT INTO bitacora_importacion
       (
         archivo_origen,
         fecha_inicio,
         recibidos,
         aceptados,
         transformados,
         rechazados,
         estado_carga,
         observaciones
       )
       VALUES (?, NOW(), ?, 0, 0, 0, ?, ?)`,
            [
                "comunidad_virtual_usuarios.csv",
                usuarios.length,
                "EN_PROCESO",
                "Importación ETL COMMUNITY360 desde CSV depurado"
            ]
        );

        const idCarga = bitacora.insertId;

        console.log("✅ Bitácora creada. ID:", idCarga);

        // 2. Preparar e insertar los usuarios
        const tamanoLote = 100;
        let insertados = 0;

        for (let inicio = 0; inicio < usuarios.length; inicio += tamanoLote) {
            const lote = usuarios.slice(
                inicio,
                inicio + tamanoLote
            );

            const filas = lote.map(u => {
                const consentimiento =
                    u.consentimiento_datos.trim().toLowerCase();

                if (!["si", "no"].includes(consentimiento)) {
                    throw new Error(
                        `Consentimiento inválido: ${u.id_usuario}`
                    );
                }

                const permiteUbicacion = consentimiento === "si";

                return [
                    u.id_usuario,
                    u.alias,
                    u.fecha_ingreso,

                    permiteUbicacion ? textoONull(u.pais) : null,
                    permiteUbicacion ? textoONull(u.estado) : null,
                    permiteUbicacion ? textoONull(u.ciudad) : null,
                    permiteUbicacion ? numeroONull(u.latitud) : null,
                    permiteUbicacion ? numeroONull(u.longitud) : null,
                    permiteUbicacion ? textoONull(u.zona_horaria) : null,

                    u.rango_edad,
                    u.especie_fursona,
                    u.interes_principal,
                    u.plataforma_principal,
                    Number(u.es_artista),
                    Number(u.mensajes_30d),
                    Number(u.reacciones_30d),
                    Number(u.eventos_asistidos),
                    Number(u.comisiones_compradas),
                    Number(u.sentimiento_promedio),
                    u.ultima_actividad,
                    u.estatus,
                    consentimiento,
                    idCarga
                ];
            });

            const marcadorFila =
                `(${columnas.map(() => "?").join(",")})`;

            const marcadores = lote
                .map(() => marcadorFila)
                .join(",");

            const sql = `
        INSERT INTO usuarios
        (${columnas.join(", ")})
        VALUES ${marcadores}
      `;

            await conexion.query(sql, filas.flat());

            insertados += lote.length;

            console.log(
                `📥 Usuarios insertados: ${insertados}/${usuarios.length}`
            );
        }

        // 3. Marcar la carga como finalizada
        await conexion.execute(
            `UPDATE bitacora_importacion
       SET fecha_fin = NOW(),
           aceptados = ?,
           transformados = ?,
           rechazados = ?,
           estado_carga = ?,
           observaciones = ?
       WHERE id_carga = ?`,
            [
                insertados,
                reporte.usuarios.sin_consentimiento,
                reporte.usuarios.rechazados,
                "FINALIZADA",
                "CSV depurado, fechas normalizadas y privacidad aplicada",
                idCarga
            ]
        );

        await conexion.commit();
        transaccionIniciada = false;

        console.log("\n✅ IMPORTACIÓN FINALIZADA");
        console.log("Usuarios insertados:", insertados);
        console.log("ID de carga:", idCarga);

        // 4. Verificación final
        const [conteo] = await conexion.query<mysql.RowDataPacket[]>(
            "SELECT COUNT(*) AS total FROM usuarios"
        );

        const [privacidad] = await conexion.query<mysql.RowDataPacket[]>(
            `SELECT COUNT(*) AS total
       FROM usuarios
       WHERE consentimiento_datos = 'no'
         AND pais IS NULL
         AND estado IS NULL
         AND ciudad IS NULL
         AND latitud IS NULL
         AND longitud IS NULL
         AND zona_horaria IS NULL`
        );

        console.log("\n📊 VERIFICACIÓN EN TIDB");
        console.log("Usuarios en la base:", conteo[0].total);
        console.log(
            "Usuarios sin consentimiento y sin ubicación:",
            privacidad[0].total
        );

    } catch (error) {
        if (conexion && transaccionIniciada) {
            try {
                await conexion.rollback();
                console.log("↩️ Transacción cancelada.");
            } catch (rollbackError) {
                console.error("Error al revertir:", rollbackError);
            }
        }

        console.error("❌ Error de importación:");

        if (error instanceof Error) {
            console.error(error.message);
        }

        process.exitCode = 1;
    } finally {
        if (conexion) {
            await conexion.end();
        }
    }
}

main();
