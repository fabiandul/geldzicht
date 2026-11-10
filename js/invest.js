// Beleggingen: inlezen van de BUX-export (CSV) en berekenen van posities, inleg, dividend en kosten.

function splitCsvLine(line) {
  const out = [];
  let cur = '';
  let q = false;
  for (let i = 0; i < line.length; i++) {
    const ch = line[i];
    if (q) {
      if (ch === '"' && line[i + 1] === '"') { cur += '"'; i++; }
      else if (ch === '"') q = false;
      else cur += ch;
    } else if (ch === '"') q = true;
    else if (ch === ',') { out.push(cur); cur = ''; }
    else cur += ch;
  }
  out.push(cur);
  return out;
}

const num = (v) => {
  if (v == null || v === '') return null;
  const n = parseFloat(String(v).replace(',', '.'));
  return isNaN(n) ? null : n;
};
const r2 = (n) => Math.round(n * 100) / 100;
const norm = (s) => String(s || '').toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/[^a-z0-9]+/g, ' ').trim();

export function isBuxCsv(text) {
  const first = (text.split(/\r?\n/)[0] || '').replace(/^﻿/, '');
  return /Transaction Time/i.test(first) && /Transaction Category/i.test(first) && /Cash Balance Amount/i.test(first);
}

function fnv(str) {
  let h = 0x811c9dc5;
  for (let i = 0; i < str.length; i++) { h ^= str.charCodeAt(i); h = Math.imul(h, 0x01000193); }
  return (h >>> 0).toString(36);
}

// Zet de BUX-export om in overzichtelijke gebeurtenissen.
// Elke order verschijnt in de export meerdere keren (deelorders, geld- en effectenregel); die worden samengevoegd.
export function parseBux(text) {
  const lines = text.replace(/^﻿/, '').split(/\r?\n/).filter((l) => l.trim());
  const head = splitCsvLine(lines[0]).map((h) => h.trim());
  const col = (name) => head.findIndex((h) => h.toLowerCase().startsWith(name.toLowerCase()));
  const C = {
    time: col('Transaction Time'), cat: col('Transaction Category'), type: col('Transaction Type'), transfer: col('Transfer Type'),
    amount: col('Transaction Amount'), cur: col('Transaction Currency'), bal: col('Cash Balance Amount'),
    isin: col('Asset Id'), name: col('Asset Name'), qty: col('Asset Quantity'), price: col('Asset Price'), acur: col('Asset Currency'),
    rate: col('Exchange Rate'), pnl: col('Profit And Loss Amount'), dcur: col('Dividend Currency'),
    dgross: col('Dividend Gross Amount'), dnet: col('Dividend Net Amount'), dtax: col('Dividend Tax Amount'), desc: col('Transaction Description'),
  };
  const orders = new Map();
  const tradeFees = new Map();
  const events = [];
  let skipped = 0;
  for (const line of lines.slice(1)) {
    const c = splitCsvLine(line);
    const g = (k) => (C[k] >= 0 ? (c[C[k]] ?? '').trim() : '');
    const rawTime = g('time');
    if (!rawTime) { skipped++; continue; }
    const t = rawTime.replace(' ', 'T').slice(0, 19);
    const cat = g('cat').toLowerCase();
    const type = g('type');
    const transfer = g('transfer').toUpperCase();
    const amount = num(g('amount'));
    const bal = num(g('bal'));
    const desc = g('desc');
    if (transfer.startsWith('ASSET_')) continue; // dubbele effectenregel, de geldregel bevat dezelfde gegevens
    if (amount == null) { skipped++; continue; }
    if (g('cur') && g('cur') !== 'EUR') { skipped++; continue; }

    if (cat === 'trades') {
      const oid = (desc.match(/Order Partial Id:\s*([0-9a-f-]{8,})/i) || desc.match(/Order Id:\s*([0-9a-f-]{8,})/i) || [])[1] || `${t}|${g('isin')}`;
      let o = orders.get(oid);
      if (!o) {
        o = { id: 'o' + fnv(oid), t, kind: amount < 0 ? 'buy' : 'sell', isin: g('isin'), name: g('name'), qty: 0, eur: 0, acur: g('acur') || 'EUR', priceSum: 0, pnl: 0, fee: 0, bal: null };
        orders.set(oid, o);
        events.push(o);
      }
      const q = num(g('qty')) || 0;
      const p = num(g('price')) || 0;
      o.qty += q;
      o.priceSum += q * p;
      o.eur = r2(o.eur + amount);
      o.pnl = r2(o.pnl + (num(g('pnl')) || 0));
      if (bal != null) o.bal = bal;
      continue;
    }
    if (cat === 'fees' && /trading/i.test(type)) {
      const oid = (desc.match(/Order Id:\s*([0-9a-f-]{8,})/i) || [])[1];
      if (oid) tradeFees.set(oid, r2((tradeFees.get(oid) || 0) + amount));
    }
    let kind = 'other';
    if (cat === 'deposits') kind = 'deposit';
    else if (cat === 'withdrawals' || /withdraw/i.test(type)) kind = 'withdrawal';
    else if (cat === 'dividends') kind = 'dividend';
    else if (cat === 'fees') kind = 'fee';
    else if (cat === 'interest') kind = 'interest';
    const e = {
      id: 'e' + fnv(`${rawTime}|${type}|${amount}|${g('isin')}|${desc}`),
      t, kind, sub: type, eur: r2(amount), bal, desc,
    };
    if (g('isin')) { e.isin = g('isin'); e.name = g('name'); }
    if (kind === 'dividend') {
      e.dcur = g('dcur') || 'EUR';
      e.gross = num(g('dgross'));
      e.net = num(g('dnet'));
      e.tax = num(g('dtax'));
    }
    if (kind === 'fee') {
      const oid = (desc.match(/Order Id:\s*([0-9a-f-]{8,})/i) || [])[1];
      if (oid) e.order = 'o' + fnv(oid);
    }
    events.push(e);
  }
  for (const [oid, o] of orders) {
    o.qty = Math.round(o.qty * 1e6) / 1e6;
    o.price = o.qty ? Math.round((o.priceSum / o.qty) * 10000) / 10000 : null;
    delete o.priceSum;
    o.fee = tradeFees.get(oid) || 0;
  }
  events.sort((a, b) => a.t.localeCompare(b.t));
  return { events, skipped };
}

// Voegt een nieuwe export samen met wat er al was (zelfde gebeurtenis wordt niet dubbel geteld).
export function mergeEvents(oldEvents, newEvents) {
  const map = new Map((oldEvents || []).map((e) => [e.id, e]));
  let added = 0;
  for (const e of newEvents) { if (!map.has(e.id)) added++; map.set(e.id, e); }
  return { events: [...map.values()].sort((a, b) => a.t.localeCompare(b.t)), added };
}

export function assetType(name = '') {
  return /vanguard|ishares|\betf\b|spdr|xtrackers|amundi|invesco|wisdomtree|lyxor|vaneck|ucits|index/i.test(name) ? 'etf' : 'aandeel';
}

// Posities en totalen tot en met een bepaald moment.
export function buildPortfolio(events, upTo) {
  const pos = new Map();
  const tot = { deposits: 0, withdrawals: 0, dividends: 0, divTax: 0, interest: 0, other: 0, feesSub: 0, feesPortfolio: 0, feesTrading: 0, feesOther: 0, realized: 0, cash: 0, buys: 0, sells: 0 };
  for (const e of events) {
    if (upTo && e.t > upTo) break;
    if (e.bal != null) tot.cash = e.bal;
    if (e.kind === 'buy' || e.kind === 'sell') {
      let p = pos.get(e.isin);
      if (!p) { p = { isin: e.isin, name: e.name, qty: 0, cost: 0, invested: 0, realized: 0, dividends: 0, fees: 0, trades: 0, first: e.t, last: e.t, cur: e.acur, type: assetType(e.name) }; pos.set(e.isin, p); }
      p.trades++;
      p.last = e.t;
      p.fees += -(e.fee || 0);
      if (e.kind === 'buy') {
        p.qty += e.qty;
        p.cost += -e.eur;
        p.invested += -e.eur;
        tot.buys += -e.eur;
      } else {
        const share = p.qty > 0 ? Math.min(1, e.qty / p.qty) : 1;
        const removed = p.cost * share;
        const result = e.eur - removed;
        p.cost -= removed;
        p.qty -= e.qty;
        p.realized += result;
        tot.realized += result;
        tot.sells += e.eur;
      }
      if (Math.abs(p.qty) < 1e-6) { p.qty = 0; p.cost = 0; }
      continue;
    }
    if (e.kind === 'deposit') tot.deposits += e.eur;
    else if (e.kind === 'withdrawal') tot.withdrawals += -e.eur;
    else if (e.kind === 'dividend') {
      tot.dividends += e.eur;
      if (e.tax) tot.divTax += e.tax;
      const p = e.isin && pos.get(e.isin);
      if (p) p.dividends += e.eur;
    } else if (e.kind === 'interest') tot.interest += e.eur;
    else if (e.kind === 'fee') {
      if (/subscription/i.test(e.sub)) tot.feesSub += -e.eur;
      else if (/portfolio/i.test(e.sub)) tot.feesPortfolio += -e.eur;
      else if (/trading/i.test(e.sub)) tot.feesTrading += -e.eur;
      else tot.feesOther += -e.eur;
    } else tot.other += e.eur;
  }
  for (const k of Object.keys(tot)) tot[k] = r2(tot[k]);
  tot.fees = r2(tot.feesSub + tot.feesPortfolio + tot.feesTrading + tot.feesOther);
  tot.netDeposits = r2(tot.deposits - tot.withdrawals);
  const positions = [...pos.values()].map((p) => ({ ...p, cost: r2(p.cost), invested: r2(p.invested), realized: r2(p.realized), dividends: r2(p.dividends), fees: r2(p.fees), avg: p.qty > 0 ? p.cost / p.qty : null }));
  const open = positions.filter((p) => p.qty > 0).sort((a, b) => b.cost - a.cost);
  const closed = positions.filter((p) => p.qty === 0);
  tot.bookValue = r2(open.reduce((a, p) => a + p.cost, 0) + tot.cash);
  return { open, closed, tot };
}

export function netDepositsUpTo(events, upTo) {
  let s = 0;
  for (const e of events) {
    if (upTo && e.t > upTo) break;
    if (e.kind === 'deposit') s += e.eur;
    else if (e.kind === 'withdrawal') s += e.eur;
  }
  return r2(s);
}

export function snapMoment(snap) {
  return snap.at || `${snap.date}T00:00:00`;
}

// Waarde van de beleggingen op een moment: laatste opgegeven waarde plus wat er daarna is gestort.
// Zonder opgegeven waarde: de boekwaarde (aankoopwaarde van de posities plus cash).
export function investValueAt(events, snaps, upTo) {
  const snap = [...(snaps || [])].filter((s) => snapMoment(s) <= upTo).sort((a, b) => snapMoment(a).localeCompare(snapMoment(b))).pop();
  if (snap) {
    const after = netDepositsUpTo(events, upTo) - netDepositsUpTo(events, snapMoment(snap));
    // Posities die op dat moment open stonden maar zonder waarde zijn ingevuld: aankoopwaarde gebruiken
    let missing = 0;
    if (snap.positions && snap.positions.length) {
      const have = new Set(snap.positions.map((x) => norm(x.name)));
      for (const p of buildPortfolio(events, snapMoment(snap)).open) if (!have.has(norm(p.name))) missing += p.cost;
    }
    return { value: r2(Number(snap.value) + after + missing), snap, estimated: after !== 0 || missing > 0, missing: r2(missing) };
  }
  return { value: buildPortfolio(events, upTo).tot.bookValue, snap: null, estimated: true, book: true };
}


// Zoekt de opgegeven waarde van een positie in een momentopname.
export function snapValueFor(snap, position, events) {
  if (!snap || !snap.positions) return null;
  const m = snap.positions.find((x) => norm(x.name) === norm(position.name));
  if (!m) return null;
  // Na de momentopname nog gehandeld in deze positie? Dan klopt de oude waarde niet meer.
  const traded = events.some((e) => (e.kind === 'buy' || e.kind === 'sell') && e.isin === position.isin && e.t > snapMoment(snap));
  if (traded) return null;
  return m;
}
