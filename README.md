# Sundown Signal v0.3

Sundown Signal is an original standalone browser game built around a cinematic western standoff: wait for a signal, manage focus, settle a sight, and make one evaluated shot. It uses no external visual assets, characters, or material from other games.

## Run

Open `index.html` in a current browser. There is no build step and no dependency installation required.

## Controls

- Start, reset, and confirm a shot: click/tap the action button, `Space`, or `Enter`.
- Aim with a mouse: move within the sight field.
- Aim by touch: drag within the sight field, then tap **Confirm shot**.
- Aim by keyboard: Arrow keys or `WASD`; hold `Shift` for larger movement.

Do not confirm during the listening phase: that creates a field fault. Once the lamp signals, the distant figure moves and your focus reserve drains. A shot succeeds when the sight is inside the focus-scaled evaluation window before the rival acts.

Your best successful reaction is stored with `localStorage` when available. Optional audio is generated with Web Audio only after it is enabled.

## Version Ledger

- **v0.3**: Rebuilt the game as Sundown Signal with a new field-console layout, original scene, focus reserve, revised shot evaluation, improved unified controls, and visible release ledger.
- **v0.2**: Initial timing-and-aim duel prototype.
- **v0.1**: First playable field test.

## Files

- `index.html` - accessible game structure, instructions, and visible version ledger
- `styles.css` - responsive original visual system and range scene
- `app.js` - round state machine, input handling, shot evaluation, records, and optional sound
