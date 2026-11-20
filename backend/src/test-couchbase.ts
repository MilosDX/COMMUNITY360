
import "dotenv/config";
import couchbase from "couchbase";

async function probarCouchbase() {
    let cluster: couchbase.Cluster | undefined;
    let etapa = "Inicio";

    try {
        console.log("🚀 Iniciando diagnóstico de Couchbase...");

        etapa = "Conexión al clúster";
        console.log("1. Conectando al clúster...");


        cluster = await couchbase.connect(
            process.env.COUCHBASE_CONNECTION_STRING!,
            {
                username: process.env.COUCHBASE_USERNAME!,
                password: process.env.COUCHBASE_PASSWORD!,
                configProfile: "wanDevelopment"
            }
        );


        console.log("✅ Conexión al clúster exitosa");

        etapa = "Acceso al bucket";
        console.log("2. Comprobando bucket...");

        const bucket = cluster.bucket(
            process.env.COUCHBASE_BUCKET!
        );

        await bucket.waitUntilReady(30000);
        console.log("✅ Bucket disponible");

        etapa = "Consulta SQL++";
        console.log("3. Probando consulta...");

        const resultado = await cluster.query(
            "SELECT COUNT(*) AS total FROM `COMMUNITY360`.`analytics`.`interacciones`"
        );

        console.log("✅ Consulta exitosa");
        console.log("Documentos:", resultado.rows[0]?.total);

    } catch (error) {
        console.error("❌ Error durante:", etapa);

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

probarCouchbase();
