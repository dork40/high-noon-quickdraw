# High Noon Showdown

High Noon Showdown v1.1 is an original Wild West versus-AI browser game. Face Ash Mercer in either a precision typing duel or a deliberate quick-draw duel. It contains no borrowed characters, art, sounds, maps, dialogue, or branding.

## Run

```sh
npm install
npm run dev
```

Use `npm run build` to type-check and create a production build.

## Modes And Controls

- **Word Duel:** after the random wait, exactly one of `SHOOT`, `DRAW`, or `POW` appears. The word input is automatically focused for desktop and mobile keyboards. Type the displayed word exactly and press Enter or tap **Fire Word**. Incorrect text does not shoot while the AI continues reacting.
- **Draw & Fire:** wait for `DRAW!`, then click/tap **Draw Gun** or press `Space`. Fire using a second click/tap/Space action before the AI reacts.
- In either mode, starting a draw action before the signal is a false start and loses the round.

The AI has a random 280-850 ms reaction. Wins, losses, and the fastest successful reaction are stored locally when browser storage is available.

## Files

- `src/types.ts` - shared multiplayer types plus separate Word Duel and Draw & Fire round states
- `src/game/rules.ts` - timing, word selection, and pure duel resolution rules
- `src/main.ts` - browser UI and input wiring
- `src/services/multiplayer.ts` - multiplayer service boundary and unavailable stubs

## Multiplayer Next

Multiplayer controls are intentionally disabled. A real release needs a server-authoritative timer: the server selects and records the draw timestamp, receives each shot timestamp over WebSockets, validates the round phase, and broadcasts the resolved state. The client must not decide a winner or generate the authoritative signal time.
