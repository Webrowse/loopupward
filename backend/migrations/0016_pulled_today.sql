-- A period goal (week/month/quarter/year) can be pulled onto Today without
-- leaving its list: a non-destructive overlay flag, separate from `horizon`.
alter table items add column if not exists pulled_today boolean not null default false;
