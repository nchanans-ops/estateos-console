// ─── STATE ────────────────────────────────────────────────────────────────────
const state = { currentPage: 'dashboard', users: [], charts: {} };

// ─── UTILITIES ────────────────────────────────────────────────────────────────
const $ = id => document.getElementById(id);
const fmtPrice = n => n ? Number(n).toLocaleString('th-TH') + ' บาท' : '-';
const fmtNum = n => n ? Number(n).toLocaleString('th-TH') : '0';
const fmtDate = d => d ? new Date(d).toLocaleDateString('th-TH', { year:'numeric', month:'short', day:'numeric' }) : '-';
const fmtDateTime = d => d ? new Date(d).toLocaleString('th-TH', { year:'numeric', month:'short', day:'numeric', hour:'2-digit', minute:'2-digit' }) : '-';
const esc = s => String(s||'').replace(/</g,'&lt;').replace(/>/g,'&gt;');

// ─── Cache Layer (L1: memory, L2: localStorage, L3: GAS) ─────────────────────
// L1 memory: เร็วสุด หายเมื่อ refresh
// L2 localStorage: คงอยู่ข้าม refresh, stale หลัง 5 นาที แต่ยังใช้แสดงผลได้
// L3 GAS: ข้อมูลจริง แหล่งเดียวที่เขียนได้

const LS_PRE  = 'reboms_';
const LS_STALE = 5 * 60 * 1000; // 5 นาที
const _mem = {};

// L1: memory
function _memGet(k)      { const e = _mem[k]; return (e && Date.now()-e.t < 300000) ? e.v : null; }
function _memPut(k, v)   { _mem[k] = { v, t: Date.now() }; }
function _memDel(k)      { delete _mem[k]; }

// L2: localStorage
function _lsGet(k) {
  try {
    const raw = localStorage.getItem(LS_PRE + k);
    if (!raw) return null;
    const { d, ts } = JSON.parse(raw);
    return { data: d, stale: Date.now() - ts > LS_STALE };
  } catch(e) { return null; }
}
function _lsPut(k, v) {
  try { localStorage.setItem(LS_PRE + k, JSON.stringify({ d: v, ts: Date.now() })); } catch(e) {}
}
function _lsDel(k) {
  try { localStorage.removeItem(LS_PRE + k); } catch(e) {}
}

// เคลียร์ list cache ทั้งหมด (ไม่แตะ full-detail)
const LIST_KEYS = ['dashboard','customers','properties','deals','appointments','commissions','agents','zones','owners','reports_comm'];
function _invalidateLists() {
  LIST_KEYS.forEach(k => { _memDel(k); _lsDel(k); });
}

// ─── API (Google Apps Script layer) ──────────────────────────────────────────
async function _gasGet(action, params = {}) {
  const url = window.GAS_URL;
  if (!url || url.includes('YOUR_')) throw new Error('ยังไม่ได้ตั้งค่า GAS_URL ใน index.html');
  const qs = new URLSearchParams({ action, ...params }).toString();
  const r = await fetch(`${url}?${qs}`, { redirect: 'follow' });
  const text = await r.text();
  let j;
  try { j = JSON.parse(text); } catch(e) { throw new Error('API error: ' + text.slice(0,120)); }
  if (!j.ok) throw new Error(j.error || 'API error');
  return j.data;
}
async function _gasPost(action, body = {}) {
  const url = window.GAS_URL;
  if (!url || url.includes('YOUR_')) throw new Error('ยังไม่ได้ตั้งค่า GAS_URL ใน index.html');
  const r = await fetch(url, {
    method: 'POST', redirect: 'follow',
    headers: { 'Content-Type': 'text/plain;charset=UTF-8' },
    body: JSON.stringify({ action, ...body })
  });
  const text = await r.text();
  let j;
  try { j = JSON.parse(text); } catch(e) { throw new Error('API error: ' + text.slice(0,120)); }
  if (!j.ok) throw new Error(j.error || 'API error');
  return j.data;
}

// cache-first GET: L1 → L2 → L3
// ถ้าเจอใน L2 แต่ stale → return ทันที แล้ว refresh background
async function _cachedGet(cacheKey, fn) {
  // L1 memory hit → ทันที
  const memHit = _memGet(cacheKey);
  if (memHit !== null) return memHit;

  // L2 localStorage hit
  const lsHit = _lsGet(cacheKey);
  if (lsHit) {
    _memPut(cacheKey, lsHit.data);
    if (lsHit.stale) {
      // refresh ใน background ไม่บล็อก UI
      fn().then(fresh => { _memPut(cacheKey, fresh); _lsPut(cacheKey, fresh); }).catch(() => {});
    }
    return lsHit.data;
  }

  // L3 GAS → fetch จริง
  const data = await fn();
  _memPut(cacheKey, data);
  _lsPut(cacheKey, data);
  return data;
}

const api = {
  get(url) {
    const [path, qs] = url.split('?');
    const params = Object.fromEntries(new URLSearchParams(qs||''));
    if (path === '/api/dashboard')    return _cachedGet('dashboard',    () => _gasGet('dashboard'));
    if (path === '/api/customers')    return _cachedGet('customers',    () => _gasGet('getCustomers'));
    if (path === '/api/users')        return _cachedGet('agents',       () => _gasGet('getAgents'));
    if (path === '/api/zones')        return _cachedGet('zones',        () => _gasGet('getZones'));
    if (path === '/api/owners')       return _cachedGet('owners',       () => _gasGet('getOwners'));
    if (path === '/api/properties')   return _cachedGet('properties',   () => _gasGet('getProperties')).then(all => params.status ? all.filter(p=>p.status===params.status) : all);
    if (path === '/api/deals')        return _cachedGet('deals',        () => _gasGet('getDeals'));
    if (path === '/api/appointments') return _cachedGet('appointments', () => _gasGet('getAppointments'));
    if (path === '/api/commissions')  return _cachedGet('commissions',  () => _gasGet('getCommissions'));
    if (path === '/api/reports/commissions') return _cachedGet('reports_comm', () => _gasGet('getReportsCommissions'));
    let m;
    if ((m=path.match(/^\/api\/customers\/(\w+)$/)))  return _cachedGet('cust/full/'+m[1],  () => _gasGet('getCustomerFull', {id:m[1]}));
    if ((m=path.match(/^\/api\/properties\/(\w+)$/))) return _cachedGet('prop/full/'+m[1],  () => _gasGet('getPropertyFull', {id:m[1]}));
    if ((m=path.match(/^\/api\/deals\/(\w+)$/)))      return _cachedGet('deal/full/'+m[1],  () => _gasGet('getDealFull', {id:m[1]}));
    if ((m=path.match(/^\/api\/match\/(\w+)$/)))      return _gasGet('matchProperties', {customerId:m[1]});
    throw new Error('Unknown GET: '+url);
  },
  post(url, data) {
    const [path] = url.split('?'); let m;
    _invalidateLists();
    if (path === '/api/customers')    return _gasPost('createCustomer', {data});
    if (path === '/api/properties')   return _gasPost('createProperty', {data});
    if (path === '/api/deals')        return _gasPost('createDeal', {data});
    if (path === '/api/appointments') return _gasPost('createAppointment', {data});
    if (path === '/api/commissions')  return _gasPost('createCommission', {data});
    if (path === '/api/zones')        return _gasPost('createZone', {data});
    if ((m=path.match(/^\/api\/customers\/(\w+)\/followup$/))) return _gasPost('addFollowup', {customerId:m[1], data});
    if ((m=path.match(/^\/api\/properties\/(\w+)\/images$/)))  return _gasPost('addPropertyImage', {propId:m[1], dataUrl:data.dataUrl, caption:data.caption});
    throw new Error('Unknown POST: '+url);
  },
  put(url, data) {
    const [path] = url.split('?'); let m;
    _invalidateLists();
    if ((m=path.match(/^\/api\/customers\/(\w+)$/)))    return _gasPost('updateCustomer', {id:m[1], data});
    if ((m=path.match(/^\/api\/properties\/(\w+)$/)))   return _gasPost('updateProperty', {id:m[1], data});
    if ((m=path.match(/^\/api\/deals\/(\w+)$/)))        return _gasPost('updateDeal', {id:m[1], data});
    if ((m=path.match(/^\/api\/appointments\/(\w+)$/))) return _gasPost('updateAppointment', {id:m[1], data});
    if ((m=path.match(/^\/api\/commissions\/(\w+)$/)))  return _gasPost('updateCommission', {id:m[1], data});
    throw new Error('Unknown PUT: '+url);
  },
  patch(url, data) {
    const [path] = url.split('?'); let m;
    _invalidateLists();
    if ((m=path.match(/^\/api\/deals\/(\w+)\/status$/)))      return _gasPost('updateDealStatus', {id:m[1], status:data.status});
    if ((m=path.match(/^\/api\/properties\/(\w+)\/status$/))) return _gasPost('updateProperty', {id:m[1], data:{status:data.status}});
    if ((m=path.match(/^\/api\/appointments\/(\w+)\/status$/))) return _gasPost('updateAppointment', {id:m[1], data:{status:data.status}});
    return this.put(path.replace(/\/status$/,''), data);
  },
  delete(url) {
    const [path] = url.split('?'); let m;
    _invalidateLists();
    if ((m=path.match(/^\/api\/customers\/(\w+)$/)))    return _gasPost('deleteCustomer', {id:m[1]});
    if ((m=path.match(/^\/api\/properties\/(\w+)$/)))   return _gasPost('deleteProperty', {id:m[1]});
    if ((m=path.match(/^\/api\/deals\/(\w+)$/)))        return _gasPost('deleteDeal', {id:m[1]});
    if ((m=path.match(/^\/api\/appointments\/(\w+)$/))) return _gasPost('deleteAppointment', {id:m[1]});
    if ((m=path.match(/^\/api\/commissions\/(\w+)$/)))  return _gasPost('deleteCommission', {id:m[1]});
    if ((m=path.match(/^\/api\/zones\/(\w+)$/)))        return _gasPost('deleteZone', {id:m[1]});
    if ((m=path.match(/^\/api\/properties\/(\w+)\/images\/(\d+)$/))) return _gasPost('deletePropertyImage', {propId:m[1], idx:parseInt(m[2])});
    throw new Error('Unknown DELETE: '+url);
  }
};

// ─── TOAST ────────────────────────────────────────────────────────────────────
function toast(msg, type = 'success') {
  const t = document.createElement('div');
  t.className = `toast toast-${type}`;
  t.innerHTML = msg;
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
  'edit-property': { title: 'แก้ไขทรัพย์', subtitle: 'แก้ไขข้อมูลทรัพย์สิน', render: renderEditProperty },
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
  // Scroll to top เมื่อเปลี่ยนหน้า
  const mc = $('main-content');
  if (mc) mc.scrollTop = 0;
  mc.innerHTML = '<div class="flex items-center justify-center py-20"><div class="animate-spin w-8 h-8 border-2 border-navy-700 border-t-transparent rounded-full"></div></div>';
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
        <div style="width:4px;height:28px;background:linear-gradient(180deg,#5DB85C,#4A9E49);border-radius:4px;flex-shrink:0"></div>
        <h2 style="font-size:26px;font-weight:800;color:#1A1A3A;letter-spacing:-0.5px;line-height:1">${title}</h2>
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
        ${kpiCard('ลูกค้าใหม่วันนี้', s.customers_new_today, 'ทั้งหมด '+fmtNum(s.customers_total)+' ราย', '#5DB85C', `<path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M16 7a4 4 0 11-8 0 4 4 0 018 0zM12 14a7 7 0 00-7 7h14a7 7 0 00-7-7z"/>`)}
        ${kpiCard('นัดหมายวันนี้', s.appointments_today, 'ต้องติดตาม '+s.customers_followup_today+' ราย', '#5DB85C', `<path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z"/>`)}
        ${kpiCard('ดีลเปิดอยู่', s.deals_active, 'ปิดสำเร็จ '+s.deals_closed+' | หลุด '+s.deals_lost, '#5DB85C', `<path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M9 19v-6a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2a2 2 0 002-2zm0 0V9a2 2 0 012-2h2a2 2 0 012 2v10m-6 0a2 2 0 002 2h2a2 2 0 002-2m0 0V5a2 2 0 012-2h2a2 2 0 012 2v14a2 2 0 01-2 2h-2a2 2 0 01-2-2z"/>`)}
        ${kpiCard('รายได้เดือนนี้', fmtNum(s.commission_this_month)+' ฿', 'รวมทั้งหมด '+fmtNum(s.commission_received)+' ฿', '#5DB85C', `<path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 8c-1.657 0-3 .895-3 2s1.343 2 3 2 3 .895 3 2-1.343 2-3 2m0-8c1.11 0 2.08.402 2.599 1M12 8V7m0 1v8m0 0v1m0-1c-1.11 0-2.08-.402-2.599-1M21 12a9 9 0 11-18 0 9 9 0 0118 0z"/>`)}
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
            ${[['พร้อมขาย',s.properties_available,'#5DB85C'],['จองแล้ว',s.properties_reserved,'#9ED89D'],['ขายแล้ว',s.properties_sold,'#CBD5E1']].map(([l,v,c])=>`
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
          <div class="text-2xl font-bold font-semibold">${fmtNum(s.commission_potential)} ฿</div>
          <div class="text-xs text-gray-400 mb-4">จาก ${s.deals_active} ดีลที่กำลังดำเนินการ</div>
          <div class="space-y-3">
            <div class="flex justify-between text-xs"><span class="text-gray-500">ได้รับแล้ว</span><span class="font-semibold" style="color:#5DB85C">${fmtNum(s.commission_received)} ฿</span></div>
            <div class="w-full bg-gray-100 rounded-full h-2"><div class="h-2 rounded-full" style="background:#5DB85C;width:${s.commission_potential?Math.min(100,Math.round(s.commission_received/s.commission_potential*100)):100}%"></div></div>
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
    type:'bar', data:{ labels: commLabels.length ? commLabels : ['ยังไม่มีข้อมูล'], datasets:[{ label:'ค่านายหน้า (฿)', data: commData.length ? commData : [0], backgroundColor:'rgba(93,184,92,0.82)', borderRadius:6 }] },
    options:{ plugins:{ legend:{ display:false } }, scales:{ y:{ ticks:{ callback:v=>fmtNum(v) } } }, responsive:true }
  });
  const srcLabels = data.source_stats.map(r=>r.source);
  state.charts.source = new Chart($('chart-source'), {
    type:'doughnut', data:{ labels: srcLabels.length ? srcLabels : ['ยังไม่มี'], datasets:[{ data: srcLabels.length ? data.source_stats.map(r=>r.count):[1], backgroundColor:['#5DB85C','#7CC87B','#9ED89D','#BAE8B9','#D4EDD4','#EAF5EA'], borderWidth:0 }] },
    options:{ plugins:{ legend:{ position:'bottom', labels:{ font:{size:11}, boxWidth:10, color:'#64748B' } } }, responsive:true }
  });
  const plLabels = data.pipeline_stats.map(r=>r.status);
  state.charts.pipeline = new Chart($('chart-pipeline'), {
    type:'bar', data:{ labels: plLabels.length ? plLabels : ['ยังไม่มี'], datasets:[{ label:'จำนวน', data: plLabels.length ? data.pipeline_stats.map(r=>r.count):[0], backgroundColor:'rgba(93,184,92,0.15)', borderColor:'rgba(93,184,92,0.6)', borderWidth:1, borderRadius:4 }] },
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
            <td><div class="font-semibold text-sm font-semibold">${esc(c.customer_code)}</div><div class="font-medium">${esc(c.full_name)}</div></td>
            <td><div class="text-xs">${esc(c.phone||'')}</div><div class="text-xs text-gray-400">${esc(c.line_id||'')}</div></td>
            <td><span class="badge badge-gray">${esc(c.source||'-')}</span></td>
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
          <h2 class="text-lg font-bold font-semibold">เพิ่มลูกค้าใหม่</h2>
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
                <h2 class="text-xl font-bold font-semibold">${esc(c.full_name)}</h2>
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
                  <span style="font-size:11px;font-weight:700;color:#5DB85C">${esc(d.deal_code)}</span>
                  ${custBadge(d.status)}
                </div>
                <div style="font-size:11px;color:#64748B">${esc(d.property_title||'-')}</div>
                <div style="font-size:13px;font-weight:700;color:#0F172A;margin-top:4px">${fmtNum(d.sale_price)} ฿</div>
              </div>`).join('') : '<p class="text-xs text-gray-400">ยังไม่มีดีล — <button onclick="navigate(\'pipeline\')" style="background:none;border:none;color:#5DB85C;cursor:pointer;font-size:12px;padding:0">สร้างดีลใน Pipeline</button></p>'}
          </div>

          <!-- Matched Properties -->
          <div class="bg-white rounded-xl border p-5">
            <h3 class="text-sm font-semibold mb-3">ทรัพย์ที่เหมาะสม (${matches.matches.length})</h3>
            ${matches.matches.slice(0,5).map(p=>`
              <div class="p-3 bg-gray-50 rounded-lg mb-2 cursor-pointer hover:bg-blue-50" onclick="navigate('property-detail',{id:${p.id}})">
                <div class="flex items-center justify-between mb-1">
                  <span class="text-xs font-semibold font-semibold">${esc(p.property_code)}</span>
                  <span class="badge ${p.match_level==='ตรงมาก'?'score-high':p.match_level==='ตรงปานกลาง'?'score-mid':'score-low'}">${p.score}%</span>
                </div>
                <div class="text-xs text-gray-700">${esc(p.title)}</div>
                <div class="text-xs font-bold font-semibold mt-1">${fmtNum(p.sale_price)} ฿</div>
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
        <h2 class="text-lg font-bold font-semibold">บันทึกการติดต่อ</h2>
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
        <h2 class="text-lg font-bold font-semibold">แก้ไขข้อมูลลูกค้า</h2>
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
  let images = p.images || [];
  if (typeof images === 'string') { try { images = JSON.parse(images); } catch(e) { images = []; } }
  const src = images.length > 0 ? (images[0].url || images[0].dataUrl) : null;
  if (src) {
    return `<img src="${src}" alt="${esc(p.title)}" loading="lazy">`;
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
          <button onclick="navigate('settings')" class="text-xs font-semibold hover:underline" style="background:none;border:none;cursor:pointer;font-family:inherit">+ จัดการโซน</button>
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
          <button onclick="navigate('edit-property',{id:${p.id}})" class="btn btn-outline btn-sm">แก้ไข</button>
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
      <div class="flex items-center justify-between mb-4"><h3 class="font-bold font-semibold">เปลี่ยนสถานะทรัพย์</h3><button onclick="hideModal()" class="text-gray-400 text-xl">&times;</button></div>
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
          <button class="tab-btn" data-tab="images">รูปภาพ</button>
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
            <div class="form-group"><label class="form-label">จุดเด่น</label><textarea id="ap-highlights" class="form-control" rows="2" placeholder="เช่น หลังมุม, วิวดี, ใกล้ BTS, ทำเลดี"></textarea></div>
            <div class="form-group"><label class="form-label">จุดด้อย</label><textarea id="ap-drawbacks" class="form-control" rows="2" placeholder="เช่น ถนนแคบ, ไม่มีที่จอดรถ, ใกล้ทางด่วน"></textarea></div>
            <div class="form-group">
              <label class="form-label">สิ่งปลูกสร้าง</label>
              <select id="ap-structure" class="form-control">
                <option value="">-- ยังไม่ระบุ --</option>
                <option value="มีสิ่งปลูกสร้าง">มีสิ่งปลูกสร้าง</option>
                <option value="ไม่มีสิ่งปลูกสร้าง">ไม่มีสิ่งปลูกสร้าง</option>
              </select>
            </div>
            <div class="form-group"><label class="form-label">Caption สำหรับ Facebook</label><textarea id="ap-caption" class="form-control" rows="3" placeholder="ข้อความโพสต์..."></textarea></div>
            <div class="form-group"><label class="form-label">Script สำหรับ TikTok</label><textarea id="ap-tiktok" class="form-control" rows="3" placeholder="สคริปต์วิดีโอสั้น..."></textarea></div>
            <div class="form-group"><label class="form-label">Hashtag</label><input id="ap-hashtag" class="form-control" placeholder="#บ้านขาย #เชียงใหม่ #อสังหา"></div>
            <div class="form-group"><label class="form-label">หมายเหตุภายในทีม</label><textarea id="ap-note" class="form-control" rows="2" placeholder="ข้อมูลที่ไม่ต้องการให้ลูกค้าเห็น"></textarea></div>
          </div>
        </div>

        <!-- Tab: Images -->
        <div id="tab-images" class="tab-content pt-5 hidden">
          <div class="mb-3 flex items-center justify-between">
            <div class="text-sm text-gray-500">อัปโหลดรูปก่อนบันทึกได้เลย — รูปจะถูกแนบพร้อมทรัพย์อัตโนมัติ</div>
            <label class="btn btn-primary btn-sm cursor-pointer">
              + เพิ่มรูป
              <input type="file" accept="image/*" multiple style="display:none" onchange="addPendingImages(this)">
            </label>
          </div>
          <div id="pending-img-gallery" class="img-gallery"></div>
          <div id="pending-img-count" class="text-xs text-gray-400 mt-2">ยังไม่มีรูป</div>
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
  window._pendingImages = []; // reset pending images
}

// Pending images (ก่อน save property)
window._pendingImages = [];

window.addPendingImages = async function(input) {
  const files = Array.from(input.files);
  if (!files.length) return;
  for (const file of files) {
    try {
      toast('กำลังอัปโหลด ' + file.name + '...', 'info');
      const base64 = await _compressImage(file);
      const url = await _uploadToCloudinary(base64, file.name);
      window._pendingImages.push({ url, caption: file.name });
      _renderPendingGallery();
      toast('อัปโหลดสำเร็จ');
    } catch(e) {
      toast('อัปโหลดล้มเหลว: ' + e.message, 'error');
    }
  }
};

function _renderPendingGallery() {
  const gallery = $('pending-img-gallery');
  const count = $('pending-img-count');
  if (!gallery) return;
  const imgs = window._pendingImages || [];
  gallery.innerHTML = imgs.map((img, i) => `
    <div class="img-thumb">
      <img src="${img.url}" alt="${esc(img.caption)}">
      <button class="img-del" onclick="removePendingImage(${i})" title="ลบ">&times;</button>
    </div>`).join('');
  if (count) count.textContent = imgs.length ? `${imgs.length} รูป` : 'ยังไม่มีรูป';
}

window.removePendingImage = function(i) {
  window._pendingImages.splice(i, 1);
  _renderPendingGallery();
};

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
      <div class="form-group"><label class="form-label">ประเภทเอกสารสิทธิ์</label><select id="df-title_deed" class="form-control">${['-- ยังไม่ระบุ --','โฉนดที่ดิน (น.ส.4 จ.)','น.ส.4 ข.','น.ส.4 ค.','น.ส.3 ก. (รังวัดแล้ว)','น.ส.3 ข.','น.ส.3','น.ส.2 (ใบจอง)','ส.ค.1','ภ.บ.ท.5','สทก.','คทช.','ที่ดินมือเปล่า','อื่นๆ'].map(s=>`<option>${s}</option>`).join('')}</select></div>
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
      <div class="form-group"><label class="form-label">ประเภทเอกสารสิทธิ์</label><select id="df-title_deed" class="form-control">${['-- ยังไม่ระบุ --','โฉนดที่ดิน (น.ส.4 จ.)','น.ส.4 ข.','น.ส.4 ค.','น.ส.3 ก. (รังวัดแล้ว)','น.ส.3 ข.','น.ส.3','น.ส.2 (ใบจอง)','ส.ค.1','ภ.บ.ท.5','สทก. (สิทธิทำกิน)','คทช.','ที่ดินมือเปล่า','อื่นๆ'].map(s=>`<option>${s}</option>`).join('')}</select></div>
    </div>`,
  'อาคารพาณิชย์': () => `
    <div class="grid grid-cols-3 gap-4">
      ${numField('df-floors','จำนวนชั้น')}${numField('df-frontage','หน้ากว้าง (เมตร)')}${numField('df-depth','ความลึก (เมตร)')}
      ${numField('df-land_sqw','ขนาดที่ดิน (ตร.ว.)')}${numField('df-usable_area','พื้นที่ใช้สอย (ตร.ม.)')}${numField('df-bathrooms','ห้องน้ำ')}
      ${numField('df-parking','ที่จอดรถ',0)}
      <div class="form-group"><label class="form-label">สภาพอาคาร</label><select id="df-building_condition" class="form-control">${['ดีมาก','ดี','ปานกลาง','ต้องซ่อม'].map(s=>`<option>${s}</option>`).join('')}</select></div>
      <div class="form-group"><label class="form-label">ทำเล</label><input id="df-location_type" class="form-control" placeholder="ติดถนนใหญ่, ใกล้ตลาด"></div>
      <div class="form-group"><label class="form-label">ประเภทเอกสารสิทธิ์</label><select id="df-title_deed" class="form-control">${['-- ยังไม่ระบุ --','โฉนดที่ดิน (น.ส.4 จ.)','น.ส.4 ข.','น.ส.4 ค.','น.ส.3 ก. (รังวัดแล้ว)','น.ส.3 ข.','น.ส.3','น.ส.2 (ใบจอง)','ส.ค.1','ภ.บ.ท.5','สทก.','คทช.','ที่ดินมือเปล่า','อื่นๆ'].map(s=>`<option>${s}</option>`).join('')}</select></div>
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
    highlights: getVal('ap-highlights'), drawbacks: getVal('ap-drawbacks'), structure: getVal('ap-structure'),
    title_deed: (document.getElementById('df-title_deed') ? document.getElementById('df-title_deed').value : '') || '',
    internal_note: getVal('ap-note'),
    assigned_agent_id: getVal('ap-agent'), owner_id: getVal('ap-owner'),
    property_details: details,
    marketing_data: { caption: getVal('ap-caption'), tiktok: getVal('ap-tiktok'), hashtag: getVal('ap-hashtag'), price_highlight: getVal('ap-pricesell') }
  };

  const r = await api.post('/api/properties', data);

  // แนบรูปที่อัปโหลดไว้ก่อนบันทึก
  const pending = window._pendingImages || [];
  for (const img of pending) {
    try {
      await api.post(`/api/properties/${r.id}/images`, { dataUrl: img.url, caption: img.caption });
    } catch(e) { /* ignore per-image error */ }
  }
  window._pendingImages = [];

  toast(save ? 'บันทึกทรัพย์สำเร็จ' : 'บันทึกร่างสำเร็จ');
  navigate('property-detail', { id: r.id });
}

// ─── EDIT PROPERTY ────────────────────────────────────────────────────────────
async function renderEditProperty(params) {
  const [p, owners, users, zones] = await Promise.all([
    api.get('/api/properties/'+(params.id||1)),
    api.get('/api/owners'),
    api.get('/api/users'),
    api.get('/api/zones'),
  ]);
  const d = p.property_details || {};
  const m = p.marketing_data || {};

  $('main-content').innerHTML = `
    <div class="max-w-4xl">
      <div class="flex items-center gap-3 mb-4">
        <button onclick="navigate('property-detail',{id:${p.id}})" class="btn btn-outline btn-sm">← กลับ</button>
        <span class="text-sm text-gray-500">${esc(p.property_code)}</span>
      </div>
      <div class="bg-white rounded-xl border p-6">
        <div class="tab-bar mb-0" id="ep-tab-bar">
          <button class="tab-btn active" data-tab="ep-general">ข้อมูลทั่วไป</button>
          <button class="tab-btn" data-tab="ep-price">ราคา & การเงิน</button>
          <button class="tab-btn" data-tab="ep-details">รายละเอียด</button>
          <button class="tab-btn" data-tab="ep-owner">เจ้าของทรัพย์</button>
          <button class="tab-btn" data-tab="ep-marketing">การตลาด</button>
        </div>

        <!-- Tab: General -->
        <div id="tab-ep-general" class="tab-content pt-5">
          <div class="grid grid-cols-2 gap-4">
            <div class="form-group col-span-2"><label class="form-label">ชื่อทรัพย์ / ชื่อประกาศ *</label><input id="ep-title" class="form-control" value="${esc(p.title||'')}"></div>
            <div class="form-group">
              <label class="form-label">ประเภทหลัก *</label>
              <select id="ep-type" class="form-control">
                ${['บ้าน','คอนโด','ที่ดิน','อาคารพาณิชย์','อสังหาริมทรัพย์เพื่อธุรกิจ','ทรัพย์ให้เช่า'].map(s=>`<option${p.property_type===s?' selected':''}>${s}</option>`).join('')}
              </select>
            </div>
            <div class="form-group"><label class="form-label">ประเภทย่อย</label><input id="ep-subtype" class="form-control" value="${esc(p.property_subtype||'')}"></div>
            <div class="form-group"><label class="form-label">จังหวัด</label><input id="ep-province" class="form-control" value="${esc(p.province||'')}"></div>
            <div class="form-group"><label class="form-label">อำเภอ</label><input id="ep-district" class="form-control" value="${esc(p.district||'')}"></div>
            <div class="form-group col-span-2"><label class="form-label">หมู่บ้าน / โครงการ</label><input id="ep-village" class="form-control" value="${esc(p.village_project||'')}"></div>
            <div class="form-group col-span-2"><label class="form-label">โซนพื้นที่</label>
              <select id="ep-zone" class="form-control">
                <option value="">-- เลือกโซน --</option>
                ${zones.map(z=>`<option value="${esc(z.name)}"${p.zone===z.name?' selected':''}>${esc(z.name)}</option>`).join('')}
              </select>
            </div>
            <div class="form-group col-span-2"><label class="form-label">สถานที่ใกล้เคียง</label><input id="ep-nearby" class="form-control" value="${esc(p.nearby_places||'')}"></div>
            <div class="form-group">
              <label class="form-label">ผู้ดูแลทรัพย์</label>
              <select id="ep-agent" class="form-control">
                <option value="">-- เลือก --</option>
                ${users.map(u=>`<option value="${u.id}"${p.agent_name===u.name?' selected':''}>${u.name}</option>`).join('')}
              </select>
            </div>
            <div class="form-group">
              <label class="form-label">สถานะทรัพย์</label>
              <select id="ep-status" class="form-control">${['พร้อมขาย','จองแล้ว','ขายแล้ว','ระงับขาย'].map(s=>`<option${p.status===s?' selected':''}>${s}</option>`).join('')}</select>
            </div>
          </div>
        </div>

        <!-- Tab: Price -->
        <div id="tab-ep-price" class="tab-content pt-5 hidden">
          <div class="grid grid-cols-2 gap-4">
            <div class="form-group"><label class="form-label">ราคาขาย (฿) *</label><input id="ep-price" type="number" class="form-control" value="${p.sale_price||0}"></div>
            <div class="form-group"><label class="form-label">ราคาประเมิน (฿)</label><input id="ep-appraisal" type="number" class="form-control" value="${p.appraisal_price||0}"></div>
            <div class="form-group"><label class="form-label">ราคาต่ำสุดที่รับได้ (฿)</label><input id="ep-minprice" type="number" class="form-control" value="${p.min_acceptable_price||0}"></div>
            <div class="form-group"><label class="form-label">ค่านายหน้า (%)</label><input id="ep-commrate" type="number" class="form-control" value="${p.commission_rate||3}"></div>
            <div class="form-group col-span-2"><label class="form-label">เงื่อนไขค่าใช้จ่ายโอน</label>
              <select id="ep-transfer" class="form-control">${['ออกคนละครึ่ง','ผู้ขายออก','ผู้ซื้อออก'].map(s=>`<option${p.transfer_fee_condition===s?' selected':''}>${s}</option>`).join('')}</select>
            </div>
            <div class="form-group col-span-2"><label class="form-label">จุดขายด้านราคา</label><input id="ep-pricesell" class="form-control" value="${esc(m.price_highlight||'')}"></div>
          </div>
        </div>

        <!-- Tab: Details -->
        <div id="tab-ep-details" class="tab-content pt-5 hidden">
          <div class="grid grid-cols-2 gap-4">
            <div class="form-group"><label class="form-label">ห้องนอน</label><input id="ep-bedrooms" type="number" class="form-control" value="${d.bedrooms||0}"></div>
            <div class="form-group"><label class="form-label">ห้องน้ำ</label><input id="ep-bathrooms" type="number" class="form-control" value="${d.bathrooms||0}"></div>
            <div class="form-group"><label class="form-label">ขนาดที่ดิน (ตร.ว.)</label><input id="ep-land_sqw" type="number" class="form-control" value="${d.land_sqw||0}"></div>
            <div class="form-group"><label class="form-label">พื้นที่ใช้สอย (ตร.ม.)</label><input id="ep-usable_area" type="number" class="form-control" value="${d.usable_area||0}"></div>
            <div class="form-group"><label class="form-label">จำนวนชั้น</label><input id="ep-floor" type="number" class="form-control" value="${d.floor||0}"></div>
            <div class="form-group"><label class="form-label">ที่จอดรถ</label><input id="ep-parking" type="number" class="form-control" value="${d.parking||0}"></div>
          </div>
        </div>

        <!-- Tab: Owner -->
        <div id="tab-ep-owner" class="tab-content pt-5 hidden">
          <div class="form-group"><label class="form-label">เลือกเจ้าของทรัพย์</label>
            <select id="ep-owner" class="form-control">
              <option value="">-- เลือกเจ้าของที่มีในระบบ --</option>
              ${owners.map(o=>`<option value="${o.id}"${p.owner_id==o.id?' selected':''}>${o.owner_name} (${o.phone||''})</option>`).join('')}
            </select>
          </div>
        </div>

        <!-- Tab: Marketing -->
        <div id="tab-ep-marketing" class="tab-content pt-5 hidden">
          <div class="grid grid-cols-1 gap-4">
            <div class="form-group"><label class="form-label">จุดเด่น</label><textarea id="ep-highlights" class="form-control" rows="2">${esc(p.highlights||'')}</textarea></div>
            <div class="form-group"><label class="form-label">จุดด้อย</label><textarea id="ep-drawbacks" class="form-control" rows="2">${esc(p.drawbacks||'')}</textarea></div>
            <div class="form-group">
              <label class="form-label">สิ่งปลูกสร้าง</label>
              <select id="ep-structure" class="form-control">
                <option value="">-- ยังไม่ระบุ --</option>
                <option value="มีสิ่งปลูกสร้าง"${p.structure==='มีสิ่งปลูกสร้าง'?' selected':''}>มีสิ่งปลูกสร้าง</option>
                <option value="ไม่มีสิ่งปลูกสร้าง"${p.structure==='ไม่มีสิ่งปลูกสร้าง'?' selected':''}>ไม่มีสิ่งปลูกสร้าง</option>
              </select>
            </div>
            <div class="form-group"><label class="form-label">Caption สำหรับ Facebook</label><textarea id="ep-caption" class="form-control" rows="3">${esc(m.caption||'')}</textarea></div>
            <div class="form-group"><label class="form-label">Script สำหรับ TikTok</label><textarea id="ep-tiktok" class="form-control" rows="3">${esc(m.tiktok||'')}</textarea></div>
            <div class="form-group"><label class="form-label">Hashtag</label><input id="ep-hashtag" class="form-control" value="${esc(m.hashtag||'')}"></div>
            <div class="form-group"><label class="form-label">หมายเหตุภายในทีม</label><textarea id="ep-note" class="form-control" rows="2">${esc(p.internal_note||'')}</textarea></div>
          </div>
        </div>

        <!-- Actions -->
        <div class="flex justify-between items-center mt-6 pt-4 border-t">
          <button onclick="navigate('property-detail',{id:${p.id}})" class="btn btn-outline">ยกเลิก</button>
          <button onclick="submitEditProperty(${p.id})" class="btn btn-primary">บันทึกการแก้ไข</button>
        </div>
      </div>
    </div>`;

  document.querySelectorAll('#ep-tab-bar .tab-btn').forEach(btn => {
    btn.addEventListener('click', () => {
      document.querySelectorAll('#ep-tab-bar .tab-btn').forEach(b => b.classList.remove('active'));
      document.querySelectorAll('[id^="tab-ep-"]').forEach(c => c.classList.add('hidden'));
      btn.classList.add('active');
      $('tab-'+btn.dataset.tab).classList.remove('hidden');
    });
  });
}

async function submitEditProperty(id) {
  const title = $('ep-title').value;
  if (!title) { toast('กรุณากรอกชื่อทรัพย์','error'); return; }
  const getVal = elId => $(elId)?.value || null;
  const getNum = elId => parseFloat($(elId)?.value || 0);

  const data = {
    title,
    property_type: getVal('ep-type'), property_subtype: getVal('ep-subtype'),
    province: getVal('ep-province'), district: getVal('ep-district'),
    village_project: getVal('ep-village'), zone: getVal('ep-zone'), nearby_places: getVal('ep-nearby'),
    status: getVal('ep-status'), assigned_agent_id: getVal('ep-agent'), owner_id: getVal('ep-owner'),
    sale_price: getNum('ep-price'), appraisal_price: getNum('ep-appraisal'), min_acceptable_price: getNum('ep-minprice'),
    commission_rate: getNum('ep-commrate'), transfer_fee_condition: getVal('ep-transfer'),
    highlights: getVal('ep-highlights'), drawbacks: getVal('ep-drawbacks'), structure: getVal('ep-structure'),
    internal_note: getVal('ep-note'),
    property_details: { bedrooms: getNum('ep-bedrooms'), bathrooms: getNum('ep-bathrooms'), land_sqw: getNum('ep-land_sqw'), usable_area: getNum('ep-usable_area'), floor: getNum('ep-floor'), parking: getNum('ep-parking') },
    marketing_data: { caption: getVal('ep-caption'), tiktok: getVal('ep-tiktok'), hashtag: getVal('ep-hashtag'), price_highlight: getVal('ep-pricesell') }
  };

  await api.put('/api/properties/'+id, data);
  _memDel('prop/full/'+id);
  _lsDel('prop/full/'+id);
  toast('บันทึกการแก้ไขสำเร็จ');
  navigate('property-detail', { id });
}

// ─── PROPERTY DETAIL ──────────────────────────────────────────────────────────
async function renderPropertyDetail(params) {
  const p = await api.get('/api/properties/'+(params.id||1));
  const d = p.property_details || {};

  let images = p.images || [];
  if (typeof images === 'string') { try { images = JSON.parse(images); } catch(e) { images = []; } }

  // Specs จาก property_details
  const bedrooms  = d.bedrooms  || d.ห้องนอน  || '';
  const bathrooms = d.bathrooms || d.ห้องน้ำ  || '';
  const parking   = d.parking   || d.จอดรถ    || '';
  const floorArea = d.floor_area|| d.พื้นที่ใช้สอย || '';
  const landArea  = d.land_area || d.ที่ดิน    || '';
  const floors    = d.floors    || d.ชั้น      || '';
  const age       = d.age       || d.อายุ     || '';
  const furniture = d.furniture || d.เฟอร์นิเจอร์ || '';
  const condition = d.condition || d.สภาพ     || '';

  const sqmPrice = (p.sale_price && floorArea) ? Math.round(Number(p.sale_price)/Number(floorArea)).toLocaleString('th-TH') : '';

  // สถานะ badge inline style
  const statusColor = {
    'พร้อมขาย': '#22C55E', 'ขาย': '#22C55E',
    'จองแล้ว':  '#F59E0B',
    'ขายแล้ว':  '#64748B',
    'ระงับขาย': '#EF4444',
    'ให้เช่า':  '#3B82F6',
  };
  const sColor = statusColor[p.status] || '#94A3B8';

  // spec chip helper
  const specChip = (icon, val, lbl) => val ? `
    <div style="flex:1;display:flex;flex-direction:column;align-items:center;padding:10px 6px;gap:3px;border-right:0.5px solid #F1F5F9">
      <div style="width:28px;height:28px;border-radius:7px;background:#F8FAFC;display:flex;align-items:center;justify-content:center">
        <svg width="13" height="13" fill="none" stroke="#64748B" stroke-width="1.8" viewBox="0 0 24 24">${icon}</svg>
      </div>
      <div style="font-size:14px;font-weight:700;color:#1E293B">${esc(String(val))}</div>
      <div style="font-size:9px;color:#94A3B8;text-align:center">${lbl}</div>
    </div>` : '';

  const specsHtml = [
    specChip('<path stroke-linecap="round" stroke-linejoin="round" d="M3 12l2-2m0 0l7-7 7 7M5 10v10a1 1 0 001 1h3m10-11l2 2m-2-2v10a1 1 0 01-1 1h-3m-6 0a1 1 0 001-1v-4a1 1 0 011-1h2a1 1 0 011 1v4a1 1 0 001 1m-6 0h6"/>', bedrooms, 'ห้องนอน'),
    specChip('<path stroke-linecap="round" stroke-linejoin="round" d="M8 7h12m0 0l-4-4m4 4l-4 4m0 6H4m0 0l4 4m-4-4l4-4"/>', bathrooms, 'ห้องน้ำ'),
    specChip('<path stroke-linecap="round" stroke-linejoin="round" d="M5 3v4M3 5h4M6 17v4m-2-2h4m5-16l2.286 6.857L21 12l-5.714 2.143L13 21l-2.286-6.857L5 12l5.714-2.143L13 3z"/>', parking, 'จอดรถ'),
    specChip('<rect x="3" y="3" width="18" height="18" rx="2" stroke-linecap="round"/><path stroke-linecap="round" d="M3 9h18M9 21V9"/>', floorArea ? floorArea+' ตร.ม.' : '', 'พื้นที่ใช้สอย'),
    specChip('<path stroke-linecap="round" stroke-linejoin="round" d="M9 20l-5.447-2.724A1 1 0 013 16.382V5.618a1 1 0 011.447-.894L9 7m0 13l6-3m-6 3V7m6 10l4.553 2.276A1 1 0 0021 18.382V7.618a1 1 0 00-.553-.894L15 4m0 13V4m0 0L9 7"/>', landArea ? landArea+' ตร.วา' : '', 'ที่ดิน'),
  ].filter(Boolean).join('');

  // kv row helper
  const kv = (l, v) => v ? `
    <div style="padding:9px 12px;border-bottom:0.5px solid #F1F5F9;border-right:0.5px solid #F1F5F9">
      <div style="font-size:9px;color:#94A3B8;text-transform:uppercase;letter-spacing:0.3px;margin-bottom:2px">${l}</div>
      <div style="font-size:12px;font-weight:500;color:#1E293B">${esc(String(v))}</div>
    </div>` : `<div style="padding:9px 12px;border-bottom:0.5px solid #F1F5F9;border-right:0.5px solid #F1F5F9"><div style="font-size:9px;color:#94A3B8;text-transform:uppercase;letter-spacing:0.3px;margin-bottom:2px">${l}</div><div style="font-size:12px;color:#CBD5E1">-</div></div>`;

  const kvGreen = (l, v) => v ? `
    <div style="padding:9px 12px;border-bottom:0.5px solid #F1F5F9;border-right:0.5px solid #F1F5F9">
      <div style="font-size:9px;color:#94A3B8;text-transform:uppercase;letter-spacing:0.3px;margin-bottom:2px">${l}</div>
      <div style="font-size:12px;font-weight:500;color:#16A34A">${esc(String(v))}</div>
    </div>` : '';

  // location chips
  const locChip = v => v ? `<span style="display:inline-flex;align-items:center;gap:4px;padding:5px 10px;border-radius:8px;background:#F8FAFC;border:0.5px solid #E2E8F0;font-size:11px;color:#475569">${esc(v)}</span>` : '';

  // action button helpers
  const btnP = (icon, label, onclick) => `<button onclick="${onclick}" style="display:flex;align-items:center;justify-content:center;gap:6px;width:100%;padding:9px 14px;border-radius:10px;background:#5DB85C;color:#fff;font-size:12px;font-weight:500;border:none;cursor:pointer;margin-bottom:7px">
    <svg width="13" height="13" fill="none" stroke="currentColor" stroke-width="2" viewBox="0 0 24 24">${icon}</svg>${label}</button>`;
  const btnO = (icon, label, onclick) => `<button onclick="${onclick}" style="display:flex;align-items:center;justify-content:center;gap:6px;width:100%;padding:9px 14px;border-radius:10px;background:#fff;color:#374151;font-size:12px;font-weight:500;border:0.5px solid #E2E8F0;cursor:pointer;margin-bottom:7px">
    <svg width="13" height="13" fill="none" stroke="currentColor" stroke-width="2" viewBox="0 0 24 24">${icon}</svg>${label}</button>`;
  const btnR = (icon, label, onclick) => `<button onclick="${onclick}" style="display:flex;align-items:center;justify-content:center;gap:6px;width:100%;padding:9px 14px;border-radius:10px;background:#FEF2F2;color:#DC2626;font-size:12px;font-weight:500;border:0.5px solid #FECACA;cursor:pointer">
    <svg width="13" height="13" fill="none" stroke="currentColor" stroke-width="2" viewBox="0 0 24 24">${icon}</svg>${label}</button>`;

  $('main-content').innerHTML = `
  <div style="max-width:900px">

    <!-- Header row -->
    <div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:14px">
      <div>
        <div style="font-size:11px;color:#94A3B8;margin-bottom:3px">
          <span style="cursor:pointer;color:#5DB85C" onclick="navigate('properties')">ทรัพย์สิน</span>
          / ${esc(p.property_type||'')}
          / <span style="color:#5DB85C">${esc(p.property_code||'')}</span>
        </div>
        <div style="font-size:16px;font-weight:700;color:#1E293B">รายละเอียดทรัพย์</div>
      </div>
      <div style="display:flex;gap:7px">
        <button onclick="navigate('properties')" style="display:flex;align-items:center;gap:5px;padding:7px 13px;border-radius:9px;background:#fff;border:0.5px solid #E2E8F0;color:#374151;font-size:11px;font-weight:500;cursor:pointer">
          <svg width="12" height="12" fill="none" stroke="currentColor" stroke-width="2" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" d="M10 19l-7-7m0 0l7-7m-7 7h18"/></svg>
          กลับ
        </button>
        <button onclick="navigate('edit-property',{id:${p.id}})" style="display:flex;align-items:center;gap:5px;padding:7px 13px;border-radius:9px;background:#fff;border:0.5px solid #E2E8F0;color:#374151;font-size:11px;font-weight:500;cursor:pointer">
          <svg width="12" height="12" fill="none" stroke="currentColor" stroke-width="2" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z"/></svg>
          แก้ไข
        </button>
        <button onclick="showCreateDealModal(${p.id})" style="display:flex;align-items:center;gap:5px;padding:7px 13px;border-radius:9px;background:#5DB85C;border:none;color:#fff;font-size:11px;font-weight:500;cursor:pointer">
          <svg width="12" height="12" fill="none" stroke="currentColor" stroke-width="2" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" d="M12 4v16m8-8H4"/></svg>
          สร้างดีล
        </button>
      </div>
    </div>

    <!-- 2-column layout -->
    <div style="display:grid;grid-template-columns:1fr 268px;gap:14px;align-items:start">

      <!-- LEFT -->
      <div style="display:flex;flex-direction:column;gap:12px">

        <!-- Hero + Title card -->
        <div style="background:#fff;border-radius:14px;border:0.5px solid #E2E8F0;overflow:hidden">

          <!-- Hero / gallery -->
          <div style="position:relative;height:${images.length?'220px':'160px'};background:#1E293B;display:flex;flex-direction:column;align-items:center;justify-content:center;gap:6px">
            ${images.length ? `
              <div id="hero-img-wrap" style="position:absolute;inset:0;overflow:hidden">
                <img id="hero-img" src="${esc(images[0].url||images[0].dataUrl||'')}" style="width:100%;height:100%;object-fit:cover;cursor:pointer" onclick="previewImg('${esc(images[0].url||images[0].dataUrl||'')}')">
              </div>
              <div style="position:absolute;bottom:10px;left:50%;transform:translateX(-50%);display:flex;gap:5px">
                ${images.map((_,i)=>`<div onclick="(function(){var im=document.getElementById('hero-img');im.src='${esc(_.url||_.dataUrl||'')}';im.onclick=function(){previewImg('${esc(_.url||_.dataUrl||'')}')}})()" style="width:${i===0?'16px':'6px'};height:6px;border-radius:3px;background:${i===0?'#fff':'rgba(255,255,255,0.4)'};cursor:pointer"></div>`).join('')}
              </div>` : `
              <div style="width:40px;height:40px;border-radius:10px;background:rgba(255,255,255,0.07);display:flex;align-items:center;justify-content:center">
                <svg width="22" height="22" fill="none" stroke="rgba(255,255,255,0.3)" stroke-width="1.5" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" d="M4 16l4.586-4.586a2 2 0 012.828 0L16 16m-2-2l1.586-1.586a2 2 0 012.828 0L20 14m-6-6h.01M6 20h12a2 2 0 002-2V6a2 2 0 00-2-2H6a2 2 0 00-2 2v12a2 2 0 002 2z"/></svg>
              </div>
              <div style="font-size:11px;color:rgba(255,255,255,0.25)">ยังไม่มีรูปภาพ</div>`}
            <span style="position:absolute;top:12px;left:12px;background:${sColor};color:#fff;font-size:10px;font-weight:600;padding:3px 10px;border-radius:20px">${esc(p.status||'')}</span>
            <span style="position:absolute;top:12px;right:12px;background:rgba(0,0,0,0.4);backdrop-filter:blur(4px);color:rgba(255,255,255,0.8);font-size:10px;padding:3px 10px;border-radius:20px">${images.length} รูป</span>
          </div>

          <!-- Upload row -->
          <div style="display:flex;gap:6px;padding:10px 14px 0;flex-wrap:wrap">
            <div class="img-gallery" id="img-gallery-${p.id}" style="display:flex;flex-wrap:wrap;gap:6px;width:100%">
              ${images.map((img,i)=>{ const src=img.url||img.dataUrl||''; return `
                <div class="img-thumb">
                  <img src="${src}" alt="${esc(img.caption||'')}" onclick="previewImg('${src}')">
                  <button class="img-del" onclick="deletePropImage(${p.id},${i})" title="ลบรูปนี้">&times;</button>
                </div>`; }).join('')}
              <label class="img-add-btn cursor-pointer" style="font-size:10px">
                <svg fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 4v16m8-8H4"/></svg>
                เพิ่มรูป
                <input type="file" accept="image/*" multiple style="display:none" onchange="uploadPropImages(${p.id},this)">
              </label>
            </div>
          </div>

          <!-- Title block -->
          <div style="padding:14px 16px 14px">
            <div style="font-size:16px;font-weight:600;color:#1E293B;margin-bottom:3px;line-height:1.35">${esc(p.title)}</div>
            <div style="font-size:10px;color:#94A3B8;margin-bottom:12px">${esc(p.property_code)} · บันทึก ${fmtDate(p.created_at||p.date_added||'')}</div>

            <div style="display:flex;align-items:flex-end;justify-content:space-between;margin-bottom:12px">
              <div>
                <div style="font-size:9px;color:#94A3B8;margin-bottom:2px">ราคาขาย</div>
                <div style="font-size:22px;font-weight:700;color:#1E293B;line-height:1">${Number(p.sale_price||0).toLocaleString('th-TH')} ฿</div>
                <div style="font-size:11px;color:#5DB85C;font-weight:600;margin-top:4px">ค่านายหน้า ${Number(p.commission_amount||0).toLocaleString('th-TH')} ฿ (${p.commission_rate||0}%)</div>
              </div>
              ${sqmPrice ? `<div style="text-align:right">
                <div style="font-size:9px;color:#94A3B8;margin-bottom:2px">ราคาต่อ ตร.ม.</div>
                <div style="font-size:15px;font-weight:600;color:#1E293B">${sqmPrice} ฿</div>
              </div>` : ''}
            </div>

            <div style="display:flex;flex-wrap:wrap;gap:5px">
              ${p.listing_type?`<span style="font-size:10px;padding:3px 9px;border-radius:20px;background:#ECFDF5;color:#166534;border:0.5px solid #BBF7D0;font-weight:500">${esc(p.listing_type)}</span>`:''}
              ${p.property_type?`<span style="font-size:10px;padding:3px 9px;border-radius:20px;background:#EFF6FF;color:#1D4ED8;font-weight:500">${esc(p.property_type)}</span>`:''}
              ${p.property_subtype?`<span style="font-size:10px;padding:3px 9px;border-radius:20px;background:#F1F5F9;color:#475569;font-weight:500">${esc(p.property_subtype)}</span>`:''}
              ${p.province||p.district?`<span style="font-size:10px;padding:3px 9px;border-radius:20px;background:#F1F5F9;color:#475569;font-weight:500">${[p.province,p.district].filter(Boolean).map(esc).join(' · ')}</span>`:''}
              ${p.title_deed&&p.title_deed!=='-- ยังไม่ระบุ --'?`<span style="font-size:10px;padding:3px 9px;border-radius:20px;background:#F5F3FF;color:#5B21B6;font-weight:500">${esc(p.title_deed)}</span>`:''}
            </div>
          </div>

          <!-- Specs strip -->
          ${specsHtml ? `<div style="display:flex;border-top:0.5px solid #F1F5F9">${specsHtml}<div style="flex:0 0 0"></div></div>` : ''}
        </div>

        <!-- Info card -->
        <div style="background:#fff;border-radius:14px;border:0.5px solid #E2E8F0;overflow:hidden">

          <!-- ข้อมูลทั่วไป -->
          <div style="padding:14px 16px">
            <div style="font-size:10px;font-weight:700;color:#94A3B8;text-transform:uppercase;letter-spacing:0.6px;margin-bottom:10px">ข้อมูลทั่วไป</div>
            <div style="display:grid;grid-template-columns:1fr 1fr;border:0.5px solid #F1F5F9;border-radius:10px;overflow:hidden">
              ${kv('ประเภทย่อย', p.property_subtype)}
              ${kv('จำนวนชั้น', floors ? floors+' ชั้น' : '')}
              ${kv('สภาพทรัพย์', condition)}
              ${kv('อายุ', age ? age+' ปี' : '')}
              ${kv('เฟอร์นิเจอร์', furniture)}
              ${kvGreen('เอกสารสิทธิ์', p.title_deed&&p.title_deed!=='-- ยังไม่ระบุ --'?p.title_deed:'')||kv('เอกสารสิทธิ์','')}
              ${kv('ราคาประเมิน', p.appraisal_price ? Number(p.appraisal_price).toLocaleString('th-TH')+' ฿' : '')}
              ${kv('เงื่อนไขโอน', p.transfer_fee_condition)}
            </div>
          </div>

          <!-- ที่ตั้ง -->
          <div style="padding:14px 16px;border-top:0.5px solid #F8FAFC">
            <div style="font-size:10px;font-weight:700;color:#94A3B8;text-transform:uppercase;letter-spacing:0.6px;margin-bottom:10px">ที่ตั้ง</div>
            <div style="display:flex;flex-wrap:wrap;gap:6px">
              ${locChip(p.province ? 'จ.'+p.province : '')}
              ${locChip(p.district ? 'อ.'+p.district : '')}
              ${locChip(p.subdistrict ? 'ต.'+p.subdistrict : '')}
              ${locChip(p.village_project)}
              ${locChip(p.zone ? 'โซน: '+p.zone : '')}
            </div>
            ${p.nearby_places?`<div style="font-size:11px;color:#64748B;margin-top:8px">ใกล้เคียง: ${esc(p.nearby_places)}</div>`:''}
          </div>

          <!-- จุดเด่น/ด้อย -->
          ${p.highlights||p.drawbacks ? `
          <div style="padding:14px 16px;border-top:0.5px solid #F8FAFC">
            <div style="font-size:10px;font-weight:700;color:#94A3B8;text-transform:uppercase;letter-spacing:0.6px;margin-bottom:10px">จุดเด่นและจุดด้อย</div>
            <div style="display:grid;grid-template-columns:1fr 1fr;gap:8px">
              ${p.highlights?`<div style="border-radius:10px;padding:11px 13px;background:#F0FDF4;border:0.5px solid #BBF7D0">
                <div style="font-size:9px;font-weight:700;color:#166534;text-transform:uppercase;letter-spacing:0.5px;margin-bottom:6px;display:flex;align-items:center;gap:5px"><div style="width:6px;height:6px;border-radius:50%;background:#22C55E"></div>จุดเด่น</div>
                <div style="font-size:11px;color:#374151;line-height:1.65">${esc(p.highlights)}</div>
              </div>`:''}
              ${p.drawbacks?`<div style="border-radius:10px;padding:11px 13px;background:#FFFBEB;border:0.5px solid #FDE68A">
                <div style="font-size:9px;font-weight:700;color:#92400E;text-transform:uppercase;letter-spacing:0.5px;margin-bottom:6px;display:flex;align-items:center;gap:5px"><div style="width:6px;height:6px;border-radius:50%;background:#F59E0B"></div>จุดด้อย</div>
                <div style="font-size:11px;color:#374151;line-height:1.65">${esc(p.drawbacks)}</div>
              </div>`:''}
            </div>
          </div>` : ''}

          <!-- รายละเอียดเพิ่มเติม -->
          ${p.structure||p.description ? `
          <div style="padding:14px 16px;border-top:0.5px solid #F8FAFC">
            <div style="font-size:10px;font-weight:700;color:#94A3B8;text-transform:uppercase;letter-spacing:0.6px;margin-bottom:8px">รายละเอียดเพิ่มเติม</div>
            <div style="font-size:12px;color:#475569;line-height:1.75">${esc(p.structure||p.description||'')}</div>
          </div>` : ''}
        </div>

        <!-- Deals card -->
        <div style="background:#fff;border-radius:14px;border:0.5px solid #E2E8F0;overflow:hidden">
          <div style="padding:14px 16px;display:flex;align-items:center;justify-content:space-between">
            <div style="font-size:10px;font-weight:700;color:#94A3B8;text-transform:uppercase;letter-spacing:0.6px">ดีลที่เกี่ยวข้อง (${p.deals.length})</div>
            <button onclick="showCreateDealModal(${p.id})" style="display:flex;align-items:center;gap:5px;padding:6px 12px;border-radius:8px;background:#5DB85C;color:#fff;font-size:11px;font-weight:500;border:none;cursor:pointer">
              <svg width="11" height="11" fill="none" stroke="currentColor" stroke-width="2" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" d="M12 4v16m8-8H4"/></svg>
              สร้างดีล
            </button>
          </div>
          <div style="padding:0 4px 12px">
            ${p.deals.length ? `<table style="width:100%"><thead><tr><th>รหัส</th><th>ลูกค้า</th><th>สถานะ</th><th>ราคา</th></tr></thead><tbody>${p.deals.map(dl=>`<tr><td style="font-size:11px;font-weight:600">${esc(dl.deal_code)}</td><td>${esc(dl.customer_name)}</td><td>${custBadge(dl.status)}</td><td style="font-weight:700;font-size:12px">${fmtNum(dl.sale_price)} ฿</td></tr>`).join('')}</tbody></table>` : '<p style="font-size:12px;color:#94A3B8;padding:8px 14px">ยังไม่มีดีล</p>'}
          </div>
        </div>

      </div>

      <!-- RIGHT -->
      <div style="display:flex;flex-direction:column;gap:12px">

        <!-- เจ้าของ -->
        <div style="background:#fff;border-radius:14px;border:0.5px solid #E2E8F0;padding:16px">
          <div style="font-size:10px;font-weight:700;color:#94A3B8;text-transform:uppercase;letter-spacing:0.6px;margin-bottom:12px">เจ้าของทรัพย์</div>
          <div style="display:flex;align-items:center;gap:11px;margin-bottom:12px">
            <div style="width:42px;height:42px;border-radius:50%;background:linear-gradient(135deg,#5DB85C,#4A9E49);display:flex;align-items:center;justify-content:center;color:#fff;font-weight:700;font-size:16px;flex-shrink:0">
              ${(p.owner_name||'?').charAt(0).replace(/[ก-ฮ]/u, s => s)}
            </div>
            <div>
              <div style="font-size:13px;font-weight:600;color:#1E293B">${esc(p.owner_name||'-')}</div>
              <div style="font-size:10px;color:#94A3B8;margin-top:1px">เจ้าของ · ฝากขาย</div>
            </div>
          </div>
          ${p.owner_phone ? `<div style="display:flex;align-items:center;gap:8px;padding:8px 12px;border-radius:9px;border:0.5px solid #E2E8F0;background:#F8FAFC;margin-bottom:6px">
            <div style="width:28px;height:28px;border-radius:7px;background:#ECFDF5;display:flex;align-items:center;justify-content:center;flex-shrink:0">
              <svg width="12" height="12" fill="none" stroke="#16A34A" stroke-width="2" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" d="M3 5a2 2 0 012-2h3.28a1 1 0 01.948.684l1.498 4.493a1 1 0 01-.502 1.21l-2.257 1.13a11.042 11.042 0 005.516 5.516l1.13-2.257a1 1 0 011.21-.502l4.493 1.498a1 1 0 01.684.949V19a2 2 0 01-2 2h-1C9.716 21 3 14.284 3 6V5z"/></svg>
            </div>
            <div>
              <div style="font-size:9px;color:#94A3B8">โทรศัพท์</div>
              <div style="font-size:11px;font-weight:600;color:#1E293B">${esc(p.owner_phone)}</div>
            </div>
          </div>` : ''}
          ${p.agent_name ? `<div style="display:flex;align-items:center;gap:8px;padding:8px 12px;border-radius:9px;border:0.5px solid #E2E8F0;background:#F8FAFC">
            <div style="width:28px;height:28px;border-radius:7px;background:#EFF6FF;display:flex;align-items:center;justify-content:center;flex-shrink:0">
              <svg width="12" height="12" fill="none" stroke="#1D4ED8" stroke-width="2" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" d="M16 7a4 4 0 11-8 0 4 4 0 018 0zM12 14a7 7 0 00-7 7h14a7 7 0 00-7-7z"/></svg>
            </div>
            <div>
              <div style="font-size:9px;color:#94A3B8">ผู้ดูแล</div>
              <div style="font-size:11px;font-weight:600;color:#1E293B">${esc(p.agent_name)}</div>
            </div>
          </div>` : ''}
        </div>

        <!-- เปลี่ยนสถานะ + actions -->
        <div style="background:#fff;border-radius:14px;border:0.5px solid #E2E8F0;padding:14px 16px">
          <div style="font-size:10px;font-weight:700;color:#94A3B8;text-transform:uppercase;letter-spacing:0.6px;margin-bottom:10px">การดำเนินการ</div>
          ${btnP('<path stroke-linecap="round" stroke-linejoin="round" d="M12 4v16m8-8H4"/>', 'สร้างดีล / นัดหมาย', `showCreateDealModal(${p.id})`)}
          ${btnO('<path stroke-linecap="round" stroke-linejoin="round" d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z"/>', 'แก้ไขข้อมูล', `navigate('edit-property',{id:${p.id}})`)}
          <div style="margin-bottom:7px">
            <select onchange="if(this.value){api.patch('/api/properties/${p.id}/status',{status:this.value}).then(()=>{toast('อัปเดตสถานะ: '+this.value);navigate('property-detail',{id:${p.id}})})}" style="width:100%;padding:9px 12px;border-radius:10px;border:0.5px solid #E2E8F0;font-size:12px;color:#374151;background:#fff;cursor:pointer">
              <option value="">เปลี่ยนสถานะ...</option>
              ${['พร้อมขาย','จองแล้ว','ขายแล้ว','ระงับขาย'].map(s=>`<option value="${s}" ${p.status===s?'selected':''}>${s}</option>`).join('')}
            </select>
          </div>
          ${btnR('<path stroke-linecap="round" stroke-linejoin="round" d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16"/>', 'ลบทรัพย์', `if(confirm('ยืนยันลบทรัพย์นี้?')){api.delete('/api/properties/${p.id}').then(()=>{toast('ลบแล้ว');navigate('properties')}).catch(e=>toast(e.message,'error'))}`)}
        </div>

        <!-- หมายเหตุ -->
        ${p.internal_note?`
        <div style="background:#FFFBEB;border-radius:14px;border:0.5px solid #FDE68A;padding:14px 16px">
          <div style="font-size:10px;font-weight:700;color:#92400E;text-transform:uppercase;letter-spacing:0.5px;margin-bottom:6px">หมายเหตุภายใน</div>
          <div style="font-size:12px;color:#374151;line-height:1.65">${esc(p.internal_note)}</div>
        </div>` : ''}

        <!-- Marketing -->
        ${p.marketing_data?.caption||p.marketing_data?.hashtag||p.marketing_data?.tiktok ? `
        <div style="background:#fff;border-radius:14px;border:0.5px solid #E2E8F0;padding:14px 16px">
          <div style="font-size:10px;font-weight:700;color:#94A3B8;text-transform:uppercase;letter-spacing:0.6px;margin-bottom:10px">ข้อมูลการตลาด</div>
          ${p.marketing_data?.caption?`<div style="margin-bottom:10px"><div style="font-size:10px;color:#94A3B8;margin-bottom:4px">Caption</div><div style="font-size:11px;color:#374151;line-height:1.65;background:#F8FAFC;border-radius:8px;padding:8px 10px">${esc(p.marketing_data.caption)}</div></div>`:''}
          ${p.marketing_data?.hashtag?`<div style="margin-bottom:10px"><div style="font-size:10px;color:#94A3B8;margin-bottom:4px">Hashtag</div><div style="font-size:11px;color:#5B21B6">${esc(p.marketing_data.hashtag)}</div></div>`:''}
          ${p.marketing_data?.tiktok?`<div><div style="font-size:10px;color:#94A3B8;margin-bottom:4px">Script TikTok</div><div style="font-size:11px;color:#374151;line-height:1.65">${esc(p.marketing_data.tiktok)}</div></div>`:''}
        </div>` : ''}

      </div>
    </div>
  </div>`;
}

// ── Image upload via ImgBB (client-side, ไม่ผ่าน GAS) ─────────
async function _compressImage(file, maxPx = 1080, quality = 0.82) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = e => {
      const img = new Image();
      img.onload = () => {
        const canvas = document.createElement('canvas');
        let w = img.width, h = img.height;
        if (w > maxPx || h > maxPx) { const r = Math.min(maxPx/w, maxPx/h); w = Math.round(w*r); h = Math.round(h*r); }
        canvas.width = w; canvas.height = h;
        canvas.getContext('2d').drawImage(img, 0, 0, w, h);
        // strip data:image/jpeg;base64,
        resolve(canvas.toDataURL('image/jpeg', quality).split(',')[1]);
      };
      img.onerror = reject;
      img.src = e.target.result;
    };
    reader.onerror = reject;
    reader.readAsDataURL(file);
  });
}

async function _uploadToCloudinary(base64, filename) {
  const cloud  = window.CLOUDINARY_CLOUD;
  const preset = window.CLOUDINARY_PRESET;
  if (!cloud || cloud === 'YOUR_CLOUD_NAME') throw new Error('ยังไม่ได้ตั้งค่า CLOUDINARY_CLOUD ใน index.html');
  const form = new FormData();
  form.append('file', 'data:image/jpeg;base64,' + base64);
  form.append('upload_preset', preset);
  form.append('folder', 'reboms/properties');
  const r = await fetch(`https://api.cloudinary.com/v1_1/${cloud}/image/upload`, { method: 'POST', body: form });
  const j = await r.json();
  if (j.error) throw new Error(j.error.message);
  return j.secure_url;
}

// Image upload handler
window.uploadPropImages = async function(propId, input) {
  const files = Array.from(input.files);
  if (!files.length) return;
  let uploaded = 0, failed = 0;
  for (const file of files) {
    try {
      toast('กำลังอัปโหลด ' + file.name + '...', 'info');
      const base64 = await _compressImage(file);
      const imageUrl = await _uploadToCloudinary(base64, file.name);
      await api.post(`/api/properties/${propId}/images`, { dataUrl: imageUrl, caption: file.name });
      uploaded++;
    } catch(e) {
      toast('อัปโหลดล้มเหลว: ' + e.message, 'error');
      failed++;
    }
  }
  if (uploaded > 0) toast(`อัปโหลด ${uploaded} รูปสำเร็จ`);
  // เคลียร์ cache ของ property detail ก่อน navigate เพื่อให้ได้ข้อมูลใหม่
  _memDel('prop/full/' + propId);
  _lsDel('prop/full/' + propId);
  navigate('property-detail', { id: propId });
};
window.uploadPropImages = window.uploadPropImages;

window.deletePropImage = async function(propId, idx) {
  if (!confirm('ยืนยันลบรูปนี้?')) return;
  await api.delete(`/api/properties/${propId}/images/${idx}`);
  toast('ลบรูปแล้ว');
  _memDel('prop/full/' + propId);
  _lsDel('prop/full/' + propId);
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
        <div class="flex items-center justify-between mb-4"><h3 class="text-lg font-bold font-semibold">สร้างดีลใหม่</h3><button onclick="hideModal()" class="text-gray-400 text-xl">&times;</button></div>
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
    'เสนอทรัพย์':'#5DB85C','นัดชมทรัพย์':'#7C3AED','ต่อรองราคา':'#D97706','วางมัดจำ':'#EA580C','ยื่นสินเชื่อ':'#0891B2','นัดวันโอน':'#059669','ปิดการขายสำเร็จ':'#16A34A','ปิดการขายไม่สำเร็จ':'#DC2626',
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
                    <div class="deal-card-title" style="color:#5DB85C;text-decoration:underline;text-underline-offset:2px">${esc(d.customer_name||'-')}</div>
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
        <h2 class="text-lg font-bold font-semibold">${esc(d.deal_code)}</h2>
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
      <div class="flex items-center justify-between mb-4"><h3 class="font-bold font-semibold">บันทึกรับค่านายหน้า</h3><button onclick="hideModal()" class="text-gray-400 text-xl">&times;</button></div>
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
      <div class="flex items-center justify-between mb-4"><h3 class="text-lg font-bold font-semibold">สร้างดีลใหม่</h3><button onclick="hideModal()" class="text-gray-400 text-xl">&times;</button></div>
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
        <div class="px-5 py-3 style="background:linear-gradient(135deg,#5DB85C,#4A9E49)" text-white text-sm font-semibold">นัดหมายวันนี้ (${today})</div>
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
      <div class="flex items-center justify-between mb-4"><h2 class="text-lg font-bold font-semibold">เพิ่มนัดหมาย</h2><button onclick="hideModal()" class="text-gray-400 text-xl">&times;</button></div>
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
        ${kpiCard('ดีลปิดสำเร็จ', data.summary.count+' ดีล', 'ทั้งหมดที่บันทึก', '#5DB85C', `<path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z"/>`)}
        ${kpiCard('รายได้ค่านายหน้ารวม', fmtNum(data.summary.total)+' ฿', 'จากดีลที่ปิดแล้ว', '#5DB85C', `<path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 8c-1.657 0-3 .895-3 2s1.343 2 3 2 3 .895 3 2-1.343 2-3 2m0-8c1.11 0 2.08.402 2.599 1M12 8V7m0 1v8m0 0v1m0-1c-1.11 0-2.08-.402-2.599-1M21 12a9 9 0 11-18 0 9 9 0 0118 0z"/>`)}
        ${kpiCard('รายได้เฉลี่ยต่อดีล', fmtNum(data.summary.count?Math.round(data.summary.total/data.summary.count):0)+' ฿', 'ค่าเฉลี่ย', '#5DB85C', `<path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M9 19v-6a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2a2 2 0 002-2zm0 0V9a2 2 0 012-2h2a2 2 0 012 2v10m-6 0a2 2 0 002 2h2a2 2 0 002-2m0 0V5a2 2 0 012-2h2a2 2 0 012 2v14a2 2 0 01-2 2h-2a2 2 0 01-2-2z"/>`)}
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
            <td class="font-semibold text-xs font-semibold">${esc(d.deal_code)}</td>
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
            <h3 class="font-bold font-semibold">จัดการโซนพื้นที่</h3>
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
async function init() {
  // Set current date
  $('current-date').textContent = new Date().toLocaleDateString('th-TH', { weekday:'long', year:'numeric', month:'long', day:'numeric' });

  // แสดง loading screen ขณะ prefetch
  $('main-content').innerHTML = `
    <div style="display:flex;flex-direction:column;align-items:center;justify-content:center;height:60vh;gap:16px">
      <div class="animate-spin w-10 h-10 border-2 border-t-transparent rounded-full" style="border-color:#5DB85C;border-top-color:transparent"></div>
      <div style="font-size:13px;color:#94A3B8">กำลังโหลดข้อมูล...</div>
    </div>`;

  // Prefetch ทุก list พร้อมกัน — หน้าไหนกดก็ได้เลย ไม่ต้องรอ
  await Promise.allSettled([
    api.get('/api/dashboard'),
    api.get('/api/customers'),
    api.get('/api/properties'),
    api.get('/api/deals'),
    api.get('/api/appointments'),
    api.get('/api/commissions'),
    api.get('/api/users'),
    api.get('/api/zones'),
    api.get('/api/owners'),
  ]).then(results => {
    // เก็บ users ใน state
    const agentsResult = results[6];
    if (agentsResult.status === 'fulfilled') state.users = agentsResult.value;

    // badge นัดวันนี้
    const apptResult = results[4];
    if (apptResult.status === 'fulfilled') {
      const today = new Date().toISOString().split('T')[0];
      const count = apptResult.value.filter(a => a.appointment_date === today && a.status === 'รอดำเนินการ').length;
      if (count > 0) $('notif-badge').classList.remove('hidden');
    }
  });

  // Route — ตอนนี้ข้อมูลอยู่ใน cache แล้ว render ทันที
  const hash = location.hash.replace('#', '') || 'dashboard';
  const [page, ...rest] = hash.split('/');
  navigate(page, { id: rest[0] });
}

document.addEventListener('DOMContentLoaded', init);
