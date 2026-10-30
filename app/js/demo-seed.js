// Demo mode only: builds a small, realistic campus (through the same rules as live) on first open.
import * as D from './data.js';
import { sheet, closeSheet, toast, esc, icon, $, $$ } from './ui.js';
import { mppBootstrapEmails } from './firebase-config.js';
const MPP_EMAIL = mppBootstrapEmails[0];

export const DEMO_PASSWORD = 'demo1234';
export const DEMO_ACCOUNTS = [
  ['aina@siswa.um.edu.my', 'Student: Aina (KK3)'], ['badrul@siswa.um.edu.my', 'Student: Badrul (KK5)'],
  ['kopikolej@demo.my', 'Merchant: Kopi Kolej'], ['laundry@demo.my', 'Merchant: Fresh Laundry'], ['hana@demo.my', 'Merchant: Roti by Hana (awaiting MPP)'],
  [MPP_EMAIL, 'MPP admin'],
];
const MERCHANTS = [
  ['kopikolej@demo.my', 'Hafiz Rahman', 'Kopi Kolej', 'Kopi Kolej Enterprise', 'Food & drinks', 'Campus permanent merchant', 'KK3 cafeteria', 'Residential colleges', 40, 12],
  ['dailybowl@demo.my', 'Siti Aminah', 'The Daily Bowl', 'Daily Bowl Trading', 'Food & drinks', 'Campus permanent merchant', 'Kompleks Perdanasiswa', 'Central campus', 60, 41],
  ['print@demo.my', 'Ravi Kumar', 'Campus Print Co.', 'Campus Print Co.', 'Printing', 'Campus permanent merchant', 'Faculty of Science', 'Academic zone', 0, 0],
  ['laundry@demo.my', 'Mei Ling', 'Fresh Laundry', 'Fresh Laundry Sdn Bhd', 'Laundry', 'Within 100 m of UM gate', 'South Gate, 80 m outside', 'Campus edge', 0, 0],
  ['hana@demo.my', 'Hana Yusof', 'Roti by Hana', 'Hana Yusof', 'Student event stall', 'Temporary student entrepreneur', 'Perdanasiswa bazaar', 'Central campus', 0, 0],
];

function fakeQR(name) {
  const c = document.createElement('canvas'); c.width = 360; c.height = 460; const x = c.getContext('2d');
  x.fillStyle = '#fff'; x.fillRect(0, 0, 360, 460); x.fillStyle = '#ED0F7E'; x.fillRect(0, 0, 360, 70);
  x.fillStyle = '#fff'; x.font = 'bold 26px Montserrat, sans-serif'; x.textAlign = 'center'; x.fillText('DuitNow QR (demo)', 180, 46);
  const holder = document.createElement('div');
  // eslint-disable-next-line no-undef
  new QRCode(holder, { text: 'DEMO-DUITNOW-' + name, width: 280, height: 280, correctLevel: QRCode.CorrectLevel.M });
  const qc = holder.querySelector('canvas'); if (qc) x.drawImage(qc, 40, 90);
  x.fillStyle = '#0E1A2B'; x.font = 'bold 22px Montserrat, sans-serif'; x.fillText(name, 180, 420);
  return c.toDataURL('image/jpeg', 0.8);
}

export async function ensureDemoData(backend, progress = () => {}) {
  const { sdk, auth, db } = backend;
  if (sdk._rawDocs().has('stats/campus')) return;
  progress('Setting up the demo campus…');
  const as = async (email) => {
    try { await sdk.signInWithEmailAndPassword(auth, email, DEMO_PASSWORD); }
    catch { await sdk.createUserWithEmailAndPassword(auth, email, DEMO_PASSWORD); }
    const u = auth.currentUser; return { sdk, db, uid: u.uid, email: u.email, profile: await D.getProfile({ sdk, db, uid: u.uid }).catch(() => null) };
  };
  try {
    let mpp = await as(MPP_EMAIL);
    await D.initProgramme(mpp);
    await D.saveCampaign(mpp, null, { name: 'Cashless Campus Week', description: 'Pay cashless at any UM Connect+ merchant. Every purchase counts for your college.', start: D.dayKey(), end: D.dayKey(Date.now() + 6 * 86400000), location: 'All of campus', budgetCents: 150000 });
    await D.saveCampaign(mpp, null, { name: 'Student Makers Bazaar', description: 'Student-run stalls with DuitNow QR. Visit three for the explorer mission.', start: D.dayKey(Date.now() + 9 * 86400000), end: D.dayKey(Date.now() + 11 * 86400000), location: 'Kompleks Perdanasiswa', budgetCents: 80000 });
    const ids = {};
    for (const [email, owner, name, account, type, segment, location, zone, seats] of MERCHANTS) {
      const m = await as(email); ids[email] = m.uid;
      await D.createProfile(m, { role: 'merchant', name: owner });
      await D.submitApplication(m, { name, accountName: account, type, segment, location, zone, phone: '012-345 6789', ambassadorId: 'AMB-003', qrImage: fakeQR(name),
        eventName: segment.startsWith('Temporary') ? 'Student Makers Bazaar' : '', eventEnd: segment.startsWith('Temporary') ? D.dayKey(Date.now() + 11 * 86400000) : '' });
      if (seats) await D.setReadiness(m);
    }
    mpp = await as(MPP_EMAIL);
    for (const [email] of MERCHANTS.slice(0, 4)) await D.reviewMerchant(mpp, ids[email], 'verified', 'QR name matches business');
    for (const [email, , name, , , , , , seats, occupied] of MERCHANTS.slice(0, 2)) {
      const m = await as(email); m.merchantName = name;
      await D.setOccupancy(m, seats, occupied);
      await D.createOffer(m, { title: email.startsWith('kopi') ? 'Double points on your first visit' : 'Free iced tea with any rice bowl', type: 'First-visit bonus', endDate: D.dayKey(Date.now() + 30 * 86400000) });
      await D.createDeal(m, { title: email.startsWith('kopi') ? 'Afternoon study break' : 'Late lunch, extra points', startMin: email.startsWith('kopi') ? 14 * 60 : 14 * 60 + 30, endMin: email.startsWith('kopi') ? 17 * 60 : 16 * 60 + 30, threshold: 60, bonus: email.startsWith('kopi') ? 40 : 30, minSpendCents: 500, limit: 12 });
    }
    mpp = await as(MPP_EMAIL);
    for (const o of await D.pendingOffers(mpp)) await D.reviewOffer(mpp, o, 'approved');
    for (const d of await D.pendingDeals(mpp)) await D.reviewDeal(mpp, d.id, 'approved');
    await D.saveReward(mpp, 'kopi-rm3', { title: 'RM3 off at Kopi Kolej', merchantId: ids['kopikolej@demo.my'], cost: 300, valueCents: 300, stock: 50, issued: 0, lastVoucher: '', validDays: 30, active: true, icon: 'coffee' });

    const aina = await as('aina@siswa.um.edu.my');
    await D.createProfile(aina, { role: 'student', name: 'Aina Nadhirah', matric: '23001234', college: 'KK3', faculty: 'Faculty of Science' });
    aina.profile = await D.getProfile(aina);
    const badrul = await as('badrul@siswa.um.edu.my');
    await D.createProfile(badrul, { role: 'student', name: 'Badrul Hisham', matric: '23004567', college: 'KK5', faculty: 'Faculty of Engineering' });
    badrul.profile = await D.getProfile(badrul);
    await D.applyInviterCode(badrul, aina.profile.referralCode);

    const rules = D.DEFAULT_RULES;
    const buy = async (studentEmail, merchantEmail, merchantName, cents) => {
      const s = await as(studentEmail); s.profile = await D.getProfile(s);
      const id = await D.createTx(s, { merchant: { id: ids[merchantEmail], name: merchantName }, cents });
      const m = await as(merchantEmail);
      await D.confirmTx(m, await D.getTx(m, id), rules);
      const s2 = await as(studentEmail); s2.profile = await D.getProfile(s2);
      if (!s2.profile.firstTx) await D.markFirstTx(s2, id);
    };
    progress('Recording a few purchases…');
    await buy('aina@siswa.um.edu.my', 'kopikolej@demo.my', 'Kopi Kolej', 850);
    await buy('aina@siswa.um.edu.my', 'dailybowl@demo.my', 'The Daily Bowl', 1200);
    await buy('aina@siswa.um.edu.my', 'print@demo.my', 'Campus Print Co.', 600);
    await buy('badrul@siswa.um.edu.my', 'laundry@demo.my', 'Fresh Laundry', 700);
    await buy('badrul@siswa.um.edu.my', 'kopikolej@demo.my', 'Kopi Kolej', 950);
    const b = await as('badrul@siswa.um.edu.my'); b.profile = await D.getProfile(b); await D.claimFriendBonus(b, rules);
    const admin = await as(MPP_EMAIL);
    await D.adjustPoints(admin, aina.uid, 300, 'Pilot tester welcome bonus');
  } catch (e) {
    console.error('Demo setup failed', e);
    toast('Demo setup hit a problem: ' + e.message, true);
  } finally {
    await sdk.signOut(auth);
  }
}

export function demoSheet(app) {
  const { sdk, auth } = app.backend;
  const el = sheet(`<h2>You’re in Demo mode</h2><p class="muted">No Firebase project is connected, so everything is stored in this browser and checked against the same security rules as the live app. Open a second tab to be the merchant while this tab is the student.</p>
    <h3 style="margin-top:18px">Switch account</h3><p class="faint">All demo passwords are ${DEMO_PASSWORD}.</p>
    <div class="stack" style="margin-top:8px">${DEMO_ACCOUNTS.map(([e, l]) => `<button class="btn block" data-as="${esc(e)}" style="justify-content:flex-start">${icon('user')} ${esc(l)}</button>`).join('')}</div>
    <h3 style="margin-top:18px">Start over</h3><p class="faint">Deletes every demo account and record in this browser, then rebuilds the demo campus.</p>
    <button class="btn warn block" id="reset" style="margin-top:8px">${icon('rotate-ccw')} Reset demo data</button>`);
  $$('[data-as]', el).forEach((b) => {
    b.onclick = async () => { closeSheet(); sessionStorage.removeItem('umc-view'); await sdk.signOut(auth); location.hash = ''; await sdk.signInWithEmailAndPassword(auth, b.dataset.as, DEMO_PASSWORD).catch((e) => toast(e.code || e.message, true)); };
  });
  $('#reset', el).onclick = () => { sdk.resetDemoData(); sessionStorage.clear(); location.hash = ''; location.reload(); };
}
