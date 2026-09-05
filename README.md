# High Noon Showdown

High Noon Showdown v1.6 is an original Wild West browser game with two versus-AI modes and casual Supabase Realtime multiplayer. It contains no borrowed characters, art, sounds, maps, dialogue, or branding.

## Run

```sh
npm install
npm run dev
```

Copy `.env.example` to `.env.local` and add the Supabase values before using multiplayer. Use `npm run build` to type-check and create a production build.

## Multiplayer Setup

1. In Supabase Authentication, enable anonymous sign-ins.
2. Run this idempotent block in the Supabase SQL Editor. It creates the private-room table, Quick Game queue, Realtime publication entries, and browser-safe policies/RPCs for users signed in anonymously (the Supabase `authenticated` role).

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

drop policy if exists "duel rooms are readable by signed-in players" on public.duel_rooms;
drop policy if exists "signed-in players can create rooms" on public.duel_rooms;
drop policy if exists "host or vacant-seat guest can update a room" on public.duel_rooms;
drop policy if exists "hosts can delete their rooms" on public.duel_rooms;

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

create table if not exists public.quick_match_queue (
  user_id uuid primary key references auth.users(id) on delete cascade,
  mode text not null constraint quick_match_queue_mode_check check (mode in ('original-quick-draw', 'word-duel')),
  room_code text references public.duel_rooms(code) on delete set null,
  created_at timestamptz not null default now(),
  matched_at timestamptz
);

alter table public.quick_match_queue enable row level security;

delete from public.quick_match_queue where mode not in ('original-quick-draw', 'word-duel');
alter table public.quick_match_queue drop constraint if exists quick_match_queue_mode_check;
alter table public.quick_match_queue add constraint quick_match_queue_mode_check check (mode in ('original-quick-draw', 'word-duel'));

drop policy if exists "players can read their quick match entry" on public.quick_match_queue;
drop policy if exists "players can add their quick match entry" on public.quick_match_queue;
drop policy if exists "players can remove their unmatched quick match entry" on public.quick_match_queue;

create policy "players can read their quick match entry"
on public.quick_match_queue for select to authenticated using (auth.uid() = user_id);

create policy "players can add their quick match entry"
on public.quick_match_queue for insert to authenticated with check (auth.uid() = user_id);

create policy "players can remove their unmatched quick match entry"
on public.quick_match_queue for delete to authenticated
using (auth.uid() = user_id and room_code is null);

create or replace function public.request_quick_match(p_mode text)
returns setof public.duel_rooms
language plpgsql
security definer
set search_path = public
as $$
declare
  v_user_id uuid := auth.uid();
  v_existing_mode text;
  v_existing_room text;
  v_opponent_id uuid;
  v_code text;
begin
  if v_user_id is null then raise exception 'Authentication required'; end if;
  if p_mode not in ('original-quick-draw', 'word-duel') then raise exception 'Invalid duel mode'; end if;

  -- One lock per mode makes selecting a waiting player and assigning both seats atomic.
  perform pg_advisory_xact_lock(hashtextextended('high-noon-quick-match:' || p_mode, 0));
  select mode, room_code into v_existing_mode, v_existing_room
  from public.quick_match_queue where user_id = v_user_id for update;

  if found and v_existing_room is not null then
    return query select * from public.duel_rooms where code = v_existing_room;
    return;
  end if;
  if found and v_existing_mode = p_mode then return; end if;
  if found then delete from public.quick_match_queue where user_id = v_user_id; end if;

  select user_id into v_opponent_id
  from public.quick_match_queue
  where mode = p_mode and room_code is null and user_id <> v_user_id
  order by created_at
  for update skip locked
  limit 1;

  if v_opponent_id is null then
    insert into public.quick_match_queue (user_id, mode)
    values (v_user_id, p_mode)
    on conflict (user_id) do update set mode = excluded.mode, room_code = null, created_at = now(), matched_at = null;
    return;
  end if;

  loop
    v_code := upper(substr(md5(random()::text || clock_timestamp()::text || v_user_id::text), 1, 6));
    begin
      insert into public.duel_rooms (code, host_id, guest_id, mode, status, round_state)
      values (v_code, v_opponent_id, v_user_id, p_mode, 'lobby', '{"hostReady": false, "guestReady": false}'::jsonb);
      exit;
    exception when unique_violation then
      -- A code collision is exceptionally unlikely; retry without exposing it to clients.
    end;
  end loop;

  update public.quick_match_queue
  set room_code = v_code, matched_at = now()
  where user_id in (v_user_id, v_opponent_id);
  return query select * from public.duel_rooms where code = v_code;
end;
$$;

create or replace function public.cancel_quick_match()
returns setof public.duel_rooms
language plpgsql
security definer
set search_path = public
as $$
declare v_user_id uuid := auth.uid(); v_room_code text;
begin
  if v_user_id is null then raise exception 'Authentication required'; end if;
  select room_code into v_room_code from public.quick_match_queue where user_id = v_user_id for update;
  if v_room_code is not null then
    return query select * from public.duel_rooms where code = v_room_code;
    return;
  end if;
  delete from public.quick_match_queue where user_id = v_user_id;
end;
$$;

revoke all on function public.request_quick_match(text) from public;
revoke all on function public.cancel_quick_match() from public;
grant execute on function public.request_quick_match(text) to authenticated;
grant execute on function public.cancel_quick_match() to authenticated;

do $$
begin
  if not exists (select 1 from pg_publication_tables where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = 'duel_rooms') then
    alter publication supabase_realtime add table public.duel_rooms;
  end if;
  if not exists (select 1 from pg_publication_tables where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = 'quick_match_queue') then
    alter publication supabase_realtime add table public.quick_match_queue;
  end if;
end;
$$;
```

In the Supabase dashboard, Database > Replication is the equivalent place to enable `duel_rooms` and `quick_match_queue`.

Set these Vercel environment variables for each environment you deploy:

```text
VITE_SUPABASE_URL=https://your-project.supabase.co
VITE_SUPABASE_PUBLISHABLE_KEY=your-anon-or-publishable-key
```

Use the project's publishable/anon key only. Never expose a service-role key in Vite or Vercel client variables. Redeploy after changing Vercel variables because Vite embeds them at build time.

## Modes And Controls

- **Original Quick Draw:** after a random 2-6 second wait, `DRAW!` appears. Click, tap, or press `Space` once to shoot before the AI reacts.
- **Word Duel:** after a random wait, type `SHOOT`, `DRAW`, or `POW` exactly and press Enter.
- In every AI mode, acting before the signal is a false start and loses the round.

The AI has a random 550-1400 ms reaction in both modes. Wins, losses, and the fastest successful reaction are stored locally when browser storage is available.

## Multiplayer Behavior

Create a six-character private room code or join an available room as before. Quick Game selects a mode and queues the signed-in player; the next player requesting that same mode is atomically paired into a new `duel_rooms` row. The first requester receives the room through their queue's Realtime update, while the second receives it directly from the RPC. Both sessions then subscribe to the room and can mark themselves ready. Cancel Search only removes an unmatched queue entry.

When both players are ready, the host writes a new shared `round_state.round` with a random 2-6 second future `startAt` timestamp. Both browsers wait for that same timestamp. For Original Quick Draw, each player can submit one shot; for Word Duel, the host includes one randomly selected `SHOOT`, `DRAW`, or `POW` word and each player submits one exact Enter-confirmed answer. The host resolves the first received valid action, and both players see their own and their rival's submitted reaction timing. The host can start the next round after a result; either player can leave.

### SQL Requirement

No additional SQL migration is required for v1.6 when the setup block above is already installed. The existing `round_state jsonb` column stores the new `round`, action, and result fields, and the existing seated-player update policy permits those writes. Realtime must remain enabled for `public.duel_rooms`.

This is **client-timed casual play**, not cheat-proof competitive play. Start and action timestamps are created by browsers, and the current broad room-update policy cannot prove who acted first or prevent a modified client from forging a result. A cheat-resistant version needs server-side round creation, timestamp validation, and atomic action/result RPCs.

## Files

- `src/services/multiplayer.ts` - Supabase anonymous auth, private rooms, Quick Game RPC/Realtime queue, and shared-round state updates
- `src/types.ts` - shared room and round types
- `src/main.ts` - browser UI, AI gameplay, and multiplayer lobby wiring
- `src/game/rules.ts` - pure versus-AI timing and duel resolution rules
