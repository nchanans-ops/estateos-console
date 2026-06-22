const { DatabaseSync } = require('node:sqlite');
const path = require('path');

const DB_PATH = process.env.DB_PATH || path.join(require('os').tmpdir(), 'reboms.db');
const db = new DatabaseSync(DB_PATH);

// Enable foreign keys
db.exec("PRAGMA foreign_keys = ON");

function initDB() {
  db.exec(`
    CREATE TABLE IF NOT EXISTS users (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      name TEXT NOT null,
      email TEXT UNIQUE NOT null,
      role TEXT NOT null DEFAULT 'agent',
      phone TEXT,
      avatar TEXT,
      created_at TEXT DEFAULT CURRENT_TIMESTAMP
    );

    CREATE TABLE IF NOT EXISTS property_owners (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      owner_code TEXT UNIQUE NOT null,
      owner_name TEXT NOT null,
      phone TEXT,
      line_id TEXT,
      email TEXT,
      sale_condition TEXT,
      readiness_status TEXT DEFAULT 'พร้อมขายทันที',
      commission_agreement TEXT,
      listing_start_date TEXT,
      listing_end_date TEXT,
      note TEXT,
      created_at TEXT DEFAULT CURRENT_TIMESTAMP
    );

    CREATE TABLE IF NOT EXISTS customers (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      customer_code TEXT UNIQUE NOT null,
      full_name TEXT NOT null,
      phone TEXT,
      line_id TEXT,
      facebook TEXT,
      email TEXT,
      source TEXT DEFAULT 'Facebook',
      property_type_interest TEXT,
      budget_min REAL DEFAULT 0,
      budget_max REAL DEFAULT 0,
      preferred_location TEXT,
      purchase_purpose TEXT DEFAULT 'อยู่เอง',
      urgency TEXT DEFAULT '1-3 เดือน',
      loan_capacity TEXT DEFAULT 'อยู่ระหว่างตรวจสอบ',
      status TEXT DEFAULT 'ลูกค้าใหม่',
      assigned_agent_id INTEGER,
      next_followup_date TEXT,
      internal_note TEXT,
      created_at TEXT DEFAULT CURRENT_TIMESTAMP,
      updated_at TEXT DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (assigned_agent_id) REFERENCES users(id)
    );

    CREATE TABLE IF NOT EXISTS follow_ups (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      customer_id INTEGER NOT null,
      user_id INTEGER,
      contact_type TEXT DEFAULT 'โทรศัพท์',
      note TEXT,
      created_at TEXT DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (customer_id) REFERENCES customers(id),
      FOREIGN KEY (user_id) REFERENCES users(id)
    );

    CREATE TABLE IF NOT EXISTS properties (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      property_code TEXT UNIQUE NOT null,
      property_type TEXT NOT null,
      property_subtype TEXT,
      title TEXT NOT null,
      status TEXT DEFAULT 'พร้อมขาย',
      owner_id INTEGER,
      province TEXT,
      district TEXT,
      subdistrict TEXT,
      village_project TEXT,
      address_detail TEXT,
      zone TEXT,
      gps_lat REAL,
      gps_lng REAL,
      nearby_places TEXT,
      sale_price REAL DEFAULT 0,
      appraisal_price REAL DEFAULT 0,
      min_acceptable_price REAL DEFAULT 0,
      commission_rate REAL DEFAULT 3,
      commission_amount REAL DEFAULT 0,
      transfer_fee_condition TEXT DEFAULT 'ออกคนละครึ่ง',
      highlights TEXT,
      property_details TEXT DEFAULT '{}',
      marketing_data TEXT DEFAULT '{}',
      internal_note TEXT,
      assigned_agent_id INTEGER,
      created_at TEXT DEFAULT CURRENT_TIMESTAMP,
      updated_at TEXT DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (owner_id) REFERENCES property_owners(id),
      FOREIGN KEY (assigned_agent_id) REFERENCES users(id)
    );

    CREATE TABLE IF NOT EXISTS deals (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      deal_code TEXT UNIQUE NOT null,
      customer_id INTEGER NOT null,
      property_id INTEGER NOT null,
      status TEXT DEFAULT 'ลูกค้าใหม่',
      assigned_agent_id INTEGER,
      sale_price REAL DEFAULT 0,
      commission_amount REAL DEFAULT 0,
      commission_received INTEGER DEFAULT 0,
      note TEXT,
      created_at TEXT DEFAULT CURRENT_TIMESTAMP,
      updated_at TEXT DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (customer_id) REFERENCES customers(id),
      FOREIGN KEY (property_id) REFERENCES properties(id),
      FOREIGN KEY (assigned_agent_id) REFERENCES users(id)
    );

    CREATE TABLE IF NOT EXISTS appointments (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      type TEXT NOT null DEFAULT 'นัดโทรกลับ',
      customer_id INTEGER,
      property_id INTEGER,
      deal_id INTEGER,
      assigned_agent_id INTEGER,
      appointment_date TEXT NOT null,
      appointment_time TEXT,
      status TEXT DEFAULT 'รอดำเนินการ',
      note TEXT,
      created_at TEXT DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (customer_id) REFERENCES customers(id),
      FOREIGN KEY (property_id) REFERENCES properties(id),
      FOREIGN KEY (assigned_agent_id) REFERENCES users(id)
    );

    CREATE TABLE IF NOT EXISTS commissions (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      deal_id INTEGER NOT null,
      amount REAL NOT null,
      received_date TEXT,
      note TEXT,
      created_at TEXT DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (deal_id) REFERENCES deals(id)
    );

    CREATE TABLE IF NOT EXISTS activity_logs (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      user_id INTEGER,
      action TEXT NOT null,
      entity_type TEXT,
      entity_id INTEGER,
      detail TEXT,
      created_at TEXT DEFAULT CURRENT_TIMESTAMP
    );

    CREATE TABLE IF NOT EXISTS zones (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      name TEXT UNIQUE NOT null,
      province TEXT DEFAULT 'ขอนแก่น',
      sort_order INTEGER DEFAULT 0,
      created_at TEXT DEFAULT CURRENT_TIMESTAMP
    );
  `);

  seedData();
}

function seedData() {
  const count = db.prepare('SELECT COUNT(*) as c FROM users').get();
  if (count['c'] > 0) return;

  console.log('Seeding demo data...');

  // Users
  const insertUser = db.prepare(`INSERT INTO users (name, email, role, phone) VALUES (?,?,?,?)`);
  insertUser.run('วิชัย สุขสบาย (เจ้าของ)', 'owner@reboms.com', 'owner', '081-000-0001');
  insertUser.run('สมหมาย รักงาน', 'agent1@reboms.com', 'agent', '081-111-1111');
  insertUser.run('กนกวรรณ ขยันดี', 'agent2@reboms.com', 'agent', '082-222-2222');
  insertUser.run('ประกาย แอดมิน', 'admin@reboms.com', 'admin', '083-333-3333');

  // Property Owners
  const insertOwner = db.prepare(`INSERT INTO property_owners (owner_code, owner_name, phone, line_id, sale_condition, readiness_status, commission_agreement, listing_start_date, listing_end_date) VALUES (?,?,?,?,?,?,?,?,?)`);
  insertOwner.run('OWN001','คุณนภา ทรัพย์มาก','089-001-0001','napa_house','ขายเร็ว ลดได้','พร้อมขายทันที','3%','2026-01-01','2026-12-31');
  insertOwner.run('OWN002','คุณสุรชัย มีที่','089-002-0002','surachai_land','ไม่รีบขาย','พร้อมขายทันที','3%','2026-02-01','2026-12-31');
  insertOwner.run('OWN003','คุณมาลี คอนโดดี','089-003-0003','malee_condo','ขาย+เฟอร์ครบ','พร้อมขายทันที','2.5%','2026-01-15','2026-12-31');
  insertOwner.run('OWN004','ห้างหุ้นส่วน ABC','089-004-0004','abc_biz','ขายพร้อมกิจการ','รอเคลียร์เอกสาร','3%','2026-03-01','2026-12-31');
  insertOwner.run('OWN005','คุณรัตนา ที่นา','089-005-0005','rattana_land','เจรจาได้','พร้อมขายทันที','3%','2026-01-01','2026-12-31');

  // Properties
  const insertProp = db.prepare(`INSERT INTO properties (property_code, property_type, property_subtype, title, status, owner_id, province, district, village_project, zone, sale_price, appraisal_price, min_acceptable_price, commission_rate, commission_amount, transfer_fee_condition, highlights, property_details, assigned_agent_id) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`);

  insertProp.run('H001','บ้าน','บ้านเดี่ยว','บ้านเดี่ยว 2 ชั้น โครงการเพชรบ้านเป็ด ขอนแก่น','พร้อมขาย',1,'ขอนแก่น','เมือง','โครงการเพชรบ้านเป็ด','บ้านเป็ด',3500000,3200000,3200000,3,105000,'ออกคนละครึ่ง','หลังมุม ถนนกว้าง ใกล้ห้างโลตัส',JSON.stringify({floors:2,bedrooms:3,bathrooms:2,parking:2,land_sqw:54,usable_area:160,house_age:5,condition:'มือสอง',furniture:'เฟอร์บางส่วน',direction:'ตะวันออก',monthly_fee:500}),2);

  insertProp.run('H002','บ้าน','ทาวน์โฮม','ทาวน์โฮม 3 ชั้น ใกล้เซ็นทรัลขอนแก่น','พร้อมขาย',1,'ขอนแก่น','เมือง','โครงการริมบึง','ในเมือง',2200000,2000000,1900000,3,66000,'ผู้ขายออก','ใกล้โรงพยาบาลขอนแก่น ราคาต่ำกว่าประเมิน ฟรีโอน',JSON.stringify({floors:3,bedrooms:3,bathrooms:3,parking:1,land_sqw:22,usable_area:120,house_age:3,condition:'ใหม่',furniture:'เฟอร์ครบ',direction:'เหนือ',monthly_fee:1200}),2);

  insertProp.run('C001','คอนโด','คอนโดมือสอง','คอนโด 1 ห้องนอน วิวบึงแก่นนคร ใจกลางเมือง','พร้อมขาย',3,'ขอนแก่น','เมือง','เดอะ เนสท์ ขอนแก่น','ในเมือง',1800000,1700000,1600000,3,54000,'ออกคนละครึ่ง','วิวบึง ชั้นสูง เฟอร์ครบ ใกล้เซ็นทรัล',JSON.stringify({project:'เดอะ เนสท์ ขอนแก่น',building:'A',floor:12,room_number:'1208',total_floors:16,size_sqm:35,bedrooms:1,bathrooms:1,view:'วิวบึงแก่นนคร',furniture:'เฟอร์ครบ',appliances:'ครบ',monthly_fee:2500,parking:1,facilities:['สระว่ายน้ำ','ฟิตเนส','รปภ.','ลิฟต์'],ownership:'โควตาไทย'}),3);

  insertProp.run('C002','คอนโด','คอนโดมือสอง','คอนโด Studio ใกล้ ม.ขอนแก่น น่าลงทุน','พร้อมขาย',3,'ขอนแก่น','เมือง','เคไอ เรสซิเดนซ์','สีฐาน',850000,900000,800000,3,25500,'ผู้ซื้อออก','ใกล้ มข. ให้เช่าได้ดี ROI 7%/ปี',JSON.stringify({project:'เคไอ เรสซิเดนซ์',building:'B',floor:5,room_number:'511',total_floors:8,size_sqm:28,bedrooms:0,bathrooms:1,view:'วิวสวน',furniture:'เฟอร์ครบ',appliances:'ครบ',monthly_fee:1500,parking:0,facilities:['รปภ.','ลิฟต์'],ownership:'โควตาไทย'}),3);

  insertProp.run('L001','ที่ดิน','ที่ดินเปล่า','ที่ดิน 3 ไร่ ติดถนนมิตรภาพ โซนบ้านทุ่ม','พร้อมขาย',2,'ขอนแก่น','เมือง','','บ้านทุ่ม',4500000,4000000,4000000,3,135000,'ออกคนละครึ่ง','ติดถนนมิตรภาพ โฉนดพร้อมโอน เหมาะสร้างหอพัก',JSON.stringify({rai:3,ngan:0,sqw:0,frontage:40,depth:120,shape:'สี่เหลี่ยม',road_width:4,road_type:'ถนนลาดยาง',electricity:true,water:true,internet:false,title_deed:'โฉนด',suitable_for:['สร้างบ้าน','ทำโกดัง','ทำหอพัก','ลงทุน']}),2);

  insertProp.run('L002','ที่ดิน','ที่ดินเปล่า','ที่ดิน 5 ไร่ โซนกังสดาล ใกล้ถนนใหญ่','พร้อมขาย',5,'ขอนแก่น','เมือง','','กังสดาล',2800000,2500000,2500000,3,84000,'ออกคนละครึ่ง','เหมาะทำโครงการบ้านจัดสรร ถนนคอนกรีต',JSON.stringify({rai:5,ngan:0,sqw:0,frontage:60,depth:280,shape:'สี่เหลี่ยม',road_width:4,road_type:'ถนนคอนกรีต',electricity:true,water:true,internet:false,title_deed:'โฉนด',suitable_for:['ทำโครงการ','สร้างบ้าน','ลงทุน']}),2);

  insertProp.run('B001','อาคารพาณิชย์','อาคารพาณิชย์','อาคารพาณิชย์ 4 ชั้น ย่านการค้า ถนนหน้าเมือง','จองแล้ว',4,'ขอนแก่น','เมือง','','ในเมือง',8500000,8000000,7500000,3,255000,'ออกคนละครึ่ง','ติดถนนใหญ่ ย่านการค้า ผู้เช่าเต็ม',JSON.stringify({floors:4,frontage:6,depth:18,land_sqw:27,usable_area:432,bathrooms:4,multipurpose_rooms:8,parking:2,building_condition:'ดีมาก',location_type:'ย่านการค้า',suitable_for:['เปิดร้าน','ทำออฟฟิศ','ปล่อยเช่า']}),2);

  insertProp.run('R001','อสังหาริมทรัพย์เพื่อธุรกิจ','หอพัก','หอพัก 30 ห้อง ใกล้ มข. โซนสีฐาน','พร้อมขาย',4,'ขอนแก่น','เมือง','','สีฐาน',12000000,11000000,11000000,3,360000,'ออกคนละครึ่ง','รายได้ 60,000/เดือน เช่าเต็ม 100%',JSON.stringify({rooms:30,floors:4,land_sqw:100,usable_area:600,monthly_income:60000,occupancy_rate:100,monthly_expense:8000,lease_contract:'รายปี',investor_type:'Passive Income',business_highlights:'เช่าเต็ม ทำเลดี ใกล้ มข.'}),3);

  insertProp.run('RENT001','ทรัพย์ให้เช่า','คอนโดเช่า','คอนโดให้เช่า 1 ห้องนอน ใกล้เซ็นทรัลขอนแก่น','พร้อมขาย',3,'ขอนแก่น','เมือง','เดอะ เนสท์ ขอนแก่น','ในเมือง',12000,0,0,0,0,'ผู้เช่าออก','ตกแต่งสวย เฟอร์ครบ ใกล้เซ็นทรัล',JSON.stringify({rental_price:12000,deposit:24000,advance_payment:12000,min_contract:6,tenant_condition:'ไม่เลี้ยงสัตว์',furniture:'เฟอร์ครบ',available_date:'2026-07-01',pets_allowed:false}),3);

  // Customers
  const insertCust = db.prepare(`INSERT INTO customers (customer_code, full_name, phone, line_id, source, property_type_interest, budget_min, budget_max, preferred_location, purchase_purpose, urgency, loan_capacity, status, assigned_agent_id, next_followup_date, internal_note) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`);

  insertCust.run('CUS001','สมชาย ใจดี','081-100-0001','somchai_jd','TikTok','บ้าน',3000000,5000000,'เชียงใหม่','อยู่เอง','1-3 เดือน','กู้ได้แน่นอน','กำลังหา/เสนอทรัพย์',2,'2026-06-22','ลูกค้าซื้อบ้านเดี่ยว ต้องการ 3 ห้องนอน ใกล้สนามบิน');
  insertCust.run('CUS002','สุดา มีสุข','082-200-0002','suda_ms','Facebook','คอนโด',1500000,2500000,'เชียงใหม่ ใจกลางเมือง','ลงทุน','ทันที','กู้ได้แน่นอน','นัดชมทรัพย์',3,'2026-06-22','นักลงทุน สนใจคอนโดใกล้นิมมาน ให้เช่าต่อ');
  insertCust.run('CUS003','ประเสริฐ สว่างใจ','083-300-0003','prasert_sw','LINE','ที่ดิน',4000000,8000000,'นครราชสีมา','ลงทุน','3-6 เดือน','อยู่ระหว่างตรวจสอบ','ต่อรองราคา',2,'2026-06-25','ต้องการที่ดินติดถนน สร้างโกดัง');
  insertCust.run('CUS004','วนิดา ดีใจ','084-400-0004','wanida_dj','เพื่อนแนะนำ','บ้าน',2000000,3500000,'เชียงใหม่','อยู่เอง','ทันที','กู้ได้แน่นอน','ยื่นสินเชื่อ',2,'2026-06-23','ยื่นกู้ธนาคารกสิกร รอผล 2-3 สัปดาห์');
  insertCust.run('CUS005','อนุชา รักดี','085-500-0005','anucha_rd','ป้ายประกาศ','อาคารพาณิชย์',8000000,15000000,'เชียงใหม่','ลงทุน','3-6 เดือน','ไม่กู้','ลูกค้าใหม่',2,'2026-06-21','จะซื้อด้วยเงินสด ต้องการอาคารพาณิชย์ทำเล ดี');
  insertCust.run('CUS006','กมล ธนรักษ์','086-600-0006','kamol_tr','TikTok','บ้าน',1500000,2500000,'เชียงใหม่','อยู่เอง','1-3 เดือน','อยู่ระหว่างตรวจสอบ','ติดต่อกลับแล้ว',3,'2026-06-23','มีเงินดาวน์ 20% รอเช็คเครดิต');
  insertCust.run('CUS007','ปิยะ มั่นคง','087-700-0007','piya_mk','Facebook','คอนโด',800000,1200000,'เชียงใหม่ ใกล้มหาวิทยาลัย','ลงทุน','1-3 เดือน','กู้ได้แน่นอน','คัดกรองแล้ว',3,'2026-06-24','ต้องการ Yield 6%+ ขึ้นไป');
  insertCust.run('CUS008','ลักษณา พงษ์ดี','088-800-0008','laksana_pd','LINE','บ้าน',4000000,7000000,'เชียงใหม่','ซื้อให้ครอบครัว','มากกว่า 6 เดือน','อยู่ระหว่างตรวจสอบ','พักการติดตาม',2,'2026-07-15','ยังไม่พร้อมซื้อ ติดตาม ก.ค. 69');
  insertCust.run('CUS009','ธนพล สุขเสมอ','089-900-0009','thanapol_ss','TikTok','ที่ดิน',2000000,4000000,'เชียงใหม่','ลงทุน','3-6 เดือน','กู้ได้แน่นอน','เสนอทรัพย์',3,'2026-06-24','ต้องการที่ดินทำสวน/รีสอร์ต');
  insertCust.run('CUS010','ชญาดา รุ่งเรือง','090-010-0010','chayada_rr','เพื่อนแนะนำ','คอนโด',1000000,2000000,'เชียงใหม่','ปล่อยเช่า','ทันที','กู้ได้แน่นอน','ปิดการขายสำเร็จ',3,null,'ปิดดีลสำเร็จ คอนโด C002 ราคา 850,000');
  insertCust.run('CUS011','สรรพวุฒิ ดีงาม','090-011-0011','sapwut_dn','Facebook','บ้าน',2500000,4000000,'เชียงใหม่','อยู่เอง','1-3 เดือน','กู้ได้แน่นอน','ชมทรัพย์แล้ว',2,'2026-06-22','ชมบ้าน H002 แล้ว ชอบ รอตัดสินใจ');
  insertCust.run('CUS012','อมรรัตน์ ใหม่สด','090-012-0012','amorn_ms','Walk-in','อาคารพาณิชย์',5000000,10000000,'เชียงใหม่','ลงทุน','3-6 เดือน','ไม่กู้','ลูกค้าใหม่',2,'2026-06-21','เดินเข้ามาสอบถามที่สำนักงาน');

  // Follow-ups
  const insertFU = db.prepare(`INSERT INTO follow_ups (customer_id, user_id, contact_type, note, created_at) VALUES (?,?,?,?,?)`);
  insertFU.run(1,2,'LINE','ส่งข้อมูลบ้าน H001 และ H002 ให้ดูแล้ว ลูกค้าสนใจ H001 มากกว่า','2026-06-15 10:00:00');
  insertFU.run(1,2,'โทรศัพท์','โทรติดตาม ลูกค้าบอกยังอยู่ระหว่างตัดสินใจ นัดดูบ้านสัปดาห์หน้า','2026-06-18 14:30:00');
  insertFU.run(2,3,'LINE','ส่งข้อมูลคอนโด C001 วิวดอย ลูกค้าสนใจมาก','2026-06-16 09:00:00');
  insertFU.run(2,3,'โทรศัพท์','โทรยืนยันนัดชมทรัพย์ 22 มิ.ย. 10:00 น.','2026-06-19 11:00:00');
  insertFU.run(4,2,'โทรศัพท์','ยื่นกู้ธนาคารกสิกรแล้ว รอผล 2-3 สัปดาห์','2026-06-10 09:00:00');
  insertFU.run(4,2,'LINE','แจ้งลูกค้าว่ายังรอผลธนาคาร','2026-06-17 13:00:00');
  insertFU.run(11,2,'LINE','ส่งข้อมูล H002 ให้ดูก่อนชม','2026-06-18 08:00:00');
  insertFU.run(11,2,'นัดชม','ไปชมบ้าน H002 พร้อมกัน ลูกค้าถูกใจ','2026-06-20 10:00:00');

  // Deals
  const insertDeal = db.prepare(`INSERT INTO deals (deal_code, customer_id, property_id, status, assigned_agent_id, sale_price, commission_amount, commission_received, note) VALUES (?,?,?,?,?,?,?,?,?)`);
  insertDeal.run('DEAL001',1,1,'เสนอทรัพย์',2,3500000,105000,0,'ลูกค้าสนใจ H001 กำลังพิจารณา');
  insertDeal.run('DEAL002',2,3,'นัดชมทรัพย์',3,1800000,54000,0,'นัดชมคอนโด C001 22 มิ.ย.');
  insertDeal.run('DEAL003',3,5,'ต่อรองราคา',2,4500000,135000,0,'ต่อรองราคาที่ดิน L001 ลูกค้าเสนอ 4.2M');
  insertDeal.run('DEAL004',4,2,'ยื่นสินเชื่อ',2,2200000,66000,0,'ยื่นกู้ธนาคารกสิกร รอผลอนุมัติ');
  insertDeal.run('DEAL005',10,4,'ปิดการขายสำเร็จ',3,850000,25500,1,'ปิดดีลสำเร็จ โอนแล้ว 15 มิ.ย. 2569');
  insertDeal.run('DEAL006',9,6,'เสนอทรัพย์',3,2800000,84000,0,'เสนอที่สวน L002 เชียงใหม่');

  // Appointments
  const insertAppt = db.prepare(`INSERT INTO appointments (type, customer_id, property_id, deal_id, assigned_agent_id, appointment_date, appointment_time, status, note) VALUES (?,?,?,?,?,?,?,?,?)`);
  insertAppt.run('นัดชมทรัพย์',2,3,2,3,'2026-06-22','10:00','รอดำเนินการ','นัดชมคอนโด C001 ลูกค้าสนใจมาก');
  insertAppt.run('นัดโทรกลับ',5,null,null,2,'2026-06-21','14:00','รอดำเนินการ','โทรสอบถามความต้องการเพิ่ม');
  insertAppt.run('นัดชมทรัพย์',1,1,1,2,'2026-06-24','09:00','รอดำเนินการ','นัดชมบ้าน H001 ครั้งที่ 2');
  insertAppt.run('นัดส่งข้อมูล',9,6,6,3,'2026-06-22','15:00','รอดำเนินการ','ส่งข้อมูลที่สวน L002 พร้อมแผนที่');
  insertAppt.run('นัดเจ้าของทรัพย์',null,7,null,2,'2026-06-23','11:00','รอดำเนินการ','คุยเรื่องราคา B001 กับเจ้าของ');
  insertAppt.run('นัดชมทรัพย์',11,2,null,2,'2026-06-25','10:00','รอดำเนินการ','นัดชม H002 ครั้งที่ 2 พร้อมผู้ดูแลบ้าน');
  insertAppt.run('นัดโทรกลับ',6,null,null,3,'2026-06-23','13:00','รอดำเนินการ','ติดตามผลเช็คเครดิต CUS006');
  insertAppt.run('นัดชมทรัพย์',7,4,null,3,'2026-06-26','14:00','รอดำเนินการ','ชมคอนโด C002 ใกล้ มช.');

  // Commission for closed deal
  db.prepare(`INSERT INTO commissions (deal_id, amount, received_date, note) VALUES (?,?,?,?)`).run(5,25500,'2026-06-15','ค่านายหน้า DEAL005 คอนโด C002');

  // Seed zones (Khon Kaen)
  const insertZone = db.prepare(`INSERT OR IGNORE INTO zones (name, province, sort_order) VALUES (?,?,?)`);
  const seedZones = [
    'ในเมือง','กังสดาล','สีฐาน','พระลับ','สาวะถี',
    'บ้านเป็ด','บ้านทุ่ม','บ้านค้อ','โนนม่วง','ท่าพระ',
    'ศิลา','หนองแวง','พระยืน','แวงน้อย','น้ำพอง','อุบลรัตน์',
  ];
  seedZones.forEach((name, i) => insertZone.run(name, 'ขอนแก่น', i));

  console.log('Seed data completed.');
}

try { initDB(); } catch(e) { console.error('[DB SEED ERROR]', e.message); }

// Migration: add images column if not exists
try {
  const cols = db.prepare('PRAGMA table_info(properties)').all().map(c => c.name);
  if (!cols.includes('images')) {
    db.exec("ALTER TABLE properties ADD COLUMN images TEXT DEFAULT '[]'");
    console.log('Migration: added images column');
  }
} catch(e) { console.error('[MIGRATION images]', e.message); }

// Migration: create zones table + seed if empty
try {
  db.exec(`CREATE TABLE IF NOT EXISTS zones (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    name TEXT UNIQUE NOT NULL,
    province TEXT DEFAULT 'ขอนแก่น',
    sort_order INTEGER DEFAULT 0,
    created_at TEXT DEFAULT CURRENT_TIMESTAMP
  )`);
  const zoneCount = db.prepare('SELECT COUNT(*) as c FROM zones').get();
  if (zoneCount['c'] === 0) {
    const iz = db.prepare(`INSERT OR IGNORE INTO zones (name, province, sort_order) VALUES (?,?,?)`);
    ['ในเมือง','กังสดาล','สีฐาน','พระลับ','สาวะถี','บ้านเป็ด','บ้านทุ่ม','บ้านค้อ','โนนม่วง','ท่าพระ','ศิลา','หนองแวง','พระยืน','แวงน้อย','น้ำพอง','อุบลรัตน์']
      .forEach((n,i) => iz.run(n,'ขอนแก่น',i));
    console.log('Migration: seeded zones');
  }
} catch(e) { console.error('[MIGRATION zones]', e.message); }

module.exports = db;
