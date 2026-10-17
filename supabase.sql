-- Cole no Supabase: SQL Editor > New query > Run
create table servers (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references auth.users on delete cascade,
  name text not null,
  cost numeric not null default 0,
  created_at timestamptz default now()
);
create table clients (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references auth.users on delete cascade,
  name text not null,
  phone text default '',
  server_id uuid references servers(id) on delete restrict,
  due date not null,
  value numeric not null default 0,
  created_at timestamptz default now()
);
create table sent_log (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references auth.users on delete cascade,
  client_id uuid not null references clients(id) on delete cascade,
  due date not null,
  days int not null,
  unique (client_id, due, days)
);
create table settings (
  user_id uuid primary key default auth.uid() references auth.users on delete cascade,
  msg_before text,
  msg_today text
);

alter table servers enable row level security;
alter table clients enable row level security;
alter table sent_log enable row level security;
alter table settings enable row level security;

create policy "own servers" on servers for all using (user_id = auth.uid()) with check (user_id = auth.uid());
create policy "own clients" on clients for all using (user_id = auth.uid()) with check (user_id = auth.uid());
create policy "own sent_log" on sent_log for all using (user_id = auth.uid()) with check (user_id = auth.uid());
create policy "own settings" on settings for all using (user_id = auth.uid()) with check (user_id = auth.uid());

-- sincronização em tempo real entre aparelhos
alter publication supabase_realtime add table servers, clients, sent_log, settings;
