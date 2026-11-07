// Opslag: Firebase (Firestore + inloggen) als er een configuratie is, anders lokaal in de browser.
// Transacties worden per maand opgeslagen: users/{uid}/months/{JJJJ-MM} en instellingen in users/{uid}/meta/settings.

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
    async saveMonths(_keys, allTxs) {
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
  const store = {
    mode: 'cloud',
    get user() { return auth.currentUser; },
    onAuth(cb) { fb.onAuthStateChanged(auth, (u) => cb(u)); },
    async signIn(email, password) { return fb.signInWithEmailAndPassword(auth, email, password); },
    async signOut() { return fb.signOut(auth); },
    async resetPassword(email) { return fb.sendPasswordResetEmail(auth, email); },
    async load() {
      const u = uid();
      const snap = await fb.getDocs(fb.collection(db, 'users', u, 'months'));
      const txs = [];
      snap.forEach((d) => txs.push(...(d.data().tx || [])));
      const s = await fb.getDoc(fb.doc(db, 'users', u, 'meta', 'settings'));
      return { txs, settings: s.exists() ? s.data() : {} };
    },
    async saveMonths(keys, allTxs) {
      const u = uid();
      const byMonth = {};
      for (const k of keys) byMonth[k] = [];
      for (const t of allTxs) {
        const k = t.date.slice(0, 7);
        if (byMonth[k]) byMonth[k].push(t);
      }
      const entries = Object.entries(byMonth);
      for (let i = 0; i < entries.length; i += 400) {
        const batch = fb.writeBatch(db);
        for (const [k, list] of entries.slice(i, i + 400)) {
          const ref = fb.doc(db, 'users', u, 'months', k);
          if (list.length) batch.set(ref, { tx: clean(list), updated: Date.now() });
          else batch.delete(ref);
        }
        await batch.commit();
      }
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
