create extension if not exists pgcrypto;
create table if not exists organisations (id text primary key, display_name text not null, role text not null, created_at timestamptz not null default now());
create table if not exists user_organisations (user_id uuid not null references auth.users(id) on delete cascade, organisation_id text not null references organisations(id), application_role text not null check(application_role in ('viewer','preparer','signer')), primary key(user_id,organisation_id));
create table if not exists evidence_packages (evidence_id text primary key, event_id text not null, organisation_id text not null, digest text not null unique check(digest ~ '^[0-9a-f]{64}$'), object_key text not null unique, source_type text not null, observed_at timestamptz not null, created_at timestamptz not null default now());
create table if not exists tracked_transactions (tx_hash text primary key check(tx_hash ~ '^0x[0-9A-Fa-f]{64}$'), event_id text not null, verified_at timestamptz, verified_execution text, created_at timestamptz not null default now());
create table if not exists indexed_events (event_id text primary key, asset text not null, operator_id text not null, stage text not null, cause text, source_tx_hash text references tracked_transactions(tx_hash), verified_at timestamptz, updated_at timestamptz not null default now());
create table if not exists notifications (id uuid primary key default gen_random_uuid(), organisation_id text not null, event_id text not null, message text not null, read_at timestamptz, created_at timestamptz not null default now());
create table if not exists saved_views (id uuid primary key default gen_random_uuid(), user_id uuid not null references auth.users(id) on delete cascade, name text not null, filter_json jsonb not null default '{}'::jsonb);
create table if not exists adapter_configs (id uuid primary key default gen_random_uuid(), organisation_id text not null, kind text not null, source_label text not null, settings jsonb not null default '{}'::jsonb, enabled boolean not null default false);
alter table organisations enable row level security;alter table user_organisations enable row level security;alter table evidence_packages enable row level security;alter table tracked_transactions enable row level security;alter table indexed_events enable row level security;alter table notifications enable row level security;alter table saved_views enable row level security;alter table adapter_configs enable row level security;
create policy "own membership" on user_organisations for select to authenticated using(user_id=auth.uid());
create policy "own organisations" on organisations for select to authenticated using(exists(select 1 from user_organisations u where u.user_id=auth.uid() and u.organisation_id=organisations.id));
create policy "own evidence metadata" on evidence_packages for select to authenticated using(exists(select 1 from user_organisations u where u.user_id=auth.uid() and u.organisation_id=evidence_packages.organisation_id));
create policy "own notices" on notifications for select to authenticated using(exists(select 1 from user_organisations u where u.user_id=auth.uid() and u.organisation_id=notifications.organisation_id));
create policy "own saved views" on saved_views for all to authenticated using(user_id=auth.uid()) with check(user_id=auth.uid());
-- Indexed protocol tables and adapter configurations are service-role only by default.
create index if not exists evidence_event_idx on evidence_packages(event_id);
create index if not exists tracked_pending_idx on tracked_transactions(created_at) where verified_at is null;
create index if not exists event_search_idx on indexed_events using gin(to_tsvector('english',event_id||' '||asset));
