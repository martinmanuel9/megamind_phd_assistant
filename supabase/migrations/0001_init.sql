-- localopenbrainobsidian — initial schema
-- Traceability spine: documents → chunks (RAG) → note_links ← notes, plus a
-- standalone `thoughts` memory table (the "second brain" capture surface).
--
-- Embedding dimension is 768 (nomic-embed-text). If you switch embedding models
-- to a different dimension, you must change every `vector(768)` below AND
-- re-embed all rows — the dimension is fixed per column.
--
-- Run against a hosted Supabase project:
--   supabase db push           (with the project linked)
-- or paste this file into the Supabase SQL editor.

-- pgvector lives in the `extensions` schema on Supabase.
create extension if not exists vector with schema extensions;

-- updated_at helper -----------------------------------------------------------
create or replace function set_updated_at()
returns trigger language plpgsql as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

-- documents -------------------------------------------------------------------
-- One row per source document in the repository (uploaded PDF/docx/md, or a
-- registered web article). `storage_path` points at the Supabase Storage object
-- (bucket `documents`). `sha256` dedups identical uploads.
create table if not exists documents (
  id            uuid primary key default gen_random_uuid(),
  title         text not null,
  authors       text[] not null default '{}',
  source_url    text,
  doi           text,
  published     text,                       -- YYYY-MM-DD or YYYY, free-form ok
  venue         text,
  kind          text not null default 'article',  -- article | book | preprint | web | note
  storage_path  text,                       -- bucket-relative path in Storage
  mime_type     text,
  sha256        text,
  page_count    int,
  status        text not null default 'registered', -- registered | ingesting | ingested | failed
  ingest_error  text,
  metadata      jsonb not null default '{}',
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now()
);

create unique index if not exists documents_sha256_key on documents (sha256) where sha256 is not null;
create index if not exists documents_status_idx on documents (status);
create index if not exists documents_created_idx on documents (created_at desc);

drop trigger if exists documents_set_updated_at on documents;
create trigger documents_set_updated_at before update on documents
  for each row execute function set_updated_at();

-- chunks ----------------------------------------------------------------------
-- Embedded passages of a document. A note's claim can resolve to an exact chunk,
-- which is what makes the "jump from a note back to the source passage" work.
create table if not exists chunks (
  id           uuid primary key default gen_random_uuid(),
  document_id  uuid not null references documents (id) on delete cascade,
  ord          int not null,               -- 0-based position within the document
  text         text not null,
  embedding    vector(768),
  page         int,                         -- source page if known
  section      text,                        -- nearest heading/anchor if known
  token_count  int,
  metadata     jsonb not null default '{}',
  created_at   timestamptz not null default now()
);

create unique index if not exists chunks_doc_ord_key on chunks (document_id, ord);
create index if not exists chunks_document_idx on chunks (document_id);
-- ANN index. ivfflat needs ANALYZE + data to be useful; lists=100 is a fine
-- starting point for thousands of chunks. Switch to hnsw if recall matters.
create index if not exists chunks_embedding_idx on chunks
  using ivfflat (embedding vector_cosine_ops) with (lists = 100);

-- notes -----------------------------------------------------------------------
-- A row per Obsidian note the system created or tracks. `vault_path` is relative
-- to the vault root. This table is the bridge endpoint on the Obsidian side.
create table if not exists notes (
  id          uuid primary key default gen_random_uuid(),
  vault_path  text not null,
  title       text not null,
  note_type   text not null default 'literature', -- literature | source | synthesis | annotation | draft
  topics      text[] not null default '{}',
  metadata    jsonb not null default '{}',
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);

create unique index if not exists notes_vault_path_key on notes (vault_path);

drop trigger if exists notes_set_updated_at on notes;
create trigger notes_set_updated_at before update on notes
  for each row execute function set_updated_at();

-- note_links ------------------------------------------------------------------
-- THE traceability bridge. Each row says: this note (optionally this specific
-- claim) is backed by this document (optionally this exact chunk/passage).
-- From a note you can list its sources; from a document you can list every note
-- that cites it; from a claim you can open the precise passage.
create table if not exists note_links (
  id           uuid primary key default gen_random_uuid(),
  note_id      uuid not null references notes (id) on delete cascade,
  document_id  uuid not null references documents (id) on delete cascade,
  chunk_id     uuid references chunks (id) on delete set null,
  claim_text   text,                        -- the claim in the note this backs
  quote        text,                        -- short fair-use quote from the source
  created_at   timestamptz not null default now()
);

create index if not exists note_links_note_idx on note_links (note_id);
create index if not exists note_links_document_idx on note_links (document_id);
create index if not exists note_links_chunk_idx on note_links (chunk_id);

-- thoughts (memory / second brain) -------------------------------------------
-- Standalone captures, semantically searchable. Independent of documents.
create table if not exists thoughts (
  id          uuid primary key default gen_random_uuid(),
  content     text not null,
  embedding   vector(768),
  metadata    jsonb not null default '{}',
  created_at  timestamptz not null default now()
);

create index if not exists thoughts_created_idx on thoughts (created_at desc);
create index if not exists thoughts_embedding_idx on thoughts
  using ivfflat (embedding vector_cosine_ops) with (lists = 100);

-- RAG retrieval over document chunks ------------------------------------------
create or replace function match_chunks(
  query_embedding vector(768),
  match_threshold float default 0.3,
  match_count int default 10,
  filter_document_id uuid default null
)
returns table (
  id uuid,
  document_id uuid,
  ord int,
  text text,
  page int,
  section text,
  similarity float
)
language sql stable as $$
  select
    c.id,
    c.document_id,
    c.ord,
    c.text,
    c.page,
    c.section,
    1 - (c.embedding <=> query_embedding) as similarity
  from chunks c
  where c.embedding is not null
    and (filter_document_id is null or c.document_id = filter_document_id)
    and 1 - (c.embedding <=> query_embedding) > match_threshold
  order by c.embedding <=> query_embedding
  limit match_count;
$$;

-- Semantic search over captured thoughts --------------------------------------
create or replace function match_thoughts(
  query_embedding vector(768),
  match_threshold float default 0.3,
  match_count int default 10
)
returns table (
  id uuid,
  content text,
  metadata jsonb,
  similarity float,
  created_at timestamptz
)
language sql stable as $$
  select
    t.id,
    t.content,
    t.metadata,
    1 - (t.embedding <=> query_embedding) as similarity,
    t.created_at
  from thoughts t
  where t.embedding is not null
    and 1 - (t.embedding <=> query_embedding) > match_threshold
  order by t.embedding <=> query_embedding
  limit match_count;
$$;
