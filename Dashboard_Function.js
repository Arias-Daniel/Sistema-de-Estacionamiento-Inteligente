// Inicializar gráfico de ocupación
const ctx = document.getElementById('occupancyChart').getContext('2d');
const occupancyChart = new Chart(ctx, {
    type: 'line',
    data: {
        labels: ['8:00', '9:00', '10:00', '11:00', '12:00', '13:00', '14:00'],
        datasets: [{
            label: 'Espacios Ocupados',
            data: [2, 4, 3, 5, 6, 7, 8],
            borderColor: '#e74c3c',
            backgroundColor: 'rgba(231, 76, 60, 0.1)',
            tension: 0.4,
            fill: true
        }]
    },
    options: {
        responsive: true,
        plugins: {
            legend: {
                position: 'top',
            },
            title: {
                display: true,
                text: 'Ocupación por Hora'
            }
        },
        scales: {
            y: {
                beginAtZero: true,
                max: 8,
                title: {
                    display: true,
                    text: 'Espacios Ocupados'
                }
            },
            x: {
                title: {
                    display: true,
                    text: 'Hora del Día'
                }
            }
        }
    }
});

// Simular cambios en tiempo real
function updateParkingStatus() {
    // Simular cambio aleatorio de estado cada 10 segundos
    setTimeout(() => {
        const spots = document.querySelectorAll('.parking-spot');
        const randomSpot = Math.floor(Math.random() * spots.length);

        if (spots[randomSpot].classList.contains('available')) {
            spots[randomSpot].classList.remove('available');
            spots[randomSpot].classList.add('occupied');
            spots[randomSpot].querySelector('small').textContent = 'PLACA-' + (100 + Math.floor(Math.random() * 900));
        } else {
            spots[randomSpot].classList.remove('occupied');
            spots[randomSpot].classList.add('available');
            spots[randomSpot].querySelector('small').textContent = 'Disponible';
        }

        // Actualizar contadores
        const availableCount = document.querySelectorAll('.available').length;
        const occupiedCount = document.querySelectorAll('.occupied').length;

        document.getElementById('availableSpots').textContent = availableCount;
        document.getElementById('occupiedSpots').textContent = occupiedCount;

        // Llamar recursivamente para continuar la simulación
        updateParkingStatus();
    }, 10000); // Cambiar cada 10 segundos
}

// Iniciar simulación
updateParkingStatus();

// Manejar clic en espacios de estacionamiento
document.querySelectorAll('.parking-spot').forEach(spot => {
    spot.addEventListener('click', function () {
        const spotNumber = this.getAttribute('data-spot');
        const isOccupied = this.classList.contains('occupied');
        const licensePlate = isOccupied ? this.querySelector('small').textContent : 'N/A';

        document.getElementById('vehicleDetails').innerHTML = `
                    <h5>Espacio ${spotNumber}</h5>
                    <p class="mb-2"><strong>Estado:</strong> ${isOccupied ? 'Ocupado' : 'Disponible'}</p>
                    ${isOccupied ? `<p class="mb-2"><strong>Placa:</strong> ${licensePlate}</p>` : ''}
                    <p class="mb-2"><strong>Tiempo estacionado:</strong> ${isOccupied ? '45 minutos' : 'N/A'}</p>
                    ${isOccupied ? `<p class="mb-0"><strong>Tarifa acumulada:</strong> $1.50</p>` : ''}
                `;
    });
});