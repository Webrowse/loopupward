-- Exact-date items: an appointment or birthday pinned to one calendar day,
-- distinct from the fuzzy week/month/quarter/year planning horizons.
-- horizon_period stores that day (this year's occurrence for repeating
-- ones); date_repeats_yearly makes it resurface every year on the same
-- month/day instead of once.
alter table items add column date_repeats_yearly boolean not null default false;
