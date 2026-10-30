# UM Connect+ PWA on Firebase

The installable web app for students, merchants and MPP lives in `app/`. It runs in two modes:

- **Demo mode** (no setup): if `app/js/firebase-config.js` still has the placeholder key, data stays in the browser and every read and write is checked against `firestore.rules`. It's useful for pitching and for trying the flows. Open two tabs to act as a student and a merchant at the same time. The demo password is `demo1234`.
- **Live mode**: real accounts and a shared database on Firebase (Auth + Firestore + Hosting). This runs on the free Spark plan, with no credit card and no Cloud Functions.

The original demonstrator (`index.html`, `app.js`, `campus.js`, …) is untouched.

## Try it locally (2 minutes)

```bash
npm install
npm run dev          # http://localhost:5173 opens in Demo mode
npm test             # 74 rule and business scenarios against the local rules evaluator
```

## Go live (about 20 minutes)

1. **Create a Firebase project** at console.firebase.google.com. Skip Google Analytics.
2. **Turn on sign-in.** Go to Build > Authentication > Get started > Sign-in method:
   - Enable **Google**. Pick a project support email, then save.
   - Enable **Email/Password** as well. It's a fallback for merchants without a Google account.
   - Under Settings > Authorized domains, `localhost` and your `*.web.app` / `*.firebaseapp.com` domains are already listed. Add any custom domain you use.
3. **Create the Firestore database.** Go to Build > Firestore Database > Create database, choose **asia-southeast1 (Singapore)**, and start in production mode.
4. **Register a web app** under Project settings > General > Your apps > `</>`, and copy the `firebaseConfig`.
5. **Run setup and deploy:**
   ```bash
   npm run setup        # paste the config and your MPP admin email
   npx firebase login
   npm run deploy       # runs the tests, then deploys the rules and the site
   ```
   You'll get a URL like `https://<project>.web.app`.
6. **Sign in as MPP** with the admin email you entered. If it's a Google account, use **Continue with Google**; otherwise create an email account and verify it via the link Firebase emails you. The dashboard opens on **Set up the programme**. Click it once to create the points rules, rewards and counters.
7. Under **Settings**, add other MPP reviewers and any pilot testers who don't have a `@siswa.um.edu.my` email.

Students install it from the browser: Chrome shows **Install app**, and on iPhone use Safari > Share > **Add to Home Screen**. The camera scanner needs HTTPS, which Firebase Hosting provides.

## How the trust model works

| Step | Who | Enforced in `firestore.rules` |
|---|---|---|
| Sign up as student | Google sign-in (or a verified email) on an allowed domain, `gmail.com` by default, or a tester listed by MPP | yes |
| One account per student | Each matric number can register once and can't be changed afterwards | yes |
| Join PayNet list | Merchant sends details + DuitNow QR, then MPP verifies | only MPP can set `verified` |
| Earn points for a purchase | Student makes a one-use code, then the **merchant** confirms within 5 minutes | points = floor(RM × rate), once per code, by that merchant only |
| Every points change | Written with an immutable ledger entry in the same batch | balance can't go negative or change without a matching entry |
| Lessons | Answer keys are hidden from students; the rules check the answer | yes |
| Referrals, quiet-hour deals, vouchers, donations | Each has its own once-only and limit checks | yes |
| Mission bonuses, corrections | MPP approves, and the note is stored on the ledger | yes |

## Testing before real students

- `npm test` runs the rules locally using the rules evaluator in `app/js/fake/rules-engine.js`.
- `npm run test:emulator` runs **the same scenarios on Google's official Firestore emulator**. It needs Java 11+ and an internet connection the first time. **Run this before the pilot**, because the local evaluator is a close copy of the rules language, not Google's own engine.
- `npm run dev` in one terminal and `npm run test:e2e` in another drives the real UI. A student pays, a merchant confirms on another "device", and the test also covers vouchers, lessons, the survey and every MPP screen.

## Limits worth knowing

- **Gmail sign-in proves the email address, not that the person is a UM student.** The matric number limits each student to one account, but MPP should spot-check matric numbers against the student list before paying out rewards. If your UM student email is hosted on Google Workspace, you can remove `gmail.com` under Settings so only UM accounts can join.
- **Installed iPhone app:** Google sign-in can't open a popup from an installed iPhone app, so the app automatically falls back to a full-page redirect.

- **QR photos are stored in Firestore.** They're compressed to under about 600 KB because Cloud Storage now needs the Blaze plan. This is fine for a few hundred merchants.
- **There is no server code**, so these happen when someone opens the app rather than on a timer:
  - Expired codes are simply refused.
  - Mission claims wait for MPP.
  - Points don't auto-expire.
- **Free-tier quota:** Spark allows 50k document reads a day. A pilot with ~150 students fits easily. Watch Usage in the console before going campus-wide; Blaze has the same free allowance and pay-as-you-go above it.
- **The app records cashless purchases that merchants confirm; it never moves money.** PayNet's monthly counts remain the source of truth. Use Reconciliation to compare them.
