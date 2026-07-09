-- Anchors a week/month/quarter/year horizon to one specific instance of it
-- (e.g. "2026-W28", "2026-08", "2026-Q3", "2026"), so the Week/Month/Quarter/
-- Year lists can navigate real periods instead of one eternal bucket.
alter table items add column horizon_period text;
