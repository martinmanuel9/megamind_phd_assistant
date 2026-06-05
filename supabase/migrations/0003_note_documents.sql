-- 0003_note_documents.sql — link a vault note to its embedded representation so
-- the "Sync vault" index can keep notes searchable and reconcile cleanly.
-- ON DELETE SET NULL: deleting the embedded document just unlinks the note.

alter table notes add column if not exists document_id uuid
  references documents(id) on delete set null;

create index if not exists notes_document_idx on notes (document_id);
