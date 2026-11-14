// Haalt eenmaal per dag slotkoersen op voor je open BUX-posities en zet ze (in euro) in je database.
// In het logboek komen alleen aantallen, geen posities of bedragen.
import { init } from './common.mjs';
import { buildPortfolio } from './app/invest.js';

const UA = { 'User-Agent': 'Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126 Safari/537.36', Accept: 'application/json' };
const log = (...a) => console.log('[koersen]', ...a);
const get = async (url) => {
  for (const host of ['query1', 'query2']) {
    try {
      const r = await fetch(url.replace('HOST', host), { headers: UA });
      if (r.ok) return await r.json();
    } catch { /* volgende */ }
  }
  return null;
};
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

async function chart(symbol) {
  const j = await get(`https://HOST.finance.yahoo.com/v8/finance/chart/${encodeURIComponent(symbol)}?range=1y&interval=1d`);
  const r = j?.chart?.result?.[0];
  if (!r || !r.timestamp) return null;
  const close = r.indicators?.quote?.[0]?.close || [];
  const d = [];
  const p = [];
  r.timestamp.forEach((ts, i) => { if (close[i] != null) { d.push(new Date(ts * 1000).toISOString().slice(0, 10)); p.push(close[i]); } });
  return { cur: r.meta.currency, d, p };
}

async function candidates(isin, name) {
  const out = [];
  for (const q of [isin, name]) {
    const j = await get(`https://HOST.finance.yahoo.com/v1/finance/search?q=${encodeURIComponent(q)}&quotesCount=8&newsCount=0`);
    for (const x of j?.quotes || []) if (['EQUITY', 'ETF'].includes(x.quoteType) && !out.includes(x.symbol)) out.push(x.symbol);
    if (out.length) break;
  }
  return out.slice(0, 6);
}

const at = (series, date) => { let v = null; for (let i = 0; i < series.d.length; i++) { if (series.d[i] <= date) v = series.p[i]; else break; } return v; };

async function main() {
  const { meta } = await init();
  const settings = (await meta('settings').get()).data() || {};
  const events = settings.invest?.events || [];
  if (!events.length) { log('geen beleggingen'); return; }
  const open = buildPortfolio(events).open;
  const prev = (await meta('prices').get()).data() || {};
  const today = new Date().toISOString().slice(0, 10);
  const same = open.every((p) => prev.items?.[p.isin]);
  if (process.env.MODE !== 'prices' && prev.updated?.slice(0, 10) === today && same) { log('vandaag al opgehaald'); return; }

  const fx = {};
  const fxFor = async (cur) => {
    if (cur === 'EUR') return null;
    const c = cur === 'GBp' ? 'GBP' : cur;
    if (!(c in fx)) fx[c] = await chart(`EUR${c}=X`);
    return fx[c];
  };
  const toEur = async (s) => {
    if (s.cur === 'EUR') return { d: s.d, p: s.p };
    const f = await fxFor(s.cur);
    if (!f) return null;
    const k = s.cur === 'GBp' ? 100 : 1;
    const p = s.d.map((date, i) => { const rate = at(f, date) || f.p[0]; return s.p[i] / k / rate; });
    return { d: s.d, p };
  };

  const items = {};
  let ok = 0;
  for (const pos of open) {
    const known = prev.items?.[pos.isin]?.symbol;
    const list = known ? [known] : await candidates(pos.isin, pos.name);
    // Controle: de koers moet passen bij wat je zelf per stuk betaalde
    const buys = events.filter((e) => e.kind === 'buy' && e.isin === pos.isin && e.qty > 0);
    const last = buys[buys.length - 1];
    let best = null;
    for (const sym of list) {
      const raw = await chart(sym);
      await sleep(250);
      if (!raw || raw.d.length < 5) continue;
      const eur = await toEur(raw);
      if (!eur) continue;
      let fits = true;
      if (last && last.t.slice(0, 10) >= eur.d[0]) {
        const paid = -last.eur / last.qty;
        const then = at(eur, last.t.slice(0, 10));
        fits = then != null && paid > 0 && then / paid > 0.8 && then / paid < 1.25;
      }
      if (fits) { best = { symbol: sym, cur: raw.cur, d: eur.d, p: eur.p.map((v) => Math.round(v * 10000) / 10000) }; break; }
    }
    if (best) { items[pos.isin] = best; ok++; }
  }
  await meta('prices').set({ updated: new Date().toISOString(), items, found: ok, total: open.length });
  log('klaar:', ok, 'van', open.length, 'posities met koers');
}

main().catch((e) => { log('fout:', e.message); process.exitCode = 1; });
