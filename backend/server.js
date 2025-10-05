// backend/server.js
const express = require("express");
const cors = require("cors");
const db = require("./database.js");

const app = express();
app.use(cors());
app.use(express.json());

const HTTP_PORT = 8000;
app.listen(HTTP_PORT, () => {
    console.log(`Servidor corriendo en http://localhost:${HTTP_PORT}`);
});

// --- LÓGICA DE TARIFAS ---
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

// --- ENDPOINTS DE LA API ---

// 1. Obtener el estado de todos los espacios
app.get("/api/parking-status", (req, res) => {
    const sql = "SELECT * FROM parking_spots ORDER BY id";
    db.all(sql, [], (err, rows) => {
        if (err) {
            res.status(400).json({ "error": err.message });
            return;
        }
        res.json({ data: rows });
    });
});

// 2. Obtener los registros (historial)
app.get("/api/records", (req, res) => {
    const sql = "SELECT * FROM parking_records ORDER BY entry_time DESC";
    db.all(sql, [], (err, rows) => {
        if (err) {
            res.status(400).json({ "error": err.message });
            return;
        }
        res.json({ data: rows });
    });
});

// 3. Registrar una ENTRADA de vehículo
app.post("/api/entry", (req, res) => {
    const { spot_id, license_plate } = req.body;
    const entry_time = new Date().toISOString();

    const updateSpotSql = `UPDATE parking_spots SET is_occupied = 1, license_plate = ?, entry_time = ? WHERE id = ?`;
    db.run(updateSpotSql, [license_plate, entry_time, spot_id], function(err) {
        if (err) {
            return res.status(400).json({ "error": err.message });
        }
        // Crear registro en el historial
        const insertRecordSql = `INSERT INTO parking_records (license_plate, entry_time, status) VALUES (?, ?, 'En estacionamiento')`;
        db.run(insertRecordSql, [license_plate, entry_time], function(err) {
            if (err) {
                return res.status(400).json({ "error": err.message });
            }
            res.json({ message: "Entrada registrada con éxito", spot_id, license_plate });
        });
    });
});

// 4. Registrar una SALIDA de vehículo
app.post("/api/exit", (req, res) => {
    const { spot_id } = req.body;
    const exit_time = new Date().toISOString();

    // Obtener datos del vehículo que sale
    const getSpotSql = "SELECT license_plate, entry_time FROM parking_spots WHERE id = ?";
    db.get(getSpotSql, [spot_id], (err, spot) => {
        if (err || !spot || !spot.entry_time) {
            return res.status(400).json({ "error": "No se pudo encontrar el vehículo en ese espacio." });
        }
        
        const { fee, duration } = calculateFee(spot.entry_time, exit_time);
        
        // Actualizar el espacio a disponible
        const updateSpotSql = `UPDATE parking_spots SET is_occupied = 0, license_plate = NULL, entry_time = NULL WHERE id = ?`;
        db.run(updateSpotSql, [spot_id], function(err) {
            if (err) {
                return res.status(400).json({ "error": err.message });
            }
            // Actualizar el registro en el historial
            const updateRecordSql = `UPDATE parking_records SET exit_time = ?, duration_minutes = ?, fee = ?, status = 'Completado' WHERE license_plate = ? AND status = 'En estacionamiento'`;
            db.run(updateRecordSql, [exit_time, duration, fee, spot.license_plate], function(err) {
                if (err) {
                    return res.status(400).json({ "error": err.message });
                }
                res.json({ message: "Salida registrada con éxito", license_plate: spot.license_plate, fee, duration });
            });
        });
    });
});

// 5. Endpoint para las estadísticas rápidas
app.get("/api/stats", (req, res) => {
    const today = new Date().toISOString().slice(0, 10); // Formato YYYY-MM-DD

    const queries = {
        occupied: "SELECT COUNT(*) as count FROM parking_spots WHERE is_occupied = 1",
        available: "SELECT COUNT(*) as count FROM parking_spots WHERE is_occupied = 0",
        todayEntries: `SELECT COUNT(*) as count FROM parking_records WHERE date(entry_time) = ?`,
        todayRevenue: `SELECT SUM(fee) as total FROM parking_records WHERE date(exit_time) = ? AND status = 'Completado'`
    };

    db.get(queries.occupied, [], (err, occupied) => {
    db.get(queries.available, [], (err, available) => {
    db.get(queries.todayEntries, [today], (err, entries) => {
    db.get(queries.todayRevenue, [today], (err, revenue) => {
        res.json({
            occupied_spots: occupied.count,
            available_spots: available.count,
            today_entries: entries.count,
            today_revenue: revenue.total || 0
        });
    });
    });
    });
    });
});


// Endpoint de error por defecto
app.use(function(req, res){
    res.status(404);
});