/* Sales & Maintenance PWA — vanilla JS, localStorage-backed. */

const STORAGE_KEY = 'sm_app_v1';
const PRODUCT_OPTIONS = [
  'MS OLD ROUND PIPE',
  'MS OLD SQUARE PIPE',
  'MS NEW ROUND PIPE',
  'MS NEW SQUARE PIPE',
  'G.I. OLD ROUND PIPE',
  'G.I. OLD SQUARE PIPE',
  'NEW GP PIPE',
  'OLD CHANNEL',
  'OLD IBEAM',
  'OLD ANGLE',
  'NEW CHANNEL',
  'NEW IBEAM',
  'NEW ANGLE',
  'OLD T ANGLE',
  'NEW T ANGLE',
  'OLD PROFILE SHEET ( PATRA )',
  'OLD NAALI PATRA',
  'G.I. SHEET',
  'MS SHEET'
];

// ---------- Data layer ----------
const APP_THEME_COLOR = '#2563EB';
const DEFAULT_BUSINESS = { name: 'Indian Steel', phone: '9876543210' };
const state = {
  transactions: [],
  customers: [],
  business: Object.assign({}, DEFAULT_BUSINESS)
};

function load() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (raw) {
      const parsed = JSON.parse(raw);
      state.transactions = parsed.transactions || [];
      state.customers = parsed.customers || [];
      state.business = Object.assign({}, DEFAULT_BUSINESS, parsed.business || {});
    }
    if (!state.business.name || state.business.name === 'Shivam Traders') {
      state.business.name = DEFAULT_BUSINESS.name;
    }
    hydrateTransactionPhones();
  } catch (e) {
    console.warn('load failed', e);
  }
}
function save() {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
}

function uid() { return Date.now().toString(36) + Math.random().toString(36).slice(2, 8); }

function addTransaction(tx) {
  state.transactions.unshift(tx);
  save();
}
function deleteTransaction(id) {
  state.transactions = state.transactions.filter(t => t.id !== id);
  save();
}
function addCustomer(c) {
  if (!state.customers.find(x => x.name.toLowerCase() === c.name.toLowerCase())) {
    state.customers.unshift(c);
    save();
  } else if (c.phone) {
    state.customers = state.customers.map(x =>
      x.name.toLowerCase() === c.name.toLowerCase() && !x.phone
        ? Object.assign({}, x, { phone: c.phone })
        : x
    );
    save();
  }
}

function hydrateTransactionPhones() {
  const phoneByName = new Map(state.customers.map(c => [String(c.name || '').toLowerCase(), c.phone || '']));
  state.transactions = state.transactions.map(tx => {
    if (tx.mobileNumber) return tx;
    const phone = phoneByName.get(String(tx.customerName || '').toLowerCase()) || tx.phone || '';
    return phone ? Object.assign({}, tx, { mobileNumber: phone }) : tx;
  });
}

function seedDemoSalesIfMissing() {
  if (state.transactions.some(tx => String(tx.billNo || '').startsWith('INV-DEMO-'))) return;

  const demoSales = [
    demoSale(6, 10, 15, 'Aarav Electricals', '9876501001', 'Copper Wire Bundle', 1, 10000, 'UPI'),
    demoSale(5, 9, 40, 'Patel Stores', '9876501002', 'Pump Service Kit', 1, 8000, 'CASH'),
    demoSale(5, 16, 5, 'Metro Hardware', '9876501003', 'LED Panel Set', 1, 7000, 'UPI'),
    demoSale(4, 10, 20, 'Sai Traders', '9876501004', 'Motor Rewinding', 1, 12000, 'UPI'),
    demoSale(4, 13, 35, 'Green Valley Homes', '9876501005', 'Switch Board Install', 1, 6000, 'CASH'),
    demoSale(4, 18, 10, 'Nexus Office', '9876501006', 'Maintenance Visit', 1, 5000, 'UPI'),
    demoSale(3, 11, 0, 'Kumar Agencies', '9876501007', 'CCTV Service', 1, 9000, 'UPI'),
    demoSale(3, 15, 25, 'Sharma Residency', '9876501008', 'Fan Repair Batch', 1, 6000, 'CASH'),
    demoSale(2, 9, 15, 'City Mart', '9876501009', 'Cable Tray Fitting', 1, 11000, 'UPI'),
    demoSale(2, 17, 45, 'Royal Furnishings', '9876501010', 'Lighting Upgrade', 1, 10000, 'UPI'),
    demoSale(1, 10, 30, 'Blue Star Clinic', '9876501011', 'AC Service Pack', 1, 9000, 'UPI'),
    demoSale(1, 14, 50, 'Om Stationery', '9876501012', 'UPS Battery', 1, 8000, 'CASH'),
    demoSale(0, 9, 25, 'Sunrise Apartments', '9876501013', 'Panel Maintenance', 1, 12000, 'UPI'),
    demoSale(0, 13, 10, 'Global Pharma', '9876501014', 'Emergency Repair', 1, 9000, 'UPI'),
    demoSale(0, 18, 20, 'Mehta Textiles', '9876501015', 'Annual Service', 1, 8000, 'CASH')
  ];

  state.transactions = demoSales.map((sale, index) => ({
    id: uid(),
    customerName: sale.customerName,
    mobileNumber: sale.phone,
    type: 'SALE',
    billNo: `INV-DEMO-${String(index + 1).padStart(3, '0')}`,
    date: demoDate(sale.daysAgo, sale.hour, sale.minute),
    productName: sale.productName,
    quantity: sale.quantity,
    rate: sale.rate,
    totalAmount: sale.quantity * sale.rate,
    paymentMethod: sale.paymentMethod === 'UPI' ? 'ONLINE' : sale.paymentMethod,
    cashAmount: sale.paymentMethod === 'CASH' ? sale.quantity * sale.rate : 0,
    onlineAmount: sale.paymentMethod === 'UPI' ? sale.quantity * sale.rate : 0,
    paymentStatus: 'PAID',
    notes: 'Demo sale entry',
    createdAt: Date.now()
  })).sort((a, b) => b.date - a.date);

  const knownCustomers = new Set(state.customers.map(c => c.name.toLowerCase()));
  demoSales.forEach(sale => {
    if (!knownCustomers.has(sale.customerName.toLowerCase())) {
      state.customers.unshift({
        id: uid(),
        name: sale.customerName,
        phone: sale.phone,
        createdAt: Date.now()
      });
      knownCustomers.add(sale.customerName.toLowerCase());
    }
  });
  save();
}

function demoSale(daysAgo, hour, minute, customerName, phone, productName, quantity, rate, paymentMethod) {
  return { daysAgo, hour, minute, customerName, phone, productName, quantity, rate, paymentMethod };
}

function demoDate(daysAgo, hour, minute) {
  const d = new Date();
  d.setDate(d.getDate() - daysAgo);
  d.setHours(hour, minute, 0, 0);
  return d.getTime();
}

// ---------- Utilities ----------
const fmtMoney = (n) => {
  const v = Number(n) || 0;
  return v.toLocaleString('en-IN', { maximumFractionDigits: v % 1 === 0 ? 0 : 2 });
};
const fmtDate = (ms, opts = {}) => {
  const d = new Date(ms);
  return d.toLocaleDateString('en-IN', Object.assign({ day: '2-digit', month: 'short', year: 'numeric' }, opts));
};
const fmtTime = (ms) => new Date(ms).toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit', hour12: true });
const todayIso = () => {
  const d = new Date();
  d.setMinutes(d.getMinutes() - d.getTimezoneOffset());
  return d.toISOString().slice(0, 10);
};
const todayStart = () => { const d = new Date(); d.setHours(0,0,0,0); return d.getTime(); };
const todayEnd   = () => todayStart() + 86400000 - 1;
function lastSevenDaysRange() {
  const d = new Date(); d.setHours(0,0,0,0); d.setDate(d.getDate() - 6);
  return { start: d.getTime(), end: d.getTime() + 7 * 86400000 - 1 };
}
function monthRange(offset = 0) {
  const d = new Date(); d.setMonth(d.getMonth() + offset, 1); d.setHours(0,0,0,0);
  const s = d.getTime();
  d.setMonth(d.getMonth() + 1);
  return { start: s, end: d.getTime() - 1, title: new Date(s).toLocaleDateString('en-IN', { month: 'long', year: 'numeric' }) };
}
function sumOf(type, start, end) {
  return state.transactions
    .filter(t => t.type === type && t.date >= start && t.date <= end)
    .reduce((a, b) => a + (b.totalAmount || 0), 0);
}
function sumByRange(start, end, amountForTx) {
  return state.transactions
    .filter(t => t.date >= start && t.date <= end)
    .reduce((total, tx) => total + amountForTx(tx), 0);
}
function isDueSale(tx) {
  return tx.type === 'SALE' && tx.paymentStatus === 'DUE';
}
function paymentMatchesDueSale(payment, sale) {
  if (payment.type !== 'PAYMENT') return false;
  if (payment.dueSourceId && payment.dueSourceId === sale.id) return true;
  if (payment.dueSourceBillNo && sale.billNo && payment.dueSourceBillNo === sale.billNo) return true;
  return !payment.dueSourceId && !payment.dueSourceBillNo && payment.billNo && sale.billNo && payment.billNo === sale.billNo;
}
function dueOutstandingAmount(sale) {
  if (!isDueSale(sale)) return 0;
  const paid = state.transactions
    .filter(tx => paymentMatchesDueSale(tx, sale))
    .reduce((sum, tx) => sum + (Number(tx.totalAmount) || 0), 0);
  return Math.max(0, (Number(sale.totalAmount) || 0) - paid);
}
function duePickerEntries() {
  return state.transactions
    .filter(isDueSale)
    .map(sale => ({ sale, outstanding: dueOutstandingAmount(sale) }))
    .filter(entry => entry.outstanding > 0)
    .sort((a, b) => b.sale.date - a.sale.date);
}
function paidSaleAmount(tx) {
  return tx.type === 'SALE' && !isDueSale(tx) ? Number(tx.totalAmount) || 0 : 0;
}
function collectionAmount(tx) {
  if (tx.type === 'SALE' && !isDueSale(tx)) {
    const split = (Number(tx.cashAmount) || 0) + (Number(tx.onlineAmount) || 0);
    return split > 0 ? split : Number(tx.totalAmount) || 0;
  }
  if (tx.type === 'EXPENSE') return Number(tx.totalAmount) || 0;
  if (tx.type === 'PAYMENT') return Number(tx.totalAmount) || 0;
  return 0;
}
function dueChargeAmount(tx) {
  return isDueSale(tx) ? dueOutstandingAmount(tx) : 0;
}
function duePaymentAmount(tx) {
  return tx.type === 'PAYMENT' ? Number(tx.totalAmount) || 0 : 0;
}
function totalDueInRange(start, end) {
  return sumByRange(start, end, dueChargeAmount);
}
function totalDuePayment() {
  return state.transactions.reduce((a, b) => a + dueChargeAmount(b), 0);
}

function toast(msg) {
  const el = document.getElementById('toast');
  el.textContent = msg;
  el.classList.remove('hidden');
  clearTimeout(toast._t);
  toast._t = setTimeout(() => el.classList.add('hidden'), 2000);
}

// ---------- Routing ----------
const TITLES = {
  dashboard: 'Dashboard',
  add: 'Add New Entry',
  customers: 'Customers',
  reports: 'Reports',
  more: 'More'
};
const VIEW_KEY = 'sm_current_view';
const MAIN_VIEWS = ['dashboard', 'customers', 'reports', 'more'];
let currentView = 'dashboard';
const navStack = ['dashboard'];
let reportMode = 'summary';

function showView(name, push = true) {
  setAppThemeColor();
  if (name === 'entries') {
    reportMode = 'entries';
    name = 'reports';
  }
  document.querySelectorAll('.view').forEach(v => v.classList.add('hidden'));
  const el = document.getElementById('view-' + name);
  if (!el) return;
  el.classList.remove('hidden');
  document.getElementById('page-title').textContent = TITLES[name] || '';
  currentView = name;

  // Show/hide bottom nav highlight
  document.querySelectorAll('.nav-btn').forEach(b => {
    b.classList.toggle('active', b.dataset.nav === name);
  });

  // FAB visible on dashboard + entries
  const fab = document.getElementById('fab');
  fab.classList.toggle('hidden', !(name === 'dashboard' || (name === 'reports' && reportMode === 'entries')));

  // Back vs menu
  const isMain = ['dashboard','customers','reports','more','invoices','eway','catalog','add'].includes(name);
  const menuBtn = document.getElementById('menu-btn');
  if (menuBtn) menuBtn.hidden = !isMain;
  const backBtn = document.getElementById('back-btn');
  if (backBtn) backBtn.hidden = isMain;
  const bellBtn = document.getElementById('bell-btn');
  if (bellBtn) bellBtn.hidden = !isMain;

  if (push && navStack[navStack.length - 1] !== name) navStack.push(name);

  // Persist current main view across refreshes (skip transient views like 'add')
  if (MAIN_VIEWS.includes(name)) {
    try { localStorage.setItem(VIEW_KEY, name); } catch (e) {}
  }

  renderView(name);
  const main = document.getElementById('main');
  if (main) main.scrollTo({ top: 0, behavior: 'instant' });
  window.scrollTo({ top: 0, behavior: 'instant' });
}
function goBack() {
  if (navStack.length > 1) {
    navStack.pop();
    showView(navStack[navStack.length - 1], false);
  } else {
    showView('dashboard', false);
  }
}

// ---------- Renderers ----------
function renderView(name) {
  if (name === 'dashboard') renderDashboard();
  else if (name === 'customers') renderCustomers();
  else if (name === 'reports') renderReports();
  else if (name === 'add') renderAddEntry();
  else if (name === 'more') renderMore();
}

// Dashboard
function renderDashboard() {
  const hr = new Date().getHours();
  const greet = hr < 12 ? 'Good Morning' : hr < 17 ? 'Good Afternoon' : 'Good Evening';
  document.getElementById('greeting-text').textContent = `${greet}, ${state.business.name} 👋`;
  document.getElementById('today-date').textContent = fmtDate(Date.now());

  const s = todayStart(), e = todayEnd();
  const week = lastSevenDaysRange();
  const month = monthRange(0);
  const sales = sumByRange(s, e, collectionAmount);
  const weeklyCollection = sumByRange(week.start, week.end, collectionAmount);
  const monthlyCollection = sumByRange(month.start, month.end, collectionAmount);
  const duePayment = totalDuePayment();

  document.getElementById('hero-sales').textContent = fmtMoney(sales);
  document.getElementById('m-weekly-collection').textContent = fmtMoney(weeklyCollection);
  document.getElementById('m-monthly-collection').textContent = fmtMoney(monthlyCollection);
  document.getElementById('m-due-payment').textContent = fmtMoney(duePayment);
  renderSalesOverview();

  // Today's transactions (all types) in a single summary card
  const list = document.getElementById('recent-list');
  list.innerHTML = '';
  const todayTx = state.transactions.filter(t => t.date >= s && t.date <= e);
  if (!todayTx.length) {
    list.innerHTML = '<div class="empty">No transactions today.<br>Tap ＋ Add New Entry to record one.</div>';
    return;
  }
  const card = document.createElement('div');
  card.className = 'summary-card';
  todayTx.forEach(tx => card.appendChild(summaryRow(tx)));
  list.appendChild(card);
}

function renderSalesOverview() {
  const chart = salesOverviewData();
  const maxY = chartMax(chart.values);
  const yAxis = document.getElementById('sales-y-axis');
  const xAxis = document.getElementById('sales-x-axis');
  yAxis.innerHTML = [maxY, maxY * 2 / 3, maxY / 3, 0]
    .map(v => `<span>${axisLabel(v)}</span>`)
    .join('');
  xAxis.innerHTML = chart.labels.map(label => `<span>${escape(label)}</span>`).join('');
  drawSalesOverviewChart(chart.values, maxY);
}

function salesOverviewData() {
  const start = new Date();
  start.setHours(0, 0, 0, 0);
  start.setDate(start.getDate() - 6);
  const labels = [];
  const values = [];

  for (let i = 0; i < 7; i++) {
    const dayStart = new Date(start);
    dayStart.setDate(start.getDate() + i);
    const s = dayStart.getTime();
    const e = s + 86400000 - 1;
    labels.push(String(dayStart.getDate()));
    values.push(sumByRange(s, e, collectionAmount));
  }

  return { labels, values };
}

function chartMax(values) {
  const highest = Math.max(0, ...values);
  return Math.max(30000, Math.ceil(highest / 10000) * 10000);
}

function axisLabel(value) {
  if (value <= 0) return '0';
  return `${Math.round(value / 1000)}k`;
}

function drawSalesOverviewChart(values, maxY) {
  const canvas = document.getElementById('sales-overview-chart');
  const rect = canvas.getBoundingClientRect();
  const dpr = window.devicePixelRatio || 1;
  const width = Math.max(1, rect.width);
  const height = Math.max(1, rect.height);
  canvas.width = Math.round(width * dpr);
  canvas.height = Math.round(height * dpr);

  const ctx = canvas.getContext('2d');
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  ctx.clearRect(0, 0, width, height);

  const points = values.map((value, index) => {
    const x = values.length <= 1 ? 0 : index * (width / (values.length - 1));
    const normalized = Math.min(1, Math.max(0, value / maxY));
    const y = height - normalized * height * 0.9;
    return { x, y };
  });

  ctx.strokeStyle = '#E5E7EB';
  ctx.lineWidth = 1;
  for (let i = 0; i <= 3; i++) {
    const y = height * i / 3;
    ctx.beginPath();
    ctx.moveTo(0, y);
    ctx.lineTo(width, y);
    ctx.stroke();
  }

  const line = new Path2D();
  const area = new Path2D();
  line.moveTo(points[0].x, points[0].y);
  area.moveTo(points[0].x, height);
  area.lineTo(points[0].x, points[0].y);
  for (let i = 0; i < points.length - 1; i++) {
    const current = points[i];
    const next = points[i + 1];
    const midX = (current.x + next.x) / 2;
    line.bezierCurveTo(midX, current.y, midX, next.y, next.x, next.y);
    area.bezierCurveTo(midX, current.y, midX, next.y, next.x, next.y);
  }
  area.lineTo(points[points.length - 1].x, height);
  area.closePath();

  const fill = ctx.createLinearGradient(0, 0, 0, height);
  fill.addColorStop(0, 'rgba(37, 99, 235, 0.24)');
  fill.addColorStop(1, 'rgba(37, 99, 235, 0.03)');
  ctx.fillStyle = fill;
  ctx.fill(area);

  ctx.strokeStyle = '#2563EB';
  ctx.lineWidth = 3.5;
  ctx.lineCap = 'round';
  ctx.lineJoin = 'round';
  ctx.stroke(line);

  points.forEach(point => {
    ctx.beginPath();
    ctx.fillStyle = '#2563EB';
    ctx.arc(point.x, point.y, 5, 0, Math.PI * 2);
    ctx.fill();
    ctx.beginPath();
    ctx.fillStyle = '#FFFFFF';
    ctx.arc(point.x, point.y, 2, 0, Math.PI * 2);
    ctx.fill();
  });
}

function summaryRow(tx) {
  const div = document.createElement('div');
  div.className = 'summary-row';
  const dueSale = isDueSale(tx);
  const cls = dueSale ? 'due' : tx.type === 'EXPENSE' ? 'payment' : (tx.type || 'OTHER').toLowerCase();
  const name = tx.customerName || tx.productName || 'Walk-in Customer';
  const initials = name.split(' ').filter(Boolean).slice(0, 2)
    .map(s => s[0].toUpperCase()).join('') || '?';
  const d = new Date(tx.date);
  const timeStr = d.toLocaleTimeString('en-IN',
    { hour: 'numeric', minute: '2-digit', hour12: true }).toLowerCase();
  const status = dueSale ? ' • Due Payment' : '';
  div.innerHTML = `
    <div class="sum-avatar ${cls}">${escape(initials)}</div>
    <div class="sum-main">
      <div class="sum-name">${escape(name)}</div>
      <div class="sum-meta">${txTypeLabel(tx.type)}${status} • ${escape(tx.billNo) || '—'}</div>
    </div>
    <div class="sum-right">
      <div class="sum-amount ${cls}">₹ ${fmtMoney(tx.totalAmount)}</div>
      <div class="sum-time">${timeStr}</div>
    </div>
  `;
  return div;
}

function txRow(tx) {
  const div = document.createElement('div');
  div.className = 'tx';
  const map = {
    SALE:    { cls: 'sale',    sign: '+', amtCls: 'pos' },
    EXPENSE: { cls: 'payment', sign: '+', amtCls: 'pos' },
    PAYMENT: { cls: 'payment', sign: '+', amtCls: 'pos' },
    OTHER:   { cls: 'other',   sign: '',  amtCls: 'neutral' }
  };
  const m = Object.assign({}, map[tx.type] || map.OTHER);
  if (isDueSale(tx)) {
    m.sign = '';
    m.amtCls = 'due';
  }
  const icon = tx.type === 'SALE' ? '🧾' : tx.type === 'EXPENSE' ? '💰' : tx.type === 'PAYMENT' ? '💳' : '📄';
  const status = isDueSale(tx) ? ' • Due Payment' : '';
  div.innerHTML = `
    <div class="tx-icon ${m.cls}" style="font-size:18px">${icon}</div>
    <div class="tx-main">
      <div class="tx-name">${escape(tx.customerName) || 'Walk-in Customer'}</div>
      <div class="tx-meta">${txTypeLabel(tx.type)}${status} • ${escape(tx.billNo) || '—'}</div>
    </div>
    <div class="tx-right">
      <div class="tx-amount ${m.amtCls}">${m.sign}₹ ${fmtMoney(tx.totalAmount)}</div>
      <div class="tx-date">${fmtDate(tx.date, { year: undefined })}, ${fmtTime(tx.date)}</div>
    </div>
  `;
  return div;
}
// Entries
let entriesFilter = '';
let entriesSearch = '';
let advanceHistorySearch = '';
let dueHistorySearch = '';
function renderEntries() {
  document.getElementById('entries-search').value = entriesSearch;
  document.querySelectorAll('#entries-filter .seg-item').forEach(b => {
    b.classList.toggle('active', (b.dataset.filter || '') === entriesFilter);
  });

  const list = document.getElementById('entries-list');
  list.innerHTML = '';
  const filtered = state.transactions.filter(tx =>
    (!entriesFilter || tx.type === entriesFilter) &&
    (!entriesSearch ||
      (tx.customerName || '').toLowerCase().includes(entriesSearch.toLowerCase()) ||
      (tx.billNo || '').toLowerCase().includes(entriesSearch.toLowerCase()) ||
      (tx.mobileNumber || '').toLowerCase().includes(entriesSearch.toLowerCase()) ||
      String(tx.totalAmount || '').includes(entriesSearch))
  );

  if (!filtered.length) {
    list.innerHTML = '<div class="empty">No entries to show.</div>';
    return;
  }

  // Group by date
  const groups = {};
  filtered.forEach(t => {
    const k = fmtDate(t.date);
    (groups[k] = groups[k] || []).push(t);
  });
  Object.keys(groups).forEach(date => {
    const head = document.createElement('div');
    head.className = 'date-head';
    head.textContent = date;
    list.appendChild(head);
    groups[date].forEach(tx => list.appendChild(txRow(tx)));
  });
}

// Add Entry
let addType = 'SALE';
let lastPaymentField = 'cash';
let productOptions = [...PRODUCT_OPTIONS];
let itemLines = [];
let itemSnapshot = null;
let productSearch = '';
let lockedScrollY = 0;
let datePickerMonth = new Date();
let pendingSaleTx = null;
let selectedDueSaleId = null;
let duePickerSearch = '';
function renderAddEntry() {
  const dateInput = document.getElementById('f-date');
  // Reset on fresh open
  if (renderAddEntry._fresh !== false) {
    addType = 'SALE'; lastPaymentField = 'cash';
    itemLines = [];
    productSearch = '';
    selectedDueSaleId = null;
    document.getElementById('f-customer').value = '';
    document.getElementById('f-mobile').value = '';
    document.getElementById('f-bill').value = nextDocNo();
    setDateInput(todayIso());
    updateAmount();
    renderAddEntry._fresh = false;
  }
  updateAddTypeLabels();
  // Datalist of customers
  const dl = document.getElementById('customers-list');
  dl.innerHTML = saleCustomerNameOptions().map(name => `<option value="${escape(name)}">`).join('');
  const mobileList = document.getElementById('mobile-list');
  if (mobileList) {
    mobileList.innerHTML = saleMobileOptions().map(phone => `<option value="${escape(phone)}">`).join('');
  }

  document.querySelectorAll('#type-seg .seg-item').forEach(b =>
    b.classList.toggle('active', b.dataset.type === addType));
  clampFutureDateInput(dateInput);
  renderProductOptions();
  renderItemLines();
  updateItemSummary(itemTotal());
  updatePaymentBoxState();
}

function uniqueValues(values) {
  const seen = new Set();
  return values
    .map(value => String(value || '').trim())
    .filter(value => {
      const key = value.toLowerCase();
      if (!value || seen.has(key)) return false;
      seen.add(key);
      return true;
    });
}

function advanceAutocompleteEntries() {
  return state.transactions
    .filter(tx => tx.type === 'EXPENSE' && (tx.customerName || tx.mobileNumber))
    .sort((a, b) => b.date - a.date);
}

function saleCustomerNameOptions() {
  return uniqueValues([
    ...state.customers.map(c => c.name),
    ...advanceAutocompleteEntries().map(tx => tx.customerName)
  ]);
}

function saleMobileOptions() {
  return uniqueValues([
    ...state.customers.map(c => c.phone),
    ...advanceAutocompleteEntries().map(tx => tx.mobileNumber)
  ]);
}

function digitsOnly(value) {
  return String(value || '').replace(/\D/g, '');
}

function findAdvanceMatch(value, field) {
  const text = String(value || '').trim();
  if (!text) return null;
  const nameKey = text.toLowerCase();
  const phoneKey = digitsOnly(text);
  return advanceAutocompleteEntries().find(tx => {
    if (field === 'mobile') return phoneKey && digitsOnly(tx.mobileNumber) === phoneKey;
    if (field === 'customer') return String(tx.customerName || '').trim().toLowerCase() === nameKey;
    return String(tx.customerName || '').trim().toLowerCase() === nameKey ||
      (phoneKey && digitsOnly(tx.mobileNumber) === phoneKey);
  }) || null;
}
function nextDocNo(type = addType) {
  const ym = new Date().toISOString().slice(0, 7).replace('-', '');
  const seq = String(1000 + state.transactions.length + 1);
  return `${type === 'EXPENSE' ? 'ADV' : 'INV'}-${ym}-${seq}`;
}
function nextBillNo() { return nextDocNo('SALE'); }
function updateAddTypeLabels() {
  const billLabel = document.getElementById('bill-label');
  const title = document.getElementById('items-title');
  const pageTitle = document.querySelector('#item-modal .product-page-head h3');
  const placeholder = document.getElementById('item-summary-placeholder');
  const customerInput = document.getElementById('f-customer');
  const mobileInput = document.getElementById('f-mobile');
  const dueMode = addType === 'PAYMENT';
  if (billLabel) billLabel.textContent = addType === 'EXPENSE' ? 'Advance Serial Number' : 'Bill / Invoice No.';
  if (title) title.textContent = addType === 'EXPENSE' ? 'Item Name For' : 'Items';
  if (customerInput) {
    customerInput.readOnly = dueMode;
    customerInput.placeholder = dueMode ? 'Select due customer' : 'Select Customer';
  }
  if (mobileInput) {
    mobileInput.readOnly = dueMode;
    mobileInput.placeholder = dueMode ? 'Select due mobile number' : 'Mobile Number';
  }
  const itemText = addType === 'EXPENSE'
    ? 'Select item for advance'
    : addType === 'PAYMENT'
      ? 'Select product for due payment'
      : 'Select product for sale';
  if (placeholder && !itemLines.length) placeholder.textContent = itemText;
  if (pageTitle) pageTitle.textContent = addType === 'EXPENSE'
    ? 'Select Item For Advance'
    : addType === 'PAYMENT'
      ? 'Select Product For Due Payment'
      : 'Select Product For Sale';
}
function updateAmount() {
  const total = itemTotal();
  const itemTotalInput = document.getElementById('f-item-total');
  if (itemTotalInput) itemTotalInput.value = `₹ ${fmtMoney(total)}`;
  document.getElementById('f-total').textContent = fmtMoney(total);
  updateItemSummary(total);
  const online = Number(document.getElementById('f-online').value) || 0;
  if (lastPaymentField === 'online') {
    document.getElementById('f-online').value = moneyInput(Math.min(online, total));
    document.getElementById('f-cash').value = moneyInput(Math.max(0, total - Math.min(online, total)));
  } else {
    document.getElementById('f-cash').value = moneyInput(total);
    document.getElementById('f-online').value = '0';
  }
  updatePaymentBoxState();
  updateSaveButtonState();
}

function updateItemSummary(totalOverride) {
  const total = totalOverride ?? itemTotal();
  const summary = document.getElementById('item-summary');
  if (!summary) return;
  if (!itemLines.length) {
    const itemText = addType === 'EXPENSE'
      ? 'Select item for advance'
      : addType === 'PAYMENT'
        ? 'Select product for due payment'
        : 'Select product for sale';
    summary.innerHTML = `<strong id="item-summary-placeholder">${itemText}</strong>`;
    return;
  }
  const rateLabel = itemLines.length === 1
    ? fmtMoney(Number(itemLines[0].rate) || 0)
    : `${itemLines.length} ITEMS`;
  summary.innerHTML = `
    <div class="item-title">
      <span>Product Name</span>
      <strong>${escape(productSummary())}</strong>
    </div>
    <div class="item-summary-grid">
      <div><span>Qty</span><strong>${itemQtyTotal()}</strong></div>
      <div><span>Rate</span><strong>${rateLabel}</strong></div>
      <div><span>Amount</span><strong>₹ ${fmtMoney(total)}</strong></div>
    </div>
  `;
}

function updatePaymentSplit(source) {
  const total = itemTotal();
  const cashInput = document.getElementById('f-cash');
  const onlineInput = document.getElementById('f-online');
  lastPaymentField = source;

  if (source === 'online') {
    const online = Math.min(Number(onlineInput.value) || 0, total);
    onlineInput.value = moneyInput(online);
    cashInput.value = moneyInput(Math.max(0, total - online));
  } else {
    const cash = Math.min(Number(cashInput.value) || 0, total);
    cashInput.value = moneyInput(cash);
    onlineInput.value = moneyInput(Math.max(0, total - cash));
  }
  updatePaymentBoxState();
  document.getElementById('f-total').textContent = fmtMoney(total);
  updateSaveButtonState();
}

function selectPaymentBox(source) {
  lastPaymentField = source;
  updatePaymentBoxState();
}

function updatePaymentBoxState() {
  document.querySelectorAll('[data-payment-box]').forEach(box => {
    box.classList.toggle('active', box.dataset.paymentBox === lastPaymentField);
  });
}

function updateSaveButtonState() {
  const btn = document.getElementById('save-entry');
  if (!btn) return;
  btn.disabled = !productSelectionReady() || itemTotal() <= 0;
}

function moneyInput(value) {
  const safe = Math.max(0, Number(value) || 0);
  return Number.isInteger(safe) ? String(safe) : safe.toFixed(2).replace(/0+$/, '').replace(/\.$/, '');
}

function setDateInput(iso) {
  const input = document.getElementById('f-date');
  const safeIso = iso && iso <= todayIso() ? iso : todayIso();
  input.dataset.iso = safeIso;
  input.value = fmtDate(new Date(`${safeIso}T12:00:00`).getTime());
}

function selectedDateIso() {
  const input = document.getElementById('f-date');
  return input.dataset.iso || todayIso();
}

function lineTotal(line) {
  return (Number(line.qty) || 0) * (Number(line.rate) || 0);
}
function itemTotal() {
  return itemLines.reduce((sum, line) => sum + lineTotal(line), 0);
}
function itemQtyTotal() {
  return itemLines.reduce((sum, line) => sum + (Number(line.qty) || 0), 0);
}
function productSummary() {
  if (!itemLines.length) return 'Tap to add product';
  return itemLines.map(line => line.productName).join(', ');
}
function normalizeProductName(value) {
  return String(value || '').trim().replace(/\s+/g, ' ').toUpperCase();
}

function linesFromTransaction(tx, fallbackAmount) {
  if (Array.isArray(tx.items) && tx.items.length) {
    return tx.items.map(item => ({
      productName: normalizeProductName(item.productName || tx.productName || 'ITEM'),
      qty: String(item.quantity || 1),
      rate: moneyInput(item.rate || tx.rate || 0)
    }));
  }
  const quantity = Number(tx.quantity) || 1;
  const amount = Number(fallbackAmount ?? tx.totalAmount) || 0;
  const rate = Number(tx.rate) || (quantity > 0 ? amount / quantity : amount);
  return [{
    productName: normalizeProductName(tx.productName || 'ITEM'),
    qty: String(quantity),
    rate: moneyInput(rate)
  }];
}

function ensureProductOptionsForLines(lines) {
  lines.forEach(line => {
    if (line.productName && !productOptions.includes(line.productName)) {
      productOptions = productOptions.concat(line.productName);
    }
  });
}

function applyPaymentSplitFromTx(tx) {
  const total = itemTotal();
  const rawCash = Number(tx.cashAmount) || 0;
  const rawOnline = Number(tx.onlineAmount) || 0;
  const splitTotal = rawCash + rawOnline;
  let online = rawOnline;
  if (splitTotal > total && splitTotal > 0) {
    online = total * (rawOnline / splitTotal);
  }
  online = Math.min(online, total);
  const cash = Math.max(0, total - online);
  document.getElementById('f-cash').value = moneyInput(cash);
  document.getElementById('f-online').value = moneyInput(online);
  lastPaymentField = online > 0 ? 'online' : 'cash';
  document.getElementById('f-total').textContent = fmtMoney(total);
  updatePaymentBoxState();
  updateSaveButtonState();
}

function fillSaleFromAdvance(tx) {
  if (!tx || addType !== 'SALE') return false;
  selectedDueSaleId = null;
  document.getElementById('f-customer').value = tx.customerName || '';
  document.getElementById('f-mobile').value = tx.mobileNumber || '';
  if (!document.getElementById('f-bill').value.trim()) {
    document.getElementById('f-bill').value = nextDocNo('SALE');
  }
  itemLines = linesFromTransaction(tx);
  ensureProductOptionsForLines(itemLines);
  renderProductOptions();
  renderItemLines();
  applyPaymentSplitFromTx(tx);
  return true;
}

function maybeFillSaleFromAdvance(field) {
  if (addType !== 'SALE') return false;
  const input = document.getElementById(field === 'mobile' ? 'f-mobile' : 'f-customer');
  const match = findAdvanceMatch(input.value, field);
  return match ? fillSaleFromAdvance(match) : false;
}

function fillCustomerFromMobileIfKnown() {
  const phone = digitsOnly(document.getElementById('f-mobile').value);
  if (!phone) return false;
  const customer = state.customers.find(c => digitsOnly(c.phone) === phone);
  if (!customer) return false;
  document.getElementById('f-customer').value = customer.name || '';
  return true;
}

function renderProductOptions() {
  const el = document.getElementById('product-options');
  if (!el) return;
  const query = normalizeProductName(productSearch);
  const visibleOptions = query
    ? productOptions.filter(name => name.includes(query))
    : productOptions;
  if (!visibleOptions.length) {
    el.innerHTML = '<div class="empty">No product found. Tap Add or Save to add it.</div>';
    updateAddProductButton();
    return;
  }
  el.innerHTML = visibleOptions.map(name => {
    const checked = itemLines.some(line => line.productName === name);
    return `
      <label class="product-option ${checked ? 'selected' : ''}">
        <input type="checkbox" data-product-name="${escape(name)}" ${checked ? 'checked' : ''}>
        <span class="product-check">${checked ? '✓' : ''}</span>
        <span class="product-name">${escape(name)}</span>
      </label>
    `;
  }).join('');
  updateAddProductButton();
}
function renderItemLines() {
  const list = document.getElementById('item-lines-list');
  if (!list) return;
  if (!itemLines.length) {
    list.innerHTML = '<div class="empty">Select one or more product names.</div>';
    updateAmount();
    return;
  }
  list.innerHTML = itemLines.map((line, index) => `
    <div class="item-line" data-line-index="${index}">
      <div class="item-line-head">
        <div class="item-line-name">${escape(line.productName)}</div>
        <button class="iconbtn dark" data-remove-line="${index}" aria-label="Remove product">
          <svg viewBox="0 0 24 24" width="18" height="18"><path fill="currentColor" d="M6 19c0 1.1.9 2 2 2h8a2 2 0 002-2V7H6v12zM8 9h8v10H8V9zm7.5-5l-1-1h-5l-1 1H5v2h14V4z"/></svg>
        </button>
      </div>
      <div class="item-line-grid">
        <label><span>Qty</span><input data-line-field="qty" data-line-index="${index}" type="number" inputmode="numeric" min="0" value="${escape(line.qty)}"></label>
        <label><span>Rate</span><input data-line-field="rate" data-line-index="${index}" type="number" inputmode="decimal" step="0.01" min="0" value="${escape(line.rate)}"></label>
        <label><span>Amount</span><input data-line-amount="${index}" value="${fmtMoney(lineTotal(line))}" readonly></label>
      </div>
    </div>
  `).join('');
  updateAmount();
}
function toggleProductLine(name) {
  if (itemLines.some(line => line.productName === name)) {
    itemLines = itemLines.filter(line => line.productName !== name);
  } else {
    itemLines = itemLines.concat({ productName: name, qty: '1', rate: '' });
  }
  renderProductOptions();
  renderItemLines();
}
function addCustomProduct() {
  const input = document.getElementById('new-product-name');
  const name = normalizeProductName(input.value);
  if (!name) return;
  const exactName = productOptions.find(option => option === name);
  const productName = exactName || name;
  if (!exactName) productOptions = productOptions.concat(productName);
  if (!itemLines.some(line => line.productName === productName)) {
    itemLines = itemLines.concat({ productName, qty: '1', rate: '' });
  }
  input.value = '';
  productSearch = '';
  renderProductOptions();
  renderItemLines();
}
function savePendingProductSearch() {
  const name = normalizeProductName(productSearch);
  if (!name || productOptions.includes(name)) return;
  productOptions = productOptions.concat(name);
  productSearch = '';
  document.getElementById('new-product-name').value = '';
}
function updateAddProductButton() {
  const btn = document.getElementById('add-product-btn');
  if (!btn) return;
  const name = normalizeProductName(productSearch);
  if (!name) {
    btn.textContent = 'Add';
  } else if (productOptions.includes(name)) {
    btn.textContent = 'Select';
  } else {
    btn.textContent = 'Add';
  }
  updateProductSaveState();
}

function productSelectionReady() {
  return itemLines.length > 0 && itemLines.every(line =>
    (Number(line.qty) || 0) > 0 && (Number(line.rate) || 0) > 0
  );
}

function updateProductSaveState() {
  const save = document.getElementById('item-save');
  if (!save) return;
  save.disabled = !productSelectionReady();
}
function updateLineInput(index, field, value) {
  itemLines = itemLines.map((line, i) => {
    if (i !== index) return line;
    return Object.assign({}, line, {
      [field]: field === 'qty' ? String(value).replace(/\D/g, '') : String(value).replace(/[^\d.]/g, '').replace(/(\..*)\./g, '$1')
    });
  });
  const amountInput = document.querySelector(`[data-line-amount="${index}"]`);
  if (amountInput) amountInput.value = fmtMoney(lineTotal(itemLines[index]));
  updateAmount();
  updateProductSaveState();
}

function clampFutureDateInput(input) {
  const max = todayIso();
  const current = input.dataset.iso || input.value || max;
  setDateInput(current > max ? max : current);
}

function openDatePicker() {
  const selected = new Date(`${selectedDateIso()}T12:00:00`);
  datePickerMonth = new Date(selected.getFullYear(), selected.getMonth(), 1);
  renderDatePicker();
  document.getElementById('date-modal').classList.remove('hidden');
}

function closeDatePicker() {
  document.getElementById('date-modal').classList.add('hidden');
}

function renderDatePicker() {
  const today = todayIso();
  const selected = selectedDateIso();
  const title = document.getElementById('date-title');
  const days = document.getElementById('date-days');
  title.textContent = datePickerMonth.toLocaleDateString('en-IN', { month: 'long', year: 'numeric' });
  const firstDay = new Date(datePickerMonth.getFullYear(), datePickerMonth.getMonth(), 1);
  const lastDay = new Date(datePickerMonth.getFullYear(), datePickerMonth.getMonth() + 1, 0);
  const blanks = Array.from({ length: firstDay.getDay() }, () => '<span class="date-day empty"></span>');
  const cells = [];
  for (let day = 1; day <= lastDay.getDate(); day++) {
    const date = new Date(datePickerMonth.getFullYear(), datePickerMonth.getMonth(), day);
    const iso = dateIso(date);
    const disabled = iso > today;
    cells.push(`
      <button class="date-day ${iso === selected ? 'selected' : ''} ${iso === today ? 'today' : ''} ${disabled ? 'disabled' : ''}"
        data-date="${iso}" ${disabled ? 'disabled' : ''}>${day}</button>
    `);
  }
  days.innerHTML = blanks.concat(cells).join('');
}

function dateIso(date) {
  const d = new Date(date);
  d.setMinutes(d.getMinutes() - d.getTimezoneOffset());
  return d.toISOString().slice(0, 10);
}

function openItemModal() {
  itemSnapshot = {
    productOptions: productOptions.slice(),
    itemLines: itemLines.map(line => Object.assign({}, line))
  };
  productSearch = '';
  document.getElementById('new-product-name').value = '';
  renderProductOptions();
  renderItemLines();
  document.getElementById('item-modal').classList.remove('hidden');
  lockPageScroll();
  updateAmount();
}

function closeItemModal(saveItem = true) {
  if (saveItem && !productSelectionReady()) return;
  if (saveItem) {
    savePendingProductSearch();
  }
  if (!saveItem && itemSnapshot) {
    productOptions = itemSnapshot.productOptions;
    itemLines = itemSnapshot.itemLines;
  }
  itemSnapshot = null;
  document.getElementById('item-modal').classList.add('hidden');
  unlockPageScroll();
  renderProductOptions();
  renderItemLines();
  updateAmount();
}

function lockPageScroll() {
  const main = document.getElementById('main');
  lockedScrollY = main ? main.scrollTop : (window.scrollY || document.documentElement.scrollTop || 0);
  document.body.classList.add('modal-open');
}

function unlockPageScroll() {
  document.body.classList.remove('modal-open');
  const main = document.getElementById('main');
  if (main) main.scrollTo(0, lockedScrollY);
  else window.scrollTo(0, lockedScrollY);
}

function openDuePicker() {
  if (addType !== 'PAYMENT') return false;
  if (!document.getElementById('due-picker-modal').classList.contains('hidden')) return true;
  if (!duePickerEntries().length) {
    toast('No due entries found');
    return true;
  }
  duePickerSearch = '';
  document.getElementById('due-picker-search').value = '';
  renderDuePicker();
  document.getElementById('due-picker-modal').classList.remove('hidden');
  lockPageScroll();
  setTimeout(() => document.getElementById('due-picker-search')?.focus(), 80);
  return true;
}

function closeDuePicker() {
  document.getElementById('due-picker-modal').classList.add('hidden');
  unlockPageScroll();
}

function renderDuePicker() {
  const list = document.getElementById('due-picker-list');
  if (!list) return;
  const query = duePickerSearch.trim().toLowerCase();
  const rows = duePickerEntries().filter(({ sale, outstanding }) => {
    if (!query) return true;
    return [
      sale.customerName,
      sale.mobileNumber,
      sale.billNo,
      sale.productName,
      fmtMoney(outstanding),
      outstanding
    ].join(' ').toLowerCase().includes(query);
  });
  if (!rows.length) {
    list.innerHTML = '<div class="empty">No matching due entries.</div>';
    return;
  }
  list.innerHTML = rows.map(({ sale, outstanding }) => `
    <button class="due-picker-row" data-due-sale-id="${escape(sale.id)}">
      <div class="due-picker-name">${escape(sale.customerName) || 'Walk-in Customer'}</div>
      <div class="due-picker-meta">${escape(sale.mobileNumber) || '—'} • ${escape(sale.billNo) || '—'}</div>
      <div class="due-picker-bottom">
        <span>${escape(sale.productName) || '—'}</span>
        <span class="due-picker-amount">₹ ${fmtMoney(outstanding)}</span>
      </div>
    </button>
  `).join('');
}

function fillDuePaymentFromSale(saleId) {
  const sale = state.transactions.find(tx => tx.id === saleId);
  if (!sale) return;
  const outstanding = dueOutstandingAmount(sale);
  if (outstanding <= 0) {
    toast('This due is already paid');
    closeDuePicker();
    return;
  }
  selectedDueSaleId = sale.id;
  document.getElementById('f-customer').value = sale.customerName || '';
  document.getElementById('f-mobile').value = sale.mobileNumber || '';
  document.getElementById('f-bill').value = sale.billNo || '';

  const saleLines = Array.isArray(sale.items) && sale.items.length
    ? sale.items.map(item => ({
        productName: normalizeProductName(item.productName || sale.productName),
        qty: String(item.quantity || 1),
        rate: String(item.rate || sale.rate || 0)
      }))
    : [{ productName: normalizeProductName(sale.productName || 'DUE PAYMENT'), qty: String(sale.quantity || 1), rate: String(sale.rate || outstanding) }];
  const originalTotal = saleLines.reduce((sum, line) => sum + ((Number(line.qty) || 0) * (Number(line.rate) || 0)), 0);
  itemLines = Math.abs(originalTotal - outstanding) < 0.01
    ? saleLines
    : [{ productName: normalizeProductName(sale.productName || 'DUE PAYMENT'), qty: '1', rate: moneyInput(outstanding) }];
  itemLines.forEach(line => {
    if (line.productName && !productOptions.includes(line.productName)) {
      productOptions = productOptions.concat(line.productName);
    }
  });
  lastPaymentField = 'cash';
  renderProductOptions();
  renderItemLines();
  updateAmount();
  closeDuePicker();
}

// Customers
let custSearch = '';
function renderCustomers() {
  document.getElementById('customers-search').value = custSearch;
  // Compute due per customer from transactions
  const dueMap = {};
  state.transactions.forEach(t => {
    if (!t.customerName) return;
    const key = t.customerName.toLowerCase();
    if (!(key in dueMap)) dueMap[key] = 0;
    if (isDueSale(t)) dueMap[key] += dueOutstandingAmount(t);
  });

  const list = document.getElementById('customers-rows');
  list.innerHTML = '';
  const filtered = state.customers.filter(c =>
    !custSearch || c.name.toLowerCase().includes(custSearch.toLowerCase()) || (c.phone || '').includes(custSearch)
  );
  if (!filtered.length) {
    list.innerHTML = '<div class="empty">No customers yet. Tap ＋ Add Customer.</div>';
    return;
  }
  filtered.forEach(c => {
    const due = Math.max(0, dueMap[c.name.toLowerCase()] || 0);
    const isDue = due > 0;
    const row = document.createElement('div');
    row.className = 'cust';
    const initials = c.name.split(' ').filter(Boolean).slice(0, 2).map(s => s[0].toUpperCase()).join('') || '?';
    row.innerHTML = `
      <div class="cust-avatar">${escape(initials)}</div>
      <div class="cust-main">
        <div class="cust-name">${escape(c.name)}</div>
        <div class="cust-phone">${escape(c.phone) || '—'}</div>
      </div>
      <div style="text-align:right">
        <div class="cust-due ${isDue ? 'due' : 'paid'}">₹ ${fmtMoney(due)}</div>
        <div class="cust-status ${isDue ? 'due' : 'paid'}">${isDue ? 'Due' : 'Paid'}</div>
      </div>
    `;
    list.appendChild(row);
  });
}

// Reports
let reportOffset = 0;
function renderReports() {
  document.querySelectorAll('#reports-mode .seg-item').forEach(b => {
    b.classList.toggle('active', b.dataset.reportMode === reportMode);
  });
  document.getElementById('reports-summary-panel').classList.toggle('hidden', reportMode !== 'summary');
  document.getElementById('reports-entries-panel').classList.toggle('hidden', reportMode !== 'entries');
  document.getElementById('reports-advance-panel').classList.toggle('hidden', reportMode !== 'advance-history');
  document.getElementById('reports-due-panel').classList.toggle('hidden', reportMode !== 'due-history');
  document.getElementById('fab').classList.toggle('hidden', reportMode !== 'entries');
  if (reportMode === 'entries') {
    renderEntries();
    return;
  }
  if (reportMode === 'advance-history') {
    renderHistory('advance');
    return;
  }
  if (reportMode === 'due-history') {
    renderHistory('due');
    return;
  }

  const r = monthRange(reportOffset);
  document.getElementById('report-title').textContent = r.title;

  const inRange = state.transactions.filter(t => t.date >= r.start && t.date <= r.end);
  const sales = inRange.reduce((a,b) => a + paidSaleAmount(b), 0);
  const collection = inRange.reduce((a,b) => a + collectionAmount(b), 0);
  const expenses = inRange.filter(t => t.type === 'EXPENSE').reduce((a,b) => a + b.totalAmount, 0);
  const due = totalDueInRange(r.start, r.end);

  document.getElementById('r-sales').textContent = fmtMoney(sales);
  document.getElementById('r-collection').textContent = fmtMoney(collection);
  document.getElementById('r-expenses').textContent = fmtMoney(expenses);
  document.getElementById('r-due').textContent = fmtMoney(due);
}

function renderHistory(kind) {
  const isAdvance = kind === 'advance';
  const search = isAdvance ? advanceHistorySearch : dueHistorySearch;
  const inputId = isAdvance ? 'advance-search' : 'due-search';
  const listId = isAdvance ? 'advance-list' : 'due-list';
  const list = document.getElementById(listId);
  document.getElementById(inputId).value = search;
  list.innerHTML = '';

  const rows = state.transactions.filter(tx => {
    const typeMatch = isAdvance ? tx.type === 'EXPENSE' : tx.type === 'PAYMENT' || isDueSale(tx);
    return typeMatch && historyMatches(tx, search);
  });

  if (!rows.length) {
    list.innerHTML = `<div class="empty">No ${isAdvance ? 'advance payment' : 'due payment'} history found.</div>`;
    return;
  }
  rows.forEach(tx => list.appendChild(historyRow(tx, kind)));
}

function historyMatches(tx, query) {
  const q = String(query || '').trim().toLowerCase();
  if (!q) return true;
  const displayAmount = isDueSale(tx) ? dueOutstandingAmount(tx) : tx.totalAmount;
  const haystack = [
    fmtDate(tx.date),
    tx.billNo,
    tx.customerName,
    tx.mobileNumber,
    tx.productName,
    tx.rate,
    tx.cashAmount,
    tx.onlineAmount,
    displayAmount,
    fmtMoney(displayAmount)
  ].join(' ').toLowerCase();
  return haystack.includes(q);
}

function historyRow(tx, kind) {
  const row = document.createElement('div');
  const due = kind === 'due';
  const displayAmount = isDueSale(tx) ? dueOutstandingAmount(tx) : tx.totalAmount;
  row.className = 'history-card';
  row.innerHTML = `
    <div class="history-top">
      <div class="flex">
        <div class="history-name">${escape(tx.customerName) || 'Walk-in Customer'}</div>
        <div class="history-meta">${fmtDate(tx.date)} • ${escape(tx.billNo) || '—'}</div>
      </div>
      <div class="history-amount ${due ? 'due' : ''}">₹ ${fmtMoney(displayAmount)}</div>
    </div>
    <div class="history-grid">
      <div><span>Mobile Number</span><strong>${escape(tx.mobileNumber) || '—'}</strong></div>
      <div><span>${kind === 'advance' ? 'Advance Serial No.' : 'Bill / Invoice No.'}</span><strong>${escape(tx.billNo) || '—'}</strong></div>
      <div><span>${kind === 'advance' ? 'Item Name For' : 'Product Name'}</span><strong>${escape(tx.productName) || '—'}</strong></div>
      <div><span>Rate</span><strong>₹ ${fmtMoney(tx.rate)}</strong></div>
      <div><span>Cash</span><strong>₹ ${fmtMoney(tx.cashAmount)}</strong></div>
      <div><span>Online</span><strong>₹ ${fmtMoney(tx.onlineAmount)}</strong></div>
    </div>
  `;
  return row;
}

// More
function renderMore() {
  document.getElementById('biz-name').textContent = state.business.name;
  document.getElementById('biz-phone').textContent = state.business.phone;
}

function buildEntryFromForm() {
  const customer = document.getElementById('f-customer').value.trim();
  const mobile = document.getElementById('f-mobile').value.trim();
  const bill = document.getElementById('f-bill').value.trim();
  const dueSale = addType === 'PAYMENT' && selectedDueSaleId
    ? state.transactions.find(tx => tx.id === selectedDueSaleId)
    : null;
  const dateInput = document.getElementById('f-date');
  clampFutureDateInput(dateInput);
  const dateStr = selectedDateIso();
  const product = itemLines.map(line => line.productName).join(', ');
  const qty = itemQtyTotal();
  const rate = itemLines.length === 1 ? Number(itemLines[0].rate) || 0 : 0;
  const total = itemTotal();
  updatePaymentSplit(lastPaymentField);
  const cashAmount = Math.min(Number(document.getElementById('f-cash').value) || 0, total);
  const onlineAmount = Math.min(Number(document.getElementById('f-online').value) || 0, total);

  if (!itemLines.length) { toast('Select product name'); return null; }
  if (!productSelectionReady() || total <= 0) { toast('Enter quantity and rate'); return null; }

  return {
    id: uid(),
    customerName: customer,
    mobileNumber: mobile,
    type: addType,
    billNo: bill,
    date: dateStr ? new Date(dateStr + 'T12:00:00').getTime() : Date.now(),
    productName: product,
    quantity: qty,
    rate,
    totalAmount: total,
    paymentMethod: lastPaymentField === 'online' ? 'ONLINE' : 'CASH',
    cashAmount,
    onlineAmount,
    items: itemLines.map(line => ({
      productName: line.productName,
      quantity: Number(line.qty) || 0,
      rate: Number(line.rate) || 0,
      amount: lineTotal(line)
    })),
    notes: '',
    paymentStatus: addType === 'SALE' ? 'PAID' : undefined,
    dueSourceId: dueSale ? dueSale.id : undefined,
    dueSourceBillNo: dueSale ? dueSale.billNo : undefined,
    createdAt: Date.now()
  };
}

function openSaleStatusModal(tx) {
  pendingSaleTx = tx;
  document.getElementById('sale-status-modal').classList.remove('hidden');
}

function closeSaleStatusModal() {
  pendingSaleTx = null;
  document.getElementById('sale-status-modal').classList.add('hidden');
}

function commitEntry(tx, status) {
  const finalTx = Object.assign({}, tx);
  if (finalTx.type === 'SALE') {
    finalTx.paymentStatus = status || 'PAID';
    if (finalTx.paymentStatus === 'DUE') {
      finalTx.cashAmount = 0;
      finalTx.onlineAmount = 0;
      finalTx.paymentMethod = 'DUE';
    }
  }
  addTransaction(finalTx);
  if (finalTx.customerName) {
    addCustomer({
      id: uid(),
      name: finalTx.customerName,
      phone: finalTx.mobileNumber || '',
      createdAt: Date.now()
    });
  }
  renderAddEntry._fresh = true;
  toast(finalTx.paymentStatus === 'DUE' ? 'Due payment saved' : 'Entry saved');
  showView('dashboard', false);
  navStack.length = 0; navStack.push('dashboard');
}

// ---------- Helpers ----------
function setAppThemeColor(color = APP_THEME_COLOR) {
  const meta = document.querySelector('meta[name="theme-color"]');
  if (meta) meta.setAttribute('content', color);
}

function escape(s) {
  return String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
}
function cap(s) { return (s || '').charAt(0) + (s || '').slice(1).toLowerCase(); }
function txTypeLabel(type) {
  return {
    SALE: 'Sale',
    EXPENSE: 'Advance Payment',
    PAYMENT: 'Due Payment',
    OTHER: 'Other'
  }[type] || cap(type);
}

// ---------- Wire up events ----------
document.addEventListener('DOMContentLoaded', () => {
  load();
  seedDemoSalesIfMissing();

  // Bottom nav
  document.querySelectorAll('.nav-btn').forEach(btn => {
    btn.addEventListener('click', () => showView(btn.dataset.nav));
  });
  // Internal nav links
  document.body.addEventListener('click', (e) => {
    const t = e.target.closest('[data-nav]');
    if (t && !t.classList.contains('nav-btn')) {
      e.preventDefault();
      if (t.dataset.reportOpen) reportMode = t.dataset.reportOpen;
      showView(t.dataset.nav);
    }
  });

  // Back / Menu
  const _backBtn = document.getElementById('back-btn');
  if (_backBtn) _backBtn.addEventListener('click', goBack);
  document.getElementById('menu-btn').addEventListener('click', () => showView('more'));
  document.getElementById('bell-btn').addEventListener('click', () => toast('No new notifications'));

  // FAB
  document.getElementById('fab').addEventListener('click', () => {
    renderAddEntry._fresh = true;
    showView('add');
  });

  // Add Entry — type segmented
  document.getElementById('type-seg').addEventListener('click', (e) => {
    const b = e.target.closest('.seg-item'); if (!b) return;
    const previousType = addType;
    addType = b.dataset.type;
    if (previousType !== addType) {
      selectedDueSaleId = null;
      document.getElementById('f-customer').value = '';
      document.getElementById('f-mobile').value = '';
      document.getElementById('f-bill').value = addType === 'PAYMENT' ? '' : nextDocNo(addType);
      itemLines = [];
      productSearch = '';
      lastPaymentField = 'cash';
      updateAmount();
    }
    document.querySelectorAll('#type-seg .seg-item').forEach(x =>
      x.classList.toggle('active', x === b));
    updateAddTypeLabels();
    updateItemSummary(itemTotal());
  });
  document.getElementById('f-customer').addEventListener('click', (e) => {
    if (addType === 'PAYMENT' && openDuePicker()) {
      e.preventDefault();
      e.target.blur();
    }
  });
  document.getElementById('f-customer').addEventListener('focus', (e) => {
    if (addType === 'PAYMENT' && openDuePicker()) {
      e.preventDefault();
      e.target.blur();
    }
  });
  document.getElementById('f-mobile').addEventListener('click', (e) => {
    if (addType === 'PAYMENT' && openDuePicker()) {
      e.preventDefault();
      e.target.blur();
    }
  });
  document.getElementById('f-mobile').addEventListener('focus', (e) => {
    if (addType === 'PAYMENT' && openDuePicker()) {
      e.preventDefault();
      e.target.blur();
    }
  });
  document.getElementById('f-customer').addEventListener('input', () => {
    maybeFillSaleFromAdvance('customer');
  });
  document.getElementById('f-mobile').addEventListener('input', () => {
    maybeFillSaleFromAdvance('mobile');
  });
  document.getElementById('f-customer').addEventListener('change', () => {
    if (maybeFillSaleFromAdvance('customer')) return;
    const customer = state.customers.find(c =>
      c.name.toLowerCase() === document.getElementById('f-customer').value.trim().toLowerCase()
    );
    if (customer && !document.getElementById('f-mobile').value.trim()) {
      document.getElementById('f-mobile').value = customer.phone || '';
    }
  });
  document.getElementById('f-mobile').addEventListener('change', () => {
    if (maybeFillSaleFromAdvance('mobile')) return;
    fillCustomerFromMobileIfKnown();
  });
  document.getElementById('f-date').addEventListener('click', openDatePicker);
  document.getElementById('date-cancel').addEventListener('click', closeDatePicker);
  document.getElementById('date-today').addEventListener('click', () => {
    setDateInput(todayIso());
    closeDatePicker();
  });
  document.getElementById('date-prev').addEventListener('click', () => {
    datePickerMonth.setMonth(datePickerMonth.getMonth() - 1);
    renderDatePicker();
  });
  document.getElementById('date-next').addEventListener('click', () => {
    datePickerMonth.setMonth(datePickerMonth.getMonth() + 1);
    renderDatePicker();
  });
  document.getElementById('date-days').addEventListener('click', (e) => {
    const day = e.target.closest('[data-date]');
    if (!day || day.disabled) return;
    setDateInput(day.dataset.date);
    closeDatePicker();
  });
  document.getElementById('due-picker-close').addEventListener('click', closeDuePicker);
  document.getElementById('due-picker-search').addEventListener('input', (e) => {
    duePickerSearch = e.target.value;
    renderDuePicker();
  });
  document.getElementById('due-picker-list').addEventListener('click', (e) => {
    const row = e.target.closest('[data-due-sale-id]');
    if (!row) return;
    fillDuePaymentFromSale(row.dataset.dueSaleId);
  });
  document.getElementById('item-summary').addEventListener('click', (e) => {
    openItemModal();
  });
  document.getElementById('product-options').addEventListener('change', (e) => {
    const input = e.target.closest('[data-product-name]');
    if (!input) return;
    toggleProductLine(input.dataset.productName);
  });
  document.getElementById('new-product-name').addEventListener('input', (e) => {
    e.target.value = normalizeProductName(e.target.value);
    productSearch = e.target.value;
    renderProductOptions();
  });
  document.getElementById('add-product-btn').addEventListener('click', addCustomProduct);
  document.getElementById('new-product-name').addEventListener('keydown', (e) => {
    if (e.key === 'Enter') {
      e.preventDefault();
      addCustomProduct();
    }
  });
  document.getElementById('item-lines-list').addEventListener('input', (e) => {
    const input = e.target.closest('[data-line-field]');
    if (!input) return;
    updateLineInput(Number(input.dataset.lineIndex), input.dataset.lineField, input.value);
  });
  document.getElementById('item-lines-list').addEventListener('click', (e) => {
    const remove = e.target.closest('[data-remove-line]');
    if (!remove) return;
    itemLines = itemLines.filter((_, index) => index !== Number(remove.dataset.removeLine));
    renderProductOptions();
    renderItemLines();
  });
  document.getElementById('item-cancel').addEventListener('click', () => closeItemModal(false));
  document.getElementById('item-save').addEventListener('click', () => closeItemModal(true));
  document.getElementById('payment-split').addEventListener('click', (e) => {
    const box = e.target.closest('[data-payment-box]');
    if (box) selectPaymentBox(box.dataset.paymentBox);
  });
  document.getElementById('f-cash').addEventListener('focus', () => selectPaymentBox('cash'));
  document.getElementById('f-online').addEventListener('focus', () => selectPaymentBox('online'));
  document.getElementById('f-cash').addEventListener('input', () => updatePaymentSplit('cash'));
  document.getElementById('f-online').addEventListener('input', () => updatePaymentSplit('online'));

  document.getElementById('save-entry').addEventListener('click', () => {
    const tx = buildEntryFromForm();
    if (!tx) return;
    if (tx.type === 'SALE') openSaleStatusModal(tx);
    else commitEntry(tx);
  });
  document.getElementById('sale-paid').addEventListener('click', () => {
    if (!pendingSaleTx) return;
    const tx = pendingSaleTx;
    closeSaleStatusModal();
    commitEntry(tx, 'PAID');
  });
  document.getElementById('sale-due').addEventListener('click', () => {
    if (!pendingSaleTx) return;
    const tx = pendingSaleTx;
    closeSaleStatusModal();
    commitEntry(tx, 'DUE');
  });

  // Entries filter / search
  document.getElementById('entries-filter').addEventListener('click', (e) => {
    const b = e.target.closest('.seg-item'); if (!b) return;
    entriesFilter = b.dataset.filter || '';
    renderEntries();
  });
  document.getElementById('entries-search').addEventListener('input', (e) => {
    entriesSearch = e.target.value; renderEntries();
  });
  document.getElementById('advance-search').addEventListener('input', (e) => {
    advanceHistorySearch = e.target.value; renderHistory('advance');
  });
  document.getElementById('due-search').addEventListener('input', (e) => {
    dueHistorySearch = e.target.value; renderHistory('due');
  });

  // Customers
  document.getElementById('customers-search').addEventListener('input', (e) => {
    custSearch = e.target.value; renderCustomers();
  });
  document.getElementById('add-customer-btn').addEventListener('click', openCustomerModal);
  document.getElementById('cust-cancel').addEventListener('click', closeCustomerModal);
  document.getElementById('cust-save').addEventListener('click', () => {
    const name = document.getElementById('cust-name').value.trim();
    const phone = document.getElementById('cust-phone').value.trim();
    if (!name) { toast('Name required'); return; }
    addCustomer({ id: uid(), name, phone, createdAt: Date.now() });
    closeCustomerModal();
    toast('Customer added');
    renderCustomers();
  });

  // Reports
  document.getElementById('reports-mode').addEventListener('click', (e) => {
    const b = e.target.closest('.seg-item'); if (!b) return;
    reportMode = b.dataset.reportMode || 'summary';
    renderReports();
  });
  document.getElementById('prev-month').addEventListener('click', () => { reportOffset--; renderReports(); });
  document.getElementById('next-month').addEventListener('click', () => { reportOffset++; renderReports(); });
  document.getElementById('period-seg').addEventListener('click', (e) => {
    const b = e.target.closest('.seg-item'); if (!b) return;
    document.querySelectorAll('#period-seg .seg-item').forEach(x =>
      x.classList.toggle('active', x === b));
    // (Daily/Yearly are shown but use month range internally for now)
    renderReports();
  });

  // More menu actions
  document.querySelector('#view-more .menu').addEventListener('click', (e) => {
    const b = e.target.closest('.menu-item'); if (!b) return;
    handleMoreAction(b.dataset.action);
  });
  document.querySelector('#view-more .btn.outline-danger').addEventListener('click', () => {
    if (confirm('Delete ALL data? This cannot be undone.')) {
      localStorage.removeItem(STORAGE_KEY);
      state.transactions = []; state.customers = [];
      state.business = Object.assign({}, DEFAULT_BUSINESS);
      toast('All data reset');
      showView('dashboard', false);
      navStack.length = 0; navStack.push('dashboard');
    }
  });
  document.getElementById('import-file').addEventListener('change', importJson);

  // Restore last viewed page on refresh (defaults to dashboard)
  let initial = 'dashboard';
  try {
    const saved = localStorage.getItem(VIEW_KEY);
    if (saved === 'entries') {
      initial = 'reports';
      reportMode = 'entries';
      localStorage.setItem(VIEW_KEY, 'reports');
    } else if (saved && MAIN_VIEWS.includes(saved)) initial = saved;
  } catch (e) {}
  navStack.length = 0; navStack.push(initial);
  showView(initial, false);

  // Re-render charts on resize
  window.addEventListener('resize', () => renderView(currentView));

  // Service worker for offline install/cache support.
  // Bump the cache name in sw.js whenever cached assets change.
  if ('serviceWorker' in navigator) {
    navigator.serviceWorker.register('./sw.js')
      .then(reg => reg.update())
      .catch(() => {});
  }
});

function openCustomerModal() {
  document.getElementById('cust-name').value = '';
  document.getElementById('cust-phone').value = '';
  document.getElementById('customer-modal').classList.remove('hidden');
}
function closeCustomerModal() {
  document.getElementById('customer-modal').classList.add('hidden');
}

function handleMoreAction(action) {
  if (action === 'export') {
    const blob = new Blob([JSON.stringify(state, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    const stamp = new Date().toISOString().slice(0, 10);
    a.href = url; a.download = `sales-backup-${stamp}.json`;
    document.body.appendChild(a); a.click(); a.remove();
    URL.revokeObjectURL(url);
    toast('Backup downloaded');
  } else if (action === 'import') {
    document.getElementById('import-file').click();
  } else if (action === 'profile') {
    const name = prompt('Business name', state.business.name);
    if (name) {
      const phone = prompt('Phone', state.business.phone) || state.business.phone;
      state.business = { name: name.trim(), phone: phone.trim() };
      save(); renderMore(); toast('Profile updated');
    }
  } else if (action === 'about') {
    alert('Sales & Maintenance — PWA build\nLocal-only. Your data stays on this device.');
  } else if (action === 'help') {
    alert('• Tap ＋ to add a sale, advance payment, or due payment\n• Use Reports for entries and payment histories\n• Use Export to back up your data');
  } else if (action === 'settings' || action === 'premium') {
    toast('Coming soon');
  }
}
function importJson(e) {
  const file = e.target.files[0]; if (!file) return;
  const reader = new FileReader();
  reader.onload = () => {
    try {
      const data = JSON.parse(reader.result);
      if (!Array.isArray(data.transactions)) throw new Error('bad file');
      state.transactions = data.transactions;
      state.customers = data.customers || [];
      state.business = Object.assign({}, DEFAULT_BUSINESS, data.business || {});
      if (state.business.name === 'Shivam Traders') state.business.name = DEFAULT_BUSINESS.name;
      hydrateTransactionPhones();
      save();
      toast('Data imported');
      renderView(currentView);
    } catch (err) {
      alert('Import failed: ' + err.message);
    }
  };
  reader.readAsText(file);
  e.target.value = '';
}
