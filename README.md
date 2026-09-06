# High Noon Showdown

High Noon Showdown v2.5.0 is an original Wild West browser game with Rock Paper Scissors, synthesized Web Audio effects, and casual multiplayer. It contains no borrowed characters, art, sounds, maps, dialogue, or branding.

## Run

```sh
npm install
npm run dev
```

Copy `.env.example` to `.env.local` and add the Supabase values before using multiplayer. Use `npm run build` to type-check and create a production build.

## Controls

- Quick Draw: click, tap, or press Space after `DRAW!`. On phones, the wait state has no shoot control; a large safe-area-aware Shoot button appears only at the signal.
- Word Duel: type the shown word in either uppercase or lowercase, then press Enter.
- Trail Trace: press and hold on the canvas, follow the winding gold path, then release to submit a score based on progress and accuracy.
- Rock Paper Scissors: choose Rock, Paper, or Scissors simultaneously in a best-of-five match; first to three round wins takes the match.
- Sound: use the visible `MUTE` / `UNMUTE` control. Web Audio starts only after interaction and safely does nothing when unavailable.
- Navigation: the top navigation is ordered `HOME`, `PLAY`, `MULTI`, `MUTE` / `UNMUTE`, and `HOW TO PLAY`. `HOME` and the High Noon Showdown brand return to the main menu; `PLAY` opens AI modes and `MULTI` opens multiplayer.
- During any versus-AI or live multiplayer duel, select `FULL SCREEN` to expand the game. Select `EXIT FULL SCREEN`, or use the browser's fullscreen exit gesture, to return.

## Multiplayer Setup

1. In Supabase Authentication, enable anonymous sign-ins.
2. Run this idempotent block in the Supabase SQL Editor. It creates the private-room table, Quick Game queue, Realtime publication entries, and browser-safe policies/RPCs for users signed in anonymously (the Supabase `authenticated` role).

```sql
create table if not exists public.duel_rooms (
  code text primary key check (code ~ '^[A-Z0-9]{6}$'),
  host_id uuid not null references auth.users(id) on delete cascade,
  guest_id uuid references auth.users(id) on delete set null,
  mode text not null default 'original-quick-draw' check (mode in ('original-quick-draw', 'word-duel', 'trail-trace', 'bottle-shot', 'rock-paper-scissors', 'showdown-series')),
  status text not null default 'lobby' check (status in ('lobby', 'ready', 'playing')),
  round_state jsonb not null default '{"hostReady": false, "guestReady": false}'::jsonb,
  created_at timestamptz not null default now()
);

alter table public.duel_rooms enable row level security;

delete from public.duel_rooms where mode not in ('original-quick-draw', 'word-duel', 'trail-trace', 'bottle-shot', 'rock-paper-scissors', 'showdown-series');
alter table public.duel_rooms drop constraint if exists duel_rooms_mode_check;
alter table public.duel_rooms add constraint duel_rooms_mode_check check (mode in ('original-quick-draw', 'word-duel', 'trail-trace', 'bottle-shot', 'rock-paper-scissors', 'showdown-series'));

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
  mode text not null constraint quick_match_queue_mode_check check (mode in ('original-quick-draw', 'word-duel', 'trail-trace', 'bottle-shot', 'rock-paper-scissors', 'showdown-series')),
  room_code text references public.duel_rooms(code) on delete set null,
  created_at timestamptz not null default now(),
  matched_at timestamptz
);

alter table public.quick_match_queue enable row level security;

delete from public.quick_match_queue where mode not in ('original-quick-draw', 'word-duel', 'trail-trace', 'bottle-shot', 'rock-paper-scissors', 'showdown-series');
alter table public.quick_match_queue drop constraint if exists quick_match_queue_mode_check;
alter table public.quick_match_queue add constraint quick_match_queue_mode_check check (mode in ('original-quick-draw', 'word-duel', 'trail-trace', 'bottle-shot', 'rock-paper-scissors', 'showdown-series'));

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
  if p_mode not in ('original-quick-draw', 'word-duel', 'trail-trace', 'bottle-shot', 'rock-paper-scissors', 'showdown-series') then raise exception 'Invalid duel mode'; end if;

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

- **Original Quick Draw:** after a random 2-6 second wait, `DRAW!` appears. Click, tap, or press `Space` once to shoot before the AI reacts. The reaction clock starts with `performance.now()` immediately after the local `DRAW!` UI is rendered and interactive. Mobile AI and live rounds show a wait-only state without a shoot control, then reveal a large tap-safe Shoot button at `DRAW!`.
- **Word Duel:** after a random wait, type `SHOOT`, `DRAW`, or `POW` exactly and press Enter. Its local reaction clock starts immediately after the word input is rendered and enabled.
- **Trail Trace:** trace the generated winding target line with a mouse, touch, or pen. The final score combines farthest target progress with average line accuracy, with a small completion bonus.
- **Bottle Shot:** a 30-second target range with six smaller, touch-accessible bottles visible at once. Click or tap each active bottle once to break it: green and blue bottles add +10, while the more-common red bottles subtract 10. A shot or tap on the range that misses an active bottle also subtracts 10. A new seeded six-bottle wave appears every 1.5 seconds; Ash's target hits, red-bottle mistakes, and range misses vary by difficulty.
- **Rock Paper Scissors:** a simultaneous best-of-five, first-to-three match. Rock beats Scissors, Scissors beats Paper, and Paper beats Rock; matching choices tie and replay without awarding a round.
- **Showdown Series:** best of five, first to three wins. Every round randomly selects Quick Draw, Word Duel, Trail Trace, Bottle Shot, or Rock Paper Scissors. In multiplayer, the prior-round winner controls the next round; a tie returns control to the host for a replay. AI series behavior remains unchanged.
- In every AI mode, acting before the signal is a false start and loses the round.

Before starting a versus-AI mode, choose Ash Mercer's difficulty: **Easy** reacts randomly in 1200-2200 ms and traces around 48-72 points, **Normal** reacts randomly in 550-1400 ms and traces around 68-88 points, and **Hard** reacts randomly in 250-650 ms and traces around 84-98 points. Trail Trace begins immediately; the two existing signal modes keep their random 2-6 second waiting period. The active difficulty appears during the AI duel, and wins, losses, and the fastest successful reaction remain stored locally when browser storage is available.

## Multiplayer Behavior

Create a six-character private room code or join an available room as before. Quick Game selects a mode and queues the signed-in player; the next player requesting that same mode is atomically paired into a new `duel_rooms` row. A search remains queued when navigating away and is restored on return. Realtime delivers changes promptly, while a 2.5-second authenticated queue fetch checks for a missed event or a reconnect; only one local subscription/poll loop is active and cancel or leave stops it. Both sessions then subscribe to the room and can mark themselves ready. Cancel Search only removes an unmatched queue entry.

When both players are ready, the round controller briefly allows an in-flight peer handshake up to 1.2 seconds to settle, then writes a shared future `startAt` padded by at least 3 seconds with direct transport or 4.5 seconds on database fallback (plus the normal random draw wait where applicable). Each joined room creates one `RTCPeerConnection` using public STUN servers. Supabase Realtime Broadcast carries SDP/ICE signaling only; after the DataChannel opens, the guest sends five clock pings and estimates its offset from the host using the lowest-round-trip sample. Each browser converts that shared target to its local monotonic `performance.now()` timeline, arms the signal locally, renders/enables it, and only then records the reaction clock. If no peer link is available, browsers still use the padded shared timestamp, but start alignment is less precise.

For Quick Draw and Word Duel, each browser renders and activates its own signal/control before recording `performance.now()`. A shot or correct word reports elapsed milliseconds from that local mark through both the DataChannel event and the durable `round_state` action, so displayed reaction results are local measurements rather than stale signal or wall-clock timestamps. The host compares those measured values, not database/action arrival timestamps. Reactions within 3 ms are a tie; a short 1.2-second fallback window lets a missing peer action arrive before a lone valid reaction is awarded. Actions before a local activation are false starts; two false starts tie.

For Trail Trace, the deterministic path is scored locally and a submission is accepted only when it reaches the final target with at least 95% progress and 55% accuracy. Multiplayer repeats those bounds checks before accepting a payload. Bottle Shot uses a host-created `targetSeed`, shared `startAt`, and `endAt` exactly 30 seconds later. Rock Paper Scissors choices are sent simultaneously, revealed once both arrive, and ties replay without a point. The host may use an already received peer action as an early resolution hint, but the database state remains the fallback record.

### Transport Guarantees And Limits

- A connected DataChannel gives direct browser-to-browser delivery for live actions, a small guest-to-host clock-offset estimate, and reduced dependence on database subscription latency. The padded start and monotonic local arming reduce avoidable startup skew; they do not guarantee a fixed latency, exact clock alignment, an identical rendered frame, ordering across the database fallback, delivery after disconnect, or perfect fairness.
- STUN-only WebRTC works on many networks but cannot traverse every symmetric NAT, carrier network, enterprise firewall, VPN, or browser privacy policy. No TURN relay is configured; those cases remain on Supabase database fallback. Add your own TURN credentials to the RTC configuration for broader connectivity.
- WebRTC requires a current browser with `RTCPeerConnection` and DataChannel support. Unsupported or failed connections continue with Supabase state updates.
- This remains **client-timed casual play**, not cheat-proof or server-authoritative timing. A client can tamper with its measured reaction, clock-ping replies, choices, or scores. Different clocks, timer throttling, rendering/compositor delays, input-device latency, network asymmetry, and fallback database delivery can still affect perceived fairness; direct peer transport does not remove those limits.

### SQL Requirement

Existing users must rerun the v2.3.0 SQL block to replace the retired prior mode with `rock-paper-scissors` in room, Quick Game queue, and RPC allowlists. v2.5.0 requires no SQL update: queue restoration/polling and Showdown next-round control use the existing queue primary key, RPCs, room JSON state, and RLS policies.

## Files

- `src/services/multiplayer.ts` - Supabase anonymous auth, private rooms, Quick Game RPC/Realtime queue, and shared-round state updates
- `src/types.ts` - shared room and round types
- `src/main.ts` - browser UI, AI gameplay, and multiplayer lobby wiring
- `src/game/rules.ts` - pure versus-AI timing and duel resolution rules
- `src/style.css` - responsive Bottle Shot range and mobile-safe target styling
