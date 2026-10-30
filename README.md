# PayNet WebApp

> **New: UM Connect+ PWA on Firebase** lives in `app/`. Students, merchants and MPP use real accounts and a shared Firestore database, and students and merchants can install it as an app. See **[DEPLOY.md](DEPLOY.md)** to run it locally (`npm install && npm run dev`) or deploy it to Firebase Hosting. The files below describe the original browser-only demonstrator, which is unchanged.

UM Connect+ is an interactive campus cashless-commerce UI prototype for Universiti Malaya students, merchants and MPP.

## Run

Open `UM-Connect.html` in a browser for the standalone app, or serve this folder with `python3 -m http.server 8000` and visit http://localhost:8000.

`index.html`, `style.css` and `app.js` are the editable sources. `MPP-Dashboard.html` opens the same application in MPP mode.

## Workspaces

- Student: discover merchants, record post-payment check-ins, earn and redeem rewards, track spending, join missions, donate welfare points, learn and manage teams.
- Merchant: submit business details and QR, complete readiness guidance, request offer approval, review sample insights and register event stalls.
- MPP: merchant verification, monthly PayNet CSV export, campaigns, reconciliation and reward budgets.

The original dashboard layout is retained. Contextual buttons and success prompts explain the next action without separate journey pages.

## Prototype boundaries

Data is saved only in browser localStorage. Payments occur externally; the demo does not process money, authenticate UM users or verify real QR codes/receipts. Analytics are illustrative. Demo check-in code: `UM2210`.

The font stack prefers Helvetica World, then Helvetica and Arial. A licensed Helvetica World webfont is not included. Merchant photography loads from Unsplash.


## Campus participation update

The original dashboard is retained. New screens: Student/Merchant baseline surveys with a preliminary A-D segmentation rubric, an illustrative six-cafe schematic, adjustable points/referral rules, and occupancy-triggered off-peak offers. MPP can view saved survey profiles, approve off-peak offers and tune future earning rates.

Run `node campus.test.cjs` to check grading, reward accounting, duplicate prevention, referral caps and deal timing/occupancy rules.

Cafe locations and capacities are illustrative, not a verified UM census. Occupancy is manually entered browser-local demo data, not sensor-driven. Referral simulations do not message or credit another actual user. First survey completion rewards do not depend on grade. Financial knowledge and self-reported digital readiness are reported separately; the short rubric is not a validated literacy instrument.

Demo rules: 2 points/RM, 50 points for first student survey, 100 points each for a qualified inviter/invitee, and 5 rewarded referrals per calendar month (Malaysia time). Off-peak bonuses vary by offer and require an approved, enabled offer, eligible MYT time, occupancy below target, minimum spend, an unexpired claim and unused daily allocation. MPP settings apply to future events. Live integrations are still required for authenticated roles, persistent uploads, payment evidence and shared records.

