# High Noon Quickdraw v0.2

A standalone, responsive western duel game of reaction, aim, and nerve. No build step or dependencies are required.

## Play

Open `index.html` in a modern browser. Start a duel and wait for **DRAW!**. Acting before that signal is a false start. Once the draw begins, track the moving mark, align the reticle, and fire before the opponent does. A shot outside the mark misses.

Use a mouse to move the reticle in the aim field, or drag within it on touch devices. Keyboard players can move with Arrow keys or WASD (`Shift` makes larger movements), then fire with Space or Enter. The on-screen **Fire** button is always available. Nerve drains while the opponent applies pressure, making a clean shot more demanding.

Your fastest successful shot is stored locally in browser `localStorage`. Sound is optional and uses Web Audio only when enabled; unavailable audio never affects gameplay.

## Files

- `index.html` - game structure and accessible status regions
- `styles.css` - original responsive western visual design
- `app.js` - duel state machine, aim movement, input, timing, score persistence, and optional sound
