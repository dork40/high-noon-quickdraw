# High Noon Showdown

High Noon Showdown v1.3 is an original Wild West versus-AI browser game. Face Ash Mercer in an original one-shot quick draw, a precision typing duel, or a deliberate draw-and-fire duel. It contains no borrowed characters, art, sounds, maps, dialogue, or branding.

## Run

```sh
npm install
npm run dev
```

Use `npm run build` to type-check and create a production build.

## Modes And Controls

- **Original Quick Draw:** after a random 2-6 second wait, `DRAW!` appears. Click, tap, or press `Space` once to shoot before the AI reacts. There is no separate gun-draw action.
- **Word Duel:** after a random 2-6 second wait, exactly one of `SHOOT`, `DRAW`, or `POW` appears. The word input is automatically focused for desktop and mobile keyboards. Type the displayed word exactly and press Enter. Incorrect text does not shoot while the AI continues reacting.
- **Draw & Fire:** after a random 2-6 second wait, `DRAW!` appears. Click/tap **Draw Gun** or press `Space` to visibly clear the revolver from its holster, then use a distinct second click/tap/Space action to fire before the AI reacts.
- In every mode, acting before the signal is a false start and loses the round.

The AI has a random 280-850 ms reaction. Reaction time runs from the visible signal to the final word submission or shot, so the draw action is part of Draw & Fire's pressure. Wins, losses, and the fastest successful reaction are stored locally when browser storage is available.

## Files

- `src/types.ts` - shared multiplayer types plus separate Original Quick Draw, Word Duel, and Draw & Fire round states
- `src/game/rules.ts` - timing, word selection, and pure duel resolution rules
- `src/main.ts` - browser UI and input wiring
- `src/services/multiplayer.ts` - multiplayer service boundary and unavailable stubs

## Multiplayer Next

Multiplayer controls are intentionally disabled. A real release needs a server-authoritative timer: the server selects and records the draw timestamp, receives each shot timestamp over WebSockets, validates the round phase, and broadcasts the resolved state. The client must not decide a winner or generate the authoritative signal time.
