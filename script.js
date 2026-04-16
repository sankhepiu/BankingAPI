// ============================================================
//  CloudBank — script.js
// ============================================================

const BASE_URL = "https://bk1nl0ev93.execute-api.us-east-1.amazonaws.com/default";

let currentAccountId = null;
let analyticsChart = null;

document.addEventListener("DOMContentLoaded", () => {
  initChart();
  const saved = localStorage.getItem("cloudbank_account_id");
  if (saved) {
    currentAccountId = saved;
    updateDisplayAccountId(saved);
    refreshDashboard();
  }
});

function updateDisplayAccountId(id) {
  const el = document.getElementById("active-account-display");
  if (el) el.textContent = `Active: …${id.slice(-6)}`;
}

function fmt(amount) {
  return "$" + Number(amount).toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

function fmtDate(iso) {
  if (!iso) return "—";
  const d = new Date(iso);
  const days = ["Sun","Mon","Tue","Wed","Thu","Fri","Sat"];
  return days[d.getDay()] + " " + d.toLocaleTimeString("en-US", { hour: "2-digit", minute: "2-digit" });
}

function setLoading(btnId, loading) {
  const btn = document.getElementById(btnId);
  if (!btn) return;
  btn.disabled = loading;
  btn.dataset.original = btn.dataset.original || btn.textContent;
  btn.textContent = loading ? "..." : btn.dataset.original;
}

function showToast(message, type = "success") {
  const toast = document.getElementById("toast");
  if (!toast) return;
  toast.textContent = message;
  toast.className = `show ${type}`;
  clearTimeout(toast._timer);
  toast._timer = setTimeout(() => toast.classList.remove("show"), 3500);
}

function showFraudAlert(reasons) {
  const box  = document.getElementById("fraud-alert");
  const list = document.getElementById("fraud-reasons");
  if (!box || !list) return;
  list.innerHTML = reasons.map(r => `<li>⚠ ${r}</li>`).join("");
  box.classList.remove("hidden");
  setTimeout(() => box.classList.add("hidden"), 8000);
}

function safeVal(id) {
  const el = document.getElementById(id);
  return el ? el.value : "";
}

function safeClear(...ids) {
  ids.forEach(id => { const el = document.getElementById(id); if (el) el.value = ""; });
}

function setEl(id, val) {
  const el = document.getElementById(id);
  if (el) el.textContent = val;
}

async function apiFetch(path, options = {}) {
  const res = await fetch(BASE_URL + path, {
    headers: { "Content-Type": "application/json" },
    ...options
  });
  const data = await res.json();
  if (!res.ok) throw new Error(data.detail || JSON.stringify(data));
  return data;
}

// ─── Transaction Rendering ──────────────────────────────────
const CATEGORY_MAP = [
  { icon: "🚕", color: "icon-yellow", label: "Taxi" },
  { icon: "✈️", color: "icon-pink",   label: "Flights" },
  { icon: "🛍️", color: "icon-blue",   label: "Shopping" },
  { icon: "🛵", color: "icon-purple", label: "Delivery" },
  { icon: "☕", color: "icon-yellow", label: "Coffee" },
  { icon: "🍔", color: "icon-pink",   label: "Restaurant" }
];

function renderTransactionList(txs) {
  const tList    = document.getElementById("tx-tbody");
  const dashList = document.getElementById("dashboard-tx-list");

  if (!txs || txs.length === 0) {
    const empty = `<div style="text-align:center;color:var(--muted);padding:20px 0;">No transactions yet.</div>`;
    if (tList)    tList.innerHTML    = empty;
    if (dashList) dashList.innerHTML = empty;
    return;
  }

  const makeHTML = (list) => list.map(t => {
    const isCredit = ["deposit", "transfer_received"].includes(t.type);
    const amountClass = isCredit ? "pos" : "neg";
    const amountSign  = isCredit ? "+" : "−";

    let iconHTML, title;
    if (isCredit) {
      iconHTML = `<div class="tx-icon icon-purple">💼</div>`;
      title = t.note || (t.type === "transfer_received" ? "Transfer In" : "Deposit");
    } else {
      const hash = String(t.timestamp || "").split("").reduce((a, b) => { a = ((a << 5) - a) + b.charCodeAt(0); return a & a; }, 0);
      const cat  = CATEGORY_MAP[Math.abs(hash) % CATEGORY_MAP.length];
      iconHTML = `<div class="tx-icon ${cat.color}">${cat.icon}</div>`;
      title = t.type === "transfer_sent" ? "Transfer Out" : cat.label;
    }

    const fraudBadge = t.fraud_flag
      ? `<span style="margin-left:6px;font-size:0.72rem;background:rgba(255,92,119,0.15);color:#ff5c77;border:1px solid rgba(255,92,119,0.3);border-radius:4px;padding:1px 6px;">🚨 Flagged</span>`
      : "";

    return `
      <div class="tx-item">
        <div class="tx-left">
          ${iconHTML}
          <div class="tx-info">
            <span class="tx-title">${title}${fraudBadge}</span>
            <span class="tx-time">${fmtDate(t.timestamp)}</span>
          </div>
        </div>
        <div class="tx-amount ${amountClass}">${amountSign}${fmt(t.amount)}</div>
      </div>`;
  }).join("");

  if (tList)    tList.innerHTML    = makeHTML(txs.slice(0, 50));
  if (dashList) dashList.innerHTML = makeHTML(txs.slice(0, 12));
}

// ─── Dashboard Refresh ──────────────────────────────────────
async function refreshDashboard() {
  if (!currentAccountId) return;
  try {
    const [balance, analytics, txData] = await Promise.all([
      apiFetch(`/balance/${currentAccountId}`),
      apiFetch(`/analytics/${currentAccountId}`),
      apiFetch(`/transactions/${currentAccountId}`)
    ]);

    setEl("card-balance",  fmt(balance.balance));
    setEl("card-income",   fmt(analytics.total_deposited + analytics.total_received));
    setEl("card-spending", fmt(analytics.total_withdrawn + analytics.total_sent));
    setEl("stat-total-tx",  analytics.total_transactions);
    setEl("stat-deposited", fmt(analytics.total_deposited));
    setEl("stat-withdrawn", fmt(analytics.total_withdrawn));
    setEl("stat-sent",      fmt(analytics.total_sent));
    setEl("stat-received",  fmt(analytics.total_received));
    setEl("stat-flagged",   analytics.suspicious_transactions);

    updateChart(analytics.chart_data);
    renderTransactionList(txData.transactions);
  } catch (err) {
    showToast("Refresh failed: " + err.message, "error");
  }
}

// ─── Chart ──────────────────────────────────────────────────
function initChart() {
  const canvas = document.getElementById("chart");
  if (!canvas) return;
  analyticsChart = new Chart(canvas.getContext("2d"), {
    type: "line",
    data: {
      labels: [],
      datasets: [
        { label: "Deposits / Received", data: [], borderColor: "#52c48e", backgroundColor: "rgba(82,196,142,0.1)", fill: true, tension: 0.4, borderWidth: 2, pointRadius: 0 },
        { label: "Withdrawals / Sent",  data: [], borderColor: "#ff5c77", backgroundColor: "rgba(255,92,119,0.1)", fill: true, tension: 0.4, borderWidth: 2, pointRadius: 0 }
      ]
    },
    options: {
      responsive: true, maintainAspectRatio: false,
      plugins: {
        legend: { labels: { color: "#8a8a93" } },
        tooltip: { mode: "index", intersect: false, callbacks: { label: ctx => "  " + fmt(ctx.parsed.y) } }
      },
      scales: {
        x: { ticks: { color: "#8a8a93", maxTicksLimit: 5 }, grid: { color: "rgba(255,255,255,0.05)" } },
        y: { ticks: { color: "#8a8a93", callback: v => "$" + Number(v).toLocaleString() }, grid: { color: "rgba(255,255,255,0.05)" } }
      }
    }
  });
}

function updateChart(chartData) {
  if (!analyticsChart || !chartData) return;
  analyticsChart.data.labels = chartData.labels;
  analyticsChart.data.datasets[0].data = chartData.deposits;
  analyticsChart.data.datasets[1].data = chartData.withdrawals;
  analyticsChart.update("active");
}

// ─── Actions ────────────────────────────────────────────────
async function createAccount() {
  const name    = safeVal("name").trim();
  const initial = parseFloat(safeVal("initial"));
  if (!name || isNaN(initial)) return showToast("Enter a valid name and balance.", "error");
  setLoading("btn-create", true);
  try {
    const data = await apiFetch("/create-account", {
      method: "POST",
      body: JSON.stringify({ name, initial_balance: initial })
    });
    currentAccountId = data.account_id;
    localStorage.setItem("cloudbank_account_id", currentAccountId);
    updateDisplayAccountId(currentAccountId);
    setEl("new-account-id", data.account_id);
    const box = document.getElementById("account-created-box");
    if (box) box.classList.remove("hidden");
    safeClear("name", "initial");
    showToast(`Account created for ${data.name}!`);
    refreshDashboard();
  } catch (err) {
    showToast(err.message, "error");
  } finally {
    setLoading("btn-create", false);
  }
}

async function doDeposit() {
  const id     = safeVal("deposit_account_id").trim() || currentAccountId;
  const amount = parseFloat(safeVal("deposit_amount"));
  if (!id || isNaN(amount)) return showToast("Enter account ID and amount.", "error");
  setLoading("btn-deposit", true);
  try {
    const data = await apiFetch("/deposit", {
      method: "POST",
      body: JSON.stringify({ account_id: id, amount })
    });
    showToast(`Deposited ${fmt(amount)}! Balance: ${fmt(data.balance)}`);
    if (data.fraud_flag) showFraudAlert(data.fraud_reasons);
    safeClear("deposit_amount");
    if (id === currentAccountId) refreshDashboard();
  } catch (err) {
    showToast(err.message, "error");
  } finally {
    setLoading("btn-deposit", false);
  }
}

async function doWithdraw() {
  const id     = safeVal("withdraw_account_id").trim() || currentAccountId;
  const amount = parseFloat(safeVal("withdraw_amount"));
  if (!id || isNaN(amount)) return showToast("Enter account ID and amount.", "error");
  setLoading("btn-withdraw", true);
  try {
    const data = await apiFetch("/withdraw", {
      method: "POST",
      body: JSON.stringify({ account_id: id, amount })
    });
    showToast(`Withdrew ${fmt(amount)}! Balance: ${fmt(data.balance)}`);
    if (data.fraud_flag) showFraudAlert(data.fraud_reasons);
    safeClear("withdraw_amount");
    if (id === currentAccountId) refreshDashboard();
  } catch (err) {
    showToast(err.message, "error");
  } finally {
    setLoading("btn-withdraw", false);
  }
}

async function transfer() {
  const from   = safeVal("transfer_from").trim() || currentAccountId;
  const to     = safeVal("transfer_to").trim();
  const amount = parseFloat(safeVal("transfer_amount"));
  if (!from || !to || isNaN(amount)) return showToast("Fill all transfer fields.", "error");
  setLoading("btn-transfer", true);
  try {
    const data = await apiFetch("/transfer", {
      method: "POST",
      body: JSON.stringify({ from_account: from, to_account: to, amount })
    });
    showToast("Transfer successful!");
    if (data.fraud_flag) showFraudAlert(data.fraud_reasons);
    safeClear("transfer_to", "transfer_amount");
    if (from === currentAccountId) refreshDashboard();
  } catch (err) {
    showToast(err.message, "error");
  } finally {
    setLoading("btn-transfer", false);
  }
}

async function loadAccount() {
  const id = safeVal("load_account_id").trim();
  if (!id) return showToast("Enter an account ID.", "error");
  try {
    const data = await apiFetch(`/balance/${id}`);
    currentAccountId = id;
    localStorage.setItem("cloudbank_account_id", currentAccountId);
    updateDisplayAccountId(currentAccountId);
    safeClear("load_account_id");
    showToast(`Loaded: ${data.name}`);
    if (typeof navTo === "function") navTo("dashboard");
    refreshDashboard();
  } catch (err) {
    showToast(err.message, "error");
  }
}
