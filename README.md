# High Noon Showdown

High Noon Showdown is an original Wild West quick-draw browser game. Wait for the signal, then fire faster than Ash Mercer. It contains no borrowed characters, art, sounds, maps, dialogue, or branding.

## Run

```sh
npm install
npm run dev
```

Use `npm run build` to type-check and create a production build.

## Controls

- Start or play again: click/tap **Start Duel** or press `Space`.
- Wait for `DRAW!`; it appears randomly after 2-6 seconds.
- Click/tap **Fire** or press `Space` as soon as it appears.
- Any action before `DRAW!` is a false start and loses the round.

The AI has a random 280-850 ms reaction. Wins, losses, and the fastest successful reaction are stored locally when browser storage is available.

## Files

- `src/types.ts` - shared `Player`, `Room`, `Round`, `DuelResult`, and `GameSettings` types
- `src/game/rules.ts` - timing generation and pure duel resolution rules
- `src/main.ts` - browser UI and input wiring
- `src/services/multiplayer.ts` - multiplayer service boundary and unavailable stubs

## Multiplayer Next

Multiplayer controls are intentionally disabled. A real release needs a server-authoritative timer: the server selects and records the draw timestamp, receives each shot timestamp over WebSockets, validates the round phase, and broadcasts the resolved state. The client must not decide a winner or generate the authoritative signal time.
