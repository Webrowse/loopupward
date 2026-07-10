-- What a habit means to do on one specific day, e.g. "clean" → "clean desk"
-- today, "side desk" tomorrow. One row per habit per day; the habit itself
-- still owns the single completion checkbox and streak, this just labels
-- which occurrence of it a given day is.
create table habit_day_notes (
  id uuid primary key,
  user_id uuid not null references users (id) on delete cascade,
  item_id uuid not null,
  date text not null,
  text text not null default '',
  created_at_ms bigint not null,
  updated_at_ms bigint not null,
  unique (user_id, item_id, date)
);
create index habit_day_notes_user_idx on habit_day_notes (user_id, item_id, date);
