const express = require("express");
const cors = require("cors");
const supabase = require("./database.js");
const path = require("path");
const ExcelJS = require("exceljs");

const app = express();
app.use(cors());
app.use(express.json({ limit: "10mb" }));
app.use(express.urlencoded({ limit: "10mb", extended: true }));
app.use(express.static(path.join(__dirname, "..", "public")));

// --- CONFIGURACION DINAMICA DE TARIFAS ---
let settings = {
    baseFee: 2000,
    additionalHourFee: 1500,
    maxDailyFee: 15000,
    parkingName: "Estacionamiento Inteligente"
};

// --- LOGICA DE TARIFAS ---
function calculateFee(entryTime, exitTime) {
    const entry = new Date(entryTime);
    const exit = new Date(exitTime);
    const durationMinutes = Math.max(1, Math.ceil((exit - entry) / (1000 * 60)));

    if (durationMinutes <= 60) {
        return { fee: settings.baseFee, duration: durationMinutes };
    }

    const hours = Math.ceil(durationMinutes / 60);
    let fee = settings.baseFee + (hours - 1) * settings.additionalHourFee;
    return { fee: Math.min(fee, settings.maxDailyFee), duration: durationMinutes };
}

// ============================================================
// ENDPOINTS PRINCIPALES
// ============================================================

// 1. Estado de todos los espacios
app.get("/api/parking-status", async (req, res) => {
    try {
        const { data, error } = await supabase
            .from("parking_spots")
            .select("*")
            .order("id", { ascending: true });

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
            .from("parking_records")
            .select("*")
            .order("entry_time", { ascending: false });

        if (startDate && endDate) {
            const endOfDay = new Date(endDate);
            endOfDay.setDate(endOfDay.getDate() + 1);
            query = query
                .gte("entry_time", startDate)
                .lt("entry_time", endOfDay.toISOString().split("T")[0]);
        }

        const { data, error } = await query;
        if (error) throw error;
        res.json({ data });
    } catch (err) {
        res.status(400).json({ error: err.message });
    }
});

// 3. Registrar ENTRADA manual
app.post("/api/entry", async (req, res) => {
    const { spot_id, license_plate, plate_image } = req.body;
    const entry_time = new Date().toISOString();

    try {
        const { error: updateError } = await supabase
            .from("parking_spots")
            .update({
                is_occupied: true,
                license_plate: license_plate,
                entry_time: entry_time,
                plate_image: plate_image || null
            })
            .eq("id", spot_id);

        if (updateError) throw updateError;

        if (license_plate) {
            const { error: insertError } = await supabase
                .from("parking_records")
                .insert([{
                    license_plate: license_plate,
                    entry_time: entry_time,
                    status: "En estacionamiento",
                    plate_image: plate_image || null
                }]);

            if (insertError) throw insertError;
        }

        res.json({ message: "Entrada registrada con exito", spot_id, license_plate });
    } catch (err) {
        res.status(400).json({ error: err.message });
    }
});

// 4. Registrar SALIDA (Soporta plazas con o sin placa asignada)
app.post("/api/exit", async (req, res) => {
    const { spot_id } = req.body;
    const exit_time = new Date().toISOString();

    try {
        const { data: spots, error: fetchError } = await supabase
            .from("parking_spots")
            .select("license_plate, entry_time")
            .eq("id", spot_id)
            .single();

        if (fetchError || !spots) {
            return res.status(400).json({ error: "No se pudo encontrar la plaza." });
        }

        const entryTimeRef = spots.entry_time || exit_time;
        const { fee, duration } = calculateFee(entryTimeRef, exit_time);

        const { error: updateSpotError } = await supabase
            .from("parking_spots")
            .update({ is_occupied: false, license_plate: null, entry_time: null, plate_image: null })
            .eq("id", spot_id);

        if (updateSpotError) throw updateSpotError;

        if (spots.license_plate) {
            const { error: updateRecordError } = await supabase
                .from("parking_records")
                .update({
                    exit_time: exit_time,
                    duration_minutes: duration,
                    fee: fee,
                    status: "Completado"
                })
                .eq("license_plate", spots.license_plate)
                .eq("status", "En estacionamiento");

            if (updateRecordError) throw updateRecordError;
        }

        res.json({
            message: "Salida registrada con exito",
            license_plate: spots.license_plate || "Sin placa",
            fee,
            duration
        });
    } catch (err) {
        res.status(400).json({ error: err.message });
    }
});

// 5. Estadisticas rapidas
app.get("/api/stats", async (req, res) => {
    try {
        const { count: occupiedCount, error: errOcc } = await supabase
            .from("parking_spots")
            .select("*", { count: "exact", head: true })
            .eq("is_occupied", true);

        const today = new Date().toISOString().split("T")[0];

        const { count: todayEntries, error: errEnt } = await supabase
            .from("parking_records")
            .select("*", { count: "exact", head: true })
            .gte("entry_time", today);

        const { data: revenueData, error: errRev } = await supabase
            .from("parking_records")
            .select("fee")
            .gte("exit_time", today)
            .eq("status", "Completado");

        if (errOcc || errEnt || errRev) throw new Error("Error obteniendo estadisticas");

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

// 6. Datos de la grafica
app.get("/api/chart-data", async (req, res) => {
    try {
        const today = new Date().toISOString().split("T")[0];
        const { data: records, error } = await supabase
            .from("parking_records")
            .select("entry_time, exit_time")
            .gte("entry_time", today);

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
        let query = supabase.from("parking_records").select("*").order("entry_time", { ascending: false });

        if (startDate && endDate) {
            const endOfDay = new Date(endDate);
            endOfDay.setDate(endOfDay.getDate() + 1);
            query = query.gte("entry_time", startDate).lt("entry_time", endOfDay.toISOString().split("T")[0]);
        }

        const { data: records, error } = await query;
        if (error) throw error;

        const workbook = new ExcelJS.Workbook();
        const worksheet = workbook.addWorksheet("Registros");

        worksheet.columns = [
            { header: "Placa", key: "license_plate", width: 15 },
            { header: "Hora de Entrada", key: "entry_time", width: 25 },
            { header: "Hora de Salida", key: "exit_time", width: 25 },
            { header: "Duracion (min)", key: "duration_minutes", width: 15 },
            { header: "Tarifa", key: "fee", width: 15, style: { numFmt: "$#,##0" } },
            { header: "Estado", key: "status", width: 20 }
        ];

        worksheet.getRow(1).eachCell((cell) => {
            cell.font = { bold: true };
            cell.fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FFE0E0E0" } };
        });

        const formattedRecords = records.map(r => ({
            ...r,
            entry_time: new Date(r.entry_time).toLocaleString("es-CO", { timeZone: "America/Bogota" }),
            exit_time: r.exit_time ? new Date(r.exit_time).toLocaleString("es-CO", { timeZone: "America/Bogota" }) : "N/A"
        }));

        worksheet.addRows(formattedRecords);
        res.setHeader("Content-Type", "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet");
        res.setHeader("Content-Disposition", `attachment; filename=registros-${new Date().toISOString().slice(0, 10)}.xlsx`);
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
        res.status(401).json({ success: false, message: "Usuario o contrasena incorrectos" });
    }
});

// 9. Obtener configuracion
app.get("/api/settings", (req, res) => {
    res.json(settings);
});

// 10. Actualizar configuracion
app.post("/api/settings", (req, res) => {
    settings = { ...settings, ...req.body };
    res.json({ message: "Configuracion actualizada con exito", settings });
});

// ============================================================
// ENDPOINTS — SISTEMA DE COINCIDENCIAS, FOTOS Y CONTROL ADMIN
// ============================================================

// 11. Camara reporta que vio una placa entrando junto con su fotografia
app.post("/api/vehicle-seen", async (req, res) => {
    const { license_plate, plate_image } = req.body;
    if (!license_plate) return res.status(400).json({ error: "Falta license_plate" });

    const plateClean = license_plate.trim().toUpperCase();

    try {
        const { error } = await supabase
            .from("vehicle_sightings")
            .insert([{
                license_plate: plateClean,
                plate_image: plate_image || null,
                seen_at: new Date().toISOString(),
                matched: false
            }]);

        if (error) throw error;
        res.json({ message: "Placa y captura registradas en entrada", license_plate: plateClean });
    } catch (err) {
        res.status(400).json({ error: err.message });
    }
});

// 12. Sensor VL53L0X reporta que una plaza se ocupo
app.post("/api/spot-occupied", async (req, res) => {
    const { spot_id } = req.body;
    if (!spot_id) return res.status(400).json({ error: "Falta spot_id" });

    const occupied_at = new Date().toISOString();

    try {
        const { error: spotError } = await supabase
            .from("parking_spots")
            .update({ is_occupied: true, entry_time: occupied_at })
            .eq("id", spot_id);

        if (spotError) throw spotError;

        const cincoMinutesAgo = new Date(Date.now() - 5 * 60 * 1000).toISOString();

        const { data: candidates } = await supabase
            .from("vehicle_sightings")
            .select("*")
            .gte("seen_at", cincoMinutesAgo)
            .eq("matched", false)
            .order("seen_at", { ascending: false });

        const best_match = candidates && candidates.length > 0 ? candidates[0] : null;

        const { error: eventError } = await supabase
            .from("spot_events")
            .insert([{
                spot_id,
                occupied_at,
                license_plate: best_match ? best_match.license_plate : null,
                plate_image: best_match ? best_match.plate_image : null
            }]);

        if (eventError) throw eventError;

        if (best_match) {
            await supabase
                .from("vehicle_sightings")
                .update({ matched: true })
                .eq("id", best_match.id);

            await supabase
                .from("parking_spots")
                .update({
                    license_plate: best_match.license_plate,
                    plate_image: best_match.plate_image || null
                })
                .eq("id", spot_id);

            await supabase
                .from("parking_records")
                .insert([{
                    license_plate: best_match.license_plate,
                    entry_time: occupied_at,
                    status: "En estacionamiento",
                    plate_image: best_match.plate_image || null
                }]);
        }

        res.json({
            message: "Plaza ocupada registrada",
            spot_id,
            probable_plate: best_match ? best_match.license_plate : "Sin coincidencia aun",
            candidates_available: candidates ? candidates.length : 0
        });
    } catch (err) {
        res.status(400).json({ error: err.message });
    }
});

// 13. Obtener coincidencias para el panel admin
app.get("/api/matches", async (req, res) => {
    try {
        const { data: unmatched } = await supabase
            .from("vehicle_sightings")
            .select("*")
            .eq("matched", false)
            .order("seen_at", { ascending: false })
            .limit(30);

        const { data: events } = await supabase
            .from("spot_events")
            .select("*")
            .order("occupied_at", { ascending: false })
            .limit(40);

        res.json({
            unmatched_plates: unmatched || [],
            spot_events: events || []
        });
    } catch (err) {
        res.status(400).json({ error: err.message });
    }
});

// 14. Confirmar o asignar manualmente una coincidencia placa-plaza (conservando la foto)
app.post("/api/confirm-match", async (req, res) => {
    const { spot_id, license_plate, sighting_id } = req.body;
    if (!spot_id || !license_plate) {
        return res.status(400).json({ error: "Faltan campos: spot_id, license_plate" });
    }

    const plateClean = license_plate.trim().toUpperCase();
    const nowIso = new Date().toISOString();

    try {
        const { data: currentSpot } = await supabase
            .from("parking_spots")
            .select("entry_time, plate_image")
            .eq("id", spot_id)
            .single();

        const entryTime = (currentSpot && currentSpot.entry_time) ? currentSpot.entry_time : nowIso;
        let capturedImage = currentSpot ? currentSpot.plate_image : null;

        if (sighting_id) {
            const { data: sightingData } = await supabase
                .from("vehicle_sightings")
                .select("plate_image")
                .eq("id", sighting_id)
                .maybeSingle();

            if (sightingData && sightingData.plate_image) {
                capturedImage = sightingData.plate_image;
            }

            await supabase
                .from("vehicle_sightings")
                .update({ matched: true })
                .eq("id", sighting_id);
        } else {
            const { data: latestSighting } = await supabase
                .from("vehicle_sightings")
                .select("id, plate_image")
                .eq("license_plate", plateClean)
                .order("seen_at", { ascending: false })
                .limit(1)
                .maybeSingle();

            if (latestSighting) {
                if (latestSighting.plate_image) capturedImage = latestSighting.plate_image;
                await supabase
                    .from("vehicle_sightings")
                    .update({ matched: true })
                    .eq("id", latestSighting.id);
            }
        }

        await supabase
            .from("parking_spots")
            .update({
                is_occupied: true,
                license_plate: plateClean,
                entry_time: entryTime,
                plate_image: capturedImage
            })
            .eq("id", spot_id);

        await supabase
            .from("spot_events")
            .insert([{
                spot_id: parseInt(spot_id),
                occupied_at: entryTime,
                license_plate: plateClean,
                plate_image: capturedImage
            }]);

        const { data: existing } = await supabase
            .from("parking_records")
            .select("id")
            .eq("license_plate", plateClean)
            .eq("status", "En estacionamiento")
            .maybeSingle();

        if (!existing) {
            await supabase
                .from("parking_records")
                .insert([{
                    license_plate: plateClean,
                    entry_time: entryTime,
                    status: "En estacionamiento",
                    plate_image: capturedImage
                }]);
        } else if (capturedImage) {
            await supabase
                .from("parking_records")
                .update({ plate_image: capturedImage })
                .eq("id", existing.id);
        }

        res.json({ message: "Placa asignada correctamente", spot_id, license_plate: plateClean });
    } catch (err) {
        res.status(400).json({ error: err.message });
    }
});

// 15. Editar/Cambiar la placa de una plaza directamente
app.post("/api/update-spot-plate", async (req, res) => {
    const { spot_id, license_plate } = req.body;
    if (!spot_id) return res.status(400).json({ error: "Falta spot_id" });

    const plateClean = license_plate ? license_plate.trim().toUpperCase() : null;
    const nowIso = new Date().toISOString();

    try {
        const { data: spot } = await supabase
            .from("parking_spots")
            .select("*")
            .eq("id", spot_id)
            .single();

        const oldPlate = spot ? spot.license_plate : null;
        const entryTime = (spot && spot.entry_time) ? spot.entry_time : nowIso;
        let plateImage = spot ? spot.plate_image : null;

        if (plateClean && plateClean !== oldPlate) {
            const { data: sightingImg } = await supabase
                .from("vehicle_sightings")
                .select("plate_image")
                .eq("license_plate", plateClean)
                .order("seen_at", { ascending: false })
                .limit(1)
                .maybeSingle();

            if (sightingImg && sightingImg.plate_image) {
                plateImage = sightingImg.plate_image;
            }
        }

        await supabase
            .from("parking_spots")
            .update({
                is_occupied: Boolean(plateClean),
                license_plate: plateClean,
                entry_time: plateClean ? entryTime : null,
                plate_image: plateClean ? plateImage : null
            })
            .eq("id", spot_id);

        if (oldPlate && plateClean && oldPlate !== plateClean) {
            await supabase
                .from("parking_records")
                .update({ license_plate: plateClean, plate_image: plateImage })
                .eq("license_plate", oldPlate)
                .eq("status", "En estacionamiento");
        } else if (!oldPlate && plateClean) {
            await supabase
                .from("parking_records")
                .insert([{
                    license_plate: plateClean,
                    entry_time: entryTime,
                    status: "En estacionamiento",
                    plate_image: plateImage
                }]);
        }

        res.json({ message: "Plaza actualizada", spot_id, license_plate: plateClean });
    } catch (err) {
        res.status(400).json({ error: err.message });
    }
});

// 16. Mover o intercambiar placas (y sus fotos) entre dos plazas a voluntad
app.post("/api/move-plate", async (req, res) => {
    const { from_spot_id, to_spot_id } = req.body;
    if (!from_spot_id || !to_spot_id || from_spot_id == to_spot_id) {
        return res.status(400).json({ error: "Plazas de origen y destino invalidas" });
    }

    try {
        const { data: spots, error } = await supabase
            .from("parking_spots")
            .select("*")
            .in("id", [from_spot_id, to_spot_id]);

        if (error || !spots || spots.length < 2) {
            return res.status(400).json({ error: "No se pudieron consultar las plazas" });
        }

        const fromSpot = spots.find(s => s.id == from_spot_id);
        const toSpot = spots.find(s => s.id == to_spot_id);

        await supabase
            .from("parking_spots")
            .update({
                is_occupied: fromSpot.is_occupied,
                license_plate: fromSpot.license_plate,
                entry_time: fromSpot.entry_time || new Date().toISOString(),
                plate_image: fromSpot.plate_image || null
            })
            .eq("id", to_spot_id);

        await supabase
            .from("parking_spots")
            .update({
                is_occupied: toSpot.is_occupied,
                license_plate: toSpot.license_plate,
                entry_time: toSpot.entry_time,
                plate_image: toSpot.plate_image || null
            })
            .eq("id", from_spot_id);

        res.json({
            message: "Plazas intercambiadas con exito",
            from_spot_id,
            to_spot_id
        });
    } catch (err) {
        res.status(400).json({ error: err.message });
    }
});

// 17. Limpiar datos de coincidencias
app.post("/api/clear-matches", async (req, res) => {
    const { target, sighting_id } = req.body;

    try {
        if (target === "single_sighting" && sighting_id) {
            await supabase
                .from("vehicle_sightings")
                .delete()
                .eq("id", sighting_id);
            return res.json({ message: "Placa descartada" });
        }

        if (target === "waiting" || target === "all") {
            await supabase
                .from("vehicle_sightings")
                .delete()
                .gte("id", 0);
        }

        if (target === "events" || target === "all") {
            await supabase
                .from("spot_events")
                .delete()
                .gte("id", 0);
        }

        res.json({ message: "Datos limpiados correctamente", target });
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