# Website content (CMS)

Page text lives in Supabase and is edited at **/admin**. The HTML files in this repo are the
design templates; the build fills in their text from the database.

## How it works

- Editable text in the HTML is tagged with `data-cms` attributes (see `cms/lib.mjs` for the format).
- `npm run build` (Netlify) reads the content from Supabase and writes the finished site to `dist/`.
- Admins sign in at `/admin`, edit, **Save**, then **Publish site**. Publish calls
  `netlify/functions/publish.mjs`, which checks the user is in `cms_admins` and triggers a Netlify rebuild.
- If Supabase can't be reached, the build fails and Netlify keeps the previous version live.

## Netlify environment variables

| Name | Used by |
| --- | --- |
| `SUPABASE_URL` | build, publish function |
| `SUPABASE_ANON_KEY` | build, publish function, admin page (it's the public key) |
| `NETLIFY_AUTH_TOKEN` | publish function — Netlify personal access token (any plan) |
| `NETLIFY_BUILD_HOOK_URL` | publish function — optional; used instead of the token if set |
| `RESEND_API_KEY`, `RESEND_SEGMENT_ID` | newsletter signup, event registrants, contact form email |
| `CONTACT_TO_EMAIL`, `CONTACT_FROM_EMAIL` | optional — contact form recipient (default info@legacyxjiujitsu.com) and sender |
| `RESEND_EVENTS_SEGMENT_ID` | optional — put event registrants in their own Resend segment |
| `SUPABASE_SERVICE_ROLE_KEY` | event registration functions (secret — Functions scope only) |
| `STRIPE_SECRET_KEY` | card payments for events |
| `STRIPE_WEBHOOK_SECRET` | confirms card payments for events and store orders (`/api/stripe-webhook`) |
| `PRINTFUL_API_KEY` | store: product sync, shipping rates, orders (secret — Functions scope only) |

## Events

Events are **not** part of the page text above: they live in the `events` table (see `supabase/events.sql`)
and are managed under **Events & registrations** in /admin. The Events page and `event.html` read them live,
so event changes don't need Publish. Registration goes through `netlify/functions/register.mjs`, which uses a
database function (`create_registration`) that locks the event row so capacity can't be oversold.
Card payments use Stripe Checkout; e-Transfers are marked paid by an admin after the money arrives.

## Store

Products come from Printful and live in `store_products` (see `supabase/store.sql`); the admin's
**Store: Products & Orders** section syncs them and chooses which are live. `store.html`, `store-product.html`
and `store-cart.html` read live products straight from the database. Checkout prices the cart on the server
(`netlify/lib/store.mjs`), takes payment with Stripe Checkout, and the Stripe webhook then creates the Printful
order(s) — as drafts unless "send automatically" is on in the store settings. One Printful order is created
per Printful store in the cart.
Extra product photos are uploaded in the admin (**Details & photos**) to the `site-photos` bucket and saved in
`store_products.photos` (`supabase/add-store-photos.sql`); a re-sync leaves them alone.

## Changing the design or adding content

- **Local preview without Supabase:** `npm run build:local` (uses `content/seed.json`) and open `dist/`.
- **Text edits** belong in /admin, not in the HTML — the build overwrites tagged text with the database value.
- **New page:** add the HTML file, run `node cms/annotate.mjs --write` (it only tags pages that aren't tagged yet),
  then `node cms/extract.mjs` and run the updated `supabase/setup.sql` in Supabase. Re-running the SQL only
  adds keys that don't exist yet; it never overwrites edits.
- **New section on an existing page:** tag it by hand with `data-cms="page/section/name"` (or a
  `data-cms-list` / `data-cms-item` / `data-cms-field` group), then run `extract.mjs` and the SQL as above.
- Keys must stay stable: renaming a `data-cms` key disconnects it from its saved content.
