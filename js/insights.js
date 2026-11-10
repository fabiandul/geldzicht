// Inzichten: vaste lasten (automatisch herkend), reizen en de maandafsluiting.
import * as L from './logic.js';
import { catInfo, GROUP_BY_ID } from './categories.js';

const DAY = 86400000;
const dnum = (d) => Math.round(new Date(d + 'T12:00:00Z').getTime() / DAY);
const cents = (x) => Math.round(x * 100);
const r2 = (n) => Math.round(n * 100) / 100;
const median = (arr) => { const a = [...arr].sort((x, y) => x - y); const m = Math.floor(a.length / 2); return a.length % 2 ? a[m] : (a[m - 1] + a[m]) / 2; };

function addMonths(date, n, day) {
  let [y, m] = date.split('-').map(Number);
  m += n;
  while (m > 12) { m -= 12; y++; }
  while (m < 1) { m += 12; y--; }
  const last = new Date(Date.UTC(y, m, 0)).getUTCDate();
  return `${y}-${String(m).padStart(2, '0')}-${String(Math.min(day, last)).padStart(2, '0')}`;
}

export function dataEnd(txs, settings) {
  const main = L.mainAccount(settings, txs);
  let end = '';
  for (const t of txs) if (t.account === main && t.date > end) end = t.date;
  return end;
}

/* ---------- Vaste lasten ---------- */

const SHARED = /paypal|mollie|adyen|stripe|buckaroo|klarna|tikkie|betaalverzoek|ideal/i;

function streamKey(t) {
  if (t.card || L.tikkieInfo(t)) return null;
  if (L.kindOf(t) === 'terugbetaling') return null;
  const shared = SHARED.test(t.name || '');
  const base = t.iban && !shared ? 'i:' + t.iban.toUpperCase() : 'n:' + (L.merchantKey(t) || L.normalize(t.name).trim());
  return (t.amount < 0 ? '-' : '+') + base;
}

function close(a, b) {
  return Math.abs(a - b) <= Math.max(1.5, 0.2 * Math.max(Math.abs(a), Math.abs(b)));
}

// Herkent betalingen die minstens twee maanden op rij terugkomen en voorspelt de volgende.
export function detectRecurring(txs, settings) {
  const main = L.mainAccount(settings, txs);
  const ref = dataEnd(txs, settings);
  const groups = new Map();
  for (const t of txs) {
    if (t.account !== main || t.excluded) continue;
    const k = streamKey(t);
    if (!k) continue;
    if (!groups.has(k)) groups.set(k, []);
    groups.get(k).push(t);
  }
  const streams = [];
  for (const [key, list] of groups) {
    list.sort((a, b) => a.date.localeCompare(b.date));
    const own = [];
    for (const t of list) {
      let best = null;
      for (const s of own) {
        const last = s.items[s.items.length - 1];
        if (!close(last.amount, t.amount)) continue;
        const gap = dnum(t.date) - dnum(last.date);
        if (gap >= 20 && gap <= 45) { best = { s, gap }; break; }
        if (gap < 20 && !best) best = { s, gap };
      }
      if (best) { best.s.items.push(t); if (best.gap >= 20) best.s.gaps.push(best.gap); else best.s.extra++; }
      else own.push({ key, items: [t], gaps: [], extra: 0 });
    }
    // Minstens twee maanden op rij, en niet vooral losse tussendoor-aankopen (zoals vaak bestellen)
    streams.push(...own.filter((s) => s.gaps.length >= 1 && s.extra <= Math.max(1, s.gaps.length / 2)));
  }
  const out = streams.map((s) => {
    const items = s.items;
    const last = items[items.length - 1];
    const recent = items.slice(-3);
    const amount = r2(median(recent.map((t) => t.amount)));
    const day = Math.round(median(recent.map((t) => Number(t.date.slice(8, 10)))));
    const next = addMonths(last.date, 1, day);
    const stopped = dnum(next) + 10 < dnum(ref);
    const kind = L.kindOf(last);
    return {
      id: s.key + '|' + items[0].id,
      name: L.displayName(last),
      category: last.category,
      kind,
      amount,
      day,
      first: items[0].date,
      last: last.date,
      count: items.length,
      next,
      status: stopped ? 'gestopt' : 'actief',
      periodic: items.some((t) => /Periodieke/i.test(t.type || '')),
      type: last.type,
      ids: items.map((t) => t.id),
    };
  });
  const active = out.filter((r) => r.status === 'actief').sort((a, b) => a.amount - b.amount);
  const stopped = out.filter((r) => r.status === 'gestopt' && dnum(ref) - dnum(r.last) <= 185).sort((a, b) => b.last.localeCompare(a.last));
  const sum = (arr) => r2(arr.reduce((a, r) => a + r.amount, 0));
  return {
    ref,
    active,
    stopped,
    monthly: {
      expense: -sum(active.filter((r) => r.kind === 'expense' && r.amount < 0)),
      income: sum(active.filter((r) => r.kind === 'income' && r.amount > 0)),
      transfer: -sum(active.filter((r) => r.kind === 'transfer' && r.amount < 0)),
    },
  };
}

// Wat er in een maand verwacht wordt, en wat daarvan al binnen is.
export function expectedInMonth(rec, txs, mk) {
  const items = [];
  for (const r of rec.active) {
    // Eerstvolgende verwachte datum in deze maand
    let d = r.next;
    while (d.slice(0, 7) < mk) d = addMonths(d, 1, r.day);
    if (d.slice(0, 7) !== mk) {
      // Mogelijk al betaald deze maand
      if (r.last.slice(0, 7) === mk) items.push({ ...r, date: r.last, done: true });
      continue;
    }
    const paid = r.last.slice(0, 7) === mk;
    items.push({ ...r, date: paid ? r.last : d, done: paid });
  }
  return items.sort((a, b) => a.date.localeCompare(b.date));
}

export function forecast(rec, fromMonth, n = 3) {
  const out = [];
  for (let i = 0; i < n; i++) {
    const mk = addMonths(fromMonth + '-15', i, 15).slice(0, 7);
    let inc = 0;
    let exp = 0;
    let tr = 0;
    for (const r of rec.active) {
      if (r.next.slice(0, 7) > mk) continue;
      if (r.kind === 'income') inc += r.amount;
      else if (r.kind === 'transfer') tr += -r.amount;
      else exp += -r.amount;
    }
    out.push({ month: mk, income: r2(inc), expense: r2(exp), transfer: r2(tr) });
  }
  return out;
}

/* ---------- Reizen ---------- */

const COUNTRY = {
  PRT: 'Portugal', PT: 'Portugal', ESP: 'Spanje', ES: 'Spanje', FRA: 'Frankrijk', FR: 'Frankrijk', DEU: 'Duitsland', DE: 'Duitsland',
  BEL: 'België', BE: 'België', ITA: 'Italië', IT: 'Italië', GBR: 'Verenigd Koninkrijk', GB: 'Verenigd Koninkrijk', IRL: 'Ierland', IE: 'Ierland',
  AUT: 'Oostenrijk', AT: 'Oostenrijk', CHE: 'Zwitserland', CH: 'Zwitserland', GRC: 'Griekenland', GR: 'Griekenland', HRV: 'Kroatië', HR: 'Kroatië',
  TUR: 'Turkije', TR: 'Turkije', USA: 'Verenigde Staten', US: 'Verenigde Staten', IDN: 'Indonesië', ID: 'Indonesië', THA: 'Thailand', TH: 'Thailand',
  JPN: 'Japan', JP: 'Japan', CZE: 'Tsjechië', CZ: 'Tsjechië', POL: 'Polen', PL: 'Polen', HUN: 'Hongarije', HU: 'Hongarije', DNK: 'Denemarken', DK: 'Denemarken',
  SWE: 'Zweden', SE: 'Zweden', NOR: 'Noorwegen', NO: 'Noorwegen', FIN: 'Finland', FI: 'Finland', LUX: 'Luxemburg', LU: 'Luxemburg', MAR: 'Marokko', MA: 'Marokko',
  EGY: 'Egypte', CYP: 'Cyprus', MLT: 'Malta', ISL: 'IJsland', SVN: 'Slovenië', SVK: 'Slowakije', BGR: 'Bulgarije', ROU: 'Roemenië', MEX: 'Mexico',
  CAN: 'Canada', AUS: 'Australië', VNM: 'Vietnam', MYS: 'Maleisië', SGP: 'Singapore', ARE: 'Verenigde Arabische Emiraten', ZAF: 'Zuid-Afrika',
  BRA: 'Brazilië', ARG: 'Argentinië', CUW: 'Curaçao', ABW: 'Aruba', EST: 'Estland', LVA: 'Letland', LTU: 'Litouwen', MNE: 'Montenegro', ALB: 'Albanië',
};
const PLACES = [
  [/komodo|labuan|bajo|lombok|rinjani|gili|bali|ubud|jakarta|yogyakarta|flores|indonesi/i, 'Indonesië'],
  [/porto|lisbo|lissabon|algarve|madeira|douro/i, 'Portugal'],
  [/barcelona|madrid|valencia|malaga|mallorca|ibiza|tenerife|canaria|sevilla/i, 'Spanje'],
  [/parijs|paris|rouen|normandi|nice|lyon|marseille/i, 'Frankrijk'],
  [/londen|london|manchester|edinburgh/i, 'Verenigd Koninkrijk'],
  [/rome|roma|milaan|milano|florence|firenze|venetie|venezia|napels/i, 'Italië'],
  [/berlijn|berlin|munchen|keulen|koln|hamburg/i, 'Duitsland'],
  [/tokyo|kyoto|osaka|japan/i, 'Japan'],
  [/bangkok|phuket|chiang|thailand/i, 'Thailand'],
  [/new york|nyc|los angeles|miami/i, 'Verenigde Staten'],
];
const MONTHS = ['januari', 'februari', 'maart', 'april', 'mei', 'juni', 'juli', 'augustus', 'september', 'oktober', 'november', 'december'];
const BOOKING = new Set(['vliegen', 'verblijf', 'vakantie']);

function foreign(t) {
  if (!t.card) return null;
  const m = (t.desc || '').match(/Land:\s*([A-Z]{2,3})/);
  if (!m || m[1] === 'NL' || m[1] === 'NLD') return null;
  return m[1];
}
const isRevolut = (t) => t.amount < 0 && (t.iban || '').toUpperCase().slice(4, 8) === 'REVO';
const titleCase = (s) => s.toLowerCase().replace(/(^|[\s-])([a-zà-ÿ])/g, (m, a, b) => a + b.toUpperCase());

export function detectTrips(txs, settings) {
  const main = L.mainAccount(settings, txs);
  const cand = [];
  for (const t of txs) {
    if (t.account !== main || t.excluded) continue;
    const ctry = foreign(t);
    const abroad = !!ctry || t.category === 'reis-uitgaven' || isRevolut(t);
    const booking = BOOKING.has(t.category);
    if (!abroad && !booking) continue;
    cand.push({ t, abroad, ctry });
  }
  cand.sort((a, b) => a.t.date.localeCompare(b.t.date));
  const clusters = [];
  for (const c of cand) {
    const cur = clusters[clusters.length - 1];
    if (cur && dnum(c.t.date) - dnum(cur.end) <= 21) { cur.items.push(c); cur.end = c.t.date; }
    else clusters.push({ items: [c], start: c.t.date, end: c.t.date });
  }
  // Boekingen zonder uitgaven ter plekke horen bij de eerstvolgende reis (binnen 150 dagen)
  const merged = [];
  let pending = [];
  for (const cl of clusters) {
    const hasAbroad = cl.items.some((c) => c.abroad);
    if (!hasAbroad) {
      const next = clusters.find((x) => x.start > cl.end && x.items.some((c) => c.abroad));
      if (next && dnum(next.start) - dnum(cl.end) <= 150) { pending.push(...cl.items); continue; }
    }
    merged.push({ items: [...pending, ...cl.items] });
    pending = [];
  }
  if (pending.length) merged.push({ items: pending });
  const rmapAll = L.reimbursementMap(txs);
  const trips = merged.map((cl) => {
    const items = cl.items.map((c) => c.t);
    const abroadItems = cl.items.filter((c) => c.abroad).map((c) => c.t);
    const codes = {};
    const cities = {};
    for (const c of cl.items) {
      if (!c.ctry) continue;
      const name = COUNTRY[c.ctry] || c.ctry;
      codes[name] = (codes[name] || 0) + 1;
      const city = (c.t.desc || '').split(',')[0].trim();
      if (city && city.length > 2) cities[titleCase(city)] = (cities[titleCase(city)] || 0) + 1;
    }
    let country = Object.entries(codes).sort((a, b) => b[1] - a[1])[0]?.[0] || null;
    if (!country) {
      const text = items.map((t) => `${L.displayName(t)} ${t.desc || ''}`).join(' ');
      country = (PLACES.find(([re]) => re.test(text)) || [])[1] || null;
    }
    const city = Object.entries(cities).sort((a, b) => b[1] - a[1])[0]?.[0] || null;
    const span = abroadItems.length ? abroadItems : items;
    const from = span[0].date;
    const to = span[span.length - 1].date;
    const byCat = {};
    let total = 0;
    for (const t of items) {
      const cost = -L.effectiveAmount(t, rmapAll) || 0;
      total += cost;
      byCat[t.category] = (byCat[t.category] || 0) + cost;
    }
    const [y, m] = from.split('-').map(Number);
    const label = country ? `${country}${city && Object.keys(codes).length ? ` (${city})` : ''}` : 'Reis';
    const days = dnum(to) - dnum(from) + 1;
    return {
      id: items[0].id,
      name: `${label}, ${MONTHS[m - 1]} ${y}`,
      country, city, from, to, days,
      bookedFrom: items[0].date,
      total: r2(total),
      perDay: days > 1 ? r2(total / days) : null,
      byCat,
      count: items.length,
      countries: Object.keys(codes),
      ids: items.map((t) => t.id),
    };
  }).filter((t) => t.total >= 15 || t.countries.length);
  return trips.sort((a, b) => b.from.localeCompare(a.from));
}

/* ---------- Maandafsluiting ---------- */

export function monthReport(txs, settings, mk, extra = {}) {
  const main = L.mainAccount(settings, txs);
  const from = `${mk}-01`;
  const to = L.lastDayOfMonth(mk);
  const range = { from, to };
  const s = L.summarize(txs, settings, range);
  const prevMk = addMonths(from, -1, 1).slice(0, 7);
  const ps = L.summarize(txs, settings, { from: `${prevMk}-01`, to: L.lastDayOfMonth(prevMk) });
  const histMonths = [];
  for (let i = 1; i <= 6; i++) histMonths.push(addMonths(from, -i, 1).slice(0, 7));
  const end = dataEnd(txs, settings);
  const firstData = txs.filter((t) => t.account === main).map((t) => t.date).sort()[0] || from;
  const usable = histMonths.filter((m) => `${m}-01` >= firstData.slice(0, 7) + '-01' && `${m}-01` <= end);
  const hist = usable.map((m) => L.summarize(txs, settings, { from: `${m}-01`, to: L.lastDayOfMonth(m) }));
  const avg = (fn) => (hist.length ? hist.reduce((a, h) => a + fn(h), 0) / hist.length : null);
  const rmap = L.reimbursementMap(txs);
  const inMonth = txs.filter((t) => t.account === main && !t.excluded && t.date >= from && t.date <= to);
  const expenses = inMonth.filter((t) => L.kindOf(t) === 'expense' && L.effectiveAmount(t, rmap) < 0);

  // Categorieën met vergelijking
  const groups = new Set([...Object.keys(s.byGroup), ...Object.keys(ps.byGroup), ...hist.flatMap((h) => Object.keys(h.byGroup))]);
  const groupRows = [...groups].map((g) => {
    const cur = s.byGroup[g] || 0;
    const prev = ps.byGroup[g] || 0;
    const a = avg((h) => h.byGroup[g] || 0);
    return { group: g, cur, prev, avg: a, diffAvg: a != null ? cur - a : null };
  }).filter((r) => Math.abs(r.cur) > 0.5 || Math.abs(r.prev) > 0.5 || (r.avg && Math.abs(r.avg) > 0.5)).sort((a, b) => b.cur - a.cur);

  // Grootste uitgaven
  const biggest = [...expenses].sort((a, b) => L.effectiveAmount(a, rmap) - L.effectiveAmount(b, rmap)).slice(0, 6);

  // Nieuwe winkels (voor het eerst gezien)
  const seenBefore = new Set(txs.filter((t) => t.account === main && t.date < from).map((t) => L.merchantKey(t)).filter(Boolean));
  const newMerchants = new Map();
  for (const t of expenses) {
    const k = L.merchantKey(t);
    if (!k || seenBefore.has(k)) continue;
    if (!newMerchants.has(k)) newMerchants.set(k, { name: L.displayName(t), total: 0, count: 0, category: t.category });
    const m = newMerchants.get(k);
    m.total += -L.effectiveAmount(t, rmap);
    m.count++;
  }

  // Vaste lasten
  const rec = extra.recurring || detectRecurring(txs, settings);
  const recIds = new Set(rec.active.concat(rec.stopped).flatMap((r) => r.ids));
  const recurringPaid = inMonth.filter((t) => recIds.has(t.id));
  const fixedOut = -recurringPaid.filter((t) => t.amount < 0 && L.kindOf(t) === 'expense').reduce((a, t) => a + t.amount, 0);
  const startedRec = rec.active.filter((r) => r.first.slice(0, 7) === prevMk || r.first.slice(0, 7) === mk);
  const stoppedRec = rec.stopped.filter((r) => addMonths(r.last, 1, r.day).slice(0, 7) === mk);

  // Terugbetalingen
  const refunds = inMonth.filter((t) => t.amount > 0 && (L.kindOf(t) === 'expense' || L.kindOf(t) === 'terugbetaling'));
  const refundTotal = refunds.reduce((a, t) => a + t.amount, 0);
  const tikkiesIn = inMonth.filter((t) => t.amount > 0 && L.tikkieInfo(t));
  const tikkiesOut = inMonth.filter((t) => t.amount < 0 && L.tikkieInfo(t));

  // Patronen
  const perDay = {};
  for (const t of expenses) perDay[t.date] = (perDay[t.date] || 0) + -L.effectiveAmount(t, rmap);
  const daysInMonth = Number(to.slice(8, 10));
  const lastDay = end < to ? Math.max(0, dnum(end) - dnum(from) + 1) : daysInMonth;
  const topDay = Object.entries(perDay).sort((a, b) => b[1] - a[1])[0] || null;
  let weekend = 0;
  let week = 0;
  const weekday = [0, 0, 0, 0, 0, 0, 0];
  for (const [d, v] of Object.entries(perDay)) {
    const wd = (new Date(d + 'T12:00:00Z').getUTCDay() + 6) % 7;
    weekday[wd] += v;
    if (wd >= 5) weekend += v; else week += v;
  }
  const cashOut = Math.abs(inMonth.filter((t) => t.category === 'contant' && t.amount < 0).reduce((a, t) => a + t.amount, 0));
  const cardCount = inMonth.filter((t) => t.card && t.amount < 0).length;

  // Vermogen
  const nw = L.netWorthSeries(txs, settings, [prevMk, mk]);

  // Beleggingen
  let invest = null;
  const ev = settings.invest && settings.invest.events;
  if (ev && ev.length) {
    const inM = ev.filter((e) => e.t.slice(0, 7) === mk);
    invest = {
      deposits: r2(inM.filter((e) => e.kind === 'deposit').reduce((a, e) => a + e.eur, 0)),
      buys: inM.filter((e) => e.kind === 'buy').length,
      buyAmount: r2(-inM.filter((e) => e.kind === 'buy').reduce((a, e) => a + e.eur, 0)),
      sells: inM.filter((e) => e.kind === 'sell').length,
      dividends: r2(inM.filter((e) => e.kind === 'dividend').reduce((a, e) => a + e.eur, 0)),
      fees: r2(-inM.filter((e) => e.kind === 'fee').reduce((a, e) => a + e.eur, 0)),
      other: r2(inM.filter((e) => e.kind === 'interest' || e.kind === 'other').reduce((a, e) => a + e.eur, 0)),
      names: [...new Set(inM.filter((e) => e.kind === 'buy').map((e) => e.name))],
    };
  }

  // Reizen in deze maand
  const trips = (extra.trips || detectTrips(txs, settings)).filter((tr) => !(tr.to < from || tr.bookedFrom > to));

  // Kwaliteit
  const guessed = inMonth.filter((t) => t.by === 'gok' && !t.manual).length;
  const uncategorized = inMonth.filter((t) => String(t.category).startsWith('onbekend')).length;

  // Opvallende punten
  const highlights = [];
  const incomeAvg = avg((h) => h.income);
  const expenseAvg = avg((h) => h.expense);
  if (expenseAvg != null && expenseAvg > 0) {
    const d = s.expense - expenseAvg;
    if (Math.abs(d) >= Math.max(25, expenseAvg * 0.1)) highlights.push({ tone: d > 0 ? 'up' : 'down', text: `Je gaf ${fmt(Math.abs(d))} ${d > 0 ? 'meer' : 'minder'} uit dan gemiddeld (${fmt(expenseAvg)} per maand over de ${hist.length} maanden ervoor).` });
  }
  // Reizen zijn onregelmatig: geen vergelijking met het gemiddelde
  const movers = groupRows.filter((r) => r.group !== 'reizen' && r.diffAvg != null && Math.abs(r.diffAvg) >= 20).sort((a, b) => Math.abs(b.diffAvg) - Math.abs(a.diffAvg)).slice(0, 3);
  for (const r of movers) {
    const gname = GROUP_BY_ID[r.group]?.name || r.group;
    highlights.push({ tone: r.diffAvg > 0 ? 'up' : 'down', text: Math.abs(r.cur) < 0.5 ? `${gname}: niets uitgegeven, normaal ${fmt(r.avg)} per maand.` : `${gname}: ${fmt(r.cur)}, dat is ${fmt(Math.abs(r.diffAvg))} ${r.diffAvg > 0 ? 'meer' : 'minder'} dan gemiddeld.` });
  }
  if (biggest[0]) highlights.push({ tone: 'info', text: `Grootste uitgave: ${L.displayName(biggest[0])}, ${fmt(-L.effectiveAmount(biggest[0], rmap))}.` });
  if (newMerchants.size) highlights.push({ tone: 'info', text: `${newMerchants.size} ${newMerchants.size === 1 ? 'nieuwe plek' : 'nieuwe plekken'} waar je voor het eerst geld uitgaf.` });
  if (refundTotal > 0) highlights.push({ tone: 'down', text: `Je kreeg ${fmt(refundTotal)} terug via Tikkies en terugbetalingen.` });
  for (const r of startedRec) highlights.push({ tone: 'info', text: `Nieuwe vaste betaling: ${r.name}, ${fmt(Math.abs(r.amount))} per maand.` });
  for (const r of stoppedRec) highlights.push({ tone: 'info', text: `Gestopt: ${r.name} (laatst ${fmtDateShort(r.last)}).` });
  if (incomeAvg != null && s.income > 0 && Math.abs(s.income - incomeAvg) >= Math.max(50, incomeAvg * 0.1)) highlights.push({ tone: s.income > incomeAvg ? 'down' : 'up', text: `Je inkomen was ${fmt(Math.abs(s.income - incomeAvg))} ${s.income > incomeAvg ? 'hoger' : 'lager'} dan gemiddeld.` });
  for (const tr of trips) highlights.push({ tone: 'info', text: `Reis: ${tr.name}, in totaal ${fmt(tr.total)}.` });

  return {
    month: mk, prevMonth: prevMk, from, to, complete: end >= to, dataEnd: end,
    s, ps, histCount: hist.length,
    avg: { income: incomeAvg, expense: expenseAvg, saved: avg((h) => h.saved + h.invested) },
    groupRows, biggest, newMerchants: [...newMerchants.values()].sort((a, b) => b.total - a.total),
    recurring: { paid: recurringPaid, fixedOut: r2(fixedOut), started: startedRec, stopped: stoppedRec },
    refunds: { list: refunds, total: r2(refundTotal), tikkiesIn: tikkiesIn.length, tikkiesInTotal: r2(tikkiesIn.reduce((a, t) => a + t.amount, 0)), tikkiesOut: tikkiesOut.length, tikkiesOutTotal: r2(-tikkiesOut.reduce((a, t) => a + t.amount, 0)) },
    patterns: { perDayAvg: lastDay ? r2(s.expense / lastDay) : null, daysWithSpend: Object.keys(perDay).length, daysCounted: lastDay, topDay, weekend: r2(weekend), week: r2(week), weekday: weekday.map(r2), cashOut: r2(cashOut), cardCount, txCount: inMonth.length },
    networth: { prev: nw[0], cur: nw[1] },
    invest, trips, quality: { guessed, uncategorized }, highlights,
  };
}

function fmt(n) { return Number(n || 0).toLocaleString('nl-NL', { style: 'currency', currency: 'EUR' }); }
function fmtDateShort(d) { const [, m, day] = d.split('-').map(Number); return `${day} ${MONTHS[m - 1].slice(0, 3)}`; }
