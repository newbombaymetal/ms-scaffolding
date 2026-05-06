const STORAGE_KEY = 'sm_app_v1';
const APP_VERSION = '67';
const UPDATE_RELOAD_KEY = 'nbm_update_reload_version';
const UPDATE_CHECK_INTERVAL = 5 * 60 * 1000;
const UPDATE_RETRY_DELAY = 30 * 1000;
const GST_LOOKUP_ENDPOINT = window.NBM_GST_LOOKUP_ENDPOINT || 'https://api.codetabs.com/v1/proxy/?quest=https%3A%2F%2Fgst.jamku.app%2Fgstin%2F{gstin}';
const DEFAULT_QUOTATION_PDF = './assets/nbm-quotation-template.pdf';
const DEFAULT_QUOTATION_NAME = 'NBM Quotation Paper-nbm.pdf';
let lockedPageScrollY = 0;
let gstFetchInProgress = false;
let quotationPdfFile = null;
let quotationPdfBytes = null;
let quotationPdfName = '';
let quotationDownloadUrl = '';
let quotationPrintPreviewUrl = '';
let quotationPreviewScale = 0;
let quotationPreviewPageSize = { width: 0, height: 0 };
let quotationRenderToken = 0;
let quotationTemplateLoadStarted = false;
let quotationResizeTimer = null;
let quotationGuidesVisible = false;
let quotationSavedRange = null;
let quotationActiveEditorId = 'quotation-write-text';
let quotationEditorCounter = 1;

const sampleBillBooks = [
  { name: 'SALES BOOK 2025-26', type: 'Sales', used: 88, total: 100, status: 'Low Stock' },
  { name: 'PURCHASE BOOK MAY', type: 'Purchase', used: 64, total: 100, status: 'Healthy' },
  { name: 'RENTAL BOOK Q1', type: 'Hire Out', used: 42, total: 75, status: 'Healthy' },
  { name: 'ADVANCE RECEIPTS', type: 'Receipts', used: 26, total: 50, status: 'Watch' },
  { name: 'E-WAY RECORDS', type: 'Logistics', used: 18, total: 80, status: 'Healthy' },
  { name: 'DUE PAYMENT BOOK', type: 'Collections', used: 71, total: 90, status: 'Watch' }
];

const fallbackStockItems = [
  { name: 'MS Pipe', kg: 1840 },
  { name: 'GI Pipe', kg: 1260 },
  { name: 'Channel', kg: 920 },
  { name: 'Sheet', kg: 640 }
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
  dashboard: ['NBM', 'New Bombay Metal'],
  'bill-books': ['NBM', 'New Bombay Metal'],
  parties: ['NBM', 'New Bombay Metal'],
  items: ['NBM', 'New Bombay Metal'],
  'quotation-enquiry': ['NBM', 'New Bombay Metal'],
  invoices: ['NBM', 'New Bombay Metal'],
  settings: ['NBM', 'New Bombay Metal']
};

let state = { transactions: [], customers: [], business: {} };
let currentView = 'dashboard';
let deferredInstallPrompt = null;
let serviceWorkerRegistration = null;

document.addEventListener('DOMContentLoaded', () => {
  loadState();
  renderAll();
  wireEvents();
  wireInstallPrompt();
  showInitialView();

  registerServiceWorker();
});

function registerServiceWorker() {
  wireFreshnessChecks();

  if (!('serviceWorker' in navigator)) return;

  let refreshed = false;
  navigator.serviceWorker.addEventListener('controllerchange', () => {
    if (refreshed) return;
    refreshed = true;
    reloadForUpdate(APP_VERSION);
  });
  navigator.serviceWorker.addEventListener('message', event => {
    if (event.data?.type === 'APP_UPDATED' && event.data.version !== APP_VERSION) {
      reloadForUpdate(event.data.version);
    }
  });

  navigator.serviceWorker.register('./sw.js')
    .then(reg => {
      serviceWorkerRegistration = reg;
      window.setTimeout(() => reg.update(), 3000);
      watchServiceWorker(reg);
    })
    .catch(() => {});
}

function watchServiceWorker(reg) {
  if (!reg) return;
  if (reg.waiting) activateWaitingWorker(reg.waiting);

  reg.addEventListener('updatefound', () => {
    const worker = reg.installing;
    if (!worker) return;
    worker.addEventListener('statechange', () => {
      if (worker.state === 'installed' && navigator.serviceWorker.controller) {
        activateWaitingWorker(worker);
      }
    });
  });
}

function activateWaitingWorker(worker) {
  worker.postMessage({ type: 'SKIP_WAITING' });
}

function wireFreshnessChecks() {
  window.setTimeout(checkForFreshBuild, 2500);
  window.addEventListener('focus', checkForFreshBuild);
  window.addEventListener('online', checkForFreshBuild);
  document.addEventListener('visibilitychange', () => {
    if (!document.hidden) checkForFreshBuild();
  });
  window.setInterval(checkForFreshBuild, UPDATE_CHECK_INTERVAL);
}

async function checkForFreshBuild() {
  try {
    const build = await fetchBuildVersion();
    const latestVersion = String(build.version || '').trim();
    if (!latestVersion || latestVersion === APP_VERSION) return;

    await serviceWorkerRegistration?.update?.();
    if (serviceWorkerRegistration?.waiting) {
      activateWaitingWorker(serviceWorkerRegistration.waiting);
      return;
    }

    reloadForUpdate(latestVersion);
  } catch (error) {
    // Offline starts should keep using the cached app.
  }
}

async function fetchBuildVersion() {
  const response = await fetch(`./version.json?ts=${Date.now()}`, {
    cache: 'no-store',
    headers: { 'Cache-Control': 'no-cache' }
  });
  return response.ok ? response.json() : {};
}

function reloadForUpdate(version) {
  const nextVersion = String(version || APP_VERSION);
  const [previousVersion, previousTime] = String(sessionStorage.getItem(UPDATE_RELOAD_KEY) || '').split(':');
  if (previousVersion === nextVersion && Date.now() - Number(previousTime || 0) < UPDATE_RETRY_DELAY) return;
  sessionStorage.setItem(UPDATE_RELOAD_KEY, `${nextVersion}:${Date.now()}`);

  try {
    const url = new URL(window.location.href);
    url.searchParams.set('refresh', nextVersion);
    window.location.replace(url);
  } catch (error) {
    window.location.reload();
  }
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

function saveState() {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
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
  document.getElementById('add-item').addEventListener('click', () => toast('Add item flow ready'));
  document.getElementById('quotation-pdf').addEventListener('change', handleQuotationPdf);
  document.getElementById('quotation-paper').addEventListener('pointerdown', handleQuotationPaperPointerDown);
  const quotationEditor = document.getElementById('quotation-write-text');
  setupQuotationEditor(quotationEditor);
  document.addEventListener('selectionchange', handleQuotationSelectionChange);
  document.getElementById('quotation-page-number').addEventListener('input', handleQuotationPageChange);
  document.getElementById('quotation-text-color').addEventListener('input', handleQuotationColorChange);
  document.querySelectorAll('[data-quotation-action]').forEach(button => button.addEventListener('click', handleQuotationAction));
  document.querySelectorAll('[data-quotation-toggle]').forEach(button => button.addEventListener('click', handleQuotationToggle));
  document.querySelectorAll('[data-quotation-align]').forEach(button => button.addEventListener('click', handleQuotationAlign));
  document.querySelectorAll('button[data-quotation-action], button[data-quotation-toggle], button[data-quotation-align]').forEach(button => {
    button.addEventListener('pointerdown', preserveQuotationSelectionOnTool);
  });
  document.getElementById('quotation-controls-toggle').addEventListener('click', toggleQuotationControls);
  document.getElementById('write-quotation-pdf').addEventListener('click', writeQuotationPdf);
  document.getElementById('print-quotation-pdf').addEventListener('click', openQuotationPrintPreview);
  window.addEventListener('resize', scheduleQuotationPreviewRender);
  document.getElementById('new-invoice').addEventListener('click', () => toast('Invoice creator can be wired next'));
  document.getElementById('add-party').addEventListener('click', openPartyForm);
  document.getElementById('party-close').addEventListener('click', closePartyForm);
  document.getElementById('party-form').addEventListener('submit', savePartyFromForm);
  document.getElementById('party-gst').addEventListener('input', handleGstInput);
  document.getElementById('party-gst').addEventListener('blur', maybeFetchGstDetails);
  document.getElementById('fetch-gst').addEventListener('click', fetchGstDetails);
  document.getElementById('clear-search').addEventListener('click', () => {
    document.getElementById('global-search').value = '';
    applySearch();
  });
  document.getElementById('export-data').addEventListener('click', exportData);
}

function showInitialView() {
  const params = new URLSearchParams(window.location.search);
  const view = params.get('view');
  showView(titles[view] ? view : currentView);
}

function showView(name) {
  currentView = name;
  document.body.classList.toggle('compact-quotation-view', name === 'quotation-enquiry');
  document.body.classList.toggle('quotation-controls-hidden', false);
  setText('quotation-controls-toggle', 'Hide Format');
  const [title, subtitle] = titles[name] || titles.dashboard;
  setText('view-title', title);
  setText('view-subtitle', subtitle);

  document.querySelectorAll('.view-panel').forEach(panel => {
    panel.classList.toggle('hidden', panel.id !== `view-${name}`);
  });
  document.querySelectorAll('.nav-item').forEach(item => {
    item.classList.toggle('active', item.dataset.view === name);
  });

  closeDrawer();
  applySearch();
  updateViewUrl(name);
  if (name === 'quotation-enquiry') ensureQuotationTemplate();
}

function updateViewUrl(name) {
  if (!window.history?.replaceState) return;
  try {
    const url = new URL(window.location.href);
    if (url.searchParams.get('view') === name) return;
    url.searchParams.set('view', name);
    window.history.replaceState(null, '', url);
  } catch (error) {
    // file:// previews can reject URL updates in some browsers.
  }
}

function renderAll() {
  renderPaymentSummary();
  renderStats();
  renderStockChart();
  renderUsageChart();
  renderInsights();
  renderActivity();
  renderBillBooks();
  renderParties();
  renderItems();
  renderInvoices();
  renderProfile();
}

function renderPaymentSummary() {
  const toPay = payableSummary();
  const toCollect = receivableSummary();

  setText('to-pay-amount', formatMoney(toPay.amount));
  setText('to-collect-amount', formatMoney(toCollect.amount));
  setText('to-pay-count', paymentCountLabel(toPay.count, 'payment'));
  setText('to-collect-count', paymentCountLabel(toCollect.count, 'collection'));
}

function renderStats() {
  const invoiceCount = invoiceTransactions().length;
  const partyCount = state.customers.length;
  const activeSeries = Math.min(86, Math.max(1, sampleBillBooks.filter(book => book.used < book.total).length + 80));

  setText('stat-series', formatNumber(activeSeries));
  setText('stat-parties', formatNumber(Math.max(partyCount, 532)));
  setText('stat-invoices', formatNumber(Math.max(invoiceCount, 24560)));

  const lowestRemaining = Math.min(...sampleBillBooks.map(book => book.total - book.used));
  setText('days-left', `${Math.max(1, Math.min(5, lowestRemaining))} days`);
}

function payableSummary() {
  const payableTypes = new Set(['PURCHASE', 'HIRE_IN', 'EXPENSE', 'TO_PAY', 'PAYABLE']);
  const rows = state.transactions.filter(tx => {
    const type = String(tx.type || '').toUpperCase();
    const status = String(tx.paymentStatus || tx.status || '').toUpperCase();
    return payableTypes.has(type) && status !== 'PAID' && status !== 'RECEIVED';
  });

  return {
    amount: rows.reduce((sum, tx) => sum + transactionBalance(tx), 0),
    count: rows.length
  };
}

function receivableSummary() {
  const rows = state.transactions.filter(isDueSale);
  return {
    amount: rows.reduce((sum, tx) => sum + dueOutstandingAmount(tx), 0),
    count: rows.filter(tx => dueOutstandingAmount(tx) > 0).length
  };
}

function isDueSale(tx) {
  const type = String(tx.type || '').toUpperCase();
  const status = String(tx.paymentStatus || tx.status || '').toUpperCase();
  return ['SALE', 'HIRE_OUT', 'INVOICE'].includes(type) && ['DUE', 'UNPAID', 'PARTIAL', 'PENDING'].includes(status);
}

function dueOutstandingAmount(sale) {
  const total = Number(sale.totalAmount ?? sale.amount ?? sale.invoiceValue) || 0;
  const paid = state.transactions
    .filter(tx => paymentMatchesDueSale(tx, sale))
    .reduce((sum, tx) => sum + (Number(tx.totalAmount ?? tx.amount ?? tx.paidAmount) || 0), 0);
  return Math.max(0, total - paid);
}

function paymentMatchesDueSale(payment, sale) {
  const type = String(payment.type || '').toUpperCase();
  if (!['PAYMENT', 'RECEIPT', 'COLLECTION'].includes(type)) return false;
  if (payment.dueSourceId && payment.dueSourceId === sale.id) return true;
  if (payment.dueSourceBillNo && sale.billNo && payment.dueSourceBillNo === sale.billNo) return true;
  return payment.billNo && sale.billNo && payment.billNo === sale.billNo;
}

function transactionBalance(tx) {
  const total = Number(tx.totalAmount ?? tx.amount ?? tx.invoiceValue) || 0;
  const paid = Number(tx.paidAmount ?? tx.cashAmount ?? 0) + Number(tx.onlineAmount ?? 0);
  const status = String(tx.paymentStatus || tx.status || '').toUpperCase();
  if (['DUE', 'UNPAID', 'PARTIAL', 'PENDING'].includes(status)) {
    return Math.max(0, total - paid);
  }
  return total;
}

function paymentCountLabel(count, noun) {
  return `${count} ${noun}${count === 1 ? '' : 's'}`;
}

function renderStockChart() {
  const stockItems = stockSummaryItems();
  const totalKg = stockItems.reduce((sum, item) => sum + item.kg, 0);
  const maxKg = Math.max(1, ...stockItems.map(item => item.kg));
  const chart = document.getElementById('stock-chart');
  const legend = document.getElementById('stock-legend');

  setText('stock-total-kg', formatNumber(totalKg));
  setText('stock-item-count', `${stockItems.length} material${stockItems.length === 1 ? '' : 's'} in stock`);

  if (!chart || !legend) return;

  chart.innerHTML = stockItems.map(item => `
    <div class="stock-bar" title="${escapeAttr(`${item.name}: ${formatNumber(item.kg)} kg`)}">
      <div class="stock-bar-fill" style="height:${Math.max(12, Math.round((item.kg / maxKg) * 100))}%"></div>
    </div>
  `).join('');

  legend.innerHTML = stockItems.map(item => `
    <div>
      <span>${escapeHtml(shortStockName(item.name))}</span>
      <strong>${formatNumber(item.kg)} kg</strong>
    </div>
  `).join('');
}

function stockSummaryItems() {
  const explicit = [
    ...arrayFromState('stock'),
    ...arrayFromState('stockItems'),
    ...arrayFromState('inventory'),
    ...arrayFromState('catalog')
  ].map(normalizeStockItem).filter(item => item.kg > 0);

  const fromTransactions = stockFromTransactions();
  const merged = mergeStockItems(explicit.length ? explicit : fromTransactions);
  return (merged.length ? merged : fallbackStockItems).slice(0, 4);
}

function arrayFromState(key) {
  return Array.isArray(state[key]) ? state[key] : [];
}

function normalizeStockItem(item) {
  const name = item.name || item.productName || item.itemName || item.description || 'Material';
  const kg = Number(
    item.kg ?? item.stockKg ?? item.quantityKg ?? item.weightKg ?? item.weight ?? item.qtyKg ?? item.quantity
  ) || 0;
  return { name: String(name), kg: Math.max(0, Math.round(kg)) };
}

function stockFromTransactions() {
  const stockMap = new Map();
  state.transactions.forEach(tx => {
    const type = String(tx.type || '').toUpperCase();
    const direction = ['PURCHASE', 'HIRE_IN', 'STOCK_IN'].includes(type)
      ? 1
      : ['SALE', 'HIRE_OUT', 'STOCK_OUT'].includes(type)
        ? -1
        : 0;
    if (!direction) return;

    const items = Array.isArray(tx.items) && tx.items.length
      ? tx.items
      : [{ productName: tx.productName, quantity: tx.quantity, kg: tx.kg, weightKg: tx.weightKg }];

    items.forEach(item => {
      const normalized = normalizeStockItem(item);
      if (!normalized.name || normalized.kg <= 0) return;
      const key = normalized.name.toLowerCase();
      stockMap.set(key, {
        name: normalized.name,
        kg: Math.max(0, (stockMap.get(key)?.kg || 0) + normalized.kg * direction)
      });
    });
  });
  return Array.from(stockMap.values()).filter(item => item.kg > 0);
}

function mergeStockItems(items) {
  const stockMap = new Map();
  items.forEach(item => {
    const key = String(item.name || 'Material').toLowerCase();
    const previous = stockMap.get(key);
    stockMap.set(key, {
      name: previous?.name || item.name,
      kg: (previous?.kg || 0) + (Number(item.kg) || 0)
    });
  });
  return Array.from(stockMap.values()).sort((a, b) => b.kg - a.kg);
}

function shortStockName(name) {
  return String(name || 'Stock').replace(/\s+/g, ' ').trim().split(' ').slice(0, 2).join(' ');
}

function renderUsageChart() {
  const chart = document.getElementById('usage-chart');
  if (!chart) return;
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
        type: customer.type || customer.partyType || 'Customer',
        gstin: customer.gstin || customer.gst || '',
        pan: customer.pan || '',
        address: customer.address || '',
        shippingAddress: customer.shippingAddress || '',
        amount: totalForCustomer(customer.name)
      }))
    : fallbackParties.map(party => ({ ...party, type: 'Customer', gstin: '', pan: '', address: '', shippingAddress: '' }));

  if (!parties.length) {
    list.innerHTML = '<div class="empty-state">No parties found.</div>';
    return;
  }

  list.innerHTML = parties.map(party => `
    <article class="data-row searchable-item" data-search="${escapeAttr(`${party.name} ${party.phone} ${party.type} ${party.gstin} ${party.pan} ${party.address} ${party.shippingAddress}`)}">
      <div class="data-main">
        <div class="data-icon">${escapeHtml(initials(party.name))}</div>
        <div>
          <div class="party-title-line">
            <h4>${escapeHtml(party.name)}</h4>
            <span class="status-pill">${escapeHtml(party.type)}</span>
          </div>
          <p class="party-details">${escapeHtml(compactPartyDetails(party))}</p>
        </div>
      </div>
      <strong class="data-amount">₹ ${formatMoney(party.amount)}</strong>
    </article>
  `).join('');
}

function renderItems() {
  const list = document.getElementById('item-list');
  const items = stockSummaryItems();

  if (!items.length) {
    list.innerHTML = '<div class="empty-state">No items found.</div>';
    return;
  }

  list.innerHTML = items.map(item => `
    <article class="data-row searchable-item" data-search="${escapeAttr(`${item.name} ${item.kg} kg stock item material`)}">
      <div class="data-main">
        <div class="data-icon">${escapeHtml(initials(item.name))}</div>
        <div>
          <h4>${escapeHtml(item.name)}</h4>
          <p>Stock item · ${formatNumber(item.kg)} kg available</p>
        </div>
      </div>
      <strong class="data-amount">${formatNumber(item.kg)} kg</strong>
    </article>
  `).join('');
}

async function ensureQuotationTemplate() {
  if (quotationPdfBytes || quotationTemplateLoadStarted) {
    updateQuotationLivePreview();
    return;
  }

  quotationTemplateLoadStarted = true;
  resetQuotationPreview('Quotation paper loading...');
  setText('quotation-file-name', 'Loading quotation paper...');
  setText('quotation-status', 'Loading quotation paper...');

  try {
    const response = await fetch(`${DEFAULT_QUOTATION_PDF}?v=${APP_VERSION}`, { cache: 'no-store' });
    if (!response.ok) throw new Error('Template unavailable.');
    quotationPdfBytes = await response.arrayBuffer();
    quotationPdfFile = null;
    quotationPdfName = DEFAULT_QUOTATION_NAME;
    setText('quotation-file-name', DEFAULT_QUOTATION_NAME);
    await renderQuotationPreview();
    setText('quotation-status', 'Quotation paper ready.');
  } catch (error) {
    console.warn(error);
    resetQuotationPreview('Upload a quotation PDF to preview.');
    setText('quotation-file-name', 'No PDF selected');
    setText('quotation-status', 'Upload a PDF to preview.');
  } finally {
    quotationTemplateLoadStarted = false;
  }
}

async function handleQuotationPdf(event) {
  const file = event.target.files?.[0] || null;
  if (!file) return;

  quotationPdfFile = file;
  quotationPdfName = file.name;
  quotationPdfBytes = null;
  markQuotationDirty();
  resetQuotationPreview('Loading PDF preview...');
  setText('quotation-file-name', file.name);
  setText('quotation-status', 'Loading PDF preview...');

  try {
    quotationPdfBytes = await file.arrayBuffer();
    await renderQuotationPreview();
    setText('quotation-status', 'PDF selected.');
  } catch (error) {
    console.error(error);
    resetQuotationPreview('Unable to preview this PDF.');
    setText('quotation-status', 'Unable to preview this PDF.');
  }
}

function handleQuotationEditorChange() {
  markQuotationDirty();
  refreshQuotationToolbarState();
  updateQuotationLivePreview();
  keepActiveQuotationTextVisible();
}

function handleQuotationPageChange() {
  markQuotationDirty();
  renderQuotationPreview();
}

function handleQuotationColorChange(event) {
  runQuotationCommand('foreColor', event.target.value || '#111827');
}

function toggleQuotationControls() {
  const hidden = document.body.classList.toggle('quotation-controls-hidden');
  setText('quotation-controls-toggle', hidden ? 'Show Format' : 'Hide Format');
  window.setTimeout(scheduleQuotationPreviewRender, 60);
}

function keepActiveQuotationTextVisible() {
  const editor = quotationEditorElement();
  if (!editor || document.activeElement !== editor) return;
  window.requestAnimationFrame(() => {
    editor.scrollIntoView({ block: 'nearest', inline: 'nearest' });
  });
}

function setupQuotationEditor(editor) {
  if (!editor || editor.dataset.quotationBound === 'true') return;
  editor.dataset.quotationBound = 'true';
  editor.dataset.blockId = editor.dataset.blockId || editor.id || `quotation-write-text-${quotationEditorCounter}`;
  editor.dataset.fontSize = editor.dataset.fontSize || String(safeNumber('quotation-font-size', 48));
  editor.dataset.boxX = editor.dataset.boxX || document.getElementById('quotation-box-x')?.value || '150';
  editor.dataset.boxY = editor.dataset.boxY || document.getElementById('quotation-box-y')?.value || '761';
  editor.dataset.boxWidth = editor.dataset.boxWidth || document.getElementById('quotation-box-width')?.value || '2270';
  editor.dataset.boxHeight = editor.dataset.boxHeight || document.getElementById('quotation-box-height')?.value || '2224';
  editor.addEventListener('input', handleQuotationEditorChange);
  editor.addEventListener('focus', () => setActiveQuotationEditor(editor, true));
  editor.addEventListener('pointerdown', () => setActiveQuotationEditor(editor, true));
  editor.addEventListener('keyup', saveQuotationSelection);
  editor.addEventListener('pointerup', saveQuotationSelection);
  editor.addEventListener('blur', saveQuotationSelection);
}

function quotationEditorElements() {
  return Array.from(document.querySelectorAll('.quotation-live-input'));
}

function quotationEditorElement() {
  return document.getElementById(quotationActiveEditorId) || document.getElementById('quotation-write-text');
}

function quotationEditorFromNode(node) {
  const element = node?.nodeType === Node.ELEMENT_NODE ? node : node?.parentElement;
  return element?.closest?.('.quotation-live-input') || null;
}

function setActiveQuotationEditor(editor, keepSelection = false) {
  if (!editor) return;
  setupQuotationEditor(editor);
  quotationActiveEditorId = editor.id;
  if (!keepSelection) quotationSavedRange = null;
  syncQuotationBoxInputsFromEditor(editor);
  refreshQuotationToolbarState();
}

function createQuotationEditorBlock() {
  quotationEditorCounter += 1;
  const editor = document.createElement('div');
  editor.className = 'quotation-live-input';
  editor.id = `quotation-write-text-${quotationEditorCounter}`;
  editor.contentEditable = 'true';
  editor.setAttribute('role', 'textbox');
  editor.setAttribute('aria-label', 'Type on quotation paper');
  editor.dataset.fontSize = String(safeNumber('quotation-font-size', 48));
  const paper = document.getElementById('quotation-paper');
  const guideLayer = document.getElementById('quotation-guide-layer');
  paper.insertBefore(editor, guideLayer);
  setupQuotationEditor(editor);
  setActiveQuotationEditor(editor);
  return editor;
}

function quotationEditorFontSize(editor = quotationEditorElement()) {
  return clampNumber(Number(editor?.dataset.fontSize) || safeNumber('quotation-font-size', 48), 10, 180);
}

function syncQuotationBoxInputsFromEditor(editor = quotationEditorElement()) {
  if (!editor) return;
  document.getElementById('quotation-font-size').value = quotationEditorFontSize(editor);
  document.getElementById('quotation-box-x').value = Math.round(Number(editor.dataset.boxX) || 150);
  document.getElementById('quotation-box-y').value = Math.round(Number(editor.dataset.boxY) || 761);
  document.getElementById('quotation-box-width').value = Math.round(Number(editor.dataset.boxWidth) || 2270);
  document.getElementById('quotation-box-height').value = Math.round(Number(editor.dataset.boxHeight) || 2224);
}

function setQuotationEditorBox(editor, box) {
  if (!editor) return;
  editor.dataset.boxX = String(Math.round(box.x));
  editor.dataset.boxY = String(Math.round(box.y));
  editor.dataset.boxWidth = String(Math.round(box.width));
  editor.dataset.boxHeight = String(Math.round(box.height));
  if (editor.id === quotationActiveEditorId) syncQuotationBoxInputsFromEditor(editor);
}

function quotationEditorBox(editor, pageWidth = quotationPreviewPageSize.width, pageHeight = quotationPreviewPageSize.height) {
  const fontSize = quotationEditorFontSize(editor);
  const x = clampNumber(Number(editor?.dataset.boxX) || safeNumber('quotation-box-x', 150), 0, Math.max(0, pageWidth - 40));
  const y = clampNumber(Number(editor?.dataset.boxY) || safeNumber('quotation-box-y', 761), 0, Math.max(0, pageHeight - fontSize));
  const width = clampNumber(Number(editor?.dataset.boxWidth) || safeNumber('quotation-box-width', 2270), 40, Math.max(40, pageWidth - x - 12));
  const height = clampNumber(Number(editor?.dataset.boxHeight) || safeNumber('quotation-box-height', 2224), fontSize * 1.5, Math.max(fontSize * 1.5, pageHeight - y - 12));
  return { x, y, width, height };
}

function quotationEditorText(editor = quotationEditorElement()) {
  return (editor?.innerText || editor?.textContent || '')
    .replace(/\u00a0/g, ' ')
    .replace(/\n$/, '');
}

function quotationEditorHasText(editor = quotationEditorElement()) {
  return quotationEditorText(editor).trim().length > 0;
}

function quotationAllText() {
  return quotationEditorElements().map(editor => quotationEditorText(editor)).join('\n').trim();
}

function quotationHasTextSelection(editor = quotationEditorElement()) {
  const selection = window.getSelection?.();
  if (!editor || !selection || !selection.rangeCount || selection.isCollapsed) return false;
  return editor.contains(selection.anchorNode) && editor.contains(selection.focusNode);
}

function selectionBelongsToQuotationEditor() {
  const selection = window.getSelection?.();
  if (!selection || !selection.rangeCount) return false;
  const anchorEditor = quotationEditorFromNode(selection.anchorNode);
  const focusEditor = quotationEditorFromNode(selection.focusNode);
  if (!anchorEditor || anchorEditor !== focusEditor) return false;
  setActiveQuotationEditor(anchorEditor, true);
  return true;
}

function saveQuotationSelection() {
  const selection = window.getSelection?.();
  if (!selectionBelongsToQuotationEditor() || !selection?.rangeCount) return;
  quotationSavedRange = selection.getRangeAt(0).cloneRange();
}

function restoreQuotationSelection() {
  const editor = quotationEditorElement();
  if (!editor) return;
  editor.focus({ preventScroll: true });
  const selection = window.getSelection?.();
  if (!selection) return;
  if (quotationSavedRange && editor.contains(quotationSavedRange.commonAncestorContainer)) {
    selection.removeAllRanges();
    selection.addRange(quotationSavedRange);
    return;
  }
  const range = document.createRange();
  range.selectNodeContents(editor);
  range.collapse(false);
  selection.removeAllRanges();
  selection.addRange(range);
  quotationSavedRange = range.cloneRange();
}

function handleQuotationSelectionChange() {
  if (!selectionBelongsToQuotationEditor()) return;
  saveQuotationSelection();
  syncQuotationToolbarFromSelection();
}

function preserveQuotationSelectionOnTool(event) {
  if (selectionBelongsToQuotationEditor()) saveQuotationSelection();
  if (event.pointerType === 'mouse') event.preventDefault();
}

function runQuotationCommand(command, value = null) {
  restoreQuotationSelection();
  try {
    document.execCommand('styleWithCSS', false, true);
    document.execCommand(command, false, value);
  } catch (error) {
    console.warn('Text command failed', error);
  }
  saveQuotationSelection();
  syncQuotationToolbarFromSelection();
  handleQuotationEditorChange();
}

function syncQuotationToolbarFromSelection() {
  const bold = Boolean(document.queryCommandState?.('bold'));
  const italic = Boolean(document.queryCommandState?.('italic'));
  const underline = Boolean(document.queryCommandState?.('underline'));
  const strike = Boolean(document.queryCommandState?.('strikeThrough'));
  document.getElementById('quotation-bold-tool')?.classList.toggle('active', bold);
  document.getElementById('quotation-italic-tool')?.classList.toggle('active', italic);
  document.getElementById('quotation-underline-tool')?.classList.toggle('active', underline);
  document.getElementById('quotation-strike-tool')?.classList.toggle('active', strike);
  document.getElementById('quotation-underline').value = underline ? 'true' : 'false';
  document.getElementById('quotation-strike').value = strike ? 'true' : 'false';
  document.getElementById('quotation-font-style').value = quotationFontStyle();
  const align = document.queryCommandState?.('justifyCenter')
    ? 'center'
    : document.queryCommandState?.('justifyRight')
      ? 'right'
      : 'left';
  document.querySelectorAll('[data-quotation-align]').forEach(button => {
    button.classList.toggle('active', button.dataset.quotationAlign === align);
  });
  document.getElementById('quotation-align').value = align;
}

function handleQuotationPaperPointerDown(event) {
  if (!quotationPreviewScale || !quotationPreviewPageSize.width) return;
  let input = quotationEditorElement();
  const tappedEditor = quotationEditorFromNode(event.target);
  if (tappedEditor) {
    setActiveQuotationEditor(tappedEditor, true);
    return;
  }

  const paper = document.getElementById('quotation-paper');
  const rect = paper.getBoundingClientRect();
  const cssX = event.clientX - rect.left;
  const cssY = event.clientY - rect.top;
  if (cssX < 0 || cssY < 0 || cssX > rect.width || cssY > rect.height) return;

  event.preventDefault();
  if (quotationEditorHasText(input)) {
    if (quotationGuidesVisible && quotationHasTextSelection(input)) {
      setQuotationTypingPosition(cssX / quotationPreviewScale, cssY / quotationPreviewScale, input);
      setText('quotation-status', 'Active text block moved.');
    } else {
      input = createQuotationEditorBlock();
      setQuotationTypingPosition(cssX / quotationPreviewScale, cssY / quotationPreviewScale, input);
      setText('quotation-status', 'New typing place ready.');
    }
  } else {
    setActiveQuotationEditor(input);
    setQuotationTypingPosition(cssX / quotationPreviewScale, cssY / quotationPreviewScale, input);
  }

  markQuotationDirty();
  updateQuotationLivePreview();
  input.focus({ preventScroll: true });
}

function handleQuotationAction(event) {
  const action = event.currentTarget.dataset.quotationAction;
  if (action === 'focus') {
    restoreQuotationSelection();
    return;
  }

  if (action === 'bullet') {
    runQuotationCommand('insertUnorderedList');
    return;
  }

  if (action === 'guides') {
    quotationGuidesVisible = !quotationGuidesVisible;
    event.currentTarget.classList.toggle('active', quotationGuidesVisible);
    updateQuotationLivePreview();
    setText('quotation-status', quotationGuidesVisible ? 'Move mode on. Select a text block, then tap the PDF to move it.' : 'Move mode off. Blank taps create new typing places.');
    return;
  }

  if (action === 'bigger' || action === 'smaller') {
    const input = document.getElementById('quotation-font-size');
    const step = event.shiftKey ? 10 : 4;
    const delta = action === 'bigger' ? step : -step;
    if (applyQuotationSelectionFontSize(delta)) return;
    const editor = quotationEditorElement();
    const nextSize = clampNumber(quotationEditorFontSize(editor) + delta, 10, 180);
    editor.dataset.fontSize = String(nextSize);
    input.value = nextSize;
    handleQuotationEditorChange();
  }
}

function handleQuotationToggle(event) {
  const name = event.currentTarget.dataset.quotationToggle;
  const commands = {
    bold: 'bold',
    italic: 'italic',
    underline: 'underline',
    strike: 'strikeThrough'
  };
  if (commands[name]) runQuotationCommand(commands[name]);
}

function handleQuotationAlign(event) {
  const align = event.currentTarget.dataset.quotationAlign || 'left';
  const command = align === 'center' ? 'justifyCenter' : align === 'right' ? 'justifyRight' : 'justifyLeft';
  runQuotationCommand(command);
  document.querySelectorAll('[data-quotation-align]').forEach(button => {
    button.classList.toggle('active', button.dataset.quotationAlign === align);
  });
  document.getElementById('quotation-align').value = align;
}

function insertQuotationText(text) {
  runQuotationCommand('insertText', text);
}

function applyQuotationSelectionFontSize(delta) {
  restoreQuotationSelection();
  const editor = quotationEditorElement();
  const selection = window.getSelection?.();
  if (!editor || !selection || !selection.rangeCount) return false;
  const range = selection.getRangeAt(0);
  if (range.collapsed || !editor.contains(range.commonAncestorContainer)) return false;

  const parent = (selection.focusNode?.nodeType === Node.ELEMENT_NODE ? selection.focusNode : selection.focusNode?.parentElement) || editor;
  const editorPx = parseFloat(window.getComputedStyle(editor).fontSize) || 16;
  const currentPx = parseFloat(window.getComputedStyle(parent).fontSize) || editorPx;
  const deltaPx = delta * Math.max(0.5, quotationPreviewScale || 1);
  const nextPx = clampNumber(currentPx + deltaPx, 8, 220);
  wrapQuotationSelectionWithStyle({ fontSize: `${(nextPx / editorPx).toFixed(3)}em` });
  handleQuotationEditorChange();
  return true;
}

function wrapQuotationSelectionWithStyle(styles) {
  const selection = window.getSelection?.();
  if (!selection || !selection.rangeCount) return;
  const range = selection.getRangeAt(0);
  const span = document.createElement('span');
  Object.entries(styles).forEach(([key, value]) => {
    span.style[key] = value;
  });
  try {
    range.surroundContents(span);
  } catch (error) {
    const fragment = range.extractContents();
    span.appendChild(fragment);
    range.insertNode(span);
  }
  selection.removeAllRanges();
  const nextRange = document.createRange();
  nextRange.selectNodeContents(span);
  selection.addRange(nextRange);
  quotationSavedRange = nextRange.cloneRange();
}

function setQuotationTypingPosition(x, y, editor = quotationEditorElement()) {
  const fontSize = quotationEditorFontSize(editor);
  const pageWidth = quotationPreviewPageSize.width;
  const pageHeight = quotationPreviewPageSize.height;
  const margin = 24;
  const minWidth = Math.min(360, Math.max(120, pageWidth - margin * 2));
  const safeX = clampNumber(x, margin, Math.max(margin, pageWidth - minWidth - margin));
  const safeY = clampNumber(y, margin, Math.max(margin, pageHeight - fontSize * 1.5 - margin));
  const width = Math.max(minWidth, pageWidth - safeX - margin);
  const height = Math.max(fontSize * 1.6, pageHeight - safeY - margin);

  setQuotationEditorBox(editor, { x: safeX, y: safeY, width, height });
}

function markQuotationDirty() {
  revokeQuotationDownload();
  document.getElementById('quotation-download').classList.add('hidden');
}

function scheduleQuotationPreviewRender() {
  if (currentView !== 'quotation-enquiry' || !quotationPdfBytes) return;
  window.clearTimeout(quotationResizeTimer);
  quotationResizeTimer = window.setTimeout(renderQuotationPreview, 140);
}

async function renderQuotationPreview() {
  const canvas = document.getElementById('quotation-preview-canvas');
  const paper = document.getElementById('quotation-paper');
  if (!quotationPdfBytes || !canvas || !paper) {
    resetQuotationPreview('Upload a quotation PDF to preview.');
    return;
  }

  if (!window.pdfjsLib?.getDocument) {
    resetQuotationPreview('PDF preview is still loading.');
    setText('quotation-status', 'PDF preview is still loading.');
    return;
  }

  const renderToken = ++quotationRenderToken;
  try {
    const pdf = await window.pdfjsLib.getDocument({
      data: new Uint8Array(quotationPdfBytes.slice(0)),
      disableWorker: true
    }).promise;
    const pageNumber = clampNumber(safeNumber('quotation-page-number', 1), 1, pdf.numPages);
    const page = await pdf.getPage(pageNumber);
    const baseViewport = page.getViewport({ scale: 1 });
    const frame = document.getElementById('quotation-paper-frame');
    const availableWidth = Math.max(280, (frame?.clientWidth || 780) - 24);
    const minimumPreviewWidth = Math.min(640, baseViewport.width);
    const targetCssWidth = Math.min(baseViewport.width, Math.max(availableWidth, minimumPreviewWidth));
    const cssScale = targetCssWidth / baseViewport.width;
    const pixelRatio = Math.min(window.devicePixelRatio || 1, 2);
    const viewport = page.getViewport({ scale: cssScale * pixelRatio });
    const cssWidth = Math.round(baseViewport.width * cssScale);
    const cssHeight = Math.round(baseViewport.height * cssScale);

    canvas.width = Math.round(viewport.width);
    canvas.height = Math.round(viewport.height);
    canvas.style.width = `${cssWidth}px`;
    canvas.style.height = `${cssHeight}px`;
    paper.style.width = `${cssWidth}px`;
    paper.style.height = `${cssHeight}px`;

    const context = canvas.getContext('2d');
    context.clearRect(0, 0, canvas.width, canvas.height);
    await page.render({ canvasContext: context, viewport }).promise;
    await pdf.destroy?.();
    if (renderToken !== quotationRenderToken) return;

    quotationPreviewScale = cssScale;
    quotationPreviewPageSize = { width: baseViewport.width, height: baseViewport.height };
    canvas.classList.remove('hidden');
    document.getElementById('quotation-preview-empty').classList.add('hidden');
    updateQuotationLivePreview();
  } catch (error) {
    console.error(error);
    resetQuotationPreview('Unable to preview this PDF.');
    setText('quotation-status', 'Unable to preview this PDF.');
  }
}

function resetQuotationPreview(message) {
  quotationPreviewScale = 0;
  quotationPreviewPageSize = { width: 0, height: 0 };
  const canvas = document.getElementById('quotation-preview-canvas');
  const empty = document.getElementById('quotation-preview-empty');
  if (canvas) canvas.classList.add('hidden');
  quotationEditorElements().forEach(input => {
    input.style.display = 'none';
  });
  hideQuotationGuides();
  if (empty) {
    empty.textContent = message;
    empty.classList.remove('hidden');
  }
}

function updateQuotationLivePreview() {
  if (!quotationPreviewScale || !quotationPreviewPageSize.width) return;

  const scale = quotationPreviewScale;
  let activeGuideBox = null;

  quotationEditorElements().forEach(input => {
    setupQuotationEditor(input);
    const fontSize = quotationEditorFontSize(input);
    let box = quotationEditorBox(input);
    const cssLineHeight = Math.max(14, fontSize * scale * 1.28);
    const textLines = Math.max(1, quotationEditorText(input).split('\n').length);

    input.style.display = 'block';
    input.style.left = `${Math.round(box.x * scale)}px`;
    input.style.top = `${Math.round(box.y * scale)}px`;
    input.style.width = `${Math.round(box.width * scale)}px`;
    input.style.height = 'auto';
    input.style.minHeight = `${Math.round(cssLineHeight * 1.6)}px`;
    input.style.fontSize = `${Math.max(9, fontSize * scale)}px`;
    input.style.lineHeight = '1.28';
    input.style.color = document.getElementById('quotation-text-color')?.value || '#111827';

    const neededCssHeight = Math.max(cssLineHeight * 1.6, cssLineHeight * (textLines + 1) + 10, input.scrollHeight + 8);
    let availableCssHeight = Math.max(cssLineHeight * 1.6, (quotationPreviewPageSize.height - box.y - 8) * scale);
    if (neededCssHeight > availableCssHeight && box.y > 8) {
      const shiftPdf = Math.ceil((neededCssHeight - availableCssHeight) / scale);
      const nextY = clampNumber(box.y - shiftPdf, 8, box.y);
      if (nextY !== box.y) {
        setQuotationEditorBox(input, {
          x: box.x,
          y: nextY,
          width: box.width,
          height: Math.max(box.height, quotationPreviewPageSize.height - nextY - 8)
        });
        box = quotationEditorBox(input);
        availableCssHeight = Math.max(cssLineHeight * 1.6, (quotationPreviewPageSize.height - box.y - 8) * scale);
        input.style.top = `${Math.round(box.y * scale)}px`;
      }
    }
    const cssHeight = Math.min(neededCssHeight, availableCssHeight);
    input.style.height = `${Math.round(cssHeight)}px`;

    if (input.id === quotationActiveEditorId) {
      activeGuideBox = { cssX: box.x * scale, cssY: box.y * scale, cssWidth: box.width * scale, cssHeight, pdfX: box.x, pdfY: box.y };
    }
  });

  refreshQuotationToolbarState();
  if (activeGuideBox) {
    updateQuotationGuides(activeGuideBox.cssX, activeGuideBox.cssY, activeGuideBox.cssWidth, activeGuideBox.cssHeight, activeGuideBox.pdfX, activeGuideBox.pdfY);
  } else {
    hideQuotationGuides();
  }
}

function updateQuotationGuides(cssX, cssY, cssWidth, cssHeight, pdfX, pdfY) {
  const layer = document.getElementById('quotation-guide-layer');
  if (!layer || !quotationGuidesVisible) {
    hideQuotationGuides();
    return;
  }

  const paper = document.getElementById('quotation-paper');
  paper.classList.add('guides-active');
  layer.style.display = 'block';
  document.getElementById('quotation-guide-vertical').style.left = `${Math.round(cssX)}px`;
  document.getElementById('quotation-guide-horizontal').style.top = `${Math.round(cssY)}px`;
  const dot = document.getElementById('quotation-guide-dot');
  dot.style.left = `${Math.round(cssX)}px`;
  dot.style.top = `${Math.round(cssY)}px`;
  const badge = document.getElementById('quotation-guide-badge');
  badge.style.left = `${Math.round(cssX + Math.min(cssWidth, 120) + 8)}px`;
  badge.style.top = `${Math.round(cssY + Math.min(cssHeight, 28) + 8)}px`;
  badge.textContent = `${Math.round(pdfX)}, ${Math.round(pdfY)}`;
}

function hideQuotationGuides() {
  document.getElementById('quotation-paper')?.classList.remove('guides-active');
  const layer = document.getElementById('quotation-guide-layer');
  if (layer) layer.style.display = 'none';
}

function refreshQuotationToolbarState() {
  syncQuotationBoxInputsFromEditor(quotationEditorElement());
  const style = quotationFontStyle();
  document.getElementById('quotation-font-style').value = style;
  document.getElementById('quotation-align').value = quotationAlign();
  document.getElementById('quotation-underline').value = quotationBoolean('underline') ? 'true' : 'false';
  document.getElementById('quotation-strike').value = quotationBoolean('strike') ? 'true' : 'false';
  setText('quotation-size-pill', String(quotationEditorFontSize(quotationEditorElement())));
  const color = document.getElementById('quotation-text-color')?.value || '#111827';
  const colorDot = document.getElementById('quotation-color-dot');
  if (colorDot) colorDot.style.background = color;
}

function quotationFontStyle() {
  const bold = document.getElementById('quotation-bold-tool')?.classList.contains('active');
  const italic = document.getElementById('quotation-italic-tool')?.classList.contains('active');
  if (bold && italic) return 'bold-italic';
  if (bold) return 'bold';
  if (italic) return 'italic';
  return 'regular';
}

function quotationAlign() {
  return document.querySelector('[data-quotation-align].active')?.dataset.quotationAlign || document.getElementById('quotation-align')?.value || 'left';
}

function quotationBoolean(name) {
  return document.getElementById(`quotation-${name}-tool`)?.classList.contains('active') || document.getElementById(`quotation-${name}`)?.value === 'true';
}

async function writeQuotationPdf() {
  const button = document.getElementById('write-quotation-pdf');
  button.disabled = true;
  setText('quotation-status', 'Writing PDF...');

  try {
    const { blob, lineCount } = await buildQuotationPdfBlob();
    setQuotationDownload(blob);
    setText('quotation-status', `PDF ready · ${lineCount} line${lineCount === 1 ? '' : 's'} written`);
  } catch (error) {
    console.error(error);
    setText('quotation-status', error.message || 'Unable to write on this PDF.');
  } finally {
    button.disabled = false;
  }
}

async function openQuotationPrintPreview() {
  const button = document.getElementById('print-quotation-pdf');
  const printWindow = window.open('', '_blank');
  if (printWindow) {
    printWindow.document.write('<title>NBM Print Preview</title><body style="font-family:Arial,sans-serif;padding:24px">Preparing print preview...</body>');
  }

  button.disabled = true;
  setText('quotation-status', 'Preparing print preview...');

  try {
    const { blob } = await buildQuotationPdfBlob();
    revokeQuotationPrintPreview();
    quotationPrintPreviewUrl = URL.createObjectURL(blob);
    setQuotationDownload(blob);

    if (printWindow) {
      printWindow.location.href = quotationPrintPreviewUrl;
      window.setTimeout(() => {
        try {
          printWindow.focus();
          printWindow.print();
        } catch (error) {
          // Some mobile PDF viewers expose their own print button instead.
        }
      }, 1200);
      setText('quotation-status', 'Print preview opened.');
      return;
    }

    setText('quotation-status', 'Popup blocked. Use Download PDF, then print.');
  } catch (error) {
    console.error(error);
    if (printWindow) printWindow.close();
    setText('quotation-status', error.message || 'Unable to open print preview.');
  } finally {
    button.disabled = false;
  }
}

async function buildQuotationPdfBlob() {
  const sourceBytes = await getQuotationPdfBytes();
  if (!sourceBytes) throw new Error('Select a PDF first.');

  const editors = quotationEditorElements().filter(editor => quotationEditorHasText(editor));
  if (!editors.length || !quotationAllText()) throw new Error('Enter text to write.');

  if (!window.PDFLib?.PDFDocument) throw new Error('PDF writer is still loading.');

  try {
    const { PDFDocument, StandardFonts, rgb } = window.PDFLib;
    const pdfDoc = await PDFDocument.load(sourceBytes.slice(0), { ignoreEncryption: true });
    const pages = pdfDoc.getPages();
    if (!pages.length) throw new Error('No pages found in PDF.');

    const pageNumber = safeNumber('quotation-page-number', 1);
    const page = pages[Math.min(Math.max(pageNumber, 1), pages.length) - 1];
    const { width, height } = page.getSize();
    const align = quotationAlign();
    const fonts = {
      regular: await pdfDoc.embedFont(StandardFonts.Helvetica),
      bold: await pdfDoc.embedFont(StandardFonts.HelveticaBold),
      italic: await pdfDoc.embedFont(StandardFonts.HelveticaOblique),
      boldItalic: await pdfDoc.embedFont(StandardFonts.HelveticaBoldOblique)
    };
    const defaultColor = pdfColorFromCss(document.getElementById('quotation-text-color')?.value, rgb, rgb(0.067, 0.094, 0.153));
    let lineCount = 0;
    editors.forEach(editor => {
      const fontSize = quotationEditorFontSize(editor);
      const box = quotationEditorBox(editor, width, height);
      const boxTopY = height - box.y;
      const boxBottomY = Math.max(12, boxTopY - box.height);
      const richLines = layoutQuotationRichLines(buildQuotationRichLines(fontSize, editor), fonts, rgb, defaultColor, box.width, fontSize);
      let y = boxTopY - fontSize;

      richLines.forEach(line => {
        if (y < boxBottomY) return;
        let x = alignedPdfX(box.x, box.width, Math.min(line.width, box.width), line.align || align);
        line.segments.forEach(segment => {
          if (!segment.text.trim()) {
            x += segment.width;
            return;
          }
          page.drawText(segment.text, {
            x,
            y,
            size: segment.size,
            font: segment.font,
            color: segment.color
          });

          if (segment.underline) {
            page.drawLine({
              start: { x, y: y - Math.max(2, segment.size * 0.08) },
              end: { x: x + segment.width, y: y - Math.max(2, segment.size * 0.08) },
              thickness: Math.max(1, segment.size * 0.06),
              color: segment.color
            });
          }

          if (segment.strike) {
            page.drawLine({
              start: { x, y: y + segment.size * 0.35 },
              end: { x: x + segment.width, y: y + segment.size * 0.35 },
              thickness: Math.max(1, segment.size * 0.06),
              color: segment.color
            });
          }

          x += segment.width;
        });
        lineCount += 1;
        y -= line.height;
      });
    });

    const pdfBytes = await pdfDoc.save();
    const blob = new Blob([pdfBytes], { type: 'application/pdf' });

    return { blob, lineCount };
  } catch (error) {
    throw error.message ? error : new Error('Unable to write on this PDF.');
  }
}

async function getQuotationPdfBytes() {
  if (quotationPdfBytes) return quotationPdfBytes;
  if (!quotationPdfFile) return null;
  quotationPdfBytes = await quotationPdfFile.arrayBuffer();
  return quotationPdfBytes;
}

function setQuotationDownload(blob) {
  revokeQuotationDownload();
  quotationDownloadUrl = URL.createObjectURL(blob);
  const download = document.getElementById('quotation-download');
  download.href = quotationDownloadUrl;
  download.download = `${(quotationPdfName || 'quotation').replace(/\.pdf$/i, '')}-nbm.pdf`;
  download.classList.remove('hidden');
}

function safeNumber(id, fallback) {
  const value = Number(document.getElementById(id)?.value);
  return Number.isFinite(value) ? value : fallback;
}

function clampNumber(value, min, max) {
  return Math.min(Math.max(value, min), max);
}

function buildQuotationRichLines(baseFontSize, editor = quotationEditorElement()) {
  if (!editor) return [];
  const editorStyle = window.getComputedStyle(editor);
  const editorFontSize = parseFloat(editorStyle.fontSize) || 16;
  const baseStyle = {
    bold: false,
    italic: false,
    underline: false,
    strike: false,
    color: editorStyle.color || document.getElementById('quotation-text-color')?.value || '#111827',
    size: baseFontSize,
    align: normalizeTextAlign(editorStyle.textAlign) || quotationAlign()
  };
  const lines = [{ align: baseStyle.align, runs: [] }];
  const currentLine = () => lines[lines.length - 1];
  const pushLine = align => {
    const line = currentLine();
    if (!line.runs.length) {
      line.align = align || line.align || baseStyle.align;
      return;
    }
    lines.push({ align: align || baseStyle.align, runs: [] });
  };
  const appendText = (text, style) => {
    if (!text) return;
    currentLine().align = style.align || currentLine().align;
    currentLine().runs.push({
      text,
      bold: style.bold,
      italic: style.italic,
      underline: style.underline,
      strike: style.strike,
      color: style.color,
      size: style.size
    });
  };
  const walk = (node, inherited) => {
    if (node.nodeType === Node.TEXT_NODE) {
      appendText(node.nodeValue || '', inherited);
      return;
    }
    if (node.nodeType !== Node.ELEMENT_NODE) return;

    const element = node;
    const tag = element.tagName;
    if (tag === 'BR') {
      pushLine(inherited.align);
      return;
    }

    const computed = window.getComputedStyle(element);
    const textDecoration = `${computed.textDecorationLine || ''} ${computed.textDecoration || ''}`;
    const align = normalizeTextAlign(computed.textAlign) || inherited.align;
    const nextStyle = {
      bold: inherited.bold || tag === 'B' || tag === 'STRONG' || Number.parseInt(computed.fontWeight, 10) >= 600,
      italic: inherited.italic || tag === 'I' || tag === 'EM' || computed.fontStyle === 'italic' || computed.fontStyle === 'oblique',
      underline: inherited.underline || tag === 'U' || textDecoration.includes('underline'),
      strike: inherited.strike || tag === 'S' || tag === 'STRIKE' || textDecoration.includes('line-through'),
      color: computed.color || inherited.color,
      size: baseFontSize * ((parseFloat(computed.fontSize) || editorFontSize) / editorFontSize),
      align
    };
    const display = computed.display || '';
    const isBlock = ['DIV', 'P', 'LI'].includes(tag) || display.includes('block') || display === 'list-item';
    if (isBlock) pushLine(nextStyle.align);
    if (tag === 'LI') appendText('• ', nextStyle);
    Array.from(element.childNodes).forEach(child => walk(child, nextStyle));
    if (isBlock) pushLine(inherited.align);
  };

  Array.from(editor.childNodes).forEach(child => walk(child, baseStyle));
  while (lines.length > 1 && !lines[lines.length - 1].runs.length) lines.pop();
  return lines;
}

function normalizeTextAlign(value) {
  if (value === 'center') return 'center';
  if (value === 'right' || value === 'end') return 'right';
  if (value === 'left' || value === 'start') return 'left';
  return '';
}

function layoutQuotationRichLines(sourceLines, fonts, rgb, fallbackColor, maxWidth, baseFontSize = safeNumber('quotation-font-size', 48)) {
  const lines = [];
  sourceLines.forEach(sourceLine => {
    let line = newQuotationPdfLine(sourceLine.align, baseFontSize);
    const pushLine = () => {
      trimQuotationLine(line);
      lines.push(line);
      line = newQuotationPdfLine(sourceLine.align, baseFontSize);
    };

    if (!sourceLine.runs.length) {
      pushLine();
      return;
    }

    sourceLine.runs.forEach(run => {
      const font = quotationRunFont(run, fonts);
      const color = pdfColorFromCss(run.color, rgb, fallbackColor);
      const size = clampNumber(run.size || 48, 8, 220);
      const safeText = makePdfTextSafe(normalizePdfText(run.text), font);
      safeText.split(/(\s+)/).filter(Boolean).forEach(part => {
        const text = /^\s+$/.test(part) ? ' ' : part;
        const pieces = splitRichPdfToken(text, font, size, maxWidth);
        pieces.forEach(piece => {
          if (piece === ' ' && !line.segments.length) return;
          const width = font.widthOfTextAtSize(piece, size);
          if (piece.trim() && line.segments.length && line.width + width > maxWidth) pushLine();
          if (piece === ' ' && !line.segments.length) return;
          line.segments.push({
            text: piece,
            width,
            size,
            font,
            color,
            underline: run.underline,
            strike: run.strike
          });
          line.width += width;
          line.maxSize = Math.max(line.maxSize, size);
          line.height = Math.max(line.height, line.maxSize * 1.28);
        });
      });
    });
    pushLine();
  });
  return lines;
}

function newQuotationPdfLine(align, baseFontSize = safeNumber('quotation-font-size', 48)) {
  const fontSize = clampNumber(baseFontSize, 10, 180);
  return {
    align: align || 'left',
    segments: [],
    width: 0,
    maxSize: fontSize,
    height: fontSize * 1.28
  };
}

function trimQuotationLine(line) {
  while (line.segments.length && !line.segments[line.segments.length - 1].text.trim()) {
    const segment = line.segments.pop();
    line.width -= segment.width;
  }
}

function quotationRunFont(run, fonts) {
  if (run.bold && run.italic) return fonts.boldItalic;
  if (run.bold) return fonts.bold;
  if (run.italic) return fonts.italic;
  return fonts.regular;
}

function splitRichPdfToken(text, font, size, maxWidth) {
  if (text === ' ' || font.widthOfTextAtSize(text, size) <= maxWidth) return [text];
  const chunks = [];
  let chunk = '';
  Array.from(text).forEach(char => {
    const next = `${chunk}${char}`;
    if (font.widthOfTextAtSize(next, size) <= maxWidth || !chunk) {
      chunk = next;
      return;
    }
    chunks.push(chunk);
    chunk = char;
  });
  if (chunk) chunks.push(chunk);
  return chunks;
}

function standardFontForStyle(style, StandardFonts) {
  if (style === 'bold') return StandardFonts.HelveticaBold;
  if (style === 'italic') return StandardFonts.HelveticaOblique;
  if (style === 'bold-italic') return StandardFonts.HelveticaBoldOblique;
  return StandardFonts.Helvetica;
}

function pdfColorFromHex(hex, rgb) {
  const cleaned = String(hex || '#111827').replace('#', '').trim();
  const value = /^[0-9a-f]{6}$/i.test(cleaned) ? cleaned : '111827';
  const red = parseInt(value.slice(0, 2), 16) / 255;
  const green = parseInt(value.slice(2, 4), 16) / 255;
  const blue = parseInt(value.slice(4, 6), 16) / 255;
  return rgb(red, green, blue);
}

function pdfColorFromCss(value, rgb, fallback) {
  const color = String(value || '').trim();
  if (/^#[0-9a-f]{6}$/i.test(color)) return pdfColorFromHex(color, rgb);
  const rgbMatch = color.match(/^rgba?\(([^)]+)\)$/i);
  if (rgbMatch) {
    const [red, green, blue] = rgbMatch[1].split(',').map(part => Number.parseFloat(part.trim()));
    if ([red, green, blue].every(Number.isFinite)) {
      return rgb(clampNumber(red, 0, 255) / 255, clampNumber(green, 0, 255) / 255, clampNumber(blue, 0, 255) / 255);
    }
  }
  return fallback || pdfColorFromHex('#111827', rgb);
}

function normalizePdfText(text) {
  return text
    .replace(/\u00a0/g, ' ')
    .replace(/[₹]/g, 'Rs. ')
    .replace(/[–—]/g, '-')
    .replace(/[“”]/g, '"')
    .replace(/[‘’]/g, "'");
}

function makePdfTextSafe(text, font) {
  return Array.from(text).map(char => {
    if (char === '\n') return char;
    try {
      font.encodeText(char);
      return char;
    } catch (error) {
      return ' ';
    }
  }).join('');
}

function wrapPdfText(text, font, size, maxWidth) {
  return text.split(/\n/).flatMap(rawLine => {
    const words = rawLine.trim().split(/\s+/).filter(Boolean);
    if (!words.length) return [''];
    const lines = [];
    let line = '';
    words.flatMap(word => splitPdfWord(word, font, size, maxWidth)).forEach(word => {
      const next = line ? `${line} ${word}` : word;
      if (font.widthOfTextAtSize(next, size) <= maxWidth || !line) {
        line = next;
        return;
      }
      lines.push(line);
      line = word;
    });
    if (line) lines.push(line);
    return lines;
  });
}

function splitPdfWord(word, font, size, maxWidth) {
  if (font.widthOfTextAtSize(word, size) <= maxWidth) return [word];
  const chunks = [];
  let chunk = '';
  Array.from(word).forEach(char => {
    const next = `${chunk}${char}`;
    if (font.widthOfTextAtSize(next, size) <= maxWidth || !chunk) {
      chunk = next;
      return;
    }
    chunks.push(chunk);
    chunk = char;
  });
  if (chunk) chunks.push(chunk);
  return chunks;
}

function alignedPdfX(boxX, boxWidth, textWidth, align) {
  if (align === 'center') return boxX + Math.max(0, (boxWidth - textWidth) / 2);
  if (align === 'right') return boxX + Math.max(0, boxWidth - textWidth);
  return boxX;
}

function revokeQuotationDownload() {
  if (!quotationDownloadUrl) return;
  URL.revokeObjectURL(quotationDownloadUrl);
  quotationDownloadUrl = '';
}

function revokeQuotationPrintPreview() {
  if (!quotationPrintPreviewUrl) return;
  URL.revokeObjectURL(quotationPrintPreviewUrl);
  quotationPrintPreviewUrl = '';
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
  const businessName = state.business.name || 'NBM';
  const phone = state.business.phone || 'New Bombay Metal';
  setText('business-name', businessName);
  setText('business-phone', phone);
  setText('profile-avatar', initials(businessName).slice(0, 1) || 'B');
}

function compactPartyDetails(party) {
  return [
    party.phone,
    party.gstin ? `GST ${party.gstin}` : '',
    party.pan ? `PAN ${party.pan}` : '',
    party.address
  ].filter(Boolean).join(' · ') || 'Party details saved locally';
}

function openPartyForm() {
  resetPartyForm();
  lockPageScroll();
  document.getElementById('party-modal').classList.remove('hidden');
  document.getElementById('party-name').focus({ preventScroll: true });
}

function closePartyForm() {
  document.getElementById('party-modal').classList.add('hidden');
  unlockPageScroll();
}

function resetPartyForm() {
  document.getElementById('party-form').reset();
  document.getElementById('party-type-customer').checked = true;
  setGstFetching(false);
  setGstStatus('');
}

function savePartyFromForm(event) {
  event.preventDefault();

  const form = new FormData(event.currentTarget);
  const gstin = normalizeGstin(form.get('gstin'));
  const pan = normalizePan(form.get('pan')) || panFromGstin(gstin);
  const name = String(form.get('name') || '').trim();

  if (!name) {
    document.getElementById('party-name').focus();
    toast('Enter party name');
    return;
  }

  if (gstin && !isValidGstin(gstin)) {
    setGstStatus('Invalid GST number');
    document.getElementById('party-gst').focus();
    return;
  }

  const party = {
    id: `party-${Date.now()}`,
    name,
    phone: String(form.get('phone') || '').trim(),
    type: String(form.get('type') || 'Customer'),
    gstin,
    pan,
    address: String(form.get('address') || '').trim(),
    shippingAddress: String(form.get('shippingAddress') || '').trim(),
    createdAt: Date.now()
  };

  state.customers = [party, ...state.customers.filter(customer =>
    !(party.gstin && normalizeGstin(customer.gstin || customer.gst) === party.gstin)
  )];
  saveState();
  renderParties();
  renderStats();
  applySearch();
  closePartyForm();
  toast('Party details saved');
}

function handleGstInput(event) {
  const gstin = normalizeGstin(event.target.value);
  event.target.value = gstin;

  const pan = panFromGstin(gstin);
  if (pan) document.getElementById('party-pan').value = pan;

  if (!gstin) {
    setGstStatus('');
  } else if (gstin.length < 15) {
    setGstStatus('Enter 15 character GST number');
  } else if (!isValidGstin(gstin)) {
    setGstStatus('Invalid GST number');
  } else {
    setGstStatus('PAN filled. Tap Fetch for GST name and address.');
  }
}

function maybeFetchGstDetails() {
  if (isValidGstin(normalizeGstin(document.getElementById('party-gst').value))) {
    fetchGstDetails();
  }
}

async function fetchGstDetails() {
  if (gstFetchInProgress) return;

  const gstin = normalizeGstin(document.getElementById('party-gst').value);
  const pan = panFromGstin(gstin);
  if (pan) document.getElementById('party-pan').value = pan;

  if (!isValidGstin(gstin)) {
    setGstStatus('Invalid GST number');
    return;
  }

  setGstStatus('Fetching GST details...');
  setGstFetching(true);
  try {
    const data = await requestGstDetails(gstin);
    fillGstDetails(data, gstin);
    setGstStatus('GST details filled');
  } catch (error) {
    setGstStatus(error.message || 'GST details could not be fetched');
  } finally {
    setGstFetching(false);
  }
}

async function requestGstDetails(gstin) {
  const url = GST_LOOKUP_ENDPOINT.includes('{gstin}')
    ? GST_LOOKUP_ENDPOINT.replace('{gstin}', encodeURIComponent(gstin))
    : `${GST_LOOKUP_ENDPOINT}${GST_LOOKUP_ENDPOINT.includes('?') ? '&' : '?'}gstin=${encodeURIComponent(gstin)}`;
  const response = await fetch(url, { cache: 'no-store' });
  if (!response.ok) throw new Error('GST lookup failed');
  const contentType = response.headers.get('content-type') || '';
  if (contentType.includes('application/json')) return response.json();
  return parseGstLookupHtml(await response.text(), gstin);
}

function fillGstDetails(data, gstin) {
  const payload = data?.data || data?.result || data || {};
  const name = payload.tradeName || payload.tradeNam || payload.name || payload.businessName || payload.legalName || payload.lgnm;
  const pan = payload.pan || payload.panNo || panFromGstin(gstin);
  const address = payload.address || payload.principalAddress || payload.pradr || payload.principalPlaceOfBusiness;

  if (name) document.getElementById('party-name').value = String(name).trim();
  if (pan) document.getElementById('party-pan').value = normalizePan(pan);

  const formattedAddress = formatGstAddress(address);
  if (formattedAddress) {
    document.getElementById('party-address').value = formattedAddress;
    if (!document.getElementById('party-shipping').value.trim()) {
      document.getElementById('party-shipping').value = formattedAddress;
    }
  }
}

function parseGstLookupHtml(html, gstin) {
  const documentHtml = new DOMParser().parseFromString(html, 'text/html');
  const organization = Array.from(documentHtml.querySelectorAll('script[type="application/ld+json"]'))
    .map(script => parseJson(script.textContent))
    .flatMap(item => Array.isArray(item) ? item : [item])
    .find(item => item && (item['@type'] === 'Organization' || item.vatID === gstin));

  if (organization?.legalName || organization?.name || organization?.address) {
    return {
      gstin,
      legalName: organization.legalName,
      tradeName: organization.name,
      address: organization.address?.streetAddress || organization.address
    };
  }

  const pageTitle = documentHtml.querySelector('title')?.textContent || '';
  if (/not found|404/i.test(pageTitle)) throw new Error('GSTIN not found');
  throw new Error('GST details not available');
}

function parseJson(value) {
  try {
    return JSON.parse(value || '{}');
  } catch (error) {
    return null;
  }
}

function formatGstAddress(address) {
  if (!address) return '';
  if (typeof address === 'string') return address.trim();
  const source = address.addr || address.address || address;
  return [
    source.bno,
    source.bnm,
    source.flno,
    source.st,
    source.loc,
    source.dst,
    source.stcd,
    source.pncd
  ].filter(Boolean).join(', ');
}

function setGstStatus(message) {
  setText('gst-status', message);
}

function setGstFetching(isFetching) {
  gstFetchInProgress = Boolean(isFetching);
  const button = document.getElementById('fetch-gst');
  if (!button) return;
  const label = button.querySelector('.field-action-label');
  button.disabled = gstFetchInProgress;
  button.classList.toggle('is-loading', gstFetchInProgress);
  button.setAttribute('aria-busy', String(gstFetchInProgress));
  if (label) label.textContent = gstFetchInProgress ? 'Fetching' : 'Fetch';
}

function normalizeGstin(value) {
  return String(value || '').replace(/[^0-9a-z]/gi, '').toUpperCase().slice(0, 15);
}

function normalizePan(value) {
  return String(value || '').replace(/[^0-9a-z]/gi, '').toUpperCase().slice(0, 10);
}

function isValidGstin(value) {
  return /^[0-9]{2}[A-Z]{5}[0-9]{4}[A-Z][1-9A-Z]Z[0-9A-Z]$/.test(normalizeGstin(value));
}

function panFromGstin(value) {
  const gstin = normalizeGstin(value);
  return gstin.length >= 12 ? gstin.slice(2, 12) : '';
}

function wireInstallPrompt() {
  const installButton = document.getElementById('install-android');
  if (!installButton || isStandaloneMode() || !isAndroidDevice()) return;

  window.addEventListener('beforeinstallprompt', event => {
    event.preventDefault();
    deferredInstallPrompt = event;
    installButton.classList.remove('hidden');
  });

  installButton.addEventListener('click', installAndroidVersion);

  window.addEventListener('appinstalled', () => {
    deferredInstallPrompt = null;
    installButton.classList.add('hidden');
    toast('Android app installed');
  });
}

async function installAndroidVersion() {
  if (!deferredInstallPrompt) {
    toast(isAndroidDevice() ? 'Android install is ready from Chrome menu' : 'Open on Android Chrome to install');
    return;
  }

  deferredInstallPrompt.prompt();
  const choice = await deferredInstallPrompt.userChoice.catch(() => null);
  deferredInstallPrompt = null;

  if (choice?.outcome === 'accepted') {
    document.getElementById('install-android')?.classList.add('hidden');
    toast('Android app installed');
  } else {
    toast('Install dismissed');
  }
}

function isStandaloneMode() {
  return window.matchMedia('(display-mode: standalone)').matches || window.navigator.standalone === true;
}

function isAndroidDevice() {
  return /Android/i.test(navigator.userAgent);
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
  lockPageScroll();
  document.getElementById('ai-modal').classList.remove('hidden');
  document.getElementById('ai-question').focus({ preventScroll: true });
}

function closeAi() {
  document.getElementById('ai-modal').classList.add('hidden');
  unlockPageScroll();
}

function lockPageScroll() {
  if (document.body.classList.contains('modal-scroll-locked')) return;
  lockedPageScrollY = window.scrollY || document.documentElement.scrollTop || 0;
  document.documentElement.classList.add('modal-scroll-locked');
  document.body.classList.add('modal-scroll-locked');
  document.body.style.top = `-${lockedPageScrollY}px`;
}

function unlockPageScroll() {
  if (!document.body.classList.contains('modal-scroll-locked')) return;
  document.documentElement.classList.remove('modal-scroll-locked');
  document.body.classList.remove('modal-scroll-locked');
  document.body.style.top = '';
  window.scrollTo(0, lockedPageScrollY);
  lockedPageScrollY = 0;
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
    source: 'NBM local dashboard',
    state
  };
  const blob = new Blob([JSON.stringify(payload, null, 2)], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement('a');
  anchor.href = url;
  anchor.download = `nbm-backup-${new Date().toISOString().slice(0, 10)}.json`;
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
