
import express from "express";
import cors from "cors";
import dotenv from "dotenv";

dotenv.config();

const app = express();
const PORT = Number(process.env.PORT) || 3000;

app.use(cors({
    origin: "http://localhost:5173"
}));

app.use(express.json());

app.get("/", (_req, res) => {
    res.json({
        mensaje: "Bienvenido a COMUNIGHT",
        estado: "Backend funcionando correctamente"
    });
});

app.get("/api/health", (_req, res) => {
    res.json({
        status: "ok",
        servicio: "COMMUNITY 360 API",
        timestamp: new Date().toISOString()
    });
});

app.listen(PORT, () => {
    console.log(`Servidor funcionando en http://localhost:${PORT}`);
});
