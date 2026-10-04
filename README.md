# Vinexy Graduate Jotter: Ordering and Client Management System

Netlify (site + server functions) · Supabase (database, login, private file storage) · Paystack (payments)
· Resend (email) · Meta WhatsApp Cloud API (admin WhatsApp alert) · Google Apps Script (Drive + Sheets mirror)

## What it does
Customer: choose size/cover/copies (live price) → details → photos → colours → review → pay full or 60% via Paystack →
private order page (payment status, balance, proofs, approve/request revision, pay balance, final files).
Admin (`/admin.html`): all orders, search and filters, uploads, colour references, manual payment confirmation, custom quotes and
discounts, proof upload (auto watermarked low-res previews), status updates, final file release, editable package prices.

## Why it is trustworthy
- Prices, deposit and balance are computed on the server from the `prices` table. The browser cannot set an amount.
- An order is marked paid only by a row in `payments`, created only after Paystack's verify API confirms the reference, NGN, and the exact expected amount. Webhook and return page share one idempotent routine (unique reference).
- Originals live in the private `production` bucket. Customers only ever get 2-minute signed links to watermarked 1000px previews. Final files are signed only when the order is Fully Paid and you release them.

## Setup (about 45 minutes)
1. **Supabase**: create a project. SQL Editor → run `supabase/schema.sql`. Authentication → Users → Add user (your email + password).
   Then run: `insert into admins(user_id) select id from auth.users where email='YOUR_EMAIL';`
   Authentication → Providers: turn OFF public sign-ups (only admins should have accounts).
2. **Paystack**: get your secret key (start with test keys). Settings → API → Webhook URL: `https://YOUR-SITE.netlify.app/.netlify/functions/paystack-webhook`.
3. **Netlify**: push this folder to GitHub → Add new site → Import. Or `npm i -g netlify-cli && netlify deploy --prod`. Set environment variables below, then redeploy.
4. **Email (Resend)**: verify your sending domain, create an API key.
5. **WhatsApp alert (optional but recommended)**: Meta Business → WhatsApp Cloud API. Create a template named e.g. `new_order_alert` (category Utility) with this body:
   `New Graduation Magazine Order. Order ID: {{1}}. Customer: {{2}}. Package: {{3}}. Quantity: {{4}}. Total: {{5}}. Paid: {{6}}. Balance: {{7}}. Status: {{8}}. Customer phone: {{9}}.`
   WhatsApp requires an approved template for business-initiated messages. Without this setup the alert is skipped and logged, and you still get the email.
6. **Drive mirror (optional)**: follow the header of `apps-script/drive-sync.gs`.

## Environment variables (Netlify → Site configuration → Environment variables)
| Name | Value |
|---|---|
| SUPABASE_URL | Project URL |
| SUPABASE_ANON_KEY | anon public key |
| SUPABASE_SERVICE_KEY | service_role key (secret, never in the browser) |
| PAYSTACK_SECRET_KEY | sk_test_… then sk_live_… |
| SITE_URL | https://your-domain (no trailing slash) |
| RESEND_API_KEY, EMAIL_FROM | e.g. `Vinexy Cre8tive Studios <orders@yourdomain.com>` |
| ADMIN_EMAIL | where order alerts go |
| WHATSAPP_TOKEN, WHATSAPP_PHONE_ID, ADMIN_WHATSAPP, WHATSAPP_TEMPLATE | from Meta (optional) |
| DRIVE_WEBHOOK_URL, DRIVE_WEBHOOK_SECRET | from Apps Script (optional) |

## Go-live test (use Paystack test keys first)
1. Place an order with 2 photos and a colour picture; pay with a Paystack test card. Confirm you land on your order page showing PARTIALLY PAID (60%) or FULLY PAID.
2. In admin: the order appears with files; upload two page images as a proof; check the customer page shows watermarked previews and email arrives.
3. Request a revision as the customer; confirm it appears in admin. Approve the next version.
4. Pay the balance from the order page; status becomes FULLY PAID. Upload a final file and press Release; confirm download works only now.
5. Place a custom quantity order; send a quote in admin; accept and pay as the customer.
6. Switch to live keys.

## Limits you should know
- Screenshot and photo protection is deterrence only: low resolution, watermark with the customer's name and order ID, no print/save/copy, canvas rendering, blur when the tab loses focus. No website can stop a phone camera or an OS screenshot.
- An order is created (status Payment Pending, unpaid) before the customer reaches Paystack, because photos must be uploaded first. Abandoned ones show as "Not paid" in admin and are safe to ignore.
- The private order link is the customer's access key. Anyone with it can view the order. Use "Email link to customer" or "Copy customer link" in admin if a customer loses it.
- Paystack fees are not added to the customer's price.
- Drive and Sheets are a mirror. Supabase is the source of truth.
- Run `npm test` for the pricing/payment logic tests.
