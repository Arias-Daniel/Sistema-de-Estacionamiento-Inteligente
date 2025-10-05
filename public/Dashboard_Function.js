// backend/Dashboard_Function.js (corregido)

const API_URL = '/api';

document.addEventListener('DOMContentLoaded', function() {
    // Carga inicial de datos
    updateDashboard();

    // Actualización periódica cada 10 segundos
    setInterval(updateDashboard, 10000);

    // Inicializar el gráfico (se actualizará con datos reales)
    initializeChart();
});

// Función principal para actualizar todos los componentes del dashboard
async function updateDashboard() {
    await updateParkingSpots();
    await updateStats();
    await updateRecordsTable();
    // Aquí podrías agregar llamadas para actualizar la actividad reciente y el gráfico
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
        document.getElementById('todayRevenue').textContent = `$${stats.today_revenue.toFixed(2)}`;
    } catch (error) {
        console.error('Error al actualizar las estadísticas:', error);
    }
}

// 3. Actualizar la tabla de registros
async function updateRecordsTable() {
    try {
        const response = await fetch(`${API_URL}/records`);
        const { data } = await response.json();
        
        const tbody = document.querySelector('.table tbody');
        tbody.innerHTML = ''; // Limpiar la tabla

        data.forEach(record => {
            const entryTime = new Date(record.entry_time).toLocaleTimeString();
            const exitTime = record.exit_time ? new Date(record.exit_time).toLocaleTimeString() : '-';
            const duration = record.duration_minutes ? `${record.duration_minutes} min` : 'En curso';
            const fee = record.fee ? `$${record.fee.toFixed(2)}` : '-';
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

// Gráfico (aún con datos de ejemplo, se puede conectar a un nuevo endpoint)
function initializeChart() {
    const ctx = document.getElementById('occupancyChart').getContext('2d');
    new Chart(ctx, {
        type: 'line',
        data: {
            labels: ['8:00', '9:00', '10:00', '11:00', '12:00', '13:00', '14:00'],
            datasets: [{
                label: 'Espacios Ocupados',
                data: [2, 4, 3, 5, 6, 7, 8], // TODO: Cargar estos datos desde un endpoint
                borderColor: '#e74c3c',
                backgroundColor: 'rgba(231, 76, 60, 0.1)',
                tension: 0.4,
                fill: true
            }]
        },
        options: {
            responsive: true,
            scales: { y: { beginAtZero: true, max: 8 } }
        }
    });
}