// ============================================================
//  REBOMS — Google Apps Script Backend  (v2)
//  วางไฟล์นี้ใน Google Apps Script แล้ว Deploy เป็น Web App
//  Execute as: Me | Access: Anyone
// ============================================================

// ── CONFIG ────────────────────────────────────────────────────
const SPREADSHEET_ID  = '1VGlF1S1jibVzUEU8J_O84G9o1N0lkBWTfIPANNfZPXQ';
const DRIVE_FOLDER_ID = '1meSkKAKj1sj8_5u6aMTZR1MISbSIv9Mf';

// ── เรียก function นี้ 1 ครั้งเพื่อเพิ่มคอลัมน์ที่ขาดใน Properties sheet ─────
function addMissingColumns() {
  const ss = SpreadsheetApp.openById(SPREADSHEET_ID);
  const sh = ss.getSheetByName(S.PROPERTIES);
  const headers = sh.getRange(1, 1, 1, sh.getLastColumn()).getValues()[0];

  // คอลัมน์ที่ต้องการทั้งหมด ตามลำดับใหม่
  const required = [
    'id','property_code','title','property_type','property_subtype',
    'province','district','village_project','zone','nearby_places',
    'sale_price','appraisal_price','min_acceptable_price',
    'commission_rate','commission_amount','transfer_fee_condition',
    'bedrooms','bathrooms','area','floor',
    'status','agent_name','owner_id',
    'highlights','drawbacks','structure','internal_note',
    'images','property_details','marketing_data','created_at'
  ];

  required.forEach(col => {
    if (!headers.includes(col)) {
      const nextCol = sh.getLastColumn() + 1;
      sh.getRange(1, nextCol).setValue(col);
      Logger.log('เพิ่มคอลัมน์: ' + col);
    }
  });
  Logger.log('เสร็จสิ้น — คอลัมน์ครบแล้ว');
}

// ── Sheet names ───────────────────────────────────────────────
const S = {
  CUSTOMERS    : 'Customers',
  PROPERTIES   : 'Properties',
  DEALS        : 'Deals',
  APPOINTMENTS : 'Appointments',
  COMMISSIONS  : 'Commissions',
  FOLLOWUPS    : 'Followups',
  ZONES        : 'Zones',
  AGENTS       : 'Agents',
  OWNERS       : 'Owners',
};

// ── Response helpers ──────────────────────────────────────────
// Apps Script Web App จัดการ CORS อัตโนมัติเมื่อ Deploy เป็น "Anyone"
// ContentService.TextOutput ไม่รองรับ addHeader
function ok(data)  { return ContentService.createTextOutput(JSON.stringify({ ok:true, data })).setMimeType(ContentService.MimeType.JSON); }
function err(msg)  { return ContentService.createTextOutput(JSON.stringify({ ok:false, error: String(msg) })).setMimeType(ContentService.MimeType.JSON); }

// ── Router ────────────────────────────────────────────────────
function doGet(e) {
  try {
    const a = (e.parameter && e.parameter.action) || '';
    if (a === 'dashboard')          return ok(getDashboard());
    if (a === 'getCustomers')       return ok(getAll(S.CUSTOMERS));
    if (a === 'getCustomerFull')    return ok(getCustomerFull(e.parameter.id));
    if (a === 'getProperties')      return ok(getAll(S.PROPERTIES));
    if (a === 'getPropertyFull')    return ok(getPropertyFull(e.parameter.id));
    if (a === 'getDeals')           return ok(getAll(S.DEALS));
    if (a === 'getDealFull')        return ok(getDealFull(e.parameter.id));
    if (a === 'getAppointments')    return ok(getAll(S.APPOINTMENTS));
    if (a === 'getCommissions')     return ok(getAll(S.COMMISSIONS));
    if (a === 'getAgents')          return ok(getAll(S.AGENTS));
    if (a === 'getZones')           return ok(getZonesWithCount());
    if (a === 'getOwners')          return ok(getAll(S.OWNERS));
    if (a === 'matchProperties')    return ok(matchProperties(e.parameter.customerId));
    if (a === 'getReportsCommissions') return ok(getReportsCommissions());
    return err('unknown action: ' + a);
  } catch(ex) { return err(ex.message + '\n' + ex.stack); }
}

function doPost(e) {
  try {
    const body = JSON.parse(e.postData.contents);
    const a = body.action || '';
    // Customers
    if (a === 'createCustomer')       return ok(createRow(S.CUSTOMERS, body.data));
    if (a === 'updateCustomer')       return ok(updateRow(S.CUSTOMERS, body.id, body.data));
    if (a === 'deleteCustomer')       return ok(deleteRow(S.CUSTOMERS, body.id));
    if (a === 'addFollowup')          return ok(createRow(S.FOLLOWUPS, { customer_id: body.customerId, ...body.data }));
    // Properties
    if (a === 'createProperty')       return ok(createRow(S.PROPERTIES, flattenPropertyData(body.data)));
    if (a === 'updateProperty')       return ok(updateRow(S.PROPERTIES, body.id, flattenPropertyData(body.data)));
    if (a === 'deleteProperty')       return ok(deleteRow(S.PROPERTIES, body.id));
    if (a === 'addPropertyImage')     return ok(addPropertyImage(body.propId, body.dataUrl, body.caption));
    if (a === 'deletePropertyImage')  return ok(deletePropertyImage(body.propId, body.idx));
    // Deals
    if (a === 'createDeal')           return ok(createDeal(body.data));
    if (a === 'updateDeal')           return ok(updateDealWithSync(body.id, body.data));
    if (a === 'updateDealStatus')     return ok(updateDealWithSync(body.id, { status: body.status }));
    if (a === 'deleteDeal')           return ok(deleteRow(S.DEALS, body.id));
    // Appointments
    if (a === 'createAppointment')    return ok(createRow(S.APPOINTMENTS, body.data));
    if (a === 'updateAppointment')    return ok(updateRow(S.APPOINTMENTS, body.id, body.data));
    if (a === 'deleteAppointment')    return ok(deleteRow(S.APPOINTMENTS, body.id));
    // Commissions
    if (a === 'createCommission')     return ok(createRow(S.COMMISSIONS, body.data));
    if (a === 'updateCommission')     return ok(updateRow(S.COMMISSIONS, body.id, body.data));
    if (a === 'deleteCommission')     return ok(deleteRow(S.COMMISSIONS, body.id));
    // Zones
    if (a === 'createZone')           return ok(createRow(S.ZONES, body.data));
    if (a === 'deleteZone')           return ok(deleteRow(S.ZONES, body.id));
    // Agents / Owners
    if (a === 'createAgent')          return ok(createRow(S.AGENTS, body.data));
    if (a === 'createOwner')          return ok(createRow(S.OWNERS, body.data));
    // Image upload (standalone)
    if (a === 'uploadImage')          return ok(uploadImage(body.filename, body.base64, body.mimeType));
    return err('unknown action: ' + a);
  } catch(ex) { return err(ex.message + '\n' + ex.stack); }
}

// ── Sheet helpers ─────────────────────────────────────────────
function ss() { return SpreadsheetApp.openById(SPREADSHEET_ID); }
function sheet(name) { return ss().getSheetByName(name); }

// ── Cache helpers (CacheService — max 100KB/item, TTL 60s) ────
const CACHE_TTL = 60;

function cacheGet(key) {
  try {
    const v = CacheService.getScriptCache().get(key);
    return v ? JSON.parse(v) : null;
  } catch(e) { return null; }
}
function cachePut(key, data) {
  try {
    const s = JSON.stringify(data);
    if (s.length < 90000) CacheService.getScriptCache().put(key, s, CACHE_TTL);
  } catch(e) {}
}
function cacheRemove(key) {
  try { CacheService.getScriptCache().remove(key); } catch(e) {}
}
// เคลียร์ cache ทั้งชุดเมื่อมีการเขียนข้อมูล
function invalidate(name) {
  cacheRemove('sheet_' + name);
  cacheRemove('dashboard');
}

// ── Sheet helpers ─────────────────────────────────────────────
function getHeaders(name) {
  const sh = sheet(name);
  if (!sh || sh.getLastColumn() < 1) return [];
  return sh.getRange(1, 1, 1, sh.getLastColumn()).getValues()[0];
}

function rowToObj(headers, row) {
  const obj = {};
  headers.forEach((h, i) => {
    const v = row[i];
    obj[h] = (v === '' || v === undefined) ? null : v;
  });
  return obj;
}

function getAll(name) {
  const cached = cacheGet('sheet_' + name);
  if (cached) return cached;

  const sh = sheet(name);
  if (!sh) return [];
  const last = sh.getLastRow();
  if (last < 2) return [];
  const headers = sh.getRange(1, 1, 1, sh.getLastColumn()).getValues()[0];
  const rows = sh.getRange(2, 1, last - 1, sh.getLastColumn()).getValues();
  const result = rows
    .map(r => rowToObj(headers, r))
    .filter(r => r.id && r.id !== '');

  cachePut('sheet_' + name, result);
  return result;
}

function getById(name, id) {
  return getAll(name).find(r => String(r.id) === String(id)) || null;
}

// Flatten property_details JSON into top-level columns (bedrooms, bathrooms, etc.)
function flattenPropertyData(data) {
  const d = Object.assign({}, data);
  let details = d.property_details;
  if (details) {
    if (typeof details === 'string') {
      try { details = JSON.parse(details); } catch(e) { details = {}; }
    }
    const map = { bedrooms:'bedrooms', bathrooms:'bathrooms', usable_area:'area', floor:'floor', land_sqw:'land_sqw', parking:'parking', size_sqm:'size_sqm' };
    Object.entries(map).forEach(([dk, col]) => {
      if (details[dk] !== undefined && details[dk] !== null && details[dk] !== '') {
        d[col] = details[dk];
      }
    });
    d.property_details = JSON.stringify(details);
  }
  if (d.marketing_data && typeof d.marketing_data === 'object') {
    d.marketing_data = JSON.stringify(d.marketing_data);
  }
  return d;
}

function createRow(name, data) {
  const sh = sheet(name);
  const headers = getHeaders(name);
  const newId = Date.now();
  data = Object.assign({}, data);
  data.id = newId;
  if (!data.created_at) data.created_at = new Date().toISOString().split('T')[0];
  // auto code
  const codeKey = headers[1];
  if (codeKey && !data[codeKey]) {
    const prefix = name.slice(0,3).toUpperCase();
    const seq = Math.max(sh.getLastRow(), 1);
    data[codeKey] = prefix + String(seq).padStart(3, '0');
  }
  const row = headers.map(h => (data[h] !== undefined && data[h] !== null) ? data[h] : '');
  sh.appendRow(row);
  invalidate(name);
  return { id: newId };
}

function findRowNum(name, id) {
  const sh = sheet(name);
  const last = sh.getLastRow();
  if (last < 2) return -1;
  const ids = sh.getRange(2, 1, last - 1, 1).getValues();
  for (let i = 0; i < ids.length; i++) {
    if (String(ids[i][0]) === String(id)) return i + 2;
  }
  return -1;
}

function updateRow(name, id, data) {
  const sh = sheet(name);
  const headers = getHeaders(name);
  const rowNum = findRowNum(name, id);
  if (rowNum < 0) return false;
  headers.forEach((h, ci) => {
    if (data[h] !== undefined) sh.getRange(rowNum, ci + 1).setValue(data[h] !== null ? data[h] : '');
  });
  invalidate(name);
  return true;
}

function deleteRow(name, id) {
  const sh = sheet(name);
  const rowNum = findRowNum(name, id);
  if (rowNum < 0) return false;
  sh.deleteRow(rowNum);
  invalidate(name);
  return true;
}

// ── Customer full detail ──────────────────────────────────────
function getCustomerFull(id) {
  const c = getById(S.CUSTOMERS, id);
  if (!c) return null;
  c.deals = getAll(S.DEALS).filter(d => String(d.customer_id) === String(id));
  c.appointments = getAll(S.APPOINTMENTS).filter(a => String(a.customer_id) === String(id));
  c.followups = getAll(S.FOLLOWUPS).filter(f => String(f.customer_id) === String(id))
                                    .sort((a,b) => String(b.created_at).localeCompare(String(a.created_at)));
  return c;
}

// ── Property full detail ──────────────────────────────────────
function getPropertyFull(id) {
  const p = getById(S.PROPERTIES, id);
  if (!p) return null;
  p.deals = getAll(S.DEALS).filter(d => String(d.property_id) === String(id));
  // parse JSON fields
  if (p.images && typeof p.images === 'string') {
    try { p.images = JSON.parse(p.images); } catch(e) { p.images = []; }
  } else { p.images = p.images || []; }
  if (p.property_details && typeof p.property_details === 'string') {
    try { p.property_details = JSON.parse(p.property_details); } catch(e) { p.property_details = {}; }
  } else { p.property_details = p.property_details || {}; }
  if (p.marketing_data && typeof p.marketing_data === 'string') {
    try { p.marketing_data = JSON.parse(p.marketing_data); } catch(e) { p.marketing_data = {}; }
  } else { p.marketing_data = p.marketing_data || {}; }
  return p;
}

// Override getAll for Properties to parse JSON
function getPropertiesAll() {
  return getAll(S.PROPERTIES).map(p => {
    if (p.images && typeof p.images === 'string') {
      try { p.images = JSON.parse(p.images); } catch(e) { p.images = []; }
    } else { p.images = p.images || []; }
    if (p.property_details && typeof p.property_details === 'string') {
      try { p.property_details = JSON.parse(p.property_details); } catch(e) { p.property_details = {}; }
    } else { p.property_details = p.property_details || {}; }
    return p;
  });
}

// ── Deal full detail ──────────────────────────────────────────
function getDealFull(id) {
  const d = getById(S.DEALS, id);
  if (!d) return null;
  if (d.customer_id) {
    const c = getById(S.CUSTOMERS, d.customer_id);
    if (c) d.customer_phone = c.phone || '';
  }
  return d;
}

// ── Create deal (with lookup) ─────────────────────────────────
function createDeal(data) {
  if (data.customer_id) {
    const c = getById(S.CUSTOMERS, data.customer_id);
    if (c) {
      data.customer_name = data.customer_name || c.full_name;
      data.customer_phone = c.phone || '';
    }
  }
  if (data.property_id) {
    const p = getById(S.PROPERTIES, data.property_id);
    if (p) {
      data.property_title = data.property_title || p.title;
      data.property_code  = data.property_code  || p.property_code;
      data.property_type  = data.property_type  || p.property_type;
      if (!data.sale_price)       data.sale_price = p.sale_price;
      if (!data.commission_rate)  data.commission_rate = p.commission_rate || 3;
      if (!data.commission_amount) data.commission_amount = Math.round((data.sale_price||0) * (data.commission_rate||3) / 100);
      if (!data.agent_name) data.agent_name = p.agent_name;
    }
  }
  if (!data.status) data.status = 'เสนอทรัพย์';
  return createRow(S.DEALS, data);
}

// ── Deal status sync ──────────────────────────────────────────
const DEAL_TO_CRM = {
  'เสนอทรัพย์'         : 'กำลังหา/เสนอทรัพย์',
  'นัดชมทรัพย์'        : 'นัดชมทรัพย์',
  'ชมทรัพย์แล้ว'       : 'นัดชมทรัพย์',
  'ต่อรองราคา'         : 'ต่อรองราคา',
  'วางมัดจำ'           : 'วางมัดจำ',
  'ยื่นสินเชื่อ'       : 'ยื่นสินเชื่อ',
  'สินเชื่อผ่าน'       : 'ยื่นสินเชื่อ',
  'นัดวันโอน'          : 'วางมัดจำ',
  'โอนกรรมสิทธิ์'      : 'วางมัดจำ',
  'รับค่านายหน้า'      : 'ปิดการขายสำเร็จ',
  'ปิดการขายสำเร็จ'    : 'ปิดการขายสำเร็จ',
  'ปิดการขายไม่สำเร็จ' : 'ปิดการขายไม่สำเร็จ',
};

function updateDealWithSync(id, data) {
  const deal = getById(S.DEALS, id);
  if (!deal) return false;
  updateRow(S.DEALS, id, data);
  const newStatus = data.status || deal.status;
  const crmStatus = DEAL_TO_CRM[newStatus];
  if (crmStatus && deal.customer_id) updateRow(S.CUSTOMERS, deal.customer_id, { status: crmStatus });
  if (newStatus === 'ปิดการขายสำเร็จ' && deal.property_id) updateRow(S.PROPERTIES, deal.property_id, { status: 'ขายแล้ว' });
  return true;
}

// ── Image — รับ URL จาก Cloudinary (อัปโหลดฝั่ง browser แล้ว) ──
function uploadImage(filename, base64, mimeType) {
  // ไม่ใช้แล้ว — เก็บไว้เพื่อ backward compat
  return { url: base64, id: '' };
}

function addPropertyImage(propId, dataUrl, caption) {
  // dataUrl คือ Cloudinary URL ที่ browser อัปโหลดแล้ว
  const p = getById(S.PROPERTIES, propId);
  if (!p) throw new Error('Property not found: ' + propId);
  let images = [];
  if (p.images && typeof p.images === 'string') try { images = JSON.parse(p.images); } catch(e) {}
  images.push({ url: dataUrl, caption: caption || '' });
  updateRow(S.PROPERTIES, propId, { images: JSON.stringify(images) });
  return { url: dataUrl };
}

function deletePropertyImage(propId, idx) {
  const p = getById(S.PROPERTIES, propId);
  if (!p) return false;
  let images = [];
  if (p.images && typeof p.images === 'string') try { images = JSON.parse(p.images); } catch(e) {}
  if (idx >= 0 && idx < images.length) images.splice(idx, 1);
  updateRow(S.PROPERTIES, propId, { images: JSON.stringify(images) });
  return true;
}

// ── Zones ─────────────────────────────────────────────────────
function getZonesWithCount() {
  const zones = getAll(S.ZONES);
  const props = getAll(S.PROPERTIES);
  return zones.map(z => ({
    ...z,
    property_count: props.filter(p => String(p.zone) === String(z.name)).length
  }));
}

// ── Match properties ──────────────────────────────────────────
function matchProperties(customerId) {
  const c = getById(S.CUSTOMERS, customerId);
  if (!c) return { matches: [] };
  const props = getAll(S.PROPERTIES).filter(p => p.status === 'พร้อมขาย');
  const results = props.map(p => {
    let score = 0;
    if (c.property_type_interest && p.property_type === c.property_type_interest) score += 40;
    const price = Number(p.sale_price) || 0;
    const bMin  = Number(c.budget_min) || 0;
    const bMax  = Number(c.budget_max) || 0;
    if (bMax > 0 && price <= bMax) score += 30;
    if (bMin > 0 && price >= bMin) score += 20;
    if (score > 60) { return { ...p, score, match_level: 'ตรงมาก' }; }
    if (score > 30) { return { ...p, score, match_level: 'ตรงปานกลาง' }; }
    return { ...p, score, match_level: 'ตรงน้อย' };
  }).filter(p => p.score > 0).sort((a, b) => b.score - a.score);
  return { matches: results };
}

// ── Reports ───────────────────────────────────────────────────
function getReportsCommissions() {
  const commissions = getAll(S.COMMISSIONS);
  const deals = getAll(S.DEALS);
  const closedDeals = deals.filter(d => d.status === 'ปิดการขายสำเร็จ');
  const total = commissions.reduce((s, c) => s + (Number(c.amount) || 0), 0);
  // by agent
  const agentMap = {};
  commissions.forEach(c => {
    const k = c.agent_name || 'ไม่ระบุ';
    if (!agentMap[k]) agentMap[k] = { agent_name: k, count: 0, total: 0 };
    agentMap[k].count++;
    agentMap[k].total += Number(c.amount) || 0;
  });
  // join deals + commissions
  const dealRows = closedDeals.map(d => {
    const comm = commissions.find(c => String(c.deal_id) === String(d.id));
    return {
      deal_code: d.deal_code,
      customer_name: d.customer_name,
      property_title: d.property_title,
      sale_price: d.sale_price,
      commission_amount: d.commission_amount,
      commission_paid: comm ? comm.amount : 0,
      received_date: comm ? comm.received_date : null,
      agent_name: d.agent_name,
    };
  });
  return {
    summary: { count: commissions.length, total },
    by_agent: Object.values(agentMap),
    deals: dealRows,
  };
}

// ── Dashboard ─────────────────────────────────────────────────
function getDashboard() {
  const cached = cacheGet('dashboard');
  if (cached) return cached;

  const today = new Date().toISOString().split('T')[0];
  const customers    = getAll(S.CUSTOMERS);
  const properties   = getAll(S.PROPERTIES);
  const deals        = getAll(S.DEALS);
  const appointments = getAll(S.APPOINTMENTS);
  const commissions  = getAll(S.COMMISSIONS);

  const stats = {
    customers_total         : customers.length,
    customers_new_today     : customers.filter(c => c.created_at === today).length,
    customers_followup_today: customers.filter(c => c.next_followup_date === today).length,
    appointments_today      : appointments.filter(a => a.appointment_date === today).length,
    deals_active  : deals.filter(d => !['ปิดการขายสำเร็จ','ปิดการขายไม่สำเร็จ'].includes(d.status)).length,
    deals_closed  : deals.filter(d => d.status === 'ปิดการขายสำเร็จ').length,
    deals_lost    : deals.filter(d => d.status === 'ปิดการขายไม่สำเร็จ').length,
    properties_total    : properties.length,
    properties_available: properties.filter(p => p.status === 'พร้อมขาย').length,
    properties_reserved : properties.filter(p => p.status === 'จองแล้ว').length,
    properties_sold     : properties.filter(p => p.status === 'ขายแล้ว').length,
    commission_this_month: 0,
    commission_received  : 0,
    commission_potential : 0,
  };

  const thisMonth = today.slice(0, 7);
  commissions.forEach(c => {
    const amt = Number(c.amount) || 0;
    stats.commission_received += amt;
    if (c.received_date && String(c.received_date).slice(0, 7) === thisMonth) stats.commission_this_month += amt;
  });
  deals.filter(d => !['ปิดการขายสำเร็จ','ปิดการขายไม่สำเร็จ'].includes(d.status))
       .forEach(d => { stats.commission_potential += Number(d.commission_amount) || 0; });

  // monthly commission (6 months)
  const monthly_commission = [];
  for (let i = 5; i >= 0; i--) {
    const d2 = new Date(); d2.setMonth(d2.getMonth() - i);
    const m = d2.toISOString().slice(0, 7);
    const total = commissions.filter(c => c.received_date && String(c.received_date).slice(0, 7) === m)
                             .reduce((s, c) => s + (Number(c.amount) || 0), 0);
    monthly_commission.push({ month: m.slice(5) + '/' + m.slice(2, 4), total });
  }

  const srcMap = {};
  customers.forEach(c => { if (c.source) srcMap[c.source] = (srcMap[c.source] || 0) + 1; });
  const source_stats = Object.entries(srcMap).map(([source, count]) => ({ source, count }));

  const plMap = {};
  deals.forEach(d => { if (d.status) plMap[d.status] = (plMap[d.status] || 0) + 1; });
  const pipeline_stats = Object.entries(plMap).map(([status, count]) => ({ status, count }));

  const followup_today = customers.filter(c => c.next_followup_date === today);

  const result = { stats, monthly_commission, source_stats, pipeline_stats, followup_today };
  cachePut('dashboard', result);
  return result;
}

// ── Sheet initializer (รันครั้งแรกครั้งเดียว) ─────────────────
function initSheets() {
  const spreadsheet = ss();

  const schemas = {
    [S.CUSTOMERS]: [
      'id','customer_code','full_name','phone','line_id','email',
      'source','property_type_interest','budget_min','budget_max',
      'status','next_followup_date','agent_name','note','preferred_location',
      'purchase_purpose','urgency','loan_capacity','internal_note','created_at'
    ],
    [S.PROPERTIES]: [
      'id','property_code','title','property_type','property_subtype',
      'province','district','village_project','zone','nearby_places',
      'sale_price','appraisal_price','min_acceptable_price',
      'commission_rate','commission_amount','transfer_fee_condition',
      'bedrooms','bathrooms','area','floor',
      'status','agent_name','owner_id','highlights','drawbacks','structure','internal_note',
      'images','property_details','marketing_data','created_at'
    ],
    [S.DEALS]: [
      'id','deal_code','customer_id','customer_name','customer_phone',
      'property_id','property_title','property_code','property_type',
      'sale_price','commission_rate','commission_amount',
      'status','agent_name','note','commission_received','created_at','closed_at'
    ],
    [S.APPOINTMENTS]: [
      'id','appointment_code','customer_id','customer_name','customer_phone',
      'property_id','property_title','type',
      'appointment_date','appointment_time',
      'note','status','agent_name','created_at'
    ],
    [S.COMMISSIONS]: [
      'id','commission_code','deal_id','deal_code','amount','type',
      'received_date','note','agent_name','created_at'
    ],
    [S.FOLLOWUPS]: [
      'id','followup_code','customer_id','contact_type','note','agent_name','created_at'
    ],
    [S.ZONES]: [
      'id','name','province','created_at'
    ],
    [S.AGENTS]: [
      'id','name','phone','email','created_at'
    ],
    [S.OWNERS]: [
      'id','owner_name','phone','line_id','note','created_at'
    ],
  };

  Object.entries(schemas).forEach(([name, headers]) => {
    let sh = spreadsheet.getSheetByName(name);
    if (!sh) sh = spreadsheet.insertSheet(name);
    if (sh.getLastRow() === 0) {
      sh.getRange(1, 1, 1, headers.length).setValues([headers]);
      sh.getRange(1, 1, 1, headers.length)
        .setBackground('#1B4FD8').setFontColor('#fff').setFontWeight('bold');
      sh.setFrozenRows(1);
    }
  });

  // Seed default agents and zones
  if (getAll(S.AGENTS).length === 0) {
    createRow(S.AGENTS, { name: 'สมหมาย รักงาน', phone: '081-000-0001' });
    createRow(S.AGENTS, { name: 'นนทวรรณ ขยันดี', phone: '082-000-0002' });
  }
  if (getAll(S.ZONES).length === 0) {
    ['เมือง','บ้านเป็ด','น้ำพอง','พล','ชนบท','อุบลรัตน์'].forEach(name => createRow(S.ZONES, { name, province: 'ขอนแก่น' }));
  }

  seedSampleData();
  Logger.log('✅ Sheets initialized');
}

// ── Sample data ───────────────────────────────────────────────
function seedSampleData() {
  if (getAll(S.CUSTOMERS).length > 0) return;
  const today = new Date().toISOString().split('T')[0];
  const agents = getAll(S.AGENTS);
  const agent1 = agents[0] ? agents[0].name : 'สมหมาย รักงาน';
  const agent2 = agents[1] ? agents[1].name : 'นนทวรรณ ขยันดี';

  createRow(S.CUSTOMERS, { customer_code:'CUS001', full_name:'สมชาย ใจดี', phone:'081-100-0001', line_id:'somchai_jd', source:'TikTok', property_type_interest:'บ้าน', budget_min:3000000, budget_max:5000000, status:'นัดชมทรัพย์', next_followup_date:today, agent_name:agent1, created_at:today });
  createRow(S.CUSTOMERS, { customer_code:'CUS002', full_name:'สุดา มีสุข', phone:'082-200-0002', line_id:'suda_ms', source:'Facebook', property_type_interest:'คอนโด', budget_min:1500000, budget_max:2500000, status:'ต่อรองราคา', next_followup_date:today, agent_name:agent2, created_at:today });
  createRow(S.CUSTOMERS, { customer_code:'CUS003', full_name:'ประเสริฐ สว่างใจ', phone:'083-300-0003', line_id:'prasert_sw', source:'LINE', property_type_interest:'ที่ดิน', budget_min:4000000, budget_max:8000000, status:'ต่อรองราคา', next_followup_date:'2026-06-25', agent_name:agent1, created_at:today });

  const custs = getAll(S.CUSTOMERS);
  if (custs.length > 0) {
    createRow(S.DEALS, {
      deal_code:'DEL001', customer_id:custs[0].id, customer_name:custs[0].full_name,
      customer_phone: custs[0].phone || '',
      property_title:'บ้านเดี่ยว ม.ลดาวัลย์',
      sale_price:4200000, commission_rate:3, commission_amount:126000,
      status:'นัดชมทรัพย์', agent_name:agent1, created_at:today
    });
    createRow(S.APPOINTMENTS, {
      appointment_code:'APT001', customer_id:custs[0].id, customer_name:custs[0].full_name,
      property_title:'บ้านเดี่ยว ม.ลดาวัลย์',
      type:'นัดชมทรัพย์', appointment_date:today, appointment_time:'10:00',
      note:'', status:'รอดำเนินการ', agent_name:agent1, created_at:today
    });
  }
}

// ── เพิ่มทรัพย์ตัวอย่าง (รันครั้งเดียว) ──────────────────────
function seedProperties() {
  if (getAll(S.PROPERTIES).length > 0) {
    Logger.log('มีทรัพย์อยู่แล้ว ' + getAll(S.PROPERTIES).length + ' รายการ');
    return;
  }
  const today = new Date().toISOString().split('T')[0];
  const agents = getAll(S.AGENTS);
  const agent1 = agents[0] ? agents[0].name : 'สมหมาย รักงาน';
  const agent2 = agents[1] ? agents[1].name : 'นนทวรรณ ขยันดี';

  createRow(S.PROPERTIES, {
    title:'บ้านเดี่ยว 2 ชั้น ม.ลดาวัลย์', property_type:'บ้าน', property_subtype:'บ้านเดี่ยว',
    province:'ขอนแก่น', district:'เมือง', zone:'เมือง',
    sale_price:4500000, commission_rate:3, commission_amount:135000,
    bedrooms:3, bathrooms:2, area:65, floor:2,
    status:'พร้อมขาย', agent_name:agent1,
    highlights:'ใกล้ห้างเซ็นทรัล ทำเลดี ถนนกว้าง', created_at:today
  });
  createRow(S.PROPERTIES, {
    title:'คอนโด The Base ใจกลางเมือง', property_type:'คอนโด', property_subtype:'คอนโดมิเนียม',
    province:'ขอนแก่น', district:'เมือง', zone:'เมือง',
    sale_price:1800000, commission_rate:3, commission_amount:54000,
    bedrooms:1, bathrooms:1, area:32, floor:8,
    status:'พร้อมขาย', agent_name:agent2,
    highlights:'วิวสวย ชั้นสูง ใกล้ BRT ขอนแก่น', created_at:today
  });
  createRow(S.PROPERTIES, {
    title:'ที่ดิน 2 ไร่ ถนนมิตรภาพ', property_type:'ที่ดิน', property_subtype:'ที่ดินเปล่า',
    province:'ขอนแก่น', district:'บ้านเป็ด', zone:'บ้านเป็ด',
    sale_price:6000000, commission_rate:3, commission_amount:180000,
    area:3200, status:'พร้อมขาย', agent_name:agent1,
    highlights:'ติดถนนใหญ่ เหมาะสร้างร้านค้าหรือโกดัง', created_at:today
  });
  createRow(S.PROPERTIES, {
    title:'ทาวน์โฮม 3 ชั้น ใกล้ ม.ขอนแก่น', property_type:'บ้าน', property_subtype:'ทาวน์โฮม',
    province:'ขอนแก่น', district:'เมือง', zone:'เมือง',
    sale_price:2800000, commission_rate:3, commission_amount:84000,
    bedrooms:3, bathrooms:3, area:140, floor:3,
    status:'จองแล้ว', agent_name:agent2,
    highlights:'ทำเลดี ใกล้มหาวิทยาลัย เหมาะปล่อยเช่า', created_at:today
  });
  createRow(S.PROPERTIES, {
    title:'อาคารพาณิชย์ 4 ชั้น ย่านตลาด', property_type:'อาคารพาณิชย์', property_subtype:'อาคารพาณิชย์',
    province:'ขอนแก่น', district:'เมือง', zone:'เมือง',
    sale_price:9500000, commission_rate:3, commission_amount:285000,
    bedrooms:0, bathrooms:2, area:200, floor:4,
    status:'พร้อมขาย', agent_name:agent1,
    highlights:'ย่านธุรกิจ ทำเลค้าขายดี', created_at:today
  });

  Logger.log('✅ เพิ่มทรัพย์ตัวอย่าง 5 รายการแล้ว');
}

// ── Grant DriveApp permission (รันครั้งเดียว) ────────────────
function grantDriveAccess() {
  DriveApp.getRootFolder();
  Logger.log('✅ DriveApp authorized');
}
