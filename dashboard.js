// Configuración
const GOOGLE_SHEETS_URL = "https://script.google.com/macros/s/AKfycbz9GbqHfoAQarF5pv4da2jJDcSSTz7suco2O5SyaZ8X_4sJOTVbYZhiTrj0X501uECW/exec";

// Elementos
const filterDate = document.getElementById('filter-date');
const filterProtest = document.getElementById('filter-protest');
const filterRegion = document.getElementById('filter-region');
const refreshBtn = document.getElementById('refresh-btn');
const reportsList = document.getElementById('reports-list');
const loadingIndicator = document.getElementById('loading');
const statTotal = document.getElementById('stat-total');
const statActive = document.getElementById('stat-active');
const statFinished = document.getElementById('stat-finished');
const statIncidents = document.getElementById('stat-incidents');

let allData = [];

// Inicialización
document.addEventListener('DOMContentLoaded', () => {
    // Set fecha de hoy por defecto en formato YYYY-MM-DD
    const today = new Date().toISOString().split('T')[0];
    filterDate.value = today;

    fetchData();
});

refreshBtn.addEventListener('click', fetchData);
filterDate.addEventListener('change', renderDashboard);
filterRegion.addEventListener('change', renderDashboard);
filterProtest.addEventListener('change', renderDashboard);

function generateSkeletonHTML() {
    return `
        <div class="skeleton-card">
            <div style="flex-grow: 1; width: 100%;">
                <div class="skeleton-text" style="width: 70%;"></div>
                <div class="skeleton-text" style="width: 40%;"></div>
                <div class="skeleton-text" style="width: 50%;"></div>
            </div>
        </div>
        <div class="skeleton-card">
            <div style="flex-grow: 1; width: 100%;">
                <div class="skeleton-text" style="width: 60%;"></div>
                <div class="skeleton-text" style="width: 50%;"></div>
                <div class="skeleton-text" style="width: 30%;"></div>
            </div>
        </div>
        <div class="skeleton-card">
            <div style="flex-grow: 1; width: 100%;">
                <div class="skeleton-text" style="width: 80%;"></div>
                <div class="skeleton-text" style="width: 40%;"></div>
                <div class="skeleton-text" style="width: 60%;"></div>
            </div>
        </div>
    `;
}

async function fetchData() {
    if (loadingIndicator) loadingIndicator.style.display = 'none';
    reportsList.innerHTML = generateSkeletonHTML();

    try {
        const response = await fetch(GOOGLE_SHEETS_URL);
        const json = await response.json();

        // Detectar si es la estructura nueva { registros: [], incidencias: [] }
        if (json.registros && json.incidencias) {
            allData = processRelationalData(json.registros, json.incidencias);

            // Poblar filtro de protestas (Combinando lo del sheet y lo histórico)
            let protestOptions = [];
            if (json.config && json.config.protestas) {
                protestOptions = json.config.protestas;
            }
            populateProtestFilter(allData, protestOptions);

            renderDashboard();
        } else if (json.status === 'success') {
            // Soporte fallback (estructura vieja)
            allData = json.data;
            populateProtestFilter(allData);
            renderDashboard();
        } else {
            reportsList.innerHTML = `<div class="empty-msg">Error: Respuesta inesperada del servidor.</div>`;
        }

    } catch (error) {
        console.error("Error fetching/rendering data:", error);
        reportsList.innerHTML = `
            <div class="empty-msg" style="color: var(--danger);">
                Error: ${error.message} <br>
                <small style="color: #666;">${error.stack}</small>
            </div>`;
    } finally {
        loadingIndicator.style.display = 'none';
    }
}

// Helper: Convierte Array de Arrays (Sheet) a Array de Objetos
function sheetToObjects(rows) {
    if (!rows || rows.length < 2) return [];

    // Normalizar cabeceras: minúsculas, sin espacios, sin tildes
    const headers = rows[0].map(h =>
        h.toString().toLowerCase()
            .normalize("NFD").replace(/[\u0300-\u036f]/g, "") // Quitar tildes
            .trim() // Quitar espacios inicio/fin
            .replace(/\s+/g, '_') // Espacios a guiones bajos
    );

    return rows.slice(1).map(row => {
        const obj = {};
        headers.forEach((header, index) => {
            // Mapeo seguro, si la fila es más corta que cabeceras
            obj[header] = (row[index] !== undefined) ? row[index] : "";
        });
        return obj;
    });
}

// Función CORE: Une Registros con Incidencias
function processRelationalData(registrosRaw, incidenciasRaw) {
    const registros = sheetToObjects(registrosRaw);
    const incidencias = sheetToObjects(incidenciasRaw);

    // Mapeamos incidencias por ID de Supervision
    // Cabecera esperada en incidencias: id_supervision
    const incMap = {};

    incidencias.forEach(inc => {
        // Normalizar clave ID (Soporte para 'id_supervision' del script o 'id' de la hoja usuario)
        const id = inc.id_supervision || inc.id;

        if (id) {
            if (!incMap[id]) incMap[id] = [];

            // Mapeo flexible de campos según la hoja del usuario
            // HORA: 'hora_incidencia' (script) o 'hora' (usuario)
            const time = inc.hora_incidencia || inc.hora || "";

            // DESCRIPCIÓN: 'descripcion' (script) o 'incidencia' (usuario - Columna F)
            // Nota: En la hoja usuario, 'descripcion' (Col G) a veces tiene URL, y 'incidencia' (Col F) tiene el texto.
            let description = inc.descripcion || inc.incidencia || "";

            // FOTO: 'foto_evidencia' (script) o 'foto' (usuario) o detectamos URL en 'descripcion'
            let fileUrl = inc.foto_evidencia || inc.foto || "";

            // Si no hay URL directa, revisamos si 'descripcion' (Col G del usuario) es una URL
            if (!fileUrl && inc.descripcion && inc.descripcion.toString().startsWith('http')) {
                fileUrl = inc.descripcion;
                // Si usamos la descripcion como URL, intentamos usar 'incidencia' como descripcion principal si existe
                if (inc.incidencia) {
                    description = inc.incidencia;
                }
            }

            incMap[id].push({
                time: time,
                description: description,
                fileName: fileUrl ? "Foto adjunta" : "",
                fileUrl: fileUrl
            });
        }
    });

    // Inyectar incidencias en cada registro padre
    registros.forEach(reg => {
        // En registros la última columna es el ID, busquemos cual es
        // Buscamos algo que parezca ID (SUP-...)
        // O usamos la clave mapeada si el header era explicito 'id_supervision'
        // En google_apps_script.js rows[0] terminaba en data.sessionId, pero no tenia header explícito en el appendRow init?
        // Revisando script: appendRow tiene data.sessionId al final. 
        // Si la hoja se creó nueva, tiene headers manuales. Asumiremos que el usuario puso cabeceras o el script las tiene.
        // Si no hay cabecera 'id_supervision' en sheetToObjects, buscamos por 'sessionId' o la última columna.

        let id = reg.id_supervision || reg.sessionid || reg.id || ""; // Claves normalizadas

        // Fallback: Si no encontramos ID por nombre de columna, buscamos por valor (patrón 'SUP-')
        // Esto corrige el caso donde la columna ID no tenga cabecera o tenga un nombre extraño en el Sheet
        if (!id) {
            const values = Object.values(reg);
            const found = values.find(v => v && v.toString().startsWith('SUP-'));
            if (found) id = found;
        }

        if (id && incMap[id]) {
            reg.incidencias_array = incMap[id];
        } else {
            reg.incidencias_array = [];
        }
    });

    return registros;
}

function populateProtestFilter(data, dynamicOptions = []) {
    const protests = new Set(dynamicOptions); // Iniciar con las configuradas
    data.forEach(item => {
        if (item.nombre_protesta) protests.add(item.nombre_protesta);
    });

    const currentVal = filterProtest.value;
    filterProtest.innerHTML = '<option value="">Todas las protestas</option>';

    // Convertir a Array y ordenar alfabéticamente
    Array.from(protests).sort().forEach(p => {
        const option = document.createElement('option');
        option.value = p;
        option.textContent = p;
        filterProtest.appendChild(option);
    });

    filterProtest.value = currentVal;
}

function renderDashboard() {
    const selectedDate = filterDate.value; // YYYY-MM-DD
    const selectedRegion = filterRegion.value;
    const selectedProtest = filterProtest.value;

    const filtered = allData.filter(item => {
        /* FECHA: 
           Sheets devuelve fecha como objeto Date o string ISO.
           Hay que normalizar a YYYY-MM-DD local
        */
        let itemDateStr = "";
        let rawDate = item.fecha;

        // Si viene como string DD/MM/YYYY
        if (typeof rawDate === 'string' && rawDate.includes('/')) {
            const parts = rawDate.split('/'); // DD, MM, YYYY
            if (parts.length === 3) itemDateStr = `${parts[2]}-${parts[1].padStart(2, '0')}-${parts[0].padStart(2, '0')}`;
        }
        // Si viene como objeto Date string ISO
        else if (rawDate) {
            const d = new Date(rawDate);
            if (!isNaN(d)) {
                itemDateStr = d.toISOString().split('T')[0];
            }
        }

        /* FILTROS */
        // Usamos claves normalizadas del sheetToObjects (todo minuscula, guiones bajos)
        const type = item.tipo_registro || "";
        const protest = item.nombre_protesta || "";

        const dateMatch = !selectedDate || itemDateStr === selectedDate;
        const regionMatch = !selectedRegion || type === selectedRegion;
        const protestMatch = !selectedProtest || protest === selectedProtest;

        return dateMatch && regionMatch && protestMatch;
    });

    updateStats(filtered);

    reportsList.innerHTML = '';
    if (filtered.length === 0) {
        reportsList.innerHTML = '<div class="empty-msg">No se encontraron reportes para este filtro.</div>';
        return;
    }

    filtered.forEach(item => {
        const card = document.createElement('div');
        card.className = 'report-card';

        // Mapeo de campos normalizados
        const punto = item.punto || item.ubicacion || item['punto_/_ubicacion'] || "Punto no especificado";
        const oficina = item.oficina || "";
        const supervisor = item.supervisor || "";

        // Formato horas
        let inicio = item.inicio || item.hora_inicio || "";
        let fin = item.fin || item.hora_fin || "En curso";
        // Si vienen como objeto Date, formatear
        if (inicio instanceof Date) inicio = inicio.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
        if (fin instanceof Date) fin = fin.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });

        const categoria = item.categoria || "";
        const nombreProtesta = item.nombre_protesta || "";
        const obs = item.observaciones || "";
        const archivo = item.foto || item.archivo_foto || item.archivo || "";

        // Incidencias (ya procesadas en el Array)
        const incidentsArray = item.incidencias_array || [];
        const incidentCount = incidentsArray.length;
        const hasIncidents = incidentCount > 0;

        let incidentsHtml = '';
        if (hasIncidents) {
            incidentsHtml = `<div style="margin-top: 15px; padding-top: 10px; border-top: 1px solid #eee;">
                <h4 style="font-size: 0.9rem; color: #e67e22; margin-bottom: 8px;">🔥 Incidencias Reportadas:</h4>
                ${incidentsArray.map(inc => `
                    <div style="background: #fff8f0; padding: 8px; border-radius: 6px; margin-bottom: 6px; font-size: 0.9rem;">
                        <strong>${inc.time}</strong>: ${inc.description}
                        ${inc.fileUrl ? `<br><a href="${inc.fileUrl}" target="_blank" style="font-size:0.8rem; color:#d35400;">📎 Ver Foto</a>` : ''}
                    </div>
                `).join('')}
            </div>`;
        }

        const statusBadge = hasIncidents
            ? `<span class="badge" style="background: #e67e22;">${incidentCount} Incidencias</span>`
            : `<span class="badge" style="background: #16a34a;">Sin Novedad</span>`;

        const isFinished = fin !== "En curso";
        const progressBadge = isFinished 
            ? `<span class="badge" style="background: #64748b;">Finalizado</span>`
            : `<span class="badge" style="background: #3b82f6;">En curso</span>`;

        const obsHtml = obs
            ? `<p style="margin-top:10px; font-style:italic; color:#444; background:#f8fafc; padding:8px; border-radius:6px;">"${obs}"</p>`
            : '';

        const photoHtml = archivo && archivo.startsWith('http')
            ? `<a href="${archivo}" target="_blank" style="font-size:0.9rem;">📷 Foto General</a>`
            : '';

        card.innerHTML = `
            <div>
                <h3>${punto} <span style="font-weight:400; color:#666;">(${oficina})</span></h3>
                <div class="report-meta">
                    <span>👤 ${supervisor}</span>
                    <span>🕒 ${inicio} - ${fin}</span>
                    <span>${categoria}</span>
                </div>
                ${nombreProtesta ? `<div style="margin-top:5px; font-weight:500;">🚩 ${nombreProtesta}</div>` : ''}
                
                ${obsHtml}
                ${incidentsHtml}
            </div>
            <div style="display:flex; flex-direction:column; align-items:flex-end; gap:10px;">
                <div style="display:flex; gap:5px; flex-wrap:wrap; justify-content:flex-end;">
                    ${progressBadge}
                    ${statusBadge}
                </div>
                ${photoHtml}
            </div>
        `;
        reportsList.appendChild(card);
    });
}

function updateStats(data) {
    statTotal.textContent = data.length;

    let activeCount = 0;
    let finishedCount = 0;
    let totalIncidents = 0;

    data.forEach(d => {
        let fin = d.fin || d.hora_fin;
        if (!fin || fin === "En curso") {
            activeCount++;
        } else {
            finishedCount++;
        }
        if (d.incidencias_array) totalIncidents += d.incidencias_array.length;
    });

    if (statActive) statActive.textContent = activeCount;
    if (statFinished) statFinished.textContent = finishedCount;
    if (statIncidents) statIncidents.textContent = totalIncidents;
}

// GESTIÓN DE LISTAS DINÁMICAS
const manageListsBtn = document.getElementById('manage-lists-btn');
const listsModal = document.getElementById('lists-modal');
const closeListsBtn = document.getElementById('close-lists-btn');
const addPlaceBtn = document.getElementById('add-place-btn');
const addProtestBtn = document.getElementById('add-protest-btn');
const newPlaceInput = document.getElementById('new-place-input');
const newProtestInput = document.getElementById('new-protest-input');

if (manageListsBtn) {
    manageListsBtn.addEventListener('click', () => {
        listsModal.style.display = 'flex';
        listsModal.classList.remove('hidden-modal');
    });
}

if (closeListsBtn) {
    closeListsBtn.addEventListener('click', () => {
        listsModal.style.display = 'none';
        listsModal.classList.add('hidden-modal');
    });
}

if (addPlaceBtn) {
    addPlaceBtn.addEventListener('click', () => {
        addListItem('lugar', newPlaceInput);
    });
}

if (addProtestBtn) {
    addProtestBtn.addEventListener('click', () => {
        addListItem('protesta', newProtestInput);
    });
}

async function addListItem(type, inputElement) {
    const value = inputElement.value.trim();
    if (!value) return;

    const originalBtnText = type === 'lugar' ? addPlaceBtn.textContent : addProtestBtn.textContent;
    const btn = type === 'lugar' ? addPlaceBtn : addProtestBtn;

    btn.textContent = "⏳";
    btn.disabled = true;

    try {
        await fetch(GOOGLE_SHEETS_URL, {
            method: 'POST',
            body: JSON.stringify({
                action: 'add_list_item',
                type: type,
                value: value
            })
        });

        alert("Ítem agregado correctamente. Se reflejará en la App al recargar.");
        inputElement.value = "";

        // Recargar datos para actualizar filtros locales si es necesario
        fetchData();

    } catch (error) {
        console.error("Error agregando ítem:", error);
        alert("Error al guardar: " + error.message);
    } finally {
        btn.textContent = originalBtnText;
        btn.disabled = false;
    }
}

// --- GENERADOR DE REPORTE DOCS ---
const generateDocBtn = document.getElementById('generate-doc-btn');
if (generateDocBtn) {
    generateDocBtn.addEventListener('click', async () => {
        const dateStr = filterDate.value || new Date().toISOString().split('T')[0];
        
        let filtered = allData.filter(item => {
            let itemDateStr = "";
            let rawDate = item.fecha;
            if (typeof rawDate === 'string' && rawDate.includes('/')) {
                const parts = rawDate.split('/');
                if (parts.length === 3) itemDateStr = `${parts[2]}-${parts[1].padStart(2, '0')}-${parts[0].padStart(2, '0')}`;
            } else if (rawDate) {
                const d = new Date(rawDate);
                if (!isNaN(d)) itemDateStr = d.toISOString().split('T')[0];
            }

            const type = item.tipo_registro || "";
            const protest = item.nombre_protesta || "";

            if (filterDate.value && itemDateStr !== filterDate.value) return false;
            if (filterRegion.value && type !== filterRegion.value) return false;
            if (filterProtest.value && protest !== filterProtest.value) return false;
            
            return true;
        });

        const tableData = [];
        filtered.forEach(item => {
            let acts = item.nombre_protesta || item.categoria || '';
            let loc = item.oficina + " - " + item.punto;
            
            let measure = "";
            if (item.incidencias && item.incidencias.length > 0) {
                measure = item.incidencias.map(inc => `- [${inc.hora}] ${inc.descripcion}`).join("\n");
            } else {
                measure = item.observaciones || "Sin incidencias registradas.";
            }

            tableData.push({
                ubicacion: loc,
                medida: measure,
                actores: acts
            });
        });

        if (tableData.length === 0) {
            alert("No hay datos para generar el reporte en los filtros actuales.");
            return;
        }

        const originalText = generateDocBtn.innerHTML;
        generateDocBtn.innerHTML = "⏳ Generando...";
        generateDocBtn.disabled = true;

        try {
            const response = await fetch(GOOGLE_SHEETS_URL, {
                method: 'POST',
                body: JSON.stringify({
                    action: 'generate_report',
                    fecha: dateStr,
                    templateId: '1w-hlsupcw25wAjTGX1v0Mcu-bK2Jz65yKbOVavfL2Fk',
                    folderId: '1m94zPHdljqkIewoxRAX9CapIx-mYa6Wj',
                    tableData: tableData
                })
            });
            
            const textResult = await response.text();
            let result;
            try {
                result = JSON.parse(textResult);
            } catch (err) {
                alert("Error en el servidor de Google: " + textResult);
                return;
            }

            if (result.success && result.url) {
                window.open(result.url, '_blank');
            } else {
                alert("Error al generar: " + (result.error || "Asegúrate de haber actualizado google_apps_script.js"));
            }
        } catch (e) {
            console.error(e);
            alert("Fallo de red al conectar con Google. Revisa la consola (F12).");
        } finally {
            generateDocBtn.innerHTML = originalText;
            generateDocBtn.disabled = false;
        }
    });
}
