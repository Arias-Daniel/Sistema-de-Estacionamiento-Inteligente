// backend/database.js
const { createClient } = require('@supabase/supabase-js');

// Tus nuevas credenciales de Supabase
const supabaseUrl = 'https://sdtwgkzfzquyyhvbkwqg.supabase.co';
const supabaseKey = 'sb_publishable_S5jNDfWbrePejTCBZaU6DQ_1658J55F';

// Inicializar el cliente
const supabase = createClient(supabaseUrl, supabaseKey);

console.log('Cliente de Supabase inicializado.');

module.exports = supabase;