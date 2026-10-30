// Demo-mode stand-in for the Firebase Auth + Firestore modular SDK.
// It keeps data in this browser (localStorage) and enforces firestore.rules on every
// read and write through rules-engine.js, so Demo mode behaves like the live backend.

import { RulesEngine, Ts, RulesError } from './rules-engine.js';

export class Timestamp extends Ts {
  get seconds() { return Math.floor(this.ms / 1000); }
  get nanoseconds() { return (this.ms % 1000) * 1e6; }
  toDate() { return new Date(this.ms); }
  static now() { return new Timestamp(Date.now()); }
  static fromMillis(ms) { return new Timestamp(ms); }
  static fromDate(d) { return new Timestamp(d.getTime()); }
}

// ---------------------------------------------------------------- environment
const env = {
  rules: null,
  storage: typeof localStorage !== 'undefined' ? localStorage : null,
  session: typeof sessionStorage !== 'undefined' ? sessionStorage : null,
  dbKey: 'umc-demo-db-v1',
  authKey: 'umc-demo-auth-v1',
  now: () => Date.now(),
  limits: true,
  log: null,
};
export function configureFake(opts) {
  Object.assign(env, opts);
  if (opts.rulesSource) env.rules = new RulesEngine(opts.rulesSource);
}
export async function loadRules(url) {
  const src = await (await fetch(url, { cache: 'no-store' })).text();
  env.rules = new RulesEngine(src);
}

const clone = (v) => {
  if (v instanceof Ts) return new Timestamp(v.ms);
  if (Array.isArray(v)) return v.map(clone);
  if (v && typeof v === 'object') { const o = {}; for (const k of Object.keys(v)) o[k] = clone(v[k]); return o; }
  return v;
};
const enc = (v) => JSON.stringify(v, function (k, x) {
  const raw = this[k];
  return raw instanceof Ts ? { __ts: raw.ms } : x;
});
const dec = (s) => JSON.parse(s, (k, v) => (v && typeof v === 'object' && '__ts' in v ? new Timestamp(v.__ts) : v));

export class FirestoreError extends Error {
  constructor(code, message) { super(message); this.code = code; this.name = 'FirebaseError'; }
}

// ---------------------------------------------------------------- store
class Store {
  constructor() { this.docs = new Map(); this.subs = new Set(); this.load(); }
  load() {
    this.docs = new Map();
    if (!env.storage) return;
    try {
      const raw = env.storage.getItem(env.dbKey);
      if (raw) for (const [k, v] of Object.entries(dec(raw))) this.docs.set(k, v);
    } catch { /* ignore corrupt */ }
  }
  save() {
    if (!env.storage) return;
    const o = {}; for (const [k, v] of this.docs) o[k] = v;
    env.storage.setItem(env.dbKey, enc(o));
  }
  get(path) { const d = this.docs.get(path); return d ? clone(d) : null; }
  apply(writes) {
    for (const [p, d] of writes) { if (d === null) this.docs.delete(p); else this.docs.set(p, clone(d)); }
    this.save(); this.notify();
  }
  notify() { for (const f of [...this.subs]) { try { f(); } catch (e) { console.error(e); } } }
  reset() { this.docs.clear(); this.save(); this.notify(); }
}
let store = null;
function getStore() {
  if (!store) {
    store = new Store();
    if (typeof window !== 'undefined') {
      window.addEventListener('storage', (e) => { if (e.key === env.dbKey) { store.load(); store.notify(); } });
    }
  }
  return store;
}
export function resetDemoData() { getStore().reset(); if (env.storage) env.storage.removeItem(env.authKey); }
export function _rawDocs() { return getStore().docs; }

// ---------------------------------------------------------------- app + auth
export function initializeApp(options) { return { name: '[DEFAULT]', options }; }

class FakeAuth {
  constructor() { this.currentUser = null; this.listeners = new Set(); this._restore(); }
  _users() { try { return JSON.parse(env.storage?.getItem(env.authKey) || '{}'); } catch { return {}; } }
  _saveUsers(u) { env.storage?.setItem(env.authKey, JSON.stringify(u)); }
  _restore() {
    const uid = env.session?.getItem('umc-demo-session') ?? env.storage?.getItem('umc-demo-last-session');
    if (!uid) return;
    const rec = Object.values(this._users()).find((x) => x.uid === uid);
    if (rec) this.currentUser = makeUser(rec);
  }
  _set(rec) {
    this.currentUser = rec ? makeUser(rec) : null;
    if (rec) { env.session?.setItem('umc-demo-session', rec.uid); env.storage?.setItem('umc-demo-last-session', rec.uid); }
    else { env.session?.removeItem('umc-demo-session'); env.storage?.removeItem('umc-demo-last-session'); }
    for (const f of [...this.listeners]) f(this.currentUser);
  }
}
function makeUser(rec) {
  return { uid: rec.uid, email: rec.email, emailVerified: rec.emailVerified !== false, displayName: rec.displayName || null,
    isAnonymous: false, async getIdToken() { return 'demo-token'; } };
}
let authSingleton = null;
export function getAuth() { if (!authSingleton) authSingleton = new FakeAuth(); return authSingleton; }
export function _testAuth(user) { const a = new FakeAuth(); a.currentUser = user; return a; }

export function onAuthStateChanged(auth, cb) {
  auth.listeners.add(cb); setTimeout(() => cb(auth.currentUser), 0);
  return () => auth.listeners.delete(cb);
}
const authErr = (code) => { const e = new Error(code); e.code = code; return e; };
export async function createUserWithEmailAndPassword(auth, email, password) {
  email = String(email).trim().toLowerCase();
  if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)) throw authErr('auth/invalid-email');
  if (String(password).length < 6) throw authErr('auth/weak-password');
  const users = auth._users();
  if (users[email]) throw authErr('auth/email-already-in-use');
  const rec = { uid: randomId(28), email, password, emailVerified: true };
  users[email] = rec; auth._saveUsers(users); auth._set(rec);
  return { user: auth.currentUser };
}
export async function signInWithEmailAndPassword(auth, email, password) {
  email = String(email).trim().toLowerCase();
  const rec = auth._users()[email];
  if (!rec || rec.password !== password) throw authErr('auth/invalid-credential');
  auth._set(rec); return { user: auth.currentUser };
}
export async function signOut(auth) { auth._set(null); }
// Demo stand-in for Google sign-in: the app passes the chosen address on the provider.
export class GoogleAuthProvider { setCustomParameters(p) { this.params = p; } }
export async function signInWithPopup(auth, provider) {
  const email = String(provider && provider.demoEmail || '').trim().toLowerCase();
  if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)) throw authErr('auth/popup-closed-by-user');
  const users = auth._users();
  if (!users[email]) {
    const local = email.split('@')[0].replace(/[._-]+/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase());
    users[email] = { uid: randomId(28), email, password: null, emailVerified: true, displayName: local, provider: 'google' };
    auth._saveUsers(users);
  }
  auth._set(users[email]); return { user: auth.currentUser };
}
export const signInWithRedirect = signInWithPopup;
export async function getRedirectResult() { return null; }
export async function sendEmailVerification() { }
export async function sendPasswordResetEmail(auth, email) {
  if (!auth._users()[String(email).trim().toLowerCase()]) throw authErr('auth/user-not-found');
}
export async function reload() { }
export async function updateProfile(user, p) { Object.assign(user, p); }

// ---------------------------------------------------------------- refs
const AUTO = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789';
function randomId(n = 20) {
  let s = ''; const c = globalThis.crypto;
  const b = new Uint8Array(n); c.getRandomValues(b);
  for (let i = 0; i < n; i++) s += AUTO[b[i] % AUTO.length];
  return s;
}
class DocumentReference {
  constructor(db, path) { this.firestore = db; this.path = path; this.id = path.split('/').pop(); this.type = 'document'; }
  get parent() { return new CollectionReference(this.firestore, this.path.split('/').slice(0, -1).join('/')); }
}
class CollectionReference {
  constructor(db, path) { this.firestore = db; this.path = path; this.id = path.split('/').pop(); this.type = 'collection'; }
}
class Query { constructor(coll, cons) { this.firestore = coll.firestore; this.coll = coll; this.cons = cons; this.type = 'query'; } }

class FakeDb { constructor(auth) { this.auth = auth; this.type = 'firestore'; } }
let dbSingleton = null;
export function getFirestore() { if (!dbSingleton) dbSingleton = new FakeDb(getAuth()); return dbSingleton; }
export function initializeFirestore() { return getFirestore(); }
export function _testDb(auth) { getStore(); return new FakeDb(auth); }

const segsOf = (args) => args.flatMap((a) => String(a).split('/')).filter(Boolean);
export function doc(base, ...rest) {
  if (base instanceof FakeDb) return new DocumentReference(base, segsOf(rest).join('/'));
  if (base instanceof CollectionReference) {
    const id = rest.length ? segsOf(rest).join('/') : randomId();
    return new DocumentReference(base.firestore, base.path + '/' + id);
  }
  if (base instanceof DocumentReference) return new DocumentReference(base.firestore, base.path + '/' + segsOf(rest).join('/'));
  throw new Error('doc(): bad base');
}
export function collection(base, ...rest) {
  if (base instanceof FakeDb) return new CollectionReference(base, segsOf(rest).join('/'));
  if (base instanceof DocumentReference) return new CollectionReference(base.firestore, base.path + '/' + segsOf(rest).join('/'));
  throw new Error('collection(): bad base');
}
export function where(field, op, value) { return { kind: 'where', field, op, value }; }
export function orderBy(field, dir = 'asc') { return { kind: 'orderBy', field, dir }; }
export function limit(n) { return { kind: 'limit', n }; }
export function query(coll, ...cons) { return new Query(coll instanceof Query ? coll.coll : coll, [...(coll.cons || []), ...cons]); }

// ---------------------------------------------------------------- sentinels
class Sentinel { constructor(kind, v) { this.kind = kind; this.v = v; } }
export const serverTimestamp = () => new Sentinel('ts');
export const increment = (n) => new Sentinel('inc', n);
export const deleteField = () => new Sentinel('del');
export const arrayUnion = (...v) => new Sentinel('union', v);

function resolveInto(target, key, val, prev, time) {
  if (val instanceof Sentinel) {
    if (val.kind === 'ts') target[key] = new Timestamp(time);
    else if (val.kind === 'inc') target[key] = (typeof prev === 'number' ? prev : 0) + val.v;
    else if (val.kind === 'del') delete target[key];
    else if (val.kind === 'union') { const a = Array.isArray(prev) ? [...prev] : []; for (const x of val.v) if (!a.includes(x)) a.push(x); target[key] = a; }
  } else if (val && typeof val === 'object' && !(val instanceof Ts) && !Array.isArray(val)) {
    const base = prev && typeof prev === 'object' && !(prev instanceof Ts) && !Array.isArray(prev) ? clone(prev) : {};
    for (const k of Object.keys(val)) resolveInto(base, k, val[k], base[k], time);
    target[key] = base;
  } else if (val instanceof Date) target[key] = new Timestamp(val.getTime());
  else if (val === undefined) throw new FirestoreError('invalid-argument', `Unsupported field value: undefined (found in field ${key})`);
  else target[key] = clone(val);
}
function applySet(prev, data, merge, time) {
  const out = merge && prev ? clone(prev) : {};
  for (const k of Object.keys(data)) {
    if (merge) resolveInto(out, k, data[k], out[k], time);
    else { const tmp = {}; resolveInto(tmp, k, data[k], undefined, time); if (k in tmp) out[k] = tmp[k]; }
  }
  return out;
}
function applyUpdate(prev, data, time) {
  const out = clone(prev);
  for (const path of Object.keys(data)) {
    const parts = path.split('.'); let o = out;
    for (let i = 0; i < parts.length - 1; i++) {
      if (!o[parts[i]] || typeof o[parts[i]] !== 'object' || o[parts[i]] instanceof Ts) o[parts[i]] = {};
      o = o[parts[i]];
    }
    const last = parts[parts.length - 1];
    if (data[path] instanceof Sentinel) resolveInto(o, last, data[path], o[last], time);
    else { const tmp = {}; resolveInto(tmp, last, data[path], undefined, time); if (last in tmp) o[last] = tmp[last]; else delete o[last]; }
  }
  return out;
}

// ---------------------------------------------------------------- rules gate
function authOf(db) {
  const u = db.auth.currentUser;
  return u ? { uid: u.uid, email: u.email, emailVerified: u.emailVerified } : null;
}
function denied(method, path, res) {
  const why = res && res.errors && res.errors.length ? ' (' + res.errors.slice(-2).join('; ') + ')' : '';
  if (env.log) env.log(`DENIED ${method} ${path}${why}`);
  return new FirestoreError('permission-denied', `Missing or insufficient permissions: ${method} ${path}${why}`);
}
function checkRead(db, method, path, data) {
  if (!env.rules) throw new Error('Demo rules not loaded');
  const st = getStore();
  const res = env.rules.allowed({ method, path, auth: authOf(db), time: new Timestamp(env.now()), resource: data,
    newData: null, getDoc: (p) => st.get(p) });
  if (!res.ok) throw denied(method, path, res);
  if (env.limits && res.accessCount > 10) throw new FirestoreError('permission-denied', `Rules access limit exceeded (${res.accessCount}) on ${path}`);
}

// ---------------------------------------------------------------- reads
class DocumentSnapshot {
  constructor(ref, data) { this.ref = ref; this.id = ref.id; this._d = data; }
  exists() { return this._d !== null; }
  data() { return this._d ? clone(this._d) : undefined; }
  get(f) { return this._d ? f.split('.').reduce((o, k) => (o == null ? undefined : o[k]), this._d) : undefined; }
}
class QuerySnapshot {
  constructor(docs) { this.docs = docs; this.size = docs.length; this.empty = docs.length === 0; }
  forEach(f) { this.docs.forEach(f); }
}
export async function getDoc(ref) {
  const data = getStore().get(ref.path);
  checkRead(ref.firestore, 'get', ref.path, data);
  return new DocumentSnapshot(ref, data);
}
const fieldVal = (d, f) => f.split('.').reduce((o, k) => (o == null ? undefined : o[k]), d);
const cmpVal = (a, b) => {
  const x = a instanceof Ts ? a.ms : a, y = b instanceof Ts ? b.ms : b;
  if (x === y) return 0; if (x === undefined || x === null) return -1; if (y === undefined || y === null) return 1;
  return x < y ? -1 : 1;
};
function runQuery(q) {
  const coll = q.coll || q; const cons = q.cons || [];
  const prefix = coll.path + '/'; const depth = coll.path.split('/').length + 1;
  let rows = [];
  for (const [p, d] of getStore().docs) {
    if (!p.startsWith(prefix) || p.split('/').length !== depth) continue;
    rows.push([p, clone(d)]);
  }
  for (const c of cons.filter((c) => c.kind === 'where')) {
    rows = rows.filter(([, d]) => {
      const v = fieldVal(d, c.field);
      switch (c.op) {
        case '==': return cmpVal(v, c.value) === 0 && v !== undefined;
        case '!=': return v !== undefined && cmpVal(v, c.value) !== 0;
        case '<': return v !== undefined && cmpVal(v, c.value) < 0;
        case '<=': return v !== undefined && cmpVal(v, c.value) <= 0;
        case '>': return v !== undefined && cmpVal(v, c.value) > 0;
        case '>=': return v !== undefined && cmpVal(v, c.value) >= 0;
        case 'in': return c.value.some((x) => cmpVal(v, x) === 0);
        case 'array-contains': return Array.isArray(v) && v.includes(c.value);
        default: throw new Error('unsupported op ' + c.op);
      }
    });
  }
  const ob = cons.filter((c) => c.kind === 'orderBy');
  if (ob.length) rows.sort((a, b) => { for (const o of ob) { const r = cmpVal(fieldVal(a[1], o.field), fieldVal(b[1], o.field)); if (r) return o.dir === 'desc' ? -r : r; } return 0; });
  const lim = cons.find((c) => c.kind === 'limit'); if (lim) rows = rows.slice(0, lim.n);
  for (const [p, d] of rows) checkRead(coll.firestore, 'list', p, d);
  return new QuerySnapshot(rows.map(([p, d]) => new DocumentSnapshot(new DocumentReference(coll.firestore, p), d)));
}
export async function getDocs(q) { return runQuery(q); }
export async function getCountFromServer(q) { const s = runQuery(q); return { data: () => ({ count: s.size }) }; }

export function onSnapshot(target, onNext, onError) {
  let last = undefined, alive = true;
  const run = () => {
    if (!alive) return;
    try {
      let snap, key;
      if (target instanceof DocumentReference) {
        const data = getStore().get(target.path);
        checkRead(target.firestore, 'get', target.path, data);
        snap = new DocumentSnapshot(target, data); key = enc(data);
      } else { snap = runQuery(target); key = enc(snap.docs.map((d) => [d.id, d._d])); }
      if (key !== last) { last = key; onNext(snap); }
    } catch (e) { if (onError) onError(e); else console.error(e); }
  };
  const st = getStore(); st.subs.add(run); setTimeout(run, 0);
  return () => { alive = false; st.subs.delete(run); };
}

// ---------------------------------------------------------------- writes
class WriteBatch {
  constructor(db) { this.db = db; this.ops = []; }
  set(ref, data, opts) { this.ops.push({ kind: 'set', ref, data, merge: !!(opts && opts.merge) }); return this; }
  update(ref, data) { this.ops.push({ kind: 'update', ref, data }); return this; }
  delete(ref) { this.ops.push({ kind: 'delete', ref }); return this; }
  async commit() { return commitOps(this.db, this.ops); }
}
export function writeBatch(db) { return new WriteBatch(db); }

async function commitOps(db, ops) {
  if (!env.rules) throw new Error('Demo rules not loaded');
  const st = getStore(); const time = env.now();
  const after = new Map();
  const cur = (p) => (after.has(p) ? after.get(p) : st.get(p));
  const plan = [];
  for (const op of ops) {
    const p = op.ref.path; const prev = cur(p);
    let next;
    if (op.kind === 'set') next = applySet(prev, op.data, op.merge, time);
    else if (op.kind === 'update') {
      if (!prev) throw new FirestoreError('not-found', `No document to update: ${p}`);
      next = applyUpdate(prev, op.data, time);
    } else next = null;
    after.set(p, next);
    plan.push({ path: p, method: op.kind === 'delete' ? 'delete' : st.get(p) ? 'update' : 'create' });
  }
  const getDocFn = (p, isAfter) => (isAfter ? (after.has(p) ? after.get(p) : st.get(p)) : st.get(p));
  const totalAccess = new Set();
  for (const step of plan) {
    const res = env.rules.allowed({ method: step.method, path: step.path, auth: authOf(db), time: new Timestamp(time),
      resource: st.get(step.path), newData: after.get(step.path), getDoc: getDocFn });
    if (!res.ok) throw denied(step.method, step.path, res);
    res.accessed.forEach((a) => totalAccess.add(a));
    if (env.limits && res.accessCount > 10) throw new FirestoreError('permission-denied', `Rules access limit exceeded (${res.accessCount}>10) on ${step.path}`);
  }
  if (env.limits && totalAccess.size > 20) throw new FirestoreError('permission-denied', `Rules access limit exceeded for batch (${totalAccess.size}>20)`);
  if (env.onCommit) env.onCommit({ ops: plan, access: totalAccess.size });
  st.apply([...after.entries()]);
}
export async function setDoc(ref, data, opts) { return commitOps(ref.firestore, [{ kind: 'set', ref, data, merge: !!(opts && opts.merge) }]); }
export async function updateDoc(ref, data) { return commitOps(ref.firestore, [{ kind: 'update', ref, data }]); }
export async function deleteDoc(ref) { return commitOps(ref.firestore, [{ kind: 'delete', ref }]); }
export async function addDoc(coll, data) { const ref = doc(coll); await setDoc(ref, data); return ref; }

export const isFake = true;
