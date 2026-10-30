// Browser test of the real UI in Demo mode: student and merchant on separate "devices" (pages),
// plus every MPP screen. Usage: serve app/ on :8765, then `node tests/e2e.mjs`.
import { chromium } from 'playwright';
const BASE = process.env.BASE || 'http://localhost:5173/';
const shots = process.env.SHOTS || '/tmp/e2e';
import fs from 'fs'; fs.mkdirSync(shots, { recursive: true });
const b = await chromium.launch();
const ctx = await b.newContext({ viewport: { width: 400, height: 860 }, deviceScaleFactor: 1 });
const errors = [];
const watch = (p, who) => { p.on('pageerror', (e) => errors.push(`${who} pageerror: ${e.message}`)); p.on('console', (m) => { if (m.type() === 'error') errors.push(`${who} console: ${m.text()}`); }); };
let step = 0; const ok = (m) => console.log(`  ✓ ${++step}. ${m}`);
const login = async (p, email) => { await p.goto(BASE); await p.waitForSelector('#google', { timeout: 60000 }); await p.click(`[data-demo="${email}"]`); };

const stu = await ctx.newPage(); watch(stu, 'student');
await stu.goto(BASE); await stu.evaluate(() => { localStorage.clear(); sessionStorage.clear(); });
await login(stu, 'aina@siswa.um.edu.my'); await stu.waitForSelector('.pass', { timeout: 60000 });
const before = Number((await stu.textContent('.pass [data-bind=points]')).replace(/\D/g, ''));
ok(`student signed in with ${before} points`);

await stu.click('a[href="#/pay"]'); await stu.waitForSelector('#plist');
await stu.click('#plist a:has-text("Kopi Kolej")'); await stu.waitForSelector('[name=amount]');
await stu.fill('[name=amount]', '12.40'); await stu.click('#amt button');
await stu.waitForSelector('#qr canvas', { state: 'attached' }); const code = (await stu.textContent('#code')).trim();
await stu.screenshot({ path: `${shots}/01-student-code.png` });
ok(`student made a code ${code.slice(0, 12)}…`);

const fresh = async (pg) => pg.addInitScript(() => { if (sessionStorage.getItem('umc-demo-session') === null) sessionStorage.setItem('umc-demo-session', ''); });
const mer = await ctx.newPage(); watch(mer, 'merchant'); await fresh(mer);
await login(mer, 'kopikolej@demo.my'); await mer.waitForSelector('#today .stat', { timeout: 30000 });
await mer.screenshot({ path: `${shots}/02-merchant-home.png` });
await mer.click('a[href="#/scan"]'); await mer.waitForSelector('#manual');
await mer.fill('#manual [name=code]', code); await mer.click('#manual button');
await mer.waitForSelector('#cf'); await mer.screenshot({ path: `${shots}/03-merchant-confirm.png` });
await mer.check('#cf input[type=checkbox]'); await mer.click('#cf button.go');
await mer.waitForSelector('text=Confirmed'); ok('merchant scanned and confirmed RM12.40');

await stu.bringToFront(); await stu.waitForSelector('text=Confirmed by Kopi Kolej', { timeout: 15000 });
await stu.waitForTimeout(800); await stu.screenshot({ path: `${shots}/04-student-confirmed.png` });
const gained = Number((await stu.textContent('.amount-big')).replace(/\D/g, ''));
if (gained !== 24) throw new Error('expected +24 points, got ' + gained);
ok('student saw +24 points live');

// replay attack: merchant re-enters the same code
await mer.bringToFront(); await mer.click('#sheet [data-close]').catch(() => {});
await mer.fill('#manual [name=code]', code); await mer.click('#manual button');
await mer.waitForSelector('#toast.show'); const t = await mer.textContent('#toast');
if (!/Already confirmed/.test(t)) throw new Error('replay not blocked: ' + t); ok('re-using the code is refused');

// student: rewards → redeem RM3 voucher at Kopi Kolej, merchant redeems it
await stu.goto(BASE + '#/rewards'); await stu.waitForSelector('[data-redeem]');
await stu.click('[data-redeem="kopi-rm3"]'); await stu.click('#sheet [data-yes]');
await stu.waitForSelector('#vqr canvas', { state: 'attached', timeout: 10000 }); const vcode = (await stu.textContent('#sheet .code-text')).trim();
await stu.screenshot({ path: `${shots}/05-voucher.png` }); ok(`student swapped 300 points for voucher ${vcode}`);
await mer.fill('#manual [name=code]', vcode); await mer.click('#manual button'); await mer.waitForSelector('#use');
await mer.click('#use'); await mer.waitForSelector('#toast.show'); ok('merchant marked the voucher used');

// learning + survey + community
await stu.goto(BASE + '#/learn'); await stu.waitForSelector('[data-lesson="2"]'); await stu.click('[data-lesson="2"]');
await stu.click('#sheet [data-a="1"]'); await stu.waitForSelector('#toast.show'); ok('lesson answered: ' + (await stu.textContent('#toast')));
await stu.goto(BASE + '#/survey'); await stu.waitForSelector('#survey');
for (const nme of ['k0', 'k1', 'k2', 'k3', 'd0', 'd1', 'd2']) await stu.check(`#survey input[name=${nme}][value="1"]`);
await stu.click('#survey button'); await stu.waitForSelector('#sheet h2'); ok('money check: ' + (await stu.textContent('#sheet h2')));
await stu.goto(BASE + '#/community'); await stu.waitForSelector('.lb-row'); await stu.screenshot({ path: `${shots}/06-community.png`, fullPage: true }); ok('leaderboard rendered');
for (const r of ['home', 'explore', 'deals', 'spending', 'me', 'rewards']) { await stu.goto(BASE + '#/' + r); await stu.waitForTimeout(700); await stu.screenshot({ path: `${shots}/s-${r}.png`, fullPage: true }); }
ok('all student screens rendered');

// merchant screens
for (const r of ['shop', 'promote', 'insights', 'poster', 'survey']) { await mer.goto(BASE + '#/' + r); await mer.waitForTimeout(800); await mer.screenshot({ path: `${shots}/m-${r}.png`, fullPage: true }); }
ok('all merchant screens rendered');

// a brand-new student signs in with Google (demo account picker) and sets up a profile
const g = await ctx.newPage(); watch(g, 'gmail'); await fresh(g);
await g.goto(BASE); await g.waitForSelector('#google', { timeout: 60000 }); await g.click('#google');
await g.fill('#gnew [name=email]', 'nurul.izzah@gmail.com'); await g.click('#gnew button');
await g.waitForSelector('#ob'); const prefill = await g.inputValue('#ob [name=name]');
await g.fill('#ob [name=matric]', '23001234'); await g.selectOption('#ob [name=college]', 'KK11'); await g.check('#ob input[type=checkbox]');
await g.click('#ob button[type=submit]'); await g.waitForSelector('#toast.show'); const dupMsg = await g.textContent('#toast');
if (!/already registered/.test(dupMsg)) throw new Error('duplicate matric not caught: ' + dupMsg);
ok(`Google sign-in prefilled "${prefill}"; reused matric refused`);
await g.fill('#ob [name=matric]', '23009999'); await g.click('#ob button[type=submit]');
await g.waitForSelector('.pass', { timeout: 20000 }); await g.screenshot({ path: `${shots}/07-gmail-student-home.png` });
ok('new Gmail student reached their home screen');

// MPP on desktop
const mpp = await ctx.newPage(); watch(mpp, 'mpp'); await fresh(mpp); await mpp.setViewportSize({ width: 1360, height: 900 });
await login(mpp, 'admin@umconnect-e455a.web.app');
await mpp.waitForSelector('#mpp-rail', { timeout: 30000 });
await mpp.goto(BASE + '#/merchants'); await mpp.waitForSelector('[data-review]'); await mpp.click('[data-review]');
for (const c of await mpp.$$('#rv [name=c]')) await c.check(); await mpp.click('#rv [data-s="verified"]');
await mpp.waitForSelector('#toast.show'); ok('MPP verified Roti by Hana: ' + (await mpp.textContent('#toast')));
for (const r of ['overview', 'merchants', 'approvals', 'paynet', 'recon', 'rewards', 'campaigns', 'kpis', 'people', 'settings']) {
  await mpp.goto(BASE + '#/' + r); await mpp.waitForTimeout(900); await mpp.screenshot({ path: `${shots}/p-${r}.png`, fullPage: true });
  if (await mpp.$('text=This page didn’t load')) throw new Error('MPP page failed: ' + r);
}
ok('all MPP screens rendered');
const [dl] = await Promise.all([mpp.waitForEvent('download', { timeout: 30000 }), (async () => { await mpp.goto(BASE + '#/paynet'); await mpp.waitForSelector('#xlsx1'); await mpp.click('#xlsx1'); })()]);
await dl.saveAs(`${shots}/Lampiran1.xlsx`); ok('Lampiran 1 Excel exported: ' + dl.suggestedFilename());

console.log(errors.length ? '\nErrors:\n' + errors.join('\n') : '\nNo page errors.');
await b.close();
process.exit(errors.length ? 1 : 0);
