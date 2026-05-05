const STORAGE_KEY = 'sm_app_v1';
const APP_VERSION = '61';
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
  document.getElementById('quotation-write-text').addEventListener('input', handleQuotationEditorChange);
  document.getElementById('quotation-page-number').addEventListener('input', handleQuotationPageChange);
  document.getElementById('quotation-font-size').addEventListener('input', handleQuotationEditorChange);
  document.getElementById('quotation-text-color').addEventListener('input', handleQuotationEditorChange);
  document.getElementById('quotation-underline').addEventListener('change', handleQuotationEditorChange);
  document.querySelectorAll('input[name="quotation-font-style"], input[name="quotation-align"]').forEach(input => {
    input.addEventListener('change', handleQuotationEditorChange);
  });
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
  updateQuotationLivePreview();
}

function handleQuotationPageChange() {
  markQuotationDirty();
  renderQuotationPreview();
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
  const input = document.getElementById('quotation-write-text');
  const empty = document.getElementById('quotation-preview-empty');
  if (canvas) canvas.classList.add('hidden');
  if (input) input.style.display = 'none';
  if (empty) {
    empty.textContent = message;
    empty.classList.remove('hidden');
  }
}

function updateQuotationLivePreview() {
  const input = document.getElementById('quotation-write-text');
  if (!input || !quotationPreviewScale || !quotationPreviewPageSize.width) return;

  const scale = quotationPreviewScale;
  const fontSize = clampNumber(safeNumber('quotation-font-size', 48), 10, 180);
  const style = checkedValue('quotation-font-style', 'regular');
  const align = checkedValue('quotation-align', 'left');
  const underline = Boolean(document.getElementById('quotation-underline')?.checked);
  const boxX = clampNumber(safeNumber('quotation-box-x', 150), 0, Math.max(0, quotationPreviewPageSize.width - 40));
  const boxTopFromPage = clampNumber(safeNumber('quotation-box-y', 761), 0, Math.max(0, quotationPreviewPageSize.height - fontSize));
  const boxWidth = clampNumber(safeNumber('quotation-box-width', 2270), 40, Math.max(40, quotationPreviewPageSize.width - boxX - 12));
  const boxHeight = clampNumber(safeNumber('quotation-box-height', 2224), fontSize * 1.5, Math.max(fontSize * 1.5, quotationPreviewPageSize.height - boxTopFromPage - 12));

  input.style.display = 'block';
  input.style.left = `${Math.round(boxX * scale)}px`;
  input.style.top = `${Math.round(boxTopFromPage * scale)}px`;
  input.style.width = `${Math.round(boxWidth * scale)}px`;
  input.style.height = `${Math.round(boxHeight * scale)}px`;
  input.style.fontSize = `${Math.max(9, fontSize * scale)}px`;
  input.style.lineHeight = '1.28';
  input.style.fontWeight = style.includes('bold') ? '800' : '400';
  input.style.fontStyle = style.includes('italic') ? 'italic' : 'normal';
  input.style.textAlign = align === 'center' ? 'center' : align;
  input.style.color = document.getElementById('quotation-text-color')?.value || '#111827';
  input.style.textDecorationLine = underline ? 'underline' : 'none';
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

  const text = document.getElementById('quotation-write-text').value;
  if (!text.trim()) throw new Error('Enter text to write.');

  if (!window.PDFLib?.PDFDocument) throw new Error('PDF writer is still loading.');

  try {
    const { PDFDocument, StandardFonts, rgb } = window.PDFLib;
    const pdfDoc = await PDFDocument.load(sourceBytes.slice(0), { ignoreEncryption: true });
    const pages = pdfDoc.getPages();
    if (!pages.length) throw new Error('No pages found in PDF.');

    const pageNumber = safeNumber('quotation-page-number', 1);
    const page = pages[Math.min(Math.max(pageNumber, 1), pages.length) - 1];
    const { width, height } = page.getSize();
    const fontSize = clampNumber(safeNumber('quotation-font-size', 48), 10, 180);
    const style = checkedValue('quotation-font-style', 'regular');
    const align = checkedValue('quotation-align', 'left');
    const underline = Boolean(document.getElementById('quotation-underline')?.checked);
    const color = pdfColorFromHex(document.getElementById('quotation-text-color')?.value, rgb);
    const font = await pdfDoc.embedFont(standardFontForStyle(style, StandardFonts));
    const boxX = clampNumber(safeNumber('quotation-box-x', 150), 0, Math.max(0, width - 40));
    const boxTopFromPage = clampNumber(safeNumber('quotation-box-y', 761), 0, Math.max(0, height - fontSize));
    const boxWidth = clampNumber(safeNumber('quotation-box-width', 2270), 40, Math.max(40, width - boxX - 12));
    const boxHeight = clampNumber(safeNumber('quotation-box-height', 2224), fontSize * 1.5, Math.max(fontSize * 1.5, height - boxTopFromPage - 12));
    const boxTopY = height - boxTopFromPage;
    const boxBottomY = Math.max(12, boxTopY - boxHeight);
    const lineHeight = fontSize * 1.28;
    const normalizedText = makePdfTextSafe(normalizePdfText(text), font);
    const allLines = wrapPdfText(normalizedText, font, fontSize, boxWidth);
    const maxLines = Math.max(1, Math.floor((boxTopY - boxBottomY - fontSize) / lineHeight) + 1);
    const lines = allLines.slice(0, maxLines);

    lines.forEach((line, index) => {
      const y = boxTopY - fontSize - index * lineHeight;
      if (y < boxBottomY) return;
      const textWidth = Math.min(font.widthOfTextAtSize(line, fontSize), boxWidth);
      const x = alignedPdfX(boxX, boxWidth, textWidth, align);
      page.drawText(line, {
        x,
        y,
        size: fontSize,
        font,
        color
      });

      if (underline && line) {
        page.drawLine({
          start: { x, y: y - Math.max(2, fontSize * 0.08) },
          end: { x: x + textWidth, y: y - Math.max(2, fontSize * 0.08) },
          thickness: Math.max(1, fontSize * 0.06),
          color
        });
      }
    });

    const pdfBytes = await pdfDoc.save();
    const blob = new Blob([pdfBytes], { type: 'application/pdf' });

    return { blob, lineCount: lines.length };
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

function checkedValue(name, fallback) {
  return document.querySelector(`input[name="${name}"]:checked`)?.value || fallback;
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
