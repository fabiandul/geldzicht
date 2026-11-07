// Indelen, voorschieten koppelen en berekeningen.
import { CATEGORIES, CAT_BY_ID, GROUP_BY_ID, UNCATEGORIZED, UNCATEGORIZED_IN, catInfo } from './categories.js';

export function normalize(s) {
  return ' ' + String(s || '')
    .toLowerCase()
    .normalize('NFD').replace(/[̀-ͯ]/g, '')
    .replace(/[^a-z0-9]+/g, ' ')
    .trim() + ' ';
}

const GENERIC = new Set(['bv', 'b v', 'nv', 'n v', 'vof', 'via', 'ideal', 'nederland', 'nl', 'the', 'de', 'het', 'van', 'en', 'pas', 'betaalpas']);

// Een herkenbare sleutel voor een winkel of tegenpartij (zonder filiaalnummers en betaaldiensten).
export function merchantKey(tx) {
  let n = (tx.name || '').toLowerCase();
  n = n.replace(/^(sumup|zettle|izettle|ccv|sq|paypal|mollie|adyen|stripe|buckaroo|pay nl|payvision)\s*\*\s*/i, '');
  n = n.replace(/\s+via\s+.*$/, '');
  n = normalize(n).trim();
  const words = n.split(' ').filter((w) => w && !/^\d+$/.test(w) && !/^\d/.test(w) && !GENERIC.has(w));
  return words.slice(0, 3).join(' ');
}

function compileKeyword(kw) {
  let cardOnly = false;
  if (kw.startsWith('card:')) { cardOnly = true; kw = kw.slice(5); }
  const prefix = kw.endsWith('*');
  const base = normalize(kw.replace(/\*$/, '')).trim();
  return { base, prefix, cardOnly, len: base.length };
}

function kwMatches(k, text) {
  if (!k.base) return false;
  if (k.prefix) return text.includes(' ' + k.base);
  return text.includes(' ' + k.base + ' ');
}

// Bouwt de regels: eigen regels eerst (op volgorde), daarna standaardregels op lengte.
export function buildRules(settings) {
  const user = (settings.rules || []).map((r) => ({
    ...r,
    k: r.field === 'iban' ? null : compileKeyword(r.pattern),
    user: true,
  }));
  const defaults = [];
  for (const c of CATEGORIES) {
    for (const kw of c.kw || []) defaults.push({ category: c.id, dir: c.dir || '', k: compileKeyword(kw), user: false });
  }
  defaults.sort((a, b) => b.k.len - a.k.len);
  return { user, defaults };
}

function textFor(tx) {
  // Bij pinbetalingen bevat de omschrijving de plaats; die gebruiken we niet voor herkenning.
  return normalize(tx.card ? tx.name : `${tx.name} ${tx.desc}`);
}

function dirOk(dir, amount) {
  if (dir === 'out') return amount < 0;
  if (dir === 'in') return amount > 0;
  return true;
}

function isOwnAccount(tx, settings) {
  const own = (settings.ownIbans || []).map((x) => x.replace(/\s/g, '').toUpperCase()).filter(Boolean);
  if (tx.iban && own.includes(tx.iban.toUpperCase())) return true;
  const acc = Object.keys(settings.accounts || {});
  // ABN-rekeningnummers uit het bestand herkennen in een IBAN (NLxxABNA0 + rekeningnummer)
  return acc.some((a) => /^\d{6,}$/.test(a) && tx.iban && new RegExp(`ABNA0*${a.replace(/^0+/, '')}$`).test(tx.iban.toUpperCase()));
}

export function isPayer(tx, settings) {
  const payers = settings.payers || [];
  const text = normalize(`${tx.name} ${tx.desc}`);
  return payers.some((p) => {
    const v = String(p || '').trim();
    if (!v) return false;
    if (/^[A-Z]{2}\d{2}[A-Z0-9]{8,}$/i.test(v.replace(/\s/g, ''))) {
      return (tx.iban || '').toUpperCase() === v.replace(/\s/g, '').toUpperCase() || text.includes(normalize(v).trim());
    }
    return text.includes(' ' + normalize(v).trim() + ' ');
  });
}

// Bepaalt de categorie van een transactie (zonder handmatige keuze).
export function categorize(tx, rules, settings) {
  const text = textFor(tx);
  const fullText = normalize(`${tx.name} ${tx.desc}`);
  for (const r of rules.user) {
    if (!dirOk(r.dir, tx.amount)) continue;
    if (r.field === 'iban') {
      if (tx.iban && tx.iban.toUpperCase() === String(r.pattern).toUpperCase()) return { category: r.category, by: 'regel' };
      continue;
    }
    if (kwMatches(r.k, r.field === 'name' ? normalize(tx.name) : fullText)) return { category: r.category, by: 'regel' };
  }
  if (isOwnAccount(tx, settings)) return { category: 'sparen', by: 'eigen rekening' };
  if (tx.type === 'GEA') return { category: 'contant', by: 'auto' };
  if (tx.type === 'Bankkosten') return { category: tx.amount < 0 ? 'bankkosten' : 'rente', by: 'auto' };
  if (tx.type === 'Rente') return { category: 'rente', by: 'auto' };
  // Eerst alleen op de naam zoeken, daarna ook in de omschrijving.
  // Een bijschrijving van een winkel telt als retour en blijft in die categorie.
  const nameText = normalize(tx.name);
  for (const t of tx.card ? [nameText] : [nameText, text]) {
    for (const r of rules.defaults) {
      if (!dirOk(r.dir, tx.amount)) continue;
      if (r.k.cardOnly && !tx.card) continue;
      if (kwMatches(r.k, t)) return { category: r.category, by: 'standaard' };
    }
  }
  if (tx.amount > 0) return { category: UNCATEGORIZED_IN, by: 'auto' };
  if (/Overboeking/i.test(tx.type) && !tx.card) return { category: 'overboeking-persoon', by: 'auto' };
  return { category: UNCATEGORIZED, by: 'auto' };
}

export function kindOf(tx) {
  const g = catInfo(tx.category).group;
  const type = GROUP_BY_ID[g]?.type;
  if (tx.reimbFor && tx.reimbFor.length) return 'terugbetaling';
  if (type === 'transfer') return 'transfer';
  if (type === 'income') return 'income';
  return 'expense';
}

// Past regels toe op alle transacties die niet handmatig zijn ingedeeld.
export function applyRules(txs, settings) {
  const rules = buildRules(settings);
  for (const tx of txs) {
    if (tx.reimbFor && tx.reimbFor.length) { tx.category = 'terugbetaling'; continue; }
    if (tx.manual) continue;
    const r = categorize(tx, rules, settings);
    tx.category = r.category;
    tx.by = r.by;
  }
}

export function mainAccount(settings, txs) {
  const roles = settings.accounts || {};
  const main = Object.entries(roles).find(([, v]) => v.role === 'betaal');
  if (main) return main[0];
  const counts = {};
  for (const t of txs) counts[t.account] = (counts[t.account] || 0) + 1;
  return Object.entries(counts).sort((a, b) => b[1] - a[1])[0]?.[0];
}

export function accountRole(settings, account, txs) {
  const r = settings.accounts?.[account]?.role;
  if (r) return r;
  return account === mainAccount(settings, txs) ? 'betaal' : 'spaar';
}

const DAY = 86400000;
const toTime = (d) => new Date(d + 'T12:00:00').getTime();
const cents = (x) => Math.round(x * 100);

// Koppelt terugbetalingen (bijvoorbeeld van ouders) automatisch aan uitgaven met exact hetzelfde bedrag.
export function autoMatchReimbursements(txs, settings) {
  const window = (settings.matchDays || 45) * DAY;
  const main = mainAccount(settings, txs);
  const used = new Set();
  for (const t of txs) for (const id of t.reimbFor || []) used.add(id);
  const results = [];
  const incoming = txs
    .filter((t) => t.account === main && t.amount > 0 && !(t.reimbFor && t.reimbFor.length) && !t.noMatch && (!t.manual || t.category === 'terugbetaling') && !t.excluded && kindOf(t) !== 'transfer' && isPayer(t, settings))
    .sort((a, b) => a.date.localeCompare(b.date));
  for (const inc of incoming) {
    const t0 = toTime(inc.date);
    const cand = txs.filter((e) => e.account === main && e.amount < 0 && !used.has(e.id) && !e.excluded && kindOf(e) === 'expense'
      && toTime(e.date) <= t0 + DAY && toTime(e.date) >= t0 - window);
    const target = cents(inc.amount);
    const score = (e) => (e.advance ? 0 : 1) * 1000 + (catInfo(e.category).group === 'boodschappen' ? 0 : 500) + Math.abs(t0 - toTime(e.date)) / DAY;
    let pick = null;
    const singles = cand.filter((e) => cents(-e.amount) === target).sort((a, b) => score(a) - score(b));
    if (singles.length) pick = [singles[0]];
    if (!pick) {
      const pool = cand
        .filter((e) => e.advance || catInfo(e.category).group === 'boodschappen')
        .sort((a, b) => toTime(b.date) - toTime(a.date))
        .slice(0, 30);
      outer: for (let i = 0; i < pool.length; i++) {
        for (let j = i + 1; j < pool.length; j++) {
          const s2 = cents(-pool[i].amount) + cents(-pool[j].amount);
          if (s2 === target) { pick = [pool[i], pool[j]]; break outer; }
          if (s2 > target) continue;
          for (let k = j + 1; k < pool.length; k++) {
            if (s2 + cents(-pool[k].amount) === target) { pick = [pool[i], pool[j], pool[k]]; break outer; }
          }
        }
      }
    }
    if (pick) {
      inc.reimbFor = pick.map((e) => e.id);
      inc.autoMatched = true;
      inc.category = 'terugbetaling';
      pick.forEach((e) => used.add(e.id));
      results.push({ incoming: inc, expenses: pick });
    } else if (!inc.manual) {
      inc.category = 'terugbetaling';
      inc.unmatched = true;
    }
  }
  return results;
}

// Berekent per uitgave hoeveel er is terugbetaald.
export function reimbursementMap(txs) {
  const byId = new Map(txs.map((t) => [t.id, t]));
  const map = new Map();
  const incs = txs.filter((t) => t.reimbFor && t.reimbFor.length).sort((a, b) => a.date.localeCompare(b.date));
  for (const inc of incs) {
    let left = inc.amount;
    for (const id of inc.reimbFor) {
      const e = byId.get(id);
      if (!e) continue;
      const open = -e.amount - (map.get(id) || 0);
      const part = Math.min(open, left);
      if (part > 0) {
        map.set(id, (map.get(id) || 0) + part);
        left -= part;
      }
    }
  }
  return map;
}

// Het bedrag dat meetelt in de statistieken (negatief = kosten voor jou).
export function effectiveAmount(tx, rmap) {
  if (tx.excluded) return 0;
  const k = kindOf(tx);
  if (k === 'terugbetaling') return 0;
  if (k !== 'expense') return tx.amount;
  if (tx.amount > 0) return tx.amount; // retour of terugstorting van een winkel
  const back = rmap.get(tx.id) || 0;
  if (tx.advance && back === 0) return 0; // voorgeschoten, nog niet terug
  return Math.min(0, Math.round((tx.amount + back) * 100) / 100);
}

export function inRange(tx, range) {
  if (!range) return true;
  return (!range.from || tx.date >= range.from) && (!range.to || tx.date <= range.to);
}

// Kerncijfers voor een periode.
export function summarize(txs, settings, range) {
  const main = mainAccount(settings, txs);
  const rmap = reimbursementMap(txs);
  const res = {
    income: 0, expense: 0, saved: 0, invested: 0,
    byGroup: {}, byCat: {}, byMerchant: {}, byIncomeCat: {}, count: 0,
    fixed: 0, variable: 0, advanceOpen: 0, advanceOpenList: [],
  };
  for (const t of txs) {
    if (t.account !== main || t.excluded) continue;
    if (t.advance && !(rmap.get(t.id) > 0)) {
      res.advanceOpen += -t.amount;
      res.advanceOpenList.push(t);
    }
    if (!inRange(t, range)) continue;
    const k = kindOf(t);
    const eff = effectiveAmount(t, rmap);
    if (k === 'transfer') {
      if (t.category === 'beleggen') res.invested += -t.amount;
      else res.saved += -t.amount;
      continue;
    }
    if (k === 'income') {
      res.income += eff;
      res.byIncomeCat[t.category] = (res.byIncomeCat[t.category] || 0) + eff;
      continue;
    }
    if (k !== 'expense' || eff === 0) continue;
    const cost = -eff;
    res.count++;
    res.expense += cost;
    const g = catInfo(t.category).group;
    res.byGroup[g] = (res.byGroup[g] || 0) + cost;
    res.byCat[t.category] = (res.byCat[t.category] || 0) + cost;
    const mk = merchantKey(t) || t.name;
    if (!res.byMerchant[mk]) res.byMerchant[mk] = { name: t.name, key: mk, total: 0, count: 0, category: t.category };
    res.byMerchant[mk].total += cost;
    res.byMerchant[mk].count += 1;
    if (GROUP_BY_ID[g]?.fixed) res.fixed += cost; else res.variable += cost;
  }
  res.net = res.income - res.expense;
  res.rate = res.income > 0 ? res.net / res.income : null;
  return res;
}

export function monthKey(date) { return date.slice(0, 7); }

export function monthsBetween(from, to) {
  const out = [];
  let [y, m] = from.split('-').map(Number);
  const [ty, tm] = to.split('-').map(Number);
  while (y < ty || (y === ty && m <= tm)) {
    out.push(`${y}-${String(m).padStart(2, '0')}`);
    m++; if (m > 12) { m = 1; y++; }
  }
  return out;
}

export function lastDayOfMonth(mk) {
  const [y, m] = mk.split('-').map(Number);
  return `${mk}-${String(new Date(y, m, 0).getDate()).padStart(2, '0')}`;
}

// Inkomsten en uitgaven per maand.
export function monthly(txs, settings, months) {
  return months.map((mk) => {
    const s = summarize(txs, settings, { from: `${mk}-01`, to: lastDayOfMonth(mk) });
    return { month: mk, ...s };
  });
}

// Eindsaldo per dag per rekening, ook als de volgorde in het bestand niet chronologisch is.
export function closingBalances(txs) {
  const byAcc = {};
  for (const t of txs) {
    if (t.balanceAfter == null) continue;
    ((byAcc[t.account] ||= {})[t.date] ||= []).push(t);
  }
  const out = {};
  for (const [acc, days] of Object.entries(byAcc)) {
    out[acc] = Object.keys(days).sort().map((d) => {
      const list = days[d];
      const befores = new Set(list.filter((t) => t.balanceBefore != null).map((t) => cents(t.balanceBefore)));
      const end = list.find((t) => !befores.has(cents(t.balanceAfter)) || list.length === 1) || list[list.length - 1];
      return { date: d, balance: end.balanceAfter };
    });
  }
  return out;
}

function balanceAt(series, end) {
  let v = null;
  for (const e of series || []) { if (e.date <= end) v = e.balance; else break; }
  return v;
}

// Vermogen per maand: betaalrekening, spaarrekening en beleggingen.
export function netWorthSeries(txs, settings, months) {
  const main = mainAccount(settings, txs);
  const closing = closingBalances(txs);
  const spaarAccounts = Object.keys(closing).filter((a) => a !== main && accountRole(settings, a, txs) === 'spaar');
  const savingsStart = Number(settings.savingsStart || 0);
  const investStart = Number(settings.investStart || 0);
  const snaps = [...(settings.investSnapshots || [])].sort((a, b) => a.date.localeCompare(b.date));
  const transfers = txs.filter((t) => t.account === main && !t.excluded && kindOf(t) === 'transfer');
  return months.map((mk) => {
    const end = lastDayOfMonth(mk);
    const betaal = balanceAt(closing[main], end);
    let toSavings = 0;
    let toInvest = 0;
    for (const t of transfers) {
      if (t.date > end) continue;
      if (t.category === 'beleggen') toInvest += -t.amount; else toSavings += -t.amount;
    }
    let spaar;
    const spaarVals = spaarAccounts.map((a) => balanceAt(closing[a], end)).filter((v) => v != null);
    if (spaarVals.length) spaar = spaarVals.reduce((a, b) => a + b, 0);
    else spaar = savingsStart + toSavings;
    const inleg = investStart + toInvest;
    let invest = inleg;
    const snap = [...snaps].reverse().find((s) => s.date <= end);
    if (snap) {
      let since = 0;
      for (const t of transfers) if (t.category === 'beleggen' && t.date > snap.date && t.date <= end) since += -t.amount;
      invest = Number(snap.value) + since;
    }
    return { month: mk, betaal, spaar, invest, inleg, total: (betaal || 0) + spaar + invest };
  });
}

// Zoekt kandidaat-uitgaven om handmatig aan een terugbetaling te koppelen.
export function linkCandidates(inc, txs, settings, days = 60) {
  const main = mainAccount(settings, txs);
  const t0 = toTime(inc.date);
  const used = new Set();
  for (const t of txs) if (t.id !== inc.id) for (const id of t.reimbFor || []) used.add(id);
  return txs
    .filter((e) => e.account === main && e.amount < 0 && !used.has(e.id) && kindOf(e) === 'expense'
      && toTime(e.date) <= t0 + 2 * DAY && toTime(e.date) >= t0 - days * DAY)
    .sort((a, b) => {
      const ea = cents(-a.amount) === cents(inc.amount) ? 0 : 1;
      const eb = cents(-b.amount) === cents(inc.amount) ? 0 : 1;
      return ea - eb || b.date.localeCompare(a.date);
    });
}

export function fmtEur(n, opts = {}) {
  const v = Number(n || 0);
  return v.toLocaleString('nl-NL', { style: 'currency', currency: 'EUR', minimumFractionDigits: opts.whole ? 0 : 2, maximumFractionDigits: opts.whole ? 0 : 2 });
}
