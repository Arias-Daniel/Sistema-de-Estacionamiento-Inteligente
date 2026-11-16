// ==========================================
// PROTECCION DE RUTA (SEGURIDAD)
// ==========================================
if (localStorage.getItem('auth_token') !== 'true') {
    window.location.href = '/login.html';
}

function logout() {
    localStorage.removeItem('auth_token');
    window.location.href = '/login.html';
}

let currentStartDate = null;
let currentEndDate = null;
let occupancyChartInstance;

const API_URL = '/api';

document.addEventListener('DOMContentLoaded', function() {
    updateDashboard();
    setInterval(updateDashboard, 10000);
    initializeChart();
});

async function updateDashboard() {
    await updateParkingSpots();
    await updateStats();
    await updateRecordsTable(currentStartDate, currentEndDate);
    await updateChartData();
    await updateRecentActivity();
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
                    statusText.textContent = spot.license_plate || 'Ocupado';
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

// 2. Actualizar las tarjetas de estadisticas
async function updateStats() {
    try {
        const response = await fetch(`${API_URL}/stats`);
        const stats = await response.json();

        document.getElementById('availableSpots').textContent = stats.available_spots;
        document.getElementById('occupiedSpots').textContent = stats.occupied_spots;
        document.getElementById('todayEntries').textContent = stats.today_entries;
        document.getElementById('todayRevenue').textContent = `$${stats.today_revenue.toLocaleString()}`;
    } catch (error) {
        console.error('Error al actualizar las estadisticas:', error);
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
        
        const tbody = document.querySelector('#vista-historial .table tbody');
        if (!tbody) return;
        tbody.innerHTML = ''; 

        if (!data || data.length === 0) {
            tbody.innerHTML = '<tr><td colspan="6" class="text-center">No se encontraron registros.</td></tr>';
            return;
        }

        data.forEach(record => {
            const entryTime = new Date(record.entry_time).toLocaleTimeString('es-CO');
            const exitTime = record.exit_time ? new Date(record.exit_time).toLocaleTimeString('es-CO') : '-';
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

        if (!data || data.length === 0) {
            ul.innerHTML = '<li class="list-group-item text-center text-muted">Aun no hay registros.</li>';
            return;
        }

        const recentRecords = data.slice(0, 5);

        recentRecords.forEach(record => {
            let actionText = '';
            let icon = '';
            let timeDisplay = '';

            if (record.status === 'Completado' && record.exit_time) {
                actionText = 'Salio';
                icon = '<i class="fas fa-arrow-left text-danger me-2"></i>';
                timeDisplay = new Date(record.exit_time).toLocaleTimeString('es-CO');
            } else {
                actionText = 'Entro';
                icon = '<i class="fas fa-arrow-right text-success me-2"></i>';
                timeDisplay = new Date(record.entry_time).toLocaleTimeString('es-CO');
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
            const durationMinutes = Math.max(0, Math.floor((now - entry) / (1000 * 60)));
            
            vehicleDetails.innerHTML = `
                <h5>Espacio ${spotData.id}</h5>
                <p class="mb-2"><strong>Estado:</strong> Ocupado</p>
                <p class="mb-2"><strong>Placa:</strong> ${spotData.license_plate || 'Sin placa'}</p>
                <p class="mb-2"><strong>Hora de Entrada:</strong> ${entry.toLocaleTimeString('es-CO')}</p>
                <p class="mb-0"><strong>Tiempo estacionado:</strong> ${durationMinutes} minutos</p>
            `;
        } else {
            vehicleDetails.innerHTML = `
                <h5>Espacio ${spotId}</h5>
                <p><strong>Estado:</strong> Disponible</p>
                <div class="text-center text-muted mt-3">
                    <i class="fas fa-check-circle fa-2x"></i>
                    <p>Este espacio esta libre.</p>
                </div>
            `;
        }
    });
});

// Inicializar la grafica
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
        console.error('Error al actualizar grafica:', error);
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
// NAVEGACION SPA Y LOGICA DE CONFIGURACION
// ==========================================

const navInicio          = document.getElementById('nav-inicio');
const navHistorial       = document.getElementById('nav-historial');
const navCoincidencias   = document.getElementById('nav-coincidencias');
const navConfiguracion   = document.getElementById('nav-configuracion');

const vistaInicio        = document.getElementById('vista-inicio');
const vistaHistorial     = document.getElementById('vista-historial');
const vistaCoincidencias = document.getElementById('vista-coincidencias');
const vistaConfiguracion = document.getElementById('vista-configuracion');

function cambiarVista(vistaActiva, navActivo) {
    [vistaInicio, vistaHistorial, vistaCoincidencias, vistaConfiguracion]
        .forEach(v => v.classList.add('d-none'));
    [navInicio, navHistorial, navCoincidencias, navConfiguracion]
        .forEach(n => n.classList.remove('active'));

    vistaActiva.classList.remove('d-none');
    navActivo.classList.add('active');
}

navInicio.addEventListener('click', (e) => {
    e.preventDefault();
    cambiarVista(vistaInicio, navInicio);
    updateDashboard();
});

navHistorial.addEventListener('click', (e) => {
    e.preventDefault();
    cambiarVista(vistaHistorial, navHistorial);
    updateRecordsTable(currentStartDate, currentEndDate);
});

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
        console.error("Error cargando configuracion:", error);
    }
});

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

async function actualizarConfigGral() {
    const parkingName = document.getElementById('inputParkingName').value;
    try {
        await fetch(`${API_URL}/settings`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ parkingName })
        });
        alert("Configuracion general actualizada.");
    } catch (error) {
        alert("Error al actualizar.");
    }
}

// ==========================================
// VISTA COINCIDENCIAS (AUTOMATICA Y MANUAL)
// ==========================================

navCoincidencias.addEventListener('click', async (e) => {
    e.preventDefault();
    cambiarVista(vistaCoincidencias, navCoincidencias);
    await cargarCoincidencias();
});

// Recargar cada 5 segundos solo si la vista esta activa y el admin no esta editando un campo
setInterval(async () => {
    const activeEl = document.activeElement;
    const isEditing = activeEl && (activeEl.tagName === 'INPUT' || activeEl.tagName === 'SELECT');
    if (!vistaCoincidencias.classList.contains('d-none') && !isEditing) {
        await cargarCoincidencias();
    }
}, 5000);

async function cargarCoincidencias() {
    try {
        const [resMatches, resSpots] = await Promise.all([
            fetch(`${API_URL}/matches`),
            fetch(`${API_URL}/parking-status`)
        ]);
        const dataMatches = await resMatches.json();
        const dataSpots   = await resSpots.json();

        // 1. Tabla izquierda: Placas en espera de plaza
        const tbEspera = document.getElementById('tabla-espera');
        const espera   = dataMatches.unmatched_plates || [];
        document.getElementById('badge-espera').textContent = espera.length;

        if (espera.length === 0) {
            tbEspera.innerHTML = '<tr><td colspan="3" class="text-center text-muted p-3">Sin placas en espera</td></tr>';
        } else {
            tbEspera.innerHTML = espera.map(p => {
                const hace   = tiempoTranscurrido(p.seen_at);
                const alerta = minutosDesde(p.seen_at) > 5 ? 'table-warning' : '';
                const hora   = new Date(p.seen_at).toLocaleTimeString('es-CO', { hour: '2-digit', minute: '2-digit', second: '2-digit' });
                return `<tr class="${alerta}">
                    <td class="ps-3"><strong>${p.license_plate}</strong></td>
                    <td>
                        <div class="small">${hora}</div>
                        <span class="badge bg-secondary">${hace}</span>
                    </td>
                    <td class="pe-3 text-end">
                        <div class="d-inline-flex gap-1 align-items-center">
                            <select class="form-select form-select-sm py-0" id="sel-sighting-${p.id}" style="width: 92px; height: 28px;">
                                <option value="1">Plaza 1</option>
                                <option value="2">Plaza 2</option>
                                <option value="3">Plaza 3</option>
                                <option value="4">Plaza 4</option>
                                <option value="5">Plaza 5</option>
                                <option value="6">Plaza 6</option>
                            </select>
                            <button class="btn btn-sm btn-success py-0 px-2" style="height: 28px;" title="Asignar a esta plaza" onclick="confirmarPlacaEspera(${p.id}, '${p.license_plate}')">
                                <i class="fas fa-check"></i>
                            </button>
                            <button class="btn btn-sm btn-outline-danger py-0 px-2" style="height: 28px;" title="Descartar placa" onclick="descartarPlacaEspera(${p.id})">
                                <i class="fas fa-times"></i>
                            </button>
                        </div>
                    </td>
                </tr>`;
            }).join('');
        }

        // 2. Tabla derecha: Mostrar unicamente las 6 plazas fijas (Plazas 1 a 6)
        const tbPlazas = document.getElementById('tabla-plazas');
        const plazas6  = (dataSpots.data || []).filter(s => s.id >= 1 && s.id <= 6);
        const ocupadasCount = plazas6.filter(s => s.is_occupied).length;
        document.getElementById('badge-plazas').textContent = `${ocupadasCount} / 6 ocupadas`;

        tbPlazas.innerHTML = plazas6.map(spot => {
            const horaEntrada = spot.entry_time
                ? new Date(spot.entry_time).toLocaleTimeString('es-CO', { hour: '2-digit', minute: '2-digit' })
                : '';

            const badgeEstado = spot.is_occupied
                ? `<span class="badge bg-danger">Ocupada</span><div class="text-muted" style="font-size: 0.72rem;">${horaEntrada}</div>`
                : `<span class="badge bg-success">Libre</span>`;

            let badgePlaca = '<span class="text-muted small">-</span>';
            if (spot.is_occupied && spot.license_plate) {
                badgePlaca = `<span class="badge bg-primary fs-6">${spot.license_plate}</span>`;
            } else if (spot.is_occupied && !spot.license_plate) {
                badgePlaca = `<span class="badge bg-warning text-dark">Sin placa</span>`;
            }

            const opcionesDestino = [1, 2, 3, 4, 5, 6]
                .filter(num => num !== spot.id)
                .map(num => `<option value="${num}">Plaza ${num}</option>`)
                .join('');

            return `<tr>
                <td class="ps-3"><strong>Plaza ${spot.id}</strong></td>
                <td>${badgeEstado}</td>
                <td>${badgePlaca}</td>
                <td>
                    <div class="d-flex gap-1 align-items-center">
                        <input type="text" class="form-control form-control-sm text-uppercase py-0" id="input-plate-spot-${spot.id}" value="${spot.license_plate || ''}" placeholder="ABC123" maxlength="6" style="width: 82px; height: 28px;">
                        <button class="btn btn-sm btn-outline-primary py-0 px-2" style="height: 28px;" title="Guardar placa en Plaza ${spot.id}" onclick="guardarPlacaEnPlaza(${spot.id})">
                            <i class="fas fa-save"></i>
                        </button>
                        ${spot.is_occupied ? `
                        <button class="btn btn-sm btn-outline-danger py-0 px-2" style="height: 28px;" title="Liberar Plaza ${spot.id}" onclick="liberarPlazaManual(${spot.id})">
                            <i class="fas fa-sign-out-alt"></i>
                        </button>` : ''}
                    </div>
                </td>
                <td class="pe-3">
                    <div class="d-flex gap-1 align-items-center">
                        <select class="form-select form-select-sm py-0" id="sel-move-from-${spot.id}" style="width: 92px; height: 28px;">
                            ${opcionesDestino}
                        </select>
                        <button class="btn btn-sm btn-outline-secondary py-0 px-2" style="height: 28px;" title="Mover o intercambiar con la plaza seleccionada" onclick="moverPlacaEntrePlazas(${spot.id})">
                            <i class="fas fa-exchange-alt"></i>
                        </button>
                    </div>
                </td>
            </tr>`;
        }).join('');

        // 3. Desplegable inferior: Historial discreto de eventos por plaza
        const tbHistorialEventos = document.getElementById('tabla-historial-eventos');
        const eventos = (dataMatches.spot_events || []).filter(ev => ev.spot_id >= 1 && ev.spot_id <= 6);
        document.getElementById('badge-historial-eventos').textContent = eventos.length;

        if (eventos.length === 0) {
            tbHistorialEventos.innerHTML = '<tr><td colspan="3" class="text-center text-muted p-3">Sin eventos historicos registrados</td></tr>';
        } else {
            tbHistorialEventos.innerHTML = eventos.map(ev => {
                const badgeEv = ev.license_plate
                    ? `<span class="badge bg-success">${ev.license_plate}</span>`
                    : `<span class="badge bg-secondary">Sin asignar</span>`;
                return `<tr>
                    <td class="ps-3"><strong>Plaza ${ev.spot_id}</strong></td>
                    <td>${new Date(ev.occupied_at).toLocaleTimeString('es-CO')}</td>
                    <td>${badgeEv}</td>
                </tr>`;
            }).join('');
        }
    } catch (err) {
        console.error('Error cargando coincidencias:', err);
    }
}

// Asignar placa desde la barra manual superior
async function asignarPlacaManual() {
    const plateInput = document.getElementById('manualPlateInput');
    const spotSelect = document.getElementById('manualSpotSelect');
    const license_plate = plateInput.value.trim().toUpperCase();
    const spot_id = parseInt(spotSelect.value);

    if (!license_plate) {
        alert("Escribe una placa valida (ej. ABC123).");
        return;
    }

    try {
        const res = await fetch(`${API_URL}/confirm-match`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ spot_id, license_plate })
        });
        if (res.ok) {
            plateInput.value = '';
            await cargarCoincidencias();
            await updateDashboard();
        }
    } catch (err) {
        console.error('Error asignando placa manual:', err);
    }
}

// Confirmar una placa desde la tabla de espera hacia una de las 6 plazas
async function confirmarPlacaEspera(sighting_id, license_plate) {
    const sel = document.getElementById(`sel-sighting-${sighting_id}`);
    const spot_id = sel ? parseInt(sel.value) : 1;

    try {
        const res = await fetch(`${API_URL}/confirm-match`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ spot_id, license_plate, sighting_id })
        });
        if (res.ok) {
            await cargarCoincidencias();
            await updateDashboard();
        }
    } catch (err) {
        console.error('Error confirmando placa en espera:', err);
    }
}

// Descartar una placa individual de la lista de espera
async function descartarPlacaEspera(sighting_id) {
    try {
        await fetch(`${API_URL}/clear-matches`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ target: 'single_sighting', sighting_id })
        });
        await cargarCoincidencias();
    } catch (err) {
        console.error('Error descartando placa:', err);
    }
}

// Guardar o corregir directamente la placa de una de las 6 plazas
async function guardarPlacaEnPlaza(spot_id) {
    const input = document.getElementById(`input-plate-spot-${spot_id}`);
    const license_plate = input ? input.value.trim().toUpperCase() : '';

    try {
        const res = await fetch(`${API_URL}/update-spot-plate`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ spot_id, license_plate })
        });
        if (res.ok) {
            await cargarCoincidencias();
            await updateDashboard();
        }
    } catch (err) {
        console.error('Error actualizando placa en plaza:', err);
    }
}

// Liberar una plaza manualmente desde el panel de las 6 plazas
async function liberarPlazaManual(spot_id) {
    try {
        const res = await fetch(`${API_URL}/exit`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ spot_id })
        });
        if (res.ok) {
            await cargarCoincidencias();
            await updateDashboard();
        }
    } catch (err) {
        console.error('Error liberando plaza:', err);
    }
}

// Mover o intercambiar placa entre dos plazas
async function moverPlacaEntrePlazas(from_spot_id) {
    const select = document.getElementById(`sel-move-from-${from_spot_id}`);
    const to_spot_id = select ? parseInt(select.value) : null;
    if (!to_spot_id) return;

    try {
        const res = await fetch(`${API_URL}/move-plate`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ from_spot_id, to_spot_id })
        });
        if (res.ok) {
            await cargarCoincidencias();
            await updateDashboard();
        }
    } catch (err) {
        console.error('Error moviendo placa entre plazas:', err);
    }
}

// Limpiar placas en espera, historial de eventos o todo
async function limpiarDatosCoincidencias(target) {
    try {
        const res = await fetch(`${API_URL}/clear-matches`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ target })
        });
        if (res.ok) {
            await cargarCoincidencias();
        }
    } catch (err) {
        console.error('Error limpiando datos:', err);
    }
}

function tiempoTranscurrido(isoString) {
    const secs = Math.max(0, Math.floor((Date.now() - new Date(isoString)) / 1000));
    if (secs < 60)   return `${secs}s`;
    if (secs < 3600) return `${Math.floor(secs / 60)}min`;
    return `${Math.floor(secs / 3600)}h`;
}

function minutosDesde(isoString) {
    return (Date.now() - new Date(isoString)) / 60000;
}