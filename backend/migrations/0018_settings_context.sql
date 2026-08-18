-- Context: the things that make an exported year readable a year later.
--
-- The server did not know the user's timezone, so no exported timestamp could
-- be interpreted across travel or DST. It did not know what the user is trying
-- to become, so no area score meant more than "lowest completion rate". All of
-- it is optional and nullable: a user who fills in nothing sees exactly the app
-- they see today.

create table user_settings (
  user_id uuid primary key references users (id) on delete cascade,

  -- display preferences, previously localStorage-only
  theme text,
  font text,
  simple boolean,
  rest_seconds integer,

  -- clock: how this person's day is actually shaped
  timezone text,
  week_start integer,
  -- the hour a "day" rolls over (default 4am — before that you are still
  -- living last night). routineLogDay() reads this instead of hardcoding it.
  day_rollover_hour integer,
  wake_time text,
  sleep_time text,

  -- context, all free text, all optional
  season_of_life text,
  occupation text,
  becoming text,
  constraints text,

  -- targets to measure against
  focus_minutes_target integer,
  habit_days_target integer,
  deep_work_days_target integer,

  created_at_ms bigint not null,
  updated_at_ms bigint not null
);

-- An area score means more when the area says what it is for.
alter table areas add column description text not null default '';
alter table areas add column why_it_matters text not null default '';
-- how much of the user's attention this area is meant to get, 0..1
alter table areas add column target_share double precision;

-- The daily entry grows the quiet, optional half of a day: how you slept, how
-- loud the day was, and the one thing that would have made it good.
alter table daily_entries add column sleep_hours double precision;
alter table daily_entries add column sleep_quality integer;
alter table daily_entries add column stress integer;
alter table daily_entries add column focus integer;
alter table daily_entries add column gratitude text not null default '';
alter table daily_entries add column intention text not null default '';
alter table daily_entries add column tags text[] not null default '{}';

-- A reflection was one free-text blob, so no period could ever be measured
-- against what the last one promised. intentions are those promises, each
-- optionally naming an item, so the next period can score them by counting.
alter table reflections add column ratings jsonb;
alter table reflections add column area_notes jsonb;
alter table reflections add column wins text[] not null default '{}';
alter table reflections add column lessons text[] not null default '{}';
alter table reflections add column blockers text[] not null default '{}';
alter table reflections add column intentions jsonb;
