-- 0002_collections.sql — group repository documents into flat collections so
-- uploads have structure and agent grounding can be scoped to a collection.
-- One collection per document (v1). NULL collection_id = "Uncategorized".

create table if not exists collections (
  id          uuid primary key default gen_random_uuid(),
  name        text not null,
  slug        text not null unique,
  description text,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);

drop trigger if exists collections_set_updated_at on collections;
create trigger collections_set_updated_at before update on collections
  for each row execute function set_updated_at();

alter table documents add column if not exists collection_id uuid
  references collections(id) on delete set null;

create index if not exists documents_collection_idx on documents (collection_id);
