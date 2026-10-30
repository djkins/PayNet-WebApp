// Sign in, sign up, email verification and first-time profile.
import * as D from '../data.js';
import { $, $$, esc, icon, toast, busy, errText, chevron, sheet, closeSheet } from '../ui.js';
import { mppBootstrapEmails } from '../firebase-config.js';
const MPP_EMAIL = mppBootstrapEmails[0];

function frame(app, inner) {
  document.body.classList.remove('mpp-mode');
  document.body.innerHTML = `<div class="auth">
    <aside class="art">
      <a class="brand" style="color:#fff"><img src="icons/icon-192.png" alt=""><span>UM Connect<b>+</b></span></a>
      <div><h2>Pay cashless on campus. Get something back.</h2>
        <p>Pay any UM Connect+ merchant with DuitNow QR, show your code at the counter, and earn points for vouchers, missions and the student welfare fund.</p></div>
      <p class="faint" style="color:#8A9AB2">Universiti Malaya student council · PayNet Digital Campus 5.0</p>
      ${chevron('#29B6F6', 16)}
    </aside>
    <div class="form-side">${inner}</div></div>`;
  app.shellRole = null;
  if (app.addDemoRibbon) app.addDemoRibbon();
}

const GOOGLE_G = '<svg width="20" height="20" viewBox="0 0 48 48" aria-hidden="true"><path fill="#FFC107" d="M43.6 20.5H42V20H24v8h11.3C33.7 32.7 29.2 36 24 36c-6.6 0-12-5.4-12-12s5.4-12 12-12c3.1 0 5.8 1.2 7.9 3.1l5.7-5.7C34 6.1 29.3 4 24 4 12.9 4 4 12.9 4 24s8.9 20 20 20 20-8.9 20-20c0-1.3-.1-2.4-.4-3.5z"/><path fill="#FF3D00" d="M6.3 14.7l6.6 4.8C14.7 15.1 19 12 24 12c3.1 0 5.8 1.2 7.9 3.1l5.7-5.7C34 6.1 29.3 4 24 4 16.3 4 9.7 8.3 6.3 14.7z"/><path fill="#4CAF50" d="M24 44c5.2 0 9.9-2 13.4-5.2l-6.2-5.2C29.2 35.1 26.7 36 24 36c-5.2 0-9.6-3.3-11.3-8l-6.5 5C9.5 39.6 16.2 44 24 44z"/><path fill="#1976D2" d="M43.6 20.5H42V20H24v8h11.3c-.8 2.2-2.2 4.2-4.1 5.6l6.2 5.2C37 39.2 44 34 44 24c0-1.3-.1-2.4-.4-3.5z"/></svg>';

async function googleSignIn(app, demoEmail) {
  const { sdk, auth, mode } = app.backend;
  const provider = new sdk.GoogleAuthProvider();
  provider.setCustomParameters({ prompt: 'select_account' });
  if (mode === 'demo') provider.demoEmail = demoEmail;
  try {
    await sdk.signInWithPopup(auth, provider);
  } catch (err) {
    // Installed iPhone apps and some in-app browsers block popups: fall back to a full-page redirect.
    if (mode === 'live' && ['auth/popup-blocked', 'auth/operation-not-supported-in-environment', 'auth/web-storage-unsupported'].includes(err.code)) {
      return sdk.signInWithRedirect(auth, provider);
    }
    if (err.code === 'auth/popup-closed-by-user' || err.code === 'auth/cancelled-popup-request') return;
    if (err.code === 'auth/unauthorized-domain') return toast('This web address isn’t authorised for Google sign-in yet. Add it in Firebase > Authentication > Settings > Authorized domains.', true);
    if (err.code === 'auth/operation-not-allowed') return toast('Google sign-in isn’t switched on yet. Turn it on in Firebase > Authentication > Sign-in method.', true);
    if (err.code === 'auth/account-exists-with-different-credential') return toast('This email already has a password account. Sign in with email instead.', true);
    toast(errText(err), true);
  }
}

function demoGoogleChooser(app) {
  const el = sheet(`<h2>Choose a Google account</h2><p class="muted">Demo mode stands in for Google’s account picker. Live, this is Google’s own sign-in window.</p>
    <div class="stack" style="margin-top:14px">
      ${[['aina@siswa.um.edu.my', 'Aina Nadhirah', 'Student, has history'], ['kopikolej@demo.my', 'Kopi Kolej', 'Merchant'], [MPP_EMAIL, 'MPP admin', 'Dashboard']]
        .map(([e, n, d]) => `<button class="btn block" data-g="${e}" style="justify-content:flex-start;height:auto;padding:10px 16px;text-align:left;white-space:normal;min-width:0"><span class="avatar" style="width:32px;height:32px;flex:none">${esc(n[0])}</span><span><b>${esc(n)}</b><br><span class="faint">${esc(e)} · ${esc(d)}</span></span></button>`).join('')}
      <form id="gnew" class="stack"><label class="field">Or use another Gmail address<input name="email" type="email" required placeholder="you@gmail.com"></label><button class="btn primary">Continue</button></form>
    </div>`);
  $$('[data-g]', el).forEach((b) => { b.onclick = () => { closeSheet(); googleSignIn(app, b.dataset.g); }; });
  $('#gnew', el).onsubmit = (e) => { e.preventDefault(); const v = e.target.email.value; closeSheet(); googleSignIn(app, v); };
}

export function renderSignIn(app, mode = 'in', showEmail = false) {
  const demo = app.backend.mode === 'demo';
  frame(app, `
    <div><a class="brand"><img src="icons/icon-192.png" alt=""><span>UM Connect<b>+</b></span></a></div>
    <div><h1>Sign in to UM Connect+</h1>
      <p class="lede">Students and merchants both use their Google account. New here? Signing in creates your account.</p></div>
    <button class="btn block google-btn" id="google">${GOOGLE_G}<span>Continue with Google</span></button>
    <details id="email-box" ${showEmail ? 'open' : ''}><summary>Use email and password instead</summary>
      <div class="stack" style="margin-top:14px">
        <div class="seg" role="tablist"><button class="${mode === 'in' ? 'on' : ''}" data-mode="in">Sign in</button><button class="${mode === 'up' ? 'on' : ''}" data-mode="up">Create account</button></div>
        <form id="auth-form" class="stack">
          <label class="field">Email<input name="email" type="email" autocomplete="email" required></label>
          <label class="field">Password<input name="password" type="password" minlength="6" autocomplete="${mode === 'in' ? 'current-password' : 'new-password'}" required>
            ${mode === 'up' ? '<small>At least 6 characters. We’ll email you a link to verify the address.</small>' : ''}</label>
          <button class="btn primary block" type="submit">${mode === 'in' ? 'Sign in' : 'Create account'}</button>
          ${mode === 'in' ? '<button class="btn ghost block" type="button" id="forgot">Forgot your password?</button>' : ''}
        </form></div></details>
    ${demo ? `<div class="demo-box"><b>Demo mode</b><p class="faint">No Firebase project is connected, so data stays in this browser. Jump straight into a ready-made account:</p>
      <div class="row"><button class="btn small" data-demo="aina@siswa.um.edu.my">Student</button><button class="btn small" data-demo="kopikolej@demo.my">Merchant</button><button class="btn small" data-demo="${MPP_EMAIL}">MPP</button></div></div>` : ''}`);
  const { sdk, auth } = app.backend;
  $('#google').onclick = (e) => { if (demo) demoGoogleChooser(app); else busy(e.currentTarget, () => googleSignIn(app)); };
  $$('.seg [data-mode]').forEach((b) => { b.onclick = () => renderSignIn(app, b.dataset.mode, true); });
  $('#auth-form').onsubmit = (e) => {
    e.preventDefault(); const f = e.target; const btn = $('button[type=submit]', f);
    busy(btn, async () => {
      try {
        if (mode === 'in') await sdk.signInWithEmailAndPassword(auth, f.email.value.trim(), f.password.value);
        else {
          const cred = await sdk.createUserWithEmailAndPassword(auth, f.email.value.trim(), f.password.value);
          if (app.backend.mode === 'live') await sdk.sendEmailVerification(cred.user, { url: location.origin + location.pathname });
        }
      } catch (err) { toast(errText(err), true); }
    });
  };
  if ($('#forgot')) $('#forgot').onclick = async () => {
    const email = $('#auth-form').email.value.trim();
    if (!email) return toast('Type your email first, then tap “Forgot your password?”.');
    try { await sdk.sendPasswordResetEmail(auth, email); toast('Password reset email sent. Check your inbox.'); } catch (err) { toast(errText(err), true); }
  };
  $$('[data-demo]').forEach((b) => { b.onclick = () => googleSignIn(app, b.dataset.demo); });
}

export function renderVerify(app) {
  const { sdk, auth } = app.backend;
  frame(app, `<div><h1>Check your email</h1><p class="lede">We sent a verification link to <b>${esc(app.user.email)}</b>. Open it, then come back and tap “I’ve verified”.</p></div>
    <div class="stack"><button class="btn primary block" id="done">I’ve verified</button>
    <button class="btn block" id="resend">Send the link again</button><button class="btn ghost block" id="out">Use a different email</button></div>
    <p class="faint">Can’t find it? Check spam or promotions. UM student emails may take a few minutes.</p>`);
  $('#done').onclick = (e) => busy(e.currentTarget, async () => {
    await sdk.reload(auth.currentUser);
    if (!auth.currentUser.emailVerified) return toast('Not verified yet. Open the link in the email first.', true);
    await auth.currentUser.getIdToken(true); location.reload();
  });
  $('#resend').onclick = (e) => busy(e.currentTarget, async () => {
    try { await sdk.sendEmailVerification(auth.currentUser, { url: location.origin + location.pathname }); toast('Verification email sent.'); } catch (err) { toast(errText(err), true); }
  });
  $('#out').onclick = () => sdk.signOut(auth);
}

export function renderOnboarding(app, done) {
  const email = app.user.email || '';
  const looksStudent = /@((siswa\.)?um\.edu\.my|gmail\.com|googlemail\.com)$/i.test(email);
  frame(app, `<div><h1>Set up your profile</h1><p class="lede">Signed in as ${esc(email)}.</p></div>
    <form id="ob" class="stack">
      <div class="role-pick">
        <label><input type="radio" name="role" value="student" ${looksStudent ? 'checked' : ''}><span class="tile-icon">${icon('graduation-cap')}</span>
          <span><b>I’m a student</b><br><span class="faint">Earn points when you pay cashless on campus</span></span></label>
        <label><input type="radio" name="role" value="merchant" ${looksStudent ? '' : 'checked'}><span class="tile-icon orange">${icon('store')}</span>
          <span><b>I run a business or stall</b><br><span class="faint">Join the campus merchant list and confirm student purchases</span></span></label>
      </div>
      <label class="field">Your full name<input name="name" required minlength="2" autocomplete="name" value="${esc(app.user.displayName || '')}"></label>
      <div id="student-fields" class="stack">
        <label class="field">Matric number<input name="matric" autocomplete="off" placeholder="e.g. 23001234" pattern="[A-Za-z0-9]{5,15}" title="Letters and numbers only"><small>One account per matric number. You can’t change it later, so check it.</small></label>
        <label class="field">Residential college<select name="college">${D.COLLEGES.map(([k, v]) => `<option value="${k}">${esc(v)}</option>`).join('')}</select>
          <small>Your check-ins count towards your college on the leaderboard.</small></label>
        <label class="field">Faculty<select name="faculty">${D.FACULTIES.map((f) => `<option>${esc(f)}</option>`).join('')}</select></label>
      </div>
      <label class="check"><input type="checkbox" required> I agree that UM Connect+ stores my name, email and the purchases I record, for running and reporting this campus programme (PDPA notice).</label>
      <button class="btn primary block" type="submit">Continue</button>
      <button class="btn ghost block" type="button" id="out">Sign out</button>
    </form>`);
  const f = $('#ob');
  const sync = () => { $('#student-fields').classList.toggle('hidden', f.role.value !== 'student'); f.matric.required = f.role.value === 'student'; };
  $$('input[name=role]', f).forEach((r) => { r.onchange = sync; }); sync();
  $('#out').onclick = () => app.backend.sdk.signOut(app.backend.auth);
  f.onsubmit = (e) => {
    e.preventDefault();
    busy($('button[type=submit]', f), async () => {
      const role = f.role.value;
      try {
        await D.createProfile(app.ctx, role === 'student'
          ? { role, name: f.name.value, matric: f.matric.value.trim(), college: f.college.value, faculty: f.faculty.value }
          : { role, name: f.name.value });
        await done();
      } catch (err) {
        if (err.notReady) toast('UM Connect+ isn’t open for students yet. The MPP admin needs to sign in once to set it up.', true);
        else if (err.badMatric) toast('Enter your matric number using letters and numbers only (5–15 characters).', true);
        else if (err.matricTaken) toast('That matric number is already registered. If it’s yours, contact MPP.', true);
        else if (err.code === 'permission-denied' && role === 'student')
          toast('This email can’t join as a student. Use your Gmail or UM email, or ask MPP to add you as a tester.', true);
        else toast(errText(err), true);
      }
    });
  };
}
