# High Noon Showdown

High Noon Showdown v1.4.1 is an original Wild West browser game with three versus-AI modes and casual Supabase Realtime multiplayer lobbies. It contains no borrowed characters, art, sounds, maps, dialogue, or branding.

## Run

```sh
npm install
npm run dev
```

Copy `.env.example` to `.env.local` and add the Supabase values before using multiplayer. Use `npm run build` to type-check and create a production build.

## Multiplayer Setup

1. In Supabase Authentication, enable anonymous sign-ins.
2. Run this in the Supabase SQL Editor. It creates the requested `public.duel_rooms` table and browser-safe policies for authenticated anonymous users.

```sql
create table if not exists public.duel_rooms (
  code text primary key check (code ~ '^[A-Z0-9]{6}$'),
  host_id uuid not null references auth.users(id) on delete cascade,
  guest_id uuid references auth.users(id) on delete set null,
  mode text not null default 'original-quick-draw',
  status text not null default 'lobby' check (status in ('lobby', 'ready', 'playing')),
  round_state jsonb not null default '{"hostReady": false, "guestReady": false}'::jsonb,
  created_at timestamptz not null default now()
);

alter table public.duel_rooms enable row level security;

create policy "duel rooms are readable by signed-in players"
on public.duel_rooms for select to authenticated using (true);

create policy "signed-in players can create rooms"
on public.duel_rooms for insert to authenticated
with check (auth.uid() = host_id);

create policy "host or vacant-seat guest can update a room"
on public.duel_rooms for update to authenticated
using (auth.uid() = host_id or auth.uid() = guest_id or guest_id is null)
with check (auth.uid() = host_id or auth.uid() = guest_id);

create policy "hosts can delete their rooms"
on public.duel_rooms for delete to authenticated using (auth.uid() = host_id);

alter publication supabase_realtime add table public.duel_rooms;
```

If the publication command reports the table already exists, Realtime is already enabled. In the Supabase dashboard, Database > Replication is the equivalent place to enable `duel_rooms`.

Set these Vercel environment variables for each environment you deploy:

```text
VITE_SUPABASE_URL=https://your-project.supabase.co
VITE_SUPABASE_PUBLISHABLE_KEY=your-anon-or-publishable-key
```

Use the project's publishable/anon key only. Never expose a service-role key in Vite or Vercel client variables. Redeploy after changing Vercel variables because Vite embeds them at build time.

## Modes And Controls

- **Original Quick Draw:** after a random 2-6 second wait, `DRAW!` appears. Click, tap, or press `Space` once to shoot before the AI reacts.
- **Word Duel:** after a random wait, type `SHOOT`, `DRAW`, or `POW` exactly and press Enter.
- **Draw & Fire:** after `DRAW!`, clear the revolver with one click/tap/`Space`, then use a distinct second action to fire.
- In every AI mode, acting before the signal is a false start and loses the round.

The AI has a random 280-850 ms reaction. Wins, losses, and the fastest successful reaction are stored locally when browser storage is available.

## Multiplayer Behavior

Create a six-character room code or join an available room. Both browser sessions authenticate anonymously, subscribe to the room's Realtime row, and can mark themselves ready. Leaving as host removes the room; leaving as guest reopens the second seat.

`src/services/multiplayer.ts` owns the Supabase boundary and exposes `publishRoundState` for future shared round events. The current lobby deliberately does not claim server-authoritative duel outcomes: a competitive live duel still needs server-side timing and validation rather than client timestamps.

## Files

- `src/services/multiplayer.ts` - Supabase anonymous auth, rooms, Realtime subscription, and future round-event boundary
- `src/types.ts` - shared room and round types
- `src/main.ts` - browser UI, AI gameplay, and multiplayer lobby wiring
- `src/game/rules.ts` - pure versus-AI timing and duel resolution rules
