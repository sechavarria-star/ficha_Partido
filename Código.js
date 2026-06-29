// ============================================================
// CUBA Rugby - Ficha de Partido
// ============================================================

var SHEET_NAME = "Fichas";

// ---- Planillas (PDF -> autocompletado) ----
var PLANILLAS_FOLDER_NAME = "Planillas Partido CUBA";
var PROP_FOLDER_ID        = "planillas_folder_id";
var PLANILLAS_SHEET       = "Planillas";   // resumen 1 fila por equipo
var ROSTERS_SHEET         = "Rosters";     // 1 fila por jugador

function doGet() {
  return HtmlService.createHtmlOutputFromFile('Ficha Partido CUBA')
    .setTitle('Ficha de Partido - CUBA Rugby')
    .setXFrameOptionsMode(HtmlService.XFrameOptionsMode.ALLOWALL);
}

function getSheet() {
  var ss    = SpreadsheetApp.getActiveSpreadsheet();
  var sheet = ss.getSheetByName(SHEET_NAME);
  if (!sheet) {
    sheet = ss.insertSheet(SHEET_NAME);
    sheet.appendRow([
      'Partido_ID','Fecha','Rival','Camada','Cancha',
      'Cant_Tiempos','Dur_Tiempo','Periodo','Minuto',
      'Evento','Jugador','Puntos','Equipo','Timestamp'
    ]);
    sheet.getRange(1,1,1,14).setFontWeight('bold');
    sheet.setFrozenRows(1);
  }
  return sheet;
}

function guardarEvento(partidoData, evento) {
  try {
    var sheet = getSheet();
    var id    = partidoData.nPartido
              ? String(partidoData.nPartido)
              : partidoData.rival.replace(/[^a-zA-Z0-9]/g,'_')
                + '_' + String(partidoData.fecha||'').substring(0,10);
    sheet.appendRow([
      id,
      partidoData.fecha,
      partidoData.rival,
      partidoData.camada  || '',
      partidoData.cancha  || '',
      partidoData.cantT   || 2,
      partidoData.durT    || 35,
      evento.periodo,
      evento.minuto,
      evento.tipo,
      evento.jugador,
      evento.pts          || 0,
      evento.equipo       || 'CUBA',
      new Date().toISOString()
    ]);
    return { ok: true };
  } catch(e) {
    return { error: e.message };
  }
}

function borrarEventoSheet(partidoId, eventoIdx) {
  try {
    var sheet = getSheet();
    var data  = sheet.getDataRange().getValues();
    var count = 0;
    for (var i = 1; i < data.length; i++) {
      if (String(data[i][0]) === String(partidoId)) {
        if (count === eventoIdx) { sheet.deleteRow(i + 1); return { ok: true }; }
        count++;
      }
    }
    return { ok: true };
  } catch(e) {
    return { error: e.message };
  }
}

function editarEventoSheet(partidoId, eventoIdx, evento) {
  try {
    var sheet = getSheet();
    var data  = sheet.getDataRange().getValues();
    var count = 0;
    for (var i = 1; i < data.length; i++) {
      if (String(data[i][0]) === String(partidoId)) {
        if (count === eventoIdx) {
          sheet.getRange(i+1, 8, 1, 6).setValues([[
            evento.periodo, evento.minuto, evento.tipo,
            evento.jugador, evento.pts || 0, evento.equipo || 'CUBA'
          ]]);
          return { ok: true };
        }
        count++;
      }
    }
    return { ok: true };
  } catch(e) {
    return { error: e.message };
  }
}

function getPartidoEventos(partidoId) {
  try {
    var sheet = getSheet();
    var data  = sheet.getDataRange().getValues();
    var rows  = [];
    for (var i = 1; i < data.length; i++) {
      if (String(data[i][0]) === String(partidoId)) {
        rows.push({
          periodo: String(data[i][7]),
          minuto:  String(data[i][8]),
          tipo:    String(data[i][9]),
          jugador: String(data[i][10]),
          pts:     Number(data[i][11]),
          equipo:  String(data[i][12] || 'CUBA')
        });
      }
    }
    var props = PropertiesService.getScriptProperties();
    var ts    = props.getProperty('ts_' + partidoId);
    return { ok: true, eventos: rows, startTimestamp: ts ? Number(ts) : null };
  } catch(e) {
    return { error: e.message };
  }
}

function getPartidos() {
  try {
    var sheet    = getSheet();
    var data     = sheet.getDataRange().getValues();
    var seen     = {};
    var partidos = [];
    for (var i = data.length - 1; i >= 1; i--) {
      var id = String(data[i][0]);
      if (!seen[id]) {
        seen[id] = true;
        partidos.push({
          id:     id,
          fecha:  String(data[i][1]).substring(0,10),
          rival:  String(data[i][2]),
          camada: String(data[i][3])
        });
        if (partidos.length >= 10) break;
      }
    }
    return { ok: true, partidos: partidos };
  } catch(e) {
    return { error: e.message };
  }
}

function guardarTimestamp(partidoId, timestamp) {
  try {
    var props = PropertiesService.getScriptProperties();
    props.setProperty('ts_' + partidoId, String(timestamp));
    return { ok: true };
  } catch(e) {
    return { error: e.message };
  }
}

// Guarda el roster (lista de jugadores) de un partido para poder retomarlo.
function guardarRoster(partidoId, jugadores) {
  try {
    if (!partidoId) return { ok: false };
    PropertiesService.getScriptProperties()
      .setProperty('roster_' + partidoId, JSON.stringify(jugadores || []));
    return { ok: true };
  } catch(e) { return { error: e.message }; }
}

// Devuelve el roster de un partido: primero de ScriptProperties; si no, de la
// hoja Rosters (planillas cargadas) por N° de partido.
function getRoster(partidoId) {
  try {
    if (!partidoId) return { ok: true, jugadores: [] };
    var raw = PropertiesService.getScriptProperties().getProperty('roster_' + partidoId);
    if (raw) return { ok: true, jugadores: JSON.parse(raw) };

    var ss  = SpreadsheetApp.getActiveSpreadsheet();
    var ro  = ss.getSheetByName(ROSTERS_SHEET);
    var jug = [];
    if (ro) {
      var data = ro.getDataRange().getValues();
      for (var i = 1; i < data.length; i++) {
        if (String(data[i][0]) === String(partidoId)) {
          jug.push({ num: String(data[i][2]), nom: String(data[i][3]), dni: String(data[i][4]) });
        }
      }
    }
    return { ok: true, jugadores: jug };
  } catch(e) { return { error: e.message }; }
}

function getTimestamp(partidoId) {
  try {
    var props = PropertiesService.getScriptProperties();
    var ts    = props.getProperty('ts_' + partidoId);
    return ts ? Number(ts) : null;
  } catch(e) {
    return null;
  }
}

// ============================================================
// PLANILLAS: carpeta Drive + OCR PDF + parseo + volcado a Sheet
// ============================================================

// Ejecutar UNA vez en el editor para forzar el consentimiento del permiso
// AMPLIO de Drive (getFoldersByName/getFilesByType lo exigen). Si no se corre
// algo que use Drive amplio de forma interactiva, Google nunca muestra ese
// permiso y el web app falla con "No tienes permiso para DriveApp...".
function forzarAutorizacion() {
  DriveApp.getFoldersByName(PLANILLAS_FOLDER_NAME).hasNext(); // lectura Drive
  var tmp = DriveApp.createFolder('___auth_tmp___');          // ESCRITURA Drive
  tmp.setTrashed(true);                                       // y borrado
  SpreadsheetApp.getActiveSpreadsheet().getName();            // Sheets
  return 'Autorizacion OK: Drive (lectura+escritura) + Sheets concedidos';
}

// Carpeta donde el usuario deja los 4 PDFs. Se crea sola la primera vez
// y se cachea su ID en Script Properties.
function getCarpetaPlanillas_() {
  var props = PropertiesService.getScriptProperties();
  var id    = props.getProperty(PROP_FOLDER_ID);
  if (id) {
    try { return DriveApp.getFolderById(id); } catch(e) { /* borrada: recrear */ }
  }
  var it     = DriveApp.getFoldersByName(PLANILLAS_FOLDER_NAME);
  var folder = it.hasNext() ? it.next() : DriveApp.createFolder(PLANILLAS_FOLDER_NAME);
  props.setProperty(PROP_FOLDER_ID, folder.getId());
  return folder;
}

// Devuelve nombre + URL de la carpeta (para mostrar el link en la app).
function getCarpetaInfo() {
  try {
    var f = getCarpetaPlanillas_();
    return { ok: true, url: f.getUrl(), name: f.getName() };
  } catch(e) { return { error: e.message }; }
}

// DEBUG: OCRea el primer PDF de la carpeta y devuelve/loguea el texto crudo,
// para ajustar el parser al formato real del OCR. Ejecutar en el editor.
function debugOCR() {
  var folder = getCarpetaPlanillas_();
  var files  = folder.getFilesByType(MimeType.PDF);
  var out = [];
  while (files.hasNext()) {
    var file = files.next();
    var txt  = pdfToText_(file);
    var p    = parsePlanilla_(txt);
    Logger.log('======== ARCHIVO: ' + file.getName() + ' (len ' + txt.length + ') ========');
    Logger.log('PARSE -> CUBA=' + (p.equipoLetra||'?') + ' nPartido=' + (p.nPartido||'?') +
               ' rival=' + p.rival + ' cancha=' + p.cancha + ' jugadores=' + p.jugadores.length);
    Logger.log('--- TEXTO OCR ---');
    Logger.log(txt);
    out.push(file.getName() + ': CUBA=' + (p.equipoLetra||'?') + ' jug=' + p.jugadores.length);
  }
  return out.join('\n');
}

// Convierte un PDF a texto vía OCR (Drive API -> Google Doc temporal).
function pdfToText_(file) {
  var blob = file.getBlob();
  // Sube el PDF y lo convierte a Google Doc aplicando OCR (convert + ocr).
  // No se setea mimeType destino: si se pone google-apps.document, Drive cree
  // que el archivo ya es un Doc y rechaza el OCR.
  // El OCR de Drive tiene rate limit ("User rate limit exceeded for OCR"):
  // reintentamos con backoff.
  var inserted = null, lastErr = null;
  for (var attempt = 0; attempt < 5; attempt++) {
    try {
      inserted = Drive.Files.insert(
        { title: 'tmp_ocr_' + Date.now() },
        blob,
        { ocr: true, ocrLanguage: 'es', convert: true }
      );
      break;
    } catch (e) {
      lastErr = e;
      if (String(e).toLowerCase().indexOf('rate limit') === -1) throw e;
      Utilities.sleep(8000 * (attempt + 1)); // 8s, 16s, 24s, 32s
    }
  }
  if (!inserted) throw lastErr;
  var text = '';
  try { text = DocumentApp.openById(inserted.id).getBody().getText(); }
  finally { try { Drive.Files.remove(inserted.id); } catch(e) {} }
  return text;
}

function firstNonEmptyLine_(s) {
  var lines = String(s).split('\n');
  for (var i = 0; i < lines.length; i++) { var t = lines[i].trim(); if (t) return t; }
  return '';
}
// Primera línea de equipo entre dos marcadores (startRe..endRe).
function teamBetween_(text, startRe, endRe) {
  var p = text.split(startRe);
  if (p.length < 2) return '';
  var seg = endRe ? p[1].split(endRe)[0] : p[1];
  return firstNonEmptyLine_(seg);
}
function limpiarRival_(s) {
  return String(s).replace(/CUBA\s+[A-D]\b/ig, '').replace(/\s{2,}/g, ' ').trim();
}

// Parsea el texto de una planilla URBA. Maneja CUBA local (izq) o visitante (der).
function parsePlanilla_(text) {
  var res = { nPartido:'', equipoLetra:'', rival:'', fecha:'', hora:'', camada:'', cancha:'', jugadores:[] };

  var mNum = text.match(/partido[^0-9]{0,15}?(\d{4,})/i);
  if (mNum) res.nPartido = mNum[1];

  // Letra CUBA (primer "CUBA X")
  var mCuba = text.match(/\bCUBA\s+([A-D])\b/i);
  if (mCuba) res.equipoLetra = mCuba[1].toUpperCase();

  // Equipos de cada lado del cuadro Local/Visitante
  var localTeam = teamBetween_(text, /Local\s+Puntos/i, /Visitante\s+Puntos/i);
  var visitTeam = teamBetween_(text, /Visitante\s+Puntos/i, null);

  // ¿De qué lado está CUBA? Bloque cuando es inequívoco; título como fallback.
  var cubaEnLocal = /CUBA/i.test(localTeam);
  var cubaEnVisit = /CUBA/i.test(visitTeam);
  var cubaLocal;
  if (cubaEnLocal && !cubaEnVisit)      cubaLocal = true;
  else if (cubaEnVisit && !cubaEnLocal) cubaLocal = false;
  else {
    var mLV = text.match(/equipo\s+(LOCAL|VISITANTE)/i);
    cubaLocal = mLV ? /LOCAL/i.test(mLV[1]) : true;
  }
  res.cancha = cubaLocal ? 'Local' : 'Visitante';

  // Rival = equipo del lado opuesto (limpiando "CUBA X" por si el OCR mergeó)
  var rival = limpiarRival_(cubaLocal ? visitTeam : localTeam);
  if (!rival) rival = limpiarRival_(cubaLocal ? localTeam : visitTeam);
  res.rival = rival;

  var mFecha = text.match(/(\d{4}-\d{2}-\d{2})/);
  if (mFecha) res.fecha = mFecha[1];
  var mHora = text.match(/\d{4}-\d{2}-\d{2}\s+(\d{1,2}:\d{2})/);
  if (mHora) res.hora = mHora[1];

  var mCam = text.match(/Menores de\s+(\d{2})/i);
  if (mCam) res.camada = 'M' + mCam[1];

  // Roster: "<dorsal>  Apellido, Nombre  <DNI>"
  var flat = text.replace(/\r/g, ' ').replace(/\n/g, ' ');
  var re = /(\d{1,2})\s+(?:✖\s*)?([A-Za-zÀ-ſ'’.\-]+(?:\s+[A-Za-zÀ-ſ'’.\-]+)*\s*,\s*[A-Za-zÀ-ſ'’.\-]+(?:\s+[A-Za-zÀ-ſ'’.\-]+)*)\s+(\d{6,9})/g;
  var m, seen = {};
  while ((m = re.exec(flat)) !== null) {
    var dni = m[3];
    if (seen[dni]) continue;
    seen[dni] = true;
    res.jugadores.push({
      num: (m[1].replace(/^0+/, '') || '0'),
      nom: m[2].replace(/\s+/g, ' ').trim(),
      dni: dni
    });
  }
  return res;
}

// Configura la Edge Function de Supabase (ejecutar UNA vez en el editor con
// tus valores). Las claves quedan en ScriptProperties, NO en el código/repo.
function configSupabase(fnUrl, anonKey) {
  var props = PropertiesService.getScriptProperties();
  if (fnUrl)   props.setProperty('SUPABASE_FN_URL', fnUrl);
  if (anonKey) props.setProperty('SUPABASE_ANON_KEY', anonKey);
  return 'Supabase configurado: ' + (props.getProperty('SUPABASE_FN_URL') || '(sin url)');
}

// Lee todos los PDF de la carpeta, los parsea y devuelve los equipos (A..D).
// Camino rápido: Edge Function de Supabase (extrae texto SIN OCR, en paralelo,
// ~segundos). Si no está configurada, cae al OCR de Drive (lento).
function cargarPlanillas() {
  try {
    var props   = PropertiesService.getScriptProperties();
    var fnUrl   = props.getProperty('SUPABASE_FN_URL');
    var anon    = props.getProperty('SUPABASE_ANON_KEY');
    var folder  = getCarpetaPlanillas_();
    var files   = folder.getFilesByType(MimeType.PDF);
    var equipos = {};
    var errores = [];

    if (fnUrl && anon) {
      // --- Edge Function (rápido, en paralelo) ---
      var reqs = [], names = [];
      while (files.hasNext()) {
        var f = files.next();
        names.push(f.getName());
        reqs.push({
          url: fnUrl, method: 'post', contentType: 'application/pdf',
          headers: { 'Authorization': 'Bearer ' + anon, 'apikey': anon },
          payload: f.getBlob().getBytes(), muteHttpExceptions: true
        });
      }
      var resps = UrlFetchApp.fetchAll(reqs);
      for (var i = 0; i < resps.length; i++) {
        try {
          var parsed = JSON.parse(resps[i].getContentText());
          if (parsed.equipoLetra && parsed.jugadores && parsed.jugadores.length) {
            parsed.archivo = names[i];
            equipos[parsed.equipoLetra] = parsed;
          } else {
            errores.push(names[i] + ': CUBA=' + (parsed.equipoLetra||'?') +
                         ' jug=' + ((parsed.jugadores||[]).length) +
                         (parsed.error ? ' err=' + parsed.error : ''));
          }
        } catch(e) { errores.push(names[i] + ': ' + e.message); }
      }
    } else {
      // --- Fallback OCR de Drive (lento, con espaciado por rate limit) ---
      var idx = 0;
      while (files.hasNext()) {
        var file = files.next();
        if (idx > 0) Utilities.sleep(6000);
        idx++;
        try {
          var p2 = parsePlanilla_(pdfToText_(file));
          if (p2.equipoLetra && p2.jugadores.length) {
            p2.archivo = file.getName();
            equipos[p2.equipoLetra] = p2;
          } else {
            errores.push(file.getName() + ': CUBA=' + (p2.equipoLetra||'?') +
                         ' jugadores=' + p2.jugadores.length + ' nPartido=' + (p2.nPartido||'?'));
          }
        } catch(e) { errores.push(file.getName() + ': ' + e.message); }
      }
    }

    var out = [];
    ['A','B','C','D'].forEach(function(L){ if (equipos[L]) out.push(equipos[L]); });
    if (out.length) volcarPlanillas_(out);
    return { ok: true, equipos: out, errores: errores };
  } catch(e) { return { error: e.message }; }
}

// Vuelca a las hojas Planillas (resumen) y Rosters (1 fila/jugador),
// haciendo upsert por N° de partido.
function volcarPlanillas_(equipos) {
  var ss = SpreadsheetApp.getActiveSpreadsheet();

  var pl = ss.getSheetByName(PLANILLAS_SHEET);
  if (!pl) {
    pl = ss.insertSheet(PLANILLAS_SHEET);
    pl.appendRow(['N_Partido','Equipo','Rival','Fecha','Hora','Camada','Cancha','Cant_Jugadores','Archivo','Timestamp']);
    pl.getRange(1,1,1,10).setFontWeight('bold'); pl.setFrozenRows(1);
  }
  var ro = ss.getSheetByName(ROSTERS_SHEET);
  if (!ro) {
    ro = ss.insertSheet(ROSTERS_SHEET);
    ro.appendRow(['N_Partido','Equipo','Dorsal','Jugador','DNI','Timestamp']);
    ro.getRange(1,1,1,6).setFontWeight('bold'); ro.setFrozenRows(1);
  }

  var ids = {};
  equipos.forEach(function(e){ ids[String(e.nPartido)] = true; });
  deleteRowsByKey_(pl, 0, ids);   // col A = N_Partido
  deleteRowsByKey_(ro, 0, ids);

  var now = new Date().toISOString();
  equipos.forEach(function(e){
    pl.appendRow([e.nPartido, 'CUBA '+e.equipoLetra, e.rival, e.fecha, e.hora, e.camada, e.cancha, e.jugadores.length, e.archivo||'', now]);
    e.jugadores.forEach(function(j){
      ro.appendRow([e.nPartido, 'CUBA '+e.equipoLetra, j.num, j.nom, j.dni, now]);
    });
  });
}

// Borra filas cuyo valor en `col` (0-based) está en el set `keys`. Mantiene encabezado.
function deleteRowsByKey_(sheet, col, keys) {
  var data = sheet.getDataRange().getValues();
  for (var i = data.length - 1; i >= 1; i--) {
    if (keys[String(data[i][col])]) sheet.deleteRow(i + 1);
  }
}