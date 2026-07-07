-- The daily journal loop: one entry per user per day.
create table daily_entries (
  id uuid primary key,
  user_id uuid not null references users (id) on delete cascade,
  date text not null,
  rough_notes text not null default '',
  end_of_day text not null default '',
  mood integer,
  energy integer,
  created_at_ms bigint not null,
  updated_at_ms bigint not null,
  unique (user_id, date)
);
create index daily_entries_user_idx on daily_entries (user_id, date);

-- User-created labels/tags, independent of life areas.
create table labels (
  id uuid primary key,
  user_id uuid not null references users (id) on delete cascade,
  name text not null,
  color text not null default 'moss',
  emoji text not null default '🏷️',
  position integer not null default 0,
  created_at_ms bigint not null
);
create index labels_user_idx on labels (user_id);

alter table items add column labels uuid[] not null default '{}';

-- Seed lifecycle: inbox → later / archived (nothing vanishes silently).
alter table seeds add column status text not null default 'inbox';
update seeds set status = 'archived' where archived_at_ms is not null;

-- Small task metadata for Today.
alter table actions add column priority integer not null default 0;
alter table actions add column note text not null default '';
