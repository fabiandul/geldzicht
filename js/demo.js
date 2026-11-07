// Maakt een nep ABN AMRO TXT-bestand met voorbeeldtransacties, zodat je de app kunt uitproberen.
// Alle namen en bedragen zijn verzonnen.

const MAIN = '123456789';
const SAVINGS = '987654321';
const SAVINGS_IBAN = 'NL00ABNA0987654321';

function rng(seed) {
  let x = seed;
  return () => { x = (x * 1664525 + 1013904223) % 4294967296; return x / 4294967296; };
}

const pad = (s, n) => (s.length >= n ? s.slice(0, n) : s + ' '.repeat(n - s.length));
const padTo32 = (s) => pad(s, Math.ceil(Math.max(s.length, 1) / 32) * 32);

// Voegt de extra spaties toe die ABN in TXT-bestanden gebruikt.
function abnWrap(desc) {
  const head = pad(desc.slice(0, 32), 32);
  const rest = desc.slice(32);
  const chunks = [];
  for (let i = 0; i < rest.length; i += 64) chunks.push(rest.slice(i, i + 64));
  return [head, ...chunks].join(' ');
}

function sepa(type, fields) {
  return pad(type, 32) + fields.map(([k, v]) => padTo32(`${k}: ${v}`)).join('');
}

function bea(name, date, time, place, wallet = 'Betaalpas') {
  const [y, m, d] = date.split('-');
  return pad(`BEA, ${wallet}`, 32) + pad(`${name},PAS123`, 32) + pad(`NR:${Math.floor(Math.random() * 9e7 + 1e7)}, ${d}.${m}.${y.slice(2)}/${time}`, 32) + pad(place, 32);
}

const money = (n) => n.toFixed(2).replace('.', ',');

export function buildDemoTxt(today = new Date()) {
  const r = rng(42);
  const rows = [];
  const add = (account, date, amount, desc) => rows.push({ account, date, amount: Math.round(amount * 100) / 100, desc });
  const start = new Date(today.getFullYear(), today.getMonth() - 5, 1);
  const pick = (arr) => arr[Math.floor(r() * arr.length)];
  const iso = (d) => d.toISOString().slice(0, 10);

  for (let mOff = 0; mOff < 6; mOff++) {
    const y = start.getFullYear();
    const m = start.getMonth() + mOff;
    const day = (d) => iso(new Date(Date.UTC(y, m, d)));
    if (new Date(Date.UTC(y, m, 1)) > today) break;
    const lastDay = new Date(Date.UTC(y, m + 1, 0)).getUTCDate();
    const until = (d) => new Date(Date.UTC(y, m, d)) <= today;

    if (until(24)) add(MAIN, day(24), 3200 + (mOff === 5 ? 0 : Math.round(r() * 40)), sepa('SEPA Overboeking', [['IBAN', 'NL00INGB0001234567'], ['BIC', 'INGBNL2A'], ['Naam', 'VOORBEELD WERKGEVER BV'], ['Omschrijving', `Salaris ${String(m % 12 + 1).padStart(2, '0')}`]]));
    if (until(25)) add(MAIN, day(25), -600, sepa('SEPA Overboeking', [['IBAN', SAVINGS_IBAN], ['BIC', 'ABNANL2A'], ['Naam', 'F VOORBEELD'], ['Omschrijving', 'Sparen']]));
    if (until(25)) add(SAVINGS, day(25), 600, sepa('SEPA Overboeking', [['IBAN', 'NL00ABNA0123456789'], ['BIC', 'ABNANL2A'], ['Naam', 'F VOORBEELD'], ['Omschrijving', 'Sparen']]));
    if (until(26)) add(MAIN, day(26), -300, sepa('SEPA iDEAL', [['IBAN', 'NL00ABNA0555555555'], ['BIC', 'ABNANL2A'], ['Naam', 'BUX B.V.'], ['Omschrijving', 'Storting BUX'], ['Kenmerk', `${day(26)} 09:12 1234567890123456`]]));
    if (until(1)) add(MAIN, day(1), -350, sepa('SEPA Overboeking', [['IBAN', 'NL00RABO0222222222'], ['BIC', 'RABONL2U'], ['Naam', 'J EN M VOORBEELD'], ['Omschrijving', 'Kostgeld']]));
    if (until(3)) add(MAIN, day(3), -13.99, sepa('SEPA Incasso algemeen doorlopend', [['Incassant', 'GB98NFXSDDCHAS0123'], ['Naam', 'NETFLIX INTERNATIONAL B.V.'], ['Machtiging', 'DD-0123'], ['Omschrijving', 'Netflix Monthly Subscription'], ['IBAN', 'LU012345678901234567']]));
    if (until(5)) add(MAIN, day(5), -11.99, sepa('SEPA Incasso algemeen doorlopend', [['Incassant', 'NL01ZZZ0123'], ['Naam', 'Spotify AB'], ['Machtiging', 'SP-99'], ['Omschrijving', 'Spotify Premium'], ['IBAN', 'NL00ADYB0123456789']]));
    if (until(6)) add(MAIN, day(6), -29.99, sepa('SEPA Incasso algemeen doorlopend', [['Incassant', 'NL01ZZZ0456'], ['Naam', 'Basic-Fit Nederland B.V.'], ['Machtiging', 'BF-12'], ['Omschrijving', 'Lidmaatschap'], ['IBAN', 'NL00ABNA0666666666']]));
    if (until(8)) add(MAIN, day(8), -17.5, sepa('SEPA Incasso algemeen doorlopend', [['Incassant', 'NL01ZZZ0789'], ['Naam', 'Odido Netherlands B.V.'], ['Machtiging', 'OD-77'], ['Omschrijving', 'Mobiel abonnement'], ['IBAN', 'NL00INGB0777777777']]));
    if (until(20)) add(MAIN, day(20), -152.35, sepa('SEPA Incasso algemeen doorlopend', [['Incassant', 'NL01ZZZ0999'], ['Naam', 'Zilveren Kruis Zorgverzekeringen'], ['Machtiging', 'ZK-1'], ['Omschrijving', 'Premie zorgverzekering'], ['IBAN', 'NL00INGB0888888888']]));
    if (until(28)) add(MAIN, day(28), -3.2, `ABN AMRO Bank N.V.              Basic Package                   3,20`);

    // Boodschappen en dagelijkse uitgaven
    for (let i = 0; i < 9; i++) {
      const d = 1 + Math.floor(r() * lastDay);
      if (!until(d)) continue;
      const shop = pick([['AH 1404', 'HEILOO'], ['Jumbo Heiloo', 'HEILOO'], ['Lidl Alkmaar', 'ALKMAAR'], ['Albert Heijn 1621', 'ALKMAAR'], ['Dirk vd Broek', 'ALKMAAR']]);
      add(MAIN, day(d), -(8 + r() * 45), bea(shop[0], day(d), `${10 + Math.floor(r() * 9)}:${String(Math.floor(r() * 60)).padStart(2, '0')}`, shop[1], pick(['Betaalpas', 'Apple Pay'])));
    }
    // Boodschappen voor ouders, die het exacte bedrag terugbetalen
    if (until(12)) {
      const amt = Math.round((55 + r() * 40) * 100) / 100;
      add(MAIN, day(12), -amt, bea('AH 1404', day(12), '17:42', 'HEILOO'));
      if (until(13)) add(MAIN, day(13), amt, sepa('SEPA Overboeking', [['IBAN', 'NL00RABO0222222222'], ['BIC', 'RABONL2U'], ['Naam', 'J EN M VOORBEELD'], ['Omschrijving', 'boodschappen']]));
    }
    if (until(18) && mOff % 2 === 0) {
      const a1 = 23.4; const a2 = 41.15;
      add(MAIN, day(16), -a1, bea('Jumbo Heiloo', day(16), '18:05', 'HEILOO'));
      add(MAIN, day(17), -a2, bea('AH 1404', day(17), '12:30', 'HEILOO'));
      add(MAIN, day(18), a1 + a2, sepa('SEPA Overboeking', [['IBAN', 'NL00RABO0222222222'], ['BIC', 'RABONL2U'], ['Naam', 'J EN M VOORBEELD'], ['Omschrijving', 'boodschappen deze week']]));
    }
    for (let i = 0; i < 2; i++) { const d = 2 + Math.floor(r() * 26); if (until(d)) add(MAIN, day(d), -(45 + r() * 25), bea('Shell Heiloo', day(d), '08:10', 'HEILOO')); }
    for (let i = 0; i < 3; i++) { const d = 1 + Math.floor(r() * 27); if (until(d)) add(MAIN, day(d), -(3 + r() * 8), bea('NLOV Q1B2C3D4E5F6', day(d), '07:41', 'www.ovpay.nl', 'Google Pay')); }
    for (let i = 0; i < 2; i++) { const d = 1 + Math.floor(r() * 27); if (until(d)) add(MAIN, day(d), -(18 + r() * 20), sepa('SEPA iDEAL', [['IBAN', 'NL00ABNA0333333333'], ['BIC', 'ABNANL2A'], ['Naam', 'Thuisbezorgd.nl via Takeaway.com'], ['Omschrijving', 'Bestelling 123456'], ['Kenmerk', `${day(d)} 19:44 123`]])); }
    for (let i = 0; i < 2; i++) { const d = 1 + Math.floor(r() * 27); if (until(d)) add(MAIN, day(d), -(4 + r() * 10), bea(pick(['McDonalds Alkmaar', 'Starbucks Alkmaar', 'FEBO Alkmaar']), day(d), '13:20', 'ALKMAAR')); }
    for (let i = 0; i < 2; i++) { const d = 4 + Math.floor(r() * 24); if (until(d)) add(MAIN, day(d), -(6 + r() * 30), bea(pick(['Cafe De Kroeg', 'Grand Cafe Alkmaar', 'Irish Pub Alkmaar']), day(d), '22:15', 'ALKMAAR')); }
    if (until(9)) add(MAIN, day(9), -(30 + Math.round(r() * 90)), sepa('SEPA iDEAL', [['IBAN', 'NL00ABNA0444444444'], ['BIC', 'ABNANL2A'], ['Naam', 'Zalando SE'], ['Omschrijving', 'Zalando bestelling 10099'], ['Kenmerk', `${day(9)} 21:03 456`]]));
    if (until(14) && mOff % 3 === 1) add(MAIN, day(14), 39.95, sepa('SEPA Overboeking', [['IBAN', 'NL00ABNA0444444444'], ['BIC', 'ABNANL2A'], ['Naam', 'Zalando SE'], ['Omschrijving', 'Retour 10099']]));
    if (until(15)) add(MAIN, day(15), -(5 + Math.round(r() * 15)), sepa('SEPA iDEAL', [['IBAN', 'NL00INGB0999999999'], ['BIC', 'INGBNL2A'], ['Naam', 'Nederlandse Loterij'], ['Omschrijving', 'TOTO storting'], ['Kenmerk', `${day(15)} 20:00 789`]]));
    if (until(21) && mOff % 2 === 1) add(MAIN, day(21), -(60 + Math.round(r() * 200)), sepa('SEPA iDEAL', [['IBAN', 'NL00RABO0101010101'], ['BIC', 'RABONL2U'], ['Naam', 'Coolblue B.V.'], ['Omschrijving', 'Bestelling 777'], ['Kenmerk', `${day(21)} 15:00 111`]]));
    if (until(22)) add(MAIN, day(22), -(9 + Math.round(r() * 20)), bea('SumUp  *Foodtruck Bertus', day(22), '12:45', 'HEILOO'));
    if (until(19) && mOff % 2 === 0) add(MAIN, day(19), -(20 + Math.round(r() * 40)), sepa('SEPA iDEAL', [['IBAN', 'NL00ABNA0121212121'], ['BIC', 'ABNANL2A'], ['Naam', 'Paylogic'], ['Omschrijving', 'Tickets festival'], ['Kenmerk', `${day(19)} 11:00 222`]]));
    if (until(23)) add(MAIN, day(23), 12.5, sepa('SEPA iDEAL', [['IBAN', 'NL00ABNA0131313131'], ['BIC', 'ABNANL2A'], ['Naam', 'AAB INZ TIKKIE'], ['Omschrijving', 'Tikkie ID 0001 pizza avond Van S de Vries']]));
    if (until(27)) add(MAIN, day(27), -(10 + Math.round(r() * 30)), bea('Kapper Kees', day(27), '10:00', 'HEILOO'));
  }

  rows.sort((a, b) => a.date.localeCompare(b.date));
  const balances = { [MAIN]: 2450, [SAVINGS]: 8000 };
  return rows.map((row) => {
    const before = balances[row.account];
    const after = Math.round((before + row.amount) * 100) / 100;
    balances[row.account] = after;
    const ymd = row.date.replace(/-/g, '');
    return [row.account, 'EUR', ymd, money(before), money(after), ymd, money(row.amount), abnWrap(row.desc)].join('\t');
  }).join('\r\n');
}

export const DEMO_SETTINGS = {
  payers: ['NL00RABO0222222222'],
};
