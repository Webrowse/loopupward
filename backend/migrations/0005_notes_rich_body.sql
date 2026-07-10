-- Rich (HTML) content for note-kind items, kept separate from the existing
-- plain-text `note` annotation every item already has, so mixing the two
-- never renders raw HTML tags anywhere that still treats `note` as plain text.
alter table items add column rich_body text;
