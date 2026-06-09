const express = require("express");
const cors = require("cors");
const supabase = require("./database.js");
const path = require('path');
const ExcelJS = require('exceljs');

const app = express();
app.use(cors());
app.use(express.json());
app.use(express.static(path.join(__dirname, '..', 'public')));

// --- CONFIGURACIÓN DINÁMICA DE TARIFAS ---
let settings = {
    baseFee: 2000,
    additionalHourFee: 1500,
    maxDailyFee: 15000,
    parkingName: "Estacionamiento Inteligente"
};

// --- LÓGICA DE TARIFAS ---
function calculateFee(entryTime, exitTime) {
    const entry = new Date(entryTime);
    const exit = new Date(exitTime);
    const durationMinutes = Math.ceil((exit - entry) / (1000 * 60));

    if (durationMinutes <= 60) {
        return { fee: settings.baseFee, duration: durationMinutes };
    }

    const hours = Math.ceil(durationMinutes / 60);
    let fee = settings.baseFee + (hours - 1) * settings.additionalHourFee;
    return { fee: Math.min(fee, settings.maxDailyFee), duration: durationMinutes };
}

// ============================================================
// ENDPOINTS EXISTENTES
// ============================================================

// 1. Estado de todos los espacios
app.get("/api/parking-status", async (req, res) => {
    try {
        const { data, error } = await supabase
            .from('parking_spots')
            .select('*')
            .order('id', { ascending: true });

        if (error) throw error;
        res.json({ data });
    } catch (err) {
        res.status(400).json({ error: err.message });
    }
});

// 2. Historial con filtros
app.get("/api/records", async (req, res) => {
    try {
        const { startDate, endDate } = req.query;

        let query = supabase
            .from('parking_records')
            .select('*')
            .order('entry_time', { ascending: false });

        if (startDate && endDate) {
            const endOfDay = new Date(endDate);
            endOfDay.setDate(endOfDay.getDate() + 1);
            query = query
                .gte('entry_time', startDate)
                .lt('entry_time', endOfDay.toISOString().split('T')[0]);
        }

        const { data, error } = await query;
        if (error) throw error;
        res.json({ data });
    } catch (err) {
        res.status(400).json({ error: err.message });
    }
});

// 3. Registrar ENTRADA manual (legacy — mantener compatibilidad)
app.post("/api/entry", async (req, res) => {
    const { spot_id, license_plate } = req.body;
    const entry_time = new Date().toISOString();

    try {
        const { error: updateError } = await supabase
            .from('parking_spots')
            .update({
                is_occupied: true,
                license_plate: license_plate,
                entry_time: entry_time
            })
            .eq('id', spot_id);

        if (updateError) throw updateError;

        const { error: insertError } = await supabase
            .from('parking_records')
            .insert([{
                license_plate: license_plate,
                entry_time: entry_time,
                status: 'En estacionamiento'
            }]);

        if (insertError) throw insertError;
        res.json({ message: "Entrada registrada con éxito", spot_id, license_plate });
    } catch (err) {
        res.status(400).json({ error: err.message });
    }
});

// 4. Registrar SALIDA
app.post("/api/exit", async (req, res) => {
    const { spot_id } = req.body;
    const exit_time = new Date().toISOString();

    try {
        const { data: spots, error: fetchError } = await supabase
            .from('parking_spots')
            .select('license_plate, entry_time')
            .eq('id', spot_id)
            .single();

        if (fetchError || !spots || !spots.entry_time) {
            return res.status(400).json({ error: "No se pudo encontrar el vehículo." });
        }

        const { fee, duration } = calculateFee(spots.entry_time, exit_time);

        const { error: updateSpotError } = await supabase
            .from('parking_spots')
            .update({ is_occupied: false, license_plate: null, entry_time: null })
            .eq('id', spot_id);

        if (updateSpotError) throw updateSpotError;

        const { error: updateRecordError } = await supabase
            .from('parking_records')
            .update({
                exit_time: exit_time,
                duration_minutes: duration,
                fee: fee,
                status: 'Completado'
            })
            .eq('license_plate', spots.license_plate)
            .eq('status', 'En estacionamiento');

        if (updateRecordError) throw updateRecordError;

        res.json({ message: "Salida registrada con éxito", license_plate: spots.license_plate, fee, duration });
    } catch (err) {
        res.status(400).json({ error: err.message });
    }
});

// 5. Estadísticas rápidas
app.get("/api/stats", async (req, res) => {
    try {
        const { count: occupiedCount, error: errOcc } = await supabase
            .from('parking_spots')
            .select('*', { count: 'exact', head: true })
            .eq('is_occupied', true);

        const today = new Date().toISOString().split('T')[0];

        const { count: todayEntries, error: errEnt } = await supabase
            .from('parking_records')
            .select('*', { count: 'exact', head: true })
            .gte('entry_time', today);

        const { data: revenueData, error: errRev } = await supabase
            .from('parking_records')
            .select('fee')
            .gte('exit_time', today)
            .eq('status', 'Completado');

        if (errOcc || errEnt || errRev) throw new Error("Error fetching stats");

        const totalRevenue = revenueData.reduce((sum, record) => sum + (record.fee || 0), 0);
        const totalSpots = 8;

        res.json({
            occupied_spots: occupiedCount || 0,
            available_spots: totalSpots - (occupiedCount || 0),
            today_entries: todayEntries || 0,
            today_revenue: totalRevenue
        });
    } catch (err) {
        res.status(400).json({ error: err.message });
    }
});

// 6. Datos de la gráfica
app.get("/api/chart-data", async (req, res) => {
    try {
        const today = new Date().toISOString().split('T')[0];
        const { data: records, error } = await supabase
            .from('parking_records')
            .select('entry_time, exit_time')
            .gte('entry_time', today);

        if (error) throw error;

        const hours = [8, 9, 10, 11, 12, 13, 14, 15, 16, 17, 18, 19, 20, 21];
        const labels = hours.map(h => `${h}:00`);

        const data = hours.map(hour => {
            let occupiedAtHour = 0;
            records.forEach(record => {
                const entryStr = new Date(record.entry_time).toLocaleString("en-US", { timeZone: "America/Bogota" });
                const entryHour = new Date(entryStr).getHours();
                let exitHour = 24;
                if (record.exit_time) {
                    const exitStr = new Date(record.exit_time).toLocaleString("en-US", { timeZone: "America/Bogota" });
                    exitHour = new Date(exitStr).getHours();
                }
                if (entryHour <= hour && exitHour >= hour) occupiedAtHour++;
            });
            return occupiedAtHour;
        });

        res.json({ labels, data });
    } catch (err) {
        res.status(400).json({ error: err.message });
    }
});

// 7. Exportar a Excel
app.get("/api/records/export", async (req, res) => {
    try {
        const { startDate, endDate } = req.query;
        let query = supabase.from('parking_records').select('*').order('entry_time', { ascending: false });

        if (startDate && endDate) {
            const endOfDay = new Date(endDate);
            endOfDay.setDate(endOfDay.getDate() + 1);
            query = query.gte('entry_time', startDate).lt('entry_time', endOfDay.toISOString().split('T')[0]);
        }

        const { data: records, error } = await query;
        if (error) throw error;

        const workbook = new ExcelJS.Workbook();
        const worksheet = workbook.addWorksheet('Registros');

        worksheet.columns = [
            { header: 'Placa', key: 'license_plate', width: 15 },
            { header: 'Hora de Entrada', key: 'entry_time', width: 25 },
            { header: 'Hora de Salida', key: 'exit_time', width: 25 },
            { header: 'Duración (min)', key: 'duration_minutes', width: 15 },
            { header: 'Tarifa', key: 'fee', width: 15, style: { numFmt: '$#,##0' } },
            { header: 'Estado', key: 'status', width: 20 }
        ];

        worksheet.getRow(1).eachCell((cell) => {
            cell.font = { bold: true };
            cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFE0E0E0' } };
        });

        const formattedRecords = records.map(r => ({
            ...r,
            entry_time: new Date(r.entry_time).toLocaleString('es-CO', { timeZone: 'America/Bogota' }),
            exit_time: r.exit_time ? new Date(r.exit_time).toLocaleString('es-CO', { timeZone: 'America/Bogota' }) : 'N/A'
        }));

        worksheet.addRows(formattedRecords);
        res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
        res.setHeader('Content-Disposition', `attachment; filename=registros-${new Date().toISOString().slice(0, 10)}.xlsx`);
        await workbook.xlsx.write(res);
        res.end();
    } catch (err) {
        res.status(500).send("Error al generar el archivo Excel");
    }
});

// 8. Login
app.post("/api/login", (req, res) => {
    const { username, password } = req.body;
    if (username === "admin" && password === "tpi2026") {
        res.json({ success: true, message: "Acceso autorizado" });
    } else {
        res.status(401).json({ success: false, message: "Usuario o contraseña incorrectos" });
    }
});

// 9. Obtener configuración
app.get("/api/settings", (req, res) => {
    res.json(settings);
});

// 10. Actualizar configuración
app.post("/api/settings", (req, res) => {
    settings = { ...settings, ...req.body };
    res.json({ message: "Configuración actualizada con éxito", settings });
});

// ============================================================
// NUEVOS ENDPOINTS — SISTEMA DE COINCIDENCIAS
// ============================================================

// 11. Cámara reporta que vio una placa entrando (sin asignar plaza)
app.post("/api/vehicle-seen", async (req, res) => {
    const { license_plate } = req.body;
    if (!license_plate) return res.status(400).json({ error: "Falta license_plate" });

    try {
        const { error } = await supabase
            .from('vehicle_sightings')
            .insert([{ license_plate, seen_at: new Date().toISOString() }]);

        if (error) throw error;
        res.json({ message: "Placa registrada en entrada", license_plate });
    } catch (err) {
        res.status(400).json({ error: err.message });
    }
});

// 12. Sensor VL53L0X reporta que una plaza se ocupó
app.post("/api/spot-occupied", async (req, res) => {
    const { spot_id } = req.body;
    if (!spot_id) return res.status(400).json({ error: "Falta spot_id" });

    const occupied_at = new Date().toISOString();

    try {
        // Marcar plaza como ocupada visualmente en la web
        const { error: spotError } = await supabase
            .from('parking_spots')
            .update({ is_occupied: true, entry_time: occupied_at })
            .eq('id', spot_id);

        if (spotError) throw spotError;

        // Buscar placa más probable: vista en los últimos 5 minutos, aún no asignada
        const cincoMinutesAgo = new Date(Date.now() - 5 * 60 * 1000).toISOString();

        const { data: candidates } = await supabase
            .from('vehicle_sightings')
            .select('*')
            .gte('seen_at', cincoMinutesAgo)
            .eq('matched', false)
            .order('seen_at', { ascending: false });

        const best_match = candidates && candidates.length > 0 ? candidates[0] : null;

        // Registrar evento de ocupación
        const { error: eventError } = await supabase
            .from('spot_events')
            .insert([{
                spot_id,
                occupied_at,
                license_plate: best_match ? best_match.license_plate : null
            }]);

        if (eventError) throw eventError;

        // Si hay coincidencia, vincularla
        if (best_match) {
            // Marcar el avistamiento como asignado
            await supabase
                .from('vehicle_sightings')
                .update({ matched: true })
                .eq('id', best_match.id);

            // Actualizar la plaza con la placa encontrada
            await supabase
                .from('parking_spots')
                .update({ license_plate: best_match.license_plate })
                .eq('id', spot_id);

            // Crear registro en historial normal
            await supabase
                .from('parking_records')
                .insert([{
                    license_plate: best_match.license_plate,
                    entry_time: occupied_at,
                    status: 'En estacionamiento'
                }]);
        }

        res.json({
            message: "Plaza ocupada registrada",
            spot_id,
            probable_plate: best_match ? best_match.license_plate : "Sin coincidencia aún",
            candidates_available: candidates ? candidates.length : 0
        });
    } catch (err) {
        res.status(400).json({ error: err.message });
    }
});

// 13. Obtener coincidencias para el panel admin
app.get("/api/matches", async (req, res) => {
    try {
        // Placas vistas recientemente sin asignar a ninguna plaza
        const { data: unmatched } = await supabase
            .from('vehicle_sightings')
            .select('*')
            .eq('matched', false)
            .order('seen_at', { ascending: false })
            .limit(20);

        // Últimos eventos de ocupación de plazas
        const { data: events } = await supabase
            .from('spot_events')
            .select('*')
            .order('occupied_at', { ascending: false })
            .limit(20);

        res.json({
            unmatched_plates: unmatched || [],
            spot_events: events || []
        });
    } catch (err) {
        res.status(400).json({ error: err.message });
    }
});

// 14. Confirmar manualmente una coincidencia placa-plaza
app.post("/api/confirm-match", async (req, res) => {
    const { spot_id, license_plate, sighting_id } = req.body;
    if (!spot_id || !license_plate || !sighting_id) {
        return res.status(400).json({ error: "Faltan campos: spot_id, license_plate, sighting_id" });
    }

    try {
        await supabase
            .from('parking_spots')
            .update({ license_plate })
            .eq('id', spot_id);

        await supabase
            .from('vehicle_sightings')
            .update({ matched: true })
            .eq('id', sighting_id);

        await supabase
            .from('spot_events')
            .update({ license_plate })
            .eq('spot_id', spot_id)
            .is('license_plate', null);

        // Crear registro en historial si no existe
        const { data: existing } = await supabase
            .from('parking_records')
            .select('id')
            .eq('license_plate', license_plate)
            .eq('status', 'En estacionamiento')
            .single();

        if (!existing) {
            await supabase
                .from('parking_records')
                .insert([{
                    license_plate,
                    entry_time: new Date().toISOString(),
                    status: 'En estacionamiento'
                }]);
        }

        res.json({ message: "Coincidencia confirmada", spot_id, license_plate });
    } catch (err) {
        res.status(400).json({ error: err.message });
    }
});

// ============================================================
app.use(function (req, res) {
    res.status(404).send("Ruta no encontrada");
});

const PORT = process.env.PORT || 8000;
app.listen(PORT, () => {
    console.log(`Servidor corriendo en el puerto ${PORT}`);
});