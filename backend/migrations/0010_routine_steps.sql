-- Routines: a kind of item ("morning routine") that carries an ordered
-- script of steps, each optionally timed in minutes. Steps are not separate
-- items — the routine is one entry, checked off per day like a habit; its
-- steps' minutes sum into the expected length shown on Today and preset in
-- the focus timer. Stored as jsonb: [{"id","title","minutes"}].
alter table items add column steps jsonb;
