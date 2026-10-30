# UM Connect+ Student PWA

Student installable app. MPP remains a web dashboard at ../MPP-Dashboard.html.

## Merchant-scanned student transactions
Students generate a one-use five-minute transaction QR after paying externally. Merchants use Scan student QR to scan, review the merchant and amount, and explicitly confirm payment before local points are credited. Preview merchant scan demonstrates both roles in the same browser. The PWA opens the merchant preview on the root website in a separate tab. Receipt uploads and typed daily codes no longer qualify student points. QR requests, confirmations and balances do not sync between separate devices. Codes are opaque local request IDs, not signed or bank-verified credentials.
