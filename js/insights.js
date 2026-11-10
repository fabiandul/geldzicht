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
    items.push({ ...r, date: paid ? r.last : d, done: paid, late: !paid && d < rec.ref });
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
const PLACE_WORDS = [
  ['komodo|labuan bajo|lombok|rinjani|gili|bali|ubud|jakarta|yogyakarta|flores|indonesie|indonesia|sumatra|java', 'Indonesië'],
  ['porto|lisboa|lissabon|lisbon|algarve|madeira|douro', 'Portugal'],
  ['barcelona|madrid|valencia|malaga|mallorca|ibiza|tenerife|gran canaria|sevilla', 'Spanje'],
  ['parijs|paris|rouen|normandie|normandy|lyon|marseille|caen', 'Frankrijk'],
  ['londen|london|manchester|edinburgh', 'Verenigd Koninkrijk'],
  ['rome|roma|milaan|milano|florence|firenze|venetie|venezia|napels', 'Italië'],
  ['berlijn|berlin|munchen|keulen|koln|hamburg', 'Duitsland'],
  ['tokyo|kyoto|osaka|japan', 'Japan'],
  ['bangkok|phuket|chiang mai|thailand', 'Thailand'],
  ['new york|los angeles|miami', 'Verenigde Staten'],
];
const PLACES = PLACE_WORDS.map(([w, c]) => [new RegExp(`\\b(${w})\\b`, 'i'), c]);
const MONTHS = ['januari', 'februari', 'maart', 'april', 'mei', 'juni', 'juli', 'augustus', 'september', 'oktober', 'november', 'december'];
const BOOKING = new Set(['vliegen', 'verblijf', 'vakantie']);
// Landen waar je vaak alleen doorheen rijdt: die beginnen geen nieuwe reis
const TRANSIT = new Set(['BEL', 'BE', 'DEU', 'DE', 'LUX', 'LU']);

function foreign(t) {
  if (!t.card) return null;
  const m = (t.desc || '').match(/Land:\s*([A-Z]{2,3})/);
  if (!m || m[1] === 'NL' || m[1] === 'NLD') return null;
  return m[1];
}
const isRevolut = (t) => t.amount < 0 && (t.iban || '').toUpperCase().slice(4, 8) === 'REVO';
const titleCase = (s) => s.toLowerCase().replace(/(^|[\s-])([a-zà-ÿ])/g, (m, a, b) => a + b.toUpperCase());
function placeOf(t) {
  const text = `${t.name || ''} ${t.desc || ''}`.normalize('NFD').replace(/[̀-ͯ]/g, '');
  for (const [re, c] of PLACES) { const m = text.match(re); if (m) return { country: c, place: titleCase(m[1]) }; }
  return null;
}
const between = (d, a, b) => d >= a && d <= b;
const shift = (d, n) => new Date((dnum(d) + n) * DAY).toISOString().slice(0, 10);

// Reizen automatisch samenstellen:
// 1. pinbetalingen in het buitenland vormen de kern (nieuw land na een paar dagen stilte = nieuwe reis)
// 2. geld naar Revolut hoort als geheel bij de reis waar het meeste geld rond is overgemaakt
// 3. vluchten, verblijf en vakantie-Tikkies horen bij de reis waarin ze vallen, bij dezelfde persoon, of bij de eerstvolgende reis
export function detectTrips(txs, settings) {
  const main = L.mainAccount(settings, txs);
  const core = [];
  const revs = [];
  const books = [];
  for (const t of txs) {
    if (t.account !== main || t.excluded) continue;
    const ctry = foreign(t);
    if (isRevolut(t)) revs.push(t);
    else if (ctry || t.category === 'reis-uitgaven') core.push({ t, ctry });
    else if (BOOKING.has(t.category)) books.push(t);
  }
  const byDate = (a, b) => a.date.localeCompare(b.date);
  core.sort((a, b) => byDate(a.t, b.t));
  revs.sort(byDate);
  books.sort(byDate);

  const trips = [];
  for (const c of core) {
    const cur = trips[trips.length - 1];
    const gap = cur ? dnum(c.t.date) - dnum(cur.to) : Infinity;
    const real = c.ctry && !TRANSIT.has(c.ctry);
    const newCountry = cur && real && cur.ctrys.size && !cur.ctrys.has(c.ctry);
    if (!cur || gap > 21 || (newCountry && gap >= 3)) trips.push({ items: [c.t], from: c.t.date, to: c.t.date, ctrys: new Set(real ? [c.ctry] : []) });
    else { cur.items.push(c.t); cur.to = c.t.date; if (real) cur.ctrys.add(c.ctry); }
  }

  // Revolut: groepjes opwaarderingen, gekoppeld aan de reis het dichtst bij het zwaartepunt
  const revGroups = [];
  for (const t of revs) {
    const g = revGroups[revGroups.length - 1];
    if (g && dnum(t.date) - dnum(g[g.length - 1].date) <= 45) g.push(t); else revGroups.push([t]);
  }
  for (const g of revGroups) {
    const total = g.reduce((a, t) => a - t.amount, 0);
    let acc = 0;
    const mid = g.find((t) => (acc += -t.amount) >= total / 2).date;
    let best = null;
    let bestD = Infinity;
    for (const tr of trips) {
      const d = mid < tr.from ? dnum(tr.from) - dnum(mid) : mid > tr.to ? dnum(mid) - dnum(tr.to) : 0;
      if (d < bestD) { bestD = d; best = tr; }
    }
    if (best && bestD <= 30) {
      best.items.push(...g);
      for (const t of g) if (t.date > best.to) best.to = t.date;
    } else trips.push({ items: [...g], from: g[0].date, to: g[g.length - 1].date, ctrys: new Set() });
  }
  trips.sort((a, b) => a.from.localeCompare(b.from));

  // Boekingen
  const ibanOf = (t) => (t.iban || '').toUpperCase();
  const left = [];
  const rest = [];
  for (const b of books) {
    const tr = trips.find((x) => between(b.date, shift(x.from, -3), shift(x.to, 14)));
    if (tr) tr.items.push(b); else rest.push(b);
  }
  for (const b of rest) {
    const pl = placeOf(b);
    const ahead = trips.filter((x) => x.from > b.date && dnum(x.from) - dnum(b.date) <= 150);
    const tr = (pl && ahead.find((x) => x.items.some((t) => placeOf(t)?.country === pl.country || COUNTRY[foreign(t)] === pl.country)))
      || (ibanOf(b) && ahead.find((x) => x.items.some((t) => ibanOf(t) === ibanOf(b))))
      || ahead[0];
    if (tr) tr.items.push(b); else left.push(b);
  }
  // Losse boekingen zonder reis in de buurt: eigen reis
  for (const b of left) {
    const cur = trips.find((x) => x.bookingOnly && dnum(b.date) - dnum(x.to) <= 21 && b.date >= x.from);
    if (cur) { cur.items.push(b); cur.to = b.date; } else trips.push({ items: [b], from: b.date, to: b.date, ctrys: new Set(), bookingOnly: true });
  }

  const rmapAll = L.reimbursementMap(txs);
  const out = trips.map((tr) => {
    const items = [...new Set(tr.items)].sort(byDate);
    const votes = {};
    const cities = {};
    const keyPlaces = {};
    for (const t of items) {
      const amt = Math.abs(t.amount);
      const c = foreign(t);
      if (c) {
        const name = COUNTRY[c] || c;
        votes[name] = (votes[name] || 0) + amt * (TRANSIT.has(c) ? 0.3 : 1) + 0.01;
      }
      const pl = placeOf(t);
      if (pl) { votes[pl.country] = (votes[pl.country] || 0) + amt + 0.01; keyPlaces[pl.place] = pl.country; }
    }
    const country = Object.entries(votes).sort((a, b) => b[1] - a[1])[0]?.[0] || null;
    for (const t of items) {
      const c = foreign(t);
      if (!c || (COUNTRY[c] || c) !== country) continue;
      const city = titleCase((t.desc || '').split(',')[0].trim());
      if (city.length > 2 && !/^\d/.test(city)) cities[city] = (cities[city] || 0) + Math.abs(t.amount);
    }
    const places = [...Object.entries(keyPlaces).filter(([, c]) => c === country).map(([p]) => p), ...Object.entries(cities).sort((a, b) => b[1] - a[1]).map(([c]) => c)]
      .filter((p, i, a) => a.findIndex((x) => x.toLowerCase() === p.toLowerCase()) === i).slice(0, 4);
    const byCat = {};
    let total = 0;
    for (const t of items) {
      const cost = -L.effectiveAmount(t, rmapAll) || 0;
      total += cost;
      byCat[t.category] = (byCat[t.category] || 0) + cost;
    }
    const [y, m] = tr.from.split('-').map(Number);
    const days = dnum(tr.to) - dnum(tr.from) + 1;
    return {
      id: items[0].id,
      name: `${country || 'Reis'}, ${MONTHS[m - 1]} ${y}`,
      country, city: places[0] || null, places, from: tr.from, to: tr.to, days,
      bookedFrom: items[0].date,
      total: r2(total),
      perDay: days > 1 ? r2(total / days) : null,
      byCat,
      count: items.length,
      countries: Object.keys(votes).sort((a, b) => votes[b] - votes[a]),
      ids: items.map((t) => t.id),
    };
  }).filter((t) => t.total >= 15);
  return out.sort((a, b) => b.from.localeCompare(a.from));
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
