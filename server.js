const express = require('express');
const cors = require('cors');
const bodyParser = require('body-parser');
const path = require('path');
const db = require('./database');

const app = express();
const PORT = process.env.PORT || 3000;

app.use(cors());
app.use(express.json({ limit: '50mb' }));
app.use(express.urlencoded({ limit: '50mb', extended: true }));
app.use(bodyParser.json({ limit: '50mb' }));
app.use(bodyParser.urlencoded({ limit: '50mb', extended: true }));
app.use(express.static(path.join(__dirname, 'public')));

// ─── DASHBOARD ────────────────────────────────────────────────────────────────
app.get('/api/dashboard', (req, res) => {
  const today = new Date().toISOString().split('T')[0];
  const thisMonth = today.substring(0, 7);

  const stats = {
    customers_new_today: db.prepare(`SELECT COUNT(*) as c FROM customers WHERE date(created_at)=?`).get(today).c,
    customers_total: db.prepare(`SELECT COUNT(*) as c FROM customers`).get().c,
    customers_followup_today: db.prepare(`SELECT COUNT(*) as c FROM customers WHERE next_followup_date=? AND status NOT IN ('ปิดการขายสำเร็จ','ปิดการขายไม่สำเร็จ')`).get(today).c,
    properties_total: db.prepare(`SELECT COUNT(*) as c FROM properties`).get().c,
    properties_available: db.prepare(`SELECT COUNT(*) as c FROM properties WHERE status='พร้อมขาย'`).get().c,
    properties_reserved: db.prepare(`SELECT COUNT(*) as c FROM properties WHERE status='จองแล้ว'`).get().c,
    properties_sold: db.prepare(`SELECT COUNT(*) as c FROM properties WHERE status='ขายแล้ว'`).get().c,
    deals_active: db.prepare(`SELECT COUNT(*) as c FROM deals WHERE status NOT IN ('ปิดการขายสำเร็จ','ปิดการขายไม่สำเร็จ')`).get().c,
    deals_closed: db.prepare(`SELECT COUNT(*) as c FROM deals WHERE status='ปิดการขายสำเร็จ'`).get().c,
    deals_lost: db.prepare(`SELECT COUNT(*) as c FROM deals WHERE status='ปิดการขายไม่สำเร็จ'`).get().c,
    commission_potential: db.prepare(`SELECT COALESCE(SUM(commission_amount),0) as s FROM deals WHERE status NOT IN ('ปิดการขายสำเร็จ','ปิดการขายไม่สำเร็จ')`).get().s,
    commission_received: db.prepare(`SELECT COALESCE(SUM(amount),0) as s FROM commissions`).get().s,
    commission_this_month: db.prepare(`SELECT COALESCE(SUM(amount),0) as s FROM commissions WHERE strftime('%Y-%m',received_date)=?`).get(thisMonth).s,
    appointments_today: db.prepare(`SELECT COUNT(*) as c FROM appointments WHERE appointment_date=? AND status='รอดำเนินการ'`).get(today).c,
  };

  const source_stats = db.prepare(`SELECT source, COUNT(*) as count FROM customers GROUP BY source ORDER BY count DESC`).all();
  const status_stats = db.prepare(`SELECT status, COUNT(*) as count FROM customers GROUP BY status ORDER BY count DESC`).all();
  const property_type_stats = db.prepare(`SELECT property_type, COUNT(*) as count FROM properties GROUP BY property_type`).all();
  const pipeline_stats = db.prepare(`SELECT status, COUNT(*) as count FROM deals GROUP BY status`).all();

  const monthly_commission = db.prepare(`
    SELECT strftime('%Y-%m', received_date) as month, COALESCE(SUM(amount),0) as total
    FROM commissions WHERE received_date IS NOT NULL
    GROUP BY month ORDER BY month DESC LIMIT 6
  `).all();

  const followup_today = db.prepare(`
    SELECT c.*, u.name as agent_name
    FROM customers c LEFT JOIN users u ON c.assigned_agent_id=u.id
    WHERE c.next_followup_date=? AND c.status NOT IN ('ปิดการขายสำเร็จ','ปิดการขายไม่สำเร็จ')
    ORDER BY c.updated_at DESC LIMIT 10
  `).all(today);

  res.json({ stats, source_stats, status_stats, property_type_stats, pipeline_stats, monthly_commission, followup_today });
});

// ─── CUSTOMERS ────────────────────────────────────────────────────────────────
app.get('/api/customers', (req, res) => {
  const { search, status, source, agent } = req.query;
  let where = ['1=1'];
  let params = [];

  if (search) { where.push(`(c.full_name LIKE ? OR c.phone LIKE ? OR c.customer_code LIKE ?)`); params.push(`%${search}%`,`%${search}%`,`%${search}%`); }
  if (status) { where.push(`c.status=?`); params.push(status); }
  if (source) { where.push(`c.source=?`); params.push(source); }
  if (agent) { where.push(`c.assigned_agent_id=?`); params.push(agent); }

  const rows = db.prepare(`
    SELECT c.*, u.name as agent_name
    FROM customers c LEFT JOIN users u ON c.assigned_agent_id=u.id
    WHERE ${where.join(' AND ')} ORDER BY c.updated_at DESC
  `).all(...params);
  res.json(rows);
});

app.post('/api/customers', (req, res) => {
  const d = req.body;
  const code = `CUS${String(Date.now()).slice(-6)}`;
  const result = db.prepare(`
    INSERT INTO customers (customer_code, full_name, phone, line_id, facebook, email, source, property_type_interest, budget_min, budget_max, preferred_location, purchase_purpose, urgency, loan_capacity, status, assigned_agent_id, next_followup_date, internal_note)
    VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)
  `).run(code,d.full_name,d.phone,d.line_id,d.facebook,d.email,d.source,d.property_type_interest,d.budget_min||0,d.budget_max||0,d.preferred_location,d.purchase_purpose,d.urgency,d.loan_capacity,d.status||'ลูกค้าใหม่',d.assigned_agent_id,d.next_followup_date,d.internal_note);
  res.json({ id: result.lastInsertRowid, customer_code: code });
});

app.get('/api/customers/:id', (req, res) => {
  const customer = db.prepare(`SELECT c.*, u.name as agent_name FROM customers c LEFT JOIN users u ON c.assigned_agent_id=u.id WHERE c.id=?`).get(req.params.id);
  if (!customer) return res.status(404).json({ error: 'Not found' });
  const followups = db.prepare(`SELECT f.*, u.name as user_name FROM follow_ups f LEFT JOIN users u ON f.user_id=u.id WHERE f.customer_id=? ORDER BY f.created_at DESC`).all(req.params.id);
  const deals = db.prepare(`SELECT d.*, p.title as property_title, p.property_code FROM deals d LEFT JOIN properties p ON d.property_id=p.id WHERE d.customer_id=?`).all(req.params.id);
  const appointments = db.prepare(`SELECT a.*, p.title as property_title FROM appointments a LEFT JOIN properties p ON a.property_id=p.id WHERE a.customer_id=? ORDER BY a.appointment_date DESC`).all(req.params.id);
  res.json({ ...customer, followups, deals, appointments });
});

app.put('/api/customers/:id', (req, res) => {
  const d = req.body;
  db.prepare(`UPDATE customers SET full_name=?,phone=?,line_id=?,facebook=?,email=?,source=?,property_type_interest=?,budget_min=?,budget_max=?,preferred_location=?,purchase_purpose=?,urgency=?,loan_capacity=?,status=?,assigned_agent_id=?,next_followup_date=?,internal_note=?,updated_at=datetime('now','localtime') WHERE id=?`)
    .run(d.full_name,d.phone,d.line_id,d.facebook,d.email,d.source,d.property_type_interest,d.budget_min||0,d.budget_max||0,d.preferred_location,d.purchase_purpose,d.urgency,d.loan_capacity,d.status,d.assigned_agent_id,d.next_followup_date,d.internal_note,req.params.id);
  res.json({ success: true });
});

app.delete('/api/customers/:id', (req, res) => {
  db.prepare(`DELETE FROM customers WHERE id=?`).run(req.params.id);
  res.json({ success: true });
});

app.post('/api/customers/:id/followup', (req, res) => {
  const { user_id, contact_type, note } = req.body;
  const result = db.prepare(`INSERT INTO follow_ups (customer_id, user_id, contact_type, note) VALUES (?,?,?,?)`).run(req.params.id, user_id, contact_type, note);
  db.prepare(`UPDATE customers SET updated_at=datetime('now','localtime') WHERE id=?`).run(req.params.id);
  res.json({ id: result.lastInsertRowid });
});

// ─── PROPERTIES ───────────────────────────────────────────────────────────────
app.get('/api/properties', (req, res) => {
  const { search, type, status, province, agent, zone, price_min, price_max } = req.query;
  let where = ['1=1'];
  let params = [];

  if (search) { where.push(`(p.title LIKE ? OR p.property_code LIKE ? OR p.village_project LIKE ? OR p.district LIKE ?)`); params.push(`%${search}%`,`%${search}%`,`%${search}%`,`%${search}%`); }
  if (type) { where.push(`p.property_type=?`); params.push(type); }
  if (status) { where.push(`p.status=?`); params.push(status); }
  if (province) { where.push(`p.province=?`); params.push(province); }
  if (agent) { where.push(`p.assigned_agent_id=?`); params.push(agent); }
  if (zone) { where.push(`p.zone=?`); params.push(zone); }
  if (price_min) { where.push(`p.sale_price>=?`); params.push(Number(price_min)); }
  if (price_max) { where.push(`p.sale_price<=?`); params.push(Number(price_max)); }

  const rows = db.prepare(`
    SELECT p.*, o.owner_name, u.name as agent_name
    FROM properties p
    LEFT JOIN property_owners o ON p.owner_id=o.id
    LEFT JOIN users u ON p.assigned_agent_id=u.id
    WHERE ${where.join(' AND ')} ORDER BY p.updated_at DESC
  `).all(...params);
  res.json(rows);
});

app.post('/api/properties', (req, res) => {
  const d = req.body;
  const code = `${d.property_type === 'บ้าน' ? 'H' : d.property_type === 'คอนโด' ? 'C' : d.property_type === 'ที่ดิน' ? 'L' : d.property_type === 'ทรัพย์ให้เช่า' ? 'RENT' : 'P'}${String(Date.now()).slice(-4)}`;
  const commAmt = (d.sale_price || 0) * (d.commission_rate || 3) / 100;
  const result = db.prepare(`
    INSERT INTO properties (property_code, property_type, property_subtype, title, status, owner_id, province, district, subdistrict, village_project, address_detail, zone, nearby_places, sale_price, appraisal_price, min_acceptable_price, commission_rate, commission_amount, transfer_fee_condition, highlights, property_details, marketing_data, internal_note, assigned_agent_id)
    VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)
  `).run(code,d.property_type,d.property_subtype,d.title,d.status||'พร้อมขาย',d.owner_id,d.province,d.district,d.subdistrict,d.village_project,d.address_detail,d.zone,d.nearby_places,d.sale_price||0,d.appraisal_price||0,d.min_acceptable_price||0,d.commission_rate||3,commAmt,d.transfer_fee_condition||'ออกคนละครึ่ง',d.highlights,JSON.stringify(d.property_details||{}),JSON.stringify(d.marketing_data||{}),d.internal_note,d.assigned_agent_id);
  res.json({ id: result.lastInsertRowid, property_code: code });
});

app.get('/api/properties/:id', (req, res) => {
  const prop = db.prepare(`
    SELECT p.*, o.owner_name, o.phone as owner_phone, o.line_id as owner_line, u.name as agent_name
    FROM properties p
    LEFT JOIN property_owners o ON p.owner_id=o.id
    LEFT JOIN users u ON p.assigned_agent_id=u.id
    WHERE p.id=?
  `).get(req.params.id);
  if (!prop) return res.status(404).json({ error: 'Not found' });
  if (prop.property_details) try { prop.property_details = JSON.parse(prop.property_details); } catch(e) { prop.property_details = {}; }
  if (prop.marketing_data) try { prop.marketing_data = JSON.parse(prop.marketing_data); } catch(e) { prop.marketing_data = {}; }
  const deals = db.prepare(`SELECT d.*, c.full_name as customer_name FROM deals d LEFT JOIN customers c ON d.customer_id=c.id WHERE d.property_id=?`).all(req.params.id);
  res.json({ ...prop, deals });
});

app.put('/api/properties/:id', (req, res) => {
  const d = req.body;
  const commAmt = (d.sale_price || 0) * (d.commission_rate || 3) / 100;
  db.prepare(`UPDATE properties SET property_type=?,property_subtype=?,title=?,status=?,owner_id=?,province=?,district=?,village_project=?,zone=?,sale_price=?,appraisal_price=?,min_acceptable_price=?,commission_rate=?,commission_amount=?,transfer_fee_condition=?,highlights=?,property_details=?,internal_note=?,assigned_agent_id=?,updated_at=datetime('now','localtime') WHERE id=?`)
    .run(d.property_type,d.property_subtype,d.title,d.status,d.owner_id,d.province,d.district,d.village_project,d.zone,d.sale_price||0,d.appraisal_price||0,d.min_acceptable_price||0,d.commission_rate||3,commAmt,d.transfer_fee_condition,d.highlights,JSON.stringify(d.property_details||{}),d.internal_note,d.assigned_agent_id,req.params.id);
  res.json({ success: true });
});

app.patch('/api/properties/:id/status', (req, res) => {
  db.prepare(`UPDATE properties SET status=?, updated_at=datetime('now','localtime') WHERE id=?`).run(req.body.status, req.params.id);
  res.json({ success: true });
});

app.delete('/api/properties/:id', (req, res) => {
  db.prepare(`DELETE FROM properties WHERE id=?`).run(req.params.id);
  res.json({ success: true });
});

// ─── PROPERTY IMAGES ──────────────────────────────────────────────────────────
app.get('/api/properties/:id/images', (req, res) => {
  const prop = db.prepare(`SELECT images FROM properties WHERE id=?`).get(req.params.id);
  if (!prop) return res.status(404).json([]);
  let images = [];
  try { images = JSON.parse(prop.images || '[]'); } catch(e) {}
  res.json(images);
});

app.post('/api/properties/:id/images', (req, res) => {
  const { dataUrl, caption } = req.body;
  if (!dataUrl) return res.status(400).json({ error: 'No image data' });
  const prop = db.prepare(`SELECT images FROM properties WHERE id=?`).get(req.params.id);
  if (!prop) return res.status(404).json({ error: 'Property not found' });
  let images = [];
  try { images = JSON.parse(prop.images || '[]'); } catch(e) {}
  images.push({ dataUrl, caption: caption || '', uploadedAt: new Date().toISOString() });
  db.prepare(`UPDATE properties SET images=? WHERE id=?`).run(JSON.stringify(images), req.params.id);
  res.json({ success: true, count: images.length });
});

app.delete('/api/properties/:id/images/:index', (req, res) => {
  const prop = db.prepare(`SELECT images FROM properties WHERE id=?`).get(req.params.id);
  if (!prop) return res.status(404).json({ error: 'Property not found' });
  let images = [];
  try { images = JSON.parse(prop.images || '[]'); } catch(e) {}
  images.splice(Number(req.params.index), 1);
  db.prepare(`UPDATE properties SET images=? WHERE id=?`).run(JSON.stringify(images), req.params.id);
  res.json({ success: true });
});

// ─── PROPERTY OWNERS ──────────────────────────────────────────────────────────
app.get('/api/owners', (req, res) => {
  res.json(db.prepare(`SELECT * FROM property_owners ORDER BY id`).all());
});

app.post('/api/owners', (req, res) => {
  const d = req.body;
  const code = `OWN${String(Date.now()).slice(-4)}`;
  const r = db.prepare(`INSERT INTO property_owners (owner_code,owner_name,phone,line_id,email,sale_condition,readiness_status,commission_agreement,listing_start_date,listing_end_date,note) VALUES (?,?,?,?,?,?,?,?,?,?,?)`).run(code,d.owner_name,d.phone,d.line_id,d.email,d.sale_condition,d.readiness_status||'พร้อมขายทันที',d.commission_agreement||'3%',d.listing_start_date,d.listing_end_date,d.note);
  res.json({ id: r.lastInsertRowid });
});

// ─── DEALS ────────────────────────────────────────────────────────────────────
app.get('/api/deals', (req, res) => {
  const { status, agent } = req.query;
  let where = ['1=1'];
  let params = [];
  if (status) { where.push(`d.status=?`); params.push(status); }
  if (agent) { where.push(`d.assigned_agent_id=?`); params.push(agent); }

  const rows = db.prepare(`
    SELECT d.*, c.full_name as customer_name, c.phone as customer_phone,
           p.title as property_title, p.property_code, p.property_type,
           u.name as agent_name
    FROM deals d
    LEFT JOIN customers c ON d.customer_id=c.id
    LEFT JOIN properties p ON d.property_id=p.id
    LEFT JOIN users u ON d.assigned_agent_id=u.id
    WHERE ${where.join(' AND ')} ORDER BY d.updated_at DESC
  `).all(...params);
  res.json(rows);
});

app.post('/api/deals', (req, res) => {
  const d = req.body;
  const code = `DEAL${String(Date.now()).slice(-4)}`;
  const prop = db.prepare(`SELECT commission_rate, sale_price FROM properties WHERE id=?`).get(d.property_id);
  const commAmt = (d.sale_price || prop?.sale_price || 0) * (prop?.commission_rate || 3) / 100;
  const r = db.prepare(`INSERT INTO deals (deal_code, customer_id, property_id, status, assigned_agent_id, sale_price, commission_amount, note) VALUES (?,?,?,?,?,?,?,?)`).run(code,d.customer_id,d.property_id,d.status||'เสนอทรัพย์',d.assigned_agent_id,d.sale_price||prop?.sale_price||0,commAmt,d.note);
  res.json({ id: r.lastInsertRowid, deal_code: code });
});

app.get('/api/deals/:id', (req, res) => {
  const deal = db.prepare(`
    SELECT d.*, c.full_name as customer_name, c.phone as customer_phone,
           p.title as property_title, p.property_code, p.sale_price as property_price,
           u.name as agent_name
    FROM deals d
    LEFT JOIN customers c ON d.customer_id=c.id
    LEFT JOIN properties p ON d.property_id=p.id
    LEFT JOIN users u ON d.assigned_agent_id=u.id
    WHERE d.id=?
  `).get(req.params.id);
  if (!deal) return res.status(404).json({ error: 'Not found' });
  res.json(deal);
});

app.patch('/api/deals/:id/status', (req, res) => {
  const newStatus = req.body.status;
  db.prepare(`UPDATE deals SET status=?, updated_at=datetime('now','localtime') WHERE id=?`).run(newStatus, req.params.id);
  const deal = db.prepare(`SELECT * FROM deals WHERE id=?`).get(req.params.id);
  if (deal) {
    // Sync customer CRM status with deal stage
    const DEAL_TO_CRM = {
      'เสนอทรัพย์':      'กำลังหา/เสนอทรัพย์',
      'นัดชมทรัพย์':     'นัดชมทรัพย์',
      'ต่อรองราคา':      'ต่อรองราคา',
      'วางมัดจำ':        'วางมัดจำ',
      'ยื่นสินเชื่อ':    'ยื่นสินเชื่อ',
      'นัดวันโอน':       'วางมัดจำ',
      'ปิดการขายสำเร็จ': 'ปิดการขายสำเร็จ',
      'ปิดการขายไม่สำเร็จ': 'ปิดการขายไม่สำเร็จ',
    };
    const crmStatus = DEAL_TO_CRM[newStatus];
    if (crmStatus) {
      db.prepare(`UPDATE customers SET status=?, updated_at=datetime('now','localtime') WHERE id=?`).run(crmStatus, deal.customer_id);
    }
    if (newStatus === 'ปิดการขายสำเร็จ' && deal.property_id) {
      db.prepare(`UPDATE properties SET status='ขายแล้ว', updated_at=datetime('now','localtime') WHERE id=?`).run(deal.property_id);
    }
  }
  res.json({ success: true });
});

app.put('/api/deals/:id', (req, res) => {
  const d = req.body;
  db.prepare(`UPDATE deals SET status=?,sale_price=?,commission_amount=?,note=?,updated_at=datetime('now','localtime') WHERE id=?`).run(d.status,d.sale_price,d.commission_amount,d.note,req.params.id);
  res.json({ success: true });
});

// ─── APPOINTMENTS ─────────────────────────────────────────────────────────────
app.get('/api/appointments', (req, res) => {
  const { date_from, date_to, agent, status } = req.query;
  let where = ['1=1'];
  let params = [];
  if (date_from) { where.push(`a.appointment_date>=?`); params.push(date_from); }
  if (date_to) { where.push(`a.appointment_date<=?`); params.push(date_to); }
  if (agent) { where.push(`a.assigned_agent_id=?`); params.push(agent); }
  if (status) { where.push(`a.status=?`); params.push(status); }

  const rows = db.prepare(`
    SELECT a.*, c.full_name as customer_name, c.phone as customer_phone,
           p.title as property_title, p.property_code,
           u.name as agent_name
    FROM appointments a
    LEFT JOIN customers c ON a.customer_id=c.id
    LEFT JOIN properties p ON a.property_id=p.id
    LEFT JOIN users u ON a.assigned_agent_id=u.id
    WHERE ${where.join(' AND ')} ORDER BY a.appointment_date ASC, a.appointment_time ASC
  `).all(...params);
  res.json(rows);
});

app.post('/api/appointments', (req, res) => {
  const d = req.body;
  const r = db.prepare(`INSERT INTO appointments (type, customer_id, property_id, deal_id, assigned_agent_id, appointment_date, appointment_time, status, note) VALUES (?,?,?,?,?,?,?,?,?)`).run(d.type,d.customer_id||null,d.property_id||null,d.deal_id||null,d.assigned_agent_id||null,d.appointment_date,d.appointment_time,d.status||'รอดำเนินการ',d.note);
  res.json({ id: r.lastInsertRowid });
});

app.put('/api/appointments/:id', (req, res) => {
  const d = req.body;
  db.prepare(`UPDATE appointments SET type=?,customer_id=?,property_id=?,appointment_date=?,appointment_time=?,status=?,note=? WHERE id=?`).run(d.type,d.customer_id||null,d.property_id||null,d.appointment_date,d.appointment_time,d.status,d.note,req.params.id);
  res.json({ success: true });
});

app.patch('/api/appointments/:id/status', (req, res) => {
  db.prepare(`UPDATE appointments SET status=? WHERE id=?`).run(req.body.status, req.params.id);
  res.json({ success: true });
});

app.delete('/api/appointments/:id', (req, res) => {
  db.prepare(`DELETE FROM appointments WHERE id=?`).run(req.params.id);
  res.json({ success: true });
});

// ─── COMMISSIONS / REPORTS ────────────────────────────────────────────────────
app.get('/api/reports/commissions', (req, res) => {
  const { year, month } = req.query;
  let where = [`d.status='ปิดการขายสำเร็จ'`];
  let params = [];
  if (year) { where.push(`strftime('%Y',c2.received_date)=?`); params.push(year); }
  if (month) { where.push(`strftime('%m',c2.received_date)=?`); params.push(month.padStart(2,'0')); }

  const deals = db.prepare(`
    SELECT d.*, cu.full_name as customer_name, p.title as property_title,
           p.property_code, u.name as agent_name,
           c2.amount as commission_paid, c2.received_date
    FROM deals d
    LEFT JOIN customers cu ON d.customer_id=cu.id
    LEFT JOIN properties p ON d.property_id=p.id
    LEFT JOIN users u ON d.assigned_agent_id=u.id
    LEFT JOIN commissions c2 ON c2.deal_id=d.id
    WHERE ${where.join(' AND ')} ORDER BY d.updated_at DESC
  `).all(...params);

  const summary = db.prepare(`
    SELECT COALESCE(SUM(amount),0) as total, COUNT(*) as count FROM commissions WHERE 1=1
    ${year ? `AND strftime('%Y',received_date)=?` : ''}
  `).get(...(year ? [year] : []));

  const by_agent = db.prepare(`
    SELECT u.name as agent_name, COALESCE(SUM(d.commission_amount),0) as total, COUNT(d.id) as count
    FROM deals d LEFT JOIN users u ON d.assigned_agent_id=u.id
    WHERE d.status='ปิดการขายสำเร็จ'
    GROUP BY d.assigned_agent_id ORDER BY total DESC
  `).all();

  res.json({ deals, summary, by_agent });
});

app.post('/api/commissions', (req, res) => {
  const d = req.body;
  const r = db.prepare(`INSERT INTO commissions (deal_id, amount, received_date, note) VALUES (?,?,?,?)`).run(d.deal_id, d.amount, d.received_date, d.note);
  db.prepare(`UPDATE deals SET commission_received=1, updated_at=datetime('now','localtime') WHERE id=?`).run(d.deal_id);
  res.json({ id: r.lastInsertRowid });
});

// ─── USERS ────────────────────────────────────────────────────────────────────
app.get('/api/users', (req, res) => {
  res.json(db.prepare(`SELECT id, name, email, role, phone FROM users ORDER BY id`).all());
});

// ─── ZONES ────────────────────────────────────────────────────────────────────
app.get('/api/zones', (req, res) => {
  const zones = db.prepare(`
    SELECT z.id, z.name, z.province, z.sort_order,
           COUNT(p.id) as property_count
    FROM zones z
    LEFT JOIN properties p ON p.zone = z.name
    GROUP BY z.id
    ORDER BY z.sort_order, z.name
  `).all();
  res.json(zones);
});

app.post('/api/zones', (req, res) => {
  const { name, province } = req.body;
  if (!name) return res.status(400).json({ error: 'ต้องระบุชื่อโซน' });
  try {
    const maxOrder = db.prepare('SELECT MAX(sort_order) as m FROM zones').get();
    const nextOrder = (maxOrder['m'] || 0) + 1;
    const r = db.prepare(`INSERT INTO zones (name, province, sort_order) VALUES (?,?,?)`).run(name.trim(), province || 'ขอนแก่น', nextOrder);
    res.json({ id: r.lastInsertRowid, name: name.trim() });
  } catch(e) {
    if (e.message.includes('UNIQUE')) return res.status(400).json({ error: 'ชื่อโซนซ้ำ' });
    res.status(500).json({ error: e.message });
  }
});

app.delete('/api/zones/:id', (req, res) => {
  db.prepare(`DELETE FROM zones WHERE id=?`).run(req.params.id);
  res.json({ success: true });
});

// ─── MATCHING ─────────────────────────────────────────────────────────────────
app.get('/api/match/:customer_id', (req, res) => {
  const customer = db.prepare(`SELECT * FROM customers WHERE id=?`).get(req.params.customer_id);
  if (!customer) return res.status(404).json({ error: 'Not found' });

  const properties = db.prepare(`SELECT * FROM properties WHERE status='พร้อมขาย'`).all();

  const results = properties.map(p => {
    let score = 0;
    let reasons = [];

    if (p.property_type === customer.property_type_interest) { score += 30; reasons.push('ประเภทตรง'); }
    if (p.sale_price >= customer.budget_min && p.sale_price <= customer.budget_max) { score += 25; reasons.push('ราคาอยู่ในงบ'); }
    else if (p.sale_price <= customer.budget_max * 1.1) { score += 12; reasons.push('ราคาใกล้เคียงงบ'); }
    if (customer.preferred_location && p.province && customer.preferred_location.includes(p.province)) { score += 20; reasons.push('ทำเลตรง'); }
    if (customer.purchase_purpose === 'ลงทุน' && p.highlights && p.highlights.includes('ลงทุน')) { score += 10; reasons.push('เหมาะลงทุน'); }
    if (customer.purchase_purpose === 'อยู่เอง' && p.zone) { score += 5; }

    return { ...p, score, reasons, match_level: score >= 70 ? 'ตรงมาก' : score >= 50 ? 'ตรงปานกลาง' : 'ตรงบางส่วน' };
  }).filter(p => p.score >= 30).sort((a,b) => b.score - a.score);

  res.json({ customer, matches: results });
});

// ─── SPA Fallback ──────────────────────────────────────────────────────────────
app.get('*', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

app.listen(PORT, () => {
  console.log(`\n  REBOMS Server running at http://localhost:${PORT}\n`);
});
