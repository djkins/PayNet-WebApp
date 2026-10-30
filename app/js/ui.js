// Small UI toolkit: escaping, formatting, sheets, toasts, QR, camera scanning, confetti, files.
import { icon } from './icons.js';
export { icon };

export const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
export const $ = (s, el = document) => el.querySelector(s);
export const $$ = (s, el = document) => [...el.querySelectorAll(s)];
export const rm = (cents) => 'RM' + (Number(cents || 0) / 100).toFixed(2);
export const n = (x) => Number(x || 0).toLocaleString('en-MY');
const ms = (t) => (t == null ? null : typeof t === 'number' ? t : t.toMillis ? t.toMillis() : null);
export const fmtDate = (t, opts = { day: 'numeric', month: 'short' }) => { const m = ms(t); return m ? new Date(m).toLocaleDateString('en-MY', { timeZone: 'Asia/Kuala_Lumpur', ...opts }) : '—'; };
export const fmtTime = (t) => { const m = ms(t); return m ? new Date(m).toLocaleTimeString('en-MY', { timeZone: 'Asia/Kuala_Lumpur', hour: 'numeric', minute: '2-digit' }) : '—'; };
export const fmtDateTime = (t) => (ms(t) ? `${fmtDate(t)}, ${fmtTime(t)}` : '—');
export function timeAgo(t) {
  const m = ms(t); if (!m) return 'just now';
  const s = Math.max(0, (Date.now() - m) / 1000);
  if (s < 60) return 'just now'; if (s < 3600) return `${Math.floor(s / 60)} min ago`;
  if (s < 86400) return `${Math.floor(s / 3600)} h ago`; return fmtDate(t);
}
export const initials = (name) => String(name || '?').split(/\s+/).filter(Boolean).slice(0, 2).map((w) => w[0]).join('').toUpperCase();
const PALETTE = ['#258DCE', '#00A547', '#F4A019', '#0E1A2B', '#29B6F6', '#7A5AF8', '#D93A3F'];
export const colorFor = (s) => PALETTE[[...String(s)].reduce((a, c) => a + c.charCodeAt(0), 0) % PALETTE.length];

export function errText(e) {
  const c = e && e.code;
  const map = {
    'permission-denied': 'That action isn’t allowed for your account. If you think it should be, ask MPP.',
    'auth/invalid-credential': 'Email or password is incorrect.', 'auth/wrong-password': 'Email or password is incorrect.',
    'auth/user-not-found': 'No account uses that email.', 'auth/email-already-in-use': 'An account already uses that email. Sign in instead.',
    'auth/weak-password': 'Use at least 6 characters for your password.', 'auth/invalid-email': 'Enter a valid email address.',
    'auth/too-many-requests': 'Too many attempts. Wait a minute and try again.', 'auth/network-request-failed': 'No connection. Check your internet and try again.',
    unavailable: 'You’re offline. Reconnect and try again.', 'not-found': 'That record no longer exists.',
  };
  return map[c] || (e && e.message) || 'Something went wrong. Try again.';
}

// ------------------------------------------------------------- toast
let toastTimer;
export function toast(msg, bad = false) {
  let el = $('#toast');
  if (!el) { el = document.createElement('div'); el.id = 'toast'; el.className = 'toast'; el.setAttribute('role', 'status'); document.body.append(el); }
  el.textContent = msg; el.classList.toggle('bad', bad); el.classList.add('show');
  clearTimeout(toastTimer); toastTimer = setTimeout(() => el.classList.remove('show'), 3600);
}

// ------------------------------------------------------------- sheet (modal)
let sheetCleanup = [];
export function sheet(html, { onClose, wide } = {}) {
  let d = $('#sheet');
  if (!d) {
    d = document.createElement('dialog'); d.id = 'sheet'; d.className = 'sheet';
    d.innerHTML = '<button class="close" aria-label="Close" data-close>' + icon('x') + '</button><div class="sheet-body"></div>';
    document.body.append(d);
    d.addEventListener('click', (e) => { if (e.target === d || e.target.closest('[data-close]')) closeSheet(); });
    d.addEventListener('close', () => { sheetCleanup.forEach((f) => { try { f(); } catch { /* */ } }); sheetCleanup = []; });
  }
  sheetCleanup.forEach((f) => { try { f(); } catch { /* */ } }); sheetCleanup = [];
  if (onClose) sheetCleanup.push(onClose);
  d.style.width = wide ? 'min(760px, 100vw)' : '';
  $('.sheet-body', d).innerHTML = html;
  if (!d.open) d.showModal();
  $('.sheet-body', d).scrollTop = 0;
  return $('.sheet-body', d);
}
export const onSheetClose = (f) => sheetCleanup.push(f);
export function closeSheet() { const d = $('#sheet'); if (d && d.open) d.close(); }
export const sheetOpen = () => !!($('#sheet') && $('#sheet').open);
export function confirmSheet(title, body, okLabel = 'Confirm', danger = false) {
  return new Promise((resolve) => {
    let done = false;
    const el = sheet(`<h2>${esc(title)}</h2><p class="muted">${body}</p><div class="row end" style="margin-top:20px">
      <button class="btn" data-no>Cancel</button><button class="btn ${danger ? 'warn' : 'primary'}" data-yes>${esc(okLabel)}</button></div>`,
    { onClose: () => { if (!done) resolve(false); } });
    $('[data-no]', el).onclick = () => { done = true; resolve(false); closeSheet(); };
    $('[data-yes]', el).onclick = () => { done = true; resolve(true); closeSheet(); };
  });
}

// busy-state wrapper for buttons/forms
export async function busy(btn, fn) {
  if (!btn) return fn();
  const label = btn.innerHTML; btn.disabled = true; btn.innerHTML = '<span class="spin"></span>' + label;
  try { return await fn(); } finally { btn.disabled = false; btn.innerHTML = label; }
}

// ------------------------------------------------------------- count-up for points
export function countUp(el, to, dur = 700) {
  const from = Number(el.dataset.v ?? el.textContent.replace(/[^\d-]/g, '')) || 0;
  el.dataset.v = to;
  if (from === to || matchMedia('(prefers-reduced-motion: reduce)').matches) { el.textContent = n(to); return; }
  const t0 = performance.now();
  const step = (t) => { const p = Math.min(1, (t - t0) / dur); const e = 1 - Math.pow(1 - p, 3); el.textContent = n(Math.round(from + (to - from) * e)); if (p < 1) requestAnimationFrame(step); };
  requestAnimationFrame(step);
}

// ------------------------------------------------------------- confetti (one celebratory moment: points earned)
export function confetti() {
  if (matchMedia('(prefers-reduced-motion: reduce)').matches) return;
  const c = document.createElement('canvas'); c.className = 'confetti'; document.body.append(c);
  const ctx = c.getContext('2d'); const dpr = devicePixelRatio || 1;
  c.width = innerWidth * dpr; c.height = innerHeight * dpr; ctx.scale(dpr, dpr);
  const colors = ['#00D669', '#29B6F6', '#258DCE', '#FFCA28', '#F4A019', '#00A547'];
  const parts = Array.from({ length: 140 }, () => ({ x: innerWidth / 2 + (Math.random() - 0.5) * 80, y: innerHeight * 0.45,
    vx: (Math.random() - 0.5) * 14, vy: -Math.random() * 15 - 4, r: Math.random() * 6 + 4, a: Math.random() * 6, va: (Math.random() - 0.5) * 0.4,
    col: colors[Math.floor(Math.random() * colors.length)] }));
  const t0 = performance.now();
  const frame = (t) => {
    ctx.clearRect(0, 0, innerWidth, innerHeight);
    for (const p of parts) { p.vy += 0.42; p.vx *= 0.99; p.x += p.vx; p.y += p.vy; p.a += p.va;
      ctx.save(); ctx.translate(p.x, p.y); ctx.rotate(p.a); ctx.fillStyle = p.col; ctx.fillRect(-p.r / 2, -p.r / 4, p.r, p.r / 2); ctx.restore(); }
    if (t - t0 < 2600) requestAnimationFrame(frame); else c.remove();
  };
  requestAnimationFrame(frame);
}

// ------------------------------------------------------------- QR rendering (QRCode.js, vendored)
export function renderQR(el, text, size = 260) {
  el.innerHTML = '';
  // eslint-disable-next-line no-undef
  new QRCode(el, { text, width: size, height: size, colorDark: '#0E1A2B', colorLight: '#ffffff', correctLevel: QRCode.CorrectLevel.M });
}

// ------------------------------------------------------------- camera QR scanning (jsQR, vendored, loaded on demand)
let jsqrLoading = null;
function loadScript(src) { return new Promise((res, rej) => { const s = document.createElement('script'); s.src = src; s.onload = res; s.onerror = rej; document.head.append(s); }); }
export async function startScanner(videoEl, onCode, onStatus) {
  if (!window.jsQR) { jsqrLoading = jsqrLoading || loadScript('vendor/jsQR.js'); await jsqrLoading; }
  if (!navigator.mediaDevices?.getUserMedia) { onStatus('This browser can’t open the camera here. Type the code instead.'); return () => {}; }
  let stream, raf, alive = true;
  try {
    stream = await navigator.mediaDevices.getUserMedia({ video: { facingMode: { ideal: 'environment' }, width: { ideal: 720 } }, audio: false });
  } catch (e) {
    onStatus(e.name === 'NotAllowedError' ? 'Camera permission is blocked. Allow it in your browser settings, or type the code instead.' : 'No camera available. Type the code instead.');
    return () => {};
  }
  if (!alive) { stream.getTracks().forEach((t) => t.stop()); return () => {}; }
  videoEl.srcObject = stream; videoEl.setAttribute('playsinline', ''); videoEl.muted = true;
  await videoEl.play().catch(() => {});
  onStatus('Point the camera at the QR code.');
  const canvas = document.createElement('canvas'); const cx = canvas.getContext('2d', { willReadFrequently: true });
  let last = 0, lastCode = '';
  const tick = (t) => {
    if (!alive) return;
    if (videoEl.readyState >= 2 && t - last > 200) {
      last = t; const w = Math.min(640, videoEl.videoWidth); const h = Math.round((videoEl.videoHeight * w) / videoEl.videoWidth);
      if (w && h) {
        canvas.width = w; canvas.height = h; cx.drawImage(videoEl, 0, 0, w, h);
        const r = window.jsQR(cx.getImageData(0, 0, w, h).data, w, h, { inversionAttempts: 'attemptBoth' });
        if (r && r.data && r.data !== lastCode) { lastCode = r.data; setTimeout(() => { lastCode = ''; }, 2500); onCode(r.data); }
      }
    }
    raf = requestAnimationFrame(tick);
  };
  raf = requestAnimationFrame(tick);
  const stop = () => { alive = false; cancelAnimationFrame(raf); stream && stream.getTracks().forEach((t) => t.stop()); videoEl.srcObject = null; };
  return stop;
}

// ------------------------------------------------------------- images: compress a QR photo to fit Firestore
export function compressImage(file, maxSide = 900, quality = 0.82) {
  return new Promise((resolve, reject) => {
    const img = new Image(); const url = URL.createObjectURL(file);
    img.onload = () => {
      const scale = Math.min(1, maxSide / Math.max(img.width, img.height));
      const c = document.createElement('canvas'); c.width = Math.round(img.width * scale); c.height = Math.round(img.height * scale);
      const x = c.getContext('2d'); x.fillStyle = '#fff'; x.fillRect(0, 0, c.width, c.height); x.drawImage(img, 0, 0, c.width, c.height);
      URL.revokeObjectURL(url);
      let q = quality, out = c.toDataURL('image/jpeg', q);
      while (out.length > 600000 && q > 0.4) { q -= 0.1; out = c.toDataURL('image/jpeg', q); }
      resolve(out);
    };
    img.onerror = () => { URL.revokeObjectURL(url); reject(new Error('That file isn’t an image we can read. Upload a JPG or PNG photo of the QR.')); };
    img.src = url;
  });
}

// ------------------------------------------------------------- files
export function downloadCSV(name, rows) {
  const csv = rows.map((r) => r.map((v) => '"' + String(v ?? '').replaceAll('"', '""') + '"').join(',')).join('\r\n');
  downloadBlob(name, new Blob(['﻿' + csv], { type: 'text/csv;charset=utf-8' }));
}
export function downloadBlob(name, blob) {
  const a = document.createElement('a'); a.href = URL.createObjectURL(blob); a.download = name; document.body.append(a); a.click();
  setTimeout(() => { URL.revokeObjectURL(a.href); a.remove(); }, 1500);
}
let excelLoading = null;
export async function loadExcel() { if (!window.ExcelJS) { excelLoading = excelLoading || loadScript('vendor/exceljs.min.js'); await excelLoading; } return window.ExcelJS; }
export function parseCSV(text) {
  const rows = []; let row = [], cell = '', q = false;
  for (let i = 0; i < text.length; i++) {
    const c = text[i];
    if (q) { if (c === '"' && text[i + 1] === '"') { cell += '"'; i++; } else if (c === '"') q = false; else cell += c; }
    else if (c === '"') q = true; else if (c === ',') { row.push(cell); cell = ''; }
    else if (c === '\n') { row.push(cell); rows.push(row); row = []; cell = ''; } else if (c !== '\r') cell += c;
  }
  if (cell || row.length) { row.push(cell); rows.push(row); }
  return rows.filter((r) => r.some((x) => x.trim()));
}

// ------------------------------------------------------------- charts
export function barChart(values, labels, { highlight = -1, fmt = (v) => v } = {}) {
  const max = Math.max(1, ...values);
  return `<div class="bars" role="img" aria-label="${esc(labels.map((l, i) => `${l}: ${fmt(values[i])}`).join(', '))}">${values.map((v, i) => `
    <div class="b ${i === highlight ? 'hi' : ''}"><div class="col" style="height:${Math.round((v / max) * 100)}%"></div>
    <span class="v">${v ? esc(fmt(v)) : ''}</span><small>${esc(labels[i])}</small></div>`).join('')}</div>`;
}

// PayNet-style rounded chevron outline, used as the one decorative motif.
export const chevron = (stroke = '#fff', w = 18, extra = '') => `<svg class="chev" ${extra} viewBox="0 0 300 300" fill="none" aria-hidden="true">
  <path d="M40 30 H170 Q190 30 203 46 L262 132 Q274 150 262 168 L203 254 Q190 270 170 270 H40" stroke="${stroke}" stroke-width="${w}" stroke-linecap="round" stroke-linejoin="round" opacity=".55"/>
  <path d="M10 70 H140 Q155 70 165 82 L208 140 Q216 150 208 160 L165 218 Q155 230 140 230 H10" stroke="${stroke}" stroke-width="${w * 0.6}" stroke-linecap="round" stroke-linejoin="round" opacity=".35"/></svg>`;
