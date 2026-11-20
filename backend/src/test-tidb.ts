
import "dotenv/config";
import mysql from "mysql2/promise";

async function probarTiDB() {
    try {
        const conexion = await mysql.createConnection({
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

        console.log("✅ Conexión exitosa con TiDB Cloud");

        const [tablas] = await conexion.query("SHOW TABLES");

        console.log("Tablas encontradas:");
        console.table(tablas);

        const [usuarios] = await conexion.query(
            "SELECT COUNT(*) AS total FROM usuarios"
        );

        console.log("Usuarios registrados:");
        console.table(usuarios);

        await conexion.end();

    } catch (error) {
        console.error("❌ Error al conectar con TiDB:");

        if (error instanceof Error) {
            console.error(error.message);
        }

        process.exitCode = 1;
    }
}

probarTiDB();
