// Bankkoppeling via Enable Banking (alleen lezen).
// Draait in GitHub Actions. Schrijft NOOIT bedragen, namen of omschrijvingen naar de logboeken (die zijn openbaar).
// Stappen, gestuurd via users/{uid}/meta/bank in Firestore:
//  - request === 'auth'      -> maak een toestemmingslink en zet die in authUrl
//  - code aanwezig           -> wissel de code in voor een sessie
//  - sessie geldig           -> haal transacties op (max 1x per dag automatisch, of op verzoek via request === 'sync')
import crypto from 'node:crypto';
import { init, pusher } from './common.mjs';
import { parseDescription, makeId } from './app/parser.js';
import * as L from './app/logic.js';

const API = 'https://api.enablebanking.com';
const APP_ID = process.env.EB_APP_ID;
const KEY = process.env.EB_PRIVATE_KEY;
const REDIRECT = process.env.REDIRECT_URL;
const MODE = process.env.MODE || 'auto';
const log = (...a) => console.log('[bank]', ...a);

function jwt() {
  const b64 = (o) => Buffer.from(JSON.stringify(o)).toString('base64url');
  const now = Math.floor(Date.now() / 1000);
  const head = b64({ typ: 'JWT', alg: 'RS256', kid: APP_ID });
  const body = b64({ iss: 'enablebanking.com', aud: 'api.enablebanking.com', iat: now, exp: now + 3600 });
  const sig = crypto.sign('RSA-SHA256', Buffer.from(`${head}.${body}`), KEY).toString('base64url');
  return `${head}.${body}.${sig}`;
}

async function api(method, path, body) {
  const res = await fetch(API + path, {
    method,
    headers: { Authorization: `Bearer ${jwt()}`, 'Content-Type': 'application/json' },
    body: body ? JSON.stringify(body) : undefined,
  });
  const text = await res.text();
  let data = null;
  try { data = JSON.parse(text); } catch { /* geen json */ }
  if (!res.ok) {
    const err = new Error(`API ${method} ${path.split('?')[0].replace(/[0-9a-f-]{20,}/g, ':id')} gaf ${res.status}`);
    err.status = res.status;
    err.detail = data && (data.message || data.error || data.code) ? String(data.message || data.error || data.code).slice(0, 200) : '';
    throw err;
  }
  return data;
}

const isoDay = (d) => d.toISOString().slice(0, 10);
const addDays = (s, n) => isoDay(new Date(Date.parse(s + 'T12:00:00Z') + n * 86400000));

function counterparty(t) {
  const out = t.credit_debit_indicator === 'CRDT';
  // Bij geld binnen is de tegenpartij de betaler (debtor), bij geld eruit de ontvanger (creditor)
  const party = out ? t.debtor : t.creditor;
  const acc = out ? t.debtor_account : t.creditor_account;
  return { name: party?.name || '', iban: acc?.iban || '' };
}

// Zet een Enable Banking-transactie om in het formaat van de app (zelfde velden als het TXT-bestand)
function mapTx(t, account) {
  const amount = Math.round(Number(t.transaction_amount?.amount || 0) * 100) / 100 * (t.credit_debit_indicator === 'DBIT' ? -1 : 1);
  const date = t.booking_date || t.value_date || t.transaction_date;
  const remit = (t.remittance_information || []).join(' ').replace(/\s+/g, ' ').trim();
  const cp = counterparty(t);
  // ABN AMRO geeft vaak de oorspronkelijke omschrijving mee; dan werkt de bestaande herkenning (Tikkie, BEA, land)
  const d = parseDescription(remit);
  const known = /^(BEA|GEA)\s*,|^\/TRTP\/|^SEPA|^ABN AMRO Bank/i.test(remit);
  const ref = t.entry_reference || t.transaction_id || `${date}|${amount}|${remit}|${cp.name}`;
  return {
    id: 'eb' + makeId([account, ref]),
    account,
    date,
    amount,
    balanceBefore: null,
    balanceAfter: null,
    type: known ? d.type : (t.bank_transaction_code?.description || (cp.iban ? 'SEPA Overboeking' : 'Overig')),
    name: (known && d.name) || cp.name || d.name || remit.slice(0, 40),
    desc: known ? d.desc : remit,
    iban: (cp.iban || (known ? d.iban : '') || '').replace(/\s/g, '').toUpperCase(),
    time: d.time || '',
    card: !!d.card,
    raw: remit,
    source: 'bank',
    imported: new Date().toISOString(),
  };
}

async function main() {
  const { db, uid, meta } = await init();
  const bankRef = meta('bank');
  let push = async () => 0;
  try { push = await pusher(meta); } catch (e) { log('push niet beschikbaar:', e.message); }
  // Testmelding op verzoek vanuit de app
  const pushDoc = (await meta('push').get()).data() || {};
  if (pushDoc.test) {
    const n = await push({ title: 'Geldzicht', body: 'Meldingen werken. Je krijgt een bericht zodra je salaris binnen is.', tag: 'test' });
    await meta('push').set({ test: false, lastTest: new Date().toISOString() }, { merge: true });
    log('testmelding verstuurd naar', n, 'toestel(len)');
  }
  const bank = (await bankRef.get()).data() || {};
  const now = new Date();
  const today = isoDay(now);

  // 1. Code inwisselen voor een sessie
  if (bank.code) {
    try {
      const s = await api('POST', '/sessions', { code: bank.code });
      const accounts = (s.accounts || []).map((a) => ({ uid: a.uid, iban: a.account_id?.iban || '' }));
      await bankRef.set({
        code: null, codeState: null, authUrl: null, state: null,
        session: s.session_id, accounts, validUntil: s.access?.valid_until || null,
        linkedAt: now.toISOString(), error: null, request: 'sync', expired: false,
      }, { merge: true });
      log('sessie gemaakt,', accounts.length, 'rekening(en)');
      bank.session = s.session_id; bank.accounts = accounts; bank.request = 'sync';
    } catch (e) {
      await bankRef.set({ code: null, codeState: null, error: `Toestemming verwerken mislukt (${e.status || ''})`, errorAt: now.toISOString() }, { merge: true });
      log('sessie maken mislukt:', e.message, e.detail);
      return;
    }
  }

  // 2. Toestemmingslink maken
  if (!bank.code && (bank.request === 'auth' || MODE === 'auth')) {
    const state = crypto.randomBytes(16).toString('hex');
    let link = null;
    for (const days of [180, 90]) {
      try {
        link = await api('POST', '/auth', {
          access: { valid_until: new Date(Date.now() + days * 86400000).toISOString() },
          aspsp: { name: 'ABN AMRO', country: 'NL' },
          state, redirect_url: REDIRECT, psu_type: 'personal',
        });
        break;
      } catch (e) { log('toestemmingslink met', days, 'dagen lukte niet:', e.message, e.detail); }
    }
    if (!link) { await bankRef.set({ request: null, error: 'Kon geen toestemmingslink maken', errorAt: now.toISOString() }, { merge: true }); return; }
    await bankRef.set({ request: null, authUrl: link.url, state, authAt: now.toISOString(), error: null }, { merge: true });
    log('toestemmingslink klaargezet');
    return;
  }

  if (!bank.session || !(bank.accounts || []).length) { log('nog geen koppeling'); return; }
  if (bank.validUntil && bank.validUntil < now.toISOString()) { log('toestemming verlopen'); await bankRef.set({ expired: true }, { merge: true }); return; }

  // 3. Ophalen: automatisch hooguit 1x per dag (de bank staat zonder jou maar 4 opvragingen per dag toe)
  const syncedToday = (bank.lastSync || '').slice(0, 10) === today;
  const want = bank.request === 'sync' || MODE === 'sync' || (!syncedToday && now.getUTCHours() >= 4);
  if (!want) { log('niets te doen'); return; }
  if ((bank.syncsToday || 0) >= 2 && syncedToday && MODE !== 'sync') { log('dagelijkse limiet bereikt'); await bankRef.set({ request: null }, { merge: true }); return; }

  const settings = (await db.doc(`users/${uid}/meta/settings`).get()).data() || {};
  const accKeys = Object.keys(settings.accounts || {});
  const monthsSnap = await db.collection(`users/${uid}/months`).get();
  const existing = [];
  monthsSnap.forEach((d) => existing.push(...Object.values(d.data().tx || {})));
  const ids = new Set(existing.map((t) => t.id));

  let added = 0;
  let skipped = 0;
  const fresh = [];
  let check = null;
  for (const a of bank.accounts) {
    const digits = (a.iban || '').replace(/\D/g, '').replace(/^\d{2}/, '').replace(/^0+/, '');
    const account = accKeys.find((k) => k.replace(/^0+/, '') === digits) || (a.iban ? digits : a.uid);
    const fileTxs = existing.filter((t) => t.account === account && t.source !== 'bank');
    const lastFile = fileTxs.reduce((m, t) => (t.date > m ? t.date : m), '');
    const lastBank = existing.filter((t) => t.account === account && t.source === 'bank').reduce((m, t) => (t.date > m ? t.date : m), '');
    const from = lastBank ? addDays(lastBank, -10) : lastFile ? addDays(lastFile, -10) : addDays(today, -89);

    // Alles ophalen vanaf 'from'
    const raw = [];
    let key = null;
    do {
      const q = new URLSearchParams({ date_from: from });
      if (key) q.set('continuation_key', key);
      const r = await api('GET', `/accounts/${a.uid}/transactions?${q}`);
      raw.push(...(r.transactions || []));
      key = r.continuation_key || null;
    } while (key);
    const booked = raw.filter((t) => !t.status || t.status === 'BOOK');
    const mapped = booked.map((t) => mapTx(t, account)).filter((t) => t.date);

    // Saldo's: vanaf het huidige saldo terugrekenen, zodat de app het verloop kent
    try {
      const bal = await api('GET', `/accounts/${a.uid}/balances`);
      const list = bal.balances || [];
      const pick = list.find((b) => /CLBD/i.test(b.balance_type)) || list.find((b) => /ITBD|XPCD|CLAV|ITAV/i.test(b.balance_type)) || list[0];
      if (pick) {
        let run = Math.round(Number(pick.balance_amount.amount) * 100) / 100;
        const refDate = pick.reference_date || today;
        const order = mapped.map((t, i) => ({ t, i })).sort((x, y) => (x.t.date === y.t.date ? y.i - x.i : x.t.date < y.t.date ? 1 : -1));
        // Transacties na de saldodatum eerst terugrekenen
        for (const { t } of order) {
          if (t.date > refDate) { run = Math.round((run - t.amount) * 100) / 100; }
        }
        for (const { t } of order) {
          if (t.date > refDate) continue;
          t.balanceAfter = run;
          t.balanceBefore = Math.round((run - t.amount) * 100) / 100;
          run = t.balanceBefore;
        }
        // Na-rekenen met de saldo's in je eerdere bankbestanden (alleen ja/nee in het logboek)
        const earliest = [...mapped].filter((t) => t.balanceBefore != null).sort((x, y) => (x.date < y.date ? -1 : 1))[0];
        if (earliest) {
          const ref = fileTxs.filter((t) => t.date < earliest.date && t.balanceAfter != null).sort((x, y) => (x.date < y.date ? 1 : -1))[0];
          check = ref ? Math.abs(ref.balanceAfter - earliest.balanceBefore) < 0.01 : null;
        }
      }
    } catch (e) { log('saldo ophalen mislukt:', e.message); }

    // Dubbele voorkomen: zelfde bedrag rond dezelfde datum dat al uit een bankbestand komt
    const pool = new Map();
    for (const t of fileTxs) {
      if (t.date < addDays(from, -3)) continue;
      const k = t.amount.toFixed(2);
      (pool.get(k) || pool.set(k, []).get(k)).push(t.date);
    }
    const writes = {};
    for (const t of mapped) {
      if (ids.has(t.id)) { skipped++; continue; }
      if (lastFile && t.date <= addDays(lastFile, 3)) {
        const dates = pool.get(t.amount.toFixed(2)) || [];
        const i = dates.findIndex((d) => Math.abs(Date.parse(d) - Date.parse(t.date)) <= 3 * 86400000);
        if (i >= 0) { dates.splice(i, 1); skipped++; continue; }
      }
      (writes[t.date.slice(0, 7)] ||= {})[t.id] = t;
      ids.add(t.id);
      fresh.push(t);
      added++;
    }
    for (const [mk, tx] of Object.entries(writes)) {
      await db.doc(`users/${uid}/months/${mk}`).set({ tx, updated: Date.now() }, { merge: true });
    }
    if (!bank.sample && raw.length) {
      // Eenmalig een paar ruwe voorbeelden bewaren in je eigen database, om de herkenning te controleren
      await bankRef.set({ sample: raw.slice(-5) }, { merge: true });
    }
  }

  // Melding bij salaris (geen Tikkies, geen eigen overboekingen)
  try {
    const recent = fresh.filter((t) => t.amount > 0 && t.date >= addDays(today, -4));
    if (recent.length && bank.lastSync) {
      const all = [...existing, ...fresh];
      try { L.applyRules(all, { rules: [], payers: [], ...settings }); } catch (e) { log('indelen voor melding lukte niet:', e.message); }
      const eur = (n) => n.toLocaleString('nl-NL', { style: 'currency', currency: 'EUR' });
      for (const t of recent) {
        const tikkie = /tikkie|aab inz/i.test(`${t.name} ${t.desc}`);
        const pay = t.category === 'salaris' || /\b(salaris|loon|salary)\b/i.test(`${t.desc} ${t.type}`);
        const big = t.amount >= 1000 && t.category !== 'overboeking-eigen' && !['sparen', 'beleggen', 'terugbetaling'].includes(t.category) && !L.looksLikePerson(t.name);
        if (!tikkie && (pay || big)) await push({ title: pay ? 'Salaris binnen' : 'Geld binnen', body: `${eur(t.amount)} van ${t.name}`.slice(0, 120), tag: 'in-' + t.id });
      }
    }
    const left = bank.validUntil ? Math.floor((Date.parse(bank.validUntil) - Date.now()) / 86400000) : null;
    if (left === 7 || left === 2) await push({ title: 'Bankkoppeling verloopt bijna', body: `Nog ${left} dagen. Open Geldzicht en vernieuw je toestemming.`, tag: 'bank-verloopt' });
  } catch (e) { log('melding mislukt:', e.message); }

  await bankRef.set({
    lastSync: now.toISOString(),
    syncsToday: syncedToday ? (bank.syncsToday || 0) + 1 : 1,
    lastAdded: added,
    request: null,
    balanceCheck: check,
    error: null,
    expired: false,
  }, { merge: true });
  log('klaar:', added, 'nieuw,', skipped, 'al aanwezig, saldo-controle:', check);
}

main().catch(async (e) => {
  log('fout:', e.message, e.detail || '');
  process.exitCode = 1;
});
