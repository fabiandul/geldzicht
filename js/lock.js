// App-slot met vingerafdruk of gezichtsherkenning (via de passkey-functie van je telefoon).
// Dit is een slot op dit toestel: het scherm blijft dicht tot je telefoon je herkent.
const KEY = 'geldzicht.lock';
const b64 = (buf) => btoa(String.fromCharCode(...new Uint8Array(buf)));
const unb64 = (s) => Uint8Array.from(atob(s), (c) => c.charCodeAt(0));
const rnd = (n) => crypto.getRandomValues(new Uint8Array(n));

export function lockEnabled() { try { return !!localStorage.getItem(KEY); } catch { return false; } }
export async function lockSupported() {
  try { return !!(window.PublicKeyCredential && await PublicKeyCredential.isUserVerifyingPlatformAuthenticatorAvailable()); } catch { return false; }
}
export async function enableLock() {
  const cred = await navigator.credentials.create({ publicKey: {
    challenge: rnd(32), rp: { name: 'Geldzicht' },
    user: { id: rnd(16), name: 'geldzicht', displayName: 'Geldzicht' },
    pubKeyCredParams: [{ type: 'public-key', alg: -7 }, { type: 'public-key', alg: -257 }],
    authenticatorSelection: { authenticatorAttachment: 'platform', userVerification: 'required', residentKey: 'discouraged' },
    timeout: 60000, attestation: 'none',
  } });
  localStorage.setItem(KEY, b64(cred.rawId));
}
export function disableLock() { try { localStorage.removeItem(KEY); } catch { /* leeg */ } }
export async function unlock() {
  const id = localStorage.getItem(KEY);
  if (!id) return true;
  const res = await navigator.credentials.get({ publicKey: {
    challenge: rnd(32), allowCredentials: [{ type: 'public-key', id: unb64(id), transports: ['internal'] }], userVerification: 'required', timeout: 60000,
  } });
  return !!res;
}
