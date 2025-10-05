// backend/server.js (actualizado para PostgreSQL)
const express = require("express");
const cors = require("cors");
const db = require("./database.js");

const app = express();
app.use(cors());
app.use(express.json());

const PORT = process.env.PORT || 8000;
app.listen(PORT, () => {
    console.log(`Servidor corriendo en el puerto ${PORT}`);
});

// --- LÓGICA DE TARIFAS (sin cambios) ---
function calculateFee(entryTime, exitTime) {
    const entry = new Date(entryTime);
    const exit = new Date(exitTime);
    const durationMinutes = Math.ceil((exit - entry) / (1000 * 60));
    
    if (durationMinutes <= 60) {
        return { fee: 2.00, duration: durationMinutes };
    }

    const hours = Math.ceil(durationMinutes / 60);
    let fee = 2.00; // Tarifa primera hora
    fee += (hours - 1) * 1.50; // Tarifa horas adicionales

    const maxFee = 15.00;
    return { fee: Math.min(fee, maxFee), duration: durationMinutes };
}

// --- ENDPOINTS DE LA API (adaptados para PostgreSQL) ---

// 1. Obtener el estado de todos los espacios
app.get("/api/parking-status", async (req, res) => {
    try {
        const result = await db.query("SELECT * FROM parking_spots ORDER BY id");
        res.json({ data: result.rows });
    } catch (err) {
        res.status(400).json({ "error": err.message });
    }
});

// 2. Obtener los registros (historial)
app.get("/api/records", async (req, res) => {
    try {
        const result = await db.query("SELECT * FROM parking_records ORDER BY entry_time DESC");
        res.json({ data: result.rows });
    } catch (err) {
        res.status(400).json({ "error": err.message });
    }
});

// 3. Registrar una ENTRADA de vehículo
app.post("/api/entry", async (req, res) => {
    const { spot_id, license_plate } = req.body;
    const entry_time = new Date();

    try {
        await db.query(
            `UPDATE parking_spots SET is_occupied = true, license_plate = $1, entry_time = $2 WHERE id = $3`,
            [license_plate, entry_time, spot_id]
        );
        await db.query(
            `INSERT INTO parking_records (license_plate, entry_time, status) VALUES ($1, $2, 'En estacionamiento')`,
            [license_plate, entry_time]
        );
        res.json({ message: "Entrada registrada con éxito", spot_id, license_plate });
    } catch (err) {
        res.status(400).json({ "error": err.message });
    }
});

// 4. Registrar una SALIDA de vehículo
app.post("/api/exit", async (req, res) => {
    const { spot_id } = req.body;
    const exit_time = new Date();

    try {
        const spotResult = await db.query("SELECT license_plate, entry_time FROM parking_spots WHERE id = $1", [spot_id]);
        const spot = spotResult.rows[0];

        if (!spot || !spot.entry_time) {
            return res.status(400).json({ "error": "No se pudo encontrar el vehículo en ese espacio." });
        }
        
        const { fee, duration } = calculateFee(spot.entry_time, exit_time);
        
        await db.query(
            `UPDATE parking_spots SET is_occupied = false, license_plate = NULL, entry_time = NULL WHERE id = $1`,
            [spot_id]
        );
        await db.query(
            `UPDATE parking_records SET exit_time = $1, duration_minutes = $2, fee = $3, status = 'Completado' WHERE license_plate = $4 AND status = 'En estacionamiento'`,
            [exit_time, duration, fee, spot.license_plate]
        );
        res.json({ message: "Salida registrada con éxito", license_plate: spot.license_plate, fee, duration });
    } catch (err) {
        res.status(400).json({ "error": err.message });
    }
});

// 5. Endpoint para las estadísticas rápidas
app.get("/api/stats", async (req, res) => {
    try {
        const occupiedRes = await db.query("SELECT COUNT(*) FROM parking_spots WHERE is_occupied = true");
        const todayEntriesRes = await db.query("SELECT COUNT(*) FROM parking_records WHERE entry_time >= current_date");
        const todayRevenueRes = await db.query("SELECT SUM(fee) as total FROM parking_records WHERE exit_time >= current_date AND status = 'Completado'");
        
        const totalSpots = 8;
        const occupied_spots = parseInt(occupiedRes.rows[0].count, 10);

        res.json({
            occupied_spots: occupied_spots,
            available_spots: totalSpots - occupied_spots,
            today_entries: parseInt(todayEntriesRes.rows[0].count, 10),
            today_revenue: parseFloat(todayRevenueRes.rows[0].total) || 0
        });
    } catch (err) {
        res.status(400).json({ "error": err.message });
    }
});

// Endpoint de error por defecto
app.use(function(req, res){
    res.status(404).send("Ruta no encontrada");
});