// =========================================================================================
// GOOGLE APPS SCRIPT v4.0 - HYBRID REAL-TIME + DASHBOARD SUPPORT
// =========================================================================================

// 1. DO GET: PARA EL TABLERO Y APP (LECTURA DE TRES HOJAS)
function doGet(e) {
    try {
        var ss = SpreadsheetApp.getActiveSpreadsheet();

        // Leer Registros
        var sheetRegistros = ss.getSheetByName("Registros") || ss.getSheets()[0];
        var dataRegistros = sheetRegistros.getDataRange().getValues();

        // Leer Incidencias
        var sheetIncidencias = ss.getSheetByName("Incidencias");
        var dataIncidencias = [];
        if (sheetIncidencias) {
            dataIncidencias = sheetIncidencias.getDataRange().getValues();
        }

        // Leer Configuración (Listas Dinámicas)
        var sheetConfig = ss.getSheetByName("Configuracion");
        var configData = { lugares: [], protestas: [] };

        if (sheetConfig) {
            var lastRow = sheetConfig.getLastRow();
            if (lastRow > 1) {
                // Asumimos Col A: Lugares, Col B: Protestas
                // Empezamos fila 2 para saltar encabezados
                var range = sheetConfig.getRange(2, 1, lastRow - 1, 2).getValues();

                // Filtrar vacíos
                configData.lugares = range.map(r => r[0]).filter(x => x);
                configData.protestas = range.map(r => r[1]).filter(x => x);
            }
        }

        var response = {
            registros: dataRegistros,
            incidencias: dataIncidencias,
            config: configData
        };

        return ContentService.createTextOutput(JSON.stringify(response))
            .setMimeType(ContentService.MimeType.JSON);
    } catch (e) {
        return ContentService.createTextOutput(JSON.stringify({ error: e.toString() }))
            .setMimeType(ContentService.MimeType.JSON);
    }
}

// 2. DO POST: PARA LA APP (ESCRITURA EN TIEMPO REAL Y CONFIG)
function doPost(e) {
    var lock = LockService.getScriptLock();
    lock.tryLock(30000);

    try {
        var ss = SpreadsheetApp.getActiveSpreadsheet();
        var data = JSON.parse(e.postData.contents);
        var action = data.action || 'full_upload';

        var sheetRegistros = ss.getSheetByName("Registros") || ss.getSheets()[0];
        var sheetIncidencias = getOrCreateSheet(ss, "Incidencias");
        var sheetConfig = getOrCreateConfigSheet(ss); // Auto-crear si no existe

        // Indices clave para buscar y actualizar filas
        var headers = sheetRegistros.getRange(1, 1, 1, sheetRegistros.getLastColumn()).getValues()[0];
        var headerMap = {};
        for (var i = 0; i < headers.length; i++) {
            headerMap[headers[i].toString().toLowerCase().trim()] = i + 1;
        }

        function getColIndex(namesArray) {
            for (var name of namesArray) {
                var key = name.toLowerCase();
                if (headerMap[key]) return headerMap[key];
            }
            return -1;
        }

        var idxSession = getColIndex(["SessionID", "ID", "ID Supervision"]);
        var idxFin = getColIndex(["Fin", "Hora Fin"]);
        var idxDuracion = getColIndex(["Duracion", "Duración"]);
        var idxObs = getColIndex(["Observaciones", "Obs"]);

        // --- ACCIÓN: AGREGAR ITEM A LISTA (NUEVO) ---
        if (action === 'add_list_item') {
            // data.type: 'lugar' o 'protesta'
            // data.value: 'Nombre del lugar'
            var val = data.value;
            if (val) {
                if (data.type === 'lugar') {
                    // Columna A (1). Buscamos primera fila vacía en A
                    var lastRowA = getLastRowInColumn(sheetConfig, 1);
                    sheetConfig.getRange(lastRowA + 1, 1).setValue(val);
                } else if (data.type === 'protesta') {
                    // Columna B (2)
                    var lastRowB = getLastRowInColumn(sheetConfig, 2);
                    sheetConfig.getRange(lastRowB + 1, 2).setValue(val);
                }
            }
        }

        // --- ACCIÓN: INICIO (O FULL UPLOAD VIEJO) ---
        else if (action === 'start' || action === 'full_upload') {
            var mainFileUrl = "";
            if (data.mediaData) {
                mainFileUrl = saveToDrive(data.mediaData, data.mediaType, data.archivo);
            }

            // Creamos la fila inicial
            var newRow = [
                data.fecha,
                data.tipo_registro,
                data.turno,
                data.oficina,
                data.supervisor,
                data.nombre_protesta,
                data.categoria,
                data.punto,
                data.inicio,
                data.fin || "",
                data.lat_inicio,
                data.lng_inicio,
                data.lat_fin || "",
                data.lng_fin || "",
                data.duracion || "",
                data.fin_de_semana,
                mainFileUrl,
                data.observaciones,
                data.sessionId
            ];

            sheetRegistros.appendRow(newRow);
        }

        // --- ACCIÓN: NUEVA INCIDENCIA (TIEMPO REAL) ---
        else if (action === 'incident') {
            if (data.new_incident) {
                var inc = data.new_incident;
                var incUrl = "";
                if (inc.mediaData) incUrl = saveToDrive(inc.mediaData, inc.mediaType, inc.fileName);

                sheetIncidencias.appendRow([
                    data.sessionId,
                    data.fecha,
                    data.supervisor,
                    data.oficina,
                    inc.time,
                    inc.description,
                    incUrl,
                    "", // H: Foto (Vacia, el link va en G)
                    inc.lat || "", // I: Latitud
                    inc.lng || ""  // J: Longitud
                ]);
            }
        }

        // --- ACCIÓN: FINALIZAR (SÓLO ACTUALIZA LA FILA) ---
        else if (action === 'finish') {
            if (idxSession > 0) {
                var rowIndex = findRowBySessionId(sheetRegistros, idxSession, data.sessionId);
                if (rowIndex > 0) {
                    if (idxFin > 0) sheetRegistros.getRange(rowIndex, idxFin).setValue(data.fin);
                    if (idxDuracion > 0) sheetRegistros.getRange(rowIndex, idxDuracion).setValue(data.duracion);
                    if (idxObs > 0 && data.observaciones) sheetRegistros.getRange(rowIndex, idxObs).setValue(data.observaciones);
                }
            }
        }

        // --- ACCIÓN: GENERAR REPORTE DOC ---
        else if (action === 'generate_report') {
            var templateId = data.templateId;
            var folderId = data.folderId;
            var fecha = data.fecha;
            var tableData = data.tableData;

            var folder = DriveApp.getFolderById(folderId);
            var template = DriveApp.getFileById(templateId);
            var newDocFile = template.makeCopy("Reporte de Monitoreo - " + fecha, folder);
            var newDocId = newDocFile.getId();
            var doc = DocumentApp.openById(newDocId);
            var body = doc.getBody();

            body.replaceText("{{fecha_protesta}}", fecha);

            var tables = body.getTables();
            var targetTable = null;
            var targetRowIndex = -1;

            for (var i = 0; i < tables.length; i++) {
                var table = tables[i];
                for (var r = 0; r < table.getNumRows(); r++) {
                    var row = table.getRow(r);
                    if (row.getText().indexOf("{{tabla_ubicacion}}") !== -1) {
                        targetTable = table;
                        targetRowIndex = r;
                        break;
                    }
                }
                if (targetTable) break;
            }

            if (targetTable && targetRowIndex !== -1) {
                var templateRow = targetTable.getRow(targetRowIndex);
                for (var d = 0; d < tableData.length; d++) {
                    var item = tableData[d];
                    var newRow = targetTable.insertTableRow(targetRowIndex + 1 + d, templateRow.copy());
                    newRow.replaceText("{{tabla_ubicacion}}", item.ubicacion || "");
                    newRow.replaceText("{{tabla_medida}}", item.medida || "");
                    newRow.replaceText("{{tabla_actores}}", item.actores || "");
                }
                targetTable.removeRow(targetRowIndex);
            }

            doc.saveAndClose();
            return ContentService.createTextOutput(JSON.stringify({ success: true, url: newDocFile.getUrl() }))
                .setMimeType(ContentService.MimeType.JSON);
        }

        return ContentService.createTextOutput("Success").setMimeType(ContentService.MimeType.TEXT);

    } catch (e) {
        return ContentService.createTextOutput("Error: " + e.toString()).setMimeType(ContentService.MimeType.TEXT);
    } finally {
        lock.releaseLock();
    }
}

// --- HELPERS ---
function findRowBySessionId(sheet, colIndex, sessionId) {
    var lastRow = sheet.getLastRow();
    if (lastRow < 2) return -1;
    var ids = sheet.getRange(2, colIndex, lastRow - 1, 1).getValues();
    for (var i = 0; i < ids.length; i++) {
        if (ids[i][0] == sessionId) {
            return i + 2;
        }
    }
    return -1;
}

function getOrCreateSheet(ss, name) {
    var sheet = ss.getSheetByName(name);
    if (!sheet) {
        sheet = ss.insertSheet(name);
        sheet.appendRow(["ID Supervision", "Fecha", "Supervisor", "Oficina", "Hora Incidencia", "Descripción", "Foto Evidencia"]);
    }
    return sheet;
}

function getOrCreateConfigSheet(ss) {
    var sheet = ss.getSheetByName("Configuracion");
    if (!sheet) {
        sheet = ss.insertSheet("Configuracion");
        sheet.appendRow(["Lugares Movilización", "Nombres Protestas"]); // Headers
        // Datos por defecto para que no salga vacío la primera vez
        sheet.appendRow(["Plaza San Martín", "Marcha Nacional"]);
        sheet.appendRow(["Plaza Dos de Mayo", "Protesta Genérica"]);
    }
    return sheet;
}

function getLastRowInColumn(sheet, col) {
    var lastRow = sheet.getLastRow();
    if (lastRow === 0) return 0;
    var range = sheet.getRange(1, col, lastRow, 1).getValues();
    for (var i = range.length - 1; i >= 0; i--) {
        if (range[i][0] !== "") {
            return i + 1;
        }
    }
    return 0;
}

function saveToDrive(base64Data, mimeType, fileName) {
    try {
        if (!base64Data) return "";
        var decoded = Utilities.base64Decode(base64Data);
        var blob = Utilities.newBlob(decoded, mimeType, fileName);
        var folders = DriveApp.getFoldersByName("EVIDENCIA");
        var folder = folders.hasNext() ? folders.next() : DriveApp.createFolder("EVIDENCIA");
        var file = folder.createFile(blob);
        file.setSharing(DriveApp.Access.ANYONE_WITH_LINK, DriveApp.Permission.VIEW);
        return file.getUrl();
    } catch (err) {
        return "Error: " + err.toString();
    }
}
