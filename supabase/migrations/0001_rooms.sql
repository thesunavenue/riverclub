-- RiverCrew rooms. One row per room; the whole room state (including the deck and
-- every player's hole cards) lives in `state`, so this table must NEVER be readable
-- by clients. RLS is enabled with no policies: only the server, using the secret key
-- (which bypasses RLS), can read or write it. Clients get per-player views via the API.

create table if not exists public.rooms (
  code text primary key,
  state jsonb not null,
  version integer not null,
  last_activity_at timestamptz not null,
  created_at timestamptz not null default now()
);

create index if not exists rooms_last_activity_at_idx on public.rooms (last_activity_at);

alter table public.rooms enable row level security;
-- Intentionally no policies.

-- Cleanup of inactive rooms (chips disappear with the room). Run periodically,
-- e.g. with pg_cron or a Vercel cron calling an API route:
--   delete from public.rooms where last_activity_at < now() - interval '24 hours';
