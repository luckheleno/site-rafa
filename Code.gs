/* ZR Estética Automotiva — Google Apps Script */
const SPREADSHEET_ID = '1lxq0K4VY3d0dVAuMkC9sDpSBMHw3ieRe9bzSPDhg7VI';
const CALENDAR_ID = '6d3ab3c71f9b5bc577ae6011fcabc367d2abee84cb7d90e8d29abd8816fd9557@group.calendar.google.com';
// Chave PIX por telefone (formato E.164, com + e DDI).
const PIX_KEY = '+5513997113038';
const PIX_MERCHANT_NAME = 'ZR ESTETICA';
const PIX_MERCHANT_CITY = 'GUARUJA';
// Código de acesso do proprietário. Guarde-o em local seguro e não o compartilhe.
const DASHBOARD_TOKEN = 'ZR!4c9P#vN7xK2mQ8rT5aL';
const TZ = 'America/Sao_Paulo';
const BASE_SLOTS = ['08:00','09:30','11:00','13:30','15:00'];
const SERVICES = {
  'Lavagem Premium': 100,
  'Polimento Técnico': 450,
  'Polimento e Vitrificação': 850,
  'Higienização Interna': 220,
  'Insulfilm': 300
};

function setup() {
  const ss = SpreadsheetApp.openById(SPREADSHEET_ID);
  const sheet = ss.getSheetByName('Agendamentos') || ss.insertSheet('Agendamentos');
  if (sheet.getLastRow() === 0) sheet.appendRow(['ID', 'Criado em', 'Data', 'Hora', 'Cliente', 'WhatsApp', 'Veículo', 'Serviço', 'Valor', 'Pagamento', 'Status PIX', 'Status agenda', 'Evento Google ID']);
  formatSheet_(sheet);
}
function formatAllTables() {
  SpreadsheetApp.openById(SPREADSHEET_ID).getSheets().forEach(formatSheet_);
}

function doGet(e) {
  const p = e.parameter || {};
  try {
    let data;
    if (p.action === 'slots') data = availableSlots_(p.date);
    else if (p.action === 'availability') data = availability_(p.dates);
    else if (p.action === 'book') data = book_(p);
    else if (p.action === 'cancel') data = cancel_(p);
    else if (p.action === 'dashboard') data = dashboard_(p.token);
    else if (p.action === 'bootstrap') data = bootstrap_(p.token);
    else if (p.action === 'tables') data = tables_(p.token);
    else if (p.action === 'tableData') data = tableData_(p.token, p.sheet);
    else if (p.action === 'createTable') data = createTable_(p);
    else if (p.action === 'renameTable') data = renameTable_(p);
    else if (p.action === 'saveTable') data = saveTable_(p);
    else if (p.action === 'deleteTable') data = deleteTable_(p);
    // JSONP permite que o painel estático consulte o Apps Script sem bloqueio de CORS.
    else if (p.action === 'payment') data = setPayment_(p);
    else if (p.action === 'bulkUpdate') data = bulkUpdate_(p);
    else data = { error: 'Ação inválida' };
    return json_(data, p.callback);
  } catch (err) { return json_({ error: err.message || 'Não foi possível processar.' }, p.callback); }
}

function doPost(e) {
  try {
    const body = JSON.parse(e.postData.contents || '{}');
    if (body.action === 'book') return json_(book_(body));
    if (body.action === 'payment') return json_(setPayment_(body));
    return json_({ error: 'Ação inválida' });
  } catch (err) { return json_({ error: err.message || 'Não foi possível processar.' }); }
}

function availableSlots_(date) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date || '')) throw new Error('Data inválida');
  const cacheKey = 'zr_slots_' + date, cache = CacheService.getScriptCache(), cached = cache.get(cacheKey);
  if (cached) return JSON.parse(cached);
  const calendar = CalendarApp.getCalendarById(CALENDAR_ID);
  if (!calendar) throw new Error('Calendário não encontrado.');
  const day = dayAt_(date);
  const events = calendar.getEventsForDay(day);
  const result = { slots: BASE_SLOTS.map(time => ({
    time: time,
    occupied: events.some(ev => !ev.isAllDayEvent() && Utilities.formatDate(ev.getStartTime(), TZ, 'HH:mm') === time)
  })) };
  cache.put(cacheKey, JSON.stringify(result), 30);
  return result;
}
function availability_(datesParam) {
  const dates = String(datesParam || '').split(',').filter((date, index, list) =>
    /^\d{4}-\d{2}-\d{2}$/.test(date) && list.indexOf(date) === index
  ).slice(0, 31).sort();
  if (!dates.length) throw new Error('Nenhuma data válida foi informada.');
  const version = PropertiesService.getScriptProperties().getProperty('zrAvailabilityVersion') || '0';
  const cache = CacheService.getScriptCache(), key = 'zr_availability_' + version + '_' + dates.join('_'), cached = cache.get(key);
  if (cached) return JSON.parse(cached);
  const calendar = CalendarApp.getCalendarById(CALENDAR_ID);
  if (!calendar) throw new Error('Calendário não encontrado.');
  const start = dateAt_(dates[0], '00:00'), end = dateAt_(dates[dates.length - 1], '00:00');
  end.setDate(end.getDate() + 1);
  const busy = {};
  dates.forEach(date => busy[date] = {});
  calendar.getEvents(start, end).forEach(event => {
    if (event.isAllDayEvent()) return;
    const date = Utilities.formatDate(event.getStartTime(), TZ, 'yyyy-MM-dd');
    const time = Utilities.formatDate(event.getStartTime(), TZ, 'HH:mm');
    if (busy[date]) busy[date][time] = true;
  });
  const days = {};
  dates.forEach(date => {
    const slots = BASE_SLOTS.map(time => ({ time: time, occupied: Boolean(busy[date][time]) }));
    days[date] = slots;
    cache.put('zr_slots_' + date, JSON.stringify({ slots: slots }), 30);
  });
  const result = { days: days };
  cache.put(key, JSON.stringify(result), 30);
  return result;
}

function cleanBooking_(input) {
  const data = {
    date: String(input.date || '').trim(), time: String(input.time || '').trim(),
    name: String(input.name || '').replace(/\s+/g, ' ').trim(),
    phone: String(input.phone || '').replace(/\D/g, ''),
    vehicle: String(input.vehicle || '').replace(/\s+/g, ' ').trim(),
    service: String(input.service || '').trim(), payment: String(input.payment || '').trim()
  };
  if (!/^\d{4}-\d{2}-\d{2}$/.test(data.date) || !BASE_SLOTS.includes(data.time)) throw new Error('Data ou horário inválido.');
  if (!data.name || data.name.length > 80 || !data.vehicle || data.vehicle.length > 100) throw new Error('Preencha nome e veículo corretamente.');
  if (data.phone.length < 10 || data.phone.length > 13) throw new Error('Informe um WhatsApp válido com DDD.');
  if (!SERVICES.hasOwnProperty(data.service)) throw new Error('Serviço inválido.');
  if (!['pix','presencial'].includes(data.payment)) throw new Error('Forma de pagamento inválida.');
  if (dateAt_(data.date, data.time).getTime() < Date.now() + 5 * 60000) throw new Error('Escolha um horário futuro disponível.');
  return data;
}

function book_(b) {
  const data = cleanBooking_(b);
  const throttle = CacheService.getScriptCache(), throttleKey = 'zr_booking_phone_' + data.phone;
  if (throttle.get(throttleKey)) throw new Error('Aguarde alguns segundos antes de fazer outra reserva.');
  const lock = LockService.getScriptLock(); lock.waitLock(25000);
  try {
    if (availableSlots_(data.date).slots.some(slot => slot.time === data.time && slot.occupied)) throw new Error('Este horário não está mais disponível.');
    const start = dateAt_(data.date, data.time), end = new Date(start.getTime() + 90 * 60000);
    const value = SERVICES[data.service], id = Utilities.getUuid();
    const ev = CalendarApp.getCalendarById(CALENDAR_ID).createEvent('ZR — ' + data.service + ' — ' + data.name, start, end, { description: 'Cliente: ' + data.name + '\nWhatsApp: ' + data.phone + '\nVeículo: ' + data.vehicle + '\nValor: R$ ' + value.toFixed(2) + '\nPagamento: ' + data.payment });
    const sheet = SpreadsheetApp.openById(SPREADSHEET_ID).getSheetByName('Agendamentos');
    sheet.appendRow([id, new Date(), data.date, data.time, data.name, data.phone, data.vehicle, data.service, value, data.payment === 'pix' ? 'PIX' : 'Cartão presencial', data.payment === 'pix' ? 'Pendente' : 'Não se aplica', 'Confirmado', ev.getId()]);
    // Impede que o Sheets transforme data e hora em números/datas internas.
    const row = sheet.getLastRow();
    sheet.getRange(row, 3, 1, 2).setNumberFormat('@').setValues([[data.date, data.time]]);
    clearDataCache_();
    throttle.put(throttleKey, '1', 45);
    CacheService.getScriptCache().remove('zr_slots_' + data.date);
    bumpAvailabilityVersion_();
    const response = { ok: true, id: id, value: value, message: 'Horário reservado e incluído na agenda da ZR.' };
    if (data.payment === 'pix') {
      response.pix = pixPayload_(value, 'ZR-' + id.slice(0, 12));
    }
    return response;
  } finally { lock.releaseLock(); }
}

function dashboard_(token) {
  if (token !== DASHBOARD_TOKEN) return { error: 'Não autorizado' };
  return cachedData_('zr_dashboard', 20, () => dashboardData_());
}
function dashboardData_(spreadsheet) {
  const ss = spreadsheet || SpreadsheetApp.openById(SPREADSHEET_ID);
  const sheet = ss.getSheetByName('Agendamentos');
  const lastRow = sheet.getLastRow();
  const rows = lastRow > 1 ? sheet.getRange(2, 1, lastRow - 1, 13).getValues().reverse() : [];
  const items = rows.map(r => {
    return {
      id: r[0],
      // Datas/horas do Sheets são números UTC; não aplique o fuso histórico de 1899.
      date: sheetDate_(r[2]),
      time: sheetTime_(r[3]),
      name: r[4], phone: r[5], vehicle: r[6], service: r[7], value: Number(r[8]),
      payment: r[9], pixStatus: r[10], calendarStatus: r[11]
    };
  });
  return { items:items, total:items.reduce((s,x)=>s+x.value,0), pending:items.filter(x=>x.pixStatus==='Pendente').reduce((s,x)=>s+x.value,0) };
}
function bootstrap_(token) {
  requireToken_(token);
  return cachedData_('zr_bootstrap', 20, () => {
    const ss = SpreadsheetApp.openById(SPREADSHEET_ID);
    return { dashboard: dashboardData_(ss), tables: tablesData_(ss) };
  });
}

function setPayment_(b) {
  if (b.token !== DASHBOARD_TOKEN || !b.id || !['Pago','Pendente','Cancelado'].includes(b.status)) throw new Error('Solicitação não autorizada.');
  const sheet = SpreadsheetApp.openById(SPREADSHEET_ID).getSheetByName('Agendamentos'), values = sheet.getRange(2,1,Math.max(sheet.getLastRow()-1,0),1).getValues();
  const index = values.findIndex(r => r[0] === b.id); if (index < 0) throw new Error('Agendamento não encontrado.');
  sheet.getRange(index + 2, 11).setValue(b.status);
  clearDataCache_();
  return { ok:true };
}

function cancel_(b) {
  if (b.token !== DASHBOARD_TOKEN || !b.id) throw new Error('Solicitação não autorizada.');
  const sheet = SpreadsheetApp.openById(SPREADSHEET_ID).getSheetByName('Agendamentos');
  const values = sheet.getRange(2, 1, Math.max(sheet.getLastRow() - 1, 0), 13).getValues();
  const index = values.findIndex(row => row[0] === b.id);
  if (index < 0) throw new Error('Agendamento não encontrado.');
  const eventId = values[index][12];
  if (eventId) {
    const calendar = CalendarApp.getCalendarById(CALENDAR_ID);
    const event = calendar && calendar.getEventById(eventId);
    if (event) event.deleteEvent();
  }
  sheet.deleteRow(index + 2);
  clearDataCache_();
  bumpAvailabilityVersion_();
  return { ok: true };
}
function bulkUpdate_(p) {
  requireToken_(p.token);
  const changes = JSON.parse(p.changes || '[]');
  if (!Array.isArray(changes) || !changes.length) throw new Error('Nenhuma alteração para salvar.');
  if (changes.length > 100) throw new Error('Limite de 100 alterações por vez.');
  const sheet = SpreadsheetApp.openById(SPREADSHEET_ID).getSheetByName('Agendamentos');
  const rows = sheet.getRange(2, 1, Math.max(sheet.getLastRow() - 1, 0), 13).getValues();
  const rowById = {};
  rows.forEach((row, index) => rowById[String(row[0])] = { row: row, index: index });
  const calendar = CalendarApp.getCalendarById(CALENDAR_ID);
  const toDelete = [], result = { paid: 0, cancelled: 0, skipped: 0 };
  const paidRows = [];
  changes.forEach(change => {
    const found = rowById[String(change.id)];
    if (!found) { result.skipped++; return; }
    if (change.type === 'paid') {
      paidRows.push('K' + (found.index + 2));
      result.paid++;
    } else if (change.type === 'cancel') {
      const eventId = found.row[12], event = eventId && calendar && calendar.getEventById(eventId);
      if (event) event.deleteEvent();
      toDelete.push(found.index + 2);
      result.cancelled++;
    } else result.skipped++;
  });
  if (paidRows.length) sheet.getRangeList(paidRows).setValue('Pago');
  toDelete.sort((a, b) => b - a).forEach(row => sheet.deleteRow(row));
  clearDataCache_();
  bumpAvailabilityVersion_();
  return { ok: true, result: result };
}

function tables_(token) {
  requireToken_(token);
  return cachedData_('zr_tables', 60, () => tablesData_());
}
function tablesData_(spreadsheet) {
  const ss = spreadsheet || SpreadsheetApp.openById(SPREADSHEET_ID);
  return { sheets: ss.getSheets().map(sheet => {
    const size = tableSize_(sheet);
    return { name: sheet.getName(), rows: Math.max(0, size.rows - 1), columns: size.columns };
  }) };
}
function tableData_(token, name) {
  requireToken_(token);
  const sheet = getTable_(name), size = tableSize_(sheet), rows = size.rows, columns = size.columns;
  return { name: sheet.getName(), values: sheet.getRange(1, 1, rows, columns).getDisplayValues() };
}
function createTable_(p) {
  requireToken_(p.token);
  const name = String(p.name || '').trim();
  // Mantido simples para evitar erro de sintaxe ao copiar/colar no Apps Script.
  if (!name || name.length > 80) throw new Error('Informe um nome de tabela com até 80 caracteres.');
  const ss = SpreadsheetApp.openById(SPREADSHEET_ID);
  if (ss.getSheetByName(name)) throw new Error('Já existe uma tabela com esse nome.');
  const newSheet = ss.insertSheet(name), columns = Math.max(1, Math.min(26, Number(p.columns) || 3)), rows = Math.max(2, Math.min(1000, Number(p.rows) || 5));
  const values = Array.from({ length: rows }, (_, row) => Array.from({ length: columns }, (_, col) => row === 0 ? 'Coluna ' + (col + 1) : ''));
  newSheet.getRange(1, 1, rows, columns).setValues(values);
  formatSheet_(newSheet);
  setTableSize_(newSheet, rows, columns);
  clearDataCache_();
  return { ok: true, name: newSheet.getName() };
}
function renameTable_(p) {
  requireToken_(p.token);
  const sheet = getTable_(p.sheet), name = String(p.name || '').trim();
  // Mantido simples para evitar erro de sintaxe ao copiar/colar no Apps Script.
  if (!name || name.length > 80) throw new Error('Informe um nome de tabela com até 80 caracteres.');
  if (sheet.getName() === 'Agendamentos') throw new Error('A tabela Agendamentos é usada pela agenda e não pode ser renomeada.');
  sheet.setName(name); clearDataCache_(); return { ok: true, name: name };
}
function saveTable_(p) {
  requireToken_(p.token);
  const sheet = getTable_(p.sheet), values = JSON.parse(p.values || '[]');
  if (sheet.getName() === 'Agendamentos') {
    throw new Error('A tabela Agendamentos é gerenciada pelo sistema e não pode ser alterada pelo editor.');
  }
  if (!Array.isArray(values) || !values.length || !Array.isArray(values[0])) throw new Error('Tabela inválida.');
  const rows = Math.min(1000, values.length), columns = Math.min(50, values[0].length);
  const clean = values.slice(0, rows).map(row => Array.from({ length: columns }, (_, i) => String(row[i] ?? '')));
  sheet.clearContents(); sheet.getRange(1, 1, rows, columns).setValues(clean); formatSheet_(sheet);
  setTableSize_(sheet, rows, columns);
  clearDataCache_();
  return { ok: true };
}
function deleteTable_(p) {
  requireToken_(p.token);
  const ss = SpreadsheetApp.openById(SPREADSHEET_ID), sheet = getTable_(p.sheet);
  if (sheet.getName() === 'Agendamentos') throw new Error('A tabela Agendamentos é usada pela agenda e não pode ser apagada.');
  if (ss.getSheets().length <= 1) throw new Error('Sua planilha precisa ter ao menos uma tabela.');
  PropertiesService.getScriptProperties().deleteProperty('zrTableSize_' + sheet.getSheetId());
  ss.deleteSheet(sheet); clearDataCache_(); return { ok: true };
}
function getTable_(name) { const sheet = SpreadsheetApp.openById(SPREADSHEET_ID).getSheetByName(String(name || '')); if (!sheet) throw new Error('Tabela não encontrada.'); return sheet; }
function requireToken_(token) { if (token !== DASHBOARD_TOKEN) throw new Error('Não autorizado.'); }
function cachedData_(key, seconds, build) {
  const cache = CacheService.getScriptCache(), cached = cache.get(key);
  if (cached) return JSON.parse(cached);
  const value = build();
  cache.put(key, JSON.stringify(value), seconds);
  return value;
}
function clearDataCache_() {
  CacheService.getScriptCache().removeAll(['zr_dashboard', 'zr_tables', 'zr_bootstrap']);
}
function bumpAvailabilityVersion_() {
  PropertiesService.getScriptProperties().setProperty('zrAvailabilityVersion', String(Date.now()));
}
function styleTableHeader_(sheet) { formatSheet_(sheet); }
function formatSheet_(sheet) {
  const isBookings = sheet.getName() === 'Agendamentos';
  const size = tableSize_(sheet);
  const rows = Math.max(size.rows, 1), columns = Math.max(size.columns, 1);
  const range = sheet.getRange(1, 1, rows, columns);
  sheet.setHiddenGridlines(true);
  sheet.setFrozenRows(1);
  sheet.setTabColor(isBookings ? '#ef4444' : '#d7b37a');
  sheet.setRowHeight(1, 36);
  range.setVerticalAlignment('middle').setFontFamily('Arial').setFontSize(10);
  sheet.getRange(1, 1, 1, columns).setBackground(isBookings ? '#b91c1c' : '#1f2937').setFontColor('#ffffff').setFontWeight('bold').setHorizontalAlignment('center').setWrap(true);
  if (rows > 1) {
    const data = sheet.getRange(2, 1, rows - 1, columns);
    data.setBackground('#ffffff').setFontColor('#202124').setWrap(true);
    for (let row = 3; row <= rows; row += 2) sheet.getRange(row, 1, 1, columns).setBackground('#f8fafc');
  }
  range.setBorder(true, true, true, true, true, true, '#d7dce3', SpreadsheetApp.BorderStyle.SOLID);
  for (let col = 1; col <= columns; col++) sheet.setColumnWidth(col, isBookings ? bookingColumnWidth_(col) : 150);
  if (isBookings && sheet.getLastRow() > 1 && !sheet.getFilter()) sheet.getRange(1, 1, sheet.getLastRow(), sheet.getLastColumn()).createFilter();
}
function bookingColumnWidth_(column) {
  const widths = [110, 145, 95, 70, 160, 130, 130, 190, 95, 130, 115, 125, 260];
  return widths[column - 1] || 130;
}
function tableSize_(sheet) {
  const key = 'zrTableSize_' + sheet.getSheetId();
  const saved = JSON.parse(PropertiesService.getScriptProperties().getProperty(key) || '{}');
  const defaultRows = sheet.getName() === 'Agendamentos' ? 1 : 5;
  const defaultColumns = sheet.getName() === 'Agendamentos' ? 1 : 3;
  return {
    rows: Math.max(sheet.getLastRow(), Number(saved.rows) || defaultRows, 1),
    columns: Math.max(sheet.getLastColumn(), Number(saved.columns) || defaultColumns, 1)
  };
}
function setTableSize_(sheet, rows, columns) {
  PropertiesService.getScriptProperties().setProperty(
    'zrTableSize_' + sheet.getSheetId(),
    JSON.stringify({ rows: rows, columns: columns })
  );
}

function dayAt_(date) {
  const [year, month, day] = date.split('-').map(Number);
  return new Date(year, month - 1, day, 12, 0, 0);
}
function dateAt_(date, time) {
  return Utilities.parseDate(date + ' ' + time, TZ, 'yyyy-MM-dd HH:mm');
}
function sheetDate_(value) {
  return value instanceof Date ? Utilities.formatDate(value, 'UTC', 'yyyy-MM-dd') : String(value || '').slice(0, 10);
}
function sheetTime_(value) {
  return value instanceof Date ? Utilities.formatDate(value, 'UTC', 'HH:mm') : String(value || '').slice(0, 5);
}
function json_(data, callback) {
  // O ContentService não permite configurar cabeçalhos CORS. Para o dashboard
  // hospedado fora do Apps Script, o callback JSONP é o meio compatível de leitura.
  if (callback && /^[A-Za-z_$][A-Za-z0-9_$]*$/.test(callback)) {
    return ContentService.createTextOutput(callback + '(' + JSON.stringify(data) + ')').setMimeType(ContentService.MimeType.JAVASCRIPT);
  }
  return ContentService.createTextOutput(JSON.stringify(data)).setMimeType(ContentService.MimeType.JSON);
}
function tlv_(id, value) { return id + ('0' + value.length).slice(-2) + value; }
function pixPayload_(value, txid) {
  const merchant = tlv_('00','BR.GOV.BCB.PIX') + tlv_('01',PIX_KEY), additional = tlv_('05',txid.replace(/[^A-Za-z0-9]/g,'').slice(0,25));
  const payload = '000201' + tlv_('26',merchant) + '52040000' + '5303986' + tlv_('54',value.toFixed(2)) + '5802BR' + tlv_('59',PIX_MERCHANT_NAME.slice(0,25)) + tlv_('60',PIX_MERCHANT_CITY.slice(0,15)) + tlv_('62',additional) + '6304';
  return payload + crc16_(payload);
}
function crc16_(text) { let crc=0xFFFF; for(let i=0;i<text.length;i++){crc^=text.charCodeAt(i)<<8; for(let j=0;j<8;j++) crc=(crc&0x8000)?((crc<<1)^0x1021):(crc<<1);} return ('0000'+(crc&0xFFFF).toString(16).toUpperCase()).slice(-4); }
