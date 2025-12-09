// backend/database.js
const { createClient } = require('@supabase/supabase-js');

// Tus credenciales de Supabase
const supabaseUrl = 'https://ftezibicblxmqvpehxaq.supabase.co';
const supabaseKey = 'sb_publishable_YBXPOJmeZvT78q8W_zUSxw_YBiyGz1y';

// Inicializar el cliente
const supabase = createClient(supabaseUrl, supabaseKey);

console.log('Cliente de Supabase inicializado.');

module.exports = supabase;