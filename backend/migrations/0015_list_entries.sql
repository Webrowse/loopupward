-- Lists: generic checkable contents (groceries, people to thank…) embedded
-- on the item as jsonb, same shape as routines' steps — entries are not
-- separate items, so they don't count against item caps or clutter Life.
alter table items add column entries jsonb;
