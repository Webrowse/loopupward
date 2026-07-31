# Load testing LoopUpward

Two files, no dependencies to install:

- `run.mjs` — the generator. Plain Node, fanned out over child processes, driving
  the same three calls the app makes (`GET /v1/data`, `GET /v1/me`,
  `PUT /v1/data/{table}`).
- `seed.sql` — fills a test account with a believable amount of life, so the
  whole-database read is measured against a real payload.

## Rule one: never aim it at production

`https://loopupward-production.up.railway.app` is one replica serving real
users. A run there writes real rows, bills real egress, and trips the
240-requests-per-minute limiter for the token it uses. Load test a local
backend, or a copy of the service in a separate Railway environment.

## Local run

```sh
# 1. a database of its own, so dev data stays untouched
createdb lifeos_load

# 2. the backend, pointed at it, with dev login enabled
cd backend
set -a; source .env; set +a
DATABASE_URL="postgres://…/lifeos_load" DEV_LOGIN_SECRET=loadtest \
  cargo run --release

# 3. one login to create the account, then give it some history
API=http://127.0.0.1:8080 DEV_SECRET=loadtest node ../loadtest/run.mjs --users 1 --seconds 1
psql "postgres://…/lifeos_load" -v email="'loadtest+w0u0@example.com'" \
  -v items=300 -v actions=3000 -v logs=8000 -f ../loadtest/seed.sql

# 4. load
API=http://127.0.0.1:8080 DEV_SECRET=loadtest node ../loadtest/run.mjs \
  --users 50 --seconds 30 --mix real
```

## Knobs

| flag | meaning |
| --- | --- |
| `--users N` | virtual users, each looping as fast as it can (so N is concurrency, not people) |
| `--seconds N` | duration |
| `--mix real` | reads + writes in app-like proportions (1 load : 2 me : 4 writes) |
| `--mix boot` | only `GET /v1/data`, the expensive whole-life read |
| `--mix write` | only writes, each a transaction plus a cap `count(*)` |
| `--mix me` | only the session check, i.e. the cheapest authenticated path |
| `--workers N` | generator processes (defaults to CPU count) |

## Reading the output

- **`boot` p95** is the number that decides how an app open feels. It grows with
  how much the account holds, because `/v1/data` returns everything.
- **`write` p95** should stay flat as the account grows. If it climbs, the
  culprit is `enforce_caps`, which counts the table on every write.
- **429s** mean the limiter fired: expected above 240 requests/minute per token
  (4/s), so a run with few users and high throughput will hit it. More users,
  each slower, is the realistic shape.
- **egress MB/s** matters on Railway: network egress is billed at $0.05/GB, and
  whole-database reads are the bulk of it.

## Where the ceilings are

Worth knowing before you interpret any number:

- `max_connections(10)` on the pool (`backend/src/main.rs`) is the hard
  concurrency wall for anything touching Postgres.
- One replica, `numReplicas: 1`. The in-memory rate limiter assumes that; a
  second replica makes the limit per-replica rather than per-user.
- Every authenticated request costs one indexed `sessions ⋈ users` lookup.
- `GET /v1/data` runs ten sequential `select *` queries and serializes the
  user's entire account.
