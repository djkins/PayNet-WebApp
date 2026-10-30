// Student app: pass, explore, pay-and-confirm, rewards, community, learning, profile.
import * as D from '../data.js';
import { CAFES, MAP_EMBED } from '../cafes.js';
import { $, $$, esc, icon, rm, n, toast, sheet, closeSheet, confirmSheet, busy, errText, fmtDate, fmtDateTime, timeAgo,
  confetti, renderQR, colorFor, initials, barChart, chevron, countUp } from '../ui.js';

export const defaultRoute = 'home';
const toMs = D.toMs;

// ------------------------------------------------------------- derived student facts
const LEVELS = [[0, 'Starter'], [200, 'Regular'], [600, 'Explorer'], [1500, 'Campus champion'], [4000, 'Legend']];
function levelOf(earned) {
  let i = 0; while (i + 1 < LEVELS.length && earned >= LEVELS[i + 1][0]) i++;
  const next = LEVELS[i + 1];
  return { name: LEVELS[i][1], next: next ? next[1] : null, pct: next ? Math.round(((earned - LEVELS[i][0]) / (next[0] - LEVELS[i][0])) * 100) : 100, toNext: next ? next[0] - earned : 0 };
}
const earnedTotal = (ledger) => ledger.filter((l) => l.delta > 0).reduce((s, l) => s + l.delta, 0);
const confirmed = (txs) => txs.filter((t) => t.status === 'confirmed');
function streak(txs) {
  const days = new Set(confirmed(txs).map((t) => D.dayKey(toMs(t.confirmedAt))));
  let s = 0; let d = Date.now();
  if (!days.has(D.dayKey(d))) d -= 86400000;
  while (days.has(D.dayKey(d))) { s++; d -= 86400000; }
  return s;
}
const firstName = (p) => (p?.name || '').split(' ')[0];
const merchantLogo = (m) => `<span class="logo" style="background:${colorFor(m.name)}">${esc(initials(m.name))}</span>`;
const typeIcon = (t) => ({ 'Food & drinks': 'coffee', Laundry: 'sparkles', Printing: 'printer', Shops: 'store', Services: 'zap', 'Student event stall': 'tag' }[t] || 'store');

// claimed off-peak deal is kept for 20 minutes on this device
const CLAIM_KEY = 'umc-deal-claim';
function activeClaim() {
  try { const c = JSON.parse(localStorage.getItem(CLAIM_KEY) || 'null'); return c && c.expires > Date.now() ? c : null; } catch { return null; }
}

// ------------------------------------------------------------- home
async function homeRender(app) {
  const p = app.profile; const lvl = levelOf(earnedTotal(app.ledger)); const st = streak(app.txs);
  const [merchants, offers] = await Promise.all([D.listVerifiedMerchants(app.ctx), D.approvedOffers(app.ctx).catch(() => [])]);
  const prog = D.missionProgress(app.txs);
  const recent = app.txs.filter((t) => t.status === 'confirmed').slice(0, 4);
  const hasSurvey = app.ledger.some((l) => l.id === 'survey');
  return `
  <section class="pass" style="margin-top:8px" aria-label="Your points">
    ${chevron('#ffffff', 16)}
    ${st ? `<span class="streak">${icon('flame')} ${st}-day streak</span>` : ''}
    <div class="who">Hi ${esc(firstName(p))}</div>
    <div class="balance"><strong data-bind="points">${n(p.points)}</strong><span>points</span></div>
    <div class="level">${esc(lvl.name)} <span class="progress"><i style="width:${lvl.pct}%"></i></span>
      ${lvl.next ? `<span>${n(lvl.toNext)} to ${esc(lvl.next)}</span>` : ''}</div>
    <div class="actions"><a class="btn" href="#/pay">${icon('qr-code')} Paid? Show my code</a><a class="btn clear" href="#/rewards">Use points</a></div>
  </section>
  <nav class="quick" aria-label="Shortcuts">
    <a href="#/deals">${icon('clock')}Quiet-hour deals</a><a href="#/learn">${icon('book-open')}Learn and earn</a>
    <a href="#/community">${icon('users')}My college</a><a href="#/spending">${icon('wallet')}My spending</a>
  </nav>
  ${!hasSurvey ? `<a class="card row" href="#/survey" style="margin-top:16px;text-decoration:none;color:inherit">
    <span class="tile-icon orange">${icon('target')}</span><span class="grow" style="flex:1"><h3>Take the 2-minute money check</h3>
    <p class="muted" style="font-size:13px">Seven questions, ${app.rules.surveyBonus} points the first time.</p></span>${icon('chevron-right')}</a>` : ''}
  <section class="section"><div class="head"><h2>This week’s missions</h2><a href="#/rewards">See all</a></div>
    <div class="card stack">${D.MISSIONS.map((m) => missionRow(m, prog[m.id])).join('')}</div></section>
  <section class="section"><div class="head"><h2>Pay cashless here</h2><a href="#/explore">All ${merchants.length}</a></div>
    <div class="mgrid">${merchants.slice(0, 4).map((m) => merchantCard(m, offers)).join('') || emptyMerchants()}</div></section>
  <section class="section"><div class="head"><h2>Recent purchases</h2><a href="#/spending">History</a></div>
    <div class="card list">${recent.map(txRow).join('') || `<div class="empty">${icon('receipt')}<p>Your confirmed purchases will show here.</p></div>`}</div></section>`;
}
function missionRow(m, v) {
  const pct = Math.min(100, Math.round((v / m.target) * 100));
  return `<div class="mission"><div class="ring" style="--p:${pct}"><span>${Math.min(v, m.target)}/${m.target}</span></div>
    <div style="flex:1"><h3>${esc(m.title)}</h3><p class="faint">${esc(m.desc)} · +${m.bonus} points</p></div></div>`;
}
const emptyMerchants = () => `<div class="card empty">${icon('store')}<p>No merchants are verified yet. MPP is onboarding campus businesses now.</p></div>`;
function merchantCard(m, offers = []) {
  const offer = m.offer || offers.find((o) => o.merchantId === m.id)?.title;
  return `<a class="mcard" href="#/merchant/${esc(m.id)}">${merchantLogo(m)}<div style="min-width:0"><h3>${esc(m.name)}</h3>
    <p>${esc(m.type)} · ${esc(m.location)}</p>${offer ? `<div class="offer">${icon('badge-percent')}${esc(offer)}</div>` : ''}</div></a>`;
}
function txRow(t) {
  return `<div class="item"><span class="tile-icon mint">${icon('check')}</span><div class="grow"><h3>${esc(t.merchantName)}</h3>
    <p>${fmtDateTime(t.confirmedAt || t.createdAt)}</p></div><div style="text-align:right"><b class="num">${rm(t.cents)}</b>
    <p class="num" style="color:#00783A;font-weight:700">+${t.points || 0} pts</p></div></div>`;
}

// ------------------------------------------------------------- explore
let exploreFilter = 'All', exploreQuery = '';
async function exploreRender(app) {
  const merchants = await D.listVerifiedMerchants(app.ctx);
  app._merchants = merchants;
  const types = ['All', ...new Set(merchants.map((m) => m.type))];
  return `<div class="page-title"><h1>Where to pay cashless</h1><p>Every merchant here is checked by MPP and gives you points when you pay with DuitNow QR.</p></div>
    <input type="search" id="q" placeholder="Search by name or place" value="${esc(exploreQuery)}" aria-label="Search merchants">
    <div class="chips" style="margin-top:12px" id="types">${types.map((t) => `<button class="${t === exploreFilter ? 'on' : ''}" data-t="${esc(t)}">${esc(t)}</button>`).join('')}</div>
    <div class="mgrid" id="mlist" style="margin-top:8px"></div>
    <section class="section"><div class="head"><h2>Campus food map</h2><a href="#/cafes">Café directory</a></div>
      <div class="card" style="padding:0;overflow:hidden"><iframe title="Map of Universiti Malaya" src="${MAP_EMBED}" style="border:0;width:100%;height:320px;display:block" loading="lazy" referrerpolicy="no-referrer-when-downgrade" allowfullscreen></iframe></div></section>`;
}
function exploreMount(root, app) {
  const draw = () => {
    const q = exploreQuery.toLowerCase();
    const rows = app._merchants.filter((m) => (exploreFilter === 'All' || m.type === exploreFilter) && `${m.name} ${m.location} ${m.zone}`.toLowerCase().includes(q));
    $('#mlist', root).innerHTML = rows.map((m) => merchantCard(m)).join('') || `<div class="card empty">${icon('search')}<p>No merchants match. Try another word or filter.</p></div>`;
  };
  $('#q', root).oninput = (e) => { exploreQuery = e.target.value; draw(); };
  $$('#types button', root).forEach((b) => { b.onclick = () => { exploreFilter = b.dataset.t; $$('#types button', root).forEach((x) => x.classList.toggle('on', x === b)); draw(); }; });
  draw();
}

async function merchantRender(app, [id]) {
  const m = await D.getMerchant(app.ctx, id).catch(() => null);
  if (!m || m.status !== 'verified') return `<a class="back" href="#/explore">${icon('arrow-left')} Explore</a><div class="card empty">${icon('store')}<h3>This merchant isn’t on UM Connect+ yet</h3><p>Points only count at MPP-verified merchants.</p></div>`;
  const deals = (await D.approvedDeals(app.ctx)).filter((d) => d.merchantId === id && d.enabled);
  return `<a class="back" href="#/explore">${icon('arrow-left')} Explore</a>
    <div class="card pad-lg" style="margin-top:8px"><div class="row" style="gap:14px">${merchantLogo(m).replace('class="logo"', 'class="logo" style="width:64px;height:64px;border-radius:20px;display:grid;place-items:center;color:#fff;font-weight:800;font-size:22px;background:' + colorFor(m.name) + '"')}
      <div><h1 style="font-size:26px">${esc(m.name)}</h1><p class="muted">${esc(m.type)} · ${esc(m.location)}</p></div></div>
      <div class="row" style="margin-top:14px">${m.ready ? `<span class="badge ok">${icon('badge-check')}Staff trained for cashless</span>` : ''}<span class="badge">${icon('shield-check')}MPP verified</span></div>
      ${m.offer ? `<div class="notice" style="margin-top:14px">${icon('badge-percent')}<span>${esc(m.offer)}</span></div>` : ''}
    </div>
    <section class="section"><div class="head"><h2>How to earn here</h2></div><div class="card steps">
      <div class="step"><span class="n">1</span><div><h3>Pay with DuitNow QR</h3><p>Scan ${esc(m.name)}’s DuitNow QR in your bank or e-wallet app. Check the name and amount.</p></div></div>
      <div class="step"><span class="n">2</span><div><h3>Show your code</h3><p>Enter what you paid. UM Connect+ makes a one-time code for this purchase.</p></div></div>
      <div class="step"><span class="n">3</span><div><h3>Get points</h3><p>The cashier scans it and confirms the payment arrived. You get ${app.rules.baseRate} points per RM1.</p></div></div>
    </div></section>
    ${deals.length ? `<section class="section"><div class="head"><h2>Quiet-hour deals</h2></div><div class="stack">${deals.map((d) => `<div class="card row between"><div><h3>${esc(d.title)}</h3><p class="faint">${D.hhmm(d.startMin)}–${D.hhmm(d.endMin)}, spend ${rm(d.minSpendCents)}+</p></div><span class="badge warn">+${d.bonus} pts</span></div>`).join('')}</div></section>` : ''}
    <div style="position:sticky;bottom:calc(var(--nav-h) + 12px);margin-top:20px"><a class="btn primary block" href="#/pay/${esc(m.id)}">${icon('qr-code')} I’ve paid, show my code</a></div>`;
}

async function cafesRender() {
  return `<a class="back" href="#/explore">${icon('arrow-left')} Explore</a><div class="page-title"><h1>Campus cafés</h1>
    <p>Public listings of where to eat on campus. Only places on the Explore list give UM Connect+ points.</p></div>
    <div class="card list">${CAFES.map((c) => `<div class="item"><span class="tile-icon">${icon('coffee')}</span><div class="grow"><h3>${esc(c.name)}</h3>
      <p>${esc(c.location)} · ${esc(c.food)}</p></div><a class="btn small" target="_blank" rel="noopener" href="https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(c.name + ' ' + c.location + ' Universiti Malaya')}">${icon('map-pin')} Map</a></div>`).join('')}</div>
    <p class="faint" style="margin-top:12px">Sources: <a href="${CAFES[6].source}" target="_blank" rel="noopener">UM food and vendor listings</a> and <a href="${CAFES[0].source}" target="_blank" rel="noopener">campus food guide (2023)</a>. Hours and prices aren’t verified.</p>`;
}

// ------------------------------------------------------------- pay: amount → QR → merchant confirms
async function payRender(app, [merchantId]) {
  const active = sessionStorage.getItem('umc-active-tx');
  if (!merchantId && active) return `<div id="pay"></div>`;
  if (!merchantId) {
    const merchants = await D.listVerifiedMerchants(app.ctx); app._merchants = merchants;
    return `<div class="page-title"><h1>Where did you pay?</h1><p>Pick the merchant, then show your code at the counter.</p></div>
      <input type="search" id="pq" placeholder="Search merchants" aria-label="Search merchants">
      <div class="mgrid" id="plist" style="margin-top:12px">${merchants.map((m) => merchantCard(m).replace(`#/merchant/${esc(m.id)}`, `#/pay/${esc(m.id)}`)).join('') || emptyMerchants()}</div>`;
  }
  return `<div id="pay"></div>`;
}
async function payMount(root, app, [merchantId]) {
  if ($('#pq', root)) {
    $('#pq', root).oninput = (e) => {
      const q = e.target.value.toLowerCase();
      $('#plist', root).innerHTML = app._merchants.filter((m) => `${m.name} ${m.location}`.toLowerCase().includes(q))
        .map((m) => merchantCard(m).replace(`#/merchant/${esc(m.id)}`, `#/pay/${esc(m.id)}`)).join('');
    };
    return null;
  }
  const box = $('#pay', root); let unsub = null, timer = null;
  const stop = () => { if (unsub) unsub(); unsub = null; clearInterval(timer); timer = null; };
  const active = sessionStorage.getItem('umc-active-tx');
  if (active && !merchantId) { showCode(active); return stop; }
  const m = await D.getMerchant(app.ctx, merchantId).catch(() => null);
  if (!m || m.status !== 'verified') { box.innerHTML = `<div class="card empty">${icon('store')}<h3>This merchant isn’t verified</h3><p>Choose another merchant.</p><a class="btn" href="#/pay">Choose merchant</a></div>`; return stop; }
  const claim = activeClaim();
  const deal = claim && claim.merchantId === m.id ? (await D.approvedDeals(app.ctx)).find((d) => d.id === claim.dealId) : null;
  box.innerHTML = `<a class="back" href="#/pay">${icon('arrow-left')} Change merchant</a>
    <div class="card pad-lg" style="margin-top:8px;text-align:center"><div class="row" style="justify-content:center">${merchantLogo(m)}</div>
      <h2 style="margin-top:10px">${esc(m.name)}</h2><p class="faint">${esc(m.location)}</p>
      <form id="amt" style="margin-top:14px"><label class="field" style="justify-items:center">How much did you pay?
        <input class="amount-input num" name="amount" inputmode="decimal" placeholder="RM0.00" required autocomplete="off" aria-describedby="amt-help"></label>
        <p id="amt-help" class="faint">Pay in your banking app first using ${esc(m.name)}’s DuitNow QR. Max ${rm(app.rules.maxTxCents)} per purchase.</p>
        ${deal ? `<label class="check" style="justify-content:center"><input type="checkbox" name="deal" checked> Use “${esc(deal.title)}” (+${deal.bonus} pts, spend ${rm(deal.minSpendCents)}+)</label>` : ''}
        <button class="btn primary block" style="margin-top:12px">${icon('qr-code')} Show my code</button></form></div>
    <p class="faint" style="margin-top:12px;text-align:center">You’ll earn ${app.rules.baseRate} points per RM1 after ${esc(m.name)} confirms the payment.</p>`;
  const amount = $('[name=amount]', box);
  amount.focus();
  $('#amt', box).onsubmit = (e) => {
    e.preventDefault();
    const val = Number(String(amount.value).replace(/[^\d.]/g, ''));
    const cents = Math.round(val * 100);
    if (!cents || cents < 50) return toast('Enter the amount you paid, at least RM0.50.', true);
    if (cents > app.rules.maxTxCents) return toast(`Purchases above ${rm(app.rules.maxTxCents)} don’t earn points.`, true);
    busy($('button', e.target), async () => {
      try {
        const useDeal = deal && e.target.deal && e.target.deal.checked && cents >= deal.minSpendCents;
        const id = await D.createTx(app.ctx, { merchant: m, cents, dealId: useDeal ? deal.id : undefined });
        if (useDeal) localStorage.removeItem(CLAIM_KEY);
        sessionStorage.setItem('umc-active-tx', id); history.replaceState(null, '', '#/pay'); showCode(id);
      } catch (err) {
        toast(err.code === 'permission-denied' && deal ? 'The quiet-hour deal isn’t available right now. Try without it.' : errText(err), true);
      }
    });
  };

  function showCode(id) {
    stop();
    box.innerHTML = `<div class="qr-stage" style="margin-top:16px"><span class="state-pill" id="st"><span class="dot"></span>Waiting for the cashier</span>
      <h2 id="mname">Show this to the cashier</h2><div class="amount-big num" id="amtv"></div>
      <div class="qr-frame" id="qrf"><div id="qr"></div></div>
      <p class="timer" id="tm"></p><p class="faint">Code: <span class="code-text" id="code">UMC1:${esc(id)}</span></p>
      <div class="row" style="justify-content:center"><button class="btn" id="cancel">Cancel code</button></div></div>`;
    renderQR($('#qr', box), 'UMC1:' + id, 260);
    let tx = null, celebrated = false;
    $('#cancel', box).onclick = async () => {
      if (tx && tx.status === 'pending') { try { await D.cancelTx(app.ctx, id); } catch { /* */ } }
      sessionStorage.removeItem('umc-active-tx'); stop(); app.go('home');
    };
    const tickTimer = () => {
      if (!tx || tx.status !== 'pending') return;
      const left = Math.ceil(((toMs(tx.createdAt) || Date.now()) + app.rules.txTtlMin * 60000 - Date.now()) / 1000);
      if (left <= 0) return finish('expired');
      $('#tm', box).textContent = `Code works for ${Math.floor(left / 60)}:${String(left % 60).padStart(2, '0')} more`;
    };
    timer = setInterval(tickTimer, 1000);
    unsub = D.watchTx(app.ctx, id, (t) => {
      tx = t; if (!t) return finish('gone');
      $('#mname', box).textContent = t.merchantName; $('#amtv', box).textContent = rm(t.cents);
      if (t.status === 'confirmed') finish('confirmed'); else if (t.status === 'cancelled') finish('cancelled'); else tickTimer();
    }, (err) => toast(errText(err), true));

    async function finish(state) {
      stop(); sessionStorage.removeItem('umc-active-tx');
      if (state !== 'confirmed') {
        $('#qrf', box)?.classList.add('dead');
        box.innerHTML = `<div class="card empty" style="margin-top:20px">${icon('clock')}<h3>${state === 'expired' ? 'This code expired' : 'This code was cancelled'}</h3>
          <p>Codes last ${app.rules.txTtlMin} minutes so they can’t be reused. Make a new one at the counter.</p>
          <a class="btn primary" style="margin-top:12px" href="#/pay/${esc(tx?.merchantId || '')}">Make a new code</a></div>`;
        return;
      }
      if (celebrated) return; celebrated = true;
      let extra = [];
      try {
        const prof = await D.getProfile(app.ctx); app.ctx.profile = prof;
        if (!prof.firstTx) { await D.markFirstTx(app.ctx, tx.id); app.ctx.profile = await D.getProfile(app.ctx); }
        if (app.ctx.profile.inviterUid && !(await D.hasLedger(app.ctx, 'referral_friend'))) { await D.claimFriendBonus(app.ctx, app.rules); extra.push(`+${app.rules.friendBonus} welcome bonus from your referral`); }
      } catch (e) { console.warn(e); }
      if (tx.dealId) {
        try {
          const deal = (await D.approvedDeals(app.ctx)).find((d) => d.id === tx.dealId);
          if (deal) { await D.claimOffpeak(app.ctx, tx, deal); extra.push(`+${deal.bonus} quiet-hour bonus`); }
        } catch (e) { extra.push('Quiet-hour bonus not added: the deal’s time, spend or daily limit wasn’t met'); }
      }
      confetti();
      box.innerHTML = `<div class="qr-stage" style="margin-top:28px"><span class="state-pill" style="background:var(--mint-wash);color:#00783A">${icon('circle-check')} Confirmed by ${esc(tx.merchantName)}</span>
        <div class="amount-big" style="font-size:56px;color:#00783A">+${tx.points}</div><p class="muted">points for ${rm(tx.cents)} at ${esc(tx.merchantName)}</p>
        ${extra.map((x) => `<p class="badge ${x.startsWith('+') ? 'ok' : 'warn'}">${esc(x)}</p>`).join('')}
        <p>Your balance: <b data-bind="points">${n(app.profile?.points)}</b> points</p>
        <div class="row" style="justify-content:center;margin-top:8px"><a class="btn primary" href="#/rewards">Use my points</a><a class="btn" href="#/home">Done</a></div></div>`;
    }
  }
  return stop;
}

// ------------------------------------------------------------- rewards, vouchers, missions, badges
async function rewardsRender(app) {
  const [rewards, claims] = await Promise.all([D.listRewards(app.ctx), D.myMissionClaims(app.ctx)]);
  const prog = D.missionProgress(app.txs);
  const p = app.profile;
  return `<div class="page-title"><h1>Your rewards</h1><p>You have <b data-bind="points">${n(p.points)}</b> points. Swap them for vouchers, or give them to the student welfare fund.</p></div>
    <section><div class="head" style="display:flex;justify-content:space-between;margin-bottom:12px"><h2>Swap points</h2></div>
      <div class="stack">${rewards.filter((r) => r.active).map((r) => {
        const left = (r.stock || 0) - (r.issued || 0); const can = p.points >= r.cost && left > 0;
        return `<div class="card row" style="gap:14px"><span class="tile-icon orange">${icon(r.icon || 'gift')}</span><div style="flex:1;min-width:0"><h3>${esc(r.title)}</h3>
          <p class="faint">${n(r.cost)} points · ${left > 0 ? `${left} left` : 'All claimed'} · valid ${r.validDays || 30} days</p></div>
          <button class="btn small ${can ? 'primary' : ''}" data-redeem="${esc(r.id)}" ${can ? '' : 'disabled'}>${can ? 'Swap' : `${n(Math.max(0, r.cost - p.points))} more`}</button></div>`;
      }).join('') || `<div class="card empty">${icon('gift')}<p>MPP hasn’t added rewards yet.</p></div>`}</div></section>
    <section class="section"><div class="head"><h2>My vouchers</h2></div><div id="vouchers" class="stack"><div class="skeleton" style="height:80px"></div></div></section>
    <section class="section"><div class="head"><h2>Missions this week</h2><span class="faint">Reset every Monday</span></div>
      <div class="card stack">${D.MISSIONS.map((m) => {
        const v = prog[m.id]; const claim = claims.find((c) => c.week === prog.week && c.mission === m.id);
        const btn = claim ? `<span class="badge ${claim.status === 'approved' ? 'ok' : claim.status === 'rejected' ? 'bad' : 'warn'}">${claim.status === 'approved' ? 'Points added' : claim.status === 'rejected' ? 'Not approved' : 'MPP is checking'}</span>`
          : v >= m.target ? `<button class="btn small go" data-mission="${m.id}">Claim +${m.bonus}</button>` : '';
        return `<div class="row" style="gap:0;align-items:center">${missionRow(m, v)}<span style="margin-left:auto">${btn}</span></div>`;
      }).join('')}<p class="faint">MPP checks mission claims before adding points, usually within a day.</p></div></section>
    <section class="section"><div class="head"><h2>Badges</h2></div><div class="awards">${badges(app).map(([got, ic, label]) => `<div class="award ${got ? 'got' : ''}">${icon(ic)}${esc(label)}</div>`).join('')}</div></section>
    <section class="section"><div class="card row"><span class="tile-icon mint">${icon('hand-heart')}</span><div style="flex:1"><h3>Give to the welfare fund</h3><p class="faint">Points you donate support UM students in need.</p></div><a class="btn small" href="#/community">Donate</a></div></section>`;
}
function badges(app) {
  const c = confirmed(app.txs); const ids = new Set(app.ledger.map((l) => l.id));
  return [
    [c.length >= 1, 'circle-check', 'First cashless buy'], [new Set(c.map((t) => t.merchantId)).size >= 3, 'compass', '3 merchants'],
    [streak(app.txs) >= 3, 'flame', '3-day streak'], [ids.has('survey'), 'target', 'Money check done'],
    [['lesson0', 'lesson1', 'lesson2'].every((x) => ids.has(x)), 'graduation-cap', 'All lessons'],
    [app.ledger.some((l) => l.type === 'donate'), 'hand-heart', 'Welfare donor'],
  ];
}
function rewardsMount(root, app) {
  $$('[data-redeem]', root).forEach((b) => {
    b.onclick = async () => {
      const r = (await D.listRewards(app.ctx)).find((x) => x.id === b.dataset.redeem);
      if (!(await confirmSheet(`Swap ${n(r.cost)} points for ${r.title}?`, `You’ll have ${n(app.profile.points - r.cost)} points left. The voucher is valid for ${r.validDays || 30} days.`, 'Swap points'))) return;
      try { const vid = await D.redeemReward(app.ctx, r); confetti(); toast('Voucher added. Show it at the counter.'); await app.render(); showVoucher(app, vid); }
      catch (e) { toast(errText(e), true); }
    };
  });
  $$('[data-mission]', root).forEach((b) => {
    b.onclick = () => busy(b, async () => {
      const m = D.MISSIONS.find((x) => x.id === b.dataset.mission); const prog = D.missionProgress(app.txs);
      try { await D.claimMission(app.ctx, m, prog.week, prog[m.id]); toast('Claim sent to MPP.'); app.render(); } catch (e) { toast(errText(e), true); }
    });
  });
  const unsub = D.watchMyVouchers(app.ctx, (vs) => {
    const el = $('#vouchers', root); if (!el) return;
    vs.sort((a, b) => (toMs(b.createdAt) || 0) - (toMs(a.createdAt) || 0));
    el.innerHTML = vs.map((v) => `<button class="ticket ${v.status === 'used' ? 'used' : ''}" data-voucher="${esc(v.id)}" style="text-align:left;cursor:pointer;width:100%;font:inherit;padding:0">
      <span class="stub">${icon('ticket')}</span><span class="body"><h3>${esc(v.title)}</h3><p class="faint">${v.status === 'used' ? `Used ${fmtDate(v.usedAt)}` : `Code ${esc(v.code)} · tap to show`}</p></span></button>`).join('')
      || `<div class="card empty">${icon('ticket')}<p>Vouchers you swap points for appear here.</p></div>`;
    $$('[data-voucher]', el).forEach((b) => { b.onclick = () => showVoucher(app, b.dataset.voucher, vs); });
  }, () => {});
  return unsub;
}
function showVoucher(app, vid, list) {
  const v = list ? list.find((x) => x.id === vid) : null;
  const el = sheet(`<div class="qr-stage"><h2>${esc(v ? v.title : 'Your voucher')}</h2>
    <p class="muted">${v && v.status === 'used' ? 'This voucher has been used.' : v && !v.merchantId ? 'Show this to MPP at the welfare counter to collect.' : 'Show this to the cashier. They scan it to apply the discount.'}</p>
    <div class="qr-frame ${v && v.status === 'used' ? 'dead' : ''}"><div id="vqr"></div></div><p>Code <span class="code-text">${esc(vid.slice(0, 8).toUpperCase())}</span></p></div>`);
  renderQR($('#vqr', el), 'UMV1:' + vid, 240);
}

// ------------------------------------------------------------- deals
async function dealsRender(app) {
  const [deals, merchants] = await Promise.all([D.approvedDeals(app.ctx), D.listVerifiedMerchants(app.ctx)]);
  const uses = await Promise.all(deals.map((d) => D.dealUsesToday(app.ctx, d.id).catch(() => 0)));
  const claim = activeClaim();
  const cards = deals.map((d, i) => {
    const m = merchants.find((x) => x.id === d.merchantId); const st = D.dealStatus(d, m, uses[i]);
    const mine = claim && claim.dealId === d.id;
    return `<div class="card"><div class="row between"><span class="badge ${st === 'Available' ? 'ok' : 'grey'}">${esc(st)}</span><b style="color:#00783A">+${d.bonus} pts</b></div>
      <h3 style="margin-top:10px">${esc(d.title)}</h3><p class="faint">${esc(m ? m.name : d.merchantName)} · ${D.hhmm(d.startMin)}–${D.hhmm(d.endMin)} · spend ${rm(d.minSpendCents)}+ · ${Math.max(0, d.limit - uses[i])} left today</p>
      ${m && m.seats ? `<div class="row" style="margin-top:8px;gap:8px"><span class="faint">Seats taken</span><div class="progress" style="flex:1"><i style="width:${Math.round((m.occupied / m.seats) * 100)}%"></i></div><span class="faint">${m.occupied}/${m.seats}</span></div>` : ''}
      <div class="row" style="margin-top:12px">${mine ? `<a class="btn primary small" href="#/pay/${esc(d.merchantId)}">Claimed: pay, then show code</a>`
        : `<button class="btn small ${st === 'Available' ? 'primary' : ''}" data-claim="${esc(d.id)}" data-m="${esc(d.merchantId)}" ${st === 'Available' ? '' : 'disabled'}>Claim for 20 minutes</button>`}</div></div>`;
  }).join('');
  return `<a class="back" href="#/home">${icon('arrow-left')} Home</a><div class="page-title"><h1>Quiet-hour deals</h1>
    <p>Extra points when a café has free seats. Claim, pay within 20 minutes, then show your code. One bonus per deal per day.</p></div>
    <div class="stack">${cards || `<div class="card empty">${icon('clock')}<p>No quiet-hour deals right now. Merchants add them for their off-peak hours.</p></div>`}</div>`;
}
function dealsMount(root, app) {
  $$('[data-claim]', root).forEach((b) => {
    b.onclick = () => { localStorage.setItem(CLAIM_KEY, JSON.stringify({ dealId: b.dataset.claim, merchantId: b.dataset.m, expires: Date.now() + 20 * 60000 }));
      toast('Deal claimed for 20 minutes. Pay, then show your code.'); app.go('pay/' + b.dataset.m); };
  });
}

// ------------------------------------------------------------- learn
async function learnRender(app) {
  const done = new Set(app.ledger.map((l) => l.id));
  return `<a class="back" href="#/home">${icon('arrow-left')} Home</a><div class="page-title"><h1>Learn and earn</h1>
    <p>One-minute lessons on paying safely. Answer correctly to earn ${app.rules.lessonBonus} points each, once.</p></div>
    <div class="stack">${D.LESSONS.map((l, i) => `<div class="card row" style="gap:14px"><span class="tile-icon ${done.has('lesson' + i) ? 'mint' : ''}">${icon(done.has('lesson' + i) ? 'circle-check' : l.icon)}</span>
      <div style="flex:1"><h3>${esc(l.title)}</h3><p class="faint">${done.has('lesson' + i) ? 'Completed' : `1 question · +${app.rules.lessonBonus} points`}</p></div>
      <button class="btn small ${done.has('lesson' + i) ? '' : 'primary'}" data-lesson="${i}" ${done.has('lesson' + i) ? 'disabled' : ''}>${done.has('lesson' + i) ? 'Done' : 'Start'}</button></div>`).join('')}</div>
    <div class="card row" style="margin-top:16px"><span class="tile-icon orange">${icon('target')}</span><div style="flex:1"><h3>Money check</h3><p class="faint">See where you stand on payment safety and budgeting.</p></div><a class="btn small" href="#/survey">Open</a></div>`;
}
function learnMount(root, app) {
  $$('[data-lesson]', root).forEach((b) => {
    b.onclick = () => {
      const i = +b.dataset.lesson; const l = D.LESSONS[i];
      const el = sheet(`<h2>${esc(l.title)}</h2><p class="muted">${esc(l.q)}</p><div class="stack" style="margin-top:16px">${l.options.map((o, j) => `<button class="btn block" style="white-space:normal;height:auto;padding:12px 16px;text-align:left;justify-content:flex-start" data-a="${j}">${esc(o)}</button>`).join('')}</div><p id="fb" class="faint" style="margin-top:12px"></p>`);
      $$('[data-a]', el).forEach((a) => {
        a.onclick = () => busy(a, async () => {
          const r = await D.answerLesson(app.ctx, i, +a.dataset.a, app.rules).catch((e) => { toast(errText(e), true); return null; });
          if (r === 'correct') { closeSheet(); confetti(); toast(`Correct. +${app.rules.lessonBonus} points`); app.render(); }
          else if (r === 'done') { closeSheet(); toast('You’ve already earned points for this lesson.'); }
          else if (r === 'wrong') { a.classList.add('warn'); $('#fb', el).textContent = 'Not quite. Think about what keeps your money safe, then try again.'; }
        });
      });
    };
  });
}

// ------------------------------------------------------------- survey (students and merchants share it)
export function surveyHTML(role, existing) {
  const q = (name, text, answers) => `<fieldset class="card" style="border:1px solid var(--line)"><legend style="font-weight:700;padding:0 4px">${esc(text)}</legend>
    <div class="stack" style="gap:4px;margin-top:6px">${answers.map((a, i) => `<label class="check" style="padding:6px 0"><input type="radio" name="${name}" value="${i}" required> ${esc(a)}</label>`).join('')}</div></fieldset>`;
  return `${existing ? `<div class="card row" style="gap:16px"><span style="font-size:44px;font-weight:800;color:var(--blue)">${esc(existing.grade)}</span><div><h3>Your last result: ${existing.score}/100</h3>
      <p class="faint">Knowledge ${existing.knowledge}% · Digital confidence ${existing.digital}%</p></div></div>` : ''}
    <form id="survey" class="stack" style="margin-top:16px">
      ${D.SURVEY_KNOWLEDGE.map(([t, a], i) => q('k' + i, t, a)).join('')}
      ${D.SURVEY_DIGITAL[role].map(([t, a], i) => q('d' + i, t, a)).join('')}
      <button class="btn primary block">${existing ? 'Update my answers' : 'See my result'}</button></form>`;
}
export function surveyResultText(role, r) {
  const st = { A: 'Confident and ready', B: 'Nearly there', C: 'Some support will help', D: 'Start with the basics' }[r.grade];
  const tip = role === 'student' ? (r.knowledge < 75 ? 'Try the Learn and earn lessons next.' : 'You’re set. Find a merchant and start earning.')
    : (r.digital < 70 ? 'Ask an ambassador to help set up your business QR and train staff.' : 'Finish the staff checklist and create a quiet-hour deal.');
  return { title: `${r.grade}: ${st}`, tip };
}
async function surveyRender(app) {
  const existing = await D.getSurvey(app.ctx).catch(() => null);
  return `<a class="back" href="#/home">${icon('arrow-left')} Home</a><div class="page-title"><h1>Money check</h1>
    <p>Four scenario questions and three about your confidence. It helps MPP plan support; it isn’t a test. First completion: ${app.rules.surveyBonus} points.</p></div>${surveyHTML('student', existing)}`;
}
export function surveyMount(root, app, role, back) {
  $('#survey', root).onsubmit = (e) => {
    e.preventDefault(); const answers = {};
    for (const [k, v] of new FormData(e.target)) answers[k] = +v;
    busy($('button', e.target), async () => {
      try {
        const r = D.scoreSurvey(role, answers); const bonus = await D.submitSurvey(app.ctx, r, app.rules);
        const t = surveyResultText(role, r); if (bonus) confetti();
        sheet(`<h2>${esc(t.title)}</h2><p class="muted">Knowledge ${r.knowledge}% · Digital confidence ${r.digital}%. ${esc(t.tip)}</p>${bonus ? `<p class="badge ok" style="margin-top:12px">+${bonus} points</p>` : ''}
          <div class="row end" style="margin-top:16px"><a class="btn primary" href="#/${back}" data-close>Continue</a></div>`);
      } catch (err) { toast(errText(err), true); }
    });
  };
}

// ------------------------------------------------------------- community: welfare, leaderboard, events
async function communityRender(app) {
  const camps = (await D.listCampaigns(app.ctx).catch(() => [])).filter((c) => !c.end || c.end >= D.dayKey()).sort((a, b) => String(a.start).localeCompare(String(b.start)));
  return `<div class="page-title"><h1>Campus together</h1><p>Your purchases count for ${esc(D.COLLEGES.find(([k]) => k === app.profile.college)?.[1] || 'your college')}.</p></div>
    <section class="card pad-lg"><div class="row between"><h2>College leaderboard</h2><span class="faint">Confirmed purchases</span></div><div id="lb" style="margin-top:10px"><div class="skeleton" style="height:120px"></div></div></section>
    <section class="section"><div class="card pad-lg" style="background:var(--ink);color:#fff;border:0;position:relative;overflow:hidden">${chevron('#00D669', 14, 'style="position:absolute;right:-90px;top:-40px;width:240px;height:240px"')}
      <h2>Student welfare fund</h2><p style="color:#C9D4E3;margin-top:6px;max-width:42ch">Points given here are pooled for UM students who need help with essentials.</p>
      <div style="font-size:44px;font-weight:800;letter-spacing:-0.03em;margin-top:12px" id="welfare">—</div><p style="color:#C9D4E3">points given so far</p>
      <button class="btn" style="margin-top:14px" id="donate">${icon('hand-heart')} Give points</button></div></section>
    <section class="section"><div class="head"><h2>Happening on campus</h2></div><div class="stack">${camps.map((c) => `<div class="card"><span class="badge">${esc(c.start ? fmtDate(Date.parse(c.start)) : '')}${c.end ? ' – ' + esc(fmtDate(Date.parse(c.end))) : ''}</span>
      <h3 style="margin-top:8px">${esc(c.name)}</h3><p class="muted" style="font-size:14px">${esc(c.description || '')}</p>${c.location ? `<p class="faint">${icon('map-pin')} ${esc(c.location)}</p>` : ''}</div>`).join('')
      || `<div class="card empty">${icon('calendar')}<p>No events listed right now.</p></div>`}</div></section>`;
}
function communityMount(root, app) {
  const u1 = D.watchStats(app.ctx, 'campus', (s) => {
    const el = $('#lb', root); if (!el || !s) return;
    const rows = Object.entries(s.colleges || {}).sort((a, b) => b[1] - a[1]); const max = Math.max(1, ...rows.map((r) => r[1]));
    el.innerHTML = rows.slice(0, 8).map(([k, v], i) => `<div class="lb-row ${k === app.profile.college ? 'me' : ''}"><span class="rank">${i + 1}</span>
      <div><span class="name">${esc(D.COLLEGES.find(([c]) => c === k)?.[1] || k)}</span><div class="bar"><i style="width:${Math.round((v / max) * 100)}%"></i></div></div><b class="num">${n(v)}</b></div>`).join('')
      || '<p class="faint">No purchases yet. Yours could put your college first.</p>';
  }, () => {});
  const u2 = D.watchStats(app.ctx, 'welfare', (s) => { const el = $('#welfare', root); if (el && s) countUp(el, s.points || 0); }, () => {});
  $('#donate', root).onclick = () => {
    const el = sheet(`<h2>Give points to the welfare fund</h2><p class="muted">You have ${n(app.profile.points)} points.</p>
      <form id="don" class="stack" style="margin-top:14px"><div class="chips">${[20, 50, 100, 250].map((v) => `<button type="button" data-v="${v}">${v}</button>`).join('')}</div>
      <label class="field">Points to give<input name="pts" type="number" min="1" max="${app.profile.points}" step="1" required value="${Math.min(50, app.profile.points)}"></label>
      <button class="btn go block">Give points</button></form>`);
    $$('[data-v]', el).forEach((b) => { b.onclick = () => { el.querySelector('[name=pts]').value = b.dataset.v; }; });
    $('#don', el).onsubmit = (e) => {
      e.preventDefault(); const v = Math.floor(+e.target.pts.value);
      if (!v || v < 1) return; if (v > app.profile.points) return toast('You don’t have that many points.', true);
      busy($('button.go', el), async () => { try { await D.donatePoints(app.ctx, v); closeSheet(); confetti(); toast(`Thank you. ${v} points given.`); } catch (err) { toast(errText(err), true); } });
    };
  };
  return () => { u1(); u2(); };
}

// ------------------------------------------------------------- spending
async function spendingRender(app) {
  const c = confirmed(app.txs); const wk = D.weekKey();
  const week = c.filter((t) => D.weekKey(toMs(t.confirmedAt)) === wk);
  const spent = week.reduce((s, t) => s + t.cents, 0); const goal = app.profile.goalCents || 15000;
  const mondayMs = Date.parse(wk + 'T00:00:00+08:00');
  const days = Array.from({ length: 7 }, (_, i) => D.dayKey(mondayMs + i * 86400000));
  const perDay = days.map((d) => week.filter((t) => D.dayKey(toMs(t.confirmedAt)) === d).reduce((s, t) => s + t.cents, 0) / 100);
  const pct = Math.min(100, Math.round((spent / goal) * 100));
  return `<a class="back" href="#/home">${icon('arrow-left')} Home</a><div class="page-title"><h1>My spending</h1><p>Built from purchases you recorded with UM Connect+, not your full bank balance.</p></div>
    <div class="card pad-lg"><div class="row between"><div><p class="faint">This week</p><div style="font-size:34px;font-weight:800;letter-spacing:-0.03em" class="num">${rm(spent)}</div></div>
      <button class="btn small" id="goal">${icon('pencil')} Goal ${rm(goal)}</button></div>
      <div class="progress" style="margin-top:12px"><i style="width:${pct}%;${pct >= 100 ? 'background:var(--orange)' : ''}"></i></div>
      <p class="faint" style="margin-top:8px">${spent > goal ? `${rm(spent - goal)} over your weekly goal.` : `${rm(goal - spent)} left this week.`}</p>
      <div style="margin-top:16px">${barChart(perDay, ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'], { highlight: days.indexOf(D.dayKey()), fmt: (v) => 'RM' + v.toFixed(0) })}</div></div>
    <section class="section"><div class="head"><h2>All purchases</h2><span class="faint">${c.length} confirmed</span></div>
      <div class="card list">${c.map(txRow).join('') || `<div class="empty">${icon('receipt')}<p>No purchases yet.</p></div>`}</div></section>`;
}
function spendingMount(root, app) {
  $('#goal', root).onclick = () => {
    const el = sheet(`<h2>Weekly spending goal</h2><form id="g" class="stack" style="margin-top:12px"><label class="field">Goal (RM)<input name="g" type="number" min="1" step="1" required value="${(app.profile.goalCents || 15000) / 100}"></label><button class="btn primary">Save goal</button></form>`);
    $('#g', el).onsubmit = (e) => { e.preventDefault(); busy($('button', el), async () => { await D.updateProfile(app.ctx, { goalCents: Math.round(+e.target.g.value * 100) }); closeSheet(); toast('Goal saved.'); app.render(); }); };
  };
}

// ------------------------------------------------------------- me: profile, referrals, points history
async function meRender(app) {
  const p = app.profile; const refs = await D.myReferrals(app.ctx).catch(() => []);
  const claimed = new Set(app.ledger.map((l) => l.id));
  const capLeft = app.rules.referralCap - (p.refMonth === D.monthKey() ? p.refCount || 0 : 0);
  return `<div class="page-title"><h1>${esc(p.name)}</h1><p>${esc(p.email)} · ${esc(D.COLLEGES.find(([k]) => k === p.college)?.[1] || '')}</p></div>
    <section class="card pad-lg"><h2>Invite friends</h2><p class="muted" style="margin-top:6px">When a friend signs up with your code and makes their first cashless purchase, you get ${app.rules.referrerBonus} points and they get ${app.rules.friendBonus}.</p>
      <div class="row" style="margin-top:14px"><span class="code-text" style="font-size:20px;font-weight:800">${esc(p.referralCode)}</span><button class="btn small" id="share">${icon('share-2')} Share</button></div>
      <div class="list" style="margin-top:10px">${refs.map((r) => `<div class="item"><span class="tile-icon">${icon('user-plus')}</span><div class="grow"><h3>${esc(r.friendName)}</h3><p>${r.qualified ? 'Made a first purchase' : 'Hasn’t made a purchase yet'}</p></div>
        ${claimed.has('ref_' + r.id) ? '<span class="badge ok">Points added</span>' : r.qualified ? `<button class="btn small go" data-ref="${esc(r.id)}" ${capLeft > 0 ? '' : 'disabled'}>Claim +${app.rules.referrerBonus}</button>` : '<span class="badge grey">Waiting</span>'}</div>`).join('')}</div>
      ${capLeft <= 0 ? `<p class="faint">You’ve reached this month’s limit of ${app.rules.referralCap} referral bonuses.</p>` : ''}
      ${!p.inviterUid && !p.firstTx ? `<form id="inv" class="row" style="margin-top:14px;flex-wrap:nowrap"><input name="code" placeholder="Friend’s code, e.g. AINA-7K2Q" required aria-label="Friend’s referral code"><button class="btn">Add</button></form>` : p.inviterCode ? `<p class="faint" style="margin-top:12px">You joined with code ${esc(p.inviterCode)}.</p>` : ''}
    </section>
    <section class="section"><div class="head"><h2>Profile</h2></div><form id="prof" class="card stack">
      <label class="field">Name<input name="name" required minlength="2" value="${esc(p.name)}"></label>
      <label class="field">Matric number<input value="${esc(p.matric || '')}" readonly aria-readonly="true"><small>Contact MPP if this is wrong.</small></label>
      <label class="field">Residential college<select name="college">${D.COLLEGES.map(([k, v]) => `<option value="${k}" ${k === p.college ? 'selected' : ''}>${esc(v)}</option>`).join('')}</select></label>
      <label class="field">Faculty<select name="faculty">${D.FACULTIES.map((f) => `<option ${f === p.faculty ? 'selected' : ''}>${esc(f)}</option>`).join('')}</select></label>
      <button class="btn primary">Save profile</button></form></section>
    <section class="section"><div class="head"><h2>Points history</h2></div><div class="card list">${app.ledger.slice(0, 30).map((l) => `<div class="item"><div class="grow"><h3>${esc(ledgerLabel(l))}</h3><p>${fmtDateTime(l.createdAt)}</p></div>
      <b class="num" style="color:${l.delta >= 0 ? '#00783A' : 'var(--ink-2)'}">${l.delta >= 0 ? '+' : ''}${n(l.delta)}</b></div>`).join('') || `<div class="empty">${icon('sparkles')}<p>Points you earn and spend appear here.</p></div>`}</div></section>
    <section class="section stack"><button class="btn block" id="install">${icon('smartphone')} Install the app</button><a class="btn block" href="#/survey">Money check</a>
      <button class="btn block warn" id="out">${icon('log-out')} Sign out</button></section>`;
}
function ledgerLabel(l) {
  return { purchase: 'Cashless purchase', survey: 'Money check completed', lesson: 'Lesson completed', friend: 'Referral welcome bonus', inviter: 'Friend joined with your code',
    offpeak: 'Quiet-hour bonus', redeem: 'Swapped for a voucher', donate: 'Given to the welfare fund', adjust: l.note || 'Adjustment by MPP' }[l.type] || l.type;
}
function meMount(root, app) {
  $('#share', root).onclick = async () => {
    const text = `Join UM Connect+ and earn points for paying cashless on campus. Use my code ${app.profile.referralCode} for a welcome bonus: ${location.origin}${location.pathname}`;
    try { if (navigator.share) await navigator.share({ text }); else { await navigator.clipboard.writeText(text); toast('Invite copied. Paste it to a friend.'); } } catch { /* cancelled */ }
  };
  $$('[data-ref]', root).forEach((b) => { b.onclick = () => busy(b, async () => { try { await D.claimInviterBonus(app.ctx, b.dataset.ref, app.rules); confetti(); toast(`+${app.rules.referrerBonus} points`); app.render(); } catch (e) { toast(errText(e), true); } }); });
  if ($('#inv', root)) $('#inv', root).onsubmit = (e) => { e.preventDefault(); busy($('button', e.target), async () => { try { await D.applyInviterCode(app.ctx, e.target.code.value); toast('Code added. Your bonus arrives after your first purchase.'); app.render(); } catch (err) { toast(err.code ? errText(err) : err.message, true); } }); };
  $('#prof', root).onsubmit = (e) => {
    e.preventDefault(); const f = e.target;
    busy($('button', f), async () => { try { await D.updateProfile(app.ctx, { name: f.name.value.trim(), college: f.college.value, faculty: f.faculty.value }); toast('Profile saved.'); } catch (err) { toast(errText(err), true); } });
  };
  $('#install', root).onclick = () => app.installApp();
  $('#out', root).onclick = () => app.backend.sdk.signOut(app.backend.auth);
}

// ------------------------------------------------------------- routes
const live = (fn) => (root, app, params) => {
  const c1 = fn ? fn(root, app, params) : null;
  let t; const off = app.on((topic) => { if (topic === 'txs' || topic === 'ledger') { clearTimeout(t); t = setTimeout(() => { if (!document.querySelector('#sheet[open]') && !root.contains(document.activeElement)) app.render(); }, 400); } });
  return () => { off(); clearTimeout(t); c1 && c1(); };
};
export const routes = {
  home: { title: 'Home', render: homeRender, mount: live() },
  explore: { title: 'Explore', render: exploreRender, mount: exploreMount },
  merchant: { title: 'Merchant', render: merchantRender, tab: 'explore' },
  cafes: { title: 'Campus cafés', render: cafesRender, tab: 'explore' },
  pay: { title: 'Pay and earn', render: payRender, mount: payMount },
  rewards: { title: 'Rewards', render: rewardsRender, mount: rewardsMount },
  deals: { title: 'Quiet-hour deals', render: dealsRender, mount: dealsMount, tab: 'home' },
  learn: { title: 'Learn and earn', render: learnRender, mount: learnMount, tab: 'home' },
  survey: { title: 'Money check', render: surveyRender, mount: (r, a) => surveyMount(r, a, 'student', 'home'), tab: 'home' },
  community: { title: 'Community', render: communityRender, mount: communityMount, tab: 'home' },
  spending: { title: 'My spending', render: spendingRender, mount: spendingMount, tab: 'home' },
  me: { title: 'Me', render: meRender, mount: meMount },
};
