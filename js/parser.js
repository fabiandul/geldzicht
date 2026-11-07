// Inlezen van bankbestanden.
// Ondersteund: ABN AMRO TXT (.TAB, tab-gescheiden), ABN AMRO XLS (via SheetJS) en algemene CSV met kopregel.
// Uitvoer: lijst met ruwe transacties in een vast formaat.

export function decodeBytes(bytes) {
  try {
    return new TextDecoder('utf-8', { fatal: true }).decode(bytes);
  } catch {
    return new TextDecoder('windows-1252').decode(bytes);
  }
}

export function parseAmount(v) {
  if (typeof v === 'number') return Math.round(v * 100) / 100;
  if (v == null) return NaN;
  let s = String(v).trim().replace(/\s/g, '').replace(/[€]/g, '');
  if (!s) return NaN;
  let neg = false;
  if (/^\(.*\)$/.test(s)) { neg = true; s = s.slice(1, -1); }
  if (s.endsWith('-')) { neg = true; s = s.slice(0, -1); }
  if (s.includes(',') && s.includes('.')) {
    // 1.234,56 of 1,234.56
    if (s.lastIndexOf(',') > s.lastIndexOf('.')) s = s.replace(/\./g, '').replace(',', '.');
    else s = s.replace(/,/g, '');
  } else if (s.includes(',')) {
    s = s.replace(',', '.');
  }
  const n = parseFloat(s);
  if (isNaN(n)) return NaN;
  return Math.round((neg ? -n : n) * 100) / 100;
}

export function parseDate(v) {
  if (v == null) return null;
  if (typeof v === 'number') {
    // ABN gebruikt JJJJMMDD als getal in XLS
    if (v > 19000101 && v < 21001231) return parseDate(String(v));
    // Excel-serienummer
    const d = new Date(Math.round((v - 25569) * 86400 * 1000));
    return d.toISOString().slice(0, 10);
  }
  const s = String(v).trim();
  let m;
  if ((m = s.match(/^(\d{4})(\d{2})(\d{2})$/))) return `${m[1]}-${m[2]}-${m[3]}`;
  if ((m = s.match(/^(\d{4})[-/.](\d{1,2})[-/.](\d{1,2})/))) return `${m[1]}-${m[2].padStart(2, '0')}-${m[3].padStart(2, '0')}`;
  if ((m = s.match(/^(\d{1,2})[-/.](\d{1,2})[-/.](\d{4})/))) return `${m[3]}-${m[2].padStart(2, '0')}-${m[1].padStart(2, '0')}`;
  if ((m = s.match(/^(\d{1,2})[-/.](\d{1,2})[-/.](\d{2})$/))) return `20${m[3]}-${m[2].padStart(2, '0')}-${m[1].padStart(2, '0')}`;
  return null;
}

// ABN voegt in TXT-bestanden om de 32/64 tekens een extra spatie in.
export function rejoinDescription(s) {
  if (!s || s.startsWith('/')) return s || '';
  if (s.length <= 33 || s[32] !== ' ') return s;
  const head = s.slice(0, 32);
  const rest = s.slice(33).replace(/\s+$/, '');
  const parts = [];
  let i = 0;
  while (i < rest.length) {
    const chunk = rest.slice(i, i + 65);
    if (chunk.length === 65 && chunk[64] !== ' ') return s; // patroon klopt niet, laat ongewijzigd
    parts.push(chunk.slice(0, 64));
    i += 65;
  }
  return head + parts.join('');
}

const clean = (s) => (s || '').replace(/\s+/g, ' ').trim();

function parseNrDatetime(str) {
  const p = str.trim().split(/[-:./T]/).map((x) => parseInt(x, 10));
  if (p.length < 5 || p.some(isNaN)) return null;
  if (p[0] > 31) return `${p[0]}-${String(p[1]).padStart(2, '0')}-${String(p[2]).padStart(2, '0')}T${String(p[3]).padStart(2, '0')}:${String(p[4]).padStart(2, '0')}`;
  return `20${String(p[2]).padStart(2, '0')}-${String(p[1]).padStart(2, '0')}-${String(p[0]).padStart(2, '0')}T${String(p[3]).padStart(2, '0')}:${String(p[4]).padStart(2, '0')}`;
}

const SEPA_KEYS = /(Incassant|BIC|Naam|Machtiging|Omschrijving|IBAN|Kenmerk|Voor):\s?/g;

// Zet de omschrijving van ABN AMRO om in velden: type, naam, omschrijving, IBAN, tijdstip.
export function parseDescription(raw) {
  const s = raw || '';
  const out = { type: '', name: '', desc: '', iban: '', time: '', card: false };
  if (s.startsWith('/')) {
    const keys = ['TRTP', 'CSID', 'NAME', 'REMI', 'MARF', 'EREF', 'IBAN', 'BIC', 'ORDP', 'ID'];
    const parts = [];
    for (const p of s.slice(1).split('/')) {
      if (parts.length % 2 === 0) {
        if (keys.includes(p)) parts.push(p);
        else if (parts.length) parts.push(parts.pop() + '/' + p);
      } else parts.push(p);
    }
    const d = {};
    for (let i = 0; i + 1 < parts.length; i += 2) d[parts[i]] = clean(parts[i + 1]);
    out.type = d.TRTP || 'SEPA';
    if (/^iDEAL/i.test(out.type)) out.type = 'SEPA iDEAL';
    out.name = d.NAME || '';
    out.desc = d.REMI || '';
    out.iban = d.IBAN || '';
    return out;
  }

  const head = s.slice(0, 32).trim();
  const tail = s.slice(32);

  // Betaalpas, Apple/Google Pay en geldautomaat (nieuw formaat)
  let m;
  if (/^(BEA|GEA)\s*,/i.test(head) || /^(BEA|GEA)\s*,/i.test(s)) {
    out.card = true;
    out.type = /^GEA/i.test(s) ? 'GEA' : 'BEA';
    const padded = s.length > 32 && /^(BEA|GEA)\s*,[^,]*?\s{2,}$/i.test(s.slice(0, 32));
    const body = padded ? tail : s.replace(/^(BEA|GEA)\s*,\s*(Betaalpas|Apple Pay|Google Pay|Garmin Pay|Fitbit Pay|Samsung Pay|Betaalpas contactloos)?\s*/i, '');
    if ((m = body.match(/^\s*(.+?),\s?PAS(\d+)\s+NR:\s?([^,\s]+),?\s+([\d.\-/:T]+)\s*(.*)$/))) {
      out.name = clean(m[1]);
      out.time = parseNrDatetime(m[4]) || '';
      out.desc = clean(m[5]);
    } else if ((m = body.match(/^\s*(.+?)\s+NR:\s?([^,\s]+),?\s*([\d.\-/:T]+)\s*(.*)$/))) {
      out.name = clean(m[1]).replace(/^BETAALPAS\s+/i, '');
      out.time = parseNrDatetime(m[3]) || '';
      out.desc = clean(m[4]);
    } else {
      out.name = clean(body).slice(0, 40);
    }
    return out;
  }
  // Oud BEA-formaat: "BEA NR:AB012345 31.12.21/12.34 NAAM,PAS123 PLAATS"
  if ((m = s.match(/^BEA\s+NR:(\S+)\s+([\d./:]+)\s+(.+?),PAS(\d+)\s*(.*)$/))) {
    out.card = true;
    out.type = 'BEA';
    out.name = clean(m[3]);
    out.time = parseNrDatetime(m[2]) || '';
    out.desc = clean(m[5]);
    return out;
  }
  if (/^ABN AMRO Bank/i.test(head)) {
    out.type = 'Bankkosten';
    out.name = 'ABN AMRO Bank N.V.';
    out.desc = clean(tail);
    return out;
  }
  if (/^(Basic interest|CREDIT INTEREST|Rente)/i.test(head)) {
    out.type = 'Rente';
    out.name = 'ABN AMRO rente';
    out.desc = clean(tail);
    return out;
  }
  if (/^SEPA/i.test(s)) {
    const keyPos = [];
    let km;
    SEPA_KEYS.lastIndex = 0;
    while ((km = SEPA_KEYS.exec(s))) keyPos.push({ key: km[1], start: km.index, valStart: km.index + km[0].length });
    out.type = clean(keyPos.length ? s.slice(0, keyPos[0].start) : head);
    if (/iDEAL/i.test(out.type)) out.type = 'SEPA iDEAL';
    const fields = {};
    keyPos.forEach((k, i) => {
      const end = i + 1 < keyPos.length ? keyPos[i + 1].start : s.length;
      // waarden zijn soms afgebroken met opvulspaties; samenvoegen
      fields[k.key] = clean(s.slice(k.valStart, end));
    });
    out.name = fields.Naam || '';
    out.desc = fields.Omschrijving || '';
    out.iban = (fields.IBAN || '').replace(/\s/g, '');
    return out;
  }
  out.type = head || 'Overig';
  out.name = clean(head);
  out.desc = clean(tail);
  return out;
}

function fnv(str) {
  let h = 0x811c9dc5;
  for (let i = 0; i < str.length; i++) {
    h ^= str.charCodeAt(i);
    h = Math.imul(h, 0x01000193);
  }
  return (h >>> 0).toString(36);
}

export function makeId(parts) {
  const str = parts.join('|');
  return fnv(str) + fnv(str.split('').reverse().join(''));
}

function buildTx({ account, date, amount, before, after, raw, order, source, nameOverride, descOverride, ibanOverride }) {
  const d = parseDescription(raw);
  const id = before != null && after != null && !isNaN(before)
    ? makeId([account, date, amount.toFixed(2), before.toFixed(2), after.toFixed(2)])
    : makeId([account, date, amount.toFixed(2), raw, order]);
  return {
    id,
    account: String(account || 'onbekend'),
    date,
    amount,
    balanceBefore: before != null && !isNaN(before) ? before : null,
    balanceAfter: after != null && !isNaN(after) ? after : null,
    type: d.type,
    name: nameOverride || d.name || clean(raw).slice(0, 40),
    desc: descOverride != null ? descOverride : d.desc,
    iban: (ibanOverride || d.iban || '').toUpperCase(),
    time: d.time,
    card: d.card,
    raw: clean(raw),
    source,
  };
}

// ABN AMRO TXT: geen kopregel, 8 kolommen:
// rekening, valuta, transactiedatum, beginsaldo, eindsaldo, rentedatum, bedrag, omschrijving
export function parseAbnTab(text) {
  const lines = text.split(/\r?\n/).filter((l) => l.trim());
  const txs = [];
  const errors = [];
  lines.forEach((line, i) => {
    const c = line.split('\t');
    if (c.length < 8) { errors.push(i + 1); return; }
    const date = parseDate(c[2]);
    const amount = parseAmount(c[6]);
    if (!date || isNaN(amount)) { errors.push(i + 1); return; }
    const raw = rejoinDescription(c.slice(7).join('\t'));
    txs.push(buildTx({ account: c[0].trim(), date, amount, before: parseAmount(c[3]), after: parseAmount(c[4]), raw, order: i, source: 'abn-txt' }));
  });
  return { txs, errors };
}

// ABN AMRO XLS (rijen als arrays, eerste rij kopregel)
export function parseAbnXlsRows(rows) {
  const header = rows[0].map((h) => String(h || '').trim().toLowerCase());
  const idx = (n) => header.indexOf(n);
  const txs = [];
  const errors = [];
  rows.slice(1).forEach((r, i) => {
    if (!r || !r.length) return;
    const date = parseDate(r[idx('transactiondate')]);
    const amount = parseAmount(r[idx('amount')]);
    if (!date || isNaN(amount)) { errors.push(i + 2); return; }
    txs.push(buildTx({
      account: String(r[idx('accountnumber')] ?? '').trim(), date, amount,
      before: parseAmount(r[idx('startsaldo')]), after: parseAmount(r[idx('endsaldo')]),
      raw: String(r[idx('description')] ?? ''), order: i, source: 'abn-xls',
    }));
  });
  return { txs, errors };
}

function splitCsvLine(line, delim) {
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
    else if (ch === delim) { out.push(cur); cur = ''; }
    else cur += ch;
  }
  out.push(cur);
  return out;
}

const COLS = {
  date: ['datum', 'date', 'transactiedatum', 'boekdatum', 'transactiondate', 'boekingsdatum', 'rentedatum'],
  amount: ['bedrag', 'amount', 'transactiebedrag', 'bedrag (eur)', 'bedrag eur'],
  sign: ['af bij', 'af/bij', 'debet/credit', 'debit/credit', 'bij/af'],
  name: ['naam', 'naam / omschrijving', 'tegenpartij', 'naam tegenpartij', 'name', 'counterparty', 'begunstigde'],
  desc: ['omschrijving', 'description', 'mededelingen', 'omschrijving-1', 'details', 'notes'],
  iban: ['tegenrekening', 'iban tegenpartij', 'tegenrekening iban/bban', 'counterparty iban'],
  account: ['rekening', 'iban/bban', 'iban', 'rekeningnummer', 'accountnumber', 'account'],
  after: ['saldo na mutatie', 'saldo na trn', 'eindsaldo', 'endsaldo', 'saldo', 'balance'],
  before: ['beginsaldo', 'startsaldo'],
};

export function parseGenericCsv(text) {
  const lines = text.split(/\r?\n/).filter((l) => l.trim());
  if (lines.length < 2) return { txs: [], errors: [], unsupported: true };
  const first = lines[0];
  const delim = [';', ',', '\t'].sort((a, b) => first.split(b).length - first.split(a).length)[0];
  const header = splitCsvLine(first, delim).map((h) => h.trim().toLowerCase().replace(/^﻿/, ''));
  const find = (names) => header.findIndex((h) => names.includes(h));
  const ci = Object.fromEntries(Object.entries(COLS).map(([k, v]) => [k, find(v)]));
  if (ci.date < 0 || ci.amount < 0) return { txs: [], errors: [], unsupported: true, header };
  const txs = [];
  const errors = [];
  lines.slice(1).forEach((line, i) => {
    const c = splitCsvLine(line, delim);
    const date = parseDate(c[ci.date]);
    let amount = parseAmount(c[ci.amount]);
    if (!date || isNaN(amount)) { errors.push(i + 2); return; }
    if (ci.sign >= 0) {
      const sg = (c[ci.sign] || '').trim().toLowerCase();
      if (['af', 'debit', 'd', 'debet'].includes(sg)) amount = -Math.abs(amount);
      if (['bij', 'credit', 'c'].includes(sg)) amount = Math.abs(amount);
    }
    const name = ci.name >= 0 ? clean(c[ci.name]) : '';
    const desc = ci.desc >= 0 ? clean(c[ci.desc]) : '';
    const raw = clean([name, desc].join(' '));
    const tx = buildTx({
      account: ci.account >= 0 ? c[ci.account] : 'csv', date, amount,
      before: ci.before >= 0 ? parseAmount(c[ci.before]) : null,
      after: ci.after >= 0 ? parseAmount(c[ci.after]) : null,
      raw: desc && /^(SEPA|BEA|GEA|\/TRTP)/.test(desc) ? desc : raw, order: i, source: 'csv',
      nameOverride: name || undefined,
      ibanOverride: ci.iban >= 0 ? c[ci.iban] : undefined,
    });
    if (!(desc && /^(SEPA|BEA|GEA|\/TRTP)/.test(desc))) tx.desc = desc;
    txs.push(tx);
  });
  return { txs, errors };
}

// Herkent het formaat en leest de tekst in.
export function parseText(text, filename = '') {
  const firstLine = text.split(/\r?\n/).find((l) => l.trim()) || '';
  const cols = firstLine.split('\t');
  if (cols.length >= 8 && /^\d{6,}$/.test(cols[0].trim()) && /^\d{8}$/.test(cols[2].trim())) {
    return { format: 'ABN AMRO TXT', ...parseAbnTab(text) };
  }
  const res = parseGenericCsv(text);
  if (res.unsupported) return { format: 'onbekend', txs: [], errors: [], unsupported: true };
  return { format: 'CSV', ...res };
}
