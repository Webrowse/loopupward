-- Soft-delete for items: deleting moves an item to Trash instead of
-- destroying it outright. Null means active/visible; a timestamp means
-- trashed at that moment, purged for good once the retention window
-- (free vs premium, enforced client-side) has passed.
alter table items add column deleted_at_ms bigint;
