-- NDU Live — Schema für die Mitmach-App
-- Im Supabase SQL-Editor einmal ausführen (oder von Claude per Supabase-MCP ausführen lassen).

create table if not exists sessions (
  code text primary key,
  title text not null default 'NDU Coding 2026',
  active_step int not null default 0,
  created_at timestamptz not null default now()
);

create table if not exists participants (
  id uuid primary key default gen_random_uuid(),
  session_code text not null references sessions(code) on delete cascade,
  name text not null check (char_length(name) between 1 and 24),
  emoji text not null default '🙂',
  created_at timestamptz not null default now()
);

create table if not exists answers (
  id uuid primary key default gen_random_uuid(),
  session_code text not null references sessions(code) on delete cascade,
  participant_id uuid not null references participants(id) on delete cascade,
  step int not null,
  value text not null check (char_length(value) between 1 and 80),
  created_at timestamptz not null default now(),
  unique (participant_id, step)
);

create table if not exists reactions (
  id uuid primary key default gen_random_uuid(),
  session_code text not null references sessions(code) on delete cascade,
  emoji text not null check (char_length(emoji) <= 8),
  created_at timestamptz not null default now()
);

-- Realtime für alle vier Tabellen einschalten
alter publication supabase_realtime add table sessions, participants, answers, reactions;

-- Row Level Security: anonymer Zugriff ist für diese Demo bewusst erlaubt.
-- Lesen darf jeder, anlegen darf jeder, ändern darf niemand (Steuerung läuft über den Service-Key im Backend).
alter table sessions enable row level security;
alter table participants enable row level security;
alter table answers enable row level security;
alter table reactions enable row level security;

create policy "sessions lesen" on sessions for select using (true);
create policy "participants lesen" on participants for select using (true);
create policy "participants anlegen" on participants for insert with check (true);
create policy "answers lesen" on answers for select using (true);
create policy "answers anlegen" on answers for insert with check (true);
create policy "reactions lesen" on reactions for select using (true);
create policy "reactions anlegen" on reactions for insert with check (true);

-- Demo-Session
insert into sessions (code, title) values ('ndu', 'NDU Coding 2026') on conflict do nothing;
