# shadercn-claims Worker

Separately deployed Cloudflare Worker for the username-claim flow. The main
Next.js site does not migrate hosting; production claim traffic is proxied
from the same origin via `app/api/claims/[...path]/route.ts`.

## Bindings

- `DB` — Cloudflare D1 (`shadercn-claims`)
- `EMAIL` — Cloudflare Email Service `send_email` (verified sender domain)
- `CLAIM_RATE_LIMIT` — Workers Rate Limiting (edge enforcement, wrangler
  4.36.0+; pick an unused account-scoped `namespace_id`). The D1 sliding
  window in `src/rate-limit.ts` is the portable fallback.

No D1/Email credentials ever reach the browser.

## Local development

```bash
# 1. Create + migrate a local D1 database (no production IDs committed)
pnpm dlx wrangler d1 create shadercn-claims
pnpm dlx wrangler d1 migrations apply shadercn-claims --local \
  --config workers/claims/wrangler.jsonc

# 2. Copy non-secret example vars
cp workers/claims/.dev.vars.example workers/claims/.dev.vars

# 3. Put the Turnstile secret (never in git)
pnpm dlx wrangler secret put TURNSTILE_SECRET --config workers/claims/wrangler.jsonc

# 4. Run the Worker
pnpm dlx wrangler dev --config workers/claims/wrangler.jsonc
```

Onboard the sender domain before sending (`pnpm dlx wrangler email sending
enable yourdomain.com`) and set `CLAIMS_FROM_EMAIL` to an address on that
verified domain. Local `EMAIL.send()` writes files instead of delivering.

## Deploy

```bash
pnpm dlx wrangler d1 migrations apply shadercn-claims --remote \
  --config workers/claims/wrangler.jsonc
pnpm dlx wrangler deploy --config workers/claims/wrangler.jsonc
```

Set production vars/secrets in the dashboard or via wrangler:

- `CLAIMS_FROM_EMAIL` (e.g. `noreply@shadercn.run`)
- `CLAIMS_SITE_URL` (e.g. `https://shadercn.run`)
- `ALLOWED_HOSTNAMES` (production hostnames)
- `TURNSTILE_SECRET` (secret, never committed)
- `NEXT_PUBLIC_TURNSTILE_SITE_KEY` (public site key, consumed by Next.js)

## Regenerating orb schemas

`src/orb-schemas.ts` is a snapshot of shipped orb param/color ranges used for
deterministic generation. Regenerate after adding variants:

```bash
node scripts/generate-orb-schemas.mjs
node scripts/verify-claims.mjs
```
