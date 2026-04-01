-- Webchat sessions and messages tables
-- Each session belongs to a tenant and optionally links to a lead

create table if not exists webchat_sessions (
  id          uuid primary key default gen_random_uuid(),
  tenant_id   uuid not null references tenants(id) on delete cascade,
  lead_id     uuid references leads(id) on delete set null,
  created_at  timestamptz default now(),
  updated_at  timestamptz default now()
);

create table if not exists webchat_messages (
  id          uuid primary key default gen_random_uuid(),
  session_id  uuid not null references webchat_sessions(id) on delete cascade,
  role        text not null check (role in ('user', 'assistant')),
  content     text not null,
  created_at  timestamptz default now()
);

create index if not exists idx_webchat_messages_session on webchat_messages(session_id, created_at);
create index if not exists idx_webchat_sessions_tenant  on webchat_sessions(tenant_id, created_at desc);

-- RLS: service role bypasses; anon inserts allowed via edge function only
alter table webchat_sessions enable row level security;
alter table webchat_messages  enable row level security;

-- Allow service role full access (edge functions use service role key)
create policy "service_role_webchat_sessions" on webchat_sessions
  for all using (auth.role() = 'service_role');

create policy "service_role_webchat_messages" on webchat_messages
  for all using (auth.role() = 'service_role');
