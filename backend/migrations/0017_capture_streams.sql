-- Capture streams: what the app could see happening but was throwing away.
--
-- Numbered above 0016 deliberately — sqlx SILENTLY SKIPS any migration whose
-- version is lower than the newest already applied, and still logs success.
--
-- Every timestamp here is epoch milliseconds PLUS the IANA zone and UTC offset
-- captured at write time, so a year of rows spanning DST and travel stays
-- interpretable. Every row also carries the local `day` string it belongs to,
-- using the app's own day-attribution rules (a routine whose window wraps past
-- midnight logs to the evening it started — see routineLogDay in
-- lib/progress.ts), so a row's day is NOT always its calendar day.

-- One row per timer attempt: a focus block, a routine step, a whole routine
-- run, a day run, or a breather between them. Written when the attempt ENDS
-- for any reason, including close and abandon — abandonment is the
-- interesting half of this table.
create table focus_sessions (
  id uuid primary key,
  user_id uuid not null references users (id) on delete cascade,
  -- the life node the attempt was against, when there is one
  item_id uuid,
  -- the Today row it started from: a real action id, or a virtual
  -- "habit:<itemId>:<date>" / "today-item:<itemId>" id, so it is text
  entry_id text not null default '',
  day text not null,
  kind text not null check (kind in ('focus', 'routine_step', 'routine_run', 'day_run', 'rest')),
  -- routine_step only: which step of the script
  step_id text,
  started_at_ms bigint not null,
  ended_at_ms bigint not null,
  -- what was asked for (null = untimed, counted up instead)
  planned_seconds integer,
  -- wall-clock seconds the attempt actually ran, pauses excluded
  actual_seconds integer not null default 0,
  paused_seconds integer not null default 0,
  pause_count integer not null default 0,
  outcome text not null check (outcome in ('completed', 'abandoned', 'skipped', 'interrupted', 'expired')),
  tz text not null default '',
  utc_offset_minutes integer not null default 0,
  created_at_ms bigint not null
);
create index focus_sessions_user_day_idx on focus_sessions (user_id, day);
create index focus_sessions_user_item_idx on focus_sessions (user_id, item_id);

-- One append-only behavioural log. Never updated, never deleted: this is the
-- record of what happened, including the things that did not work out.
create table events (
  id uuid primary key,
  user_id uuid not null references users (id) on delete cascade,
  at_ms bigint not null,
  day text not null,
  tz text not null default '',
  utc_offset_minutes integer not null default 0,
  type text not null,
  item_id uuid,
  payload jsonb not null default '{}'::jsonb,
  created_at_ms bigint not null
);
create index events_user_at_idx on events (user_id, at_ms);
create index events_user_type_idx on events (user_id, type);

-- Provenance for progress. A manual tick, a focus-timer completion, a routine
-- auto-log and a parent-meter cascade used to write identical rows and could
-- not be told apart afterwards. Existing rows predate the distinction, so they
-- default to 'unknown' rather than claiming to be manual.
alter table logs add column source text not null default 'unknown';
alter table logs add column via text not null default '';

-- Routine step ticks were timeless: done_steps says WHICH steps, never when or
-- in what order. done_steps_at maps stepId -> epoch ms alongside it; done_steps
-- stays exactly as it was, so nothing that reads it has to change.
alter table habit_day_notes add column done_steps_at jsonb;
