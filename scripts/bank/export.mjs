// Eenmalige export voor een overzicht buiten de app. Schrijft alles naar export.json;
// de workflow versleutelt dat bestand met een opgegeven publieke sleutel. Niets komt in het logboek.
import fs from 'node:fs';
import { init } from './common.mjs';
import * as L from './app/logic.js';
import { catInfo, GROUP_BY_ID } from './app/categories.js';
import { buildPortfolio, investValueAt, netDepositsUpTo } from './app/invest.js';

const { db, meta } = await init();
const uid = (await meta('settings').get()).ref.parent.parent.id;
const settings = (await meta('settings').get()).data() || {};
const prices = (await meta('prices').get()).data() || {};
const snap = await db.collection(`users/${uid}/months`).get();
const txs = [];
snap.forEach((d) => txs.push(...Object.values(d.data().tx || {})));
L.applyRules(txs, { rules: [], payers: [], ...settings });
L.autoMatchReimbursements && L.autoMatchReimbursements(txs, settings);
const rmap = L.reimbursementMap(txs);
const main = L.mainAccount(settings, txs);

const out = txs.filter((t) => !t.excluded).sort((a, b) => a.date.localeCompare(b.date) || (a.time || '').localeCompare(b.time || '')).map((t) => {
  const ci = catInfo(t.category);
  const g = GROUP_BY_ID[ci.group] || {};
  return {
    date: t.date, time: t.time || '', amount: t.amount, account: t.account === main ? 'Betaalrekening' : L.accountRole(settings, t.account, txs) === 'spaar' ? 'Spaarrekening' : 'Overig',
    main: t.account === main, kind: L.kindOf(t), eff: L.effectiveAmount(t, rmap), cat: t.category, catName: ci.name, group: ci.group, groupName: g.name || '', groupType: g.type || '',
    name: L.displayName(t) || '', merchant: L.merchantKey(t) || '', desc: (t.desc || '').replace(/[A-Z]{2}\d{2}[A-Z]{4}\d{6,}/g, '').replace(/\s+/g, ' ').trim().slice(0, 120),
    balance: t.balanceAfter ?? null, card: !!t.card, by: t.by || '', source: t.source || 'bestand', reimb: !!(t.reimbFor && t.reimbFor.length), advance: !!t.advance,
  };
});

// Beleggingen: waarde aan het eind van elke maand op basis van koersen
const events = settings.invest?.events || [];
const items = prices.items || {};
const priceAt = (isin, d) => { const it = items[isin]; if (!it) return null; let v = null; for (let i = 0; i < it.d.length; i++) { if (it.d[i] <= d) v = it.p[i]; else break; } return v; };
const months = L.monthsBetween(out[0].date.slice(0, 7), new Date().toISOString().slice(0, 7));
const autoSnaps = [];
for (const m of months) {
  const d = L.lastDayOfMonth(m) > new Date().toISOString().slice(0, 10) ? new Date().toISOString().slice(0, 10) : L.lastDayOfMonth(m);
  const pf = buildPortfolio(events, `${d}T23:59:59`);
  let v = pf.tot.cash; let n = 0;
  for (const p of pf.open) { const pr = priceAt(p.isin, d); if (pr != null) { v += p.qty * pr; n++; } }
  if (pf.open.length && n >= pf.open.length / 2) autoSnaps.push({ date: d, at: `${d}T23:59:59`, value: Math.round(v * 100) / 100, positions: pf.open.filter((p) => priceAt(p.isin, d) != null).map((p) => ({ name: p.name, value: p.qty * priceAt(p.isin, d) })) });
}
const sx = { ...settings, investSnapshots: [...(settings.investSnapshots || []), ...autoSnaps] };
const nw = L.netWorthSeries(txs, sx, months).map((x, i) => ({ month: months[i], ...x, deposits: events.length ? netDepositsUpTo(events, `${L.lastDayOfMonth(months[i])}T23:59:59`) : 0 }));
const pfNow = buildPortfolio(events);
const positions = pfNow.open.map((p) => {
  const it = items[p.isin];
  const last = it ? it.p[it.p.length - 1] : null;
  const ago = (days) => { if (!it) return null; const d = new Date(Date.now() - days * 864e5).toISOString().slice(0, 10); return priceAt(p.isin, d); };
  return { name: p.name, isin: p.isin, type: p.type, qty: p.qty, cost: p.cost, avg: p.avg, dividends: p.dividends, fees: p.fees, first: p.first, last: p.last, price: last, priceDate: it ? it.d[it.d.length - 1] : null, p1m: ago(30), p3m: ago(91), p1y: ago(365), cur: it ? it.cur : null };
});
const ev = events.map((e) => ({ t: e.t, kind: e.kind, sub: e.sub || '', name: e.name || '', isin: e.isin || '', qty: e.qty ?? null, price: e.price ?? null, eur: e.eur, fee: e.fee || 0 }));
fs.writeFileSync('export.json', JSON.stringify({ made: new Date().toISOString(), main, txs: out, networth: nw, positions, closed: pfNow.closed.map((p) => ({ name: p.name, realized: p.realized, dividends: p.dividends })), tot: pfNow.tot, investNow: events.length ? investValueAt(events, sx.investSnapshots, new Date().toISOString().slice(0, 19)).value : 0, events: ev }));
console.log('[export] klaar:', out.length, 'transacties');
