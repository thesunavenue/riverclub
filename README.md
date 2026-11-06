# RiverCrew

Free Texas Hold'em table for a group of friends: create a room, send the link, play.
No sign-up. Play chips only: no real value, 18+.

## Stack

- Next.js (App Router, TypeScript) on Vercel
- Supabase Postgres (one `rooms` table) + Realtime (only `{code, version}` is broadcast; each client then fetches its own private view)
- Pure poker engine in `lib/engine` (`(state, action) => state`), room rules in `lib/room`

## Run locally

Needs Node 24 (`nvm use`).

```bash
npm install
cp .env.example .env.local   # fill in, or leave empty to use an in-memory store
npm run dev
```

Without Supabase keys the app runs on an in-memory store (rooms vanish on restart).

## Supabase setup

1. Create a project (Free plan). Pick the region closest to your players.
2. SQL Editor: run `supabase/migrations/0001_rooms.sql`.
3. Project Settings → API Keys: copy the URL, the publishable key and a secret key into `.env.local`:

```
NEXT_PUBLIC_SUPABASE_URL=
NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY=
SUPABASE_SECRET_KEY=
```

The `rooms` table has RLS on and no policies: only the server (secret key) can read it.
Never commit `.env.local` or put the secret key in client code.

## Deploy (Vercel)

1. Push to GitHub, then in Vercel: Add New → Project → import the repo.
2. Add the three environment variables above (Production and Preview).
3. Deploy. `vercel.json` pins functions to `sin1` (Singapore); change it to match your Supabase region.

## Tests

```bash
npm test               # engine, room rules, API handlers (no network)
npm run typecheck
npm run test:supabase  # optional: runs against the real database in .env.local
```

## Rules of the house

See `CLAUDE.md`: no payments, no cash value, no transfers between players, 18+ notice, nothing public-facing in Vietnam before legal advice.
