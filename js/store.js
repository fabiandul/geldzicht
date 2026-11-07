// Opslag: Firebase (Firestore + inloggen) als er een configuratie is, anders lokaal in de browser.
// Firestore: users/{uid}/months/{JJJJ-MM} met daarin een map tx: { id: transactie }, en users/{uid}/meta/settings.
// Elke wijziging schrijft alleen de gewijzigde transacties (mergeFields), zodat twee apparaten elkaar niet overschrijven.
// Wijzigingen van andere apparaten komen live binnen via onSnapshot.

const clean = (o) => JSON.parse(JSON.stringify(o));

function localStore() {
  const K_TX = 'geldzicht.tx';
  const K_SET = 'geldzicht.settings';
  const read = (k, d) => {
    try { return JSON.parse(localStorage.getItem(k)) ?? d; } catch { return d; }
  };
  return {
    mode: 'local',
    user: null,
    async load() {
      return { txs: read(K_TX, []), settings: read(K_SET, {}) };
    },
    async saveTxs(_ids, allTxs) {
      try { localStorage.setItem(K_TX, JSON.stringify(allTxs)); } catch (e) { throw new Error('Opslag vol: ' + e.message); }
    },
    async saveSettings(settings) {
      localStorage.setItem(K_SET, JSON.stringify(settings));
    },
    async wipe() {
      localStorage.removeItem(K_TX);
      localStorage.removeItem(K_SET);
    },
    onAuth(cb) { cb({ local: true }); },
  };
}

async function cloudStore(config) {
  const fb = await import('../lib/firebase.js');
  const app = fb.initializeApp(config);
  const auth = fb.initializeAuth(app, { persistence: [fb.indexedDBLocalPersistence, fb.browserLocalPersistence] });
  let db;
  try {
    db = fb.initializeFirestore(app, { localCache: fb.persistentLocalCache({ tabManager: fb.persistentMultipleTabManager() }) });
  } catch {
    db = fb.initializeFirestore(app, {});
  }
  const uid = () => auth.currentUser?.uid;
  const monthOf = new Map(); // id -> JJJJ-MM, nodig om verwijderde transacties te vinden
  let unsubs = [];
  const collect = (snap) => {
    const out = [];
    snap.forEach((d) => {
      for (const t of Object.values(d.data().tx || {})) { monthOf.set(t.id, d.id); out.push(t); }
    });
    return out;
  };

  const store = {
    mode: 'cloud',
    get user() { return auth.currentUser; },
    onAuth(cb) { fb.onAuthStateChanged(auth, (u) => cb(u)); },
    async signIn(email, password) { return fb.signInWithEmailAndPassword(auth, email, password); },
    async signOut() { unsubs.forEach((f) => f()); unsubs = []; return fb.signOut(auth); },
    async resetPassword(email) { return fb.sendPasswordResetEmail(auth, email); },

    // Laadt alles en blijft daarna luisteren naar wijzigingen van andere apparaten.
    load({ onRemote } = {}) {
      unsubs.forEach((f) => f());
      unsubs = [];
      const u = uid();
      return new Promise((resolve, reject) => {
        let pending = true;
        let txs = null;
        let settings = null;
        const finish = () => {
          if (pending && txs !== null && settings !== null) { pending = false; clearTimeout(timer); resolve({ txs, settings }); }
        };
        const timer = setTimeout(() => { if (pending) { txs ??= []; settings ??= {}; finish(); } }, 8000);

        unsubs.push(fb.onSnapshot(fb.collection(db, 'users', u, 'months'), (snap) => {
          if (pending) {
            // Lege cache terwijl je online bent: wacht op de server.
            if (snap.metadata.fromCache && snap.empty && navigator.onLine) return;
            txs = collect(snap);
            finish();
            return;
          }
          const months = {};
          for (const ch of snap.docChanges()) {
            if (ch.type === 'removed') { months[ch.doc.id] = null; continue; }
            const list = Object.values(ch.doc.data().tx || {});
            list.forEach((t) => monthOf.set(t.id, ch.doc.id));
            months[ch.doc.id] = list;
          }
          if (Object.keys(months).length) onRemote?.({ months });
        }, (err) => { if (pending) { pending = false; reject(err); } else console.error(err); }));

        unsubs.push(fb.onSnapshot(fb.doc(db, 'users', u, 'meta', 'settings'), (snap) => {
          const data = snap.exists() ? snap.data() : {};
          if (pending) { settings = data; finish(); return; }
          onRemote?.({ settings: data });
        }, (err) => { if (pending) { pending = false; reject(err); } else console.error(err); }));
      });
    },

    // Schrijft alleen de opgegeven transacties. Ontbreekt een id in allTxs, dan wordt hij verwijderd.
    async saveTxs(ids, allTxs) {
      const u = uid();
      const byId = new Map(allTxs.map((t) => [t.id, t]));
      const perMonth = {};
      for (const id of ids) {
        const t = byId.get(id);
        const mk = t ? t.date.slice(0, 7) : monthOf.get(id);
        if (!mk) continue;
        (perMonth[mk] ||= []).push([id, t]);
        if (t) monthOf.set(id, mk);
      }
      const entries = Object.entries(perMonth);
      const commits = [];
      for (let i = 0; i < entries.length; i += 400) {
        const batch = fb.writeBatch(db);
        for (const [mk, list] of entries.slice(i, i + 400)) {
          const ref = fb.doc(db, 'users', u, 'months', mk);
          const tx = {};
          const fields = ['updated'];
          for (const [id, t] of list) {
            tx[id] = t ? clean(t) : fb.deleteField();
            fields.push(new fb.FieldPath('tx', id));
          }
          batch.set(ref, { tx, updated: Date.now() }, { mergeFields: fields });
        }
        // Alle batches meteen versturen: offline worden ze bewaard en later verstuurd.
        commits.push(batch.commit());
      }
      for (const [id, t] of ids.map((x) => [x, byId.get(x)])) if (!t) monthOf.delete(id);
      await Promise.all(commits);
    },

    async saveSettings(settings) {
      await fb.setDoc(fb.doc(db, 'users', uid(), 'meta', 'settings'), clean(settings));
    },

    async wipe() {
      const u = uid();
      const snap = await fb.getDocs(fb.collection(db, 'users', u, 'months'));
      const batch = fb.writeBatch(db);
      snap.forEach((d) => batch.delete(d.ref));
      batch.delete(fb.doc(db, 'users', u, 'meta', 'settings'));
      monthOf.clear();
      await batch.commit();
    },
  };
  return store;
}

export async function createStore(config) {
  if (config && config.apiKey && config.projectId) {
    try {
      return await cloudStore(config);
    } catch (e) {
      console.error('Firebase kon niet starten, lokale opslag wordt gebruikt', e);
      const s = localStore();
      s.error = e.message;
      return s;
    }
  }
  return localStore();
}
