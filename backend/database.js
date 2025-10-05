// backend/database.js (actualizado para PostgreSQL)
const { Pool } = require('pg');

const pool = new Pool({
  connectionString: process.env.DATABASE_URL, // Render provee esta variable automáticamente
  ssl: {
    rejectUnauthorized: false
  }
});

const initializeDatabase = async () => {
  const client = await pool.connect();
  try {
    console.log('Conectado a la base de datos PostgreSQL.');

    // Tabla para el estado actual de los espacios
    // NOTA: "SERIAL PRIMARY KEY" es el equivalente de "INTEGER PRIMARY KEY AUTOINCREMENT" en PostgreSQL
    await client.query(`
      CREATE TABLE IF NOT EXISTS parking_spots (
        id INTEGER PRIMARY KEY,
        is_occupied BOOLEAN NOT NULL DEFAULT false,
        license_plate TEXT,
        entry_time TIMESTAMPTZ
      );
    `);

    // Tabla para el historial de registros
    await client.query(`
      CREATE TABLE IF NOT EXISTS parking_records (
        id SERIAL PRIMARY KEY,
        license_plate TEXT NOT NULL,
        entry_time TIMESTAMPTZ NOT NULL,
        exit_time TIMESTAMPTZ,
        duration_minutes INTEGER,
        fee REAL,
        status TEXT NOT NULL
      );
    `);

    // Verificar si los espacios ya existen para no insertarlos de nuevo
    const res = await client.query('SELECT COUNT(*) as count FROM parking_spots');
    if (res.rows[0].count === '0') {
      console.log('Creando los 8 espacios de estacionamiento iniciales...');
      for (let i = 1; i <= 8; i++) {
        await client.query('INSERT INTO parking_spots (id, is_occupied) VALUES ($1, $2)', [i, false]);
      }
      console.log('Espacios creados con éxito.');
    }

  } catch (err) {
    console.error('Error al inicializar la base de datos:', err);
  } finally {
    client.release();
  }
};

initializeDatabase();

module.exports = {
  query: (text, params) => pool.query(text, params),
};