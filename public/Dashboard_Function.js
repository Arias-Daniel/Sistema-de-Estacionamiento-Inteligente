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
    await updateRecordsTable(currentStartDate, currentEndDate); // Mantiene los filtros activos si hay auto-refresh
    await updateChartData(); // Llama a la gráfica en cada actualización
    await updateRecentActivity(); // <--- Llama a la actividad reciente en cada actualización
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

// 3. Actualizar la tabla de registros (con filtros opcionales)
async function updateRecordsTable(startDate, endDate) {
    try {
        // Construimos la URL con los parámetros de filtro si existen
        let url = `${API_URL}/records`;
        if (startDate && endDate) {
            url += `?startDate=${startDate}&endDate=${endDate}`;
        }

        const response = await fetch(url);
        const { data } = await response.json();
        
        const tbody = document.querySelector('.table tbody');
        tbody.innerHTML = ''; // Limpiar la tabla

        if (data.length === 0) {
            tbody.innerHTML = '<tr><td colspan="6" class="text-center">No se encontraron registros para el filtro aplicado.</td></tr>';
            return;
        }

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

// 4. Actualizar la Actividad Reciente
async function updateRecentActivity() {
    try {
        // Pedimos los registros al servidor
        const response = await fetch(`${API_URL}/records`);
        const { data } = await response.json();
        
        const ul = document.querySelector('.recent-activity ul');
        if (!ul) return;

        ul.innerHTML = ''; // Limpiamos el mensaje de "Esperando..."

        if (data.length === 0) {
            ul.innerHTML = '<li class="list-group-item text-center text-muted">Aún no hay registros.</li>';
            return;
        }

        // Tomamos solo los 5 registros más recientes
        const recentRecords = data.slice(0, 5);

        recentRecords.forEach(record => {
            let actionText = '';
            let icon = '';
            let timeDisplay = '';

            // Lógica para saber si lo último que hizo fue entrar o salir
            if (record.status === 'Completado' && record.exit_time) {
                actionText = 'Salió';
                icon = '<i class="fas fa-arrow-left text-danger me-2"></i>';
                timeDisplay = new Date(record.exit_time).toLocaleTimeString();
            } else {
                actionText = 'Entró';
                icon = '<i class="fas fa-arrow-right text-success me-2"></i>';
                timeDisplay = new Date(record.entry_time).toLocaleTimeString();
            }

            // Creamos el elemento de la lista y lo inyectamos en el HTML
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

// Inicializar la gráfica (vacía al principio)
async function initializeChart() {
    const ctx = document.getElementById('occupancyChart').getContext('2d');
    
    occupancyChartInstance = new Chart(ctx, {
        type: 'line',
        data: {
            labels: [], // Se llenará con la API
            datasets: [{
                label: 'Espacios Ocupados',
                data: [], // Se llenará con la API
                borderColor: '#e74c3c',
                backgroundColor: 'rgba(231, 76, 60, 0.1)',
                tension: 0.4,
                fill: true
            }]
        },
        options: {
            responsive: true,
            scales: { y: { beginAtZero: true, max: 8 } },
            animation: { duration: 0 } // Desactiva la animación para que no salte al actualizarse sola
        }
    });

    await updateChartData(); // Traer los datos la primera vez
}

// Función para pedir los datos al servidor y redibujar
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

// Manejo del modal de filtro
const applyFilterBtn = document.getElementById('applyFilterBtn');
const filterModal = bootstrap.Modal.getInstance(document.getElementById('filterModal')) || new bootstrap.Modal(document.getElementById('filterModal'));

applyFilterBtn.addEventListener('click', () => {
    const startDate = document.getElementById('startDate').value;
    const endDate = document.getElementById('endDate').value;

    // Guardamos los valores actuales del filtro
    currentStartDate = startDate;
    currentEndDate = endDate;

    updateRecordsTable(startDate, endDate);
    filterModal.hide();
});

// Manejo del clic en el botón de exportar
const exportBtn = document.getElementById('exportBtn');
exportBtn.addEventListener('click', (e) => {
    e.preventDefault(); // Evita que el enlace navegue a "#"

    let exportUrl = '/api/records/export';

    // Si hay filtros aplicados, los añadimos a la URL
    if (currentStartDate && currentEndDate) {
        exportUrl += `?startDate=${currentStartDate}&endDate=${currentEndDate}`;
    }

    // Redirigimos al usuario a la URL de exportación, lo que iniciará la descarga
    window.location.href = exportUrl;
});