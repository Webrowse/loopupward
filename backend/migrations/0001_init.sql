-- LoopUpward core schema. Timestamps that mirror the client model are epoch
-- milliseconds (created_at_ms …); `date` columns are local-day strings (YYYY-MM-DD).

create table users (
  id uuid primary key default gen_random_uuid(),
  google_sub text unique,
  email text not null unique,
  name text,
  avatar_url text,
  role text not null default 'user' check (role in ('user', 'owner')),
  premium_until timestamptz,
  plan text,
  created_at timestamptz not null default now()
);

create table sessions (
  token_hash text primary key,
  user_id uuid not null references users (id) on delete cascade,
  created_at timestamptz not null default now(),
  expires_at timestamptz not null,
  last_seen timestamptz not null default now()
);
create index sessions_user_idx on sessions (user_id);

create table areas (
  id uuid primary key,
  user_id uuid not null references users (id) on delete cascade,
  name text not null,
  emoji text not null default '🌿',
  color text not null default 'moss',
  position integer not null default 0,
  created_at_ms bigint not null
);
create index areas_user_idx on areas (user_id);

create table items (
  id uuid primary key,
  user_id uuid not null references users (id) on delete cascade,
  area_id uuid,
  parent_id uuid,
  kind text not null,
  tracker text not null default 'none',
  title text not null,
  note text not null default '',
  target double precision,
  current double precision not null default 0,
  unit text,
  horizon text,
  status text not null default 'active',
  cadence text,
  pinned boolean not null default false,
  position integer not null default 0,
  created_at_ms bigint not null,
  completed_at_ms bigint
);
create index items_user_idx on items (user_id);
create index items_parent_idx on items (user_id, parent_id);

create table seeds (
  id uuid primary key,
  user_id uuid not null references users (id) on delete cascade,
  text text not null,
  item_id uuid,
  created_at_ms bigint not null,
  archived_at_ms bigint
);
create index seeds_user_idx on seeds (user_id);

create table actions (
  id uuid primary key,
  user_id uuid not null references users (id) on delete cascade,
  item_id uuid,
  title text not null,
  date text not null,
  done boolean not null default false,
  done_at_ms bigint,
  amount double precision not null default 1,
  created_at_ms bigint not null
);
create index actions_user_date_idx on actions (user_id, date);

-- progress history: every habit day, counter bump, money snapshot is an event
create table logs (
  id uuid primary key,
  user_id uuid not null references users (id) on delete cascade,
  item_id uuid not null,
  date text not null,
  op text not null default 'add' check (op in ('add', 'set')),
  value double precision not null default 0,
  created_at_ms bigint not null
);
create index logs_user_item_idx on logs (user_id, item_id, date);

create table reflections (
  id uuid primary key,
  user_id uuid not null references users (id) on delete cascade,
  period text not null check (period in ('week', 'month', 'quarter', 'year')),
  period_key text not null,
  text text not null default '',
  created_at_ms bigint not null,
  updated_at_ms bigint not null
);
create index reflections_user_idx on reflections (user_id);

create table subscriptions (
  id text primary key,
  user_id uuid not null references users (id) on delete cascade,
  provider text not null default 'razorpay',
  plan text,
  status text not null,
  current_period_end timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index subscriptions_user_idx on subscriptions (user_id);
