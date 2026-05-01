const STORAGE_KEY = 'sm_app_v1';

const sampleBillBooks = [
  { name: 'SALES BOOK 2025-26', type: 'Sales', used: 88, total: 100, status: 'Low Stock' },
  { name: 'PURCHASE BOOK MAY', type: 'Purchase', used: 64, total: 100, status: 'Healthy' },
  { name: 'RENTAL BOOK Q1', type: 'Hire Out', used: 42, total: 75, status: 'Healthy' },
  { name: 'ADVANCE RECEIPTS', type: 'Receipts', used: 26, total: 50, status: 'Watch' },
  { name: 'E-WAY RECORDS', type: 'Logistics', used: 18, total: 80, status: 'Healthy' },
  { name: 'DUE PAYMENT BOOK', type: 'Collections', used: 71, total: 90, status: 'Watch' }
];

const fallbackParties = [
  { name: 'Raj Traders', phone: '98765 43210', amount: 8500 },
  { name: 'Metro Hardware', phone: '98765 01003', amount: 7000 },
  { name: 'Nexus Office', phone: '98765 01006', amount: 5000 },
  { name: 'Blue Star Clinic', phone: '98765 01011', amount: 9000 }
];

const fallbackInvoices = [
  { billNo: 'INV12560', customerName: 'Raj Traders', totalAmount: 8500, paymentMethod: 'UPI', date: Date.now() },
  { billNo: 'INV12559', customerName: 'Metro Hardware', totalAmount: 7000, paymentMethod: 'Cash', date: Date.now() },
  { billNo: 'INV12558', customerName: 'Purchase Book MAY', totalAmount: 12400, paymentMethod: 'NEFT', date: Date.now() },
  { billNo: 'INV12557', customerName: 'Royal Furnishings', totalAmount: 10000, paymentMethod: 'UPI', date: Date.now() }
];

const sampleInsights = [
  ['Low bill book stock', 'Sales Book 2025-26 has only 12 bills left.'],
  ['Top customer', 'Raj Traders generated highest revenue this month.'],
  ['Payment pattern', 'UPI payments increased by 22% this week.']
];

const sampleActivity = [
  'New bill book SALES BOOK 2025-26 created',
  'Invoice #INV12560 generated',
  'Raj Traders payment received ₹8,500',
  'Purchase Book MAY updated'
];

const titles = {
  dashboard: ['AI-Powered Dashboard', 'Smart overview of your bill book business'],
  'bill-books': ['Bill Books', 'Monitor series, stock, and billing continuity'],
  parties: ['Parties', 'Customers and suppliers in one clean view'],
  invoices: ['Invoices', 'Recent invoice and payment activity'],
  settings: ['Settings', 'Business profile and local app preferences']
};

let state = { transactions: [], customers: [], business: {} };
let currentView = 'dashboard';

document.addEventListener('DOMContentLoaded', () => {
  loadState();
  renderAll();
  wireEvents();

  registerServiceWorker();
});

function registerServiceWorker() {
  if (!('serviceWorker' in navigator)) return;

  let refreshed = false;
  navigator.serviceWorker.addEventListener('controllerchange', () => {
    if (refreshed) return;
    refreshed = true;
    window.location.reload();
  });

  navigator.serviceWorker.register('./sw.js')
    .then(reg => reg.update())
    .catch(() => {});
}

function loadState() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return;
    const parsed = JSON.parse(raw);
    state = {
      transactions: Array.isArray(parsed.transactions) ? parsed.transactions : [],
      customers: Array.isArray(parsed.customers) ? parsed.customers : [],
      business: parsed.business || {}
    };
  } catch (error) {
    console.warn('Unable to load local data', error);
  }
}

function wireEvents() {
  document.querySelectorAll('[data-view]').forEach(button => {
    button.addEventListener('click', () => showView(button.dataset.view));
  });

  document.getElementById('global-search').addEventListener('input', applySearch);
  document.getElementById('mobile-menu').addEventListener('click', openDrawer);
  document.getElementById('drawer-backdrop').addEventListener('click', closeDrawer);
  document.querySelectorAll('[data-open-ai]').forEach(button => button.addEventListener('click', openAi));
  document.getElementById('ai-close').addEventListener('click', closeAi);
  document.getElementById('ask-ai').addEventListener('click', answerAi);
  const createBook = document.getElementById('create-book');
  if (createBook) createBook.addEventListener('click', () => toast('New bill book flow ready'));
  document.getElementById('create-book-secondary').addEventListener('click', () => toast('New series flow ready'));
  document.getElementById('new-invoice').addEventListener('click', () => toast('Invoice creator can be wired next'));
  document.getElementById('clear-search').addEventListener('click', () => {
    document.getElementById('global-search').value = '';
    applySearch();
  });
  document.getElementById('export-data').addEventListener('click', exportData);
}

function showView(name) {
  currentView = name;
  const [title, subtitle] = titles[name] || titles.dashboard;
  document.getElementById('view-title').textContent = title;
  document.getElementById('view-subtitle').textContent = subtitle;

  document.querySelectorAll('.view-panel').forEach(panel => {
    panel.classList.toggle('hidden', panel.id !== `view-${name}`);
  });
  document.querySelectorAll('.nav-item').forEach(item => {
    item.classList.toggle('active', item.dataset.view === name);
  });

  closeDrawer();
  applySearch();
}

function renderAll() {
  renderStats();
  renderUsageChart();
  renderInsights();
  renderActivity();
  renderBillBooks();
  renderParties();
  renderInvoices();
  renderProfile();
}

function renderStats() {
  const invoiceCount = invoiceTransactions().length;
  const partyCount = state.customers.length;
  const billBookCount = state.billBooks?.length || 128;
  const activeSeries = Math.min(86, Math.max(1, sampleBillBooks.filter(book => book.used < book.total).length + 80));

  setText('stat-books', formatNumber(billBookCount));
  setText('stat-series', formatNumber(activeSeries));
  setText('stat-parties', formatNumber(Math.max(partyCount, 532)));
  setText('stat-invoices', formatNumber(Math.max(invoiceCount, 24560)));

  const lowestRemaining = Math.min(...sampleBillBooks.map(book => book.total - book.used));
  setText('days-left', `${Math.max(1, Math.min(5, lowestRemaining))} days`);
}

function renderUsageChart() {
  const chart = document.getElementById('usage-chart');
  const monthlyValues = monthlyInvoiceValues();
  const values = monthlyValues.some(Boolean)
    ? monthlyValues.map(value => Math.max(24, Math.round(value)))
    : [30, 55, 45, 75, 60, 90, 70, 100, 85, 65, 80, 95];

  chart.innerHTML = values.map(height => `
    <div class="bar-slot">
      <div class="bar-fill" style="height:${Math.min(100, Math.max(10, height))}%"></div>
    </div>
  `).join('');
}

function renderInsights() {
  const list = document.getElementById('insight-list');
  list.innerHTML = sampleInsights.map(([title, desc]) => `
    <article class="insight-card searchable-item" data-search="${escapeAttr(`${title} ${desc}`)}">
      <div>
        <svg viewBox="0 0 24 24" aria-hidden="true"><path d="m21.73 18-8-14a2 2 0 0 0-3.46 0l-8 14A2 2 0 0 0 4 21h16a2 2 0 0 0 1.73-3Z"/><path d="M12 9v4"/><path d="M12 17h.01"/></svg>
        <div>
          <h4>${escapeHtml(title)}</h4>
          <p>${escapeHtml(desc)}</p>
        </div>
      </div>
    </article>
  `).join('');
}

function renderActivity() {
  const list = document.getElementById('activity-list');
  const recent = invoiceTransactions().slice(0, 4).map(tx =>
    `${tx.billNo || 'Invoice'} generated for ${tx.customerName || 'Walk-in Party'}`
  );
  const activity = recent.length ? recent : sampleActivity;

  document.getElementById('activity-count').textContent = `${activity.length} updates`;
  list.innerHTML = activity.map(item => `
    <div class="activity-row searchable-item" data-search="${escapeAttr(item)}">
      <p>${escapeHtml(item)}</p>
      <span>Today</span>
    </div>
  `).join('');
}

function renderBillBooks() {
  const list = document.getElementById('billbook-list');
  list.innerHTML = sampleBillBooks.map(book => {
    const percent = Math.round((book.used / book.total) * 100);
    const remaining = book.total - book.used;
    const statusClass = remaining <= 12 ? 'danger' : remaining <= 22 ? 'warning' : '';
    return `
      <article class="book-card searchable-item" data-search="${escapeAttr(`${book.name} ${book.type} ${book.status}`)}">
        <div class="book-top">
          <div>
            <h4>${escapeHtml(book.name)}</h4>
            <span class="book-meta">${escapeHtml(book.type)}</span>
          </div>
          <span class="status-pill ${statusClass}">${escapeHtml(book.status)}</span>
        </div>
        <div class="progress-track">
          <div class="progress-fill" style="width:${percent}%"></div>
        </div>
        <div class="book-meta">
          <span>${book.used}/${book.total} used</span>
          <span>${remaining} left</span>
        </div>
      </article>
    `;
  }).join('');
}

function renderParties() {
  const list = document.getElementById('party-list');
  const parties = state.customers.length
    ? state.customers.slice(0, 24).map(customer => ({
        name: customer.name || 'Unnamed Party',
        phone: customer.phone || 'No phone',
        amount: totalForCustomer(customer.name)
      }))
    : fallbackParties;

  if (!parties.length) {
    list.innerHTML = '<div class="empty-state">No parties found.</div>';
    return;
  }

  list.innerHTML = parties.map(party => `
    <article class="data-row searchable-item" data-search="${escapeAttr(`${party.name} ${party.phone}`)}">
      <div class="data-main">
        <div class="data-icon">${escapeHtml(initials(party.name))}</div>
        <div>
          <h4>${escapeHtml(party.name)}</h4>
          <p>${escapeHtml(party.phone)}</p>
        </div>
      </div>
      <strong class="data-amount">₹ ${formatMoney(party.amount)}</strong>
    </article>
  `).join('');
}

function renderInvoices() {
  const list = document.getElementById('invoice-list');
  const invoices = invoiceTransactions().slice(0, 24);
  const rows = invoices.length ? invoices : fallbackInvoices;

  list.innerHTML = rows.map(invoice => `
    <article class="data-row searchable-item" data-search="${escapeAttr(`${invoice.billNo} ${invoice.customerName} ${invoice.paymentMethod}`)}">
      <div class="data-main">
        <div class="data-icon">#</div>
        <div>
          <h4>${escapeHtml(invoice.billNo || 'Invoice')}</h4>
          <p>${escapeHtml(invoice.customerName || 'Walk-in Party')} · ${escapeHtml(invoice.paymentMethod || 'Cash')}</p>
        </div>
      </div>
      <strong class="data-amount">₹ ${formatMoney(invoice.totalAmount || 0)}</strong>
    </article>
  `).join('');
}

function renderProfile() {
  const businessName = state.business.name || 'BillX Neo';
  const phone = state.business.phone || 'AI Bill Book System';
  setText('business-name', businessName);
  setText('business-phone', phone);
  setText('profile-avatar', initials(businessName).slice(0, 1) || 'B');
}

function applySearch() {
  const query = document.getElementById('global-search').value.trim().toLowerCase();
  const currentPanel = document.getElementById(`view-${currentView}`);
  if (!currentPanel) return;

  currentPanel.querySelectorAll('.searchable-item').forEach(item => {
    const text = `${item.dataset.search || ''} ${item.textContent || ''}`.toLowerCase();
    item.classList.toggle('hidden', Boolean(query) && !text.includes(query));
  });
}

function invoiceTransactions() {
  return state.transactions
    .filter(tx => tx.type === 'SALE' || tx.billNo || tx.totalAmount)
    .sort((a, b) => Number(b.date || b.createdAt || 0) - Number(a.date || a.createdAt || 0));
}

function monthlyInvoiceValues() {
  const now = new Date();
  const values = Array.from({ length: 12 }, () => 0);
  invoiceTransactions().forEach(tx => {
    const date = new Date(Number(tx.date || tx.createdAt || Date.now()));
    if (date.getFullYear() === now.getFullYear()) {
      values[date.getMonth()] += Number(tx.totalAmount) || 0;
    }
  });
  const max = Math.max(0, ...values);
  return max ? values.map(value => Math.round((value / max) * 100)) : values;
}

function totalForCustomer(name) {
  const key = String(name || '').toLowerCase();
  return state.transactions
    .filter(tx => String(tx.customerName || '').toLowerCase() === key)
    .reduce((sum, tx) => sum + (Number(tx.totalAmount) || 0), 0);
}

function openDrawer() {
  document.getElementById('sidebar').classList.add('open');
  document.getElementById('drawer-backdrop').classList.remove('hidden');
}

function closeDrawer() {
  document.getElementById('sidebar').classList.remove('open');
  document.getElementById('drawer-backdrop').classList.add('hidden');
}

function openAi() {
  document.getElementById('ai-modal').classList.remove('hidden');
  document.getElementById('ai-question').focus();
}

function closeAi() {
  document.getElementById('ai-modal').classList.add('hidden');
}

function answerAi() {
  const question = document.getElementById('ai-question').value.trim();
  const answer = question
    ? 'Based on current activity, prioritize Sales Book 2025-26 and follow up on high-value unpaid invoices first.'
    : 'Ask a billing question and I will summarize the next best action.';
  document.getElementById('ai-answer').textContent = answer;
}

function exportData() {
  const payload = {
    exportedAt: new Date().toISOString(),
    source: 'BillX Neo local dashboard',
    state
  };
  const blob = new Blob([JSON.stringify(payload, null, 2)], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement('a');
  anchor.href = url;
  anchor.download = `billx-neo-backup-${new Date().toISOString().slice(0, 10)}.json`;
  document.body.appendChild(anchor);
  anchor.click();
  anchor.remove();
  URL.revokeObjectURL(url);
  toast('Local data exported');
}

function toast(message) {
  const el = document.getElementById('toast');
  el.textContent = message;
  el.classList.remove('hidden');
  clearTimeout(toast.timer);
  toast.timer = setTimeout(() => el.classList.add('hidden'), 2200);
}

function setText(id, value) {
  const el = document.getElementById(id);
  if (el) el.textContent = value;
}

function initials(value) {
  return String(value || '')
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map(part => part[0].toUpperCase())
    .join('') || '?';
}

function formatNumber(value) {
  return Number(value || 0).toLocaleString('en-IN');
}

function formatMoney(value) {
  return Number(value || 0).toLocaleString('en-IN', {
    maximumFractionDigits: Number(value) % 1 === 0 ? 0 : 2
  });
}

function escapeHtml(value) {
  return String(value ?? '').replace(/[&<>"']/g, char => ({
    '&': '&amp;',
    '<': '&lt;',
    '>': '&gt;',
    '"': '&quot;',
    "'": '&#39;'
  })[char]);
}

function escapeAttr(value) {
  return escapeHtml(value).replace(/`/g, '&#96;');
}
