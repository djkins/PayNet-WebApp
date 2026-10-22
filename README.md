# PayNet WebApp

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

