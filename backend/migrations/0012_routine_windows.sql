-- Routines grow visible hours and per-day step check-off.
-- window_start/window_end are "HH:MM" local times; end < start wraps past
-- midnight (a 21:00 → 02:00 night routine). Both null = shows all day.
alter table items add column window_start text;
alter table items add column window_end text;

-- Which of a routine's steps were done on this day — same one-row-per-item-
-- per-day home as the day's plan text. Ticking the last step logs the day.
alter table habit_day_notes add column done_steps text[];
