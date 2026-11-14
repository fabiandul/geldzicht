// Haalt eenmaal per dag slotkoersen op voor je open BUX-posities en zet ze (in euro) in je database.
// Bronnen: justETF (ETF's), onvista (aandelen) en de ECB (wisselkoersen). Dit zijn geen officiele koppelingen.
// In het logboek komen alleen aantallen, geen posities of bedragen.
import { init } from './common.mjs';
import { buildPortfolio, assetType } from './app/invest.js';

const UA = { 'User-Agent': 'Mozilla/5.0 (X11; Linux x86_64) Chrome/126 Safari/537.36', Accept: 'application/json' };
const log = (...a) => console.log('[koersen]', ...a);
const stats = {};
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
async function get(url, kind, text) {
  try {
    const r = await fetch(url, { headers: text ? { ...UA, Accept: 'text/csv' } : UA });
    if (r.ok) return text ? await r.text() : await r.json();
    stats[`${kind} ${r.status}`] = (stats[`${kind} ${r.status}`] || 0) + 1;
  } catch { stats[`${kind} netwerk`] = (stats[`${kind} netwerk`] || 0) + 1; }
  return null;
}
const iso = (d) => d.toISOString().slice(0, 10);
const at = (s, date) => { let v = null; for (let i = 0; i < s.d.length; i++) { if (s.d[i] <= date) v = s.p[i]; else break; } return v; };

async function etf(isin, from, to) {
  const j = await get(`https://www.justetf.com/api/etfs/${isin}/performance-chart?locale=en&currency=EUR&valuesType=MARKET_VALUE&reduceData=false&includeDividends=false&features=DIVIDENDS&dateFrom=${from}&dateTo=${to}`, 'etf');
  const series = (j?.series || []).filter((x) => x.value?.raw > 0);
  if (series.length < 3) return null;
  return { src: 'justetf', cur: 'EUR', d: series.map((x) => x.date), p: series.map((x) => x.value.raw) };
}

const fx = {};
async function rates(cur, from) {
  if (!(cur in fx)) {
    const csv = await get(`https://data-api.ecb.europa.eu/service/data/EXR/D.${cur}.EUR.SP00.A?startPeriod=${from}&format=csvdata`, 'ecb', true);
    fx[cur] = null;
    if (csv) {
      const rows = csv.trim().split(/\r?\n/).map((l) => l.split(','));
      const iT = rows[0].indexOf('TIME_PERIOD');
      const iV = rows[0].indexOf('OBS_VALUE');
      const d = [];
      const p = [];
      for (const r of rows.slice(1)) { const v = Number(r[iV]); if (v > 0) { d.push(r[iT]); p.push(v); } }
      if (d.length) fx[cur] = { d, p };
    }
  }
  return fx[cur];
}

async function stock(isin, from, known) {
  let ev = known?.ev;
  let idn = known?.idn;
  if (!ev) {
    const s = await get(`https://api.onvista.de/api/v1/instruments/search/facet?searchValue=${isin}`, 'zoek');
    const all = (s?.facets || []).flatMap((f) => f.results || []);
    const hit = all.find((r) => r.isin === isin && r.entityType === 'STOCK');
    if (!hit) { const k = `geen aandeel (${all.length ? all.map((r) => r.entityType + (r.isin === isin ? '' : '?')).slice(0, 3).join('/') : 'leeg'})`; stats[k] = (stats[k] || 0) + 1; return null; }
    ev = hit.entityValue;
    const sn = await get(`https://api.onvista.de/api/v1/stocks/${ev}/snapshot`, 'detail');
    idn = sn?.quote?.market?.idNotation;
    if (!idn) { stats['geen notering'] = (stats['geen notering'] || 0) + 1; return null; }
  }
  const h = await get(`https://api.onvista.de/api/v1/instruments/STOCK/${ev}/eod_history?idNotation=${idn}&range=Y1&startDate=${from}`, 'koers');
  if (!h || !h.datetimeLast || h.datetimeLast.length < 3) { stats['geen historie'] = (stats['geen historie'] || 0) + 1; return null; }
  let cur = h.isoCurrency;
  const d = [];
  let p = [];
  h.datetimeLast.forEach((ts, i) => { if (h.last[i] > 0) { d.push(iso(new Date(ts * 1000))); p.push(h.last[i]); } });
  if (cur === 'GBX' || cur === 'GBp') { p = p.map((v) => v / 100); cur = 'GBP'; }
  if (cur !== 'EUR') {
    const r = await rates(cur, from);
    if (!r) { stats[`geen wisselkoers ${cur}`] = (stats[`geen wisselkoers ${cur}`] || 0) + 1; return null; }
    p = p.map((v, i) => v / (at(r, d[i]) || r.p[0]));
  }
  stats[`ok ${cur}`] = (stats[`ok ${cur}`] || 0) + 1;
  return { src: 'onvista', ev, idn, cur, d, p };
}

async function main() {
  const { meta } = await init();
  const settings = (await meta('settings').get()).data() || {};
  const events = settings.invest?.events || [];
  if (!events.length) { log('geen beleggingen'); return; }
  const open = buildPortfolio(events).open;
  const prev = (await meta('prices').get()).data() || {};
  const now = new Date();
  const today = iso(now);
  const complete = open.every((p) => prev.items?.[p.isin]);
  // Eenmaal per dag, 's avonds na de slotkoersen; of meteen als er een positie bij is gekomen
  if (process.env.MODE !== 'prices' && complete && (prev.updated?.slice(0, 10) === today || now.getUTCHours() < 4)) { log('niets te doen'); return; }
  if (process.env.MODE !== 'prices' && !complete && prev.tried?.slice(0, 13) === now.toISOString().slice(0, 13)) { log('dit uur al geprobeerd'); return; }

  const from = iso(new Date(now.getTime() - 372 * 86400000));
  const items = {};
  let ok = 0;
  let noFit = 0;
  for (const pos of open) {
    const known = prev.items?.[pos.isin];
    let s = null;
    if (assetType(pos.name) === 'etf') s = await etf(pos.isin, from, today);
    if (!s) s = await stock(pos.isin, from, known);
    if (!s && assetType(pos.name) !== 'etf') s = await etf(pos.isin, from, today);
    await sleep(300);
    if (!s) { if (known) items[pos.isin] = known; continue; }
    // Controle: de koers moet passen bij wat je zelf per stuk betaalde
    const buys = events.filter((e) => e.kind === 'buy' && e.isin === pos.isin && e.qty > 0);
    const last = buys[buys.length - 1];
    if (last && last.t.slice(0, 10) >= s.d[0]) {
      const paid = -last.eur / last.qty;
      const then = at(s, last.t.slice(0, 10));
      if (!(then != null && paid > 0 && then / paid > 0.8 && then / paid < 1.25)) { noFit++; continue; }
    }
    items[pos.isin] = { ...s, p: s.p.map((v) => Math.round(v * 10000) / 10000) };
    ok++;
  }
  await meta('prices').set({ updated: now.toISOString(), tried: now.toISOString(), items, found: ok, total: open.length });
  log('klaar:', ok, 'van', open.length, 'posities met koers', JSON.stringify(stats), 'past niet:', noFit);
}

main().catch((e) => { log('fout:', e.message); process.exitCode = 1; });
