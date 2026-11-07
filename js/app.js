import { firebaseConfig, APP_NAME } from './config.js';
import { createStore } from './store.js';
import { parseText, parseAbnXlsRows, decodeBytes, parseAmount } from './parser.js';
import { GROUPS, CATEGORIES, GROUP_BY_ID, catInfo, groupOf, UNCATEGORIZED, UNCATEGORIZED_IN } from './categories.js';
import * as L from './logic.js';
import { buildDemoTxt, DEMO_SETTINGS } from './demo.js';

const VERSION = '1.2.0';
const $ = (s, el = document) => el.querySelector(s);
const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const eur = (n, whole) => L.fmtEur(n, { whole });
const sgn = (n, whole) => `<span style="white-space:nowrap">${n >= 0 ? '+' : '−'}${eur(Math.abs(n), whole)}</span>`;
const todayIso = () => { const d = new Date(); return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`; };
const MONTHS_SHORT = ['jan', 'feb', 'mrt', 'apr', 'mei', 'jun', 'jul', 'aug', 'sep', 'okt', 'nov', 'dec'];
const MONTHS_LONG = ['januari', 'februari', 'maart', 'april', 'mei', 'juni', 'juli', 'augustus', 'september', 'oktober', 'november', 'december'];
const WEEKDAYS = ['ma', 'di', 'wo', 'do', 'vr', 'za', 'zo'];

const DEFAULT_SETTINGS = {
  rules: [], payers: [], accounts: {}, ownIbans: [], savingsStart: 0, investStart: 0,
  investSnapshots: [], matchDays: 45, imports: [],
};

const S = {
  store: null,
  txs: [],
  settings: { ...DEFAULT_SETTINGS },
  view: 'overzicht',
  period: { mode: 'month', anchor: null, from: null, to: null },
  tx: { q: '', kind: 'all', cat: '', sort: 'new', scope: 'period', limit: 150 },
  analyse: 'categorie',
  trendGroups: null,
  charts: {},
  dirtyIds: new Set(),
  dirtySettings: false,
  saveTimer: null,
};

/* ---------- Hulpfuncties ---------- */

function toast(msg, action) {
  const el = $('#toast');
  el.innerHTML = `<span>${esc(msg)}</span>${action ? `<button type="button">${esc(action.label)}</button>` : ''}`;
  if (action) el.querySelector('button').onclick = () => { el.classList.remove('show'); action.run(); };
  el.classList.add('show');
  clearTimeout(toast.t);
  toast.t = setTimeout(() => el.classList.remove('show'), action ? 6000 : 2600);
}

function cssVar(n) { return getComputedStyle(document.documentElement).getPropertyValue(n).trim(); }

function monthLabel(mk, long = true) {
  const [y, m] = mk.split('-').map(Number);
  return long ? `${MONTHS_LONG[m - 1]} ${y}` : `${MONTHS_SHORT[m - 1]}`;
}

function shiftMonth(mk, n) {
  let [y, m] = mk.split('-').map(Number);
  m += n;
  while (m > 12) { m -= 12; y++; }
  while (m < 1) { m += 12; y--; }
  return `${y}-${String(m).padStart(2, '0')}`;
}

function fmtDate(d, withYear = true) {
  const [y, m, day] = d.split('-').map(Number);
  const wd = WEEKDAYS[(new Date(y, m - 1, day).getDay() + 6) % 7];
  return `${wd} ${day} ${MONTHS_SHORT[m - 1]}${withYear ? ' ' + y : ''}`;
}

function compactEur(v) {
  const a = Math.abs(v);
  if (a >= 1000) return `€${(v / 1000).toLocaleString('nl-NL', { maximumFractionDigits: 1 })}k`;
  return `€${Math.round(v)}`;
}

function splitEur(n) {
  const s = eur(Math.abs(n));
  const i = s.lastIndexOf(',');
  return { main: (n < 0 ? '−' : '') + s.slice(0, i), cents: s.slice(i) };
}

function visibleTxs() {
  const ignored = new Set(Object.entries(S.settings.accounts || {}).filter(([, v]) => v.role === 'negeren').map(([k]) => k));
  return ignored.size ? S.txs.filter((t) => !ignored.has(t.account)) : S.txs;
}

function mainAcc() { return L.mainAccount(S.settings, S.txs); }

function dataMonths() {
  const ms = [...new Set(visibleTxs().map((t) => t.date.slice(0, 7)))].sort();
  return ms;
}

function currentMonth() { return todayIso().slice(0, 7); }

/* ---------- Periode ---------- */

function periodRange(p = S.period) {
  const ms = dataMonths();
  if (p.mode === 'month') return { from: `${p.anchor}-01`, to: L.lastDayOfMonth(p.anchor) };
  if (p.mode === 'year') return { from: `${p.anchor}-01-01`, to: `${p.anchor}-12-31` };
  if (p.mode === 'last12') {
    const end = ms.length ? ms[ms.length - 1] : currentMonth();
    return { from: `${shiftMonth(end, -11)}-01`, to: L.lastDayOfMonth(end) };
  }
  if (p.mode === 'custom') return { from: p.from, to: p.to };
  if (!ms.length) return { from: `${currentMonth()}-01`, to: L.lastDayOfMonth(currentMonth()) };
  return { from: `${ms[0]}-01`, to: L.lastDayOfMonth(ms[ms.length - 1]) };
}

function isPartialMonth() { return S.period.mode === 'month' && S.period.anchor === currentMonth(); }

function prevRange() {
  const p = S.period;
  if (p.mode === 'month') {
    const r = periodRange({ mode: 'month', anchor: shiftMonth(p.anchor, -1) });
    if (isPartialMonth()) {
      const day = todayIso().slice(8, 10);
      const to = `${shiftMonth(p.anchor, -1)}-${day}`;
      return { from: r.from, to: to < r.to ? to : r.to };
    }
    return r;
  }
  if (p.mode === 'year') return periodRange({ mode: 'year', anchor: String(Number(p.anchor) - 1) });
  if (p.mode === 'last12') {
    const r = periodRange();
    const endM = r.to.slice(0, 7);
    return { from: `${shiftMonth(endM, -23)}-01`, to: L.lastDayOfMonth(shiftMonth(endM, -12)) };
  }
  return null;
}

function periodLabel() {
  const p = S.period;
  if (p.mode === 'month') return monthLabel(p.anchor);
  if (p.mode === 'year') return p.anchor;
  if (p.mode === 'last12') return 'Laatste 12 maanden';
  if (p.mode === 'custom') return `${fmtDate(p.from)} tot ${fmtDate(p.to)}`;
  return 'Alles';
}

function periodNoun() {
  const p = S.period;
  if (p.mode === 'month') return MONTHS_LONG[Number(p.anchor.slice(5)) - 1];
  if (p.mode === 'year') return p.anchor;
  if (p.mode === 'last12') return 'de laatste 12 maanden';
  return 'deze periode';
}

function prevNoun() {
  const p = S.period;
  if (p.mode === 'month') {
    const m = MONTHS_SHORT[Number(shiftMonth(p.anchor, -1).slice(5)) - 1];
    return isPartialMonth() ? `1 tot ${Number(todayIso().slice(8, 10))} ${m}` : m;
  }
  if (p.mode === 'year') return String(Number(p.anchor) - 1);
  if (p.mode === 'last12') return 'jaar ervoor';
  return '';
}

function chartMonths() {
  const p = S.period;
  const r = periodRange();
  if (p.mode === 'month') return L.monthsBetween(shiftMonth(p.anchor, -5), p.anchor);
  const ms = L.monthsBetween(r.from.slice(0, 7), r.to.slice(0, 7));
  return ms.length > 36 ? ms.slice(-36) : ms;
}

function defaultAnchor() {
  const ms = dataMonths();
  const cur = currentMonth();
  if (!ms.length || ms.includes(cur)) return cur;
  return ms[ms.length - 1];
}

/* ---------- Opslaan ---------- */

function setSaveState(state) {
  const d = $('#saveDot');
  if (!d) return;
  d.className = 'save-dot' + (state === 'busy' ? ' busy' : state === 'err' ? ' err' : '');
  d.title = state === 'busy' ? 'Opslaan' : state === 'err' ? 'Opslaan mislukt' : 'Opgeslagen';
}

function markTx(...txs) { for (const t of txs) S.dirtyIds.add(t.id); scheduleSave(); }
function markIds(ids) { for (const id of ids) S.dirtyIds.add(id); scheduleSave(); }
function markSettings() { S.dirtySettings = true; scheduleSave(); }

function scheduleSave() {
  clearTimeout(S.saveTimer);
  setSaveState('busy');
  S.saveTimer = setTimeout(flush, 700);
}

async function flush() {
  clearTimeout(S.saveTimer);
  const ids = [...S.dirtyIds];
  const settings = S.dirtySettings;
  S.dirtyIds.clear();
  S.dirtySettings = false;
  if (!ids.length && !settings) { setSaveState('ok'); return; }
  try {
    if (ids.length) await S.store.saveTxs(ids, S.txs);
    if (settings) await S.store.saveSettings(S.settings);
    setSaveState('ok');
  } catch (e) {
    console.error(e);
    ids.forEach((id) => S.dirtyIds.add(id));
    if (settings) S.dirtySettings = true;
    setSaveState('err');
    toast('Opslaan mislukt: ' + e.message);
  }
}

document.addEventListener('visibilitychange', () => { if (document.visibilityState === 'hidden') flush(); });

// Opnieuw indelen en terugbetalingen koppelen. Markeert gewijzigde maanden.
function recompute() {
  const before = new Map(S.txs.map((t) => [t.id, `${t.category}|${(t.reimbFor || []).join(',')}|${t.unmatched ? 1 : 0}`]));
  for (const t of S.txs) delete t.unmatched;
  L.applyRules(S.txs, S.settings);
  const matches = L.autoMatchReimbursements(S.txs, S.settings);
  const changed = S.txs.filter((t) => before.get(t.id) !== `${t.category}|${(t.reimbFor || []).join(',')}|${t.unmatched ? 1 : 0}`);
  if (changed.length) markTx(...changed);
  return { changed: changed.length, matches };
}

/* ---------- Sheets ---------- */

function closeSheet() {
  const root = $('#sheetRoot');
  const sheet = root.querySelector('.sheet');
  const bd = root.querySelector('.sheet-backdrop');
  if (!sheet) return;
  sheet.classList.remove('show');
  bd.classList.remove('show');
  setTimeout(() => { if (!root.querySelector('.sheet.show')) root.innerHTML = ''; }, 260);
}

function openSheet({ title, body, foot = '', onMount }) {
  const root = $('#sheetRoot');
  root.innerHTML = `
    <div class="sheet-backdrop" data-act="sheet-close"></div>
    <div class="sheet" role="dialog" aria-modal="true" aria-label="${esc(title)}">
      <div class="sheet-grab"></div>
      <div class="sheet-head"><h3>${esc(title)}</h3><button class="icon-btn" data-act="sheet-close" aria-label="Sluiten">✕</button></div>
      <div class="sheet-body">${body}</div>
      ${foot ? `<div class="sheet-foot">${foot}</div>` : ''}
    </div>`;
  const sheet = root.querySelector('.sheet');
  requestAnimationFrame(() => { sheet.classList.add('show'); root.querySelector('.sheet-backdrop').classList.add('show'); });
  if (onMount) onMount(sheet);
  return sheet;
}

document.addEventListener('keydown', (e) => { if (e.key === 'Escape') closeSheet(); });

/* ---------- Grafieken ---------- */

function destroyCharts() { Object.values(S.charts).forEach((c) => c.destroy()); S.charts = {}; }

function makeChart(id, cfg) {
  const el = document.getElementById(id);
  if (!el || !window.Chart) return;
  S.charts[id]?.destroy();
  S.charts[id] = new window.Chart(el, cfg);
}

function chartDefaults() {
  if (!window.Chart) return;
  const C = window.Chart;
  C.defaults.font.family = cssVar('--font') || 'system-ui';
  C.defaults.font.size = 12;
  C.defaults.color = cssVar('--muted');
  C.defaults.borderColor = cssVar('--grid');
  C.defaults.plugins.legend.display = false;
  C.defaults.plugins.tooltip.backgroundColor = cssVar('--ink');
  C.defaults.plugins.tooltip.titleColor = cssVar('--page');
  C.defaults.plugins.tooltip.bodyColor = cssVar('--page');
  C.defaults.plugins.tooltip.padding = 10;
  C.defaults.plugins.tooltip.cornerRadius = 10;
  C.defaults.plugins.tooltip.boxPadding = 4;
  C.defaults.animation.duration = window.matchMedia('(prefers-reduced-motion: reduce)').matches ? 0 : 450;
  C.defaults.maintainAspectRatio = false;
}

const euroAxis = { ticks: { callback: (v) => compactEur(v), maxTicksLimit: 5 }, grid: { drawTicks: false }, border: { display: false } };

/* ---------- Weergave: schil ---------- */

const ICONS = {
  overzicht: '<svg viewBox="0 0 24 24"><path d="M4 13a8 8 0 1 1 16 0"/><path d="M12 13l4-4"/><path d="M4 17h16"/></svg>',
  transacties: '<svg viewBox="0 0 24 24"><path d="M5 7h14M5 12h14M5 17h9"/></svg>',
  analyse: '<svg viewBox="0 0 24 24"><path d="M5 19V11M10 19V5M15 19v-6M20 19V9"/></svg>',
  vermogen: '<svg viewBox="0 0 24 24"><path d="M3 18l5-6 4 3 6-8 3 3"/><path d="M3 21h18"/></svg>',
  meer: '<svg viewBox="0 0 24 24"><circle cx="12" cy="12" r="3"/><path d="M12 2v3M12 19v3M4.2 4.2l2.1 2.1M17.7 17.7l2.1 2.1M2 12h3M19 12h3M4.2 19.8l2.1-2.1M17.7 6.3l2.1-2.1"/></svg>',
};
const TAB_NAMES = { overzicht: 'Overzicht', transacties: 'Transacties', analyse: 'Analyse', vermogen: 'Vermogen', meer: 'Meer' };

function render() {
  destroyCharts();
  const app = $('#app');
  const showPeriod = ['overzicht', 'transacties', 'analyse'].includes(S.view) && S.txs.length;
  const p = S.period;
  const ms = dataMonths();
  const canPrev = p.mode === 'month' ? ms.length && p.anchor > ms[0] : p.mode === 'year' ? ms.length && p.anchor > ms[0].slice(0, 4) : false;
  const canNext = p.mode === 'month' ? p.anchor < currentMonth() : p.mode === 'year' ? p.anchor < currentMonth().slice(0, 4) : false;
  app.innerHTML = `
    <div class="shell">
      <header class="topbar">
        <div class="brand"><span class="brand-mark" aria-hidden="true"></span>${esc(APP_NAME)}</div>
        <span id="saveDot" class="save-dot" title="Opgeslagen"></span>
        <button class="icon-btn" data-act="import" aria-label="Bankbestand importeren" title="Importeren">⤓</button>
      </header>
      ${showPeriod ? `
      <div class="period">
        <button class="period-btn" data-act="period-prev" aria-label="Vorige periode" ${canPrev ? '' : 'disabled'}>‹</button>
        <div class="period-label">${esc(periodLabel())}</div>
        <button class="period-btn" data-act="period-next" aria-label="Volgende periode" ${canNext ? '' : 'disabled'}>›</button>
      </div>
      <div class="chips" role="tablist" aria-label="Periode">
        ${[['month', 'Maand'], ['year', 'Jaar'], ['last12', '12 maanden'], ['all', 'Alles'], ['custom', 'Kies datums']].map(([m, l]) => `<button class="chip ${p.mode === m ? 'on' : ''}" data-act="period-mode" data-v="${m}">${l}</button>`).join('')}
      </div>` : ''}
      <main id="main">${renderView()}</main>
    </div>
    <nav class="tabbar" aria-label="Hoofdmenu"><div class="tabbar-inner">
      ${Object.keys(TAB_NAMES).map((v) => `<button class="tab ${S.view === v ? 'on' : ''}" data-act="nav" data-v="${v}" ${S.view === v ? 'aria-current="page"' : ''}>${ICONS[v]}<span>${TAB_NAMES[v]}</span></button>`).join('')}
    </div></nav>`;
  setSaveState(S.dirtyIds.size || S.dirtySettings ? 'busy' : 'ok');
  afterRender();
}

function renderView() {
  if (!S.txs.length && S.view !== 'meer') return renderEmpty();
  switch (S.view) {
    case 'transacties': return renderTransactions();
    case 'analyse': return renderAnalyse();
    case 'vermogen': return renderNetWorth();
    case 'meer': return renderSettings();
    default: return renderOverview();
  }
}

function afterRender() {
  chartDefaults();
  if (!S.txs.length) return;
  if (S.view === 'overzicht') drawOverviewCharts();
  if (S.view === 'analyse') drawAnalyseCharts();
  if (S.view === 'vermogen') drawNetWorthChart();
  if (S.view === 'transacties') {
    const inp = $('#txSearch');
    if (inp && S.tx.focus) { inp.focus(); inp.setSelectionRange(inp.value.length, inp.value.length); S.tx.focus = false; }
  }
}

function renderEmpty() {
  return `
    <div class="empty" style="padding-top:60px">
      <h3>Nog geen transacties</h3>
      <p>Download je bij- en afschrijvingen bij ABN AMRO als TXT- of XLS-bestand en importeer ze hier. Je kunt ook eerst met voorbeeldgegevens rondkijken.</p>
      <div class="btn-row" style="justify-content:center">
        <button class="btn" data-act="import">Bestand importeren</button>
        <button class="btn ghost" data-act="demo">Voorbeeld bekijken</button>
      </div>
      <p class="help" style="margin-top:22px">In internetbankieren: Zelf regelen, Bij- en afschrijvingen downloaden, kies TXT.</p>
    </div>`;
}

/* ---------- Overzicht ---------- */

function groupColor(id) { return GROUP_BY_ID[id]?.color || '#a8a29e'; }

function deltaText(cur, prev, lowerIsGood) {
  if (prev == null || !prev) return '';
  const d = (cur - prev) / Math.abs(prev);
  if (!isFinite(d)) return '';
  const pct = Math.round(d * 100);
  if (pct === 0) return `gelijk aan ${prevNoun()}`;
  const word = pct > 0 ? 'meer' : 'minder';
  void lowerIsGood;
  return `${Math.abs(pct)}% ${word} dan ${prevNoun()}`;
}

function renderOverview() {
  const vt = visibleTxs();
  const range = periodRange();
  const s = L.summarize(vt, S.settings, range);
  const pr = prevRange();
  const ps = pr ? L.summarize(vt, S.settings, pr) : null;
  const main = mainAcc();
  const inPeriod = vt.filter((t) => t.account === main && L.inRange(t, range));
  const uncategorized = inPeriod.filter((t) => t.category === UNCATEGORIZED || t.category === UNCATEGORIZED_IN).length;
  const unmatched = vt.filter((t) => t.unmatched).length;
  const net = splitEur(s.net);
  const moved = s.saved + s.invested;

  // Lint: waar het binnengekomen geld naartoe ging
  const groups = Object.entries(s.byGroup).filter(([, v]) => v > 0).sort((a, b) => b[1] - a[1]);
  const segs = groups.map(([g, v]) => ({ label: GROUP_BY_ID[g].name, value: v, color: groupColor(g), act: `data-act="group" data-v="${g}"` }));
  if (s.saved > 0) segs.push({ label: 'Sparen', value: s.saved, color: cssVar('--s-spaar') });
  if (s.invested > 0) segs.push({ label: 'Beleggen', value: s.invested, color: cssVar('--s-invest') });
  const used = segs.reduce((a, b) => a + b.value, 0);
  const left = s.income - used;
  if (left > 0) segs.push({ label: 'Nog over', value: left, cls: 'left' });
  const total = Math.max(s.income, used) || 1;
  const legendSegs = segs.filter((x) => x.value / total >= 0.04 || x.cls === 'left' || x.label === 'Sparen' || x.label === 'Beleggen');

  const ribbonTitle = s.income > 0 ? `Waar je inkomen in ${periodNoun()} heen ging` : `Waar je geld in ${periodNoun()} heen ging`;
  const sub = s.income > 0
    ? `Je ontving <strong>${eur(s.income)}</strong> en gaf <strong>${eur(s.expense)}</strong> uit.${moved > 0 ? ` Daarnaast zette je <strong>${eur(moved)}</strong> opzij.` : ''}`
    : `Je gaf <strong>${eur(s.expense)}</strong> uit.`;

  const merchants = Object.values(s.byMerchant).filter((m) => m.total > 0).sort((a, b) => b.total - a.total).slice(0, 6);
  const maxM = merchants[0]?.total || 1;
  const rmap = L.reimbursementMap(vt);
  const recentMatches = vt.filter((t) => t.reimbFor && t.reimbFor.length && L.inRange(t, range)).sort((a, b) => b.date.localeCompare(a.date)).slice(0, 4);

  return `
    <section class="hero">
      <p class="hero-label">${s.net >= 0 ? 'Over' : 'Tekort'} in ${esc(periodNoun())}${isPartialMonth() ? ' tot nu toe' : ''}</p>
      <div class="hero-num num ${s.net < 0 ? 'neg' : ''}"><span>${net.main}</span><span class="cents">${net.cents}</span></div>
      <p class="hero-sub">${sub}</p>
      <div class="ribbon" role="img" aria-label="${esc(ribbonTitle)}">
        ${segs.map((x) => `<span ${x.act || ''} class="${x.cls || ''}" style="flex-grow:${x.value};${x.color ? `background:${x.color}` : ''}" title="${esc(x.label)}: ${eur(x.value)}"></span>`).join('')}
      </div>
      <div class="ribbon-legend">
        ${legendSegs.map((x) => `<span><i style="background:${x.color || 'var(--line)'}"></i>${esc(x.label)} ${Math.round((x.value / total) * 100)}%</span>`).join('')}
      </div>
    </section>

    ${uncategorized ? `<button class="banner" data-act="quick"><div><b>${uncategorized} ${uncategorized === 1 ? 'transactie' : 'transacties'} nog niet ingedeeld</b><span>Deel ze in, dan onthoudt de app het voor de volgende keer.</span></div><span class="go">Indelen</span></button>` : ''}
    ${unmatched ? `<button class="banner" data-act="unmatched"><div><b>${unmatched} ${unmatched === 1 ? 'terugbetaling' : 'terugbetalingen'} niet gekoppeld</b><span>Geen uitgave met precies dat bedrag gevonden. Koppel ze zelf.</span></div><span class="go">Bekijken</span></button>` : ''}

    <section>
      <div class="stats">
        <div class="stat"><div class="stat-label">Inkomsten</div><div class="stat-value num">${eur(s.income, true)}</div><div class="stat-delta">${ps ? deltaText(s.income, ps.income) : ''}</div></div>
        <div class="stat"><div class="stat-label">Uitgaven</div><div class="stat-value num">${eur(s.expense, true)}</div><div class="stat-delta">${ps ? deltaText(s.expense, ps.expense, true) : ''}</div></div>
        <div class="stat"><div class="stat-label">Opzij gezet</div><div class="stat-value num">${eur(moved, true)}</div><div class="stat-delta">${s.income > 0 && moved > 0 ? `${Math.round((moved / s.income) * 100)}% van je inkomen` : ''}</div></div>
      </div>
    </section>

    <section>
      <h2>Uitgaven per categorie <span class="aside">${s.count} uitgaven</span></h2>
      ${groups.length ? `
      <div class="donut-wrap">
        <div class="donut-box"><canvas id="donut" aria-label="Uitgaven per categorie"></canvas><div class="donut-center"><b class="num">${eur(s.expense, true)}</b><small>uitgegeven</small></div></div>
        <ul class="bars">
          ${groups.map(([g, v]) => `<li><button class="bar-row" data-act="group" data-v="${g}">
            <span class="bar-ico">${GROUP_BY_ID[g].icon}</span>
            <span class="bar-name">${esc(GROUP_BY_ID[g].name)}</span>
            <span class="bar-val num">${eur(v, true)}</span>
            <span class="bar-track"><span class="bar-fill" style="width:${(v / groups[0][1]) * 100}%;background:${groupColor(g)}"></span></span>
          </button></li>`).join('')}
        </ul>
      </div>` : '<p class="muted">Geen uitgaven in deze periode.</p>'}
    </section>

    <section>
      <h2>Per maand</h2>
      <div class="panel">
        <div class="legend"><span><i style="background:var(--s-income)"></i>Inkomsten</span><span><i style="background:var(--s-expense)"></i>Uitgaven</span></div>
        <div class="chart-box"><canvas id="monthBars" aria-label="Inkomsten en uitgaven per maand"></canvas></div>
      </div>
    </section>

    ${merchants.length ? `
    <section>
      <h2>Waar je het meest uitgaf</h2>
      <ul class="bars">
        ${merchants.map((m) => `<li><button class="bar-row" data-act="merchant" data-v="${esc(m.key)}">
          <span class="bar-ico">${catInfo(m.category).icon}</span>
          <span class="bar-name">${esc(m.name)}<span class="bar-meta">${m.count}×</span></span>
          <span class="bar-val num">${eur(m.total)}</span>
          <span class="bar-track"><span class="bar-fill" style="width:${(m.total / maxM) * 100}%;background:${groupColor(catInfo(m.category).group)}"></span></span>
        </button></li>`).join('')}
      </ul>
    </section>` : ''}

    ${(s.advanceOpen > 0 || recentMatches.length) ? `
    <section>
      <h2>Voorgeschoten${s.advanceOpen > 0 ? ` <span class="aside">${eur(s.advanceOpen)} open</span>` : ''}</h2>
      <div class="tx-list">
        ${s.advanceOpenList.slice(0, 5).map((t) => txRow(t, rmap, 'Wacht op terugbetaling')).join('')}
        ${recentMatches.map((t) => txRow(t, rmap)).join('')}
      </div>
      <p class="help">Terugbetalingen met exact hetzelfde bedrag worden automatisch gekoppeld en tellen dan niet mee als uitgave of inkomen.</p>
    </section>` : ''}
  `;
}

function drawOverviewCharts() {
  const vt = visibleTxs();
  const s = L.summarize(vt, S.settings, periodRange());
  const groups = Object.entries(s.byGroup).filter(([, v]) => v > 0).sort((a, b) => b[1] - a[1]);
  const surface = cssVar('--page');
  makeChart('donut', {
    type: 'doughnut',
    data: { labels: groups.map(([g]) => GROUP_BY_ID[g].name), datasets: [{ data: groups.map(([, v]) => Math.round(v * 100) / 100), backgroundColor: groups.map(([g]) => groupColor(g)), borderColor: surface, borderWidth: 2, hoverOffset: 6 }] },
    options: {
      cutout: '70%',
      plugins: { tooltip: { callbacks: { label: (c) => ` ${c.label}: ${eur(c.raw)}` } } },
      onClick: (_e, els) => { if (els.length) openGroup(groups[els[0].index][0]); },
    },
  });
  const months = chartMonths();
  const data = L.monthly(vt, S.settings, months);
  makeChart('monthBars', {
    type: 'bar',
    data: {
      labels: months.map((m) => monthLabel(m, false)),
      datasets: [
        { label: 'Inkomsten', data: data.map((d) => Math.round(d.income)), backgroundColor: cssVar('--s-income'), borderRadius: 4, maxBarThickness: 18 },
        { label: 'Uitgaven', data: data.map((d) => Math.round(d.expense)), backgroundColor: cssVar('--s-expense'), borderRadius: 4, maxBarThickness: 18 },
      ],
    },
    options: {
      interaction: { mode: 'index', intersect: false },
      scales: { x: { grid: { display: false }, border: { display: false } }, y: euroAxis },
      plugins: { tooltip: { callbacks: { title: (c) => monthLabel(months[c[0].dataIndex]), label: (c) => ` ${c.dataset.label}: ${eur(c.raw)}`, afterBody: (c) => `Over: ${eur(data[c[0].dataIndex].net)}` } } },
      onClick: (_e, els) => { if (els.length) { S.period = { mode: 'month', anchor: months[els[0].index] }; render(); window.scrollTo(0, 0); } },
    },
  });
}

/* ---------- Transactierij ---------- */

function txRow(t, rmap, note, opts = {}) {
  const cat = catInfo(t.category);
  const g = groupOf(t.category);
  const k = L.kindOf(t);
  const back = rmap?.get(t.id) || 0;
  const tags = [];
  if (k === 'terugbetaling') tags.push('<span class="tag ok">terugbetaling</span>');
  if (t.advance && !back) tags.push('<span class="tag acc">voorgeschoten</span>');
  if (back > 0) tags.push(`<span class="tag ok">${back >= -t.amount - 0.001 ? 'terugbetaald' : eur(back) + ' terug'}</span>`);
  if (t.excluded) tags.push('<span class="tag">telt niet mee</span>');
  if (t.unmatched) tags.push('<span class="tag acc">niet gekoppeld</span>');
  const role = L.accountRole(S.settings, t.account, S.txs);
  if (role === 'spaar') tags.push('<span class="tag">spaarrekening</span>');
  const voided = t.excluded || k === 'terugbetaling' || (back > 0 && back >= -t.amount - 0.001) || (t.advance && !back);
  const sign = t.amount > 0 ? '+' : '−';
  return `<button class="tx" data-act="tx" data-v="${t.id}">
    <span class="tx-ico" style="background:color-mix(in srgb, ${g.color} 16%, transparent)">${cat.icon}</span>
    <span class="tx-main"><div class="tx-name">${esc(t.name || 'Onbekend')}</div><div class="tx-sub">${esc(note || cat.name)}${tags.join('')}</div></span>
    <span class="tx-amt num ${t.amount > 0 ? 'in' : ''} ${voided ? 'void' : ''}"><span class="amt">${sign}${eur(Math.abs(t.amount))}</span>${opts.noDate ? '' : `<small>${fmtDate(t.date, false)}</small>`}</span>
  </button>`;
}

/* ---------- Transacties ---------- */

function filteredTxs() {
  const f = S.tx;
  const range = f.scope === 'period' ? periodRange() : null;
  const q = L.normalize(f.q).trim();
  let list = visibleTxs().filter((t) => L.inRange(t, range));
  if (q) list = list.filter((t) => L.normalize(`${t.name} ${t.desc} ${catInfo(t.category).name} ${t.note || ''} ${t.amount.toFixed(2).replace('.', ',')} ${Math.abs(t.amount).toFixed(2)}`).includes(' ' + q) || L.merchantKey(t) === f.q);
  if (f.kind === 'out') list = list.filter((t) => t.amount < 0 && L.kindOf(t) === 'expense');
  if (f.kind === 'in') list = list.filter((t) => t.amount > 0 && L.kindOf(t) === 'income');
  if (f.kind === 'transfer') list = list.filter((t) => L.kindOf(t) === 'transfer');
  if (f.kind === 'todo') list = list.filter((t) => t.category === UNCATEGORIZED || t.category === UNCATEGORIZED_IN);
  if (f.kind === 'advance') list = list.filter((t) => t.advance || (t.reimbFor && t.reimbFor.length) || t.unmatched);
  if (f.cat.startsWith('g:')) list = list.filter((t) => catInfo(t.category).group === f.cat.slice(2));
  if (f.cat.startsWith('c:')) list = list.filter((t) => t.category === f.cat.slice(2));
  const sorters = {
    new: (a, b) => b.date.localeCompare(a.date) || (b.time || '').localeCompare(a.time || ''),
    old: (a, b) => a.date.localeCompare(b.date),
    high: (a, b) => Math.abs(b.amount) - Math.abs(a.amount),
    low: (a, b) => Math.abs(a.amount) - Math.abs(b.amount),
    name: (a, b) => (a.name || '').localeCompare(b.name || '', 'nl'),
  };
  return list.sort(sorters[f.sort] || sorters.new);
}

function catOptions(selected, { allowGroups = true, emptyLabel = 'Alle categorieën' } = {}) {
  let html = `<option value="">${emptyLabel}</option>`;
  for (const g of GROUPS) {
    html += `<optgroup label="${esc(g.name)}">`;
    if (allowGroups) html += `<option value="g:${g.id}" ${selected === 'g:' + g.id ? 'selected' : ''}>Alles in ${esc(g.name)}</option>`;
    for (const c of CATEGORIES.filter((c) => c.group === g.id)) html += `<option value="c:${c.id}" ${selected === 'c:' + c.id ? 'selected' : ''}>${esc(c.name)}</option>`;
    html += '</optgroup>';
  }
  return html;
}

function renderTransactions() {
  const list = filteredTxs();
  const f = S.tx;
  const rmap = L.reimbursementMap(S.txs);
  const shown = list.slice(0, f.limit);
  let html = '';
  if (f.sort === 'new' || f.sort === 'old') {
    const byDay = new Map();
    for (const t of shown) { if (!byDay.has(t.date)) byDay.set(t.date, []); byDay.get(t.date).push(t); }
    for (const [d, items] of byDay) {
      const dayTotal = items.reduce((a, t) => a + (L.kindOf(t) === 'expense' ? L.effectiveAmount(t, rmap) : 0), 0);
      html += `<div class="day-head"><span>${fmtDate(d)}</span><span class="num">${dayTotal ? sgn(dayTotal) : ''}</span></div><div class="tx-list">${items.map((t) => txRow(t, rmap, null, { noDate: true })).join('')}</div>`;
    }
  } else {
    html = `<div class="tx-list" style="margin-top:10px">${shown.map((t) => txRow(t, rmap)).join('')}</div>`;
  }
  const totalOut = list.reduce((a, t) => a + (L.kindOf(t) === 'expense' ? -L.effectiveAmount(t, rmap) : 0), 0);
  const totalIn = list.reduce((a, t) => a + (L.kindOf(t) === 'income' ? L.effectiveAmount(t, rmap) : 0), 0);
  return `
    <div class="search"><span aria-hidden="true">⌕</span><input id="txSearch" type="search" placeholder="Zoek op naam, omschrijving of bedrag" value="${esc(f.q)}" autocomplete="off"></div>
    <div class="chips" style="padding:2px 0 8px">
      ${[['all', 'Alles'], ['out', 'Uitgaven'], ['in', 'Inkomsten'], ['transfer', 'Sparen en beleggen'], ['todo', 'Niet ingedeeld'], ['advance', 'Voorgeschoten']].map(([k, l]) => `<button class="chip ${f.kind === k ? 'on' : ''}" data-act="tx-kind" data-v="${k}">${l}</button>`).join('')}
    </div>
    <div class="toolbar">
      <select id="txCat" aria-label="Categorie">${catOptions(f.cat)}</select>
      <select id="txSort" aria-label="Sorteren">
        ${[['new', 'Nieuwste eerst'], ['old', 'Oudste eerst'], ['high', 'Hoogste bedrag'], ['low', 'Laagste bedrag'], ['name', 'Naam A tot Z']].map(([v, l]) => `<option value="${v}" ${f.sort === v ? 'selected' : ''}>${l}</option>`).join('')}
      </select>
    </div>
    <div class="toolbar">
      <select id="txScope" aria-label="Periode">
        <option value="period" ${f.scope === 'period' ? 'selected' : ''}>Alleen ${esc(periodLabel().toLowerCase())}</option>
        <option value="all" ${f.scope === 'all' ? 'selected' : ''}>Alle perioden</option>
      </select>
    </div>
    <p class="help" style="margin:8px 2px 0">${list.length} transacties${totalOut ? `, uitgaven ${eur(totalOut)}` : ''}${totalIn ? `, inkomsten ${eur(totalIn)}` : ''}</p>
    ${list.length ? html : '<div class="empty"><h3>Niets gevonden</h3><p>Pas de zoekterm of filters aan.</p></div>'}
    ${list.length > f.limit ? `<button class="btn ghost more-btn" data-act="tx-more">Meer laden (${list.length - f.limit})</button>` : ''}
  `;
}

/* ---------- Transactiedetail ---------- */

function openTx(id) {
  const t = S.txs.find((x) => x.id === id);
  if (!t) return;
  const rmap = L.reimbursementMap(S.txs);
  const cat = catInfo(t.category);
  const g = groupOf(t.category);
  const k = L.kindOf(t);
  const back = rmap.get(t.id) || 0;
  const reimbursedBy = S.txs.filter((x) => (x.reimbFor || []).includes(t.id));
  const linked = (t.reimbFor || []).map((rid) => S.txs.find((x) => x.id === rid)).filter(Boolean);
  const accLabel = S.settings.accounts?.[t.account]?.label || t.account;
  const role = L.accountRole(S.settings, t.account, S.txs);
  const byLabel = t.manual ? 'Handmatig' : t.by === 'regel' ? 'Eigen regel' : t.by === 'standaard' ? 'Automatisch herkend' : t.by === 'eigen rekening' ? 'Eigen rekening' : 'Automatisch';
  const body = `
    <div class="detail-amt num ${t.amount > 0 ? 'pos' : ''}">${t.amount > 0 ? '+' : '−'}${eur(Math.abs(t.amount))}</div>
    <div class="detail-name">${esc(t.name)}</div>
    <div class="muted" style="font-size:14px">${fmtDate(t.date)}${t.time ? `, ${t.time.slice(11, 16)}` : ''}</div>

    ${k === 'terugbetaling' ? `
      <div class="callout">Terugbetaling voor ${linked.length} ${linked.length === 1 ? 'uitgave' : 'uitgaven'}. Telt niet mee als inkomen.</div>
      <div class="tx-list">${linked.map((x) => txRow(x, rmap)).join('')}</div>
      <div class="btn-row" style="margin-top:10px"><button class="btn quiet small" data-act="link" data-v="${t.id}">Koppeling aanpassen</button><button class="btn danger small" data-act="unlink" data-v="${t.id}">Ontkoppelen</button></div>
    ` : `
      <button class="cat-btn" data-act="pick-cat" data-v="${t.id}">
        <span class="ico">${cat.icon}</span>
        <span><b>${esc(cat.name)}</b><small>${esc(g.name)}, ${byLabel.toLowerCase()}</small></span>
        <span class="chev">›</span>
      </button>
    `}

    ${t.unmatched ? `<div class="callout">Dit lijkt een terugbetaling, maar er is geen uitgave met precies ${eur(t.amount)} gevonden. Koppel hem zelf aan een of meer uitgaven.</div>` : ''}

    <div style="margin-top:8px">
      ${t.amount < 0 && k === 'expense' ? `
      <label class="toggle-row"><span class="txt">Voorgeschoten<small>Je krijgt dit terug, bijvoorbeeld boodschappen voor je ouders. Telt niet als uitgave.</small></span><span class="switch"><input type="checkbox" data-act="toggle-advance" data-v="${t.id}" ${t.advance ? 'checked' : ''}><span></span></span></label>` : ''}
      ${back > 0 ? `<div class="callout">${eur(back)} terugbetaald${reimbursedBy.length ? ` door ${esc(reimbursedBy[0].name)} op ${fmtDate(reimbursedBy[0].date, false)}` : ''}. ${back >= -t.amount - 0.001 ? 'Telt daarom niet mee als uitgave.' : `Je eigen deel is ${eur(-t.amount - back)}.`}</div>` : ''}
      ${t.amount > 0 && k !== 'transfer' && k !== 'terugbetaling' ? `<button class="btn quiet block" data-act="link" data-v="${t.id}" style="margin:8px 0">Koppel als terugbetaling van uitgaven</button>` : ''}
      <label class="toggle-row"><span class="txt">Niet meetellen<small>Verbergt deze transactie in alle overzichten en grafieken.</small></span><span class="switch"><input type="checkbox" data-act="toggle-excluded" data-v="${t.id}" ${t.excluded ? 'checked' : ''}><span></span></span></label>
    </div>

    <div class="field"><label for="txNote">Notitie</label><input id="txNote" class="input" data-v="${t.id}" value="${esc(t.note || '')}" placeholder="Bijvoorbeeld: verjaardag Tim"></div>

    <dl class="kv">
      <dt>Rekening</dt><dd>${esc(accLabel)}${role === 'spaar' ? ' (spaarrekening)' : ''}</dd>
      <dt>Soort</dt><dd>${esc(t.type || 'Onbekend')}</dd>
      ${t.desc ? `<dt>${t.card ? 'Plaats' : 'Omschrijving'}</dt><dd>${esc(t.desc)}</dd>` : ''}
      ${t.iban ? `<dt>Tegenrekening</dt><dd>${esc(t.iban)}</dd>` : ''}
      ${t.balanceAfter != null ? `<dt>Saldo erna</dt><dd class="num">${eur(t.balanceAfter)}</dd>` : ''}
    </dl>
    <details class="raw"><summary>Originele omschrijving van de bank</summary><pre>${esc(t.raw)}</pre></details>
  `;
  openSheet({
    title: 'Transactie',
    body,
    onMount: (sheet) => {
      const note = sheet.querySelector('#txNote');
      note?.addEventListener('change', () => { t.note = note.value.trim(); markTx(t); });
    },
  });
}

/* ---------- Categoriekiezer ---------- */

function openCategoryPicker(txIds, { title = 'Kies categorie', onDone } = {}) {
  const txs = txIds.map((id) => S.txs.find((t) => t.id === id)).filter(Boolean);
  if (!txs.length) return;
  const t = txs[0];
  const key = L.merchantKey(t);
  const sameCount = key ? S.txs.filter((x) => x.id !== t.id && L.merchantKey(x) === key).length : 0;
  const isIn = t.amount > 0;
  const order = isIn ? ['inkomen', 'overboeking', ...GROUPS.filter((g) => g.type === 'expense').map((g) => g.id)] : [...GROUPS.filter((g) => g.type === 'expense').map((g) => g.id), 'overboeking', 'inkomen'];
  const body = `
    <div class="search"><span aria-hidden="true">⌕</span><input id="catSearch" type="search" placeholder="Zoek categorie" autocomplete="off"></div>
    ${key ? `<label class="toggle-row" style="border:none"><span class="txt">Onthoud voor “${esc(key)}”<small>${sameCount ? `Ook toepassen op ${sameCount} andere ${sameCount === 1 ? 'transactie' : 'transacties'} en toekomstige imports.` : 'Toekomstige transacties met deze naam krijgen dezelfde categorie.'}</small></span><span class="switch"><input type="checkbox" id="rememberRule" checked><span></span></span></label>` : ''}
    <div id="catList">
      ${order.map((gid) => {
        const g = GROUP_BY_ID[gid];
        const cats = CATEGORIES.filter((c) => c.group === gid && c.id !== UNCATEGORIZED && c.id !== UNCATEGORIZED_IN);
        return `<div class="cat-block" data-g="${gid}"><div class="cat-group"><i style="background:${g.color}"></i>${esc(g.name)}</div><div class="cat-grid">
          ${cats.map((c) => `<button class="cat-opt ${t.category === c.id ? 'on' : ''}" data-act="choose-cat" data-v="${c.id}" data-name="${esc(L.normalize(c.name + ' ' + g.name))}"><b>${c.icon}</b><span>${esc(c.name)}</span></button>`).join('')}
        </div></div>`;
      }).join('')}
    </div>`;
  openSheet({
    title,
    body,
    onMount: (sheet) => {
      const search = sheet.querySelector('#catSearch');
      search.addEventListener('input', () => {
        const q = L.normalize(search.value).trim();
        sheet.querySelectorAll('.cat-opt').forEach((b) => b.classList.toggle('hidden', q && !b.dataset.name.includes(' ' + q)));
        sheet.querySelectorAll('.cat-block').forEach((bl) => bl.classList.toggle('hidden', !bl.querySelector('.cat-opt:not(.hidden)')));
      });
      sheet.addEventListener('click', (e) => {
        const b = e.target.closest('[data-act="choose-cat"]');
        if (!b) return;
        e.stopPropagation();
        const remember = sheet.querySelector('#rememberRule')?.checked;
        assignCategory(txs, b.dataset.v, remember ? key : null);
        if (onDone) onDone(b.dataset.v); else { closeSheet(); render(); }
      });
    },
  });
}

function assignCategory(txs, catId, ruleKey) {
  for (const t of txs) {
    t.category = catId;
    t.manual = true;
    t.by = 'handmatig';
    delete t.unmatched;
    if (catId !== 'terugbetaling') { delete t.reimbFor; }
  }
  markTx(...txs);
  if (ruleKey) {
    const group = catInfo(catId).group;
    const dir = GROUP_BY_ID[group].type === 'income' ? 'in' : '';
    S.settings.rules = (S.settings.rules || []).filter((r) => !(r.field === 'name' && r.pattern === ruleKey && r.dir === dir));
    S.settings.rules.unshift({ pattern: ruleKey, field: 'name', category: catId, dir, created: todayIso() });
    markSettings();
    const r = recompute();
    toast(`Regel opgeslagen${r.changed ? `, ${r.changed} ${r.changed === 1 ? 'transactie' : 'transacties'} bijgewerkt` : ''}`);
  } else {
    recompute();
    toast('Categorie aangepast');
  }
}

/* ---------- Snel indelen ---------- */

function openQuickSort() {
  const main = mainAcc();
  const range = periodRange();
  const pool = () => visibleTxs().filter((t) => t.account === main && (t.category === UNCATEGORIZED || t.category === UNCATEGORIZED_IN));
  let queue = pool().filter((t) => L.inRange(t, range));
  if (!queue.length) queue = pool();
  queue.sort((a, b) => Math.abs(b.amount) - Math.abs(a.amount));
  const totalStart = queue.length;
  const show = () => {
    queue = queue.filter((t) => t.category === UNCATEGORIZED || t.category === UNCATEGORIZED_IN);
    if (!queue.length) { closeSheet(); render(); toast('Alles is ingedeeld'); return; }
    const t = queue[0];
    openCategoryPicker([t.id], {
      title: `Indelen (${totalStart - queue.length + 1} van ${totalStart})`,
      onDone: () => { show(); },
    });
    const body = $('#sheetRoot .sheet-body');
    body.insertAdjacentHTML('afterbegin', `
      <div class="progress"><div style="width:${((totalStart - queue.length) / totalStart) * 100}%"></div></div>
      <div class="quick-card">
        <div class="detail-name">${esc(t.name)}</div>
        <div class="detail-amt num ${t.amount > 0 ? 'pos' : ''}">${t.amount > 0 ? '+' : '−'}${eur(Math.abs(t.amount))}</div>
        <div class="muted" style="font-size:13.5px">${fmtDate(t.date)}${t.desc ? `, ${esc(t.desc.slice(0, 80))}` : ''}</div>
        <button class="link" style="margin-top:8px" data-act="quick-skip">Overslaan</button>
      </div>`);
    $('#sheetRoot [data-act="quick-skip"]').onclick = () => { queue.push(queue.shift()); if (queue.length === 1) { closeSheet(); render(); return; } show(); };
  };
  show();
}

/* ---------- Terugbetaling koppelen ---------- */

function openLinkPicker(id) {
  const inc = S.txs.find((t) => t.id === id);
  if (!inc) return;
  const cands = L.linkCandidates(inc, visibleTxs(), S.settings, 75);
  const selected = new Set(inc.reimbFor || []);
  const rmap = L.reimbursementMap(S.txs);
  const body = `
    <p class="help">Kies de uitgave(n) die met deze ${eur(inc.amount)} van ${esc(inc.name)} zijn terugbetaald. Uitgaven met precies hetzelfde bedrag staan bovenaan.</p>
    <div class="sumline" id="sumLine"></div>
    ${cands.length ? cands.map((e) => `<label class="pick-row"><input type="checkbox" value="${e.id}" ${selected.has(e.id) ? 'checked' : ''}><span><b>${esc(e.name)}</b><br><small class="muted">${fmtDate(e.date)}, ${esc(catInfo(e.category).name)}</small></span><span class="num">${eur(-e.amount)}</span></label>`).join('') : '<p class="muted">Geen uitgaven gevonden in de 75 dagen ervoor.</p>'}
  `;
  void rmap;
  openSheet({
    title: 'Koppelen aan uitgaven',
    body,
    foot: '<button class="btn block" id="saveLink">Koppeling opslaan</button>',
    onMount: (sheet) => {
      const upd = () => {
        const sum = [...sheet.querySelectorAll('.pick-row input:checked')].reduce((a, i) => a + -S.txs.find((t) => t.id === i.value).amount, 0);
        const ok = Math.round(sum * 100) === Math.round(inc.amount * 100);
        const el = sheet.querySelector('#sumLine');
        el.className = 'sumline' + (ok ? ' ok' : '');
        el.innerHTML = `<span>Gekozen ${eur(sum)}</span><span>${ok ? 'Klopt precies' : `van ${eur(inc.amount)}`}</span>`;
      };
      sheet.addEventListener('change', upd);
      upd();
      sheet.querySelector('#saveLink').onclick = () => {
        const ids = [...sheet.querySelectorAll('.pick-row input:checked')].map((i) => i.value);
        if (ids.length) {
          inc.reimbFor = ids;
          inc.category = 'terugbetaling';
          inc.manual = true;
          delete inc.noMatch;
          delete inc.unmatched;
        } else {
          delete inc.reimbFor;
          inc.noMatch = true;
        }
        markTx(inc);
        recompute();
        closeSheet();
        render();
        toast(ids.length ? 'Terugbetaling gekoppeld' : 'Koppeling verwijderd');
      };
    },
  });
}

/* ---------- Groep in detail ---------- */

function openGroup(gid) {
  const g = GROUP_BY_ID[gid];
  const vt = visibleTxs();
  const range = periodRange();
  const s = L.summarize(vt, S.settings, range);
  const pr = prevRange();
  const ps = pr ? L.summarize(vt, S.settings, pr) : null;
  const cats = Object.entries(s.byCat).filter(([c, v]) => catInfo(c).group === gid && v !== 0).sort((a, b) => b[1] - a[1]);
  const max = cats[0]?.[1] || 1;
  const merchants = Object.values(s.byMerchant).filter((m) => catInfo(m.category).group === gid && m.total > 0).sort((a, b) => b.total - a.total).slice(0, 8);
  const total = s.byGroup[gid] || 0;
  const prevTotal = ps?.byGroup[gid] || 0;
  const body = `
    <div class="detail-amt num">${eur(total)}</div>
    <div class="muted">${esc(periodLabel())}${ps ? `, ${deltaText(total, prevTotal, true) || 'geen vergelijking'}` : ''}</div>
    <h2 style="margin-top:18px">Categorieën</h2>
    <ul class="bars">${cats.map(([c, v]) => `<li><button class="bar-row" data-act="cat-tx" data-v="${c}">
      <span class="bar-ico">${catInfo(c).icon}</span><span class="bar-name">${esc(catInfo(c).name)}</span><span class="bar-val num">${eur(v)}</span>
      <span class="bar-track"><span class="bar-fill" style="width:${Math.max(0, (v / max) * 100)}%;background:${g.color}"></span></span></button></li>`).join('')}</ul>
    ${merchants.length ? `<h2 style="margin-top:18px">Bij wie</h2><table class="tbl"><thead><tr><th>Naam</th><th class="r">Aantal</th><th class="r">Totaal</th></tr></thead><tbody>
      ${merchants.map((m) => `<tr><td>${esc(m.name)}</td><td class="r num">${m.count}</td><td class="r num">${eur(m.total)}</td></tr>`).join('')}</tbody></table>` : ''}
  `;
  openSheet({ title: `${g.icon} ${g.name}`, body, foot: `<button class="btn block" data-act="group-tx" data-v="${gid}">Bekijk transacties</button>` });
}

/* ---------- Analyse ---------- */

function renderAnalyse() {
  const tab = S.analyse;
  const seg = `<div class="seg" role="tablist">${[['categorie', 'Categorieën'], ['trend', 'Trend'], ['winkels', 'Winkels'], ['patronen', 'Patronen']].map(([k, l]) => `<button class="${tab === k ? 'on' : ''}" data-act="analyse-tab" data-v="${k}">${l}</button>`).join('')}</div>`;
  const vt = visibleTxs();
  const range = periodRange();
  const s = L.summarize(vt, S.settings, range);
  const pr = prevRange();
  const ps = pr ? L.summarize(vt, S.settings, pr) : null;
  if (tab === 'categorie') {
    const cats = Object.entries(s.byCat).filter(([, v]) => v > 0).sort((a, b) => b[1] - a[1]);
    const max = cats[0]?.[1] || 1;
    const inc = Object.entries(s.byIncomeCat).filter(([, v]) => v > 0).sort((a, b) => b[1] - a[1]);
    return `${seg}
      <section>
        <h2>Uitgaven per categorie <span class="aside">${eur(s.expense)}</span></h2>
        <ul class="bars">${cats.map(([c, v]) => {
          const prev = ps?.byCat[c] || 0;
          const diff = ps ? v - prev : 0;
          return `<li><button class="bar-row" data-act="cat-tx" data-v="${c}">
            <span class="bar-ico">${catInfo(c).icon}</span>
            <span class="bar-name">${esc(catInfo(c).name)}<span class="bar-meta">${Math.round((v / s.expense) * 100)}%${ps && Math.abs(diff) >= 1 ? `, ${diff > 0 ? '+' : '−'}${eur(Math.abs(diff), true)}` : ''}</span></span>
            <span class="bar-val num">${eur(v)}</span>
            <span class="bar-track"><span class="bar-fill" style="width:${(v / max) * 100}%;background:${groupColor(catInfo(c).group)}"></span></span>
          </button></li>`;
        }).join('')}</ul>
        ${ps ? `<p class="help">Bedragen achter het percentage tonen het verschil met ${esc(prevNoun())}.</p>` : ''}
      </section>
      <section>
        <h2>Inkomsten <span class="aside">${eur(s.income)}</span></h2>
        <ul class="bars">${inc.map(([c, v]) => `<li><button class="bar-row" data-act="cat-tx" data-v="${c}">
          <span class="bar-ico">${catInfo(c).icon}</span><span class="bar-name">${esc(catInfo(c).name)}</span><span class="bar-val num">${eur(v)}</span>
          <span class="bar-track"><span class="bar-fill" style="width:${(v / (inc[0][1] || 1)) * 100}%;background:var(--pos)"></span></span></button></li>`).join('') || '<li class="muted">Geen inkomsten in deze periode.</li>'}</ul>
      </section>
      <section>
        <h2>Vaste lasten en variabel</h2>
        <div class="ribbon"><span style="flex-grow:${s.fixed || 0.0001};background:var(--s-income)"></span><span style="flex-grow:${s.variable || 0.0001};background:var(--s-expense)"></span></div>
        <div class="ribbon-legend"><span><i style="background:var(--s-income)"></i>Vast ${eur(s.fixed)}</span><span><i style="background:var(--s-expense)"></i>Variabel ${eur(s.variable)}</span></div>
        <p class="help">Vast: wonen, abonnementen en verzekeringen.</p>
      </section>`;
  }
  if (tab === 'trend') {
    const months = chartMonths().length < 6 ? L.monthsBetween(shiftMonth(periodRange().to.slice(0, 7), -5), periodRange().to.slice(0, 7)) : chartMonths();
    const data = L.monthly(vt, S.settings, months);
    const totals = {};
    data.forEach((d) => Object.entries(d.byGroup).forEach(([g, v]) => { totals[g] = (totals[g] || 0) + v; }));
    const ranked = Object.entries(totals).sort((a, b) => b[1] - a[1]).map(([g]) => g);
    if (!S.trendGroups || !S.trendGroups.every((g) => GROUP_BY_ID[g])) S.trendGroups = ranked.slice(0, 3);
    return `${seg}
      <section>
        <h2>Uitgaven per maand</h2>
        <div class="chips" style="padding:0 0 10px">${ranked.map((g) => `<button class="chip ${S.trendGroups.includes(g) ? 'on' : ''}" data-act="trend-toggle" data-v="${g}">${GROUP_BY_ID[g].icon} ${esc(GROUP_BY_ID[g].name)}</button>`).join('')}</div>
        <div class="panel">
          <div class="legend">${S.trendGroups.map((g) => `<span><i style="background:${groupColor(g)}"></i>${esc(GROUP_BY_ID[g].name)}</span>`).join('')}</div>
          <div class="chart-box tall"><canvas id="trendChart" aria-label="Trend per categorie"></canvas></div>
        </div>
        <p class="help">Kies maximaal vier categorieën om te vergelijken.</p>
      </section>
      <section>
        <h2>Gemiddeld per maand</h2>
        <table class="tbl"><thead><tr><th>Categorie</th><th class="r">Gemiddeld</th><th class="r">Hoogste</th></tr></thead><tbody>
        ${ranked.map((g) => {
          const vals = data.map((d) => d.byGroup[g] || 0);
          return `<tr><td>${GROUP_BY_ID[g].icon} ${esc(GROUP_BY_ID[g].name)}</td><td class="r num">${eur(vals.reduce((a, b) => a + b, 0) / vals.length)}</td><td class="r num">${eur(Math.max(...vals))}</td></tr>`;
        }).join('')}
        </tbody></table>
      </section>`;
  }
  if (tab === 'winkels') {
    const ms = Object.values(s.byMerchant).filter((m) => m.total > 0).sort((a, b) => b.total - a.total).slice(0, 30);
    return `${seg}
      <section>
        <h2>Top 30 <span class="aside">op totaalbedrag</span></h2>
        <table class="tbl"><thead><tr><th>Naam</th><th class="r">Keer</th><th class="r">Gem.</th><th class="r">Totaal</th></tr></thead><tbody>
        ${ms.map((m) => `<tr data-act="merchant" data-v="${esc(m.key)}" style="cursor:pointer"><td>${catInfo(m.category).icon} ${esc(m.name)}</td><td class="r num">${m.count}</td><td class="r num">${eur(m.total / m.count)}</td><td class="r num">${eur(m.total)}</td></tr>`).join('')}
        </tbody></table>
      </section>`;
  }
  // Patronen
  const main = mainAcc();
  const rmap = L.reimbursementMap(vt);
  const exp = vt.filter((t) => t.account === main && L.inRange(t, range) && L.kindOf(t) === 'expense' && L.effectiveAmount(t, rmap) < 0);
  const biggest = [...exp].sort((a, b) => a.amount - b.amount).slice(0, 10);
  const days = Math.max(1, Math.round((new Date(Math.min(new Date(range.to), new Date())) - new Date(range.from)) / 86400000) + 1);
  return `${seg}
    <section>
      <div class="stats">
        <div class="stat"><div class="stat-label">Per dag</div><div class="stat-value num">${eur(s.expense / days)}</div></div>
        <div class="stat"><div class="stat-label">Per uitgave</div><div class="stat-value num">${eur(s.count ? s.expense / s.count : 0)}</div></div>
        <div class="stat"><div class="stat-label">Spaarquote</div><div class="stat-value num">${s.income ? Math.round(((s.net + 0) / s.income) * 100) : 0}%</div></div>
      </div>
    </section>
    <section>
      <h2>Uitgaven per weekdag</h2>
      <div class="panel"><div class="chart-box"><canvas id="weekdayChart" aria-label="Uitgaven per weekdag"></canvas></div></div>
    </section>
    <section>
      <h2>Grootste uitgaven</h2>
      <div class="tx-list">${biggest.map((t) => txRow(t, rmap)).join('')}</div>
    </section>`;
}

function drawAnalyseCharts() {
  const vt = visibleTxs();
  if (S.analyse === 'trend') {
    const months = chartMonths().length < 6 ? L.monthsBetween(shiftMonth(periodRange().to.slice(0, 7), -5), periodRange().to.slice(0, 7)) : chartMonths();
    const data = L.monthly(vt, S.settings, months);
    makeChart('trendChart', {
      type: 'line',
      data: {
        labels: months.map((m) => monthLabel(m, false)),
        datasets: S.trendGroups.map((g) => ({
          label: GROUP_BY_ID[g].name, data: data.map((d) => Math.round(d.byGroup[g] || 0)),
          borderColor: groupColor(g), backgroundColor: groupColor(g), borderWidth: 2, pointRadius: 3, pointHoverRadius: 6, cubicInterpolationMode: 'monotone',
          pointBorderColor: cssVar('--surface'), pointBorderWidth: 2,
        })),
      },
      options: {
        interaction: { mode: 'index', intersect: false },
        scales: { x: { grid: { display: false }, border: { display: false } }, y: { ...euroAxis, beginAtZero: true } },
        plugins: { tooltip: { callbacks: { title: (c) => monthLabel(months[c[0].dataIndex]), label: (c) => ` ${c.dataset.label}: ${eur(c.raw)}` } } },
      },
    });
  }
  if (S.analyse === 'patronen') {
    const main = mainAcc();
    const range = periodRange();
    const rmap = L.reimbursementMap(vt);
    const sums = [0, 0, 0, 0, 0, 0, 0];
    for (const t of vt) {
      if (t.account !== main || !L.inRange(t, range) || L.kindOf(t) !== 'expense') continue;
      const [y, m, d] = t.date.split('-').map(Number);
      sums[(new Date(y, m - 1, d).getDay() + 6) % 7] += -L.effectiveAmount(t, rmap);
    }
    makeChart('weekdayChart', {
      type: 'bar',
      data: { labels: WEEKDAYS, datasets: [{ label: 'Uitgaven', data: sums.map((v) => Math.round(v)), backgroundColor: cssVar('--s-expense'), borderRadius: 4, maxBarThickness: 28 }] },
      options: { scales: { x: { grid: { display: false }, border: { display: false } }, y: euroAxis }, plugins: { tooltip: { callbacks: { label: (c) => ` ${eur(c.raw)}` } } } },
    });
  }
}

/* ---------- Vermogen ---------- */

function nwMonths() {
  const ms = dataMonths();
  if (!ms.length) return [currentMonth()];
  const end = ms[ms.length - 1] > currentMonth() ? ms[ms.length - 1] : currentMonth();
  const all = L.monthsBetween(ms[0], end);
  return all.slice(-24);
}

function renderNetWorth() {
  const vt = visibleTxs();
  const months = nwMonths();
  const series = L.netWorthSeries(vt, S.settings, months);
  const cur = series[series.length - 1];
  const prev = series.length > 1 ? series[series.length - 2] : null;
  const first = series[0];
  const tot = splitEur(cur.total);
  const snaps = S.settings.investSnapshots || [];
  const pf = latestPortfolio();
  const pfGain = pf ? (pf.gain != null ? pf.gain : portfolioGain(pf.positions)) : null;
  const gain = pfGain != null ? pfGain : snaps.length ? cur.invest - cur.inleg : null;
  const transfers = vt.filter((t) => t.account === mainAcc() && L.kindOf(t) === 'transfer' && !t.excluded).sort((a, b) => b.date.localeCompare(a.date)).slice(0, 8);
  const rmap = L.reimbursementMap(vt);
  return `
    <section class="hero">
      <p class="hero-label">Totaal vermogen</p>
      <div class="nw-total num">${tot.main}<span class="cents" style="font-size:.42em;color:var(--muted)">${tot.cents}</span></div>
      <p class="hero-sub">${prev ? `${sgn(cur.total - prev.total)} ten opzichte van vorige maand` : ''}${series.length > 2 ? `, ${sgn(cur.total - first.total)} sinds ${monthLabel(first.month)}` : ''}</p>
      <div class="nw-parts">
        <div class="nw-part"><div class="lab"><i style="background:var(--s-betaal)"></i>Betaalrekening</div><div class="val num">${cur.betaal != null ? eur(cur.betaal, true) : 'onbekend'}</div></div>
        <div class="nw-part"><div class="lab"><i style="background:var(--s-spaar)"></i>Sparen</div><div class="val num">${eur(cur.spaar, true)}</div></div>
        <div class="nw-part"><div class="lab"><i style="background:var(--s-invest)"></i>Beleggen</div><div class="val num">${eur(cur.invest, true)}</div><div class="sub">${gain != null ? `${sgn(gain, true)} rendement` : 'alleen inleg'}</div></div>
      </div>
    </section>
    ${pf ? renderPortfolio(pf) : ''}
    <section>
      <div class="panel">
        <div class="legend"><span><i style="background:var(--s-betaal)"></i>Betaalrekening</span><span><i style="background:var(--s-spaar)"></i>Sparen</span><span><i style="background:var(--s-invest)"></i>Beleggen</span></div>
        <div class="chart-box tall"><canvas id="nwChart" aria-label="Vermogen per maand"></canvas></div>
      </div>
      <p class="help">Geld naar je spaarrekening of BUX is een verschuiving binnen je vermogen: het totaal blijft gelijk en het telt niet als uitgave.</p>
      <div class="btn-row"><button class="btn quiet small" data-act="nw-update">${pf ? 'Portefeuille bijwerken' : 'Waarde beleggingen bijwerken'}</button><button class="btn quiet small" data-act="set" data-v="invest">Instellingen sparen en beleggen</button></div>
    </section>
    <section>
      <h2>Per maand</h2>
      <table class="tbl"><thead><tr><th>Maand</th><th class="r">Totaal</th><th class="r">Verschil</th></tr></thead><tbody>
      ${[...series].reverse().slice(0, 12).map((r, i, arr) => {
        const before = arr[i + 1];
        const d = before ? r.total - before.total : null;
        return `<tr><td>${monthLabel(r.month)}</td><td class="r num">${eur(r.total)}</td><td class="r num">${d == null ? '' : sgn(d)}</td></tr>`;
      }).join('')}
      </tbody></table>
    </section>
    ${transfers.length ? `<section><h2>Laatste overboekingen</h2><div class="tx-list">${transfers.map((t) => txRow(t, rmap)).join('')}</div></section>` : ''}
  `;
}

function drawNetWorthChart() {
  const months = nwMonths();
  const series = L.netWorthSeries(visibleTxs(), S.settings, months);
  const mk = (label, key, color, fill) => ({
    label, data: series.map((r) => (r[key] == null ? null : Math.round(r[key]))), borderColor: color,
    backgroundColor: color + 'b3', fill, borderWidth: 2, pointRadius: 0, pointHoverRadius: 5, cubicInterpolationMode: 'monotone',
  });
  makeChart('nwChart', {
    type: 'line',
    data: {
      labels: months.map((m) => monthLabel(m, false)),
      datasets: [mk('Betaalrekening', 'betaal', cssVar('--s-betaal'), 'origin'), mk('Sparen', 'spaar', cssVar('--s-spaar'), '-1'), mk('Beleggen', 'invest', cssVar('--s-invest'), '-1')],
    },
    options: {
      interaction: { mode: 'index', intersect: false },
      scales: { x: { grid: { display: false }, border: { display: false } }, y: { ...euroAxis, stacked: true, beginAtZero: true } },
      plugins: { tooltip: { callbacks: { title: (c) => monthLabel(months[c[0].dataIndex]), label: (c) => ` ${c.dataset.label}: ${eur(c.raw)}`, footer: (c) => `Totaal: ${eur(series[c[0].dataIndex].total)}` } } },
    },
  });
}

const POS_TYPES = { etf: 'ETF', aandeel: 'Aandeel', crypto: 'Crypto', cash: 'Cash', overig: 'Overig' };
const POS_COLORS = { etf: 'var(--s-income)', aandeel: 'var(--s-expense)', crypto: '#6250d6', cash: 'var(--s-invest)', overig: 'var(--muted)' };

function latestPortfolio() {
  return [...(S.settings.investSnapshots || [])].filter((x) => x.positions && x.positions.length).sort((a, b) => b.date.localeCompare(a.date))[0] || null;
}

// Rendement volgens de percentages uit de BUX-app (waarde min wat je erin stopte).
function portfolioGain(positions) {
  let gain = 0;
  let known = false;
  for (const p of positions) {
    if (p.type === 'cash' || p.pct == null || !isFinite(p.pct) || p.pct <= -100) continue;
    gain += p.value - p.value / (1 + p.pct / 100);
    known = true;
  }
  return known ? Math.round(gain * 100) / 100 : null;
}

function renderPortfolio(pf) {
  const list = [...pf.positions].sort((a, b) => (a.type === 'cash') - (b.type === 'cash') || b.value - a.value);
  const total = list.reduce((a, p) => a + p.value, 0) || 1;
  const byType = {};
  for (const p of list) byType[p.type] = (byType[p.type] || 0) + p.value;
  const types = Object.entries(byType).sort((a, b) => b[1] - a[1]);
  const fmtShares = (n) => Number(n).toLocaleString('nl-NL', { maximumFractionDigits: 4 });
  return `
    <section>
      <h2>Portefeuille <span class="aside">bijgewerkt ${fmtDate(pf.date, false)}</span></h2>
      <div class="ribbon" role="img" aria-label="Verdeling van je beleggingen">
        ${types.map(([t, v]) => `<span style="flex-grow:${v};background:${POS_COLORS[t] || POS_COLORS.overig}" title="${esc(POS_TYPES[t] || t)}: ${eur(v)}"></span>`).join('')}
      </div>
      <div class="ribbon-legend">${types.map(([t, v]) => `<span><i style="background:${POS_COLORS[t] || POS_COLORS.overig}"></i>${esc(POS_TYPES[t] || t)} ${Math.round((v / total) * 100)}%</span>`).join('')}</div>
      <div class="tx-list" style="margin-top:12px">
        ${list.map((p) => `<div class="tx pos-row">
          <span class="tx-ico" style="background:color-mix(in srgb, ${POS_COLORS[p.type] || POS_COLORS.overig} 18%, transparent)">${p.type === 'cash' ? '💶' : p.type === 'etf' ? '🌍' : p.type === 'crypto' ? '🪙' : '📈'}</span>
          <span class="tx-main"><div class="tx-name">${esc(p.name)}</div><div class="tx-sub">${esc(POS_TYPES[p.type] || 'Overig')}${p.shares ? `, ${fmtShares(p.shares)} ${Number(p.shares) === 1 ? 'stuk' : 'stuks'}` : ''}, ${Math.round((p.value / total) * 100)}%</div></span>
          <span class="tx-amt num"><span class="amt">${eur(p.value)}</span>${p.pct != null && p.type !== 'cash' ? `<small class="${p.pct >= 0 ? 'pos' : ''}">${p.pct >= 0 ? '+' : '−'}${Math.abs(p.pct).toLocaleString('nl-NL', { maximumFractionDigits: 2 })}%</small>` : ''}</span>
        </div>`).join('')}
      </div>
    </section>`;
}

function posRowHtml(p = {}) {
  const v = (x) => (x == null || x === '' ? '' : String(x).replace('.', ','));
  return `<div class="pos-edit">
    <div class="pos-top"><input class="input" data-f="name" placeholder="Naam, bijv. Vanguard FTSE All-World" value="${esc(p.name || '')}" aria-label="Naam"><button class="x-btn" data-posdel aria-label="Positie verwijderen">✕</button></div>
    <div class="pos-grid">
      <select data-f="type" aria-label="Soort">${Object.entries(POS_TYPES).map(([k, l]) => `<option value="${k}" ${(p.type || 'etf') === k ? 'selected' : ''}>${l}</option>`).join('')}</select>
      <input class="input" data-f="shares" inputmode="decimal" placeholder="Aantal" value="${v(p.shares)}" aria-label="Aantal">
      <input class="input" data-f="value" inputmode="decimal" placeholder="Waarde €" value="${v(p.value)}" aria-label="Waarde in euro">
      <input class="input" data-f="pct" inputmode="decimal" placeholder="Rendement %" value="${v(p.pct)}" aria-label="Rendement in procent">
    </div>
  </div>`;
}

function readPositions(sheet) {
  const num = (x) => { const n = parseAmount(String(x || '').replace('%', '').replace('+', '')); return isNaN(n) ? null : n; };
  return [...sheet.querySelectorAll('.pos-edit')].map((row) => {
    const g = (f) => row.querySelector(`[data-f="${f}"]`).value.trim();
    return { name: g('name'), type: g('type'), shares: num(g('shares')), value: num(g('value')), pct: num(g('pct')) };
  }).filter((p) => p.name && p.value != null);
}

function openNwUpdate() {
  const vt = visibleTxs();
  const series = L.netWorthSeries(vt, S.settings, [currentMonth()]);
  const pf = latestPortfolio();
  const start = pf ? pf.positions : [{ type: 'etf' }, { name: 'Cash', type: 'cash' }];
  openSheet({
    title: 'Portefeuille bijwerken',
    body: `
      <p class="help">Neem per positie de waarde en het rendement in procenten over uit de BUX-app. Aantal en rendement mag je leeg laten. Bij een volgende keer staan je posities er al, dan pas je alleen de bedragen aan.</p>
      <div class="field"><label for="snapDate">Datum</label><input id="snapDate" class="input" type="date" value="${todayIso()}"></div>
      <div id="posRows">${start.map(posRowHtml).join('')}</div>
      <button class="btn quiet small" id="posAdd" type="button" style="margin:4px 0 14px">Positie toevoegen</button>
      <div class="sumline" id="posTotal"></div>
      <div class="field"><label for="snapGain">Totaal rendement volgens BUX (optioneel)</label><input id="snapGain" class="input" inputmode="decimal" placeholder="bijv. 660,60">
        <p class="help">Het groene bedrag bovenaan in BUX. Vul je dit in, dan gebruikt de app dat in plaats van de berekening uit de percentages. Die kan een paar euro afwijken.</p></div>
      <details class="raw"><summary>Liever alleen het totaal invullen</summary>
        <div class="field"><label for="snapVal">Totale waarde in euro</label><input id="snapVal" class="input" inputmode="decimal" placeholder="${Math.round(series[0].invest)}"></div>
        <p class="help">Wordt alleen gebruikt als je hierboven geen posities invult.</p>
      </details>
      <p class="help">Totale inleg volgens je bankbestanden en instellingen: ${eur(series[0].inleg)}.</p>`,
    foot: '<button class="btn block" id="snapSave">Opslaan</button>',
    onMount: (sheet) => {
      const upd = () => {
        const ps = readPositions(sheet);
        const total = ps.reduce((a, p) => a + p.value, 0);
        const gain = portfolioGain(ps);
        sheet.querySelector('#posTotal').innerHTML = ps.length ? `<span>Totaal ${eur(total)}</span><span>${gain != null ? `${sgn(gain)} rendement` : ''}</span>` : '';
      };
      sheet.addEventListener('input', upd);
      sheet.addEventListener('change', upd);
      sheet.querySelector('#posAdd').onclick = () => { sheet.querySelector('#posRows').insertAdjacentHTML('beforeend', posRowHtml()); };
      sheet.querySelector('#posRows').addEventListener('click', (e) => {
        const b = e.target.closest('[data-posdel]');
        if (b) { b.closest('.pos-edit').remove(); upd(); }
      });
      upd();
      sheet.querySelector('#snapSave').onclick = () => {
        const d = sheet.querySelector('#snapDate').value;
        const positions = readPositions(sheet);
        let value = positions.reduce((a, p) => a + p.value, 0);
        if (!positions.length) value = parseAmount(sheet.querySelector('#snapVal').value);
        if (!d || isNaN(value) || (!positions.length && !value)) { toast('Vul posities of een totaal in'); return; }
        const snap = { date: d, value: Math.round(value * 100) / 100 };
        const g = parseAmount(String(sheet.querySelector('#snapGain').value || '').replace('+', ''));
        if (!isNaN(g)) snap.gain = g;
        if (positions.length) snap.positions = positions;
        S.settings.investSnapshots = [...(S.settings.investSnapshots || []).filter((x) => x.date !== d), snap];
        markSettings();
        closeSheet();
        render();
        toast('Portefeuille opgeslagen');
      };
    },
  });
}

/* ---------- Instellingen ---------- */

function renderSettings() {
  const st = S.store;
  const nRules = (S.settings.rules || []).length;
  const nPayers = (S.settings.payers || []).length;
  const accounts = [...new Set(S.txs.map((t) => t.account))];
  const lastImport = (S.settings.imports || []).slice(-1)[0];
  return `
    <section style="margin-top:6px">
      <h2>Gegevens</h2>
      <div class="set-group">
        <button class="set-row" data-act="import"><span class="ico">⤓</span><span class="txt">Bankbestand importeren<small>${lastImport ? `Laatst: ${fmtDate(lastImport.date)}, ${lastImport.added} nieuw` : 'ABN AMRO TXT of XLS, of een CSV met kopregel'}</small></span><span class="chev">›</span></button>
        <button class="set-row" data-act="quick"><span class="ico">🗂️</span><span class="txt">Snel indelen<small>Transacties zonder categorie één voor één indelen</small></span><span class="chev">›</span></button>
        <button class="set-row" data-act="howto"><span class="ico">❓</span><span class="txt">Zo download je je transacties<small>Stappen voor ABN AMRO</small></span><span class="chev">›</span></button>
      </div>
    </section>
    <section>
      <h2>Herkenning</h2>
      <div class="set-group">
        <button class="set-row" data-act="set" data-v="rules"><span class="ico">🏷️</span><span class="txt">Eigen regels<small>${nRules} ${nRules === 1 ? 'regel' : 'regels'}, zoals Zalando naar Kleding</small></span><span class="chev">›</span></button>
        <button class="set-row" data-act="set" data-v="payers"><span class="ico">↩️</span><span class="txt">Terugbetalers<small>${nPayers ? `${nPayers} ingesteld` : 'Bijvoorbeeld je ouders, voor voorgeschoten boodschappen'}</small></span><span class="chev">›</span></button>
        <button class="set-row" data-act="set" data-v="accounts"><span class="ico">🏦</span><span class="txt">Rekeningen<small>${accounts.length ? `${accounts.length} gevonden in je bestanden` : 'Nog geen rekeningen gevonden'}</small></span><span class="chev">›</span></button>
        <button class="set-row" data-act="set" data-v="invest"><span class="ico">📊</span><span class="txt">Sparen en beleggen<small>Startbedragen en waarde van je beleggingen</small></span><span class="chev">›</span></button>
      </div>
    </section>
    <section>
      <h2>App</h2>
      <div class="set-group">
        <button class="set-row" data-act="set" data-v="theme"><span class="ico">🌓</span><span class="txt">Weergave<small>${{ light: 'Licht', dark: 'Donker' }[localStorage.getItem('geldzicht.theme')] || 'Volgt je telefoon'}</small></span><span class="chev">›</span></button>
        <button class="set-row" data-act="export-csv"><span class="ico">📄</span><span class="txt">Exporteren naar CSV<small>Voor Excel, met categorieën</small></span><span class="chev">›</span></button>
        <button class="set-row" data-act="export-json"><span class="ico">💾</span><span class="txt">Back-up downloaden<small>Alle transacties, regels en instellingen</small></span><span class="chev">›</span></button>
        <button class="set-row" data-act="restore"><span class="ico">♻️</span><span class="txt">Back-up terugzetten<small>Vervangt alle huidige gegevens</small></span><span class="chev">›</span></button>
        ${!S.txs.length ? '<button class="set-row" data-act="demo"><span class="ico">🧪</span><span class="txt">Voorbeeldgegevens laden<small>Om de app uit te proberen</small></span><span class="chev">›</span></button>' : ''}
      </div>
    </section>
    <section>
      <h2>Account</h2>
      <div class="set-group">
        ${st.mode === 'cloud'
          ? `<div class="set-row"><span class="ico">☁️</span><span class="txt">Ingelogd als ${esc(st.user?.email || '')}<small>Gegevens worden opgeslagen in je eigen Firebase-project</small></span></div>
             <button class="set-row" data-act="logout"><span class="ico">🚪</span><span class="txt">Uitloggen</span></button>`
          : `<div class="set-row"><span class="ico">📱</span><span class="txt">Lokale opslag<small>${st.error ? 'Firebase kon niet starten. ' : ''}Gegevens staan alleen in deze browser. Vul config.js in om te synchroniseren.</small></span></div>`}
        <button class="set-row" data-act="wipe"><span class="ico">🗑️</span><span class="txt" style="color:#d03b3b">Alle gegevens wissen</span></button>
      </div>
      <p class="help" style="text-align:center">${esc(APP_NAME)} versie ${VERSION}</p>
    </section>`;
}

function openSettingsSheet(which) {
  if (which === 'rules') return openRules();
  if (which === 'payers') return openPayers();
  if (which === 'accounts') return openAccounts();
  if (which === 'invest') return openInvestSettings();
  if (which === 'theme') return openTheme();
}

function openRules() {
  const rules = S.settings.rules || [];
  openSheet({
    title: 'Eigen regels',
    body: `
      <p class="help">Regels gaan voor op de automatische herkenning. Ze worden ook gemaakt als je bij het indelen “Onthoud” aan laat staan.</p>
      <div class="field"><label for="ruleText">Als de naam of omschrijving bevat</label><input id="ruleText" class="input" placeholder="bijvoorbeeld zalando of foodtruck bertus"></div>
      <div class="toolbar">
        <select id="ruleField" aria-label="Waar zoeken"><option value="any">Naam of omschrijving</option><option value="name">Alleen naam</option><option value="iban">Tegenrekening (IBAN)</option></select>
        <select id="ruleCat" aria-label="Categorie">${catOptions('', { allowGroups: false, emptyLabel: 'Kies categorie' })}</select>
      </div>
      <button class="btn block" id="ruleAdd" style="margin:6px 0 16px">Regel toevoegen</button>
      <div id="ruleList">${rules.map((r, i) => `<div class="list-item"><span class="grow"><b>${esc(r.pattern)}</b><br><small class="muted">${r.field === 'iban' ? 'IBAN' : r.field === 'name' ? 'naam' : 'naam of omschrijving'} naar ${catInfo(r.category).icon} ${esc(catInfo(r.category).name)}</small></span><button class="x-btn" data-del="${i}" aria-label="Verwijder regel">✕</button></div>`).join('') || '<p class="muted">Nog geen eigen regels.</p>'}</div>`,
    onMount: (sheet) => {
      sheet.querySelector('#ruleAdd').onclick = () => {
        const pattern = sheet.querySelector('#ruleText').value.trim();
        const field = sheet.querySelector('#ruleField').value;
        const cat = sheet.querySelector('#ruleCat').value.replace(/^c:/, '');
        if (!pattern || !cat) { toast('Vul tekst en categorie in'); return; }
        const dir = GROUP_BY_ID[catInfo(cat).group].type === 'income' ? 'in' : '';
        S.settings.rules = [{ pattern: field === 'iban' ? pattern.replace(/\s/g, '').toUpperCase() : pattern.toLowerCase(), field, category: cat, dir, created: todayIso() }, ...(S.settings.rules || [])];
        markSettings();
        const r = recompute();
        toast(`Regel toegevoegd, ${r.changed} bijgewerkt`);
        openRules();
      };
      sheet.querySelectorAll('[data-del]').forEach((b) => b.onclick = () => {
        S.settings.rules.splice(Number(b.dataset.del), 1);
        markSettings();
        recompute();
        openRules();
      });
    },
  });
}

function openPayers() {
  const payers = S.settings.payers || [];
  const suggestions = [...new Map(S.txs.filter((t) => t.amount > 0 && t.iban && /Overboeking/i.test(t.type) && L.kindOf(t) !== 'transfer' && t.category !== 'salaris').map((t) => [t.iban, t])).values()].slice(0, 6);
  openSheet({
    title: 'Terugbetalers',
    body: `
      <p class="help">Krijg je geld terug van iemand, zoals je ouders na boodschappen? Voeg hun IBAN of naam toe. Een bijschrijving van hen met precies hetzelfde bedrag als een uitgave (of als de som van twee of drie boodschappen) wordt dan automatisch gekoppeld en telt niet mee.</p>
      <p class="help"><b>Tip:</b> gebruik het IBAN. Een achternaam kan ook op jouw eigen overboekingen staan.</p>
      <div class="toolbar"><input id="payerIn" class="input" placeholder="IBAN of naam zoals op je afschrift"><button class="btn small" id="payerAdd">Toevoegen</button></div>
      ${payers.map((p, i) => `<div class="list-item"><span class="grow">${esc(p)}</span><button class="x-btn" data-del="${i}" aria-label="Verwijder">✕</button></div>`).join('')}
      ${suggestions.length ? `<h2 style="margin-top:20px;font-size:15px">Personen die je geld overmaakten</h2>${suggestions.map((t) => `<div class="list-item"><span class="grow">${esc(t.name)}<br><small class="muted">${esc(t.iban)}</small></span><button class="btn quiet small" data-add="${esc(t.iban)}">Toevoegen</button></div>`).join('')}` : ''}
      <div class="field" style="margin-top:20px"><label for="matchDays">Zoek uitgaven tot zoveel dagen terug</label>
        <select id="matchDays">${[14, 30, 45, 60, 90].map((d) => `<option value="${d}" ${Number(S.settings.matchDays || 45) === d ? 'selected' : ''}>${d} dagen</option>`).join('')}</select></div>`,
    onMount: (sheet) => {
      const add = (v) => {
        v = v.trim();
        if (!v) return;
        if (/^[A-Z]{2}\d{2}/i.test(v.replace(/\s/g, ''))) v = v.replace(/\s/g, '').toUpperCase();
        S.settings.payers = [...new Set([...(S.settings.payers || []), v])];
        markSettings();
        const r = recompute();
        toast(`${r.matches.length} terugbetalingen gekoppeld`);
        openPayers();
      };
      sheet.querySelector('#payerAdd').onclick = () => add(sheet.querySelector('#payerIn').value);
      sheet.querySelectorAll('[data-add]').forEach((b) => b.onclick = () => add(b.dataset.add));
      sheet.querySelectorAll('[data-del]').forEach((b) => b.onclick = () => {
        const removed = S.settings.payers.splice(Number(b.dataset.del), 1)[0];
        // Automatische koppelingen van deze persoon weer losmaken
        for (const t of S.txs) if (t.autoMatched && L.isPayer(t, { payers: [removed] })) { delete t.reimbFor; delete t.autoMatched; markTx(t); }
        markSettings();
        recompute();
        openPayers();
      });
      sheet.querySelector('#matchDays').onchange = (e) => { S.settings.matchDays = Number(e.target.value); markSettings(); recompute(); };
    },
  });
}

function openAccounts() {
  const counts = {};
  for (const t of S.txs) counts[t.account] = (counts[t.account] || 0) + 1;
  const accs = Object.keys(counts);
  openSheet({
    title: 'Rekeningen',
    body: `
      <p class="help">De betaalrekening is de basis voor je overzicht. Van een spaarrekening wordt alleen het saldo gebruikt bij Vermogen. Download je beide rekeningen in één bestand, dan herkent de app overboekingen ertussen vanzelf.</p>
      ${accs.map((a) => {
        const cfg = S.settings.accounts?.[a] || {};
        const role = L.accountRole(S.settings, a, S.txs);
        return `<div class="list-item" style="display:block">
          <b>${esc(cfg.label || a)}</b> <small class="muted">${counts[a]} transacties, nr. ${esc(a)}</small>
          <div class="toolbar" style="margin-top:8px">
            <select data-role="${esc(a)}"><option value="betaal" ${role === 'betaal' ? 'selected' : ''}>Betaalrekening</option><option value="spaar" ${role === 'spaar' ? 'selected' : ''}>Spaarrekening</option><option value="negeren" ${role === 'negeren' ? 'selected' : ''}>Negeren</option></select>
            <input class="input" data-label="${esc(a)}" value="${esc(cfg.label || '')}" placeholder="Naam, bijv. Betaalrekening">
          </div></div>`;
      }).join('') || '<p class="muted">Importeer eerst een bestand.</p>'}
      <div class="field" style="margin-top:18px"><label for="ownIbans">Andere eigen rekeningen (IBAN, één per regel)</label>
        <textarea id="ownIbans" class="input" rows="3" placeholder="NL00ABNA0123456789">${esc((S.settings.ownIbans || []).join('\n'))}</textarea>
        <p class="help">Overboekingen naar deze rekeningen tellen als sparen, niet als uitgave. Zet hier bijvoorbeeld je spaarrekening als je die niet mee downloadt.</p></div>`,
    foot: '<button class="btn block" id="accSave">Opslaan</button>',
    onMount: (sheet) => {
      sheet.querySelector('#accSave').onclick = () => {
        const acc = { ...(S.settings.accounts || {}) };
        sheet.querySelectorAll('[data-role]').forEach((s) => { acc[s.dataset.role] = { ...(acc[s.dataset.role] || {}), role: s.value }; });
        sheet.querySelectorAll('[data-label]').forEach((i) => { acc[i.dataset.label] = { ...(acc[i.dataset.label] || {}), label: i.value.trim() }; });
        const betaal = Object.entries(acc).filter(([, v]) => v.role === 'betaal');
        if (betaal.length > 1) { toast('Kies precies één betaalrekening'); return; }
        S.settings.accounts = acc;
        S.settings.ownIbans = sheet.querySelector('#ownIbans').value.split(/\s*\n\s*/).map((x) => x.replace(/\s/g, '').toUpperCase()).filter(Boolean);
        markSettings();
        recompute();
        closeSheet();
        render();
        toast('Rekeningen opgeslagen');
      };
    },
  });
}

function openInvestSettings() {
  const snaps = [...(S.settings.investSnapshots || [])].sort((a, b) => b.date.localeCompare(a.date));
  openSheet({
    title: 'Sparen en beleggen',
    body: `
      <div class="field"><label for="invStart">Al belegd vóór je eerste import (inleg in euro)</label><input id="invStart" class="input" inputmode="decimal" value="${S.settings.investStart || ''}" placeholder="0"></div>
      <div class="field"><label for="savStart">Spaarsaldo vóór je eerste import</label><input id="savStart" class="input" inputmode="decimal" value="${S.settings.savingsStart || ''}" placeholder="0">
      <p class="help">Alleen nodig als je je spaarrekening niet mee downloadt. Anders gebruikt de app het echte saldo.</p></div>
      <h2 style="font-size:15px;margin-top:18px">Opgegeven waardes beleggingen</h2>
      ${snaps.map((s) => `<div class="list-item"><span class="grow">${fmtDate(s.date)}</span><span class="num">${eur(s.value)}</span><button class="x-btn" data-del="${s.date}" aria-label="Verwijder">✕</button></div>`).join('') || '<p class="muted">Nog geen waardes. Voeg er een toe via Vermogen.</p>'}`,
    foot: '<button class="btn block" id="invSave">Opslaan</button>',
    onMount: (sheet) => {
      const num = (v) => { const n = parseFloat(String(v).replace(/\./g, '').replace(',', '.')); return isNaN(n) ? 0 : n; };
      sheet.querySelectorAll('[data-del]').forEach((b) => b.onclick = () => {
        S.settings.investSnapshots = (S.settings.investSnapshots || []).filter((s) => s.date !== b.dataset.del);
        markSettings();
        openInvestSettings();
      });
      sheet.querySelector('#invSave').onclick = () => {
        S.settings.investStart = num(sheet.querySelector('#invStart').value);
        S.settings.savingsStart = num(sheet.querySelector('#savStart').value);
        markSettings();
        closeSheet();
        render();
        toast('Opgeslagen');
      };
    },
  });
}

function applyTheme() {
  const t = localStorage.getItem('geldzicht.theme');
  if (t === 'light' || t === 'dark') document.documentElement.dataset.theme = t;
  else delete document.documentElement.dataset.theme;
  const meta = document.querySelector('meta[name="theme-color"]');
  if (meta) meta.content = cssVar('--page') || '#13222e';
}

function openTheme() {
  const cur = localStorage.getItem('geldzicht.theme') || 'auto';
  openSheet({
    title: 'Weergave',
    body: `<div class="seg">${[['auto', 'Automatisch'], ['light', 'Licht'], ['dark', 'Donker']].map(([v, l]) => `<button class="${cur === v ? 'on' : ''}" data-theme-v="${v}">${l}</button>`).join('')}</div>`,
    onMount: (sheet) => sheet.querySelectorAll('[data-theme-v]').forEach((b) => b.onclick = () => {
      if (b.dataset.themeV === 'auto') localStorage.removeItem('geldzicht.theme'); else localStorage.setItem('geldzicht.theme', b.dataset.themeV);
      applyTheme();
      closeSheet();
      render();
    }),
  });
}

function openHowTo() {
  openSheet({
    title: 'Transacties downloaden',
    body: `
      <ol style="padding-left:20px;line-height:1.6">
        <li>Log in op internetbankieren van ABN AMRO (abnamro.nl, werkt ook in de browser op je telefoon).</li>
        <li>Ga naar Zelf regelen en kies Bij- en afschrijvingen downloaden.</li>
        <li>Kies de periode (tot 18 maanden terug) en als formaat <b>TXT</b>. XLS werkt ook.</li>
        <li>Vink je betaalrekening aan, en bij voorkeur ook je spaarrekening.</li>
        <li>Download het bestand en kies hier Importeren. Dubbele transacties worden overgeslagen, dus je kunt gerust overlappende periodes importeren.</li>
      </ol>
      <p class="help">De menunamen bij ABN AMRO kunnen afwijken; zoek anders op “downloaden” in de app of website van de bank. Of downloaden via de ABN AMRO-app op je telefoon kan, weet ik niet zeker.</p>`,
  });
}

/* ---------- Import ---------- */

function loadScript(src) {
  return new Promise((res, rej) => {
    if ([...document.scripts].some((s) => s.src.endsWith(src))) return res();
    const s = document.createElement('script');
    s.src = src; s.onload = res; s.onerror = () => rej(new Error('Kon ' + src + ' niet laden'));
    document.head.appendChild(s);
  });
}

async function readFile(file) {
  const name = file.name.toLowerCase();
  const buf = new Uint8Array(await file.arrayBuffer());
  const isXls = name.endsWith('.xls') || name.endsWith('.xlsx') || (buf[0] === 0xd0 && buf[1] === 0xcf) || (buf[0] === 0x50 && buf[1] === 0x4b);
  if (isXls) {
    await loadScript('lib/xlsx.full.min.js');
    const wb = window.XLSX.read(buf, { type: 'array' });
    const ws = wb.Sheets[wb.SheetNames[0]];
    const rows = window.XLSX.utils.sheet_to_json(ws, { header: 1, raw: true });
    const header = (rows[0] || []).map((h) => String(h || '').toLowerCase());
    if (header.includes('transactiondate') && header.includes('amount')) return { format: 'ABN AMRO XLS', ...parseAbnXlsRows(rows) };
    // andere spreadsheet: als CSV proberen
    const csv = window.XLSX.utils.sheet_to_csv(ws, { FS: ';' });
    return parseText(csv, file.name);
  }
  return parseText(decodeBytes(buf), file.name);
}

async function handleFile(file) {
  if (!file) return;
  let res;
  try {
    res = await readFile(file);
  } catch (e) {
    toast('Bestand kon niet worden gelezen: ' + e.message);
    return;
  }
  if (res.unsupported || !res.txs.length) {
    openSheet({ title: 'Bestand niet herkend', body: `<p>In <b>${esc(file.name)}</b> zijn geen transacties gevonden.</p><p class="help">Download bij ABN AMRO het formaat TXT of XLS. Andere banken: een CSV met kolommen voor datum en bedrag werkt meestal ook.</p>` });
    return;
  }
  const existing = new Set(S.txs.map((t) => t.id));
  const fresh = res.txs.filter((t) => !existing.has(t.id));
  const dates = res.txs.map((t) => t.date).sort();
  const accounts = [...new Set(res.txs.map((t) => t.account))];
  openSheet({
    title: 'Importeren',
    body: `
      <dl class="kv">
        <dt>Bestand</dt><dd>${esc(file.name)}</dd>
        <dt>Formaat</dt><dd>${esc(res.format)}</dd>
        <dt>Periode</dt><dd>${fmtDate(dates[0])} tot ${fmtDate(dates[dates.length - 1])}</dd>
        <dt>Rekeningen</dt><dd>${accounts.map(esc).join(', ')}</dd>
        <dt>Gevonden</dt><dd>${res.txs.length} transacties</dd>
        <dt>Nieuw</dt><dd><b>${fresh.length}</b>${res.txs.length - fresh.length ? ` (${res.txs.length - fresh.length} stonden er al in)` : ''}</dd>
        ${res.errors.length ? `<dt>Overgeslagen</dt><dd>${res.errors.length} regels konden niet worden gelezen</dd>` : ''}
      </dl>`,
    foot: fresh.length ? `<button class="btn block" id="doImport">${fresh.length} transacties importeren</button>` : '<button class="btn ghost block" data-act="sheet-close">Niets nieuws, sluiten</button>',
    onMount: (sheet) => {
      const b = sheet.querySelector('#doImport');
      if (b) b.onclick = () => { doImport(fresh, file.name); };
    },
  });
}

function doImport(fresh, fileName) {
  const now = new Date().toISOString();
  fresh.forEach((t) => { t.imported = now; });
  S.txs.push(...fresh);
  // Rekeningen registreren; de meest gebruikte wordt de betaalrekening
  const acc = { ...(S.settings.accounts || {}) };
  const hasBetaal = Object.values(acc).some((v) => v.role === 'betaal');
  const counts = {};
  for (const t of S.txs) counts[t.account] = (counts[t.account] || 0) + 1;
  const ranked = Object.keys(counts).sort((a, b) => counts[b] - counts[a]);
  ranked.forEach((a, i) => { if (!acc[a]) acc[a] = { role: !hasBetaal && i === 0 ? 'betaal' : 'spaar' }; });
  if (!Object.values(acc).some((v) => v.role === 'betaal') && ranked[0]) acc[ranked[0]].role = 'betaal';
  S.settings.accounts = acc;
  S.settings.imports = [...(S.settings.imports || []), { date: todayIso(), file: fileName, added: fresh.length }].slice(-30);
  markSettings();
  markTx(...fresh);
  const r = recompute();
  if (!S.period.anchor || S.period.mode === 'month') S.period = { mode: 'month', anchor: defaultAnchor() };
  closeSheet();
  render();
  const todo = fresh.filter((t) => t.category === UNCATEGORIZED || t.category === UNCATEGORIZED_IN).length;
  const matched = r.matches.length ? `, ${r.matches.length} terugbetalingen gekoppeld` : '';
  toast(`${fresh.length} geïmporteerd${matched}${todo ? `, ${todo} nog indelen` : ''}`, todo ? { label: 'Indelen', run: openQuickSort } : null);
}

function loadDemo() {
  const txt = buildDemoTxt(new Date());
  const res = parseText(txt, 'voorbeeld.TAB');
  S.settings = { ...DEFAULT_SETTINGS, ...S.settings, payers: DEMO_SETTINGS.payers, accounts: { '123456789': { role: 'betaal', label: 'Betaalrekening (voorbeeld)' }, '987654321': { role: 'spaar', label: 'Spaarrekening (voorbeeld)' } }, investStart: 1000 };
  doImport(res.txs, 'voorbeeldgegevens');
  toast('Voorbeeld geladen. Wis het via Meer voor je eigen import.');
}

/* ---------- Export ---------- */

function download(name, content, type) {
  const blob = new Blob([content], { type });
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  a.download = name;
  document.body.appendChild(a);
  a.click();
  setTimeout(() => { URL.revokeObjectURL(a.href); a.remove(); }, 500);
}

function exportCsv() {
  const rmap = L.reimbursementMap(S.txs);
  const q = (v) => `"${String(v ?? '').replace(/"/g, '""')}"`;
  const rows = [['Datum', 'Rekening', 'Naam', 'Omschrijving', 'Bedrag', 'Telt mee', 'Hoofdcategorie', 'Categorie', 'Soort', 'Notitie'].join(';')];
  for (const t of [...S.txs].sort((a, b) => a.date.localeCompare(b.date))) {
    rows.push([t.date, t.account, q(t.name), q(t.desc), t.amount.toFixed(2).replace('.', ','), L.effectiveAmount(t, rmap).toFixed(2).replace('.', ','), q(groupOf(t.category).name), q(catInfo(t.category).name), L.kindOf(t), q(t.note)].join(';'));
  }
  download(`geldzicht-${todayIso()}.csv`, '\ufeff' + rows.join('\r\n'), 'text/csv;charset=utf-8');
}

function exportJson() {
  download(`geldzicht-backup-${todayIso()}.json`, JSON.stringify({ app: 'geldzicht', version: VERSION, exported: new Date().toISOString(), settings: S.settings, txs: S.txs }), 'application/json');
}

async function restoreBackup(file) {
  try {
    const data = JSON.parse(await file.text());
    if (!Array.isArray(data.txs)) throw new Error('geen geldige back-up');
    if (!confirm(`Back-up van ${data.exported?.slice(0, 10) || 'onbekende datum'} met ${data.txs.length} transacties terugzetten? Huidige gegevens worden vervangen.`)) return;
    const oldIds = S.txs.map((t) => t.id);
    S.txs = data.txs;
    S.settings = { ...DEFAULT_SETTINGS, ...(data.settings || {}) };
    markIds(oldIds);
    markTx(...S.txs);
    markSettings();
    S.period = { mode: 'month', anchor: defaultAnchor() };
    render();
    toast('Back-up teruggezet');
  } catch (e) {
    toast('Terugzetten mislukt: ' + e.message);
  }
}

async function wipeAll() {
  if (!confirm('Alle transacties, regels en instellingen wissen? Dit kan niet ongedaan worden gemaakt. Download eventueel eerst een back-up.')) return;
  clearTimeout(S.saveTimer);
  S.dirtyIds.clear();
  S.dirtySettings = false;
  await S.store.wipe();
  S.txs = [];
  S.settings = { ...DEFAULT_SETTINGS };
  S.view = 'overzicht';
  render();
  toast('Alles gewist');
}

/* ---------- Klikacties ---------- */

document.addEventListener('click', (e) => {
  const el = e.target.closest('[data-act]');
  if (!el) return;
  const act = el.dataset.act;
  const v = el.dataset.v;
  switch (act) {
    case 'sheet-close': closeSheet(); break;
    case 'nav': S.view = v; render(); window.scrollTo(0, 0); break;
    case 'import': $('#fileInput').value = ''; $('#fileInput').click(); break;
    case 'demo': loadDemo(); break;
    case 'howto': openHowTo(); break;
    case 'period-prev':
    case 'period-next': {
      const d = act === 'period-prev' ? -1 : 1;
      if (S.period.mode === 'month') S.period.anchor = shiftMonth(S.period.anchor, d);
      if (S.period.mode === 'year') S.period.anchor = String(Number(S.period.anchor) + d);
      render();
      break;
    }
    case 'period-mode': {
      if (v === 'month') S.period = { mode: 'month', anchor: S.period.anchor && S.period.mode === 'month' ? S.period.anchor : defaultAnchor() };
      else if (v === 'year') S.period = { mode: 'year', anchor: (S.period.anchor || defaultAnchor()).slice(0, 4) };
      else if (v === 'custom') { openCustomPeriod(); break; } else S.period = { mode: v, anchor: S.period.anchor };
      render();
      break;
    }
    case 'tx': openTx(v); break;
    case 'pick-cat': openCategoryPicker([v]); break;
    case 'quick': openQuickSort(); break;
    case 'unmatched': S.view = 'transacties'; S.tx = { ...S.tx, kind: 'advance', scope: 'all', cat: '', q: '' }; render(); break;
    case 'group': openGroup(v); break;
    case 'group-tx': closeSheet(); S.view = 'transacties'; S.tx = { ...S.tx, cat: 'g:' + v, kind: 'all', q: '', scope: 'period', limit: 150 }; render(); window.scrollTo(0, 0); break;
    case 'cat-tx': closeSheet(); S.view = 'transacties'; S.tx = { ...S.tx, cat: 'c:' + v, kind: 'all', q: '', scope: 'period', limit: 150 }; render(); window.scrollTo(0, 0); break;
    case 'merchant': S.view = 'transacties'; S.tx = { ...S.tx, q: v, cat: '', kind: 'all', scope: 'period', limit: 150 }; render(); window.scrollTo(0, 0); break;
    case 'tx-kind': S.tx.kind = v; S.tx.limit = 150; render(); break;
    case 'tx-more': S.tx.limit += 300; render(); break;
    case 'link': openLinkPicker(v); break;
    case 'unlink': {
      const t = S.txs.find((x) => x.id === v);
      if (t) { delete t.reimbFor; delete t.autoMatched; t.noMatch = true; t.manual = false; markTx(t); recompute(); closeSheet(); render(); toast('Ontkoppeld'); }
      break;
    }
    case 'analyse-tab': S.analyse = v; render(); break;
    case 'trend-toggle': {
      const set = new Set(S.trendGroups || []);
      if (set.has(v)) set.delete(v); else if (set.size < 4) set.add(v); else { toast('Maximaal vier tegelijk'); break; }
      S.trendGroups = [...set];
      render();
      break;
    }
    case 'nw-update': openNwUpdate(); break;
    case 'set': openSettingsSheet(v); break;
    case 'export-csv': exportCsv(); break;
    case 'export-json': exportJson(); break;
    case 'restore': $('#backupInput').value = ''; $('#backupInput').click(); break;
    case 'wipe': wipeAll(); break;
    case 'logout': flush().finally(() => S.store.signOut()); break;
    default: break;
  }
});

document.addEventListener('change', (e) => {
  const el = e.target;
  if (el.matches('[data-act="toggle-advance"]')) {
    const t = S.txs.find((x) => x.id === el.dataset.v);
    if (t) { t.advance = el.checked; markTx(t); recompute(); toast(el.checked ? 'Gemarkeerd als voorgeschoten' : 'Telt weer als uitgave'); render(); }
  }
  if (el.matches('[data-act="toggle-excluded"]')) {
    const t = S.txs.find((x) => x.id === el.dataset.v);
    if (t) { t.excluded = el.checked; markTx(t); render(); }
  }
  if (el.id === 'txCat') { S.tx.cat = el.value; S.tx.limit = 150; render(); }
  if (el.id === 'txSort') { S.tx.sort = el.value; render(); }
  if (el.id === 'txScope') { S.tx.scope = el.value; render(); }
});

let searchTimer;
document.addEventListener('input', (e) => {
  if (e.target.id === 'txSearch') {
    clearTimeout(searchTimer);
    const val = e.target.value;
    searchTimer = setTimeout(() => { S.tx.q = val; S.tx.limit = 150; S.tx.focus = true; render(); }, 250);
  }
});

function openCustomPeriod() {
  const r = periodRange();
  openSheet({
    title: 'Kies datums',
    body: `<div class="field"><label for="pFrom">Van</label><input id="pFrom" type="date" class="input" value="${r.from}"></div>
           <div class="field"><label for="pTo">Tot en met</label><input id="pTo" type="date" class="input" value="${r.to}"></div>`,
    foot: '<button class="btn block" id="pApply">Toepassen</button>',
    onMount: (sheet) => {
      sheet.querySelector('#pApply').onclick = () => {
        const from = sheet.querySelector('#pFrom').value;
        const to = sheet.querySelector('#pTo').value;
        if (!from || !to || from > to) { toast('Kies een geldige periode'); return; }
        S.period = { mode: 'custom', from, to, anchor: S.period.anchor };
        closeSheet();
        render();
      };
    },
  });
}

$('#fileInput').addEventListener('change', (e) => handleFile(e.target.files[0]));
$('#backupInput').addEventListener('change', (e) => { if (e.target.files[0]) restoreBackup(e.target.files[0]); });

/* ---------- Wijzigingen van andere apparaten ---------- */

function stable(v) {
  if (Array.isArray(v)) return '[' + v.map(stable).join(',') + ']';
  if (v && typeof v === 'object') return '{' + Object.keys(v).sort().filter((k) => v[k] !== undefined).map((k) => JSON.stringify(k) + ':' + stable(v[k])).join(',') + '}';
  return JSON.stringify(v);
}

let remoteTimer;
function onRemote({ months, settings }) {
  let changed = false;
  if (months) {
    for (const [mk, list] of Object.entries(months)) {
      const remote = new Map((list || []).map((t) => [t.id, t]));
      const index = new Map(S.txs.map((t, i) => [t.id, i]));
      for (const rt of remote.values()) {
        if (S.dirtyIds.has(rt.id)) continue; // eigen wijziging die nog wordt opgeslagen gaat voor
        const i = index.get(rt.id);
        if (i == null) { S.txs.push(rt); changed = true; } else if (stable(S.txs[i]) !== stable(rt)) { S.txs[i] = rt; changed = true; }
      }
      const before = S.txs.length;
      S.txs = S.txs.filter((t) => t.date.slice(0, 7) !== mk || remote.has(t.id) || S.dirtyIds.has(t.id));
      if (S.txs.length !== before) changed = true;
    }
  }
  if (settings && !S.dirtySettings) {
    const next = { ...DEFAULT_SETTINGS, ...settings };
    if (stable(next) !== stable(S.settings)) { S.settings = next; changed = true; }
  }
  if (!changed) return;
  clearTimeout(remoteTimer);
  const go = () => {
    const a = document.activeElement;
    if (a && $('#app').contains(a) && /INPUT|TEXTAREA|SELECT/.test(a.tagName)) { remoteTimer = setTimeout(go, 1500); return; }
    if (S.period.mode === 'month' && !S.period.anchor) S.period.anchor = defaultAnchor();
    render();
    toast('Bijgewerkt vanaf een ander apparaat');
  };
  remoteTimer = setTimeout(go, 300);
}

/* ---------- Inloggen en starten ---------- */

const LOGIN_EMAIL = 'fabian@geldzicht.app'; // vast account, wordt niet getoond

function renderLogin(errMsg = '') {
  $('#app').innerHTML = `
    <div class="login">
      <span class="brand-mark" style="display:block;width:44px;height:44px;border-radius:12px"></span>
      <h1>${esc(APP_NAME)}</h1>
      <p>Log in om je overzicht te openen.</p>
      <form id="loginForm">
        <div class="field"><label>Wie ben je?</label><div class="input" style="display:flex;align-items:center;font-weight:600">Fabian</div><input type="text" autocomplete="username" value="${LOGIN_EMAIL}" hidden></div>
        <div class="field"><label for="pw">Wachtwoord</label><input id="pw" class="input" type="password" autocomplete="current-password" required></div>
        <div class="err" id="loginErr">${esc(errMsg)}</div>
        <button class="btn block" type="submit">Inloggen</button>
      </form>
          </div>`;
  $('#loginForm').onsubmit = async (e) => {
    e.preventDefault();
    $('#loginErr').textContent = '';
    try {
      await S.store.signIn(LOGIN_EMAIL, $('#pw').value);
    } catch (err) {
      const code = err.code || err.message || '';
      $('#loginErr').textContent = /invalid|wrong|user-not-found|credential/i.test(code) ? 'Wachtwoord klopt niet.'
        : /network/i.test(code) ? 'Geen verbinding. Controleer je internet en probeer opnieuw.'
        : /too-many/i.test(code) ? 'Te vaak geprobeerd. Wacht even en probeer opnieuw.'
        : `Inloggen mislukt (${code}).`;
    }
  };
}

async function loadData() {
  $('#app').innerHTML = '<div class="boot"><div class="boot-mark"></div><p>Gegevens ophalen</p></div>';
  try {
    const { txs, settings } = await S.store.load({ onRemote });
    S.txs = txs || [];
    S.settings = { ...DEFAULT_SETTINGS, ...(settings || {}) };
  } catch (e) {
    console.error(e);
    $('#app').innerHTML = `<div class="empty" style="padding-top:80px"><h3>Gegevens konden niet worden geladen</h3><p>${esc(e.message)}</p><button class="btn" onclick="location.reload()">Opnieuw proberen</button></div>`;
    return;
  }
  S.period = { mode: 'month', anchor: defaultAnchor() };
  render();
}

async function start() {
  applyTheme();
  window.matchMedia('(prefers-color-scheme: dark)').addEventListener('change', () => { applyTheme(); render(); });
  S.store = await createStore(firebaseConfig);
  if (S.store.mode === 'cloud') {
    let loadedFor = null;
    S.store.onAuth((user) => {
      if (!user) { loadedFor = null; renderLogin(); return; }
      if (loadedFor === user.uid) return;
      loadedFor = user.uid;
      loadData();
    });
  } else {
    await loadData();
  }
  if ('serviceWorker' in navigator && (location.protocol === 'https:' || location.hostname === 'localhost')) {
    navigator.serviceWorker.register('sw.js').catch((e) => console.warn('Service worker niet geregistreerd', e));
  }
}

start();

// Voor testen in de console
window.geldzicht = { S, L, render, onRemote };
