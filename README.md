# High Noon Quickdraw

A standalone, responsive western quick-draw reaction game. No build step or dependencies are required.

## Play

Open `index.html` in a modern browser. Select **Start duel**, wait for **DRAW!**, then press Space or tap the button before the AI opponent. Drawing before the signal is a false start.

Your fastest successful draw is stored locally in browser `localStorage`. Sound is optional and uses Web Audio only when enabled; unavailable audio never affects gameplay.

## Files

- `index.html` - game structure and accessible status regions
- `styles.css` - original responsive western visual design
- `app.js` - duel state machine, input, timing, score persistence, and optional sound
