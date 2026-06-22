// ─── STATE ────────────────────────────────────────────────────────────────────
const state = { currentPage: 'dashboard', users: [], charts: {} };

// ─── UTILITIES ────────────────────────────────────────────────────────────────
const $ = id => document.getElementById(id);
const fmtPrice = n => n ? Number(n).toLocaleString('th-TH') + ' บาท' : '-';
const fmtNum = n => n ? Number(n).toLocaleString('th-TH') : '0';
const fmtDate = d => d ? new Date(d).toLocaleDateString('th-TH', { year:'numeric', month:'short', day:'numeric' }) : '-';
const fmtDateTime = d => d ? new Date(d).toLocaleString('th-TH', { year:'numeric', month:'short', day:'numeric', hour:'2-digit', minute:'2-digit' }) : '-';
const esc = s => String(s||'').replace(/</g,'&lt;').replace(/>/g,'&gt;');

// ─── API ──────────────────────────────────────────────────────────────────────
async function safeJson(r) {
  const text = await r.text();
  try { return JSON.parse(text); }
  catch(e) { throw new Error(`Server error ${r.status}: ${text.substring(0,120)}`); }
}
const api = {
  get: url => fetch(url).then(safeJson),
  post: (url, data) => fetch(url, { method:'POST', headers:{'Content-Type':'application/json'}, body: JSON.stringify(data) }).then(safeJson),
  put: (url, data) => fetch(url, { method:'PUT', headers:{'Content-Type':'application/json'}, body: JSON.stringify(data) }).then(safeJson),
  patch: (url, data) => fetch(url, { method:'PATCH', headers:{'Content-Type':'application/json'}, body: JSON.stringify(data) }).then(safeJson),
  delete: url => fetch(url, { method:'DELETE' }).then(safeJson),
};

// ─── TOAST ────────────────────────────────────────────────────────────────────
function toast(msg, type = 'success') {
  const t = document.createElement('div');
  const icon = type === 'success' ? '✓' : type === 'error' ? '✗' : 'ℹ';
  t.className = `toast toast-${type}`;
  t.innerHTML = `<span>${icon}</span> ${msg}`;
  $('toast-container').appendChild(t);
  setTimeout(() => t.remove(), 3500);
}

// ─── MODAL ────────────────────────────────────────────────────────────────────
function showModal(html) {
  $('modal-box').innerHTML = html;
  $('modal-backdrop').classList.add('show');
}
function hideModal() {
  $('modal-backdrop').classList.remove('show');
  $('modal-box').innerHTML = '';
}
$('modal-backdrop').addEventListener('click', e => { if (e.target === $('modal-backdrop')) hideModal(); });

// ─── ROUTER ───────────────────────────────────────────────────────────────────
const PAGES = {
  'dashboard': { title: 'Dashboard', subtitle: 'ภาพรวมธุรกิจวันนี้', render: renderDashboard },
  'customers': { title: 'CRM ลูกค้า', subtitle: 'จัดการและติดตามลูกค้า', render: renderCustomers },
  'customer-detail': { title: 'รายละเอียดลูกค้า', subtitle: 'ประวัติและดีลที่เกี่ยวข้อง', render: renderCustomerDetail },
  'properties': { title: 'จัดการทรัพย์สิน', subtitle: 'ทรัพย์สินทั้งหมดในระบบ', render: renderProperties },
  'add-property': { title: 'เพิ่มทรัพย์ใหม่', subtitle: 'บันทึกข้อมูลทรัพย์สิน', render: renderAddProperty },
  'property-detail': { title: 'รายละเอียดทรัพย์', subtitle: 'ข้อมูลทรัพย์สินและดีลที่เกี่ยวข้อง', render: renderPropertyDetail },
  'pipeline': { title: 'Sales Pipeline', subtitle: 'ติดตามสถานะดีลทั้งหมด', render: renderPipeline },
  'appointments': { title: 'นัดหมาย', subtitle: 'ตารางนัดหมายและงานที่ต้องทำ', render: renderAppointments },
  'reports': { title: 'รายงานค่านายหน้า', subtitle: 'สรุปรายได้และผลการดำเนินงาน', render: renderReports },
  'settings': { title: 'ตั้งค่า', subtitle: 'จัดการโซน ข้อมูลระบบ', render: renderSettings },
};

function navigate(page, params = {}) {
  state.currentPage = page;
  state.params = params;
  const p = PAGES[page];
  if (!p) return;
  const titleEl = $('page-title'); if (titleEl) titleEl.textContent = p.title;
  const subEl = $('page-subtitle'); if (subEl) subEl.textContent = p.subtitle;
  document.querySelectorAll('.nav-icon-btn, .nav-link').forEach(a => {
    a.classList.toggle('active', a.dataset.page === page);
  });
  Object.values(state.charts).forEach(c => { try { c.destroy(); } catch(e){} });
  state.charts = {};
  $('main-content').innerHTML = '<div class="flex items-center justify-center py-20"><div class="animate-spin w-8 h-8 border-2 border-navy-700 border-t-transparent rounded-full"></div></div>';
  p.render(params);
}

window.addEventListener('hashchange', () => {
  const hash = location.hash.replace('#', '') || 'dashboard';
  const [page, ...rest] = hash.split('/');
  navigate(page, { id: rest[0] });
});

// ─── STATUS COLORS ────────────────────────────────────────────────────────────
const CUSTOMER_STATUS_COLOR = {
  'ลูกค้าใหม่':'badge-blue','ติดต่อกลับแล้ว':'badge-navy','คัดกรองแล้ว':'badge-purple',
  'กำลังหา/เสนอทรัพย์':'badge-orange','เสนอทรัพย์':'badge-orange',
  'นัดชมทรัพย์':'badge-gold','ชมทรัพย์แล้ว':'badge-yellow',
  'ต่อรองราคา':'badge-orange','ยื่นสินเชื่อ':'badge-purple',
  'วางมัดจำ':'badge-navy','ปิดการขายสำเร็จ':'badge-green',
  'ปิดการขายไม่สำเร็จ':'badge-red','ลูกค้าไม่ตอบกลับ':'badge-red',
  'พักการติดตาม':'badge-gray',
};
const PROPERTY_STATUS_COLOR = {
  'พร้อมขาย':'badge-green','จองแล้ว':'badge-gold','ขายแล้ว':'badge-gray','ระงับขาย':'badge-red',
};
const statusBadge = (s, map) => `<span class="badge ${map[s]||'badge-gray'}">${esc(s)}</span>`;
const custBadge = s => statusBadge(s, CUSTOMER_STATUS_COLOR);
const propBadge = s => statusBadge(s, PROPERTY_STATUS_COLOR);

// ─── PAGE HEADER ──────────────────────────────────────────────────────────────
function pageHeader(title, subtitle, actionsHtml = '') {
  return `
  <div style="display:flex;align-items:flex-end;justify-content:space-between;margin-bottom:24px">
    <div>
      <div style="display:flex;align-items:center;gap:10px;margin-bottom:4px">
        <div style="width:4px;height:28px;background:linear-gradient(180deg,#1B4FD8,#1339A8);border-radius:4px;flex-shrink:0"></div>
        <h2 style="font-size:26px;font-weight:800;color:#0B1220;letter-spacing:-0.5px;line-height:1">${title}</h2>
      </div>
      <p style="font-size:13px;color:#94A3B8;margin-left:14px">${subtitle}</p>
    </div>
    ${actionsHtml ? `<div style="display:flex;align-items:center;gap:8px">${actionsHtml}</div>` : ''}
  </div>`;
}

// ─── DASHBOARD ────────────────────────────────────────────────────────────────
async function renderDashboard() {
  const data = await api.get('/api/dashboard');
  const s = data.stats;
  $('main-content').innerHTML = `
    <div class="space-y-5">
      ${pageHeader('Dashboard', 'ภาพรวมธุรกิจวันนี้')}
      <!-- KPI Cards -->
      <div class="grid grid-cols-2 lg:grid-cols-4 gap-4">
        ${kpiCard('ลูกค้าใหม่วันนี้', s.customers_new_today, 'ทั้งหมด '+fmtNum(s.customers_total)+' ราย', '#1B3A6B', `<path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M16 7a4 4 0 11-8 0 4 4 0 018 0zM12 14a7 7 0 00-7 7h14a7 7 0 00-7-7z"/>`)}
        ${kpiCard('นัดหมายวันนี้', s.appointments_today, 'ต้องติดตาม '+s.customers_followup_today+' ราย', '#C9A84C', `<path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z"/>`)}
        ${kpiCard('ดีลเปิดอยู่', s.deals_active, 'ปิดสำเร็จ '+s.deals_closed+' | หลุด '+s.deals_lost, '#2563eb', `<path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M9 19v-6a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2a2 2 0 002-2zm0 0V9a2 2 0 012-2h2a2 2 0 012 2v10m-6 0a2 2 0 002 2h2a2 2 0 002-2m0 0V5a2 2 0 012-2h2a2 2 0 012 2v14a2 2 0 01-2 2h-2a2 2 0 01-2-2z"/>`)}
        ${kpiCard('รายได้เดือนนี้', fmtNum(s.commission_this_month)+' ฿', 'รวมทั้งหมด '+fmtNum(s.commission_received)+' ฿', '#27ae60', `<path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 8c-1.657 0-3 .895-3 2s1.343 2 3 2 3 .895 3 2-1.343 2-3 2m0-8c1.11 0 2.08.402 2.599 1M12 8V7m0 1v8m0 0v1m0-1c-1.11 0-2.08-.402-2.599-1M21 12a9 9 0 11-18 0 9 9 0 0118 0z"/>`)}
      </div>

      <!-- Charts Row -->
      <div class="grid grid-cols-1 lg:grid-cols-3 gap-4">
        <div class="lg:col-span-2 bg-white rounded-xl p-5 border border-gray-100">
          <h3 class="text-sm font-semibold text-gray-700 mb-4">รายได้ค่านายหน้า (6 เดือนล่าสุด)</h3>
          <canvas id="chart-commission" height="120"></canvas>
        </div>
        <div class="bg-white rounded-xl p-5 border border-gray-100">
          <h3 class="text-sm font-semibold text-gray-700 mb-4">แหล่งที่มาลูกค้า</h3>
          <canvas id="chart-source" height="180"></canvas>
        </div>
      </div>

      <!-- Bottom Row -->
      <div class="grid grid-cols-1 lg:grid-cols-3 gap-4">
        <div class="bg-white rounded-xl p-5 border border-gray-100">
          <h3 class="text-sm font-semibold text-gray-700 mb-3">ทรัพย์สินในระบบ</h3>
          <div class="space-y-2">
            ${[['พร้อมขาย',s.properties_available,'#27ae60'],['จองแล้ว',s.properties_reserved,'#C9A84C'],['ขายแล้ว',s.properties_sold,'#6b7280']].map(([l,v,c])=>`
              <div class="flex items-center justify-between">
                <div class="flex items-center gap-2"><div class="w-3 h-3 rounded-full" style="background:${c}"></div><span class="text-xs text-gray-600">${l}</span></div>
                <span class="text-sm font-bold" style="color:${c}">${v}</span>
              </div>
              <div class="w-full bg-gray-100 rounded-full h-1.5"><div class="h-1.5 rounded-full" style="background:${c};width:${s.properties_total?Math.round(v/s.properties_total*100):0}%"></div></div>
            `).join('')}
            <div class="pt-2 border-t mt-2"><span class="text-xs text-gray-400">ทั้งหมด</span> <span class="font-bold text-sm">${s.properties_total} รายการ</span></div>
          </div>
        </div>
        <div class="bg-white rounded-xl p-5 border border-gray-100">
          <h3 class="text-sm font-semibold text-gray-700 mb-3">สถานะดีล</h3>
          <canvas id="chart-pipeline" height="180"></canvas>
        </div>
        <div class="bg-white rounded-xl p-5 border border-gray-100">
          <h3 class="text-sm font-semibold text-gray-700 mb-3">รายได้ที่คาดการณ์</h3>
          <div class="text-2xl font-bold text-navy-700">${fmtNum(s.commission_potential)} ฿</div>
          <div class="text-xs text-gray-400 mb-4">จาก ${s.deals_active} ดีลที่กำลังดำเนินการ</div>
          <div class="space-y-3">
            <div class="flex justify-between text-xs"><span class="text-gray-500">ได้รับแล้ว</span><span class="font-semibold text-green-600">${fmtNum(s.commission_received)} ฿</span></div>
            <div class="w-full bg-gray-100 rounded-full h-2"><div class="h-2 rounded-full bg-green-500" style="width:${s.commission_potential?Math.min(100,Math.round(s.commission_received/s.commission_potential*100)):100}%"></div></div>
          </div>
        </div>
      </div>

      <!-- Follow-up Today -->
      <div class="bg-white rounded-xl border border-gray-100 overflow-hidden">
        <div class="px-5 py-4 border-b flex items-center justify-between">
          <h3 class="text-sm font-semibold text-gray-700">ลูกค้าที่ต้องติดตามวันนี้ <span class="badge badge-red ml-2">${data.followup_today.length}</span></h3>
          <button onclick="navigate('customers')" class="btn btn-outline btn-sm">ดูทั้งหมด</button>
        </div>
        ${data.followup_today.length ? `
          <table>
            <thead><tr><th>ลูกค้า</th><th>สถานะ</th><th>งบประมาณ</th><th>ผู้ดูแล</th><th></th></tr></thead>
            <tbody>${data.followup_today.map(c=>`
              <tr>
                <td><div class="font-medium text-sm">${esc(c.full_name)}</div><div class="text-xs text-gray-400">${esc(c.phone||'')} · ${esc(c.source||'')}</div></td>
                <td>${custBadge(c.status)}</td>
                <td class="text-xs">${fmtNum(c.budget_min)}-${fmtNum(c.budget_max)} ฿</td>
                <td class="text-xs text-gray-500">${esc(c.agent_name||'-')}</td>
                <td><button onclick="navigate('customer-detail',{id:${c.id}})" class="btn btn-primary btn-xs">ดู</button></td>
              </tr>`).join('')}</tbody>
          </table>` : '<div class="empty-state py-8 text-sm">ไม่มีการติดตามวันนี้</div>'}
      </div>
    </div>`;

  // Charts
  const commLabels = data.monthly_commission.map(r=>r.month).reverse();
  const commData = data.monthly_commission.map(r=>r.total).reverse();
  state.charts.commission = new Chart($('chart-commission'), {
    type:'bar', data:{ labels: commLabels.length ? commLabels : ['ยังไม่มีข้อมูล'], datasets:[{ label:'ค่านายหน้า (฿)', data: commData.length ? commData : [0], backgroundColor:'rgba(27,79,216,0.82)', borderRadius:6 }] },
    options:{ plugins:{ legend:{ display:false } }, scales:{ y:{ ticks:{ callback:v=>fmtNum(v) } } }, responsive:true }
  });
  const srcLabels = data.source_stats.map(r=>r.source);
  state.charts.source = new Chart($('chart-source'), {
    type:'doughnut', data:{ labels: srcLabels.length ? srcLabels : ['ยังไม่มี'], datasets:[{ data: srcLabels.length ? data.source_stats.map(r=>r.count):[1], backgroundColor:['#1B4FD8','#1543B8','#06B6D4','#10B981','#F59E0B','#EF4444'] }] },
    options:{ plugins:{ legend:{ position:'bottom', labels:{ font:{size:11}, boxWidth:10 } } }, responsive:true }
  });
  const plLabels = data.pipeline_stats.map(r=>r.status);
  state.charts.pipeline = new Chart($('chart-pipeline'), {
    type:'bar', data:{ labels: plLabels.length ? plLabels : ['ยังไม่มี'], datasets:[{ label:'จำนวน', data: plLabels.length ? data.pipeline_stats.map(r=>r.count):[0], backgroundColor:'rgba(201,168,76,0.8)', borderRadius:4 }] },
    options:{ indexAxis:'y', plugins:{ legend:{display:false} }, responsive:true, scales:{ x:{ ticks:{stepSize:1} } } }
  });
}
function kpiCard(title, value, sub, color, iconPath) {
  return `<div class="stat-card">
    <div class="stat-icon-box" style="background:${color}18;color:${color}">
      <svg fill="none" stroke="currentColor" viewBox="0 0 24 24">${iconPath}</svg>
    </div>
    <div class="text-2xl font-bold mb-1" style="color:${color}">${value}</div>
    <div class="text-sm font-semibold" style="color:#1E293B">${title}</div>
    <div class="text-xs mt-0.5" style="color:#94A3B8">${sub}</div>
  </div>`;
}

// ─── CUSTOMERS ────────────────────────────────────────────────────────────────
async function renderCustomers(params = {}) {
  let customers = await api.get('/api/customers');
  const users = await api.get('/api/users');

  $('main-content').innerHTML = `
    <div class="space-y-5">
      ${pageHeader('CRM ลูกค้า', 'จัดการและติดตามลูกค้า', `<button onclick="showAddCustomerModal()" class="btn btn-primary"><svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 4v16m8-8H4"/></svg>เพิ่มลูกค้า</button>`)}
      <div class="flex flex-wrap items-center gap-3">
        <div class="filter-bar flex-1">
          <div class="search-bar">
            <svg class="search-icon w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z"/></svg>
            <input type="text" id="search-cust" placeholder="ค้นหาชื่อ เบอร์ รหัส..." class="form-control" style="padding-left:34px;width:220px">
          </div>
          <select id="filter-status" class="form-control" style="width:auto">
            <option value="">สถานะทั้งหมด</option>
            ${['ลูกค้าใหม่','ติดต่อกลับแล้ว','คัดกรองแล้ว','กำลังหา/เสนอทรัพย์','นัดชมทรัพย์','ชมทรัพย์แล้ว','ต่อรองราคา','ยื่นสินเชื่อ','วางมัดจำ','ปิดการขายสำเร็จ','ปิดการขายไม่สำเร็จ','ลูกค้าไม่ตอบกลับ','พักการติดตาม'].map(s=>`<option value="${s}">${s}</option>`).join('')}
          </select>
          <select id="filter-source" class="form-control" style="width:auto">
            <option value="">แหล่งที่มาทั้งหมด</option>
            ${['TikTok','Facebook','LINE','ป้ายประกาศ','เพื่อนแนะนำ','Walk-in'].map(s=>`<option value="${s}">${s}</option>`).join('')}
          </select>
        </div>
      </div>
      <div class="bg-white rounded-xl border border-gray-100 overflow-hidden">
        <div id="customer-table-wrap"></div>
      </div>
    </div>`;

  function renderTable(data) {
    $('customer-table-wrap').innerHTML = data.length ? `
      <table>
        <thead><tr><th>รหัส / ชื่อ</th><th>ช่องทางติดต่อ</th><th>แหล่งที่มา</th><th>ประเภท / งบ</th><th>สถานะ</th><th>ติดตาม</th><th>ผู้ดูแล</th><th></th></tr></thead>
        <tbody>${data.map(c=>`
          <tr style="cursor:pointer" onclick="navigate('customer-detail',{id:${c.id}})">
            <td><div class="font-semibold text-sm text-navy-700">${esc(c.customer_code)}</div><div class="font-medium">${esc(c.full_name)}</div></td>
            <td><div class="text-xs">${esc(c.phone||'')}</div><div class="text-xs text-gray-400">${esc(c.line_id||'')}</div></td>
            <td><span class="badge badge-blue">${esc(c.source||'-')}</span></td>
            <td><div class="text-xs font-medium">${esc(c.property_type_interest||'-')}</div><div class="text-xs text-gray-400">${fmtNum(c.budget_min)}-${fmtNum(c.budget_max)} ฿</div></td>
            <td>${custBadge(c.status)}</td>
            <td class="text-xs ${c.next_followup_date && c.next_followup_date <= new Date().toISOString().split('T')[0] ? 'text-red-600 font-semibold' : 'text-gray-400'}">${fmtDate(c.next_followup_date)}</td>
            <td class="text-xs text-gray-500">${esc(c.agent_name||'-')}</td>
            <td onclick="event.stopPropagation()">
              <button onclick="navigate('customer-detail',{id:${c.id}})" class="btn btn-primary btn-xs mr-1">ดู</button>
              <button onclick="deleteCustomer(${c.id})" class="btn btn-danger btn-xs">ลบ</button>
            </td>
          </tr>`).join('')}</tbody>
      </table>` : '<div class="empty-state">ไม่พบข้อมูลลูกค้า</div>';
  }

  renderTable(customers);

  let filtered = customers;
  function applyFilters() {
    const q = $('search-cust').value.toLowerCase();
    const s = $('filter-status').value;
    const src = $('filter-source').value;
    filtered = customers.filter(c =>
      (!q || c.full_name.toLowerCase().includes(q) || (c.phone||'').includes(q) || (c.customer_code||'').includes(q)) &&
      (!s || c.status === s) &&
      (!src || c.source === src)
    );
    renderTable(filtered);
  }
  $('search-cust').addEventListener('input', applyFilters);
  $('filter-status').addEventListener('change', applyFilters);
  $('filter-source').addEventListener('change', applyFilters);
}

function showAddCustomerModal() {
  api.get('/api/users').then(users => {
    showModal(`
      <div class="p-6">
        <div class="flex items-center justify-between mb-5">
          <h2 class="text-lg font-bold text-navy-700">เพิ่มลูกค้าใหม่</h2>
          <button onclick="hideModal()" class="text-gray-400 hover:text-gray-600 text-xl">&times;</button>
        </div>
        <div class="grid grid-cols-2 gap-4">
          <div class="form-group col-span-2"><label class="form-label">ชื่อ-นามสกุล *</label><input id="fc-name" class="form-control" placeholder="ชื่อลูกค้า"></div>
          <div class="form-group"><label class="form-label">เบอร์โทร</label><input id="fc-phone" class="form-control" placeholder="08x-xxx-xxxx"></div>
          <div class="form-group"><label class="form-label">LINE ID</label><input id="fc-line" class="form-control" placeholder="LINE ID"></div>
          <div class="form-group"><label class="form-label">แหล่งที่มา</label>
            <select id="fc-source" class="form-control">${['TikTok','Facebook','LINE','ป้ายประกาศ','เพื่อนแนะนำ','Walk-in'].map(s=>`<option>${s}</option>`).join('')}</select></div>
          <div class="form-group"><label class="form-label">ประเภทที่สนใจ</label>
            <select id="fc-type" class="form-control">${['บ้าน','คอนโด','ที่ดิน','อาคารพาณิชย์','อสังหาริมทรัพย์เพื่อธุรกิจ','ทรัพย์ให้เช่า'].map(s=>`<option>${s}</option>`).join('')}</select></div>
          <div class="form-group"><label class="form-label">งบขั้นต่ำ (฿)</label><input id="fc-bmin" type="number" class="form-control" placeholder="0"></div>
          <div class="form-group"><label class="form-label">งบสูงสุด (฿)</label><input id="fc-bmax" type="number" class="form-control" placeholder="0"></div>
          <div class="form-group col-span-2"><label class="form-label">ทำเลที่ต้องการ</label><input id="fc-loc" class="form-control" placeholder="เช่น เชียงใหม่ ใกล้สนามบิน"></div>
          <div class="form-group"><label class="form-label">วัตถุประสงค์</label>
            <select id="fc-purpose" class="form-control">${['อยู่เอง','ลงทุน','ปล่อยเช่า','ซื้อให้ครอบครัว'].map(s=>`<option>${s}</option>`).join('')}</select></div>
          <div class="form-group"><label class="form-label">ความเร่งด่วน</label>
            <select id="fc-urgency" class="form-control">${['ทันที','1-3 เดือน','3-6 เดือน','มากกว่า 6 เดือน'].map(s=>`<option>${s}</option>`).join('')}</select></div>
          <div class="form-group"><label class="form-label">ผู้ดูแล</label>
            <select id="fc-agent" class="form-control"><option value="">-- เลือก --</option>${users.map(u=>`<option value="${u.id}">${u.name}</option>`).join('')}</select></div>
          <div class="form-group"><label class="form-label">นัดติดตามวันที่</label><input id="fc-followup" type="date" class="form-control"></div>
          <div class="form-group col-span-2"><label class="form-label">หมายเหตุ</label><textarea id="fc-note" class="form-control" rows="2" placeholder="หมายเหตุภายในทีม"></textarea></div>
        </div>
        <div class="flex justify-end gap-3 mt-4">
          <button onclick="hideModal()" class="btn btn-outline">ยกเลิก</button>
          <button onclick="submitAddCustomer()" class="btn btn-primary">บันทึก</button>
        </div>
      </div>`);
  });
}

async function submitAddCustomer() {
  const data = { full_name:$('fc-name').value, phone:$('fc-phone').value, line_id:$('fc-line').value, source:$('fc-source').value, property_type_interest:$('fc-type').value, budget_min:$('fc-bmin').value, budget_max:$('fc-bmax').value, preferred_location:$('fc-loc').value, purchase_purpose:$('fc-purpose').value, urgency:$('fc-urgency').value, assigned_agent_id:$('fc-agent').value||null, next_followup_date:$('fc-followup').value, internal_note:$('fc-note').value };
  if (!data.full_name) { toast('กรุณากรอกชื่อลูกค้า','error'); return; }
  await api.post('/api/customers', data);
  hideModal(); toast('เพิ่มลูกค้าสำเร็จ'); navigate('customers');
}

async function deleteCustomer(id) {
  if (!confirm('ยืนยันลบลูกค้านี้?')) return;
  await api.delete('/api/customers/'+id);
  toast('ลบลูกค้าแล้ว'); navigate('customers');
}

// ─── CUSTOMER DETAIL ──────────────────────────────────────────────────────────
async function renderCustomerDetail(params) {
  const c = await api.get('/api/customers/'+(params.id||1));
  const users = await api.get('/api/users');
  const matches = await api.get('/api/match/'+c.id);

  const STEPS = ['ลูกค้าใหม่','ติดต่อกลับแล้ว','คัดกรองแล้ว','กำลังหา/เสนอทรัพย์','นัดชมทรัพย์','ชมทรัพย์แล้ว','ต่อรองราคา','ยื่นสินเชื่อ','วางมัดจำ','ปิดการขายสำเร็จ'];
  const stepIdx = STEPS.indexOf(c.status);

  $('main-content').innerHTML = `
    <div class="space-y-4">
      <div class="flex items-center gap-3 mb-2">
        <button onclick="navigate('customers')" class="btn btn-outline btn-sm">← กลับ</button>
        <span class="badge badge-blue">${esc(c.customer_code)}</span>
        ${custBadge(c.status)}
      </div>
      <div class="grid grid-cols-1 lg:grid-cols-3 gap-4">
        <!-- Customer Info -->
        <div class="lg:col-span-2 space-y-4">
          <div class="bg-white rounded-xl border p-5">
            <div class="flex items-start justify-between mb-4">
              <div>
                <h2 class="text-xl font-bold text-navy-700">${esc(c.full_name)}</h2>
                <div class="text-sm text-gray-500 mt-1">${esc(c.phone||'')} ${c.line_id?'· LINE: '+c.line_id:''}</div>
              </div>
              <button onclick="showEditCustomerModal()" class="btn btn-outline btn-sm">แก้ไข</button>
            </div>
            <!-- Pipeline Progress -->
            <div class="mb-4">
              <div class="text-xs text-gray-500 mb-2">Pipeline Progress</div>
              <div class="pipeline-progress">${STEPS.map((s,i)=>`<div class="pipeline-step ${i<stepIdx?'done':i===stepIdx?'active':''}" title="${s}"></div>`).join('')}</div>
              <div class="text-xs text-gray-500 mt-1">${c.status}</div>
            </div>
            <div class="grid grid-cols-2 gap-3 text-sm">
              ${infoRow('แหล่งที่มา', c.source)}
              ${infoRow('ประเภทที่สนใจ', c.property_type_interest)}
              ${infoRow('งบประมาณ', fmtNum(c.budget_min)+' - '+fmtNum(c.budget_max)+' ฿')}
              ${infoRow('ทำเล', c.preferred_location)}
              ${infoRow('วัตถุประสงค์', c.purchase_purpose)}
              ${infoRow('ความเร่งด่วน', c.urgency)}
              ${infoRow('ความสามารถกู้', c.loan_capacity)}
              ${infoRow('ติดตามวันที่', fmtDate(c.next_followup_date))}
              ${infoRow('ผู้ดูแล', c.agent_name)}
            </div>
            ${c.internal_note ? `<div class="mt-3 p-3 bg-yellow-50 rounded-lg text-xs text-gray-700"><strong>หมายเหตุ:</strong> ${esc(c.internal_note)}</div>` : ''}
          </div>

          <!-- Update Status -->
          <div class="bg-white rounded-xl border p-5">
            <h3 class="text-sm font-semibold mb-3">อัปเดตสถานะ</h3>
            <div class="flex gap-2 flex-wrap">
              ${STEPS.concat(['ปิดการขายไม่สำเร็จ','ลูกค้าไม่ตอบกลับ','พักการติดตาม']).map(s=>`<button onclick="updateCustStatus(${c.id},'${s}')" class="btn btn-xs ${c.status===s?'btn-primary':'btn-outline'}">${s}</button>`).join('')}
            </div>
          </div>

          <!-- Follow-up History -->
          <div class="bg-white rounded-xl border p-5">
            <div class="flex items-center justify-between mb-4">
              <h3 class="text-sm font-semibold">ประวัติการติดต่อ (${c.followups.length})</h3>
              <button onclick="showFollowUpModal(${c.id})" class="btn btn-gold btn-sm">+ บันทึกการติดต่อ</button>
            </div>
            ${c.followups.length ? `<div class="timeline">${c.followups.map(f=>`
              <div class="timeline-item">
                <div class="timeline-dot"></div>
                <div class="timeline-date">${fmtDateTime(f.created_at)} · ${esc(f.user_name||'')} · ${esc(f.contact_type)}</div>
                <div class="timeline-content">${esc(f.note)}</div>
              </div>`).join('')}</div>` : '<p class="text-xs text-gray-400">ยังไม่มีประวัติการติดต่อ</p>'}
          </div>
        </div>

        <!-- Side panel -->
        <div class="space-y-4">
          <!-- Deals -->
          <div class="bg-white rounded-xl border p-5">
            <div class="flex items-center justify-between mb-3">
              <h3 class="text-sm font-semibold">ดีลที่เกี่ยวข้อง (${c.deals.length})</h3>
              <button onclick="navigate('pipeline')" class="btn btn-xs btn-outline" style="font-size:11px">ดูทั้งหมดใน Pipeline</button>
            </div>
            ${c.deals.length ? c.deals.map(d=>`
              <div class="p-3 rounded-xl mb-2 cursor-pointer border border-transparent hover:border-primary-200 hover:bg-primary-50 transition-all"
                style="background:#F8FAFC" onclick="showDealDetail(${d.id})">
                <div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:4px">
                  <span style="font-size:11px;font-weight:700;color:#1B4FD8">${esc(d.deal_code)}</span>
                  ${custBadge(d.status)}
                </div>
                <div style="font-size:11px;color:#64748B">${esc(d.property_title||'-')}</div>
                <div style="font-size:13px;font-weight:700;color:#0F172A;margin-top:4px">${fmtNum(d.sale_price)} ฿</div>
              </div>`).join('') : '<p class="text-xs text-gray-400">ยังไม่มีดีล — <button onclick="navigate(\'pipeline\')" style="background:none;border:none;color:#1B4FD8;cursor:pointer;font-size:12px;padding:0">สร้างดีลใน Pipeline</button></p>'}
          </div>

          <!-- Matched Properties -->
          <div class="bg-white rounded-xl border p-5">
            <h3 class="text-sm font-semibold mb-3">ทรัพย์ที่เหมาะสม (${matches.matches.length})</h3>
            ${matches.matches.slice(0,5).map(p=>`
              <div class="p-3 bg-gray-50 rounded-lg mb-2 cursor-pointer hover:bg-blue-50" onclick="navigate('property-detail',{id:${p.id}})">
                <div class="flex items-center justify-between mb-1">
                  <span class="text-xs font-semibold text-navy-700">${esc(p.property_code)}</span>
                  <span class="badge ${p.match_level==='ตรงมาก'?'score-high':p.match_level==='ตรงปานกลาง'?'score-mid':'score-low'}">${p.score}%</span>
                </div>
                <div class="text-xs text-gray-700">${esc(p.title)}</div>
                <div class="text-xs font-bold text-navy-700 mt-1">${fmtNum(p.sale_price)} ฿</div>
              </div>`).join('') || '<p class="text-xs text-gray-400">ไม่พบทรัพย์ที่ตรง</p>'}
          </div>

          <!-- Appointments -->
          <div class="bg-white rounded-xl border p-5">
            <h3 class="text-sm font-semibold mb-3">นัดหมาย (${c.appointments.length})</h3>
            ${c.appointments.slice(0,3).map(a=>`
              <div class="p-2 border rounded-lg mb-2 text-xs">
                <div class="font-semibold">${esc(a.type)}</div>
                <div class="text-gray-500">${fmtDate(a.appointment_date)} ${a.appointment_time||''}</div>
                ${a.note?`<div class="text-gray-600 mt-1">${esc(a.note)}</div>`:''}
              </div>`).join('') || '<p class="text-xs text-gray-400">ไม่มีนัดหมาย</p>'}
          </div>
        </div>
      </div>
    </div>`;

  window._editCustomerData = c;
  window._editCustomerUsers = users;
}

function infoRow(label, value) {
  return `<div class="info-row"><div class="info-label">${label}</div><div class="info-value">${esc(value||'-')}</div></div>`;
}

async function updateCustStatus(id, status) {
  const c = await api.get('/api/customers/'+id);
  await api.put('/api/customers/'+id, { ...c, status });
  toast('อัปเดตสถานะเป็น: '+status); navigate('customer-detail',{id});
}

function showFollowUpModal(custId) {
  showModal(`
    <div class="p-6">
      <div class="flex items-center justify-between mb-4">
        <h2 class="text-lg font-bold text-navy-700">บันทึกการติดต่อ</h2>
        <button onclick="hideModal()" class="text-gray-400 text-xl">&times;</button>
      </div>
      <div class="form-group"><label class="form-label">ช่องทางการติดต่อ</label>
        <select id="fu-type" class="form-control">${['โทรศัพท์','LINE','Facebook','Email','นัดชม','พบปะ','อื่นๆ'].map(s=>`<option>${s}</option>`).join('')}</select></div>
      <div class="form-group"><label class="form-label">บันทึกการสนทนา *</label><textarea id="fu-note" class="form-control" rows="4" placeholder="สรุปสิ่งที่คุยกัน..."></textarea></div>
      <div class="flex justify-end gap-3 mt-4">
        <button onclick="hideModal()" class="btn btn-outline">ยกเลิก</button>
        <button onclick="submitFollowUp(${custId})" class="btn btn-gold">บันทึก</button>
      </div>
    </div>`);
}

async function submitFollowUp(custId) {
  const note = $('fu-note').value;
  if (!note) { toast('กรุณากรอกบันทึก','error'); return; }
  await api.post('/api/customers/'+custId+'/followup', { user_id:1, contact_type:$('fu-type').value, note });
  hideModal(); toast('บันทึกการติดต่อสำเร็จ'); navigate('customer-detail',{id:custId});
}

function showEditCustomerModal() {
  const c = window._editCustomerData;
  const users = window._editCustomerUsers || [];
  showModal(`
    <div class="p-6">
      <div class="flex items-center justify-between mb-5">
        <h2 class="text-lg font-bold text-navy-700">แก้ไขข้อมูลลูกค้า</h2>
        <button onclick="hideModal()" class="text-gray-400 text-xl">&times;</button>
      </div>
      <div class="grid grid-cols-2 gap-4">
        <div class="form-group col-span-2"><label class="form-label">ชื่อ-นามสกุล</label><input id="ec-name" class="form-control" value="${esc(c.full_name)}"></div>
        <div class="form-group"><label class="form-label">เบอร์โทร</label><input id="ec-phone" class="form-control" value="${esc(c.phone||'')}"></div>
        <div class="form-group"><label class="form-label">LINE ID</label><input id="ec-line" class="form-control" value="${esc(c.line_id||'')}"></div>
        <div class="form-group"><label class="form-label">งบขั้นต่ำ</label><input id="ec-bmin" type="number" class="form-control" value="${c.budget_min||0}"></div>
        <div class="form-group"><label class="form-label">งบสูงสุด</label><input id="ec-bmax" type="number" class="form-control" value="${c.budget_max||0}"></div>
        <div class="form-group col-span-2"><label class="form-label">ทำเลที่ต้องการ</label><input id="ec-loc" class="form-control" value="${esc(c.preferred_location||'')}"></div>
        <div class="form-group"><label class="form-label">ผู้ดูแล</label>
          <select id="ec-agent" class="form-control">${users.map(u=>`<option value="${u.id}" ${u.id==c.assigned_agent_id?'selected':''}>${u.name}</option>`).join('')}</select></div>
        <div class="form-group"><label class="form-label">นัดติดตามวันที่</label><input id="ec-followup" type="date" class="form-control" value="${c.next_followup_date||''}"></div>
        <div class="form-group col-span-2"><label class="form-label">หมายเหตุ</label><textarea id="ec-note" class="form-control">${esc(c.internal_note||'')}</textarea></div>
      </div>
      <div class="flex justify-end gap-3 mt-4">
        <button onclick="hideModal()" class="btn btn-outline">ยกเลิก</button>
        <button onclick="submitEditCustomer(${c.id})" class="btn btn-primary">บันทึก</button>
      </div>
    </div>`);
}

async function submitEditCustomer(id) {
  const c = window._editCustomerData;
  const data = { ...c, full_name:$('ec-name').value, phone:$('ec-phone').value, line_id:$('ec-line').value, budget_min:$('ec-bmin').value, budget_max:$('ec-bmax').value, preferred_location:$('ec-loc').value, assigned_agent_id:$('ec-agent').value, next_followup_date:$('ec-followup').value, internal_note:$('ec-note').value };
  await api.put('/api/customers/'+id, data);
  hideModal(); toast('แก้ไขข้อมูลสำเร็จ'); navigate('customer-detail',{id});
}

// ─── PROPERTIES ───────────────────────────────────────────────────────────────
// Zones loaded dynamically from API — see renderProperties()

function propCardImg(p) {
  let images = [];
  try { images = JSON.parse(p.images || '[]'); } catch(e) {}
  if (images.length > 0 && images[0].dataUrl) {
    return `<img src="${images[0].dataUrl}" alt="${esc(p.title)}" loading="lazy">`;
  }
  return `<div class="prop-card-placeholder">
    <svg fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="1.5" d="M3 9l9-7 9 7v11a2 2 0 01-2 2H5a2 2 0 01-2-2z"/><polyline stroke-linecap="round" stroke-linejoin="round" stroke-width="1.5" points="9 22 9 12 15 12 15 22"/></svg>
    <span>ยังไม่มีรูป</span>
  </div>`;
}

function propSpecs(p) {
  const d = p.property_details || {};
  const specs = [];
  if (d.bedrooms) specs.push(`<span class="prop-card-spec"><svg fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M3 7v10M3 12h18M21 7v10M7 12V7h10v5"/></svg>${d.bedrooms} นอน</span>`);
  if (d.bathrooms) specs.push(`<span class="prop-card-spec"><svg fill="none" stroke="currentColor" viewBox="0 0 24 24"><circle cx="12" cy="12" r="3" stroke-linecap="round" stroke-linejoin="round" stroke-width="2"/><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 2v4m0 12v4M4.93 4.93l2.83 2.83m8.48 8.48l2.83 2.83M2 12h4m12 0h4M4.93 19.07l2.83-2.83m8.48-8.48l2.83-2.83"/></svg>${d.bathrooms} น้ำ</span>`);
  if (d.usable_area) specs.push(`<span class="prop-card-spec"><svg fill="none" stroke="currentColor" viewBox="0 0 24 24"><rect x="3" y="3" width="18" height="18" rx="2" stroke-linecap="round" stroke-linejoin="round" stroke-width="2"/></svg>${d.usable_area} ตร.ม.</span>`);
  if (d.land_sqw && !d.usable_area) specs.push(`<span class="prop-card-spec"><svg fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M9 20l-5.447-2.724A1 1 0 013 16.382V5.618a1 1 0 011.447-.894L9 7m0 13l6-3m-6 3V7m6 10l4.553 2.276A1 1 0 0021 18.382V7.618a1 1 0 00-.553-.894L15 4m0 13V4m0 0L9 7"/></svg>${d.land_sqw} ตร.ว.</span>`);
  if (d.size_sqm) specs.push(`<span class="prop-card-spec"><svg fill="none" stroke="currentColor" viewBox="0 0 24 24"><rect x="3" y="3" width="18" height="18" rx="2" stroke-linecap="round" stroke-linejoin="round" stroke-width="2"/></svg>${d.size_sqm} ตร.ม.</span>`);
  return specs.length ? `<div class="prop-card-specs">${specs.join('')}</div>` : '';
}

async function renderProperties() {
  const [allProps, zones] = await Promise.all([
    api.get('/api/properties'),
    api.get('/api/zones'),
  ]);

  let activeZone = '';

  $('main-content').innerHTML = `
    <div class="space-y-4">
      ${pageHeader('จัดการทรัพย์สิน', 'ทรัพย์สินทั้งหมดในระบบ', `<button onclick="navigate('add-property')" class="btn btn-primary"><svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 4v16m8-8H4"/></svg>เพิ่มทรัพย์</button>`)}
      <!-- Filter bar -->
      <div class="flex flex-wrap items-center gap-3">
        <div class="filter-bar flex-1">
          <div class="search-bar">
            <svg class="search-icon w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z"/></svg>
            <input type="text" id="search-prop" placeholder="ค้นหาชื่อ รหัส โครงการ..." class="form-control" style="padding-left:34px;width:220px">
          </div>
          <select id="filter-ptype" class="form-control" style="width:auto">
            <option value="">ประเภททั้งหมด</option>
            ${['บ้าน','คอนโด','ที่ดิน','อาคารพาณิชย์','อสังหาริมทรัพย์เพื่อธุรกิจ','ทรัพย์ให้เช่า'].map(s=>`<option>${s}</option>`).join('')}
          </select>
          <select id="filter-pstatus" class="form-control" style="width:auto">
            <option value="">สถานะทั้งหมด</option>
            ${['พร้อมขาย','จองแล้ว','ขายแล้ว','ระงับขาย'].map(s=>`<option>${s}</option>`).join('')}
          </select>
        </div>
      </div>

      <!-- Zone Chips — loaded from DB -->
      <div class="bg-white rounded-xl border p-3">
        <div class="flex items-center justify-between mb-2">
          <div class="text-xs font-semibold text-gray-500">เลือกโซน</div>
          <button onclick="navigate('settings')" class="text-xs text-navy-700 hover:underline" style="background:none;border:none;cursor:pointer;font-family:inherit">+ จัดการโซน</button>
        </div>
        <div class="zone-chips-row" id="zone-chips-row">
          <button class="zone-chip active" data-zone="" onclick="selectZone('')">
            ทั้งหมด <span class="zone-count">${allProps.length}</span>
          </button>
          ${zones.map(z => `
            <button class="zone-chip" data-zone="${esc(z.name)}" onclick="selectZone('${esc(z.name)}')">
              ${esc(z.name)} <span class="zone-count">${z.property_count}</span>
            </button>`).join('')}
        </div>
      </div>

      <!-- Price Range -->
      <div class="bg-white rounded-xl border p-3 flex flex-wrap items-center gap-3">
        <div class="text-xs font-semibold text-gray-500">ช่วงราคา (฿)</div>
        <div class="price-range-bar">
          <input type="number" id="price-min" placeholder="ราคาต่ำสุด" min="0" step="100000" oninput="applyFilters()">
          <span class="sep">—</span>
          <input type="number" id="price-max" placeholder="ราคาสูงสุด" min="0" step="100000" oninput="applyFilters()">
        </div>
        <div class="flex gap-2 flex-wrap">
          ${[['ไม่จำกัด','',''],['ต่ำกว่า 2M','0','2000000'],['2-5M','2000000','5000000'],['5-10M','5000000','10000000'],['มากกว่า 10M','10000000','']].map(([l,mn,mx])=>`
            <button onclick="setPricePreset('${mn}','${mx}')" class="btn btn-xs btn-outline">${l}</button>`).join('')}
        </div>
      </div>

      <!-- Results count + card grid -->
      <div class="flex items-center justify-between">
        <div class="text-sm text-gray-500" id="prop-count">ทรัพย์ทั้งหมด ${allProps.length} รายการ</div>
      </div>
      <div id="prop-grid-wrap"></div>
    </div>`;

  function renderCards(data) {
    $('prop-count').textContent = `พบ ${data.length} รายการ`;
    if (!data.length) {
      $('prop-grid-wrap').innerHTML = '<div class="empty-state">ไม่พบทรัพย์สินที่ตรงเงื่อนไข</div>';
      return;
    }
    $('prop-grid-wrap').innerHTML = `<div class="prop-grid">${data.map(p=>`
      <div class="prop-card" onclick="navigate('property-detail',{id:${p.id}})">
        <div class="prop-card-img">
          ${propCardImg(p)}
          <div class="prop-card-badges">
            <span class="badge badge-navy" style="font-size:10px">${esc(p.property_type)}</span>
            ${p.zone ? `<span class="badge badge-gold" style="font-size:10px">${esc(p.zone)}</span>` : ''}
          </div>
          <div class="prop-card-status">${propBadge(p.status)}</div>
        </div>
        <div class="prop-card-body">
          <div class="text-xs text-gray-400 mb-1">${esc(p.property_code)} · ${esc(p.province||'')} ${p.district?'· '+p.district:''}</div>
          <div class="prop-card-title">${esc(p.title)}</div>
          <div class="prop-card-price">${fmtPrice(p.sale_price)}</div>
          ${propSpecs(p)}
          <div class="prop-card-footer">
            <div class="prop-card-agent">
              <svg class="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M16 7a4 4 0 11-8 0 4 4 0 018 0zM12 14a7 7 0 00-7 7h14a7 7 0 00-7-7z"/></svg>
              ${esc(p.agent_name||'ไม่ระบุ')}
            </div>
            <div class="prop-card-comm">ค่านายหน้า ${p.commission_rate||0}%</div>
          </div>
        </div>
        <div class="prop-card-actions" onclick="event.stopPropagation()">
          <button onclick="navigate('property-detail',{id:${p.id}})" class="btn btn-primary btn-sm">ดูรายละเอียด</button>
          <button onclick="quickStatusProp(${p.id},event)" class="btn btn-outline btn-sm">เปลี่ยนสถานะ</button>
        </div>
      </div>`).join('')}</div>`;
  }

  function applyFilters() {
    const q = ($('search-prop')?.value||'').toLowerCase();
    const t = $('filter-ptype')?.value||'';
    const s = $('filter-pstatus')?.value||'';
    const pMin = parseFloat($('price-min')?.value||'') || 0;
    const pMax = parseFloat($('price-max')?.value||'') || 0;
    renderCards(allProps.filter(p =>
      (!q || p.title.toLowerCase().includes(q) || (p.property_code||'').includes(q) || (p.village_project||'').toLowerCase().includes(q)) &&
      (!t || p.property_type === t) &&
      (!s || p.status === s) &&
      (!activeZone || (p.zone||'').includes(activeZone)) &&
      (!pMin || p.sale_price >= pMin) &&
      (!pMax || p.sale_price <= pMax)
    ));
  }
  window.applyFilters = applyFilters;

  window.selectZone = function(zone) {
    activeZone = zone;
    document.querySelectorAll('.zone-chip').forEach(c => {
      c.classList.toggle('active', c.dataset.zone === zone);
    });
    applyFilters();
  };

  window.setPricePreset = function(mn, mx) {
    if ($('price-min')) $('price-min').value = mn;
    if ($('price-max')) $('price-max').value = mx;
    applyFilters();
  };

  $('search-prop').addEventListener('input', applyFilters);
  $('filter-ptype').addEventListener('change', applyFilters);
  $('filter-pstatus').addEventListener('change', applyFilters);

  renderCards(allProps);
}

function quickStatusProp(id, e) {
  e.stopPropagation();
  const statuses = ['พร้อมขาย','จองแล้ว','ขายแล้ว','ระงับขาย'];
  showModal(`
    <div class="p-5">
      <div class="flex items-center justify-between mb-4"><h3 class="font-bold text-navy-700">เปลี่ยนสถานะทรัพย์</h3><button onclick="hideModal()" class="text-gray-400 text-xl">&times;</button></div>
      <div class="grid grid-cols-2 gap-3">${statuses.map(s=>`<button onclick="api.patch('/api/properties/${id}/status',{status:'${s}'}).then(()=>{hideModal();toast('อัปเดตสถานะ: ${s}');navigate('properties')})" class="btn btn-outline">${s}</button>`).join('')}</div>
    </div>`);
}

// ─── ADD PROPERTY (Dynamic Form) ──────────────────────────────────────────────
async function renderAddProperty() {
  const [owners, users, zones] = await Promise.all([
    api.get('/api/owners'),
    api.get('/api/users'),
    api.get('/api/zones'),
  ]);

  $('main-content').innerHTML = `
    <div class="max-w-4xl">
      <div class="flex items-center gap-3 mb-4">
        <button onclick="navigate('properties')" class="btn btn-outline btn-sm">← กลับ</button>
      </div>
      <div class="bg-white rounded-xl border p-6">
        <!-- Tabs -->
        <div class="tab-bar mb-0" id="prop-tab-bar">
          <button class="tab-btn active" data-tab="general">ข้อมูลทั่วไป</button>
          <button class="tab-btn" data-tab="details">รายละเอียด</button>
          <button class="tab-btn" data-tab="price">ราคา & การเงิน</button>
          <button class="tab-btn" data-tab="owner">เจ้าของทรัพย์</button>
          <button class="tab-btn" data-tab="marketing">การตลาด</button>
        </div>

        <!-- Tab: General -->
        <div id="tab-general" class="tab-content pt-5">
          <div class="grid grid-cols-2 gap-4">
            <div class="form-group col-span-2"><label class="form-label">ชื่อทรัพย์ / ชื่อประกาศ *</label><input id="ap-title" class="form-control" placeholder="เช่น บ้านเดี่ยว 3 ห้องนอน ใกล้สนามบิน เชียงใหม่"></div>
            <div class="form-group">
              <label class="form-label">ประเภทหลัก *</label>
              <select id="ap-type" class="form-control" onchange="updateDynForm()">
                ${['บ้าน','คอนโด','ที่ดิน','อาคารพาณิชย์','อสังหาริมทรัพย์เพื่อธุรกิจ','ทรัพย์ให้เช่า'].map(s=>`<option>${s}</option>`).join('')}
              </select>
            </div>
            <div class="form-group"><label class="form-label">ประเภทย่อย</label><select id="ap-subtype" class="form-control"></select></div>
            <div class="form-group"><label class="form-label">จังหวัด</label><input id="ap-province" class="form-control" value="เชียงใหม่"></div>
            <div class="form-group"><label class="form-label">อำเภอ</label><input id="ap-district" class="form-control"></div>
            <div class="form-group col-span-2"><label class="form-label">หมู่บ้าน / โครงการ</label><input id="ap-village" class="form-control"></div>
            <div class="form-group col-span-2"><label class="form-label">โซนพื้นที่</label>
              <select id="ap-zone" class="form-control">
                <option value="">-- เลือกโซน --</option>
                ${zones.map(z=>`<option value="${esc(z.name)}">${esc(z.name)}</option>`).join('')}
              </select>
            </div>
            <div class="form-group col-span-2"><label class="form-label">สถานที่ใกล้เคียง</label><input id="ap-nearby" class="form-control" placeholder="เช่น ห้างสรรพสินค้า, โรงพยาบาล, BIG C"></div>
            <div class="form-group">
              <label class="form-label">ผู้ดูแลทรัพย์</label>
              <select id="ap-agent" class="form-control"><option value="">-- เลือก --</option>${users.map(u=>`<option value="${u.id}">${u.name}</option>`).join('')}</select>
            </div>
            <div class="form-group">
              <label class="form-label">สถานะทรัพย์</label>
              <select id="ap-status" class="form-control">${['พร้อมขาย','ระงับขาย'].map(s=>`<option>${s}</option>`).join('')}</select>
            </div>
          </div>
        </div>

        <!-- Tab: Details (Dynamic) -->
        <div id="tab-details" class="tab-content pt-5 hidden">
          <div id="dynamic-form-content"></div>
        </div>

        <!-- Tab: Price -->
        <div id="tab-price" class="tab-content pt-5 hidden">
          <div class="grid grid-cols-2 gap-4">
            <div class="form-group"><label class="form-label">ราคาขาย (฿) *</label><input id="ap-price" type="number" class="form-control" placeholder="0" oninput="calcCommission()"></div>
            <div class="form-group"><label class="form-label">ราคาประเมิน (฿)</label><input id="ap-appraisal" type="number" class="form-control" placeholder="0"></div>
            <div class="form-group"><label class="form-label">ราคาต่ำสุดที่รับได้ (฿)</label><input id="ap-minprice" type="number" class="form-control" placeholder="0"></div>
            <div class="form-group"><label class="form-label">ค่านายหน้า (%)</label><input id="ap-commrate" type="number" class="form-control" value="3" oninput="calcCommission()"></div>
            <div class="form-group col-span-2 p-3 bg-green-50 rounded-lg">
              <div class="text-xs text-gray-500">ค่านายหน้าที่คำนวณ</div>
              <div id="comm-calc" class="text-lg font-bold text-green-600">0 ฿</div>
            </div>
            <div class="form-group col-span-2"><label class="form-label">เงื่อนไขค่าใช้จ่ายโอน</label>
              <select id="ap-transfer" class="form-control">${['ออกคนละครึ่ง','ผู้ขายออก','ผู้ซื้อออก'].map(s=>`<option>${s}</option>`).join('')}</select></div>
            <div class="form-group col-span-2"><label class="form-label">จุดขายด้านราคา</label><input id="ap-pricesell" class="form-control" placeholder="เช่น ต่ำกว่าประเมิน, ฟรีโอน, มีเงินทอน"></div>
          </div>
        </div>

        <!-- Tab: Owner -->
        <div id="tab-owner" class="tab-content pt-5 hidden">
          <div class="form-group"><label class="form-label">เลือกเจ้าของทรัพย์</label>
            <select id="ap-owner" class="form-control">
              <option value="">-- เลือกเจ้าของที่มีในระบบ --</option>
              ${owners.map(o=>`<option value="${o.id}">${o.owner_name} (${o.phone||''})</option>`).join('')}
            </select>
          </div>
          <div class="mt-4 p-3 bg-gray-50 rounded-lg text-xs text-gray-500">หากไม่มีเจ้าของในรายการ ให้เพิ่มเจ้าของใหม่ก่อนในส่วนตั้งค่า</div>
        </div>

        <!-- Tab: Marketing -->
        <div id="tab-marketing" class="tab-content pt-5 hidden">
          <div class="grid grid-cols-1 gap-4">
            <div class="form-group"><label class="form-label">จุดเด่นของทรัพย์</label><input id="ap-highlights" class="form-control" placeholder="เช่น หลังมุม, วิวดี, ใกล้ BTS"></div>
            <div class="form-group"><label class="form-label">Caption สำหรับ Facebook</label><textarea id="ap-caption" class="form-control" rows="3" placeholder="ข้อความโพสต์..."></textarea></div>
            <div class="form-group"><label class="form-label">Script สำหรับ TikTok</label><textarea id="ap-tiktok" class="form-control" rows="3" placeholder="สคริปต์วิดีโอสั้น..."></textarea></div>
            <div class="form-group"><label class="form-label">Hashtag</label><input id="ap-hashtag" class="form-control" placeholder="#บ้านขาย #เชียงใหม่ #อสังหา"></div>
            <div class="form-group"><label class="form-label">หมายเหตุภายในทีม</label><textarea id="ap-note" class="form-control" rows="2" placeholder="ข้อมูลที่ไม่ต้องการให้ลูกค้าเห็น"></textarea></div>
          </div>
        </div>

        <!-- Actions -->
        <div class="flex justify-between items-center mt-6 pt-4 border-t">
          <button onclick="navigate('properties')" class="btn btn-outline">ยกเลิก</button>
          <div class="flex gap-2">
            <button onclick="submitAddProperty(false)" class="btn btn-outline">บันทึกร่าง</button>
            <button onclick="submitAddProperty(true)" class="btn btn-primary">บันทึกทรัพย์</button>
          </div>
        </div>
      </div>
    </div>`;

  // Tab switching
  document.querySelectorAll('.tab-btn').forEach(btn => {
    btn.addEventListener('click', () => {
      document.querySelectorAll('.tab-btn').forEach(b => b.classList.remove('active'));
      document.querySelectorAll('.tab-content').forEach(c => c.classList.add('hidden'));
      btn.classList.add('active');
      $('tab-'+btn.dataset.tab).classList.remove('hidden');
    });
  });

  updateDynForm();
}

const SUBTYPES = {
  'บ้าน':['บ้านเดี่ยว','บ้านแฝด','ทาวน์โฮม','ทาวน์เฮาส์','บ้านชั้นเดียว','บ้านสองชั้น','บ้านพร้อมที่ดิน'],
  'คอนโด':['คอนโดมือหนึ่ง','คอนโดมือสอง','ห้องชุด','คอนโดปล่อยเช่า','คอนโดเพื่อการลงทุน'],
  'ที่ดิน':['ที่ดินเปล่า','ที่ดินพร้อมสิ่งปลูกสร้าง','ที่สวน','ที่ไร่','ที่นา','ที่ดินจัดสรร','ที่ดินติดถนน','ที่ดินติดน้ำ','ที่ดินในเมือง','ที่ดินเพื่อการเกษตร'],
  'อาคารพาณิชย์':['ตึกแถว','อาคารพาณิชย์','โฮมออฟฟิศ','อาคารสำนักงาน','อาคารพร้อมกิจการ'],
  'อสังหาริมทรัพย์เพื่อธุรกิจ':['หอพัก','อพาร์ตเมนต์','โรงแรม','รีสอร์ต','โกดัง','โรงงาน','อาคารสำนักงาน'],
  'ทรัพย์ให้เช่า':['บ้านเช่า','คอนโดเช่า','ที่ดินเช่า','อาคารเช่า','โกดังเช่า','สำนักงานเช่า'],
};

const DYN_FORMS = {
  'บ้าน': () => `
    <div class="grid grid-cols-3 gap-4">
      ${numField('df-floors','จำนวนชั้น')}${numField('df-bedrooms','ห้องนอน')}${numField('df-bathrooms','ห้องน้ำ')}
      ${numField('df-parking','ที่จอดรถ')}${numField('df-land_sqw','ขนาดที่ดิน (ตร.ว.)')}${numField('df-usable_area','พื้นที่ใช้สอย (ตร.ม.)')}
      ${numField('df-house_age','อายุบ้าน (ปี)',0)}
      <div class="form-group"><label class="form-label">สภาพบ้าน</label><select id="df-condition" class="form-control">${['ใหม่','มือสอง','รีโนเวทแล้ว','ต้องรีโนเวท'].map(s=>`<option>${s}</option>`).join('')}</select></div>
      <div class="form-group"><label class="form-label">เฟอร์นิเจอร์</label><select id="df-furniture" class="form-control">${['ไม่มีเฟอร์นิเจอร์','เฟอร์บางส่วน','เฟอร์ครบ'].map(s=>`<option>${s}</option>`).join('')}</select></div>
      <div class="form-group"><label class="form-label">ทิศหน้าบ้าน</label><select id="df-direction" class="form-control">${['เหนือ','ใต้','ออก','ตก'].map(s=>`<option>${s}</option>`).join('')}</select></div>
      ${numField('df-monthly_fee','ค่าส่วนกลาง (฿/เดือน)',0)}
    </div>`,
  'คอนโด': () => `
    <div class="grid grid-cols-3 gap-4">
      ${txtField('df-project','ชื่อโครงการ')}${txtField('df-building','อาคาร')}
      ${numField('df-floor','ชั้น')}${txtField('df-room_number','เลขห้อง')}${numField('df-total_floors','ชั้นทั้งหมด')}
      ${numField('df-size_sqm','ขนาดห้อง (ตร.ม.)')}${numField('df-bedrooms','ห้องนอน',0)}${numField('df-bathrooms','ห้องน้ำ',1)}
      <div class="form-group"><label class="form-label">วิว</label><select id="df-view" class="form-control">${['วิวเมือง','วิวสวน','วิวสระว่ายน้ำ','วิวภูเขา'].map(s=>`<option>${s}</option>`).join('')}</select></div>
      <div class="form-group"><label class="form-label">เฟอร์นิเจอร์</label><select id="df-furniture" class="form-control">${['ไม่มี','บางส่วน','เฟอร์ครบ'].map(s=>`<option>${s}</option>`).join('')}</select></div>
      ${numField('df-monthly_fee','ค่าส่วนกลาง (฿/เดือน)',0)}${numField('df-parking','ที่จอดรถ',0)}
      <div class="form-group"><label class="form-label">การถือครอง</label><select id="df-ownership" class="form-control"><option>โควตาไทย</option><option>โควตาต่างชาติ</option></select></div>
    </div>`,
  'ที่ดิน': () => `
    <div class="grid grid-cols-3 gap-4">
      ${numField('df-rai','ไร่',0)}${numField('df-ngan','งาน',0)}${numField('df-sqw','ตารางวา',0)}
      ${numField('df-frontage','หน้ากว้าง (เมตร)',0)}${numField('df-depth','ความลึก (เมตร)',0)}
      <div class="form-group"><label class="form-label">รูปแปลง</label><select id="df-shape" class="form-control">${['สี่เหลี่ยม','หน้าแคบหลังลึก','แปลงมุม'].map(s=>`<option>${s}</option>`).join('')}</select></div>
      ${numField('df-road_width','ถนนหน้าแปลง (เมตร)',0)}
      <div class="form-group"><label class="form-label">ประเภทถนน</label><select id="df-road_type" class="form-control">${['ถนนคอนกรีต','ถนนลาดยาง','ถนนลูกรัง'].map(s=>`<option>${s}</option>`).join('')}</select></div>
      <div class="form-group"><label class="form-label">เอกสารสิทธิ์</label><select id="df-title_deed" class="form-control">${['โฉนด','น.ส.3 ก','ส.ป.ก.','อื่นๆ'].map(s=>`<option>${s}</option>`).join('')}</select></div>
    </div>`,
  'อาคารพาณิชย์': () => `
    <div class="grid grid-cols-3 gap-4">
      ${numField('df-floors','จำนวนชั้น')}${numField('df-frontage','หน้ากว้าง (เมตร)')}${numField('df-depth','ความลึก (เมตร)')}
      ${numField('df-land_sqw','ขนาดที่ดิน (ตร.ว.)')}${numField('df-usable_area','พื้นที่ใช้สอย (ตร.ม.)')}${numField('df-bathrooms','ห้องน้ำ')}
      ${numField('df-parking','ที่จอดรถ',0)}
      <div class="form-group"><label class="form-label">สภาพอาคาร</label><select id="df-building_condition" class="form-control">${['ดีมาก','ดี','ปานกลาง','ต้องซ่อม'].map(s=>`<option>${s}</option>`).join('')}</select></div>
      <div class="form-group"><label class="form-label">ทำเล</label><input id="df-location_type" class="form-control" placeholder="ติดถนนใหญ่, ใกล้ตลาด"></div>
    </div>`,
  'อสังหาริมทรัพย์เพื่อธุรกิจ': () => `
    <div class="grid grid-cols-2 gap-4">
      ${numField('df-rooms','จำนวนห้อง / ยูนิต')}${numField('df-floors','จำนวนชั้น')}
      ${numField('df-land_sqw','ขนาดที่ดิน (ตร.ว.)')}${numField('df-usable_area','พื้นที่ใช้สอย (ตร.ม.)')}
      ${numField('df-monthly_income','รายได้ปัจจุบัน (฿/เดือน)',0)}${numField('df-occupancy_rate','อัตราการเช่า (%)',0)}
      ${numField('df-monthly_expense','ค่าใช้จ่าย (฿/เดือน)',0)}
      <div class="form-group"><label class="form-label">จุดเด่นธุรกิจ</label><input id="df-business_highlights" class="form-control" placeholder="เช่น เช่าเต็ม 100%, ทำเลดี"></div>
    </div>`,
  'ทรัพย์ให้เช่า': () => `
    <div class="grid grid-cols-2 gap-4">
      ${numField('df-rental_price','ค่าเช่า (฿/เดือน)')}${numField('df-deposit','เงินประกัน (฿)')}
      ${numField('df-advance_payment','ค่าเช่าล่วงหน้า (฿)',0)}
      <div class="form-group"><label class="form-label">ระยะสัญญาขั้นต่ำ</label><input id="df-min_contract" class="form-control" placeholder="เช่น 6 เดือน, 1 ปี"></div>
      <div class="form-group"><label class="form-label">เฟอร์นิเจอร์</label><select id="df-furniture" class="form-control">${['ไม่มี','บางส่วน','เฟอร์ครบ'].map(s=>`<option>${s}</option>`).join('')}</select></div>
      <div class="form-group"><label class="form-label">วันที่พร้อมเข้าอยู่</label><input id="df-available_date" type="date" class="form-control"></div>
    </div>`,
};

function numField(id, label, def=1) { return `<div class="form-group"><label class="form-label">${label}</label><input id="${id}" type="number" class="form-control" value="${def}" min="0"></div>`; }
function txtField(id, label) { return `<div class="form-group"><label class="form-label">${label}</label><input id="${id}" class="form-control"></div>`; }

function updateDynForm() {
  const type = $('ap-type')?.value;
  if (!type) return;
  const sub = SUBTYPES[type] || [];
  if ($('ap-subtype')) $('ap-subtype').innerHTML = sub.map(s=>`<option>${s}</option>`).join('');
  if ($('dynamic-form-content') && DYN_FORMS[type]) $('dynamic-form-content').innerHTML = DYN_FORMS[type]();
}
window.updateDynForm = updateDynForm;

function calcCommission() {
  const price = parseFloat($('ap-price')?.value || 0);
  const rate = parseFloat($('ap-commrate')?.value || 3);
  const comm = price * rate / 100;
  if ($('comm-calc')) $('comm-calc').textContent = fmtNum(comm) + ' ฿';
}
window.calcCommission = calcCommission;

async function submitAddProperty(save = true) {
  const type = $('ap-type').value;
  const title = $('ap-title').value;
  if (!title) { toast('กรุณากรอกชื่อทรัพย์','error'); return; }

  const getVal = id => $(id)?.value || null;
  const getNum = id => parseFloat($(id)?.value || 0);

  const details = {};
  document.querySelectorAll('[id^="df-"]').forEach(el => {
    const key = el.id.replace('df-','');
    details[key] = el.type === 'number' ? parseFloat(el.value||0) : el.value;
  });

  const data = {
    property_type: type, property_subtype: getVal('ap-subtype'), title,
    status: save ? getVal('ap-status') : 'ระงับขาย',
    province: getVal('ap-province'), district: getVal('ap-district'),
    village_project: getVal('ap-village'), zone: getVal('ap-zone'), nearby_places: getVal('ap-nearby'),
    sale_price: getNum('ap-price'), appraisal_price: getNum('ap-appraisal'), min_acceptable_price: getNum('ap-minprice'),
    commission_rate: getNum('ap-commrate'), transfer_fee_condition: getVal('ap-transfer'),
    highlights: getVal('ap-highlights'), internal_note: getVal('ap-note'),
    assigned_agent_id: getVal('ap-agent'), owner_id: getVal('ap-owner'),
    property_details: details,
    marketing_data: { caption: getVal('ap-caption'), tiktok: getVal('ap-tiktok'), hashtag: getVal('ap-hashtag'), price_highlight: getVal('ap-pricesell') }
  };

  const r = await api.post('/api/properties', data);
  toast(save ? 'บันทึกทรัพย์สำเร็จ' : 'บันทึกร่างสำเร็จ');
  navigate('property-detail', { id: r.id });
}

// ─── PROPERTY DETAIL ──────────────────────────────────────────────────────────
async function renderPropertyDetail(params) {
  const p = await api.get('/api/properties/'+(params.id||1));
  const d = p.property_details || {};

  const detailItems = Object.entries(d).filter(([k,v])=>v).map(([k,v])=>`
    <div><div class="text-xs text-gray-400">${k.replace(/_/g,' ')}</div><div class="font-medium text-sm">${Array.isArray(v)?v.join(', '):v}</div></div>`).join('');

  let images = [];
  try { images = JSON.parse(p.images || '[]'); } catch(e) {}

  $('main-content').innerHTML = `
    <div class="space-y-4">
      <div class="flex items-center gap-3 mb-2">
        <button onclick="navigate('properties')" class="btn btn-outline btn-sm">← กลับ</button>
        <span class="badge badge-navy">${esc(p.property_code)}</span>
        ${propBadge(p.status)}
        ${p.zone ? `<span class="badge badge-gold">${esc(p.zone)}</span>` : ''}
      </div>
      <div class="grid grid-cols-1 lg:grid-cols-3 gap-4">
        <div class="lg:col-span-2 space-y-4">

          <!-- Image Gallery -->
          <div class="bg-white rounded-xl border p-5">
            <div class="flex items-center justify-between mb-3">
              <h3 class="text-sm font-semibold">รูปภาพทรัพย์ <span class="text-gray-400 font-normal">(${images.length} รูป)</span></h3>
              <label class="btn btn-outline btn-sm cursor-pointer">
                <svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 4v16m8-8H4"/></svg>
                อัปโหลดรูป
                <input type="file" accept="image/*" multiple style="display:none" onchange="uploadPropImages(${p.id},this)">
              </label>
            </div>
            <div class="img-gallery" id="img-gallery-${p.id}">
              ${images.map((img,i)=>`
                <div class="img-thumb">
                  <img src="${img.dataUrl}" alt="${esc(img.caption||'')}" onclick="previewImg('${img.dataUrl}')">
                  <button class="img-del" onclick="deletePropImage(${p.id},${i})" title="ลบรูปนี้">&times;</button>
                </div>`).join('')}
              <label class="img-add-btn cursor-pointer">
                <svg fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 4v16m8-8H4"/></svg>
                เพิ่มรูป
                <input type="file" accept="image/*" multiple style="display:none" onchange="uploadPropImages(${p.id},this)">
              </label>
            </div>
          </div>

          <!-- Main Info -->
          <div class="bg-white rounded-xl border p-5">
            <div class="flex items-start justify-between mb-2">
              <div>
                <h2 class="text-xl font-bold text-navy-700">${esc(p.title)}</h2>
                <div class="text-sm text-gray-500 mt-1">${esc(p.property_type)} · ${esc(p.property_subtype||'')} · ${esc(p.province||'')} ${esc(p.district||'')}</div>
              </div>
              <div class="text-2xl font-bold text-navy-700">${fmtPrice(p.sale_price)}</div>
            </div>
            ${p.highlights?`<div class="p-2 bg-yellow-50 rounded text-xs text-gray-700 mb-3"><strong>จุดเด่น:</strong> ${esc(p.highlights)}</div>`:''}
            <div class="grid grid-cols-2 gap-3">
              ${infoRow('ราคาประเมิน', fmtPrice(p.appraisal_price))}
              ${infoRow('ค่านายหน้า', fmtNum(p.commission_amount)+' ฿ ('+p.commission_rate+'%)')}
              ${infoRow('เงื่อนไขโอน', p.transfer_fee_condition)}
              ${infoRow('โซนพื้นที่', p.zone)}
              ${infoRow('เจ้าของ', p.owner_name)}
              ${infoRow('ผู้ดูแล', p.agent_name)}
            </div>
          </div>
          ${detailItems ? `<div class="bg-white rounded-xl border p-5"><h3 class="text-sm font-semibold mb-3">รายละเอียดทรัพย์</h3><div class="grid grid-cols-3 gap-3">${detailItems}</div></div>` : ''}
          <!-- Deals -->
          <div class="bg-white rounded-xl border p-5">
            <div class="flex items-center justify-between mb-3">
              <h3 class="text-sm font-semibold">ดีลที่เกี่ยวข้อง (${p.deals.length})</h3>
              <button onclick="showCreateDealModal(${p.id})" class="btn btn-gold btn-sm">+ สร้างดีล</button>
            </div>
            ${p.deals.length ? `<table><thead><tr><th>รหัส</th><th>ลูกค้า</th><th>สถานะ</th><th>ราคา</th></tr></thead><tbody>${p.deals.map(d=>`<tr><td class="text-xs font-semibold">${esc(d.deal_code)}</td><td>${esc(d.customer_name)}</td><td>${custBadge(d.status)}</td><td class="font-bold text-sm">${fmtNum(d.sale_price)} ฿</td></tr>`).join('')}</tbody></table>` : '<p class="text-xs text-gray-400">ยังไม่มีดีล</p>'}
          </div>
        </div>
        <div class="space-y-4">
          <div class="bg-white rounded-xl border p-5">
            <h3 class="text-sm font-semibold mb-3">เปลี่ยนสถานะ</h3>
            <div class="space-y-2">${['พร้อมขาย','จองแล้ว','ขายแล้ว','ระงับขาย'].map(s=>`<button onclick="api.patch('/api/properties/${p.id}/status',{status:'${s}'}).then(()=>{toast('อัปเดต: ${s}');navigate('property-detail',{id:${p.id}})})" class="btn btn-sm w-full text-left ${p.status===s?'btn-primary':'btn-outline'}">${s}</button>`).join('')}</div>
          </div>
          ${p.internal_note?`<div class="bg-yellow-50 rounded-xl border border-yellow-200 p-4"><div class="text-xs font-semibold text-yellow-700 mb-1">หมายเหตุภายใน</div><div class="text-xs text-gray-700">${esc(p.internal_note)}</div></div>`:''}
          ${p.marketing_data?.caption?`<div class="bg-white rounded-xl border p-4"><div class="text-xs font-semibold mb-2">Caption สำหรับโพสต์</div><div class="text-xs text-gray-700 leading-relaxed">${esc(p.marketing_data.caption)}</div></div>`:''}
        </div>
      </div>
    </div>`;
}

// Image upload handler
window.uploadPropImages = async function(propId, input) {
  const files = Array.from(input.files);
  if (!files.length) return;
  let uploaded = 0, failed = 0;
  for (const file of files) {
    try {
      // Resize if > 1.5MB before encoding
      const dataUrl = await new Promise((resolve, reject) => {
        const reader = new FileReader();
        reader.onload = e => {
          const img = new Image();
          img.onload = () => {
            const canvas = document.createElement('canvas');
            const MAX = 1080;
            let w = img.width, h = img.height;
            if (w > MAX || h > MAX) { const r = Math.min(MAX/w, MAX/h); w = Math.round(w*r); h = Math.round(h*r); }
            canvas.width = w; canvas.height = h;
            canvas.getContext('2d').drawImage(img, 0, 0, w, h);
            resolve(canvas.toDataURL('image/jpeg', 0.75));
          };
          img.onerror = reject;
          img.src = e.target.result;
        };
        reader.onerror = reject;
        reader.readAsDataURL(file);
      });
      const result = await api.post(`/api/properties/${propId}/images`, { dataUrl, caption: file.name });
      if (result.error) { toast('อัปโหลดล้มเหลว: ' + result.error, 'error'); failed++; }
      else uploaded++;
    } catch(e) {
      toast('อัปโหลดล้มเหลว: ' + e.message, 'error');
      failed++;
    }
  }
  if (uploaded > 0) toast(`อัปโหลด ${uploaded} รูปสำเร็จ`);
  navigate('property-detail', { id: propId });
};
window.uploadPropImages = window.uploadPropImages;

window.deletePropImage = async function(propId, idx) {
  if (!confirm('ยืนยันลบรูปนี้?')) return;
  await api.delete(`/api/properties/${propId}/images/${idx}`);
  toast('ลบรูปแล้ว');
  navigate('property-detail', { id: propId });
};

window.previewImg = function(src) {
  showModal(`
    <div class="p-4" style="max-width:90vw">
      <div class="flex justify-end mb-2"><button onclick="hideModal()" class="text-gray-400 hover:text-gray-600 text-xl font-bold">&times;</button></div>
      <img src="${src}" style="max-width:100%;max-height:75vh;object-fit:contain;border-radius:8px">
    </div>`);
};

function showCreateDealModal(propId) {
  api.get('/api/customers').then(customers => {
    showModal(`
      <div class="p-6">
        <div class="flex items-center justify-between mb-4"><h3 class="text-lg font-bold text-navy-700">สร้างดีลใหม่</h3><button onclick="hideModal()" class="text-gray-400 text-xl">&times;</button></div>
        <div class="form-group"><label class="form-label">ลูกค้า *</label><select id="nd-customer" class="form-control"><option value="">-- เลือกลูกค้า --</option>${customers.map(c=>`<option value="${c.id}">${c.full_name} (${c.phone||''})</option>`).join('')}</select></div>
        <div class="form-group"><label class="form-label">หมายเหตุ</label><textarea id="nd-note" class="form-control" rows="2"></textarea></div>
        <div class="flex justify-end gap-3 mt-4"><button onclick="hideModal()" class="btn btn-outline">ยกเลิก</button><button onclick="submitCreateDeal(${propId})" class="btn btn-primary">สร้างดีล</button></div>
      </div>`);
  });
}

async function submitCreateDeal(propId) {
  const custId = $('nd-customer').value;
  if (!custId) { toast('กรุณาเลือกลูกค้า','error'); return; }
  const r = await api.post('/api/deals', { customer_id: custId, property_id: propId, note: $('nd-note').value, assigned_agent_id: 2 });
  hideModal(); toast('สร้างดีลสำเร็จ'); navigate('pipeline');
}

// ─── PIPELINE ─────────────────────────────────────────────────────────────────
const PIPELINE_STAGES = ['เสนอทรัพย์','นัดชมทรัพย์','ชมทรัพย์แล้ว','ต่อรองราคา','วางมัดจำ','ยื่นสินเชื่อ','สินเชื่อผ่าน','นัดวันโอน','โอนกรรมสิทธิ์','รับค่านายหน้า','ปิดการขายสำเร็จ','ปิดการขายไม่สำเร็จ'];

async function renderPipeline() {
  const deals = await api.get('/api/deals');
  const byStage = {};
  PIPELINE_STAGES.forEach(s => byStage[s] = []);
  deals.forEach(d => { if (!byStage[d.status]) byStage[d.status] = []; byStage[d.status].push(d); });

  const SHOW_STAGES = ['เสนอทรัพย์','นัดชมทรัพย์','ต่อรองราคา','วางมัดจำ','ยื่นสินเชื่อ','นัดวันโอน','ปิดการขายสำเร็จ','ปิดการขายไม่สำเร็จ'];
  // สีแค่ accent dot — header text เป็น dark
  const STAGE_DOTS = {
    'เสนอทรัพย์':'#1B4FD8','นัดชมทรัพย์':'#7C3AED','ต่อรองราคา':'#D97706','วางมัดจำ':'#EA580C','ยื่นสินเชื่อ':'#0891B2','นัดวันโอน':'#059669','ปิดการขายสำเร็จ':'#16A34A','ปิดการขายไม่สำเร็จ':'#DC2626',
  };

  $('main-content').innerHTML = `
    <div class="space-y-4">
      ${pageHeader('Sales Pipeline', `ดีลทั้งหมด ${deals.length} รายการ`, `<button onclick="showCreateDealFromPipeline()" class="btn btn-primary">+ สร้างดีลใหม่</button>`)}

      <div class="kanban-board" id="kanban-board">
        ${SHOW_STAGES.map(stage => {
          const stagDeals = byStage[stage] || [];
          const dot = STAGE_DOTS[stage] || '#6b7280';
          return `<div class="kanban-col" data-stage="${esc(stage)}"
            ondragover="event.preventDefault();this.classList.add('drag-over')"
            ondragleave="this.classList.remove('drag-over')"
            ondrop="kanbanDrop(event,'${esc(stage)}')">
            <div class="kanban-header" style="color:#1E293B">
              <div style="display:flex;align-items:center;gap:6px">
                <span style="width:8px;height:8px;border-radius:50%;background:${dot};flex-shrink:0;display:inline-block"></span>
                <span style="font-size:12px;font-weight:700">${stage}</span>
              </div>
              <span style="background:#F1F5F9;color:#64748B;min-width:20px;height:20px;border-radius:999px;display:flex;align-items:center;justify-content:center;font-size:11px;font-weight:700">${stagDeals.length}</span>
            </div>
            <div class="kanban-cards">
              ${stagDeals.map(d=>`
                <div class="deal-card" draggable="true"
                  data-deal-id="${d.id}"
                  ondragstart="kanbanDragStart(event,${d.id})"
                  ondragend="kanbanDragEnd(event)"
                  onclick="showDealDetail(${d.id})">
                  <button onclick="event.stopPropagation();navigate('customer-detail',{id:${d.customer_id}})"
                    style="background:none;border:none;padding:0;cursor:pointer;font-family:inherit;text-align:left;width:100%">
                    <div class="deal-card-title" style="color:#1B4FD8;text-decoration:underline;text-underline-offset:2px">${esc(d.customer_name||'-')}</div>
                  </button>
                  <div class="deal-card-sub" style="color:#94A3B8">${esc(d.property_code||'')} · ${esc(d.property_type||'')}</div>
                  <div style="font-size:11px;color:#64748B;margin-bottom:6px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis">${esc(d.property_title||'')}</div>
                  <div style="font-size:15px;font-weight:700;color:#0F172A">${fmtNum(d.sale_price)} ฿</div>
                  <div style="font-size:11px;color:#16A34A;margin-top:2px">ค่านายหน้า ${fmtNum(d.commission_amount)} ฿</div>
                </div>`).join('')}
            </div>
          </div>`;
        }).join('')}
      </div>
    </div>`;

  // ── Drag & Drop handlers ─────────────────────────────────
  window.kanbanDragStart = function(e, dealId) {
    e.dataTransfer.setData('dealId', dealId);
    setTimeout(() => e.target.style.opacity = '0.4', 0);
    e.target.style.cursor = 'grabbing';
  };
  window.kanbanDragEnd = function(e) {
    e.target.style.opacity = '1';
    document.querySelectorAll('.kanban-col').forEach(c => c.classList.remove('drag-over'));
  };
  window.kanbanDrop = async function(e, targetStage) {
    e.preventDefault();
    const col = e.currentTarget;
    col.classList.remove('drag-over');
    const dealId = e.dataTransfer.getData('dealId');
    if (!dealId) return;
    try {
      await api.patch(`/api/deals/${dealId}/status`, { status: targetStage });
      toast(`ย้ายไป "${targetStage}" แล้ว`);
      renderPipeline();
    } catch(err) {
      toast('ย้ายไม่สำเร็จ', 'error');
    }
  };
}

async function showDealDetail(id) {
  const d = await api.get('/api/deals/'+id);
  showModal(`
    <div class="p-6">
      <div class="flex items-center justify-between mb-4">
        <h2 class="text-lg font-bold text-navy-700">${esc(d.deal_code)}</h2>
        <button onclick="hideModal()" class="text-gray-400 text-xl">&times;</button>
      </div>
      <div class="grid grid-cols-2 gap-3 mb-4">
        ${infoRow('ลูกค้า', d.customer_name)} ${infoRow('เบอร์', d.customer_phone)}
        ${infoRow('ทรัพย์', d.property_title)} ${infoRow('ราคา', fmtPrice(d.sale_price))}
        ${infoRow('ค่านายหน้า', fmtPrice(d.commission_amount))} ${infoRow('ผู้รับผิดชอบ', d.agent_name)}
      </div>
      <div class="mb-4">${custBadge(d.status)}</div>
      ${d.note?`<div class="p-3 bg-gray-50 rounded text-xs mb-4">${esc(d.note)}</div>`:''}
      <div class="mb-3"><div class="text-xs font-semibold text-gray-600 mb-2">เปลี่ยนสถานะ:</div>
        <div class="flex flex-wrap gap-2">${PIPELINE_STAGES.map(s=>`<button onclick="updateDealStatus(${d.id},'${s}')" class="btn btn-xs ${d.status===s?'btn-primary':'btn-outline'}">${s}</button>`).join('')}</div>
      </div>
      <div class="flex justify-end gap-2">
        <button onclick="navigate('customer-detail',{id:${d.customer_id}});hideModal()" class="btn btn-outline btn-sm">ดูลูกค้า</button>
        <button onclick="navigate('property-detail',{id:${d.property_id}});hideModal()" class="btn btn-outline btn-sm">ดูทรัพย์</button>
        ${!d.commission_received?`<button onclick="showRecordCommission(${d.id},${d.commission_amount})" class="btn btn-success btn-sm">บันทึกรับค่านายหน้า</button>`:'<span class="badge badge-green">รับค่านายหน้าแล้ว</span>'}
      </div>
    </div>`);
}

async function updateDealStatus(id, status) {
  await api.patch('/api/deals/'+id+'/status', { status });
  hideModal(); toast('อัปเดตสถานะดีล: '+status); navigate('pipeline');
}

function moveDeal(id, currentStage) {
  const next = PIPELINE_STAGES.find((s,i) => PIPELINE_STAGES[i-1] === currentStage);
  if (next) { api.patch('/api/deals/'+id+'/status', { status: next }).then(() => { toast('ย้ายไป: '+next); navigate('pipeline'); }); }
}

function showRecordCommission(dealId, amount) {
  hideModal();
  showModal(`
    <div class="p-5">
      <div class="flex items-center justify-between mb-4"><h3 class="font-bold text-navy-700">บันทึกรับค่านายหน้า</h3><button onclick="hideModal()" class="text-gray-400 text-xl">&times;</button></div>
      <div class="form-group"><label class="form-label">จำนวนเงิน (฿)</label><input id="rc-amount" type="number" class="form-control" value="${amount}"></div>
      <div class="form-group"><label class="form-label">วันที่รับ</label><input id="rc-date" type="date" class="form-control" value="${new Date().toISOString().split('T')[0]}"></div>
      <div class="form-group"><label class="form-label">หมายเหตุ</label><input id="rc-note" class="form-control"></div>
      <div class="flex justify-end gap-3 mt-4"><button onclick="hideModal()" class="btn btn-outline">ยกเลิก</button><button onclick="api.post('/api/commissions',{deal_id:${dealId},amount:$('rc-amount').value,received_date:$('rc-date').value,note:$('rc-note').value}).then(()=>{hideModal();toast('บันทึกรับค่านายหน้าสำเร็จ');navigate('pipeline')})" class="btn btn-success">บันทึก</button></div>
    </div>`);
}

async function showCreateDealFromPipeline() {
  const [customers, properties] = await Promise.all([api.get('/api/customers'), api.get('/api/properties?status=พร้อมขาย')]);
  showModal(`
    <div class="p-6">
      <div class="flex items-center justify-between mb-4"><h3 class="text-lg font-bold text-navy-700">สร้างดีลใหม่</h3><button onclick="hideModal()" class="text-gray-400 text-xl">&times;</button></div>
      <div class="form-group"><label class="form-label">ลูกค้า *</label><select id="pnd-cust" class="form-control"><option value="">-- เลือก --</option>${customers.map(c=>`<option value="${c.id}">${c.full_name}</option>`).join('')}</select></div>
      <div class="form-group"><label class="form-label">ทรัพย์สิน *</label><select id="pnd-prop" class="form-control"><option value="">-- เลือก --</option>${properties.map(p=>`<option value="${p.id}">${p.property_code} - ${p.title}</option>`).join('')}</select></div>
      <div class="form-group"><label class="form-label">หมายเหตุ</label><textarea id="pnd-note" class="form-control" rows="2"></textarea></div>
      <div class="flex justify-end gap-3 mt-4"><button onclick="hideModal()" class="btn btn-outline">ยกเลิก</button><button onclick="api.post('/api/deals',{customer_id:$('pnd-cust').value,property_id:$('pnd-prop').value,note:$('pnd-note').value,assigned_agent_id:2}).then(r=>{hideModal();toast('สร้างดีลสำเร็จ');navigate('pipeline')})" class="btn btn-primary">สร้างดีล</button></div>
    </div>`);
}

// ─── APPOINTMENTS ─────────────────────────────────────────────────────────────
async function renderAppointments() {
  const today = new Date().toISOString().split('T')[0];
  const weekEnd = new Date(Date.now() + 7*24*60*60*1000).toISOString().split('T')[0];
  let appts = await api.get('/api/appointments');
  const customers = await api.get('/api/customers');
  const properties = await api.get('/api/properties');

  const TYPE_COLORS = {'นัดชมทรัพย์':'badge-purple','นัดโทรกลับ':'badge-blue','นัดส่งข้อมูล':'badge-navy','นัดเจ้าของทรัพย์':'badge-orange','นัดเซ็นสัญญา':'badge-gold','นัดยื่นกู้':'badge-yellow','นัดโอนกรรมสิทธิ์':'badge-green'};

  $('main-content').innerHTML = `
    <div class="space-y-4">
      ${pageHeader('นัดหมาย', 'ตารางนัดหมายและการนัดชมทรัพย์', `<button onclick="showAddAppointmentModal()" class="btn btn-primary">+ เพิ่มนัดหมาย</button>`)}
      <div class="flex items-center gap-3">
        <div class="filter-bar">
          <select id="filter-appt-status" class="form-control" style="width:auto">
            <option value="">ทุกสถานะ</option>
            <option>รอดำเนินการ</option><option>เสร็จสิ้น</option><option>ยกเลิก</option>
          </select>
        </div>
      </div>
      <!-- Today -->
      <div class="bg-white rounded-xl border overflow-hidden">
        <div class="px-5 py-3 bg-navy-700 text-white text-sm font-semibold">นัดหมายวันนี้ (${today})</div>
        <div id="appt-today"></div>
      </div>
      <!-- Upcoming -->
      <div class="bg-white rounded-xl border overflow-hidden">
        <div class="px-5 py-3 border-b text-sm font-semibold text-gray-700">นัดหมายที่จะมาถึง (7 วันข้างหน้า)</div>
        <div id="appt-upcoming"></div>
      </div>
      <!-- All -->
      <div class="bg-white rounded-xl border overflow-hidden">
        <div class="px-5 py-3 border-b text-sm font-semibold text-gray-700">นัดหมายทั้งหมด</div>
        <div id="appt-all"></div>
      </div>
    </div>`;

  function renderApptTable(appts, containerId) {
    const el = $(containerId);
    if (!appts.length) { el.innerHTML = '<div class="empty-state py-6 text-sm">ไม่มีนัดหมาย</div>'; return; }
    el.innerHTML = `<table><thead><tr><th>ประเภท</th><th>วัน-เวลา</th><th>ลูกค้า</th><th>ทรัพย์</th><th>ผู้รับผิดชอบ</th><th>สถานะ</th><th></th></tr></thead><tbody>
      ${appts.map(a=>`<tr>
        <td><span class="badge ${TYPE_COLORS[a.type]||'badge-gray'}">${esc(a.type)}</span></td>
        <td class="text-xs"><div class="font-semibold">${fmtDate(a.appointment_date)}</div><div class="text-gray-400">${a.appointment_time||'-'}</div></td>
        <td class="text-sm">${esc(a.customer_name||'-')}<br><span class="text-xs text-gray-400">${esc(a.customer_phone||'')}</span></td>
        <td class="text-xs">${esc(a.property_title||'-')}</td>
        <td class="text-xs text-gray-500">${esc(a.agent_name||'-')}</td>
        <td><span class="badge ${a.status==='เสร็จสิ้น'?'badge-green':a.status==='ยกเลิก'?'badge-red':'badge-yellow'}">${a.status}</span></td>
        <td class="flex gap-1">
          ${a.status==='รอดำเนินการ'?`<button onclick="updateApptStatus(${a.id},'เสร็จสิ้น')" class="btn btn-xs btn-success">เสร็จ</button><button onclick="updateApptStatus(${a.id},'ยกเลิก')" class="btn btn-xs btn-danger">ยกเลิก</button>`:''}
          <button onclick="deleteAppt(${a.id})" class="btn btn-xs btn-outline">ลบ</button>
        </td>
      </tr>`).join('')}
    </tbody></table>`;
  }

  renderApptTable(appts.filter(a => a.appointment_date === today), 'appt-today');
  renderApptTable(appts.filter(a => a.appointment_date > today && a.appointment_date <= weekEnd), 'appt-upcoming');
  renderApptTable(appts, 'appt-all');

  window._apptCustomers = customers;
  window._apptProperties = properties;

  $('filter-appt-status').addEventListener('change', e => {
    const s = e.target.value;
    const filtered = s ? appts.filter(a=>a.status===s) : appts;
    renderApptTable(filtered.filter(a=>a.appointment_date===today), 'appt-today');
    renderApptTable(filtered.filter(a=>a.appointment_date>today&&a.appointment_date<=weekEnd), 'appt-upcoming');
    renderApptTable(filtered, 'appt-all');
  });
}

async function updateApptStatus(id, status) {
  await api.patch('/api/appointments/'+id+'/status', { status });
  toast('อัปเดตนัดหมาย: '+status); navigate('appointments');
}
async function deleteAppt(id) {
  if (!confirm('ยืนยันลบนัดหมาย?')) return;
  await api.delete('/api/appointments/'+id);
  toast('ลบนัดหมายแล้ว'); navigate('appointments');
}

function showAddAppointmentModal() {
  const customers = window._apptCustomers || [];
  const properties = window._apptProperties || [];
  const today = new Date().toISOString().split('T')[0];
  showModal(`
    <div class="p-6">
      <div class="flex items-center justify-between mb-4"><h2 class="text-lg font-bold text-navy-700">เพิ่มนัดหมาย</h2><button onclick="hideModal()" class="text-gray-400 text-xl">&times;</button></div>
      <div class="grid grid-cols-2 gap-4">
        <div class="form-group col-span-2"><label class="form-label">ประเภทนัด *</label>
          <select id="na-type" class="form-control">${['นัดชมทรัพย์','นัดโทรกลับ','นัดส่งข้อมูล','นัดเจ้าของทรัพย์','นัดเซ็นสัญญา','นัดยื่นกู้','นัดโอนกรรมสิทธิ์'].map(s=>`<option>${s}</option>`).join('')}</select></div>
        <div class="form-group"><label class="form-label">วันที่ *</label><input id="na-date" type="date" class="form-control" value="${today}"></div>
        <div class="form-group"><label class="form-label">เวลา</label><input id="na-time" type="time" class="form-control" value="10:00"></div>
        <div class="form-group col-span-2"><label class="form-label">ลูกค้า</label><select id="na-cust" class="form-control"><option value="">-- ไม่ระบุ --</option>${customers.map(c=>`<option value="${c.id}">${c.full_name}</option>`).join('')}</select></div>
        <div class="form-group col-span-2"><label class="form-label">ทรัพย์สิน</label><select id="na-prop" class="form-control"><option value="">-- ไม่ระบุ --</option>${properties.map(p=>`<option value="${p.id}">${p.property_code} - ${p.title}</option>`).join('')}</select></div>
        <div class="form-group col-span-2"><label class="form-label">หมายเหตุ</label><textarea id="na-note" class="form-control" rows="2"></textarea></div>
      </div>
      <div class="flex justify-end gap-3 mt-4"><button onclick="hideModal()" class="btn btn-outline">ยกเลิก</button><button onclick="submitAddAppt()" class="btn btn-primary">บันทึกนัด</button></div>
    </div>`);
}

async function submitAddAppt() {
  const data = { type:$('na-type').value, appointment_date:$('na-date').value, appointment_time:$('na-time').value, customer_id:$('na-cust').value||null, property_id:$('na-prop').value||null, note:$('na-note').value };
  if (!data.appointment_date) { toast('กรุณาเลือกวันที่','error'); return; }
  await api.post('/api/appointments', data);
  hideModal(); toast('เพิ่มนัดหมายสำเร็จ'); navigate('appointments');
}

// ─── REPORTS ──────────────────────────────────────────────────────────────────
async function renderReports() {
  const data = await api.get('/api/reports/commissions');

  $('main-content').innerHTML = `
    <div class="space-y-4">
      ${pageHeader('รายงานค่านายหน้า', 'สรุปรายได้และดีลที่ปิดสำเร็จ')}
      <!-- Summary Cards -->
      <div class="grid grid-cols-3 gap-4">
        ${kpiCard('ดีลปิดสำเร็จ', data.summary.count+' ดีล', 'ทั้งหมดที่บันทึก', '#1B3A6B', `<path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z"/>`)}
        ${kpiCard('รายได้ค่านายหน้ารวม', fmtNum(data.summary.total)+' ฿', 'จากดีลที่ปิดแล้ว', '#27ae60', `<path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 8c-1.657 0-3 .895-3 2s1.343 2 3 2 3 .895 3 2-1.343 2-3 2m0-8c1.11 0 2.08.402 2.599 1M12 8V7m0 1v8m0 0v1m0-1c-1.11 0-2.08-.402-2.599-1M21 12a9 9 0 11-18 0 9 9 0 0118 0z"/>`)}
        ${kpiCard('รายได้เฉลี่ยต่อดีล', fmtNum(data.summary.count?Math.round(data.summary.total/data.summary.count):0)+' ฿', 'ค่าเฉลี่ย', '#C9A84C', `<path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M9 19v-6a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2a2 2 0 002-2zm0 0V9a2 2 0 012-2h2a2 2 0 012 2v10m-6 0a2 2 0 002 2h2a2 2 0 002-2m0 0V5a2 2 0 012-2h2a2 2 0 012 2v14a2 2 0 01-2 2h-2a2 2 0 01-2-2z"/>`)}
      </div>

      <!-- By Agent -->
      <div class="bg-white rounded-xl border p-5">
        <h3 class="text-sm font-semibold mb-3">รายได้แยกตามนายหน้า</h3>
        ${data.by_agent.length ? `<table><thead><tr><th>นายหน้า</th><th>จำนวนดีล</th><th>รายได้รวม</th></tr></thead><tbody>${data.by_agent.map(a=>`<tr><td class="font-medium">${esc(a.agent_name||'ไม่ระบุ')}</td><td>${a.count}</td><td class="font-bold text-green-600">${fmtNum(a.total)} ฿</td></tr>`).join('')}</tbody></table>` : '<div class="empty-state py-4 text-sm">ยังไม่มีข้อมูล</div>'}
      </div>

      <!-- Deal List -->
      <div class="bg-white rounded-xl border overflow-hidden">
        <div class="px-5 py-3 border-b text-sm font-semibold text-gray-700">รายการดีลที่ปิดสำเร็จ</div>
        ${data.deals.length ? `<table><thead><tr><th>รหัสดีล</th><th>ลูกค้า</th><th>ทรัพย์</th><th>ราคาขาย</th><th>ค่านายหน้า</th><th>วันที่รับเงิน</th><th>นายหน้า</th></tr></thead><tbody>${data.deals.map(d=>`
          <tr>
            <td class="font-semibold text-xs text-navy-700">${esc(d.deal_code)}</td>
            <td>${esc(d.customer_name||'-')}</td>
            <td class="text-xs">${esc(d.property_title||'-')}</td>
            <td class="font-bold text-sm">${fmtNum(d.sale_price)} ฿</td>
            <td class="font-bold text-green-600">${fmtNum(d.commission_paid||d.commission_amount)} ฿</td>
            <td class="text-xs">${fmtDate(d.received_date)}</td>
            <td class="text-xs text-gray-500">${esc(d.agent_name||'-')}</td>
          </tr>`).join('')}</tbody></table>` : '<div class="empty-state py-8 text-sm">ยังไม่มีดีลที่ปิดสำเร็จ</div>'}
      </div>
    </div>`;
}

// ─── SETTINGS ─────────────────────────────────────────────────────────────────
async function renderSettings() {
  let zones = await api.get('/api/zones');

  function renderZoneList(list) {
    $('zone-list').innerHTML = list.length ? list.map(z => `
      <div class="flex items-center justify-between p-3 bg-white rounded-lg border mb-2">
        <div>
          <span class="font-medium text-sm">${esc(z.name)}</span>
          <span class="text-xs text-gray-400 ml-2">${z.property_count} ทรัพย์</span>
        </div>
        <button onclick="deleteZone(${z.id},'${esc(z.name)}')" class="btn btn-danger btn-xs">ลบ</button>
      </div>`).join('') : '<div class="text-xs text-gray-400 p-3">ยังไม่มีโซน</div>';
  }

  $('main-content').innerHTML = `
    <div class="max-w-2xl space-y-6">
      ${pageHeader('ตั้งค่า', 'จัดการโซน ข้อมูลระบบ')}
      <!-- Zone Management -->
      <div class="bg-white rounded-xl border p-5">
        <div class="flex items-center justify-between mb-4">
          <div>
            <h3 class="font-bold text-navy-700">จัดการโซนพื้นที่</h3>
            <div class="text-xs text-gray-400 mt-1">โซนเหล่านี้จะแสดงในฟอร์มเพิ่มทรัพย์และหน้ากรองทรัพย์</div>
          </div>
          <span class="badge badge-navy">${zones.length} โซน</span>
        </div>

        <!-- Add new zone -->
        <div class="flex gap-2 mb-4">
          <input id="new-zone-name" class="form-control" placeholder="ชื่อโซนใหม่ เช่น บ้านเป็ด, โนนม่วง">
          <button onclick="addZone()" class="btn btn-primary" style="white-space:nowrap">+ เพิ่มโซน</button>
        </div>

        <!-- Zone list -->
        <div id="zone-list"></div>
      </div>
    </div>`;

  renderZoneList(zones);

  window.addZone = async function() {
    const name = $('new-zone-name').value.trim();
    if (!name) { toast('กรุณากรอกชื่อโซน', 'error'); return; }
    try {
      await api.post('/api/zones', { name, province: 'ขอนแก่น' });
      $('new-zone-name').value = '';
      zones = await api.get('/api/zones');
      renderZoneList(zones);
      toast('เพิ่มโซน "' + name + '" สำเร็จ');
    } catch(e) {
      toast(e.message || 'เกิดข้อผิดพลาด', 'error');
    }
  };

  window.deleteZone = async function(id, name) {
    if (!confirm(`ยืนยันลบโซน "${name}"?`)) return;
    await api.delete('/api/zones/' + id);
    zones = await api.get('/api/zones');
    renderZoneList(zones);
    toast('ลบโซน "' + name + '" แล้ว');
  };

  // Allow pressing Enter in input
  $('new-zone-name').addEventListener('keydown', e => { if (e.key === 'Enter') window.addZone(); });
}

// ─── INIT ─────────────────────────────────────────────────────────────────────
function init() {
  // Set current date
  $('current-date').textContent = new Date().toLocaleDateString('th-TH', { weekday:'long', year:'numeric', month:'long', day:'numeric' });

  // Load users
  api.get('/api/users').then(u => { state.users = u; });

  // Check today's appointments for badge
  api.get('/api/appointments').then(appts => {
    const today = new Date().toISOString().split('T')[0];
    const todayCount = appts.filter(a => a.appointment_date === today && a.status === 'รอดำเนินการ').length;
    if (todayCount > 0) $('notif-badge').classList.remove('hidden');
  });

  // Route
  const hash = location.hash.replace('#', '') || 'dashboard';
  const [page, ...rest] = hash.split('/');
  navigate(page, { id: rest[0] });
}

document.addEventListener('DOMContentLoaded', init);
