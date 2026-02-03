// Registro de Service Worker para PWA
if ('serviceWorker' in navigator) {
    window.addEventListener('load', () => {
        navigator.serviceWorker.register('./sw.js')
            .then(reg => console.log('Service Worker registrado'))
            .catch(err => console.log('Error en Service Worker', err));
    });
}

// CONFIGURACIÓN: Reemplaza esto con la URL que obtendrás de Google Apps Script
const GOOGLE_SHEETS_URL = "https://script.google.com/macros/s/AKfycbz9GbqHfoAQarF5pv4da2jJDcSSTz7suco2O5SyaZ8X_4sJOTVbYZhiTrj0X501uECW/exec";
const ADMIN_PASSWORD = "Defensoria2026";

// Variables de Estado
let activeSession = null;
let history = [];
let timerInterval = null;

// Elementos del DOM
const selectionSection = document.getElementById('selection-section');
const acpSection = document.getElementById('acp-section');
const startSection = document.getElementById('start-section');
const activeSection = document.getElementById('active-section');
const historySection = document.getElementById('history-section');

const choiceAcpBtn = document.getElementById('choice-acp');
const choicePlanBtn = document.getElementById('choice-plan');
const backBtns = document.querySelectorAll('.back-link');

const acpForm = document.getElementById('acp-form');
const startForm = document.getElementById('start-form');

const finishBtn = document.getElementById('finish-btn');
const timerDisplay = document.getElementById('timer');
const historyList = document.getElementById('history-list');

const displayLocation = document.getElementById('display-location');
const displayStart = document.getElementById('display-start');
const displayStartGeo = document.getElementById('display-start-geo');

const exportBtn = document.getElementById('export-btn');
const adminLink = document.getElementById('admin-link');

// Inicialización
function init() {
    activeSession = JSON.parse(localStorage.getItem('dp_active_session'));
    history = JSON.parse(localStorage.getItem('dp_history')) || [];

    // Cargar listas dinámicas desde el backend
    fetchDynamicLists();

    // Poner la fecha de hoy por defecto
    // Poner la fecha de hoy por defecto (Corregido para Zona Horaria Local)
    const dateInputs = document.querySelectorAll('input[type="date"]');
    // Obtener fecha del dispositivo (Año-Mes-Día)
    const now = new Date();
    const year = now.getFullYear();
    const month = String(now.getMonth() + 1).padStart(2, '0');
    const day = String(now.getDate()).padStart(2, '0');
    const localDate = `${year}-${month}-${day}`;

    dateInputs.forEach(input => {
        input.value = localDate;
    });

    if (activeSession) {
        showActiveSession();
    } else {
        showSelectionScreen();
    }
    renderHistory();
}

// Listas Dinámicas
async function fetchDynamicLists() {
    try {
        const response = await fetch(GOOGLE_SHEETS_URL);
        const json = await response.json();

        if (json.config) {
            // Actualizar Lugares (Lima - Espacio de movilización)
            if (json.config.lugares && json.config.lugares.length > 0) {
                // Combinar con los existentes o reemplazar? Vamos a agregar los nuevos.
                // Para evitar duplicados usamos Set
                const current = locationOptions['Espacio de movilización'] || [];
                const merged = [...new Set([...current, ...json.config.lugares])];
                locationOptions['Espacio de movilización'] = merged;

                // Si la categoría seleccionada actual es esa, refrescar datalist
                if (categorySelect.value === 'Espacio de movilización') {
                    updateLocationDatalist(merged);
                }
            }

            // Actualizar Protestas (Ambos formularios)
            if (json.config.protestas && json.config.protestas.length > 0) {
                populateProtestDatalist(json.config.protestas);
            }
        }
    } catch (error) {
        console.error("Error cargando listas dinámicas:", error);
    }
}

function populateProtestDatalist(items) {
    const datalists = document.querySelectorAll('.protest-list-dynamic');
    datalists.forEach(list => {
        list.innerHTML = '';
        items.forEach(item => {
            const option = document.createElement('option');
            option.value = item;
            list.appendChild(option);
        });
    });
}

// Navegación
function showSelectionScreen() {
    hideAllSections();
    selectionSection.classList.remove('hidden');
    historySection.classList.remove('hidden');
}

function showAcpForm() {
    hideAllSections();
    acpSection.classList.remove('hidden');
    historySection.classList.add('hidden');
}

function showPlanForm() {
    hideAllSections();
    startSection.classList.remove('hidden');
    historySection.classList.add('hidden');
}

function hideAllSections() {
    selectionSection.classList.add('hidden');
    acpSection.classList.add('hidden');
    startSection.classList.add('hidden');
    activeSection.classList.add('hidden');
}

// Cambio de Interfaz
function showActiveSession() {
    hideAllSections();
    activeSection.classList.remove('hidden');

    // Mostrar info
    displayLocation.textContent = `${activeSession.location} (${activeSession.category})`;
    displayStart.textContent = new Date(activeSession.startTime).toLocaleTimeString();

    if (activeSession.startGeo) {
        displayStartGeo.textContent = `${activeSession.startGeo.lat.toFixed(5)}, ${activeSession.startGeo.lng.toFixed(5)}`;
    } else {
        displayStartGeo.textContent = "No registrada";
    }

    startTimer();
}

// Lógica del Cronómetro
function startTimer() {
    updateTimer();
    if (timerInterval) clearInterval(timerInterval);
    timerInterval = setInterval(updateTimer, 1000);
}

function updateTimer() {
    if (!activeSession) return;
    const now = new Date();
    const start = new Date(activeSession.startTime);
    const diff = now - start;

    const h = Math.floor(diff / 3600000).toString().padStart(2, '0');
    const m = Math.floor((diff % 3600000) / 60000).toString().padStart(2, '0');
    const s = Math.floor((diff % 60000) / 1000).toString().padStart(2, '0');

    timerDisplay.textContent = `${h}:${m}:${s}`;
}

// Geolocation Helper
function getGeoLocation() {
    return new Promise((resolve) => {
        if (!navigator.geolocation) {
            resolve(null);
            return;
        }
        navigator.geolocation.getCurrentPosition(
            (pos) => {
                resolve({
                    lat: pos.coords.latitude,
                    lng: pos.coords.longitude
                });
            },
            (err) => {
                console.log("Error Geo:", err);
                resolve(null);
            },
            { enableHighAccuracy: true, timeout: 5000, maximumAge: 0 }
        );
    });
}

// Manejadores de Eventos
choiceAcpBtn.addEventListener('click', showAcpForm);
choicePlanBtn.addEventListener('click', showPlanForm);
backBtns.forEach(btn => btn.addEventListener('click', showSelectionScreen));

// Lógica de Desplegables Dinámicos (Sede Central)
const categorySelect = document.getElementById('category');
const locationInput = document.getElementById('location');
const locationDatalist = document.getElementById('location-list');

const locationOptions = {
    'Espacio de movilización': [
        "Congreso", "Fiscalía", "Parque Universitario", "Plaza San Martín", "Plaza Dos de Mayo",
        "Plaza Manco Cápac", "Alameda Paseo de los Héroes Navales", "Óvalo Grau", "Óvalo Bolognesi"
    ],
    'Dependencia policial / Seguridad del Estado': [
        "Comisaría Alfonso Ugarte", "Comisaría Cotabambas", "Comisaría de Mujeres",
        "Comisaría PNP San Andrés", "División de Asuntos Sociales", "Comisaría de Piedra Liza"
    ],
    'Establecimiento de salud': [
        "Hospital Nacional Arzobispo Loayza", "Emergencias Grau", "Hospital Nacional Guillermo Almenara",
        "Hospital Edgardo Rebagliati Martins", "Hospital Nacional Dos de Mayo",
        "Hospital PNP Augusto B. Leguía", "Hospital Nacional PNP Luis N Saenz"
    ],
    'Videovigilancia': [
        "Centro de Monitoreo", "Cámaras - Municipalidad", "Cámaras - PNP"
    ]
};

categorySelect.addEventListener('change', () => {
    const selectedCategory = categorySelect.value;
    const options = locationOptions[selectedCategory] || [];

    locationInput.value = ""; // Opcional: limpiar si cambia categoría
    locationDatalist.innerHTML = "";
    options.forEach(opt => {
        const optionNode = document.createElement('option');
        optionNode.value = opt;
        locationDatalist.appendChild(optionNode);
    });
});

// Helper para leer archivo y convertir a Base64 (con compresión simple para imágenes)
function readFileAndCompress(file) {
    return new Promise((resolve, reject) => {
        if (!file) {
            resolve({ base64: "", name: "", type: "" });
            return;
        }

        const reader = new FileReader();
        reader.readAsDataURL(file);
        reader.onload = (event) => {
            const img = new Image();
            img.src = event.target.result;
            img.onload = () => {
                const canvas = document.createElement('canvas');
                const MAX_WIDTH = 1000;
                const MAX_HEIGHT = 1000;
                let width = img.width;
                let height = img.height;

                if (width > height) {
                    if (width > MAX_WIDTH) {
                        height *= MAX_WIDTH / width;
                        width = MAX_WIDTH;
                    }
                } else {
                    if (height > MAX_HEIGHT) {
                        width *= MAX_HEIGHT / height;
                        height = MAX_HEIGHT;
                    }
                }

                canvas.width = width;
                canvas.height = height;
                const ctx = canvas.getContext('2d');
                ctx.drawImage(img, 0, 0, width, height);

                // Compresión JPEG al 0.7
                const dataUrl = canvas.toDataURL('image/jpeg', 0.7);
                // dataUrl viene como "data:image/jpeg;base64,....."
                // Para Google Script solemos necesitar solo la parte base64 pura a veces, 
                // pero enviaremos todo y lo procesaremos allá, o mejor split aquí.
                resolve({
                    base64: dataUrl.split(',')[1],
                    name: file.name,
                    type: file.type
                });
            };
            img.onerror = (e) => reject(e);
        };
        reader.onerror = error => reject(error);
    });
}

// SUBMIT: Oficina Desconcentrada (OD)
acpForm.addEventListener('submit', async (e) => {
    e.preventDefault();
    const btn = acpForm.querySelector('button[type="submit"]');
    btn.textContent = "Procesando...";
    btn.disabled = true;

    try {
        const geo = await getGeoLocation();
        const now = new Date();
        const selectedDate = document.getElementById('acp-date').value;
        const startDateTime = new Date(`${selectedDate}T${now.toTimeString().split(' ')[0]}`);

        const mediaInput = document.getElementById('acp-media');
        let fileData = { base64: "", name: "", type: "" };

        if (mediaInput.files.length > 0) {
            // Si es imagen, intentamos comprimir. Si es video, cuidado con el tamaño.
            if (mediaInput.files[0].type.startsWith('image/')) {
                btn.textContent = "Comprimiendo imagen...";
                fileData = await readFileAndCompress(mediaInput.files[0]);
            } else {
                // Video: no comprimimos aquí (muy complejo), advertimos solo nombre o límite?
                // Por ahora solo nombre para videos para evitar crasheos de LocalStorage
                alert("Nota: Los videos no se subirán a Drive en esta versión (solo fotos). Solo se registrará el nombre.");
                fileData = { base64: "", name: mediaInput.files[0].name, type: mediaInput.files[0].type };
            }
        }

        activeSession = {
            type: 'OD',
            category: document.getElementById('acp-category').value,
            name: document.getElementById('acp-supervisor').value,
            office: document.getElementById('acp-office').value,
            date: selectedDate,
            location: document.getElementById('acp-location').value,
            mediaFile: fileData.name,     // Nombre para mostrar
            mediaData: fileData.base64,   // Contenido real
            mediaType: fileData.type,     // Mime type
            observations: document.getElementById('acp-observations').value,
            startTime: startDateTime.getTime(),
            startGeo: geo,
            shift: "",
            protestName: "",
            sessionId: generateSessionId(),
            incidents: []
        };

        saveAndShowActive(true);
    } catch (err) {
        console.error(err);
        alert("Error al iniciar: " + err.message);
    } finally {
        btn.textContent = "Registrar Inicio";
        btn.disabled = false;
    }
});

// SUBMIT: Sede Central
startForm.addEventListener('submit', async (e) => {
    e.preventDefault();
    const btn = startForm.querySelector('button[type="submit"]');
    btn.textContent = "Procesando...";
    btn.disabled = true;

    try {
        const geo = await getGeoLocation();
        const now = new Date();
        const selectedDate = document.getElementById('date').value;
        const startDateTime = new Date(`${selectedDate}T${now.toTimeString().split(' ')[0]}`);

        const mediaInput = document.getElementById('media');
        let fileData = { base64: "", name: "", type: "" };

        if (mediaInput.files.length > 0) {
            if (mediaInput.files[0].type.startsWith('image/')) {
                btn.textContent = "Comprimiendo imagen...";
                fileData = await readFileAndCompress(mediaInput.files[0]);
            } else {
                alert("Nota: Los videos no se subirán a Drive en esta versión (solo fotos). Solo se registrará el nombre.");
                fileData = { base64: "", name: mediaInput.files[0].name, type: mediaInput.files[0].type };
            }
        }

        activeSession = {
            type: 'SEDE',
            shift: document.getElementById('shift').value,
            office: document.getElementById('office').value,
            name: document.getElementById('name').value,
            protestName: document.getElementById('protest-name').value,
            category: document.getElementById('category').value,
            location: document.getElementById('location').value,
            date: selectedDate,
            mediaFile: fileData.name,
            mediaData: fileData.base64,
            mediaType: fileData.type,
            observations: document.getElementById('observations').value,
            startTime: startDateTime.getTime(),
            startGeo: geo,
            sessionId: generateSessionId(),
            incidents: []
        };

        saveAndShowActive(true);
    } catch (err) {
        console.error(err);
        alert("Error al iniciar: " + err.message);
    } finally {
        btn.textContent = "Iniciar Supervisión";
        btn.disabled = false;
    }
});

// --- SINCRONIZACIÓN EN TIEMPO REAL (v3.0) ---

async function syncWithCloud(action, data, extraPayload = {}) {
    if (!GOOGLE_SHEETS_URL) return;

    try {
        console.log(`Sincronizando: ${action}...`);

        // Preparar payload base con campos comunes
        const payload = {
            action: action, // 'start', 'incident', 'finish'
            sessionId: data.sessionId,
            fecha: data.date,
            tipo_registro: data.type === 'OD' ? 'Oficina Desconcentrada' : 'Sede Central',
            turno: data.shift || "",
            oficina: data.office,
            supervisor: data.name,
            nombre_protesta: data.protestName || "",
            categoria: data.category,
            punto: data.location,
            inicio: new Date(data.startTime).toLocaleTimeString(),
            fin_de_semana: isWeekend(new Date(data.startTime)) ? 'Sí' : 'No',
            // En 'start', estos pueden ir medio vacíos, pero los mandamos igual
            observaciones: data.observations || "",
            // Incidencias se mandan completas siempre para mantener sync
            incidencias: data.incidents || [],

            // Campos específicos de actualización
            ...extraPayload
        };

        // En 'start', mandamos todo lo inicial
        if (action === 'start') {
            payload.archivo = data.mediaFile || "";
            payload.mediaData = data.mediaData || "";
            payload.mediaType = data.mediaType || "";
            payload.lat_inicio = data.startGeo ? data.startGeo.lat : "";
            payload.lng_inicio = data.startGeo ? data.startGeo.lng : "";
        }

        // En 'finish', mandamos cierre
        if (action === 'finish') {
            const durationH = (data.duration / 3600000).toFixed(2);
            payload.fin = new Date(data.endTime).toLocaleTimeString();
            payload.duracion = durationH;
            payload.lat_fin = data.endGeo ? data.endGeo.lat : "";
            payload.lng_fin = data.endGeo ? data.endGeo.lng : "";
        }

        await fetch(GOOGLE_SHEETS_URL, {
            method: 'POST',
            mode: 'no-cors',
            cache: 'no-cache',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(payload)
        });

        console.log(`Sincronización ${action} enviada.`);

    } catch (error) {
        console.error('Error enviando a Google Sheets:', error);
        // Podríamos guardar en cola para reintentar si no hay internet (Pendiente v3.1)
    }
}

// -------------------------------------------------------------------------
// MODIFICACIONES EN EL FLUJO DE LA APP PARA LLAMAR A SYNC
// -------------------------------------------------------------------------

// EN SUBMIT DE FORMULARIOS: Llamar a 'start'
// Modificar saveAndShowActive para aceptar flag de 'isNew'
function saveAndShowActive(isNew = false) {
    localStorage.setItem('dp_active_session', JSON.stringify(activeSession));
    showActiveSession();

    // Si es nuevo inicio, sincronizar
    if (isNew) {
        syncWithCloud('start', activeSession);
    }
}

// FINALIZAR
finishBtn.addEventListener('click', async () => {
    finishBtn.textContent = "Finalizando...";
    finishBtn.disabled = true;

    const endTime = new Date().getTime();
    const geo = await getGeoLocation();

    const entry = {
        ...activeSession,
        endTime: endTime,
        endGeo: geo,
        duration: endTime - activeSession.startTime,
        isWeekend: isWeekend(new Date(activeSession.startTime))
    };

    history.unshift(entry);
    localStorage.setItem('dp_history', JSON.stringify(history));
    localStorage.removeItem('dp_active_session');

    // SYNC FINISH
    await syncWithCloud('finish', entry);

    activeSession = null;
    finishBtn.textContent = "Finalizar Supervisión";
    finishBtn.disabled = false;

    showSelectionScreen();
    renderHistory();

    acpForm.reset();
    startForm.reset();
    document.querySelectorAll('input[type="date"]').forEach(input => input.valueAsDate = new Date());
});

function isWeekend(date) {
    const day = date.getDay();
    return day === 0 || day === 6;
}

// Defensor Dashboard Link
// Admin y Dashboard
const defensorLink = document.getElementById('defensor-link');
if (defensorLink) {
    defensorLink.addEventListener('click', () => {
        const pass = prompt('Ingrese clave de administrador:');
        if (pass === ADMIN_PASSWORD) {
            window.location.href = 'defensor.html';
        } else {
            alert('Clave incorrecta');
        }
    });
}

function renderHistory() {
    if (history.length === 0) {
        historyList.innerHTML = '<p class="empty-msg">No hay registros previos.</p>';
        return;
    }

    historyList.innerHTML = history.map(item => {
        const dateStr = item.date;
        const startStr = new Date(item.startTime).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
        const endStr = new Date(item.endTime).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
        const durationH = (item.duration / 3600000).toFixed(2);
        const typeLabel = item.type === 'OD' ? 'OD' : 'Sede';

        return `
            <div class="history-item">
                <div class="header">
                    <span class="badge-type">${typeLabel}</span>
                    <span>${item.location}</span>
                    <span>${dateStr}</span>
                </div>
                <div class="details">
                    <p><strong>${item.name}</strong> (${item.office})</p>
                    <p>${startStr} - ${endStr} 
                        <span class="duration-tag">${durationH}h</span>
                    </p>
                    ${item.protestName ? `<p>Protesta: ${item.protestName}</p>` : ''}
                    ${item.mediaFile ? `<p>📎 ${item.mediaFile}</p>` : ''}
                </div>
            </div>
        `;
    }).join('');
}

exportBtn.addEventListener('click', () => {
    if (history.length === 0) return alert('No hay datos para exportar');

    let csv = 'Fecha,Tipo,Turno,Oficina,Supervisor,Protesta,Categoría,Ubicación,Inicio,Fin,Lat_Ini,Lng_Ini,Lat_Fin,Lng_Fin,Duración,Archivo,Obs\n';
    history.forEach(item => {
        const start = new Date(item.startTime).toLocaleTimeString();
        const end = new Date(item.endTime).toLocaleTimeString();
        const duration = (item.duration / 3600000).toFixed(2);
        const lat1 = item.startGeo ? item.startGeo.lat : "";
        const lng1 = item.startGeo ? item.startGeo.lng : "";
        const lat2 = item.endGeo ? item.endGeo.lat : "";
        const lng2 = item.endGeo ? item.endGeo.lng : "";

        csv += `${item.date},${item.type},${item.shift || ""},"${item.office}","${item.name}","${item.protestName || ""}","${item.category}","${item.location}",${start},${end},${lat1},${lng1},${lat2},${lng2},${duration},"${item.mediaFile || ""}","${(item.observations || "").replace(/"/g, '""')}"\n`;
    });

    const blob = new Blob(["\ufeff" + csv], { type: 'text/csv;charset=utf-8;' });
    const link = document.createElement("a");
    const url = URL.createObjectURL(blob);
    link.setAttribute("href", url);
    link.setAttribute("download", `supervisiones_export.csv`);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
});

// --- LÓGICA DE INCIDENCIAS ---

function generateSessionId() {
    return 'SUP-' + Date.now() + '-' + Math.floor(Math.random() * 1000);
}

// Elementos Modal Incidencia
const addIncidentBtn = document.getElementById('add-incident-btn');
const incidentModal = document.getElementById('incident-modal');
const cancelIncidentBtn = document.getElementById('cancel-incident-btn');
const saveIncidentBtn = document.getElementById('save-incident-btn');
const incidentTimeInput = document.getElementById('incident-time');
const incidentDescInput = document.getElementById('incident-desc');
const incidentPhotoInput = document.getElementById('incident-photo');
const incidentPhotoName = document.getElementById('incident-photo-name');
const timelineContainer = document.getElementById('incidents-timeline');

// Abrir Modal
addIncidentBtn.addEventListener('click', () => {
    incidentModal.classList.remove('hidden-modal');
    // Set hora actual
    const now = new Date();
    const h = now.getHours().toString().padStart(2, '0');
    const m = now.getMinutes().toString().padStart(2, '0');
    incidentTimeInput.value = `${h}:${m}`;

    // Reset campos
    incidentDescInput.value = "";
    incidentPhotoInput.value = "";
    incidentPhotoName.textContent = "Sin archivo";
});

// Cerrar Modal
cancelIncidentBtn.addEventListener('click', () => {
    incidentModal.classList.add('hidden-modal');
});

// Mostrar nombre de archivo
incidentPhotoInput.addEventListener('change', () => {
    if (incidentPhotoInput.files[0]) {
        incidentPhotoName.textContent = "📄 " + incidentPhotoInput.files[0].name;
    } else {
        incidentPhotoName.textContent = "Sin archivo";
    }
});

// Guardar Incidencia
saveIncidentBtn.addEventListener('click', async () => {
    const desc = incidentDescInput.value.trim();
    if (!desc) {
        alert("Por favor describe la incidencia.");
        return;
    }

    saveIncidentBtn.textContent = "Obteniendo GPS...";
    saveIncidentBtn.disabled = true;

    try {
        const geo = await getGeoLocation(); // Capturar ubicación actual
        const time = incidentTimeInput.value;
        const file = incidentPhotoInput.files[0];
        let fileData = { base64: "", name: "", type: "" };

        if (file) {
            saveIncidentBtn.textContent = "Procesando imagen...";
            fileData = await readFileAndCompress(file);
        }

        const newIncident = {
            id: Date.now(),
            time: time,
            description: desc,
            fileName: fileData.name,
            mediaData: fileData.base64,
            mediaType: fileData.type,
            lat: geo ? geo.lat : "",
            lng: geo ? geo.lng : ""
        };

        activeSession.incidents.push(newIncident);
        saveAndShowActive(); // Guarda en localStorage

        // SYNC INCIDENT
        saveIncidentBtn.textContent = "Sincronizando...";
        syncWithCloud('incident', activeSession, {
            new_incident: newIncident,
            all_incidents: activeSession.incidents
        });

        // Renderizar Timeline
        renderTimeline();

        incidentModal.classList.add('hidden-modal');

    } catch (err) {
        console.error(err);
        alert("Error al guardar incidencia: " + err.message);
    } finally {
        saveIncidentBtn.textContent = "Guardar";
        saveIncidentBtn.disabled = false;
    }
});

function renderTimeline() {
    if (!activeSession || !activeSession.incidents) {
        timelineContainer.innerHTML = "";
        return;
    }

    // Ordenar por hora (aunque ya deberían estar ordenados)
    // Se asume inserción cronológica
    timelineContainer.innerHTML = activeSession.incidents.map(inc => `
        <div class="timeline-item">
            <div class="timeline-time">${inc.time}</div>
            <div class="timeline-desc">${inc.description}</div>
            ${inc.fileName ? `<div class="timeline-photo">📎 ${inc.fileName}</div>` : ''}
        </div>
    `).join('');
}

// Hookear renderTimeline en showActiveSession
const originalShowActiveSession = showActiveSession;
showActiveSession = function () {
    originalShowActiveSession();
    renderTimeline();
};

// --- VALIDACIÓN ESTRICTA DE LISTAS ---
function enforceStrictDatalist(inputId) {
    const input = document.getElementById(inputId);
    if (!input) return;

    input.addEventListener('change', function () {
        const val = this.value;
        const listId = this.getAttribute('list');
        const list = document.getElementById(listId);

        if (list && val) {
            let match = false;
            // Verificar si el valor existe en las opciones
            for (let opt of list.options) {
                if (opt.value === val) {
                    match = true;
                    break;
                }
            }

            if (!match) {
                alert("⚠️ Por favor selecciona una opción válida de la lista.\nSi no aparece, solicítalo al administrador.");
                this.value = ""; // Limpiar campo
            }
        }
    });

    // UX: Limpiar si el usuario borra todo
    input.addEventListener('input', function () {
        if (this.value === "") {
            this.setCustomValidity("");
        }
    });
}

// Aplicar reglas estrictas al iniciar
document.addEventListener('DOMContentLoaded', () => {
    enforceStrictDatalist('location');      // Punto de Supervisión
    enforceStrictDatalist('protest-name');  // Nombre de Protesta (Lima)
    enforceStrictDatalist('acp-office');    // OD/MOD (Provincias)
});

init();
