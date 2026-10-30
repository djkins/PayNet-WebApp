// Merchant app: application, readiness, scan-to-confirm, vouchers, offers, deals, insights, poster.
import * as D from '../data.js';
import { $, $$, esc, icon, rm, n, toast, sheet, closeSheet, busy, errText, fmtDate, fmtTime, timeAgo, confetti, renderQR,
  startScanner, compressImage, barChart, colorFor, initials, downloadCSV } from '../ui.js';
import { surveyHTML, surveyMount } from './student.js';

export const defaultRoute = 'home';
const toMs = D.toMs;
const statusBadge = (m) => !m ? '<span class="badge grey">Not applied</span>'
  : m.status === 'verified' ? `<span class="badge ok">${icon('badge-check')}Verified</span>`
  : m.status === 'rejected' ? '<span class="badge bad">Needs changes</span>'
  : m.status === 'suspended' ? '<span class="badge bad">Suspended</span>' : '<span class="badge warn">MPP is reviewing</span>';

function needVerified(app) {
  if (app.merchant && app.merchant.status === 'verified') return null;
  return `<div class="card empty" style="margin-top:16px">${icon('store')}<h3>${app.merchant ? 'Waiting for MPP to verify your shop' : 'Apply to join first'}</h3>
    <p>${app.merchant ? 'You can scan student codes once MPP checks your DuitNow QR. This usually takes 1–2 working days.' : 'Send your business details and DuitNow QR to MPP. Once verified, students earn points when they pay you.'}</p>
    <a class="btn primary" style="margin-top:12px" href="#/shop">${app.merchant ? 'View application' : 'Apply now'}</a></div>`;
}

// ------------------------------------------------------------- home
async function homeRender(app) {
  const m = app.merchant; const name = m ? m.name : app.profile.name;
  const step = !m ? 1 : m.status !== 'verified' ? 2 : !m.ready ? 3 : 4;
  return `<div class="page-title"><h1>${esc(name)}</h1><p class="row" style="gap:8px">${statusBadge(m)}${m && m.ready ? `<span class="badge ok">${icon('shield-check')}Staff ready</span>` : ''}</p></div>
    ${step < 4 ? `<div class="card pad-lg"><h2>Get set up</h2><div class="steps" style="margin-top:10px">
      ${[['Send your details and DuitNow QR', 'MPP needs your QR photo to add you to PayNet’s monthly merchant list.', 'shop'],
        ['MPP verifies your shop', 'They check the QR name matches your business. Usually 1–2 working days.', 'shop'],
        ['Train your staff', 'A 2-minute checklist on confirming payments in your own banking app.', 'shop'],
        ['Scan your first student', 'Students show a code after paying; you confirm it.', 'scan']].map(([t, d, h], i) =>
        `<div class="step ${i + 1 < step ? 'done' : i + 1 === step ? 'now' : ''}"><span class="n">${i + 1 < step ? icon('check') : i + 1}</span><div><h3>${t}</h3><p>${d}</p>
          ${i + 1 === step && i !== 1 ? `<a class="btn small primary" style="margin-top:8px" href="#/${h}">${i === 0 ? 'Apply now' : i === 2 ? 'Open checklist' : 'Open scanner'}</a>` : ''}</div></div>`).join('')}</div></div>` : ''}
    ${m && m.status === 'verified' ? `
      <a class="pass" href="#/scan" style="display:block;margin-top:16px;text-decoration:none"><div class="who">Student at the counter?</div>
        <div class="balance"><strong style="font-size:34px">Scan their code</strong></div><p style="opacity:.9;font-weight:600">Check the payment in your banking app, then confirm. Vouchers scan here too.</p></a>
      <div class="stats" style="margin-top:16px" id="today"><div class="skeleton" style="height:96px"></div><div class="skeleton" style="height:96px"></div></div>
      <section class="section"><div class="head"><h2>Live confirmations</h2><a href="#/insights">Insights</a></div><div class="card list" id="feed"><div class="skeleton" style="height:60px"></div></div></section>` : ''}
    <section class="section"><div class="card row"><span class="tile-icon orange">${icon('target')}</span><div style="flex:1"><h3>Cashless readiness check</h3><p class="faint">Seven questions so MPP knows what support you need.</p></div><a class="btn small" href="#/survey">Open</a></div></section>`;
}
function homeMount(root, app) {
  if (!$('#feed', root)) return null;
  return D.watchMerchantTransactions(app.ctx, (txs) => {
    const today = D.dayKey(); const conf = txs.filter((t) => t.status === 'confirmed');
    const t = conf.filter((x) => x.confirmDay === today);
    const firstSeen = {}; [...conf].reverse().forEach((x) => { if (!firstSeen[x.studentUid]) firstSeen[x.studentUid] = x.id; });
    const newToday = t.filter((x) => firstSeen[x.studentUid] === x.id).length;
    $('#today', root).innerHTML = `
      <div class="stat"><div class="k">Confirmed today</div><div class="v num">${t.length}</div><div class="s">${rm(t.reduce((s, x) => s + x.cents, 0))} in sales</div></div>
      <div class="stat"><div class="k">New students today</div><div class="v num">${newToday}</div><div class="s">${t.length - newToday} returning</div></div>`;
    $('#feed', root).innerHTML = conf.slice(0, 8).map((x) => `<div class="item"><span class="tile-icon mint">${icon('check')}</span><div class="grow"><h3>${esc(x.studentName)}</h3><p>${timeAgo(x.confirmedAt)}</p></div><b class="num">${rm(x.cents)}</b></div>`).join('')
      || `<div class="empty">${icon('scan-line')}<p>Confirmed student purchases will appear here as they happen.</p></div>`;
  }, () => {});
}

// ------------------------------------------------------------- scan: student purchase codes and vouchers
async function scanRender(app) {
  const block = needVerified(app); if (block) return block;
  return `<div class="page-title"><h1>Scan a student code</h1><p>The student pays you by DuitNow QR, then shows their UM Connect+ code. Voucher codes work here too.</p></div>
    <div class="scanner" id="scanner"><video id="cam" muted playsinline></video><div class="idle" id="idle"><div>${icon('camera')}<p>Camera is off</p>
      <button class="btn primary" id="start" style="margin-top:12px">Start camera</button></div></div></div>
    <p class="faint" id="scanstatus" style="text-align:center;margin-top:10px" role="status"></p>
    <form id="manual" class="card stack" style="margin-top:16px"><label class="field">No camera? Type the code<input name="code" autocomplete="off" placeholder="UMC1:… or an 8-letter voucher code"></label><button class="btn">Look up code</button></form>`;
}
function scanMount(root, app) {
  if (!$('#cam', root)) return null;
  let stop = null, handling = false;
  const status = (t) => { const el = $('#scanstatus', root); if (el) el.textContent = t; };
  const start = async () => {
    sessionStorage.setItem('umc-cam', 'on');
    $('#idle', root).classList.add('hidden');
    root.querySelector('.scanner').insertAdjacentHTML('beforeend', '<div class="frame"></div>');
    stop = await startScanner($('#cam', root), (code) => handle(code), status);
  };
  $('#start', root).onclick = start;
  $('#manual', root).onsubmit = (e) => { e.preventDefault(); const v = e.target.code.value.trim(); if (v) handle(v); };
  async function handle(raw) {
    if (handling) return; handling = true;
    try {
      raw = raw.trim();
      if (raw.startsWith('UMV1:') || /^[A-Z0-9]{8}$/i.test(raw)) await voucherFlow(app, raw);
      else await purchaseFlow(app, raw);
    } finally { handling = false; }
  }
  if (sessionStorage.getItem('umc-cam') === 'on') start();
  return () => { stop && stop(); };
}
async function purchaseFlow(app, raw) {
  const m = /^UMC1:([A-Za-z0-9]{10,40})$/.exec(raw);
  if (!m) return toast('That isn’t a UM Connect+ code. Ask the student to open Pay in the app.', true);
  let tx;
  try { tx = await D.getTx(app.ctx, m[1]); } catch (e) { return toast(e.code === 'permission-denied' ? 'This code is for a different merchant. Ask the student to choose your shop.' : errText(e), true); }
  if (!tx) return toast('Code not found. Ask the student to make a new one.', true);
  if (tx.status === 'confirmed') return toast('Already confirmed. Points can’t be given twice.', true);
  if (tx.status !== 'pending') return toast('The student cancelled this code.', true);
  const left = (toMs(tx.createdAt) || 0) + app.rules.txTtlMin * 60000 - Date.now();
  if (left <= 0) return toast('This code expired. Ask the student to make a new one.', true);
  const pts = D.purchasePoints(tx.cents, app.rules);
  const el = sheet(`<h2>Confirm this purchase</h2>
    <div class="card" style="margin-top:12px;text-align:center"><div class="amount-big num">${rm(tx.cents)}</div><p class="muted">${esc(tx.studentName)} · code made ${fmtTime(tx.createdAt)}</p>
      ${tx.dealId ? '<span class="badge warn" style="margin-top:6px">Quiet-hour deal</span>' : ''}</div>
    <form id="cf" class="stack" style="margin-top:14px"><label class="check"><input type="checkbox" required><span>I can see <b>${rm(tx.cents)}</b> from this student in my own banking app or terminal.</span></label>
      <button class="btn go block">${icon('circle-check')} Confirm and give ${pts} points</button><button type="button" class="btn ghost block" data-close>Not received, don’t confirm</button></form>`);
  $('#cf', el).onsubmit = (e) => {
    e.preventDefault();
    busy($('button.go', el), async () => {
      try {
        await D.confirmTx(app.ctx, tx, app.rules);
        confetti();
        sheet(`<div class="qr-stage"><span class="tile-icon mint" style="width:64px;height:64px;font-size:30px">${icon('circle-check')}</span><h2>Confirmed</h2>
          <p class="muted">${esc(tx.studentName)} earned ${pts} points for ${rm(tx.cents)}.</p><button class="btn primary" data-close>Scan the next student</button></div>`);
      } catch (err) {
        toast(err.code === 'permission-denied' ? 'Couldn’t confirm. The code may have expired or already been used.' : errText(err), true);
      }
    });
  };
}
async function voucherFlow(app, raw) {
  let v;
  try { v = await D.findVoucher(app.ctx, raw); } catch (e) { return toast(e.code === 'permission-denied' ? 'This voucher belongs to another merchant.' : errText(e), true); }
  if (!v) return toast('Voucher not found for your shop.', true);
  if (v.status === 'used') return toast(`Voucher already used on ${fmtDate(v.usedAt)}.`, true);
  const el = sheet(`<h2>Redeem voucher</h2><div class="ticket" style="margin-top:12px"><span class="stub">${icon('ticket')}</span><span class="body"><h3>${esc(v.title)}</h3><p class="faint">${esc(v.studentName)} · worth ${rm(v.valueCents)}</p></span></div>
    <p class="muted" style="margin-top:12px">Give the student ${rm(v.valueCents)} off, then mark the voucher used.</p>
    <button class="btn go block" id="use" style="margin-top:12px">Mark as used</button>`);
  $('#use', el).onclick = (e) => busy(e.currentTarget, async () => { try { await D.useVoucher(app.ctx, v.id); closeSheet(); toast('Voucher marked as used.'); } catch (err) { toast(errText(err), true); } });
}

// ------------------------------------------------------------- shop: application, readiness, seats, poster
const READY_TEXT = {
  English: [['How to check a payment', 'Open your own banking app or terminal. Match the payer, the amount and the time. A customer’s screenshot is not proof of payment.'],
    ['How DuitNow QR money reaches you', 'Payments settle into the account linked to your QR. Ask your bank for the settlement schedule, any fees and how refunds work.']],
  'Bahasa Malaysia': [['Cara menyemak bayaran', 'Buka aplikasi bank atau terminal anda sendiri. Padankan pembayar, jumlah dan masa. Tangkap layar pelanggan bukan bukti bayaran.'],
    ['Bagaimana wang DuitNow QR sampai kepada anda', 'Bayaran masuk ke akaun yang dipautkan pada QR anda. Tanya bank anda tentang jadual penyelesaian, caj dan proses bayaran balik.']],
  '中文': [['如何确认付款', '打开您自己的银行应用或终端，核对付款人、金额和时间。顾客的截图不能作为付款证明。'],
    ['DuitNow QR 款项如何到账', '款项会存入与您的二维码关联的账户。请向银行确认结算时间、费用和退款流程。']],
};
const READY_CHECKS = ['Staff confirm every payment in our own banking app or terminal', 'Staff know how to scan a student’s UM Connect+ code',
  'The name on our DuitNow QR matches our registered business name', 'Our UM Connect+ poster is displayed next to our DuitNow QR'];
let readyLang = 'English';
async function shopRender(app) {
  const m = app.merchant; const priv = m ? await D.getMerchantPrivate(app.ctx, app.ctx.uid).catch(() => null) : null;
  const editable = !m || m.status !== 'verified';
  const v = (k) => esc((m && m[k]) || (priv && priv[k]) || '');
  const sel = (name, opts, cur) => `<select name="${name}">${opts.map((o) => `<option ${o === cur ? 'selected' : ''}>${esc(o)}</option>`).join('')}</select>`;
  return `<div class="page-title"><h1>My shop</h1><p class="row" style="gap:8px">${statusBadge(m)}</p></div>
    ${m && m.status === 'rejected' ? `<div class="notice bad">${icon('circle-alert')}<span>MPP asked for changes: ${esc(m.reviewNote || 'see details')}. Update and send again.</span></div>` : ''}
    ${m && m.status === 'pending' ? `<div class="notice">${icon('clock')}<span>Sent ${fmtDate(m.submittedAt)}. MPP will check that your QR name matches your business.</span></div>` : ''}
    <section class="section"><div class="head"><h2>Business details</h2></div>
    <form id="app-form" class="card stack" ${editable ? '' : 'inert'}>
      <label class="field">Business name, as students know it<input name="name" required minlength="2" value="${v('name')}"></label>
      <label class="field">Account name on your DuitNow QR<input name="accountName" required value="${v('accountName')}"><small>MPP checks this matches the QR.</small></label>
      <div class="grid-2"><label class="field">Type${sel('type', D.MERCHANT_TYPES, m?.type)}</label><label class="field">Category${sel('segment', D.SEGMENTS, m?.segment)}</label></div>
      <div class="grid-2"><label class="field">Location<input name="location" required placeholder="e.g. KK3 cafeteria" value="${v('location')}"></label><label class="field">Campus zone${sel('zone', D.ZONES, m?.zone)}</label></div>
      <div class="grid-2"><label class="field">Contact phone<input name="phone" type="tel" value="${v('phone')}"></label><label class="field">Ambassador ID (optional)<input name="ambassadorId" value="${v('ambassadorId')}" placeholder="e.g. AMB-003"></label></div>
      <div id="event-fields" class="grid-2"><label class="field">Event name<input name="eventName" value="${v('eventName')}"></label><label class="field">Event ends<input name="eventEnd" type="date" value="${v('eventEnd')}"></label></div>
      <label class="field">Photo of your DuitNow QR<input name="qr" type="file" accept="image/*" ${priv && priv.qrImage ? '' : 'required'}><small>A clear, straight photo. It goes on the monthly list PayNet uses to count your transactions.</small></label>
      ${priv && priv.qrImage ? `<img class="qr-thumb" style="width:120px;height:120px" src="${priv.qrImage}" alt="Your uploaded DuitNow QR">` : ''}
      ${editable ? `<button class="btn primary">${m ? 'Send updated details to MPP' : 'Send to MPP for verification'}</button>` : '<p class="faint">Verified details are locked. Ask MPP if something needs to change.</p>'}
    </form></section>
    ${m ? `<section class="section" id="ready"><div class="head"><h2>Staff readiness</h2>${m.ready ? `<span class="badge ok">${icon('check')}Done ${fmtDate(m.readyAt)}</span>` : ''}</div>
      <div class="card stack"><div class="chips">${Object.keys(READY_TEXT).map((l) => `<button data-lang="${l}" class="${l === readyLang ? 'on' : ''}">${l}</button>`).join('')}</div>
        ${READY_TEXT[readyLang].map(([t, d]) => `<div><h3>${esc(t)}</h3><p class="muted" style="font-size:14px;margin-top:4px">${esc(d)}</p></div>`).join('')}
        <form id="ready-form">${READY_CHECKS.map((c) => `<label class="check"><input type="checkbox" required ${m.ready ? 'checked' : ''}> ${esc(c)}</label>`).join('')}
          <button class="btn ${m.ready ? '' : 'primary'}" ${m.status === 'rejected' ? 'disabled' : ''}>${m.ready ? 'Checklist complete' : 'Confirm my staff are ready'}</button></form></div></section>` : ''}
    ${m && m.status === 'verified' ? `<section class="section"><div class="head"><h2>Poster for your counter</h2></div><div class="card row"><span class="tile-icon">${icon('printer')}</span><div style="flex:1"><p class="muted" style="font-size:14px">Print it and place it next to your DuitNow QR. Students scan it to open your shop in the app.</p></div><a class="btn small" href="#/poster">Open poster</a></div></section>` : ''}`;
}
function shopMount(root, app) {
  const f = $('#app-form', root);
  const syncEvent = () => { $('#event-fields', root).classList.toggle('hidden', f.segment.value !== 'Temporary student entrepreneur'); };
  f.segment.onchange = syncEvent; syncEvent();
  f.onsubmit = (e) => {
    e.preventDefault();
    busy($('button', f), async () => {
      try {
        let qrImage = null; const file = f.qr.files[0];
        if (file) qrImage = await compressImage(file);
        await D.submitApplication(app.ctx, { name: f.name.value, accountName: f.accountName.value, type: f.type.value, segment: f.segment.value,
          location: f.location.value, zone: f.zone.value, phone: f.phone.value, ambassadorId: f.ambassadorId.value,
          eventName: f.eventName.value, eventEnd: f.eventEnd.value, qrImage });
        toast('Sent to MPP. You’ll see the status here.'); setTimeout(() => app.render(), 300);
      } catch (err) { toast(err.code ? errText(err) : err.message, true); }
    });
  };
  $$('[data-lang]', root).forEach((b) => { b.onclick = () => { readyLang = b.dataset.lang; app.render(); }; });
  const rf = $('#ready-form', root);
  if (rf) rf.onsubmit = (e) => { e.preventDefault(); if (app.merchant.ready) return; busy($('button', rf), async () => { try { await D.setReadiness(app.ctx); toast('Readiness recorded.'); } catch (err) { toast(errText(err), true); } }); };
  const off = app.on((t) => { if (t === 'merchant' && !root.contains(document.activeElement)) app.render(); });
  return off;
}

async function posterRender(app) {
  const m = app.merchant; if (!m) return needVerified(app);
  return `<a class="back no-print" href="#/shop">${icon('arrow-left')} My shop</a>
    <div class="poster" style="margin-top:8px"><img src="icons/icon-192.png" alt="" style="width:56px;height:56px;border-radius:16px">
      <h1>Paid cashless? Get points.</h1><p class="muted" style="max-width:36ch">Pay ${esc(m.name)} with DuitNow QR, then open UM Connect+ and show your code at the counter.</p>
      <div class="qr-frame"><div id="pqr"></div></div><p><b>${esc(m.name)}</b><br><span class="faint">Scan to open this shop in UM Connect+</span></p></div>
    <div class="row no-print" style="justify-content:center;margin-top:16px"><button class="btn primary" onclick="window.print()">${icon('printer')} Print poster</button></div>`;
}
function posterMount(root, app) {
  const url = `${location.origin}${location.pathname}#/merchant/${app.ctx.uid}`;
  renderQR($('#pqr', root), url, 300);
}

// ------------------------------------------------------------- promote: offers, quiet-hour deals, seats
async function promoteRender(app) {
  const block = needVerified(app); if (block) return block;
  const [offers, deals] = await Promise.all([D.myOffers(app.ctx), D.myDeals(app.ctx)]);
  const m = app.merchant; const badge = (s) => `<span class="badge ${s === 'approved' ? 'ok' : s === 'rejected' ? 'bad' : s === 'withdrawn' ? 'grey' : 'warn'}">${{ approved: 'Live', rejected: 'Not approved', withdrawn: 'Withdrawn', pending: 'MPP reviewing' }[s] || s}</span>`;
  return `<div class="page-title"><h1>Promote</h1><p>Offers bring students back. Quiet-hour deals fill seats when you’re slow. MPP approves both before students see them.</p></div>
    <section class="card pad-lg"><h2>How busy are you right now?</h2><p class="muted" style="margin-top:4px">Quiet-hour deals only switch on while seats taken stay under your limit. Update this when it changes.</p>
      <form id="seats" class="grid-2" style="margin-top:12px;align-items:end"><label class="field">Total seats<input name="seats" type="number" min="1" max="2000" required value="${m.seats || ''}"></label>
        <label class="field">Seats taken now<input name="occupied" type="number" min="0" max="2000" required value="${m.occupied ?? ''}"></label>
        <button class="btn primary" style="grid-column:1/-1">Update seats</button></form>
      ${m.occupancyAt ? `<p class="faint" style="margin-top:8px">Last updated ${timeAgo(m.occupancyAt)}</p>` : ''}</section>
    <section class="section"><div class="head"><h2>Quiet-hour deals</h2><button class="btn small primary" id="new-deal">${icon('plus')} New deal</button></div>
      <div class="stack">${deals.map((d) => `<div class="card row between"><div><h3>${esc(d.title)}</h3><p class="faint">${D.hhmm(d.startMin)}–${D.hhmm(d.endMin)} · under ${d.threshold}% full · spend ${rm(d.minSpendCents)}+ · +${d.bonus} pts · ${d.limit}/day</p></div>
        <div class="row">${badge(d.status)}${d.status === 'approved' ? `<button class="btn small" data-toggle="${esc(d.id)}" data-en="${d.enabled ? '0' : '1'}">${d.enabled ? 'Pause' : 'Resume'}</button>` : ''}</div></div>`).join('') || `<div class="card empty">${icon('clock')}<p>No deals yet. Try one for your slowest two hours.</p></div>`}</div></section>
    <section class="section"><div class="head"><h2>Offers</h2><button class="btn small primary" id="new-offer">${icon('plus')} New offer</button></div>
      <div class="stack">${offers.map((o) => `<div class="card row between"><div><h3>${esc(o.title)}</h3><p class="faint">${esc(o.type)} · until ${esc(o.endDate)}</p></div><div class="row">${badge(o.status)}
        ${o.status === 'approved' || o.status === 'pending' ? `<button class="btn small ghost" data-withdraw="${esc(o.id)}">Withdraw</button>` : ''}</div></div>`).join('') || `<div class="card empty">${icon('megaphone')}<p>No offers yet. A first-visit bonus is a good start.</p></div>`}</div></section>`;
}
function promoteMount(root, app) {
  if (!$('#seats', root)) return null;
  $('#seats', root).onsubmit = (e) => {
    e.preventDefault(); const s = Math.floor(+e.target.seats.value), o = Math.floor(+e.target.occupied.value);
    if (o > s) return toast('Seats taken can’t be more than total seats.', true);
    busy($('button', e.target), async () => { try { await D.setOccupancy(app.ctx, s, o); toast('Seats updated.'); } catch (err) { toast(errText(err), true); } });
  };
  $('#new-offer', root).onclick = () => {
    const el = sheet(`<h2>New offer</h2><form id="of" class="stack" style="margin-top:12px"><label class="field">What students get<input name="title" required minlength="3" maxlength="60" placeholder="e.g. Free iced tea with any rice set"></label>
      <label class="field">Type<select name="type"><option>First-visit bonus</option><option>Discount</option><option>Free item</option><option>Extra points day</option></select></label>
      <label class="field">Runs until<input name="endDate" type="date" required min="${D.dayKey()}"></label><button class="btn primary">Send to MPP</button></form>`);
    $('#of', el).onsubmit = (e) => { e.preventDefault(); const f = e.target; busy($('button', el), async () => { try { await D.createOffer(app.ctx, { title: f.title.value, type: f.type.value, endDate: f.endDate.value }); closeSheet(); toast('Offer sent to MPP.'); app.render(); } catch (err) { toast(errText(err), true); } }); };
  };
  $('#new-deal', root).onclick = () => {
    const el = sheet(`<h2>New quiet-hour deal</h2><p class="muted">Students get bonus points for visiting while you have free seats.</p><form id="df" class="stack" style="margin-top:12px">
      <label class="field">Name<input name="title" required minlength="3" maxlength="60" placeholder="e.g. Afternoon study break"></label>
      <div class="grid-2"><label class="field">From<input name="start" type="time" required value="14:00"></label><label class="field">Until<input name="end" type="time" required value="17:00"></label></div>
      <div class="grid-2"><label class="field">Only while seats taken under (%)<input name="threshold" type="number" min="1" max="100" required value="60"></label><label class="field">Bonus points<input name="bonus" type="number" min="1" max="500" required value="40"></label></div>
      <div class="grid-2"><label class="field">Minimum spend (RM)<input name="min" type="number" min="0.5" step="0.5" required value="5"></label><label class="field">Bonuses per day<input name="limit" type="number" min="1" max="200" required value="12"></label></div>
      <button class="btn primary">Send to MPP</button></form>`);
    $('#df', el).onsubmit = (e) => {
      e.preventDefault(); const f = e.target; const s = D.parseHHMM(f.start.value), en = D.parseHHMM(f.end.value);
      if (en <= s) return toast('The end time must be after the start time.', true);
      busy($('button', el), async () => {
        try { await D.createDeal(app.ctx, { title: f.title.value, startMin: s, endMin: en, threshold: Math.floor(+f.threshold.value), bonus: Math.floor(+f.bonus.value), minSpendCents: Math.round(+f.min.value * 100), limit: Math.floor(+f.limit.value) }); closeSheet(); toast('Deal sent to MPP.'); app.render(); }
        catch (err) { toast(errText(err), true); }
      });
    };
  };
  $$('[data-toggle]', root).forEach((b) => { b.onclick = () => busy(b, async () => { await D.toggleDeal(app.ctx, b.dataset.toggle, b.dataset.en === '1'); app.render(); }); });
  $$('[data-withdraw]', root).forEach((b) => { b.onclick = () => busy(b, async () => { await app.backend.sdk.updateDoc(app.backend.sdk.doc(app.ctx.db, 'offers', b.dataset.withdraw), { status: 'withdrawn' }); app.render(); }); });
  const off = app.on((t) => { if (t === 'merchant' && !root.contains(document.activeElement) && !document.querySelector('#sheet[open]')) app.render(); });
  return off;
}

// ------------------------------------------------------------- insights
async function insightsRender(app) {
  const block = needVerified(app); if (block) return block;
  return `<div class="page-title"><h1>Insights</h1><p>From purchases you confirmed in UM Connect+.</p></div><div id="ins"><div class="skeleton" style="height:240px"></div></div>`;
}
function insightsMount(root, app) {
  if (!$('#ins', root)) return null;
  return D.watchMerchantTransactions(app.ctx, (txs) => {
    const conf = txs.filter((t) => t.status === 'confirmed');
    const days = Array.from({ length: 7 }, (_, i) => D.dayKey(Date.now() - (6 - i) * 86400000));
    const per = days.map((d) => conf.filter((t) => t.confirmDay === d).length);
    const students = new Map(); conf.forEach((t) => students.set(t.studentUid, (students.get(t.studentUid) || 0) + 1));
    const returning = [...students.values()].filter((c) => c > 1).length;
    const hours = Array.from({ length: 24 }, () => 0); conf.forEach((t) => { hours[new Date((toMs(t.confirmedAt) || 0) + 8 * 3600000).getUTCHours()]++; });
    const busiest = hours.indexOf(Math.max(...hours)); const quiet = [8, 9, 10, 11, 12, 13, 14, 15, 16, 17, 18, 19, 20].sort((a, b) => hours[a] - hours[b])[0];
    const month = conf.filter((t) => t.confirmMonth === D.monthKey());
    $('#ins', root).innerHTML = `<div class="stats">
        <div class="stat"><div class="k">This month</div><div class="v num">${month.length}</div><div class="s">${rm(month.reduce((s, t) => s + t.cents, 0))} confirmed</div></div>
        <div class="stat"><div class="k">Students served</div><div class="v num">${students.size}</div><div class="s">${returning} came back</div></div>
        <div class="stat"><div class="k">Average purchase</div><div class="v num">${conf.length ? rm(conf.reduce((s, t) => s + t.cents, 0) / conf.length) : 'RM0'}</div><div class="s">all time</div></div>
        <div class="stat"><div class="k">Busiest hour</div><div class="v num">${conf.length ? `${busiest}:00` : '—'}</div><div class="s">${conf.length ? `quietest ${quiet}:00` : 'no data yet'}</div></div></div>
      <section class="section card pad-lg"><h2>Purchases, last 7 days</h2><div style="margin-top:12px">${barChart(per, days.map((d) => new Date(d + 'T00:00:00+08:00').toLocaleDateString('en-MY', { weekday: 'short' })), { highlight: 6 })}</div></section>
      ${conf.length && hours[quiet] < hours[busiest] / 3 ? `<div class="notice" style="margin-top:16px">${icon('info')}<span>${quiet}:00 is your quietest hour. A quiet-hour deal could bring students in then.</span></div>` : ''}
      <section class="section"><div class="head"><h2>Recent purchases</h2><button class="btn small" id="csv">${icon('download')} CSV</button></div><div class="card"><div class="table-wrap"><table class="data"><thead><tr><th>When</th><th>Student</th><th class="r">Amount</th><th class="r">Points</th></tr></thead>
        <tbody>${conf.slice(0, 50).map((t) => `<tr><td>${fmtDate(t.confirmedAt)} ${fmtTime(t.confirmedAt)}</td><td>${esc(t.studentName)}</td><td class="r num">${rm(t.cents)}</td><td class="r num">${t.points}</td></tr>`).join('') || '<tr><td colspan="4" class="faint">No purchases yet.</td></tr>'}</tbody></table></div></div></section>`;
    const csv = $('#csv', root);
    if (csv) csv.onclick = () => (downloadCSV(`${app.merchant.name}-purchases.csv`, [['Date', 'Time', 'Student', 'Amount (RM)', 'Points'], ...conf.map((t) => [t.confirmDay, fmtTime(t.confirmedAt), t.studentName, (t.cents / 100).toFixed(2), t.points])]));
  }, () => {});
}

async function surveyRender(app) {
  const existing = await D.getSurvey(app.ctx).catch(() => null);
  return `<a class="back" href="#/home">${icon('arrow-left')} Home</a><div class="page-title"><h1>Cashless readiness check</h1><p>Your answers help MPP decide who needs an ambassador visit or staff training.</p></div>${surveyHTML('merchant', existing)}`;
}

export const routes = {
  home: { title: 'Home', render: homeRender, mount: homeMount },
  scan: { title: 'Scan', render: scanRender, mount: scanMount },
  shop: { title: 'My shop', render: shopRender, mount: shopMount },
  poster: { title: 'Poster', render: posterRender, mount: posterMount, tab: 'shop' },
  promote: { title: 'Promote', render: promoteRender, mount: promoteMount },
  insights: { title: 'Insights', render: insightsRender, mount: insightsMount },
  survey: { title: 'Readiness check', render: surveyRender, mount: (r, a) => surveyMount(r, a, 'merchant', 'home'), tab: 'home' },
};
