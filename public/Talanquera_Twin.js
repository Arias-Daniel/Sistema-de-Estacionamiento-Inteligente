// ============================================================================
// GEMELO DIGITAL EN VIVO - TALANQUERA VEHICULAR (PID + solve_ivp Radau)
// Conecta el panel administrativo con simulador_talanquera_api.py (20 Hz)
// ============================================================================
(function () {
    const STORAGE_KEY = 'talanquera_api_url';
    const DEFAULT_URL = 'http://localhost:8001';
    const MAX_PUNTOS = 200; // Ventana de 10 segundos a 20 Hz

    let ws = null;
    let inicializado = false;
    let reconectarTimer = null;

    const histTheta = new Array(MAX_PUNTOS).fill(0);
    const histRef = new Array(MAX_PUNTOS).fill(0);
    const histAmp = new Array(MAX_PUNTOS).fill(0);

    function getInputUrl() {
        const input = document.getElementById('tw-api-url');
        if (!input) return DEFAULT_URL;
        const val = input.value.trim().replace(/\/+$/, '');
        return val || DEFAULT_URL;
    }

    function getWsUrl(httpUrl) {
        if (httpUrl.startsWith('https://')) {
            return httpUrl.replace('https://', 'wss://') + '/ws/talanquera';
        }
        return httpUrl.replace('http://', 'ws://') + '/ws/talanquera';
    }

    function mostrarAviso(mensaje) {
        const box = document.getElementById('tw-alert-box');
        if (!box) return;
        if (!mensaje) {
            box.classList.add('d-none');
            box.textContent = '';
            return;
        }
        box.textContent = mensaje;
        box.classList.remove('d-none');
    }

    function setEstadoConexion(conectado) {
        const badge = document.getElementById('tw-conn-badge');
        if (!badge) return;
        if (conectado) {
            badge.className = 'badge bg-success px-3 py-2';
            badge.innerHTML = '<i class="fas fa-circle me-1"></i> Conectado (20 Hz)';
            mostrarAviso('');
        } else {
            badge.className = 'badge bg-danger px-3 py-2';
            badge.innerHTML = '<i class="fas fa-plug me-1"></i> Simulador desconectado';
        }
    }

    function conectar() {
        if (reconectarTimer) {
            clearTimeout(reconectarTimer);
            reconectarTimer = null;
        }

        const baseHttp = getInputUrl();
        localStorage.setItem(STORAGE_KEY, baseHttp);

        if (ws) {
            try {
                ws.onclose = null;
                ws.close();
            } catch (e) {
                // Ignorar error de cierre previo
            }
        }

        try {
            ws = new WebSocket(getWsUrl(baseHttp));
        } catch (err) {
            setEstadoConexion(false);
            mostrarAviso('URL invalida para el simulador. Ejemplo: http://localhost:8001');
            return;
        }

        ws.onopen = () => {
            setEstadoConexion(true);
        };

        ws.onerror = () => {
            setEstadoConexion(false);
        };

        ws.onclose = () => {
            setEstadoConexion(false);
            reconectarTimer = setTimeout(() => {
                const vista = document.getElementById('vista-talanquera');
                if (vista && !vista.classList.contains('d-none')) {
                    conectar();
                }
            }, 3000);
        };

        ws.onmessage = (ev) => {
            try {
                const datos = JSON.parse(ev.data);
                actualizarTelemetria(datos);
            } catch (e) {
                console.error('Error parseando telemetria de talanquera:', e);
            }
        };
    }

    function actualizarTelemetria(d) {
        const ang = Number(d.theta_deg || 0);
        const ref = Number(d.theta_ref_deg || 0);
        const omega = Number(d.w_rad_s || 0);
        const rpmMotor = Number(d.n_motor_rpm || 0);
        const va = Number(d.va_volt || 0);
        const ia = Number(d.ia_amp || 0);
        const torque = Number(d.torque_salida_nm || 0);
        const viento = Number(d.viento_nm || 0);
        const estado = d.estado || 'CLOSED';
        const placa = d.placa || 'NINGUNA';

        // 1. Escena SVG
        const armGroup = document.getElementById('tw-arm-group');
        if (armGroup) {
            armGroup.setAttribute('transform', `rotate(${-ang} 145 180)`);
        }

        const led = document.getElementById('tw-status-led');
        if (led) {
            if (estado === 'OPEN') led.setAttribute('fill', '#22c55e');
            else if (estado === 'CLOSED') led.setAttribute('fill', '#ef4444');
            else led.setAttribute('fill', '#f59e0b');
        }

        const svgAngle = document.getElementById('tw-svg-angle');
        const svgSub = document.getElementById('tw-svg-sub');
        if (svgAngle) svgAngle.textContent = `${ang.toFixed(2)} deg`;
        if (svgSub) svgSub.textContent = `Ref: ${ref.toFixed(1)} deg | Viento: ${viento.toFixed(1)} N*m`;

        const statePill = document.getElementById('tw-state-pill');
        if (statePill) {
            statePill.textContent = estado;
            statePill.className = 'tw-state-pill ' + (
                estado === 'OPEN' ? 'tw-state-open' :
                estado === 'CLOSED' ? 'tw-state-closed' : 'tw-state-moving'
            );
        }

        const plateChip = document.getElementById('tw-plate-chip');
        if (plateChip) plateChip.textContent = `PLACA: ${placa}`;

        const simTime = document.getElementById('tw-sim-time');
        if (simTime) simTime.textContent = `t = ${Number(d.t_s || 0).toFixed(2)} s`;

        // 2. KPIs y barras de saturacion
        const setTxt = (id, txt) => {
            const el = document.getElementById(id);
            if (el) el.textContent = txt;
        };
        const setBar = (id, pct) => {
            const el = document.getElementById(id);
            if (el) el.style.width = `${Math.min(100, Math.max(0, pct))}%`;
        };

        setTxt('tw-kpi-theta', `${ang.toFixed(2)} deg`);
        setTxt('tw-kpi-omega', `w = ${omega.toFixed(3)} rad/s | ${rpmMotor.toFixed(0)} rpm motor`);
        setBar('tw-bar-theta', (ang / 90.0) * 100.0);

        setTxt('tw-kpi-torque', `${torque.toFixed(2)} N*m`);
        setBar('tw-bar-torque', (Math.abs(torque) / 51.3) * 100.0);

        setTxt('tw-kpi-volt', `${va.toFixed(2)} V`);
        setBar('tw-bar-volt', (Math.abs(va) / 24.0) * 100.0);

        setTxt('tw-kpi-amp', `${ia.toFixed(2)} A`);
        setBar('tw-bar-amp', (Math.abs(ia) / 6.1) * 100.0);

        // 3. Historial y osciloscopio en vivo
        histTheta.push(ang);
        histTheta.shift();
        histRef.push(ref);
        histRef.shift();
        histAmp.push(ia);
        histAmp.shift();
        dibujarOsciloscopio();
    }

    function dibujarOsciloscopio() {
        const canvas = document.getElementById('tw-live-chart');
        if (!canvas) return;
        const ctx = canvas.getContext('2d');
        const W = canvas.width;
        const H = canvas.height;

        ctx.clearRect(0, 0, W, H);

        // Cuadricula horizontal
        ctx.strokeStyle = 'rgba(148, 163, 184, 0.16)';
        ctx.lineWidth = 1;
        for (let k = 1; k < 4; k++) {
            const y = (H / 4) * k;
            ctx.beginPath();
            ctx.moveTo(0, y);
            ctx.lineTo(W, y);
            ctx.stroke();
        }

        // Linea de referencia angular (discontinua)
        ctx.save();
        ctx.strokeStyle = 'rgba(56, 189, 248, 0.45)';
        ctx.setLineDash([5, 4]);
        ctx.lineWidth = 1.3;
        ctx.beginPath();
        for (let i = 0; i < MAX_PUNTOS; i++) {
            const x = (i / (MAX_PUNTOS - 1)) * W;
            const y = H - 12 - (Math.max(-5, Math.min(100, histRef[i])) / 100) * (H - 24);
            if (i === 0) ctx.moveTo(x, y);
            else ctx.lineTo(x, y);
        }
        ctx.stroke();
        ctx.restore();

        // Curva de posicion angular theta_L(t)
        ctx.strokeStyle = '#38bdf8';
        ctx.lineWidth = 2.2;
        ctx.beginPath();
        for (let i = 0; i < MAX_PUNTOS; i++) {
            const x = (i / (MAX_PUNTOS - 1)) * W;
            const y = H - 12 - (Math.max(-5, Math.min(100, histTheta[i])) / 100) * (H - 24);
            if (i === 0) ctx.moveTo(x, y);
            else ctx.lineTo(x, y);
        }
        ctx.stroke();

        // Curva de corriente de armadura i_a(t) centrada en H/2 (+/- 7 A)
        ctx.strokeStyle = '#ef4444';
        ctx.lineWidth = 1.6;
        ctx.beginPath();
        for (let i = 0; i < MAX_PUNTOS; i++) {
            const x = (i / (MAX_PUNTOS - 1)) * W;
            const y = (H / 2) - (histAmp[i] / 7.0) * (H / 2 - 12);
            if (i === 0) ctx.moveTo(x, y);
            else ctx.lineTo(x, y);
        }
        ctx.stroke();
    }

    async function enviarComando(accion) {
        const placa = accion === 'OPEN' ? 'ADMIN-WEB' : (accion === 'CLOSE' ? 'CIERRE' : 'RESET');
        try {
            const res = await fetch(`${getInputUrl()}/api/talanquera/comando`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ accion, placa, cierre_automatico_s: 0 })
            });
            if (!res.ok) throw new Error(`HTTP ${res.status}`);
            mostrarAviso('');
        } catch (err) {
            mostrarAviso('No se pudo enviar el comando. Verifica que simulador_talanquera_api.py este corriendo en el puerto 8001.');
        }
    }

    async function enviarViento() {
        try {
            const res = await fetch(`${getInputUrl()}/api/talanquera/perturbacion`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ torque_viento_nm: 5.0, duracion_s: 2.5 })
            });
            if (!res.ok) throw new Error(`HTTP ${res.status}`);
            mostrarAviso('');
        } catch (err) {
            mostrarAviso('No se pudo inyectar la rafaga de viento. Revisa la conexion con el simulador.');
        }
    }

    async function actualizarFriccion(val) {
        const num = parseFloat(val) || 0.0;
        const lbl = document.getElementById('tw-friction-val');
        if (lbl) lbl.textContent = `${num.toFixed(1)} N*m`;
        try {
            await fetch(`${getInputUrl()}/api/talanquera/perturbacion`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ torque_viento_nm: 0.0, duracion_s: 0.0, friccion_seca_nm: num })
            });
        } catch (err) {
            mostrarAviso('No se pudo actualizar la friccion seca en el simulador.');
        }
    }

    function activar() {
        if (!inicializado) {
            inicializado = true;
            const input = document.getElementById('tw-api-url');
            if (input) {
                const guardada = localStorage.getItem(STORAGE_KEY);
                input.value = guardada || DEFAULT_URL;
            }
            dibujarOsciloscopio();
        }
        if (!ws || ws.readyState === WebSocket.CLOSED) {
            conectar();
        }
    }

    window.TalanqueraTwin = {
        activar,
        conectar,
        enviarComando,
        enviarViento,
        actualizarFriccion
    };
})();