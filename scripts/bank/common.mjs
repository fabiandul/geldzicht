import { initializeApp, cert } from 'firebase-admin/app';
import { getFirestore } from 'firebase-admin/firestore';
import { getAuth } from 'firebase-admin/auth';

export async function init() {
  const sa = JSON.parse(process.env.FIREBASE_SERVICE_ACCOUNT);
  initializeApp({ credential: cert(sa) });
  const db = getFirestore();
  const uid = (await getAuth().getUserByEmail(process.env.LOGIN_EMAIL)).uid;
  return { db, uid, meta: (name) => db.doc(`users/${uid}/meta/${name}`) };
}

// Pushmeldingen. De sleutels worden eenmalig gemaakt en in je eigen database bewaard.
export async function pusher(meta) {
  const webpush = (await import('web-push')).default;
  const keyRef = meta('pushkeys');
  let keys = (await keyRef.get()).data();
  if (!keys || !keys.publicKey) {
    keys = webpush.generateVAPIDKeys();
    await keyRef.set(keys);
  }
  await meta('push').set({ publicKey: keys.publicKey }, { merge: true });
  webpush.setVapidDetails('https://fabiandul.github.io/geldzicht/', keys.publicKey, keys.privateKey);
  return async (payload) => {
    const doc = (await meta('push').get()).data() || {};
    const subs = doc.subs || {};
    let sent = 0;
    for (const [id, sub] of Object.entries(subs)) {
      try { await webpush.sendNotification(sub, JSON.stringify(payload)); sent++; } catch (e) {
        if (e.statusCode === 404 || e.statusCode === 410) { delete subs[id]; await meta('push').update({ [`subs.${id}`]: (await import('firebase-admin/firestore')).FieldValue.delete() }); }
        else console.log('[push] versturen mislukt', e.statusCode || e.message);
      }
    }
    return sent;
  };
}
