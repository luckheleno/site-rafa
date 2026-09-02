/* ZR Estética Automotiva — Google Apps Script */
const SPREADSHEET_ID = 'COLE_O_ID_DA_PLANILHA';
const CALENDAR_ID = 'primary'; // prefira o ID de um calendário exclusivo da ZR
// Chave PIX por telefone (formato E.164, com + e DDI).
const PIX_KEY = '+5513997113038';
const PIX_MERCHANT_NAME = 'ZR ESTETICA';
const PIX_MERCHANT_CITY = 'GUARUJA';
const DASHBOARD_TOKEN = 'TROQUE_POR_UM_TOKEN_LONGO_E_ALEATORIO';
const TZ = 'America/Sao_Paulo';
const SERVICES = {
  'Lavagem Premium': 100,
  'Polimento Técnico': 450,
  'Polimento e Vitrificação': 850,
  'Higienização Interna': 220,
  'Insulfilm': 300
};

function setup() {
  const sheet = SpreadsheetApp.openById(SPREADSHEET_ID).getSheetByName('Agendamentos') || SpreadsheetApp.openById(SPREADSHEET_ID).insertSheet('Agendamentos');
  if (sheet.getLastRow() === 0) sheet.appendRow(['ID', 'Criado em', 'Data', 'Hora', 'Cliente', 'WhatsApp', 'Veículo', 'Serviço', 'Valor', 'Pagamento', 'Status PIX', 'Status agenda', 'Evento Google ID']);
  sheet.setFrozenRows(1);
}

function doGet(e) {
  const p = e.parameter || {};
  if (p.action === 'slots') return json_(availableSlots_(p.date));
  if (p.action === 'dashboard') return json_(dashboard_(p.token));
  return json_({ error: 'Ação inválida' });
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
  const base = ['08:00','09:30','11:00','13:30','15:00'];
  const calendar = CalendarApp.getCalendarById(CALENDAR_ID);
  return { slots: base.filter(h => !calendar.getEventsForDay(dateAt_(date, h)).some(ev => !ev.isAllDayEvent() && Utilities.formatDate(ev.getStartTime(), TZ, 'HH:mm') === h)) };
}

function book_(b) {
  ['date','time','name','phone','vehicle','service','payment'].forEach(k => { if (!String(b[k] || '').trim()) throw new Error('Preencha todos os campos obrigatórios.'); });
  if (!SERVICES.hasOwnProperty(b.service)) throw new Error('Serviço inválido.');
  if (!['pix','presencial'].includes(b.payment)) throw new Error('Forma de pagamento inválida.');
  const lock = LockService.getScriptLock(); lock.waitLock(25000);
  try {
    if (!availableSlots_(b.date).slots.includes(b.time)) throw new Error('Este horário não está mais disponível.');
    const start = dateAt_(b.date, b.time), end = new Date(start.getTime() + 90 * 60000);
    const value = SERVICES[b.service], id = Utilities.getUuid();
    const ev = CalendarApp.getCalendarById(CALENDAR_ID).createEvent('ZR — ' + b.service + ' — ' + b.name, start, end, { description: 'Cliente: ' + b.name + '\nWhatsApp: ' + b.phone + '\nVeículo: ' + b.vehicle + '\nValor: R$ ' + value.toFixed(2) + '\nPagamento: ' + b.payment });
    const sheet = SpreadsheetApp.openById(SPREADSHEET_ID).getSheetByName('Agendamentos');
    sheet.appendRow([id, new Date(), b.date, b.time, b.name, b.phone, b.vehicle, b.service, value, b.payment === 'pix' ? 'PIX' : 'Cartão presencial', b.payment === 'pix' ? 'Pendente' : 'Não se aplica', 'Confirmado', ev.getId()]);
    const response = { ok: true, id: id, value: value, message: 'Horário reservado e incluído na agenda da ZR.' };
    if (b.payment === 'pix') response.pix = pixPayload_(value, 'ZR-' + id.slice(0, 12));
    return response;
  } finally { lock.releaseLock(); }
}

function dashboard_(token) {
  if (token !== DASHBOARD_TOKEN) return { error: 'Não autorizado' };
  const rows = SpreadsheetApp.openById(SPREADSHEET_ID).getSheetByName('Agendamentos').getDataRange().getValues().slice(1).reverse();
  const items = rows.map(r => ({ id:r[0], date:Utilities.formatDate(new Date(r[2]), TZ, 'yyyy-MM-dd'), time:r[3], name:r[4], phone:r[5], vehicle:r[6], service:r[7], value:Number(r[8]), payment:r[9], pixStatus:r[10], calendarStatus:r[11] }));
  return { items:items, total:items.reduce((s,x)=>s+x.value,0), pending:items.filter(x=>x.pixStatus==='Pendente').reduce((s,x)=>s+x.value,0) };
}

function setPayment_(b) {
  if (b.token !== DASHBOARD_TOKEN || !b.id || !['Pago','Pendente','Cancelado'].includes(b.status)) throw new Error('Solicitação não autorizada.');
  const sheet = SpreadsheetApp.openById(SPREADSHEET_ID).getSheetByName('Agendamentos'), values = sheet.getRange(2,1,Math.max(sheet.getLastRow()-1,0),1).getValues();
  const index = values.findIndex(r => r[0] === b.id); if (index < 0) throw new Error('Agendamento não encontrado.');
  sheet.getRange(index + 2, 11).setValue(b.status);
  return { ok:true };
}

function dateAt_(date, time) { return new Date(date + 'T' + time + ':00-03:00'); }
function json_(data) { return ContentService.createTextOutput(JSON.stringify(data)).setMimeType(ContentService.MimeType.JSON); }
function tlv_(id, value) { return id + ('0' + value.length).slice(-2) + value; }
function pixPayload_(value, txid) {
  const merchant = tlv_('00','BR.GOV.BCB.PIX') + tlv_('01',PIX_KEY), additional = tlv_('05',txid.replace(/[^A-Za-z0-9]/g,'').slice(0,25));
  const payload = '000201' + tlv_('26',merchant) + '52040000' + '5303986' + tlv_('54',value.toFixed(2)) + '5802BR' + tlv_('59',PIX_MERCHANT_NAME.slice(0,25)) + tlv_('60',PIX_MERCHANT_CITY.slice(0,15)) + tlv_('62',additional) + '6304';
  return payload + crc16_(payload);
}
function crc16_(text) { let crc=0xFFFF; for(let i=0;i<text.length;i++){crc^=text.charCodeAt(i)<<8; for(let j=0;j<8;j++) crc=(crc&0x8000)?((crc<<1)^0x1021):(crc<<1);} return ('0000'+(crc&0xFFFF).toString(16).toUpperCase()).slice(-4); }
