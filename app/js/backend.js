// Chooses the live Firebase backend or Demo mode and exposes one SDK-shaped object.
import { firebaseConfig } from './firebase-config.js';

export const configured = !!firebaseConfig.apiKey && !firebaseConfig.apiKey.startsWith('REPLACE');

function wantDemo() {
  const p = new URLSearchParams(location.search).get('mode');
  try {
    if (p === 'demo') localStorage.setItem('umc-mode', 'demo');
    if (p === 'live') localStorage.removeItem('umc-mode');
    return !configured || localStorage.getItem('umc-mode') === 'demo';
  } catch { return !configured; }
}

export async function initBackend() {
  if (wantDemo()) {
    const sdk = await import('./fake/fakefb.js');
    await sdk.loadRules('firestore.rules');
    const app = sdk.initializeApp({});
    return { sdk, mode: 'demo', auth: sdk.getAuth(app), db: sdk.getFirestore(app) };
  }
  const sdk = await import('../vendor/firebase.js');
  // Run Google sign-in on the same domain as the app. Chrome blocks the popup handshake when the
  // auth domain (firebaseapp.com) differs from the site (web.app). Firebase Hosting serves
  // /__/auth/handler on both domains, so this works without extra hosting setup.
  const cfg = { ...firebaseConfig };
  const host = location.hostname;
  if (cfg.projectId && (host === `${cfg.projectId}.web.app` || host === `${cfg.projectId}.firebaseapp.com`)) cfg.authDomain = host;
  const app = sdk.initializeApp(cfg);
  let db;
  try {
    db = sdk.initializeFirestore(app, { localCache: sdk.persistentLocalCache({ tabManager: sdk.persistentMultipleTabManager() }) });
  } catch { db = sdk.getFirestore(app); }
  return { sdk, mode: 'live', auth: sdk.getAuth(app), db };
}
