-- Give a load-test user a believable amount of life, so GET /v1/data is
-- measured against a real payload instead of an empty account.
--
--   psql "$DATABASE_URL" -v email="'loadtest+w0u0@example.com'" \
--     -v items=300 -v actions=3000 -v logs=8000 -f loadtest/seed.sql
--
-- Defaults are a heavy-but-plausible free user (about two years of daily use).
-- Push actions/logs toward the premium caps (200k / 1M) to see where the
-- whole-database read and the per-write count(*) start to hurt.
--
-- Plain statements, no DO block: psql does not substitute :variables inside
-- dollar-quoted bodies.

\if :{?email}
\else
  \set email '\'loadtest+w0u0@example.com\''
\endif
\if :{?items}
\else
  \set items 300
\endif
\if :{?actions}
\else
  \set actions 3000
\endif
\if :{?logs}
\else
  \set logs 8000
\endif

\set ON_ERROR_STOP on

-- fails loudly (null user_id) if the account was never created; log in once
-- through /v1/auth/dev first
select id as uid from users where email = :email \gset

delete from logs where user_id = :'uid';
delete from actions where user_id = :'uid';
delete from items where user_id = :'uid';
delete from areas where user_id = :'uid';

insert into areas (id, user_id, name, emoji, color, position, created_at_ms)
values (gen_random_uuid(), :'uid', 'Load test area', '🌿', 'moss', 0,
        (extract(epoch from now()) * 1000)::bigint);

insert into items (id, user_id, area_id, parent_id, kind, tracker, title, note,
                   target, current, unit, horizon, status, cadence, position, created_at_ms)
select gen_random_uuid(), :'uid',
       (select id from areas where user_id = :'uid' limit 1), null,
       case when i % 7 = 0 then 'routine' when i % 3 = 0 then 'habit' else 'goal' end,
       case when i % 3 = 0 then 'habit' else 'counter' end,
       'Seeded item ' || i,
       repeat('a note that a real person actually wrote. ', 4),
       100, i % 100, null, null, 'active',
       case when i % 3 = 0 then 'daily' else null end,
       i, (extract(epoch from now()) * 1000)::bigint
from generate_series(1, :items) i;

insert into actions (id, user_id, item_id, title, date, done, done_at_ms, amount,
                     priority, note, created_at_ms)
select gen_random_uuid(), :'uid', null, 'Seeded action ' || i,
       to_char(now() - ((i % 730) || ' days')::interval, 'YYYY-MM-DD'),
       i % 3 <> 0, null, 1, 0, '', (extract(epoch from now()) * 1000)::bigint
from generate_series(1, :actions) i;

insert into logs (id, user_id, item_id, date, op, value, created_at_ms)
select gen_random_uuid(), :'uid',
       (select id from items where user_id = :'uid' order by position limit 1),
       to_char(now() - ((i % 730) || ' days')::interval, 'YYYY-MM-DD'),
       'add', 1, (extract(epoch from now()) * 1000)::bigint
from generate_series(1, :logs) i;

select
  (select count(*) from items where user_id = :'uid') as items,
  (select count(*) from actions where user_id = :'uid') as actions,
  (select count(*) from logs where user_id = :'uid') as logs;
