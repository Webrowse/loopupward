-- Flexible schedules: specific weekdays and weekly frequency.
alter table items add column cadence_days integer[];
alter table items add column cadence_count integer;
