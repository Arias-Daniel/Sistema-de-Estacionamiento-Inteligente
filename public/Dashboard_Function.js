// ==========================================
// PROTECCIÓN DE RUTA (SEGURIDAD)
// ==========================================
if (localStorage.getItem('auth_token') !== 'true') {
    window.location.href = '/login.html';
}

// Función para cerrar sesión
function logout() {
    localStorage.removeItem('auth_token');
    window.location.href = '/login.html';
}

let currentStartDate = null;
let currentEndDate = null;
let occupancyChartInstance; // Variable global para guardar la gráfica

const API_URL = '/api';

document.addEventListener('DOMContentLoaded', function() {
    // Carga inicial de datos
    updateDashboard();

    // Actualización periódica cada 10 segundos
    setInterval(updateDashboard, 10000);

    // Inicializar el gráfico (ahora conectado al backend)
    initializeChart();
});

// Función principal para actualizar todos los componentes del dashboard
async function updateDashboard() {
    await updateParkingSpots();
    await updateStats();
    await updateRecordsTable(currentStartDate, currentEndDate); // Mantiene los filtros activos
    await updateChartData(); // Llama a la gráfica en cada actualización
    await updateRecentActivity(); // Llama a la actividad reciente en cada actualización
}

// 1. Actualizar el mapa de estacionamiento
async function updateParkingSpots() {
    try {
        const response = await fetch(`${API_URL}/parking-status`);
        const { data } = await response.json();

        data.forEach(spot => {
            const spotElement = document.querySelector(`.parking-spot[data-spot="${spot.id}"]`);
            if (spotElement) {
                const statusText = spotElement.querySelector('small');
                
                if (spot.is_occupied) {
                    spotElement.classList.remove('available');
                    spotElement.classList.add('occupied');
                    statusText.textContent = spot.license_plate;
                } else {
                    spotElement.classList.remove('occupied');
                    spotElement.classList.add('available');
                    statusText.textContent = 'Disponible';
                }
            }
        });
    } catch (error) {
        console.error('Error al actualizar los espacios:', error);
    }
}

// 2. Actualizar las tarjetas de estadísticas
async function updateStats() {
    try {
        const response = await fetch(`${API_URL}/stats`);
        const stats = await response.json();

        document.getElementById('availableSpots').textContent = stats.available_spots;
        document.getElementById('occupiedSpots').textContent = stats.occupied_spots;
        document.getElementById('todayEntries').textContent = stats.today_entries;
        document.getElementById('todayRevenue').textContent = `$${stats.today_revenue.toLocaleString()}`;
    } catch (error) {
        console.error('Error al actualizar las estadísticas:', error);
    }
}

// 3. Actualizar la tabla de registros
async function updateRecordsTable(startDate, endDate) {
    try {
        let url = `${API_URL}/records`;
        if (startDate && endDate) {
            url += `?startDate=${startDate}&endDate=${endDate}`;
        }

        const response = await fetch(url);
        const { data } = await response.json();
        
        const tbody = document.querySelector('.table tbody');
        tbody.innerHTML = ''; 

        if (data.length === 0) {
            tbody.innerHTML = '<tr><td colspan="6" class="text-center">No se encontraron registros.</td></tr>';
            return;
        }

        data.forEach(record => {
             const entryTime = new Date(record.entry_time).toLocaleTimeString();
             const exitTime = record.exit_time ? new Date(record.exit_time).toLocaleTimeString() : '-';
             const duration = record.duration_minutes ? `${record.duration_minutes} min` : 'En curso';
             const fee = record.fee ? `$${record.fee.toLocaleString()}` : '-';
             const statusBadge = record.status === 'En estacionamiento' 
             ? '<span class="badge bg-success">En estacionamiento</span>' 
             : '<span class="badge bg-danger">Completado</span>';

             const row = `
                <tr>
                    <td>${record.license_plate}</td>
                    <td>${entryTime}</td>
                    <td>${exitTime}</td>
                    <td>${duration}</td>
                    <td>${fee}</td>
                    <td>${statusBadge}</td>
                </tr>
             `;
             tbody.innerHTML += row;
        });
    } catch (error) {
        console.error('Error al actualizar la tabla de registros:', error);
    }
}

// 4. Actualizar la Actividad Reciente
async function updateRecentActivity() {
    try {
        const response = await fetch(`${API_URL}/records`);
        const { data } = await response.json();
        
        const ul = document.querySelector('.recent-activity ul');
        if (!ul) return;

        ul.innerHTML = ''; 

        if (data.length === 0) {
            ul.innerHTML = '<li class="list-group-item text-center text-muted">Aún no hay registros.</li>';
            return;
        }

        const recentRecords = data.slice(0, 5);

        recentRecords.forEach(record => {
            let actionText = '';
            let icon = '';
            let timeDisplay = '';

            if (record.status === 'Completado' && record.exit_time) {
                actionText = 'Salió';
                icon = '<i class="fas fa-arrow-left text-danger me-2"></i>';
                timeDisplay = new Date(record.exit_time).toLocaleTimeString();
            } else {
                actionText = 'Entró';
                icon = '<i class="fas fa-arrow-right text-success me-2"></i>';
                timeDisplay = new Date(record.entry_time).toLocaleTimeString();
            }

            const li = `
                <li class="list-group-item d-flex justify-content-between align-items-center">
                    <div>
                        ${icon}
                        <strong>${record.license_plate}</strong>
                        <span class="ms-2 text-muted small">${actionText}</span>
                    </div>
                    <span class="badge bg-light text-dark">${timeDisplay}</span>
                </li>
            `;
            ul.innerHTML += li;
        });
    } catch (error) {
        console.error('Error al actualizar la actividad reciente:', error);
    }
}

// Manejar clic en espacios de estacionamiento
document.querySelectorAll('.parking-spot').forEach(spot => {
    spot.addEventListener('click', async function () {
        const spotId = this.getAttribute('data-spot');
        const response = await fetch(`${API_URL}/parking-status`);
        const { data } = await response.json();
        const spotData = data.find(s => s.id == spotId);
        
        const vehicleDetails = document.getElementById('vehicleDetails');
        if (spotData && spotData.is_occupied) {
            const entry = new Date(spotData.entry_time);
            const now = new Date();
            const durationMinutes = Math.floor((now - entry) / (1000 * 60));
            
            vehicleDetails.innerHTML = `
                <h5>Espacio ${spotData.id}</h5>
                <p class="mb-2"><strong>Estado:</strong> Ocupado</p>
                <p class="mb-2"><strong>Placa:</strong> ${spotData.license_plate}</p>
                <p class="mb-2"><strong>Hora de Entrada:</strong> ${entry.toLocaleTimeString()}</p>
                <p class="mb-0"><strong>Tiempo estacionado:</strong> ${durationMinutes} minutos</p>
            `;
        } else {
            vehicleDetails.innerHTML = `
                <h5>Espacio ${spotId}</h5>
                <p><strong>Estado:</strong> Disponible</p>
                <div class="text-center text-muted mt-3">
                    <i class="fas fa-check-circle fa-2x"></i>
                    <p>Este espacio está libre.</p>
                </div>
            `;
        }
    });
});

// Inicializar la gráfica
async function initializeChart() {
    const ctx = document.getElementById('occupancyChart').getContext('2d');
    occupancyChartInstance = new Chart(ctx, {
        type: 'line',
        data: {
            labels: [], 
            datasets: [{
                label: 'Espacios Ocupados',
                data: [], 
                borderColor: '#e74c3c',
                backgroundColor: 'rgba(231, 76, 60, 0.1)',
                tension: 0.4,
                fill: true
            }]
        },
        options: {
            responsive: true,
            scales: { y: { beginAtZero: true, max: 8 } },
            animation: { duration: 0 } 
        }
    });
    await updateChartData();
}

async function updateChartData() {
    try {
        const response = await fetch(`${API_URL}/chart-data`);
        const result = await response.json();
        if (occupancyChartInstance) {
            occupancyChartInstance.data.labels = result.labels;
            occupancyChartInstance.data.datasets[0].data = result.data;
            occupancyChartInstance.update();
        }
    } catch (error) {
        console.error('Error al actualizar gráfica:', error);
    }
}

// Filtros
const applyFilterBtn = document.getElementById('applyFilterBtn');
applyFilterBtn.addEventListener('click', () => {
    currentStartDate = document.getElementById('startDate').value;
    currentEndDate = document.getElementById('endDate').value;
    updateRecordsTable(currentStartDate, currentEndDate);
    bootstrap.Modal.getInstance(document.getElementById('filterModal')).hide();
});

// Exportar
document.getElementById('exportBtn').addEventListener('click', (e) => {
    e.preventDefault();
    let exportUrl = '/api/records/export';
    if (currentStartDate && currentEndDate) {
        exportUrl += `?startDate=${currentStartDate}&endDate=${currentEndDate}`;
    }
    window.location.href = exportUrl;
});

// ==========================================
// NAVEGACIÓN SPA Y LÓGICA DE CONFIGURACIÓN
// ==========================================

const navInicio = document.getElementById('nav-inicio');
const navHistorial = document.getElementById('nav-historial');
const navConfiguracion = document.getElementById('nav-configuracion');

const vistaInicio = document.getElementById('vista-inicio');
const vistaHistorial = document.getElementById('vista-historial');
const vistaConfiguracion = document.getElementById('vista-configuracion');

function cambiarVista(vistaActiva, navActivo) {
    vistaInicio.classList.add('d-none');
    vistaHistorial.classList.add('d-none');
    vistaConfiguracion.classList.add('d-none');
    navInicio.classList.remove('active');
    navHistorial.classList.remove('active');
    navConfiguracion.classList.remove('active');
    vistaActiva.classList.remove('d-none');
    navActivo.classList.add('active');
}

navInicio.addEventListener('click', (e) => { e.preventDefault(); cambiarVista(vistaInicio, navInicio); });
navHistorial.addEventListener('click', (e) => { e.preventDefault(); cambiarVista(vistaHistorial, navHistorial); });

// EVENTO: Al hacer clic en Configuración, cargar datos del servidor
navConfiguracion.addEventListener('click', async (e) => { 
    e.preventDefault(); 
    cambiarVista(vistaConfiguracion, navConfiguracion); 
    
    try {
        const res = await fetch(`${API_URL}/settings`);
        const settings = await res.json();
        
        document.getElementById('inputBaseFee').value = settings.baseFee;
        document.getElementById('inputExtraFee').value = settings.additionalHourFee;
        document.getElementById('inputMaxFee').value = settings.maxDailyFee;
        document.getElementById('inputParkingName').value = settings.parkingName;
    } catch (error) {
        console.error("Error cargando configuración:", error);
    }
});

// Guardar Tarifas
document.getElementById('feesForm').addEventListener('submit', async (e) => {
    e.preventDefault();
    const baseFee = parseInt(document.getElementById('inputBaseFee').value);
    const additionalHourFee = parseInt(document.getElementById('inputExtraFee').value);
    const maxDailyFee = parseInt(document.getElementById('inputMaxFee').value);

    try {
        const res = await fetch(`${API_URL}/settings`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ baseFee, additionalHourFee, maxDailyFee })
        });
        if (res.ok) alert("Tarifas actualizadas correctamente.");
    } catch (error) {
        alert("Error al guardar tarifas.");
    }
});

// Simulador de Cobro
function simularCobro() {
    const mins = parseInt(document.getElementById('simMinutes').value);
    if (!mins) return;

    const base = parseInt(document.getElementById('inputBaseFee').value);
    const extra = parseInt(document.getElementById('inputExtraFee').value);
    const max = parseInt(document.getElementById('inputMaxFee').value);

    let total = 0;
    if (mins <= 60) {
        total = base;
    } else {
        const hours = Math.ceil(mins / 60);
        total = base + (hours - 1) * extra;
    }
    total = Math.min(total, max);
    document.getElementById('simResult').textContent = `$ ${total.toLocaleString()}`;
}

// Actualizar Nombre del Establecimiento
async function actualizarConfigGral() {
    const parkingName = document.getElementById('inputParkingName').value;
    try {
        await fetch(`${API_URL}/settings`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ parkingName })
        });
        alert("Configuración general actualizada.");
    } catch (error) {
        alert("Error al actualizar.");
    }
}