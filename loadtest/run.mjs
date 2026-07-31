#!/usr/bin/env node
/**
 * LoopUpward load harness. No install: plain Node, fanned out over child
 * processes so the generator isn't the bottleneck.
 *
 * It drives the API the way the app actually does (see lib/data/cloud.ts):
 *   - one full GET /v1/data per app open   (10 table queries + whole-life JSON)
 *   - small PUT /v1/data/{table} writes as things get ticked
 *   - GET /v1/me on session checks
 * and reports rps, latency percentiles, and every status code it saw.
 *
 * Usage:
 *   API=http://127.0.0.1:8080 DEV_SECRET=... node loadtest/run.mjs \
 *     --users 50 --seconds 30 --mix boot   # or: write, me, real
 *
 * NEVER point this at production: the writes are real rows, the reads bill
 * real egress, and one busy run can trip the per-token rate limit (240/min)
 * for whoever shares that token.
 */

import { fork } from "node:child_process";
import { readFileSync, writeFileSync } from "node:fs";
import os from "node:os";
import { fileURLToPath } from "node:url";

const API = process.env.API ?? "http://127.0.0.1:8080";
const DEV_SECRET = process.env.DEV_SECRET ?? "";

function arg(name, fallback) {
  const i = process.argv.indexOf(`--${name}`);
  return i > -1 ? process.argv[i + 1] : fallback;
}

const USERS = Number(arg("users", 25));
const SECONDS = Number(arg("seconds", 20));
const MIX = arg("mix", "real");
const WORKERS = Math.min(Number(arg("workers", os.cpus().length)), USERS);
/** Requests per second per virtual user. The point is to model people, not
 *  hammering loops: a real session touches the API every few seconds, and the
 *  server's own limiter cuts any token off at 4/s anyway. 0 = unpaced. */
const RATE = Number(arg("rate", 0.5));

/* ————— what a virtual user does ————— */

/** The mix a real session produces: mostly reads, a write every few beats. */
const MIXES = {
  boot: [{ kind: "load", weight: 1 }],
  write: [{ kind: "write", weight: 1 }],
  me: [{ kind: "me", weight: 1 }],
  real: [
    { kind: "load", weight: 1 },
    { kind: "me", weight: 2 },
    { kind: "write", weight: 4 },
  ],
};

function pick(mix) {
  const total = mix.reduce((s, m) => s + m.weight, 0);
  let r = Math.random() * total;
  for (const m of mix) {
    r -= m.weight;
    if (r <= 0) return m.kind;
  }
  return mix[0].kind;
}

const uuid = () => crypto.randomUUID();

/**
 * Sessions are cached on disk between runs on purpose: /v1/auth/* is limited to
 * 20 calls a minute and, with no forwarded IP to key on, every dev login shares
 * the same bucket. A fresh fleet of users therefore logs in slowly (backing off
 * through that window) and then never pays for it again.
 */
const TOKEN_CACHE = new URL("./.tokens.json", import.meta.url);

function readCache() {
  try {
    return JSON.parse(readFileSync(TOKEN_CACHE, "utf8"));
  } catch {
    return {};
  }
}

async function login(email, cache) {
  const key = `${API}|${email}`;
  if (cache[key]) {
    const ok = await fetch(`${API}/v1/me`, { headers: { authorization: `Bearer ${cache[key]}` } });
    if (ok.status === 200) return cache[key];
  }
  for (let attempt = 0; attempt < 30; attempt++) {
    const res = await fetch(`${API}/v1/auth/dev`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ secret: DEV_SECRET, email, name: "Load Test" }),
    });
    if (res.ok) {
      const token = (await res.json()).token;
      cache[key] = token;
      return token;
    }
    if (res.status !== 429) throw new Error(`dev login failed: ${res.status} ${await res.text()}`);
    await new Promise((r) => setTimeout(r, 3000)); // wait out the auth window
  }
  throw new Error("dev login kept coming back 429 — is the auth limiter window stuck?");
}

async function call(kind, token) {
  const headers = { authorization: `Bearer ${token}` };
  if (kind === "load") return fetch(`${API}/v1/data`, { headers });
  if (kind === "me") return fetch(`${API}/v1/me`, { headers });
  // one ticked task, exactly the shape the app sends
  const now = Date.now();
  return fetch(`${API}/v1/data/actions`, {
    method: "PUT",
    headers: { ...headers, "content-type": "application/json" },
    body: JSON.stringify({
      rows: [{
        id: uuid(), itemId: null, title: "load test task",
        date: new Date().toISOString().slice(0, 10), done: true, doneAt: now,
        amount: 0, priority: 0, note: "", createdAt: now,
      }],
    }),
  });
}

/* ————— child: hammer with `count` virtual users for `seconds` ————— */

async function child() {
  const { users, seconds, mix, id, rate } = JSON.parse(process.env.LOAD_CFG);
  const plan = MIXES[mix] ?? MIXES.real;
  const cache = readCache();
  const tokens = [];
  for (let i = 0; i < users; i++) {
    tokens.push(await login(`loadtest+w${id}u${i}@example.com`, cache));
  }
  process.send({ type: "ready", users: tokens.length, cache });

  const samples = [];
  const codes = {};
  const bytes = { total: 0 };
  const until = Date.now() + seconds * 1000;
  let stop = false;
  process.on("message", (m) => { if (m === "stop") stop = true; });

  const gap = rate > 0 ? 1000 / rate : 0;
  const vu = async (token, index) => {
    // stagger arrivals so paced users don't march in lockstep
    if (gap) await new Promise((r) => setTimeout(r, (gap * index) / users + Math.random() * gap));
    while (!stop && Date.now() < until) {
      const due = Date.now() + gap;
      const kind = pick(plan);
      const t0 = performance.now();
      try {
        const res = await call(kind, token);
        const body = await res.arrayBuffer();
        bytes.total += body.byteLength;
        const ms = performance.now() - t0;
        samples.push([kind, ms]);
        codes[`${kind} ${res.status}`] = (codes[`${kind} ${res.status}`] ?? 0) + 1;
      } catch (e) {
        codes[`${kind} ERR ${e.cause?.code ?? e.message}`] =
          (codes[`${kind} ERR ${e.cause?.code ?? e.message}`] ?? 0) + 1;
      }
      // hold the per-user rate; a user slower than the pace just falls behind
      const left = due - Date.now();
      if (left > 0) await new Promise((r) => setTimeout(r, left));
    }
  };

  await Promise.all(tokens.map((t, i) => vu(t, i)));
  // exit only once the parent has the results: process.send is asynchronous,
  // and exiting on the next line throws the whole run away
  process.send({ type: "done", samples, codes, bytes: bytes.total }, () => process.exit(0));
}

/* ————— parent: fan out, collect, report ————— */

function pct(sorted, p) {
  if (!sorted.length) return 0;
  return sorted[Math.min(sorted.length - 1, Math.floor((p / 100) * sorted.length))];
}

async function parent() {
  if (!DEV_SECRET) {
    console.error("DEV_SECRET is required (the backend's DEV_LOGIN_SECRET).");
    process.exit(1);
  }
  const health = await fetch(`${API}/health`).catch(() => null);
  if (!health?.ok) {
    console.error(`No API at ${API} (GET /health failed). Start the backend first.`);
    process.exit(1);
  }

  console.log(`\nLoopUpward load test`);
  console.log(`  target   ${API}`);
  console.log(
    `  mix      ${MIX}   users ${USERS}   duration ${SECONDS}s   workers ${WORKERS}` +
      `   rate ${RATE > 0 ? `${RATE}/s per user (offered ${(USERS * RATE).toFixed(0)} rps)` : "unpaced"}\n`
  );

  const per = Math.ceil(USERS / WORKERS);
  const kids = [];
  const results = [];
  const self = fileURLToPath(import.meta.url);

  for (let i = 0; i < WORKERS; i++) {
    const users = Math.min(per, USERS - i * per);
    if (users <= 0) break;
    const kid = fork(self, [], {
      env: {
        ...process.env,
        LOAD_CHILD: "1",
        LOAD_CFG: JSON.stringify({ users, seconds: SECONDS, mix: MIX, id: i, rate: RATE }),
      },
      stdio: ["inherit", "inherit", "inherit", "ipc"],
    });
    kid.on("message", (m) => {
      if (m.type === "done") results.push(m);
      // children log in for their own slice; keep every session for next time
      if (m.type === "ready" && m.cache) {
        try {
          writeFileSync(TOKEN_CACHE, JSON.stringify({ ...readCache(), ...m.cache }, null, 2));
        } catch {
          // a cache we cannot write just means logging in again next run
        }
      }
    });
    kids.push(kid);
  }

  const t0 = performance.now();
  await Promise.all(kids.map((k) => new Promise((r) => k.on("exit", r))));
  const wall = (performance.now() - t0) / 1000;

  const all = results.flatMap((r) => r.samples);
  const codes = {};
  let bytes = 0;
  for (const r of results) {
    bytes += r.bytes;
    for (const [k, v] of Object.entries(r.codes)) codes[k] = (codes[k] ?? 0) + v;
  }

  const byKind = {};
  for (const [kind, ms] of all) (byKind[kind] ??= []).push(ms);

  console.log(`requests ${all.length}   wall ${wall.toFixed(1)}s   throughput ${(all.length / wall).toFixed(0)} rps`);
  console.log(`response bytes ${(bytes / 1e6).toFixed(1)} MB   (${(bytes / 1e6 / wall).toFixed(2)} MB/s egress)\n`);
  console.log(`endpoint   n        rps      p50       p95       p99       max`);
  for (const [kind, arr] of Object.entries(byKind)) {
    const s = arr.sort((a, b) => a - b);
    const f = (x) => `${x.toFixed(1)}ms`.padEnd(10);
    console.log(
      `${kind.padEnd(11)}${String(s.length).padEnd(9)}${(s.length / wall).toFixed(0).padEnd(9)}` +
        f(pct(s, 50)) + f(pct(s, 95)) + f(pct(s, 99)) + f(s[s.length - 1])
    );
  }
  console.log(`\nstatus codes`);
  for (const [k, v] of Object.entries(codes).sort()) console.log(`  ${k.padEnd(16)} ${v}`);
  console.log();
}

if (process.env.LOAD_CHILD) child();
else parent();
