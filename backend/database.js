// backend/database.js
const sqlite3 = require('sqlite3').verbose();
const DB_SOURCE = "parking.sqlite";

const db = new sqlite3.Database(DB_SOURCE, (err) => {
    if (err) {
      console.error(err.message);
      throw err;
    } else {
        console.log('Conectado a la base de datos SQLite.');
        // Crear tablas si no existen
        db.serialize(() => {
            // Tabla para el estado actual de los espacios
            db.run(`CREATE TABLE IF NOT EXISTS parking_spots (
                id INTEGER PRIMARY KEY,
                is_occupied BOOLEAN NOT NULL DEFAULT 0,
                license_plate TEXT,
                entry_time DATETIME
            )`, (err) => {
                if (err) {
                    console.error("Error creando tabla parking_spots: ", err.message);
                } else {
                    // Insertar los 8 espacios iniciales si la tabla está vacía
                    db.get("SELECT COUNT(*) as count FROM parking_spots", (err, row) => {
                        if (row.count === 0) {
                            const stmt = db.prepare("INSERT INTO parking_spots (id) VALUES (?)");
                            for (let i = 1; i <= 8; i++) {
                                stmt.run(i);
                            }
                            stmt.finalize();
                            console.log('Se crearon los 8 espacios de estacionamiento.');
                        }
                    });
                }
            });

            // Tabla para el historial de registros
            db.run(`CREATE TABLE IF NOT EXISTS parking_records (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                license_plate TEXT NOT NULL,
                entry_time DATETIME NOT NULL,
                exit_time DATETIME,
                duration_minutes INTEGER,
                fee REAL,
                status TEXT NOT NULL
            )`);
        });
    }
});

module.exports = db;