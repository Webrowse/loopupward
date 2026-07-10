-- Manual drag order for one day's Today list. entry_order holds entry ids
-- in display order — real action ids, or virtual "habit:<itemId>:<date>" /
-- "today-item:<itemId>" ids — so it's plain text, not uuid. One row per
-- day: completing a task never touches this, only dragging or the
-- explicit "Sort" tidy-up does.
create table day_order (
  id uuid primary key,
  user_id uuid not null references users (id) on delete cascade,
  date text not null,
  entry_order text[] not null default '{}',
  updated_at_ms bigint not null,
  unique (user_id, date)
);
create index day_order_user_idx on day_order (user_id, date);
