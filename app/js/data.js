// UM Connect+ data layer. Every write here is shaped to pass firestore.rules,
// and the same functions run in the app and in the test suite.

export const COLLEGES = [
  ['KK1', 'Kolej Kediaman Pertama (KK1)'], ['KK2', 'Kolej Kediaman Kedua (KK2)'], ['KK3', 'Kolej Kediaman Ketiga (KK3)'],
  ['KK4', 'Kolej Kediaman Keempat (KK4)'], ['KK5', 'Kolej Kediaman Kelima (KK5)'], ['KK6', 'Kolej Kediaman Keenam (KK6)'],
  ['KK7', 'Kolej Kediaman Ketujuh (KK7)'], ['KK8', 'Kolej Kediaman Kelapan (KK8)'], ['KK9', 'Kolej Kediaman Kesembilan (KK9)'],
  ['KK10', 'Kolej Kediaman Kesepuluh (KK10)'], ['KK11', 'Kolej Kediaman Kesebelas (KK11)'], ['KK12', 'Kolej Kediaman Kedua Belas (KK12)'],
  ['KK13', 'Kolej Kediaman Ketiga Belas (KK13)'], ['OFF', 'Off campus'],
];
export const FACULTIES = ['Faculty of Science', 'Faculty of Engineering', 'Faculty of Business and Economics',
  'Faculty of Arts and Social Sciences', 'Faculty of Computer Science and Information Technology', 'Faculty of Medicine',
  'Faculty of Dentistry', 'Faculty of Pharmacy', 'Faculty of Law', 'Faculty of Education', 'Faculty of Built Environment',
  'Academy of Malay Studies', 'Academy of Islamic Studies', 'Faculty of Languages and Linguistics',
  'Faculty of Creative Arts', 'Faculty of Sport and Exercise Sciences', 'Other'];
export const MERCHANT_TYPES = ['Food & drinks', 'Laundry', 'Printing', 'Shops', 'Services', 'Student event stall'];
export const SEGMENTS = ['Campus permanent merchant', 'Within 100 m of UM gate', 'Temporary student entrepreneur'];
export const ZONES = ['Residential colleges', 'Central campus', 'Academic zone', 'Campus edge'];

export const DEFAULT_RULES = { baseRate: 2, surveyBonus: 50, lessonBonus: 50, referrerBonus: 100, friendBonus: 100,
  referralCap: 5, txTtlMin: 5, maxTxCents: 50000 };
export const LESSON_KEYS = { lesson0: 1, lesson1: 0, lesson2: 1 };
export const DEFAULT_REWARDS = [
  { id: 'cafe-rm5', title: 'RM5 café voucher', merchantId: '', cost: 500, valueCents: 500, stock: 100, validDays: 30, active: true, icon: 'coffee' },
  { id: 'print-rm2', title: 'RM2 printing credit', merchantId: '', cost: 200, valueCents: 200, stock: 100, validDays: 30, active: true, icon: 'printer' },
  { id: 'cashback-rm3', title: 'RM3 cashback', merchantId: '', cost: 300, valueCents: 300, stock: 50, validDays: 14, active: true, icon: 'wallet' },
];

// ------------------------------------------------------------- time helpers (Malaysia time)
const MYT = 8 * 3600 * 1000;
export const clock = (ctx) => (ctx && ctx.now ? ctx.now() : Date.now());
export const toMs = (t) => (t == null ? null : typeof t === 'number' ? t : t.toMillis ? t.toMillis() : t instanceof Date ? t.getTime() : null);
const mytDate = (ms) => new Date(ms + MYT);
const pad = (n) => String(n).padStart(2, '0');
export const dayKey = (ms = Date.now()) => { const d = mytDate(ms); return `${d.getUTCFullYear()}-${pad(d.getUTCMonth() + 1)}-${pad(d.getUTCDate())}`; };
export const monthKey = (ms = Date.now()) => dayKey(ms).slice(0, 7);
export const minuteOfDay = (ms = Date.now()) => { const d = mytDate(ms); return d.getUTCHours() * 60 + d.getUTCMinutes(); };
export const weekKey = (ms = Date.now()) => {
  const d = mytDate(ms); const dow = (d.getUTCDay() + 6) % 7; // Monday = 0
  const monday = new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate() - dow));
  return `${monday.getUTCFullYear()}-${pad(monday.getUTCMonth() + 1)}-${pad(monday.getUTCDate())}`;
};
export const hhmm = (min) => `${pad(Math.floor(min / 60))}:${pad(min % 60)}`;
export const parseHHMM = (s) => { const [h, m] = String(s).split(':').map(Number); return h * 60 + m; };

export const purchasePoints = (cents, rules) => Math.floor((cents * rules.baseRate) / 100);

// ------------------------------------------------------------- refs
const R = (ctx) => {
  const { sdk, db } = ctx;
  return {
    user: (u) => sdk.doc(db, 'users', u),
    ledger: (u, id) => sdk.doc(db, 'users', u, 'ledger', id),
    ledgerCol: (u) => sdk.collection(db, 'users', u, 'ledger'),
    config: (n) => sdk.doc(db, 'config', n),
    merchant: (m) => sdk.doc(db, 'merchants', m),
    merchantPrivate: (m) => sdk.doc(db, 'merchantPrivate', m),
    tx: (id) => sdk.doc(db, 'txRequests', id),
    txCol: () => sdk.collection(db, 'txRequests'),
    stats: (n) => sdk.doc(db, 'stats', n),
    reward: (id) => sdk.doc(db, 'rewards', id),
    voucher: (id) => sdk.doc(db, 'vouchers', id),
    newId: (c) => sdk.doc(sdk.collection(db, c)).id,
  };
};
const snapList = (s) => s.docs.map((d) => ({ id: d.id, ...d.data() }));
const one = async (ctx, ref) => { const s = await ctx.sdk.getDoc(ref); return s.exists() ? { id: s.id, ...s.data() } : null; };
const list = async (ctx, coll, ...cons) => snapList(await ctx.sdk.getDocs(cons.length ? ctx.sdk.query(ctx.sdk.collection(ctx.db, coll), ...cons) : ctx.sdk.collection(ctx.db, coll)));
const eq = (ctx, f, v) => ctx.sdk.where(f, '==', v);

// Paired points movement: ledger entry + balance change in one batch.
function addPoints(ctx, batch, targetUid, id, entry) {
  const { sdk } = ctx; const r = R(ctx);
  batch.set(r.ledger(targetUid, id), { ...entry, by: ctx.uid, createdAt: sdk.serverTimestamp() });
  batch.update(r.user(targetUid), { points: sdk.increment(entry.delta), lastTx: id });
}

// ------------------------------------------------------------- config and session
export async function getRules(ctx) {
  const c = await one(ctx, R(ctx).config('rules'));
  return { ...DEFAULT_RULES, ...(c || {}) };
}
export async function isMppUser(ctx) {
  try { await ctx.sdk.getDoc(R(ctx).config('access')); return true; } catch { return false; }
}
export async function getProfile(ctx, u = ctx.uid) { return one(ctx, R(ctx).user(u)); }

function makeReferralCode(name) {
  const base = (name || 'UM').normalize('NFKD').replace(/[^A-Za-z]/g, '').toUpperCase().slice(0, 6) || 'UM';
  const rand = Math.random().toString(36).slice(2, 6).toUpperCase().replace(/[^A-Z0-9]/g, 'X');
  return `${base}-${rand}`;
}
export const normMatric = (m) => String(m || '').toUpperCase().replace(/[^A-Z0-9]/g, '');
export async function createProfile(ctx, { role, name, matric = '', college = '', faculty = '' }) {
  const { sdk } = ctx; const r = R(ctx);
  matric = role === 'student' ? normMatric(matric) : '';
  if (role === 'student') {
    // Check the two common reasons a student sign-up is refused, so the message is accurate.
    const ready = await sdk.getDoc(r.stats('campus')).then((x) => x.exists()).catch(() => false);
    if (!ready) { const e = new Error('not-ready'); e.notReady = true; throw e; }
    if (!/^[A-Z0-9]{5,15}$/.test(matric)) { const e = new Error('bad-matric'); e.badMatric = true; throw e; }
    const taken = await sdk.getDoc(sdk.doc(ctx.db, 'matrics', matric)).then((x) => x.exists() && x.data().uid !== ctx.uid).catch(() => false);
    if (taken) { const e = new Error('matric-taken'); e.matricTaken = true; throw e; }
  }
  for (let attempt = 0; attempt < 4; attempt++) {
    const code = role === 'student' ? makeReferralCode(name) : '';
    const b = sdk.writeBatch(ctx.db);
    b.set(r.user(ctx.uid), { role, name: name.trim(), email: ctx.email, matric, college, faculty, points: 0, lastTx: '',
      referralCode: code, goalCents: 15000, createdAt: sdk.serverTimestamp() });
    if (code) b.set(sdk.doc(ctx.db, 'referralCodes', code), { uid: ctx.uid });
    if (matric) b.set(sdk.doc(ctx.db, 'matrics', matric), { uid: ctx.uid });
    try { await b.commit(); return; } catch (e) {
      if (role !== 'student' || attempt === 3) throw e; // students retry in case the random referral code clashed
    }
  }
}
export async function updateProfile(ctx, fields) { await ctx.sdk.updateDoc(R(ctx).user(ctx.uid), fields); }

// ------------------------------------------------------------- MPP: programme setup
export async function initProgramme(ctx, { studentDomains = ['siswa.um.edu.my', 'um.edu.my', 'gmail.com'] } = {}) {
  const { sdk } = ctx; const r = R(ctx);
  const b = sdk.writeBatch(ctx.db);
  const existing = async (ref) => (await sdk.getDoc(ref)).exists();
  if (!(await existing(r.config('rules')))) b.set(r.config('rules'), DEFAULT_RULES);
  if (!(await existing(r.config('access')))) b.set(r.config('access'), { mppEmails: [], studentDomains, testerEmails: [] });
  b.set(r.config('lessonKeys'), LESSON_KEYS);
  if (!(await existing(r.config('budget')))) b.set(r.config('budget'), { allocationCents: 2000000 });
  if (!(await existing(r.stats('campus')))) b.set(r.stats('campus'), { checkins: 0, cents: 0, colleges: {}, lastTx: '' });
  if (!(await existing(r.stats('welfare')))) b.set(r.stats('welfare'), { points: 0, lastUid: '', lastId: '' });
  for (const rw of DEFAULT_REWARDS) {
    if (!(await existing(r.reward(rw.id)))) { const { id, ...rest } = rw; b.set(r.reward(id), { ...rest, issued: 0, lastVoucher: '' }); }
  }
  await b.commit();
}
export async function programmeReady(ctx) {
  try { return !!(await one(ctx, R(ctx).stats('campus'))); } catch { return false; }
}

// ------------------------------------------------------------- merchants
export async function listVerifiedMerchants(ctx) {
  return (await list(ctx, 'merchants', eq(ctx, 'status', 'verified'))).sort((a, b) => a.name.localeCompare(b.name));
}
export async function getMerchant(ctx, id) { return one(ctx, R(ctx).merchant(id)); }
export async function getMerchantPrivate(ctx, id) { return one(ctx, R(ctx).merchantPrivate(id)); }
export async function submitApplication(ctx, form) {
  const { sdk } = ctx; const r = R(ctx);
  const existing = await one(ctx, r.merchant(ctx.uid));
  const pub = { name: form.name.trim(), type: form.type, segment: form.segment, location: form.location.trim(), zone: form.zone,
    eventName: form.eventName || '', eventEnd: form.eventEnd || '' };
  const priv = { accountName: form.accountName.trim(), phone: form.phone || '', ambassadorId: (form.ambassadorId || '').trim().toUpperCase() };
  if (form.qrImage) { priv.qrImage = form.qrImage; priv.qrUpdatedAt = clock(ctx); }
  const b = sdk.writeBatch(ctx.db);
  if (!existing) b.set(r.merchant(ctx.uid), { ...pub, ownerUid: ctx.uid, status: 'pending', submittedAt: sdk.serverTimestamp(), ready: false });
  else b.update(r.merchant(ctx.uid), { ...pub, status: 'pending', submittedAt: sdk.serverTimestamp() });
  b.set(r.merchantPrivate(ctx.uid), priv, { merge: true });
  await b.commit();
}
export async function setReadiness(ctx) {
  await ctx.sdk.updateDoc(R(ctx).merchant(ctx.uid), { ready: true, readyAt: ctx.sdk.serverTimestamp() });
}
export async function setOccupancy(ctx, seats, occupied) {
  await ctx.sdk.updateDoc(R(ctx).merchant(ctx.uid), { seats, occupied, occupancyAt: ctx.sdk.serverTimestamp() });
}
export async function reviewMerchant(ctx, id, status, note = '') {
  await ctx.sdk.updateDoc(R(ctx).merchant(id), { status, reviewNote: note, reviewedBy: ctx.email, reviewedAt: ctx.sdk.serverTimestamp() });
}
export async function listMerchantsAll(ctx) { return list(ctx, 'merchants'); }

// ------------------------------------------------------------- transactions
export async function createTx(ctx, { merchant, cents, dealId }) {
  const { sdk } = ctx; const ref = sdk.doc(R(ctx).txCol());
  const data = { studentUid: ctx.uid, studentName: ctx.profile.name, studentCollege: ctx.profile.college,
    merchantId: merchant.id, merchantName: merchant.name, cents, status: 'pending', createdAt: sdk.serverTimestamp() };
  if (dealId) data.dealId = dealId;
  await sdk.setDoc(ref, data);
  return ref.id;
}
export async function cancelTx(ctx, id) { await ctx.sdk.updateDoc(R(ctx).tx(id), { status: 'cancelled' }); }
export function watchTx(ctx, id, cb, err) { return ctx.sdk.onSnapshot(R(ctx).tx(id), (s) => cb(s.exists() ? { id: s.id, ...s.data() } : null), err); }
export async function getTx(ctx, id) { return one(ctx, R(ctx).tx(id)); }
export async function confirmTx(ctx, tx, rules) {
  const { sdk } = ctx; const r = R(ctx);
  const points = purchasePoints(tx.cents, rules);
  const now = clock(ctx);
  const b = sdk.writeBatch(ctx.db);
  b.update(r.tx(tx.id), { status: 'confirmed', confirmedAt: sdk.serverTimestamp(), confirmedBy: ctx.uid, points,
    confirmDay: dayKey(now), confirmMonth: monthKey(now) });
  addPoints(ctx, b, tx.studentUid, tx.id, { type: 'purchase', delta: points, tx: tx.id, merchantId: ctx.uid });
  b.update(r.stats('campus'), { checkins: sdk.increment(1), cents: sdk.increment(tx.cents),
    ['colleges.' + tx.studentCollege]: sdk.increment(1), lastTx: tx.id });
  await b.commit();
  return points;
}
export async function myTransactions(ctx) {
  const rows = await list(ctx, 'txRequests', eq(ctx, 'studentUid', ctx.uid));
  return rows.sort((a, b) => (toMs(b.createdAt) || 0) - (toMs(a.createdAt) || 0));
}
export function watchMyTransactions(ctx, cb, err) {
  const q = ctx.sdk.query(R(ctx).txCol(), eq(ctx, 'studentUid', ctx.uid));
  return ctx.sdk.onSnapshot(q, (s) => cb(snapList(s).sort((a, b) => (toMs(b.createdAt) || 0) - (toMs(a.createdAt) || 0))), err);
}
export function watchMerchantTransactions(ctx, cb, err) {
  const q = ctx.sdk.query(R(ctx).txCol(), eq(ctx, 'merchantId', ctx.uid));
  return ctx.sdk.onSnapshot(q, (s) => cb(snapList(s).sort((a, b) => (toMs(b.createdAt) || 0) - (toMs(a.createdAt) || 0))), err);
}
export async function monthTransactions(ctx, month) {
  return list(ctx, 'txRequests', eq(ctx, 'confirmMonth', month));
}
export async function flagTx(ctx, id, flag, note) {
  await ctx.sdk.updateDoc(R(ctx).tx(id), { flag, flagNote: note || '', flaggedBy: ctx.email });
}
export async function markFirstTx(ctx, txId) {
  await ctx.sdk.updateDoc(R(ctx).user(ctx.uid), { firstTx: txId });
  try { await ctx.sdk.updateDoc(ctx.sdk.doc(ctx.db, 'referrals', ctx.uid), { qualified: true }); } catch { /* no referral */ }
}

// ------------------------------------------------------------- ledger
export function watchLedger(ctx, cb, err) {
  return ctx.sdk.onSnapshot(R(ctx).ledgerCol(ctx.uid), (s) => cb(snapList(s).sort((a, b) => (toMs(b.createdAt) || 0) - (toMs(a.createdAt) || 0))), err);
}
export async function hasLedger(ctx, id) { return !!(await one(ctx, R(ctx).ledger(ctx.uid, id))); }
export async function adjustPoints(ctx, studentUid, delta, note) {
  const b = ctx.sdk.writeBatch(ctx.db); const id = R(ctx).newId('adjustments');
  addPoints(ctx, b, studentUid, 'adj_' + id, { type: 'adjust', delta, note });
  await b.commit();
}

// ------------------------------------------------------------- earning
export async function submitSurvey(ctx, result, rules) {
  const { sdk } = ctx;
  await sdk.setDoc(sdk.doc(ctx.db, 'surveys', ctx.uid), { ...result, at: sdk.serverTimestamp() });
  if (ctx.profile.role !== 'student' || (await hasLedger(ctx, 'survey'))) return 0;
  const b = sdk.writeBatch(ctx.db);
  addPoints(ctx, b, ctx.uid, 'survey', { type: 'survey', delta: rules.surveyBonus });
  await b.commit();
  return rules.surveyBonus;
}
export async function getSurvey(ctx, u = ctx.uid) { return one(ctx, ctx.sdk.doc(ctx.db, 'surveys', u)); }
export async function answerLesson(ctx, i, choice, rules) {
  const id = 'lesson' + i;
  if (await hasLedger(ctx, id)) return 'done';
  const b = ctx.sdk.writeBatch(ctx.db);
  addPoints(ctx, b, ctx.uid, id, { type: 'lesson', delta: rules.lessonBonus, answer: choice });
  try { await b.commit(); return 'correct'; } catch (e) { if (e.code === 'permission-denied') return 'wrong'; throw e; }
}
export async function claimOffpeak(ctx, tx, deal) {
  const { sdk } = ctx; const day = dayKey(toMs(tx.confirmedAt)); const k = `${deal.id}_${day}`;
  const b = sdk.writeBatch(ctx.db);
  addPoints(ctx, b, ctx.uid, 'offpeak_' + k, { type: 'offpeak', delta: deal.bonus, tx: tx.id, deal: deal.id });
  b.set(sdk.doc(ctx.db, 'dealDays', k), { count: sdk.increment(1) }, { merge: true });
  await b.commit();
  return deal.bonus;
}

// ------------------------------------------------------------- referrals
export async function applyInviterCode(ctx, code) {
  const { sdk } = ctx; code = String(code).trim().toUpperCase();
  const owner = await one(ctx, sdk.doc(ctx.db, 'referralCodes', code));
  if (!owner) throw new Error('That referral code does not exist.');
  if (owner.uid === ctx.uid) throw new Error('You cannot use your own code.');
  const b = sdk.writeBatch(ctx.db);
  b.update(R(ctx).user(ctx.uid), { inviterUid: owner.uid, inviterCode: code });
  b.set(sdk.doc(ctx.db, 'referrals', ctx.uid), { inviterUid: owner.uid, friendName: ctx.profile.name, createdAt: sdk.serverTimestamp(), qualified: false });
  await b.commit();
}
export async function claimFriendBonus(ctx, rules) {
  const b = ctx.sdk.writeBatch(ctx.db);
  addPoints(ctx, b, ctx.uid, 'referral_friend', { type: 'friend', delta: rules.friendBonus });
  await b.commit();
}
export async function myReferrals(ctx) { return list(ctx, 'referrals', eq(ctx, 'inviterUid', ctx.uid)); }
export async function claimInviterBonus(ctx, friendUid, rules) {
  const { sdk } = ctx; const m = monthKey(clock(ctx));
  const p = ctx.profile; const count = p.refMonth === m ? (p.refCount || 0) + 1 : 1;
  const b = sdk.writeBatch(ctx.db);
  b.set(R(ctx).ledger(ctx.uid, 'ref_' + friendUid), { type: 'inviter', delta: rules.referrerBonus, friend: friendUid, by: ctx.uid, createdAt: sdk.serverTimestamp() });
  b.update(R(ctx).user(ctx.uid), { points: sdk.increment(rules.referrerBonus), lastTx: 'ref_' + friendUid, refMonth: m, refCount: count });
  await b.commit();
}

// ------------------------------------------------------------- rewards, vouchers, welfare
export async function listRewards(ctx) { return list(ctx, 'rewards'); }
export async function saveReward(ctx, id, data) { await ctx.sdk.setDoc(R(ctx).reward(id), data, { merge: true }); }
export async function redeemReward(ctx, reward) {
  const { sdk } = ctx; const r = R(ctx); const vid = r.newId('vouchers');
  const b = sdk.writeBatch(ctx.db);
  b.set(r.voucher(vid), { studentUid: ctx.uid, studentName: ctx.profile.name, rewardId: reward.id, title: reward.title,
    merchantId: reward.merchantId, cost: reward.cost, valueCents: reward.valueCents, status: 'issued',
    code: vid.slice(0, 8).toUpperCase(), validDays: reward.validDays || 30, createdAt: sdk.serverTimestamp() });
  b.update(r.reward(reward.id), { issued: sdk.increment(1), lastVoucher: vid });
  addPoints(ctx, b, ctx.uid, vid, { type: 'redeem', delta: -reward.cost, reward: reward.id });
  await b.commit();
  return vid;
}
export function watchMyVouchers(ctx, cb, err) {
  return ctx.sdk.onSnapshot(ctx.sdk.query(ctx.sdk.collection(ctx.db, 'vouchers'), eq(ctx, 'studentUid', ctx.uid)), (s) => cb(snapList(s)), err);
}
export async function findVoucher(ctx, raw, asMpp = false) {
  const s = String(raw).trim();
  const id = s.startsWith('UMV1:') ? s.slice(5) : null;
  if (id) return one(ctx, R(ctx).voucher(id));
  const cons = [eq(ctx, 'code', s.toUpperCase())];
  if (!asMpp) cons.unshift(eq(ctx, 'merchantId', ctx.uid));
  const rows = await list(ctx, 'vouchers', ...cons);
  return rows[0] || null;
}
export async function useVoucher(ctx, id) {
  await ctx.sdk.updateDoc(R(ctx).voucher(id), { status: 'used', usedAt: ctx.sdk.serverTimestamp(), usedBy: ctx.uid });
}
export async function listVouchers(ctx) { return list(ctx, 'vouchers'); }
export async function donatePoints(ctx, n) {
  const { sdk } = ctx; const r = R(ctx); const id = 'don_' + r.newId('donations');
  const b = sdk.writeBatch(ctx.db);
  addPoints(ctx, b, ctx.uid, id, { type: 'donate', delta: -n });
  b.update(r.stats('welfare'), { points: sdk.increment(n), lastUid: ctx.uid, lastId: id });
  await b.commit();
}

// ------------------------------------------------------------- offers and deals
export async function createOffer(ctx, { title, type, endDate }) {
  await ctx.sdk.setDoc(ctx.sdk.doc(ctx.sdk.collection(ctx.db, 'offers')), { merchantId: ctx.uid, merchantName: ctx.merchantName || '',
    title: title.trim(), type, endDate, status: 'pending', createdAt: ctx.sdk.serverTimestamp() });
}
export async function myOffers(ctx) { return list(ctx, 'offers', eq(ctx, 'merchantId', ctx.uid)); }
export async function approvedOffers(ctx) { return list(ctx, 'offers', eq(ctx, 'status', 'approved')); }
export async function pendingOffers(ctx) { return list(ctx, 'offers', eq(ctx, 'status', 'pending')); }
export async function reviewOffer(ctx, offer, status) {
  const b = ctx.sdk.writeBatch(ctx.db);
  b.update(ctx.sdk.doc(ctx.db, 'offers', offer.id), { status, reviewedBy: ctx.email, reviewedAt: ctx.sdk.serverTimestamp() });
  if (status === 'approved') b.update(R(ctx).merchant(offer.merchantId), { offer: offer.title });
  await b.commit();
}
export async function createDeal(ctx, d) {
  await ctx.sdk.setDoc(ctx.sdk.doc(ctx.sdk.collection(ctx.db, 'deals')), { merchantId: ctx.uid, merchantName: ctx.merchantName || '',
    title: d.title.trim(), startMin: d.startMin, endMin: d.endMin, threshold: d.threshold, bonus: d.bonus,
    minSpendCents: d.minSpendCents, limit: d.limit, status: 'pending', enabled: true, createdAt: ctx.sdk.serverTimestamp() });
}
export async function myDeals(ctx) { return list(ctx, 'deals', eq(ctx, 'merchantId', ctx.uid)); }
export async function approvedDeals(ctx) { return list(ctx, 'deals', eq(ctx, 'status', 'approved')); }
export async function pendingDeals(ctx) { return list(ctx, 'deals', eq(ctx, 'status', 'pending')); }
export async function toggleDeal(ctx, id, enabled) { await ctx.sdk.updateDoc(ctx.sdk.doc(ctx.db, 'deals', id), { enabled }); }
export async function reviewDeal(ctx, id, status) {
  await ctx.sdk.updateDoc(ctx.sdk.doc(ctx.db, 'deals', id), { status, reviewedBy: ctx.email, reviewedAt: ctx.sdk.serverTimestamp() });
}
export async function dealUsesToday(ctx, dealId) {
  const d = await one(ctx, ctx.sdk.doc(ctx.db, 'dealDays', `${dealId}_${dayKey(clock(ctx))}`));
  return d ? d.count : 0;
}
// Mirrors the rules' availability checks so students only see claimable deals.
export function dealStatus(deal, merchant, usesToday, nowMs = Date.now()) {
  if (!deal.enabled) return 'Paused';
  if (deal.status !== 'approved') return 'Awaiting MPP';
  if (usesToday >= deal.limit) return 'All claimed today';
  const m = minuteOfDay(nowMs);
  if (m < deal.startMin || m >= deal.endMin) return `Opens ${hhmm(deal.startMin)}`;
  if (!merchant || !merchant.seats) return 'Seat count not set';
  if (merchant.occupied * 100 >= deal.threshold * merchant.seats) return 'Busy right now';
  return 'Available';
}

// ------------------------------------------------------------- missions
export const MISSIONS = [
  { id: 'five-days', title: 'Five days, cashless ways', desc: 'Pay cashless on 5 different days this week', target: 5, bonus: 100, icon: 'flame' },
  { id: 'explorer', title: 'Campus explorer', desc: 'Visit 3 different merchants this week', target: 3, bonus: 150, icon: 'compass' },
];
export function missionProgress(txs, nowMs = Date.now()) {
  const wk = weekKey(nowMs);
  const mine = txs.filter((t) => t.status === 'confirmed' && weekKey(toMs(t.confirmedAt)) === wk);
  return { week: wk, 'five-days': new Set(mine.map((t) => dayKey(toMs(t.confirmedAt)))).size, explorer: new Set(mine.map((t) => t.merchantId)).size };
}
export async function claimMission(ctx, mission, week, progress) {
  const id = `${ctx.uid}_${week}_${mission.id}`;
  await ctx.sdk.setDoc(ctx.sdk.doc(ctx.db, 'missionClaims', id), { uid: ctx.uid, name: ctx.profile.name, week, mission: mission.id,
    title: mission.title, bonus: mission.bonus, progress, status: 'pending', createdAt: ctx.sdk.serverTimestamp() });
}
export async function myMissionClaims(ctx) { return list(ctx, 'missionClaims', eq(ctx, 'uid', ctx.uid)); }
export async function pendingMissionClaims(ctx) { return list(ctx, 'missionClaims', eq(ctx, 'status', 'pending')); }
export async function reviewMissionClaim(ctx, claim, approve) {
  const b = ctx.sdk.writeBatch(ctx.db);
  b.update(ctx.sdk.doc(ctx.db, 'missionClaims', claim.id), { status: approve ? 'approved' : 'rejected', reviewedBy: ctx.email, reviewedAt: ctx.sdk.serverTimestamp() });
  if (approve) addPoints(ctx, b, claim.uid, 'mission_' + claim.id, { type: 'adjust', delta: claim.bonus, note: `Mission: ${claim.title} (${claim.week})` });
  await b.commit();
}

// ------------------------------------------------------------- stats, campaigns, admin
export function watchStats(ctx, name, cb, err) { return ctx.sdk.onSnapshot(R(ctx).stats(name), (s) => cb(s.exists() ? s.data() : null), err); }
export async function listCampaigns(ctx) { return list(ctx, 'campaigns'); }
export async function saveCampaign(ctx, id, data) {
  const ref = id ? ctx.sdk.doc(ctx.db, 'campaigns', id) : ctx.sdk.doc(ctx.sdk.collection(ctx.db, 'campaigns'));
  await ctx.sdk.setDoc(ref, data, { merge: true });
}
export async function deleteCampaign(ctx, id) { await ctx.sdk.deleteDoc(ctx.sdk.doc(ctx.db, 'campaigns', id)); }
export async function getConfig(ctx, name) { return one(ctx, R(ctx).config(name)); }
export async function saveConfig(ctx, name, data) { await ctx.sdk.setDoc(R(ctx).config(name), data, { merge: true }); }
export async function listUsers(ctx) { return list(ctx, 'users'); }
export async function listSurveys(ctx) { return list(ctx, 'surveys'); }
export async function listReferrals(ctx) { return list(ctx, 'referrals'); }
export async function listManualVolumes(ctx) { return list(ctx, 'manualVolumes'); }
export async function saveManualVolume(ctx, id, data) {
  const ref = id ? ctx.sdk.doc(ctx.db, 'manualVolumes', id) : ctx.sdk.doc(ctx.sdk.collection(ctx.db, 'manualVolumes'));
  await ctx.sdk.setDoc(ref, data, { merge: true });
}
export async function deleteManualVolume(ctx, id) { await ctx.sdk.deleteDoc(ctx.sdk.doc(ctx.db, 'manualVolumes', id)); }
export async function savePaynetCounts(ctx, month, rows) {
  const b = ctx.sdk.writeBatch(ctx.db);
  for (const r of rows) b.set(ctx.sdk.doc(ctx.db, 'paynetCounts', `${month}_${r.merchantId}`), { month, merchantId: r.merchantId, merchantName: r.merchantName, count: r.count });
  await b.commit();
}
export async function paynetCounts(ctx, month) { return list(ctx, 'paynetCounts', eq(ctx, 'month', month)); }

// ------------------------------------------------------------- survey scoring (from the original demo)
export const SURVEY_KNOWLEDGE = [
  ['A seller asks for your banking OTP to issue a refund. What do you do?', ['Share it to receive the refund', 'Keep it private and contact the bank through an official channel', 'Not sure'], 1],
  ['Before confirming a QR payment, what should you check?', ['Recipient name and amount', 'Only the sticker colour', 'Not sure'], 0],
  ['What is a useful first step in budgeting?', ['Spend first and review later', 'List essential costs and set a realistic limit', 'Not sure'], 1],
  ['What confirms a payment has reached a merchant?', ['A screenshot shown by the customer', 'The transaction in the merchant’s own banking app', 'Not sure'], 1],
];
export const SURVEY_DIGITAL = {
  student: [
    ['How comfortable are you using banking or e-wallet apps?', ['I need guided help', 'I can complete basic payments', 'I use them confidently']],
    ['How often do you use cashless payments?', ['Rarely or never', 'Sometimes', 'Most days']],
    ['Can you find and review your transaction history?', ['I need help', 'With some effort', 'Independently']],
  ],
  merchant: [
    ['What is your business’s QR readiness?', ['Cash only / no QR', 'Personal QR / setup in progress', 'Business QR ready']],
    ['Can your staff confirm payments independently?', ['Not yet', 'Some staff can', 'All relevant staff can']],
    ['Can you review settlements and transaction records?', ['I need onboarding support', 'With some help', 'Independently']],
  ],
};
export function scoreSurvey(role, answers) {
  const knowledge = SURVEY_KNOWLEDGE.reduce((s, q, i) => s + (answers['k' + i] === q[2] ? 25 : 0), 0);
  const digital = Math.round(([0, 1, 2].reduce((s, i) => s + (answers['d' + i] || 0), 0) / 6) * 100);
  const score = Math.round(knowledge * 0.6 + digital * 0.4);
  const grade = score >= 80 ? 'A' : score >= 60 ? 'B' : score >= 40 ? 'C' : 'D';
  return { role, answers, knowledge, digital, score, grade };
}
export const LESSONS = [
  { title: 'Spot a payment scam', q: 'A seller asks you to share your banking OTP to receive a refund. What should you do?',
    options: ['Share the OTP so the refund goes through', 'Refuse, and contact your bank through its official app or hotline'], icon: 'shield-alert' },
  { title: 'Budget your campus week', q: 'What is the best first step when setting a weekly budget?',
    options: ['List essential costs and set a realistic limit', 'Spend first and check your balance later'], icon: 'piggy-bank' },
  { title: 'Know your DuitNow QR', q: 'Before confirming a DuitNow QR payment, what should you check?',
    options: ['Only the colour of the QR sticker', 'The recipient name and the payment amount'], icon: 'scan-line' },
];
