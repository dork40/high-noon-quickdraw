# Sundown Signal v0.4

Sundown Signal is an original standalone browser game built around a cinematic western standoff: gather focus while waiting, draw on a signal, settle a sight, and fire one evaluated shot. It uses no external visual assets, characters, or material from other games.

## Run

Open `index.html` in a current browser. There is no build step and no dependency installation required.

## Controls

- Start and reset: click/tap the action button, `Space`, or `Enter`.
- During the wait: hold the action button, `Space`, or `Enter` to gather focus. Release before the lamp signals.
- At DRAW: press the action button, `Space`, or `Enter` once to draw. This starts the opponent's pressure clock.
- Fire: click/tap **Fire shot**, `Space`, or `Enter` after drawing.
- Aim with a mouse: move within the sight field.
- Aim by touch: drag within the sight field, then tap **Fire shot**.
- Aim by keyboard: Arrow keys or `WASD`; hold `Shift` for larger movement.

Focus gathered during the listening phase becomes your aiming reserve. At the lamp signal, draw deliberately to enter the sight field. The reticle reports whether your line is searching, close, or locked; its confidence and the shot window depend on remaining focus. Opposing pressure rises after you draw, and the round ends if the far side acts first.

Your best successful reaction is stored with `localStorage` when available. Optional audio is generated with Web Audio only after it is enabled.

## Version Ledger

- **v0.4**: Added a hold-to-gather focus mechanic during waiting, a distinct draw phase, live reticle confidence, and a visible opposing-pressure clock before firing.
- **v0.3**: Rebuilt the game as Sundown Signal with a new field-console layout, original scene, focus reserve, revised shot evaluation, improved unified controls, and visible release ledger.
- **v0.2**: Initial timing-and-aim duel prototype.
- **v0.1**: First playable field test.

## Files

- `index.html` - accessible game structure, instructions, and visible version ledger
- `styles.css` - responsive original visual system and range scene
- `app.js` - round state machine, input handling, shot evaluation, records, and optional sound
