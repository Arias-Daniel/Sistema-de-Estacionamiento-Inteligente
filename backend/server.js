// backend/server.js
const express = require("express");
const cors = require("cors");
const supabase = require("./database.js"); // Importamos el cliente de Supabase
const path = require('path');
const ExcelJS = require('exceljs'); 

const app = express();
app.use(cors());
app.use(express.json());
// Servir archivos estáticos del frontend
app.use(express.static(path.join(__dirname, '..', 'public')));

// --- LÓGICA DE TARIFAS ---
function calculateFee(entryTime, exitTime) {
    const entry = new Date(entryTime);
    const exit = new Date(exitTime);
    const durationMinutes = Math.ceil((exit - entry) / (1000 * 60));

    if (durationMinutes <= 60) {
        return { fee: 2000, duration: durationMinutes };
    }

    const hours = Math.ceil(durationMinutes / 60);
    let fee = 2000; // Tarifa primera hora
    fee += (hours - 1) * 1500; // Tarifa horas adicionales

    const maxFee = 15000;
    return { fee: Math.min(fee, maxFee), duration: durationMinutes };
}

// --- ENDPOINTS DE LA API (Adaptados a Supabase) ---

// 1. Obtener el estado de todos los espacios
app.get("/api/parking-status", async (req, res) => {
    try {
        const { data, error } = await supabase
            .from('parking_spots')
            .select('*')
            .order('id', { ascending: true });

        if (error) throw error;
        res.json({ data });
    } catch (err) {
        res.status(400).json({ "error": err.message });
    }
});

// 2. Obtener los registros (historial) con filtros
app.get("/api/records", async (req, res) => {
    try {
        const { startDate, endDate } = req.query;
        
        let query = supabase
            .from('parking_records')
            .select('*')
            .order('entry_time', { ascending: false });

        if (startDate && endDate) {
            // Ajustar endDate para incluir todo el día
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
        res.status(400).json({ "error": err.message });
    }
});

// 3. Registrar una ENTRADA de vehículo
app.post("/api/entry", async (req, res) => {
    const { spot_id, license_plate } = req.body;
    const entry_time = new Date().toISOString();

    try {
        // 1. Actualizar el espacio
        const { error: updateError } = await supabase
            .from('parking_spots')
            .update({ 
                is_occupied: true, 
                license_plate: license_plate, 
                entry_time: entry_time 
            })
            .eq('id', spot_id);

        if (updateError) throw updateError;

        // 2. Insertar en el historial
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
        console.error(err);
        res.status(400).json({ "error": err.message });
    }
});

// 4. Registrar una SALIDA de vehículo
app.post("/api/exit", async (req, res) => {
    const { spot_id } = req.body;
    const exit_time = new Date().toISOString();

    try {
        // 1. Obtener datos del vehículo actual
        const { data: spots, error: fetchError } = await supabase
            .from('parking_spots')
            .select('license_plate, entry_time')
            .eq('id', spot_id)
            .single();

        if (fetchError || !spots || !spots.entry_time) {
            return res.status(400).json({ "error": "No se pudo encontrar el vehículo en ese espacio." });
        }

        const { fee, duration } = calculateFee(spots.entry_time, exit_time);

        // 2. Liberar el espacio
        const { error: updateSpotError } = await supabase
            .from('parking_spots')
            .update({ 
                is_occupied: false, 
                license_plate: null, 
                entry_time: null 
            })
            .eq('id', spot_id);

        if (updateSpotError) throw updateSpotError;

        // 3. Actualizar el registro en el historial
        // Nota: Buscamos por placa y status 'En estacionamiento'
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
        res.status(400).json({ "error": err.message });
    }
});

// 5. Endpoint para las estadísticas rápidas
app.get("/api/stats", async (req, res) => {
    try {
        // Conteo de ocupados
        const { count: occupiedCount, error: errOcc } = await supabase
            .from('parking_spots')
            .select('*', { count: 'exact', head: true })
            .eq('is_occupied', true);

        // Entradas de hoy
        const today = new Date().toISOString().split('T')[0];
        const { count: todayEntries, error: errEnt } = await supabase
            .from('parking_records')
            .select('*', { count: 'exact', head: true })
            .gte('entry_time', today);

        // Ingresos de hoy (Supabase JS no tiene SUM directo fácil sin RPC, lo calculamos aquí)
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
        res.status(400).json({ "error": err.message });
    }
});

// 6. Endpoint para datos de la Gráfica (Ocupación por hora de hoy)
app.get("/api/chart-data", async (req, res) => {
    try {
        const today = new Date().toISOString().split('T')[0];
        
        // Traer todos los registros del día de hoy
        const { data: records, error } = await supabase
            .from('parking_records')
            .select('entry_time, exit_time')
            .gte('entry_time', today);

        if (error) throw error;

        // Horas que mostraremos en el eje X de la gráfica (8 AM a 6 PM)
        const hours = [8, 9, 10, 11, 12, 13, 14, 15, 16, 17, 18];
        const labels = hours.map(h => `${h}:00`);
        
        const data = hours.map(hour => {
            let occupiedAtHour = 0;
            
            records.forEach(record => {
                // Ajustar a zona horaria de Colombia para evitar desfases en el servidor (Render)
                const entryStr = new Date(record.entry_time).toLocaleString("en-US", {timeZone: "America/Bogota"});
                const entryHour = new Date(entryStr).getHours();
                
                let exitHour = 24; // Si no ha salido, se asume que sigue hasta el final del día
                if (record.exit_time) {
                    const exitStr = new Date(record.exit_time).toLocaleString("en-US", {timeZone: "America/Bogota"});
                    exitHour = new Date(exitStr).getHours();
                }

                // Si el vehículo entró antes o durante esa hora, y salió después de esa hora
                if (entryHour <= hour && exitHour > hour) {
                    occupiedAtHour++;
                }
            });
            return occupiedAtHour;
        });

        res.json({ labels, data });
    } catch (err) {
        res.status(400).json({ "error": err.message });
    }
});

// 7. EXPORTAR registros a EXCEL (con filtros)
app.get("/api/records/export", async (req, res) => {
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

        const { data: records, error } = await query;
        if (error) throw error;

        // --- Lógica para crear el archivo Excel ---
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
            cell.fill = {
                type: 'pattern',
                pattern: 'solid',
                fgColor: { argb: 'FFE0E0E0' }
            };
        });

        const formattedRecords = records.map(r => ({
            ...r,
            entry_time: new Date(r.entry_time).toLocaleString('es-CO', { timeZone: 'America/Bogota' }),
            exit_time: r.exit_time ? new Date(r.exit_time).toLocaleString('es-CO', { timeZone: 'America/Bogota' }) : 'N/A'
        }));

        worksheet.addRows(formattedRecords);

        res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
        res.setHeader('Content-Disposition', `attachment; filename=registros-estacionamiento-${new Date().toISOString().slice(0,10)}.xlsx`);

        await workbook.xlsx.write(res);
        res.end();

    } catch (err) {
        console.error("Error al generar el archivo Excel:", err);
        res.status(500).send("Error al generar el archivo Excel");
    }
});

app.use(function (req, res) {
    res.status(404).send("Ruta no encontrada");
});

const PORT = process.env.PORT || 8000;
app.listen(PORT, () => {
    console.log(`Servidor corriendo en el puerto ${PORT}`);
});