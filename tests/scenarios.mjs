// End-to-end business scenarios. Each step calls the app's own data layer (app/js/data.js),
// so these tests check that the app's writes satisfy firestore.rules and that abuse is blocked.
// Backends: the local rules evaluator (default) or the official emulator (tests/emulator.mjs).
import * as D from '../app/js/data.js';

export async function runScenarios({ makeCtx, setTime, canSetTime = true, adminEmail = 'mpp@um.edu.my', log = console.log }) {
  let passed = 0, failed = 0;
  const results = [];
  const ok = async (name, fn) => {
    try { await fn(); passed++; results.push(['PASS', name]); log('  ✓ ' + name); }
    catch (e) { failed++; results.push(['FAIL', name, e.message]); log('  ✗ ' + name + '\n      ' + e.message); }
  };
  const denied = async (name, fn) => ok(name, async () => {
    try { await fn(); } catch (e) { if (e.code === 'permission-denied' || /permission/i.test(e.message)) return; throw e; }
    throw new Error('expected permission-denied, but the write succeeded');
  });
  const eq = (a, b, m) => { if (a !== b) throw new Error(`${m || 'value'}: expected ${b}, got ${a}`); };

  let T = canSetTime ? Date.UTC(2026, 10, 10, 2, 0, 0) : Date.now(); // 10 Nov 2026, 10:00 MYT
  setTime(T);
  const tick = (ms) => { T += ms; setTime(T); };

  const mpp = await makeCtx({ uid: 'mpp1', email: adminEmail });
  const stuA = await makeCtx({ uid: 'stuA', email: 'aina@siswa.um.edu.my' });
  const stuB = await makeCtx({ uid: 'stuB', email: 'badrul@siswa.um.edu.my' });
  const outsider = await makeCtx({ uid: 'out1', email: 'someone@yahoo.com' });
  const gmailer = await makeCtx({ uid: 'gm1', email: 'farah.student@gmail.com' });
  const dupe = await makeCtx({ uid: 'gm2', email: 'copycat@gmail.com' });
  const merch = await makeCtx({ uid: 'mer1', email: 'owner@kopikolej.my' });
  const merch2 = await makeCtx({ uid: 'mer2', email: 'owner@laundry.my' });
  const unverified = await makeCtx({ uid: 'stuC', email: 'chong@siswa.um.edu.my', emailVerified: false });
  let rules = D.DEFAULT_RULES;

  log('Programme setup');
  await ok('students get a clear message before MPP has set up the programme', async () => {
    const early = await makeCtx({ uid: 'early1', email: 'early@gmail.com' });
    try { await D.createProfile(early, { role: 'student', name: 'Early Bird', matric: '23000001', college: 'KK1' }); } catch (e) { if (e.notReady) return; throw e; }
    throw new Error('sign-up was accepted before setup');
  });
  await denied('student cannot initialise the programme', () => D.initProgramme(stuA));
  await ok('bootstrap MPP admin initialises config, stats and rewards', () => D.initProgramme(mpp));
  await ok('MPP is recognised as MPP', async () => eq(await D.isMppUser(mpp), true));
  await ok('a student is not MPP', async () => eq(await D.isMppUser(stuA), false));

  await ok('bootstrap admin works without email verification', async () => {
    const raw = await makeCtx({ uid: 'mpp0', email: adminEmail, emailVerified: false }); eq(await D.isMppUser(raw), true);
  });
  log('Sign-up');
  await ok('student with a UM email signs up', async () => {
    await D.createProfile(stuA, { role: 'student', name: 'Aina Nadhirah', matric: 'U2300123', college: 'KK3', faculty: 'Faculty of Science' });
    stuA.profile = await D.getProfile(stuA);
  });
  await ok('second student signs up', async () => {
    await D.createProfile(stuB, { role: 'student', name: 'Badrul Hisham', matric: 'U2300456', college: 'KK5', faculty: 'Faculty of Engineering' });
    stuB.profile = await D.getProfile(stuB);
  });
  await ok('student with a Gmail address signs up (gmail.com is allowed by default)', () => D.createProfile(gmailer, { role: 'student', name: 'Farah Aziz', matric: '23007777', college: 'KK1', faculty: 'Faculty of Law' }));
  await ok('the app warns when a matric number is already registered', async () => {
    try { await D.createProfile(dupe, { role: 'student', name: 'Copy Cat', matric: '23007777', college: 'KK1' }); } catch (e) { if (e.matricTaken) return; throw e; }
    throw new Error('duplicate matric was accepted');
  });
  await denied('the rules also refuse a reused matric number (bypassing the app check)', async () => {
    const { sdk, db } = dupe; const b = sdk.writeBatch(db);
    b.set(sdk.doc(db, 'users', 'gm2'), { role: 'student', name: 'Copy Cat', email: 'copycat@gmail.com', matric: '23007777', college: 'KK1', faculty: '', points: 0, lastTx: '', referralCode: '', goalCents: 15000, createdAt: sdk.serverTimestamp() });
    b.set(sdk.doc(db, 'matrics', '23007777'), { uid: 'gm2' });
    await b.commit();
  });
  await denied('student cannot change matric number later', () => D.updateProfile(gmailer, { matric: '99999999' }));
  await denied('non-allowed email domain cannot sign up as a student', () => D.createProfile(outsider, { role: 'student', name: 'Out Sider', matric: '23008888', college: 'KK1' }));
  await denied('unverified email cannot sign up', () => D.createProfile(unverified, { role: 'student', name: 'Chong', matric: '23008889', college: 'KK1' }));
  await ok('merchants sign up', async () => {
    await D.createProfile(merch, { role: 'merchant', name: 'Hafiz (Kopi Kolej)' }); merch.profile = await D.getProfile(merch);
    await D.createProfile(merch2, { role: 'merchant', name: 'Mei (Fresh Laundry)' }); merch2.profile = await D.getProfile(merch2);
  });
  await denied('student cannot read another student', () => D.getProfile(stuA, 'stuB'));
  await denied('student cannot read lesson answer keys', () => D.getConfig(stuA, 'lessonKeys'));
  await denied('student cannot give themselves points', () => D.updateProfile(stuA, { points: 999 }));

  log('Merchant onboarding');
  const qr = 'data:image/jpeg;base64,' + 'A'.repeat(2000);
  await ok('merchant submits application with DuitNow QR', () => D.submitApplication(merch, { name: 'Kopi Kolej', type: 'Food & drinks',
    segment: 'Campus permanent merchant', location: 'KK3 cafeteria', zone: 'Residential colleges', accountName: 'Kopi Kolej Enterprise',
    phone: '0123456789', ambassadorId: 'amb-003', qrImage: qr }));
  await ok('second merchant submits application', () => D.submitApplication(merch2, { name: 'Fresh Laundry', type: 'Laundry',
    segment: 'Within 100 m of UM gate', location: 'South Gate', zone: 'Campus edge', accountName: 'Fresh Laundry Sdn Bhd', qrImage: qr }));
  await denied('merchant cannot verify itself', () => D.reviewMerchant(merch, 'mer1', 'verified'));
  await denied('students cannot see unverified merchants', () => D.getMerchant(stuA, 'mer1'));
  await denied('student cannot pay an unverified merchant', () => D.createTx(stuA, { merchant: { id: 'mer1', name: 'Kopi Kolej' }, cents: 850 }));
  await ok('MPP reads the private QR and verifies the merchant', async () => {
    const p = await D.getMerchantPrivate(mpp, 'mer1'); eq(p.qrImage.length, qr.length, 'qr length');
    await D.reviewMerchant(mpp, 'mer1', 'verified', 'Names match');
    await D.reviewMerchant(mpp, 'mer2', 'verified', 'Names match');
  });
  await ok('students see verified merchants', async () => eq((await D.listVerifiedMerchants(stuA)).length, 2, 'merchant count'));
  await denied('verified merchant cannot rename itself without review', () => merch.sdk.updateDoc(merch.sdk.doc(merch.db, 'merchants', 'mer1'), { name: 'Other' }));
  await ok('merchant completes staff readiness', () => D.setReadiness(merch));

  log('Pay and confirm');
  const kopi = { id: 'mer1', name: 'Kopi Kolej' };
  let tx1;
  await ok('student creates a transaction QR', async () => { tx1 = await D.createTx(stuA, { merchant: kopi, cents: 1050 }); });
  await denied('student cannot mislabel their name on a QR', () => stuA.sdk.setDoc(stuA.sdk.doc(stuA.db, 'txRequests', 'fake1'), {
    studentUid: 'stuA', studentName: 'Someone Else', studentCollege: 'KK3', merchantId: 'mer1', merchantName: 'Kopi Kolej', cents: 500,
    status: 'pending', createdAt: stuA.sdk.serverTimestamp() }));
  await denied('another merchant cannot read the QR', () => D.getTx(merch2, tx1));
  await denied('student cannot confirm their own purchase', async () => D.confirmTx(stuA, await D.getTx(stuA, tx1), rules));
  await ok('merchant confirms and the student earns 21 points (RM10.50 × 2)', async () => {
    const t = await D.getTx(merch, tx1); const pts = await D.confirmTx(merch, t, rules); eq(pts, 21);
    eq((await D.getProfile(stuA)).points, 21, 'balance');
  });
  await denied('merchant cannot award inflated points', async () => {
    const t = await D.createTx(stuA, { merchant: kopi, cents: 700 });
    await D.confirmTx(merch, await D.getTx(merch, t), { ...rules, baseRate: 50 });
  });
  await denied('the same QR cannot be confirmed twice', async () => D.confirmTx(merch, { ...(await D.getTx(merch, tx1)), status: 'pending' }, rules));
  await ok('campus stats count the check-in for KK3', async () => {
    const s = (await mpp.sdk.getDoc(mpp.sdk.doc(mpp.db, 'stats', 'campus'))).data();
    eq(s.checkins, 1); eq(s.cents, 1050); eq(s.colleges.KK3, 1);
  });
  let txOld;
  await ok('an expired QR cannot be confirmed (after 5 minutes)', async () => {
    txOld = await D.createTx(stuA, { merchant: kopi, cents: 500 });
    if (!canSetTime) { log('      (skipped: the emulator clock cannot be moved)'); return; }
    tick(6 * 60 * 1000);
    try { await D.confirmTx(merch, await D.getTx(merch, txOld), rules); throw new Error('confirmed an expired QR'); }
    catch (e) { if (e.code !== 'permission-denied') throw e; }
  });
  await ok('student can cancel a pending QR', async () => { await D.cancelTx(stuA, txOld); });
  await denied('purchase over the cap is refused', () => D.createTx(stuA, { merchant: kopi, cents: 60000 }));
  await ok('student records first purchase for referrals', () => D.markFirstTx(stuA, tx1));

  log('Earning');
  stuA.profile = await D.getProfile(stuA);
  await ok('baseline survey earns 50 points once', async () => {
    const res = D.scoreSurvey('student', { k0: 1, k1: 0, k2: 1, k3: 1, d0: 2, d1: 2, d2: 2 });
    eq(res.grade, 'A'); eq(await D.submitSurvey(stuA, res, rules), 50);
    eq(await D.submitSurvey(stuA, res, rules), 0, 'second award');
  });
  await denied('survey bonus cannot be claimed twice by force', async () => {
    const b = stuA.sdk.writeBatch(stuA.db);
    b.set(stuA.sdk.doc(stuA.db, 'users', 'stuA', 'ledger', 'survey2'), { type: 'survey', delta: 50, by: 'stuA', createdAt: stuA.sdk.serverTimestamp() });
    b.update(stuA.sdk.doc(stuA.db, 'users', 'stuA'), { points: stuA.sdk.increment(50), lastTx: 'survey2' });
    await b.commit();
  });
  await ok('wrong lesson answer earns nothing', async () => eq(await D.answerLesson(stuA, 0, 0, rules), 'wrong'));
  await ok('right lesson answer earns 50', async () => eq(await D.answerLesson(stuA, 0, 1, rules), 'correct'));
  await ok('lesson cannot be repeated', async () => eq(await D.answerLesson(stuA, 0, 1, rules), 'done'));
  await ok('balance is 121', async () => eq((await D.getProfile(stuA)).points, 121));

  log('Referrals');
  stuB.profile = await D.getProfile(stuB);
  await ok('student B enters A’s referral code', () => D.applyInviterCode(stuB, stuA.profile.referralCode));
  await denied('B cannot change inviter later', () => D.updateProfile(stuB, { inviterUid: 'mpp1', inviterCode: stuA.profile.referralCode }));
  stuA.profile = await D.getProfile(stuA);
  await denied('A cannot claim before B’s first purchase', () => D.claimInviterBonus(stuA, 'stuB', rules));
  await denied('B cannot claim friend bonus before first purchase', () => D.claimFriendBonus(stuB, rules));
  let txB;
  await ok('B buys at Fresh Laundry and it is confirmed', async () => {
    txB = await D.createTx(stuB, { merchant: { id: 'mer2', name: 'Fresh Laundry' }, cents: 600 });
    await D.confirmTx(merch2, await D.getTx(merch2, txB), rules);
    await D.markFirstTx(stuB, txB);
  });
  await ok('B claims the 100-point friend bonus', () => D.claimFriendBonus(stuB, rules));
  await denied('B cannot claim the friend bonus twice', () => D.claimFriendBonus(stuB, rules));
  await ok('A sees B as a qualified referral', async () => { const r = await D.myReferrals(stuA); eq(r.length, 1); eq(r[0].qualified, true); });
  await ok('A claims the 100-point inviter bonus', () => D.claimInviterBonus(stuA, 'stuB', rules));
  stuA.profile = await D.getProfile(stuA);
  await denied('A cannot claim the same friend twice', () => D.claimInviterBonus(stuA, 'stuB', rules));
  await ok('A’s balance is 221 and refCount is 1', async () => { eq(stuA.profile.points, 221); eq(stuA.profile.refCount, 1); });

  log('Rewards, vouchers, welfare');
  await ok('MPP adds a merchant-specific reward', () => D.saveReward(mpp, 'kopi-rm2', { title: 'Kopi Kolej RM2 off', merchantId: 'mer1',
    cost: 200, valueCents: 200, stock: 2, issued: 0, lastVoucher: '', validDays: 30, active: true, icon: 'coffee' }));
  let vid;
  await ok('A redeems the reward for 200 points', async () => {
    const rw = (await D.listRewards(stuA)).find((r) => r.id === 'kopi-rm2');
    vid = await D.redeemReward(stuA, rw); eq((await D.getProfile(stuA)).points, 21);
  });
  await denied('A cannot redeem without enough points', async () => D.redeemReward(stuA, (await D.listRewards(stuA)).find((r) => r.id === 'kopi-rm2')));
  await denied('another merchant cannot see the voucher', () => D.findVoucher(merch2, 'UMV1:' + vid));
  await ok('Kopi Kolej looks up the voucher by short code and marks it used', async () => {
    const v = await D.findVoucher(merch, vid.slice(0, 8).toUpperCase()); eq(v.id, vid);
    await D.useVoucher(merch, vid);
  });
  await denied('a used voucher cannot be used again', () => D.useVoucher(merch, vid));
  await ok('A donates 20 points to the welfare pool', async () => {
    await D.donatePoints(stuA, 20); eq((await D.getProfile(stuA)).points, 1);
    eq((await stuA.sdk.getDoc(stuA.sdk.doc(stuA.db, 'stats', 'welfare'))).data().points, 20);
  });
  await denied('A cannot donate more points than they have', () => D.donatePoints(stuA, 50));

  log('Offers and off-peak deals');
  merch.merchantName = 'Kopi Kolej';
  await ok('merchant proposes an offer; MPP approves it', async () => {
    await D.createOffer(merch, { title: 'Double points Tuesdays', type: 'Extra points', endDate: '2026-12-31' });
    const [o] = await D.pendingOffers(mpp); await D.reviewOffer(mpp, o, 'approved');
    eq((await D.getMerchant(stuA, 'mer1')).offer, 'Double points Tuesdays');
  });
  let deal;
  await ok('merchant creates an off-peak deal and sets seat count; MPP approves', async () => {
    await D.createDeal(merch, { title: 'Quiet afternoon', startMin: canSetTime ? 14 * 60 : 0, endMin: canSetTime ? 17 * 60 : 1440,
      threshold: 60, bonus: 40, minSpendCents: 500, limit: 1 });
    await D.setOccupancy(merch, 40, 10);
    const [d] = await D.pendingDeals(mpp); await D.reviewDeal(mpp, d.id, 'approved'); deal = { ...d, status: 'approved' };
  });
  await ok('deal shows as available at 15:00 when the café is quiet', async () => {
    if (canSetTime) { T = Date.UTC(2026, 10, 10, 7, 0, 0); setTime(T); } else T = Date.now();
    eq(D.dealStatus(deal, await D.getMerchant(stuA, 'mer1'), 0, T), 'Available');
  });
  let txDeal;
  await ok('student pays with the deal attached; merchant confirms; student claims +40', async () => {
    txDeal = await D.createTx(stuA, { merchant: kopi, cents: 800, dealId: deal.id });
    await D.confirmTx(merch, await D.getTx(merch, txDeal), rules);
    stuA.profile = await D.getProfile(stuA);
    eq(await D.claimOffpeak(stuA, await D.getTx(stuA, txDeal), deal), 40);
    eq((await D.getProfile(stuA)).points, 1 + 16 + 40);
  });
  await denied('the deal cannot be claimed twice the same day', async () => D.claimOffpeak(stuA, await D.getTx(stuA, txDeal), deal));
  await denied('B cannot claim after the daily limit (1) is used', async () => {
    const t = await D.createTx(stuB, { merchant: kopi, cents: 900, dealId: deal.id });
    await D.confirmTx(merch, await D.getTx(merch, t), rules);
    await D.claimOffpeak(stuB, await D.getTx(stuB, t), deal);
  });
  await denied('student cannot attach a deal when the café is busy', async () => {
    await D.setOccupancy(merch, 40, 39);
    await D.createTx(stuA, { merchant: kopi, cents: 800, dealId: deal.id });
  });

  log('Missions and MPP tools');
  await ok('student claims a mission; MPP approves; points added', async () => {
    const before = (await D.getProfile(stuA)).points;
    await D.claimMission(stuA, D.MISSIONS[1], D.weekKey(T), 3);
    const [c] = await D.pendingMissionClaims(mpp); await D.reviewMissionClaim(mpp, c, true);
    eq((await D.getProfile(stuA)).points, before + 150);
  });
  await denied('student cannot approve their own mission', async () => {
    await D.claimMission(stuB, D.MISSIONS[0], D.weekKey(T), 5);
    const c = { id: `stuB_${D.weekKey(T)}_five-days`, uid: 'stuB', bonus: 100, title: 'x', week: D.weekKey(T) };
    await D.reviewMissionClaim(stuB, c, true);
  });
  await ok('MPP adjusts points with a note', async () => { await D.adjustPoints(mpp, 'stuB', -5, 'Correction: duplicate'); });
  await denied('MPP adjustment cannot make a balance negative', () => D.adjustPoints(mpp, 'stuB', -100000, 'Too much'));
  await ok('MPP lists users, surveys, month transactions', async () => {
    eq((await D.listUsers(mpp)).length >= 4, true, 'users');
    eq((await D.monthTransactions(mpp, D.monthKey(T))).length >= 3, true, 'transactions');
  });
  await denied('merchant cannot list all transactions', () => D.monthTransactions(merch, D.monthKey(T)));
  await ok('MPP adds another MPP reviewer by email', async () => {
    const a = await D.getConfig(mpp, 'access'); await D.saveConfig(mpp, 'access', { ...a, mppEmails: ['reviewer@um.edu.my'] });
  });
  const reviewer = await makeCtx({ uid: 'mpp2', email: 'reviewer@um.edu.my' });
  await ok('the new reviewer has MPP access', async () => eq(await D.isMppUser(reviewer), true));
  await ok('an added reviewer must verify their email first', async () => {
    const unv = await makeCtx({ uid: 'mpp3', email: 'reviewer@um.edu.my', emailVerified: false }); eq(await D.isMppUser(unv), false);
  });
  await ok('MPP saves Lampiran 2 rows and PayNet counts', async () => {
    await D.saveManualVolume(mpp, null, { name: 'Dobi KK3', location: 'KK3', method: 'Card', provider: 'Kiplepay', month: '2026-11', volume: 120 });
    await D.savePaynetCounts(mpp, '2026-11', [{ merchantId: 'mer1', merchantName: 'Kopi Kolej', count: 40 }]);
  });

  log(`\n${passed} passed, ${failed} failed`);
  return { passed, failed, results };
}
