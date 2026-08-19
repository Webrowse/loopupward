# Backend migration: Railway to Neon + Cloud Run

Cutover date: **2026-08-18**. Neon was loaded from a Railway dump taken at
**2026-08-18 20:43:36 UTC**; all 17 tables verified identical by row count and
content hash at that moment.

## What moved

| | before | after |
|---|---|---|
| API process | Railway service `loopupward` | Cloud Run `loopupward`, region **us-east4** |
| Database | Railway Postgres 18.4 | Neon Postgres 18.4, `us-east-2` |
| Secrets | Railway service variables | GCP Secret Manager: only the 4 that are genuinely secret (both Neon URLs, Razorpay key secret, Razorpay webhook secret). The Google client id, Razorpay key id and the six plan ids are plain env vars: all three are already handed to the browser, and the plan ids are inert without the key secret. Four enabled versions sits inside the six-version free tier, so Secret Manager costs nothing. |
| Deploys | Railway watched the repo | `.github/workflows/deploy-backend.yml` |
| Public URL | `api.loopupward.com` | unchanged |

The frontend did not move. It still builds to Cloudflare Workers from
`.github/workflows/deploy.yml`, and `NEXT_PUBLIC_API_URL` is unchanged, so no
frontend rebuild was needed.

## How to revert DNS

One record, in Cloudflare, zone `loopupward.com`:

| field | rollback value |
|---|---|
| Type | `CNAME` |
| Name | `api` |
| Target | `cl18z3wz.up.railway.app` |
| Proxy status | **DNS only** (grey cloud) |
| TTL | 60 |

TTL is 60s, so it takes effect in about a minute. Verify with:

```
dig +noall +answer api.loopupward.com
curl -sS https://api.loopupward.com/health     # expect {"ok":true}
```

The `_railway-verify.api` TXT record was deliberately left in place, so Railway
still recognises the custom domain and will serve it again immediately.

## The catch: writes made after cutover

Railway's database was never modified and is a valid snapshot **as of
2026-08-18 20:43:36 UTC**. Anything written through the app after cutover
exists only in Neon.

- Reverting DNS **before** any post-cutover write: clean, costs nothing.
- Reverting DNS **after** real usage: Railway is stale by exactly that usage.
  You must migrate back first, or accept losing it.

To migrate back, reverse the direction of the original copy. `pg_dump` 18 is
required on both ends (Homebrew `postgresql@18`; the 16.x that ships by default
refuses an 18 server):

```
PG=/opt/homebrew/opt/postgresql@18/bin
$PG/pg_dump "$NEON_DIRECT_URL" -Fc --no-owner --no-privileges -f back.dump
$PG/psql "$RAILWAY_URL" -c 'drop schema public cascade; create schema public;'
$PG/pg_restore -d "$RAILWAY_URL" --no-owner --no-privileges \
  --single-transaction --exit-on-error back.dump
```

Then revert the CNAME. Use Neon's **direct** endpoint, not the pooled one:
`pg_restore` does session-level work that PgBouncer's transaction pooling
mangles.

## Keep Railway running until at least 2026-08-25

Do not delete or pause the Railway project or its database before then. It is
the only rollback target.

## Gotchas worth remembering

- **Migrations must not run through Neon's pooled endpoint.** sqlx guards them
  with a session-level advisory lock, which PgBouncer transaction pooling does
  not support; a missed unlock strands the lock and every later cold start
  hangs. `MIGRATION_DATABASE_URL` points at the direct endpoint for this reason.
- **`DEV_LOGIN_SECRET` must stay unset in production.** If set, `POST
  /v1/auth/dev` issues sessions without Google. Verified absent: that route
  returns 404 in production.
- **`FRONTEND_ORIGINS` is the CORS allow-list.** A wrong value means the app
  loads and every request fails.
- **Cold starts are ~6s.** Cloud Run scales to zero and Neon's free plan
  suspends after 5 minutes and cannot be told not to. The first request of a
  session pays for both.
- **Domain mappings are not available in every Cloud Run region.** us-east5 was
  the original choice and had to be abandoned for us-east4 for this reason.
