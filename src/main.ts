import "./style.css";
import { createRoundTiming, falseStart, resolveShot } from "./game/rules";
import type { DuelResult, Round } from "./types";

type Page = "home" | "game" | "multiplayer" | "how-to";
const root = document.querySelector<HTMLDivElement>("#app")!;
let page: Page = "home";
let round: Round = { number: 0, phase: "menu" };
let drawTimer: number | undefined;
let opponentTimer: number | undefined;
let stats = readStats();

function readStats() {
  try { return JSON.parse(localStorage.getItem("high-noon-stats") ?? "{\"wins\":0,\"losses\":0,\"best\":null}") as { wins: number; losses: number; best: number | null }; }
  catch { return { wins: 0, losses: 0, best: null }; }
}
function saveStats() { try { localStorage.setItem("high-noon-stats", JSON.stringify(stats)); } catch { /* Storage is optional. */ } }
function clearTimers() { window.clearTimeout(drawTimer); window.clearTimeout(opponentTimer); }
function nav(next: Page) { clearTimers(); page = next; round = { number: round.number, phase: "menu" }; render(); }

function layout(content: string) {
  return `<main class="shell">
    <header class="masthead"><button class="brand" data-page="home" aria-label="High Noon Showdown home"><span>HN</span> HIGH NOON SHOWDOWN</button><nav><button data-page="game">PLAY</button><button data-page="multiplayer">MULTIPLAYER</button><button data-page="how-to">HOW TO PLAY</button></nav></header>
    ${content}
    <footer>ORIGINAL WESTERN DUEL GAME <span>ONE BELL. ONE SHOT.</span></footer>
  </main>`;
}

function homeView() {
  return layout(`<section class="hero"><div class="sun"></div><div class="mesa mesa-far"></div><div class="mesa mesa-near"></div><div class="dust"></div><div class="hero-copy"><p class="eyebrow">A QUICK-DRAW DUEL AT SUNSET</p><h1>HIGH NOON<br><i>SHOWDOWN</i></h1><p class="lead">Keep still. Listen for the bell. When the word comes, be the first hand to clear leather.</p><div class="hero-actions"><button class="primary" data-page="game">PLAY VS AI</button><button class="outline" data-page="how-to">HOW TO PLAY</button></div></div><p class="corner-note">NO EXTERNAL ASSETS<br>ORIGINAL FRONTIER TALE</p></section>
  <section class="home-cards"><article><b>01</b><h2>Wait for it.</h2><p>The signal arrives at an unpredictable moment. Pull early and the round is over.</p></article><article><b>02</b><h2>Draw clean.</h2><p>Click, tap, or press Space the instant the word turns gold.</p></article><article><b>${stats.best ?? "--"}</b><h2>Local best.</h2><p>Milliseconds from bell to shot. Your record stays on this device.</p></article></section>`);
}

function gameView() {
  const result = (round as Round & { result?: DuelResult }).result;
  const phase = round.phase;
  const label = phase === "waiting" ? "WAIT" : phase === "draw" ? "DRAW!" : result ? result.outcome.toUpperCase().replace("-", " ") : "THE STREET IS QUIET";
  const prompt = phase === "waiting" ? "Keep your hand steady. Do not draw." : phase === "draw" ? "NOW!" : result ? result.message : "Face the challenger when you are ready.";
  const button = phase === "menu" || phase === "result" ? "START DUEL" : phase === "waiting" ? "HOLD" : "FIRE";
  return layout(`<section class="duel" data-phase="${phase}" data-result="${result?.outcome ?? ""}"><div class="duel-sky"><div class="duel-sun"></div><div class="cloud cloud-one"></div><div class="cloud cloud-two"></div></div><div class="horizon"></div><div class="street"></div><div class="opponent" aria-hidden="true"><span class="hat"></span><span class="head"></span><span class="torso"></span><span class="arm"></span></div><div class="gunslinger" aria-hidden="true"><span class="player-hat"></span><span class="player-body"></span><span class="hand"><i></i></span><span class="holster"></span><span class="flash"></span></div><div class="duel-panel"><p class="eyebrow">ROUND ${String(round.number || 1).padStart(2, "0")}</p><h1>${label}</h1><p class="duel-prompt" aria-live="assertive">${prompt}</p>${result ? `<div class="scoreline"><span>YOU ${result.reactionMs ? `${result.reactionMs} MS` : "EARLY"}</span><span>RIVAL ${result.opponentReactionMs} MS</span></div>` : ""}<button id="shot-button" class="primary shot-button">${button}</button><p class="key-hint">CLICK / TAP / <kbd>SPACE</kbd></p></div></section><section class="scoreboard"><div><span>WINS</span><b>${stats.wins}</b></div><div><span>LOSSES</span><b>${stats.losses}</b></div><div><span>LOCAL BEST</span><b>${stats.best ? `${stats.best} MS` : "--"}</b></div><div><span>OPPONENT</span><b>ASH MERCER</b></div></section>`);
}

function multiplayerView() {
  return layout(`<section class="page-header"><p class="eyebrow">TWO GUNSLINGERS. ONE STREET.</p><h1>Multiplayer</h1><p>Ride with a friend soon. Online duels are being prepared for the next frontier.</p></section><section class="lobby"><div class="coming">COMING SOON</div><div class="slots"><div><span>PLAYER ONE</span><b>YOUR SEAT</b></div><div><span>PLAYER TWO</span><b>OPEN SEAT</b></div></div><div class="lobby-controls"><button class="primary" disabled>CREATE ROOM</button><label>ROOM CODE<input disabled placeholder="ABC-123"></label><button class="outline" disabled>JOIN ROOM</button></div><p>Room codes and live matches will appear here when the service rides in.</p></section>`);
}

function howToView() {
  return layout(`<section class="page-header"><p class="eyebrow">KNOW THE RULES</p><h1>How to Play</h1><p>High Noon Showdown is a contest of timing. No aim meter, no second shot.</p></section><section class="rules"><article><b>01</b><h2>Take your place</h2><p>Select Play vs AI and start a duel when your hand is ready.</p></article><article><b>02</b><h2>Wait</h2><p>The draw signal can take two to six seconds. Clicking, tapping, or pressing Space before it appears is a false start and a loss.</p></article><article><b>03</b><h2>Fire</h2><p>When <strong>DRAW!</strong> flashes, click, tap, or press Space before your opponent reacts. Your reaction time is recorded in milliseconds.</p></article></section>`);
}

function render() {
  root.innerHTML = page === "home" ? homeView() : page === "game" ? gameView() : page === "multiplayer" ? multiplayerView() : howToView();
  root.querySelectorAll<HTMLElement>("[data-page]").forEach(button => button.addEventListener("click", () => nav(button.dataset.page as Page)));
  root.querySelector("#shot-button")?.addEventListener("click", takeAction);
}

function beginRound() {
  const timing = createRoundTiming();
  round = { number: round.number + 1, phase: "waiting", opponentReactionMs: timing.opponentReactionMs };
  render();
  drawTimer = window.setTimeout(() => {
    round = { ...round, phase: "draw", drawAt: performance.now() };
    render();
    opponentTimer = window.setTimeout(() => finish(resolveShot(round.opponentReactionMs!, round.opponentReactionMs!)), round.opponentReactionMs);
  }, timing.waitMs);
}

function takeAction() {
  if (round.phase === "menu" || round.phase === "result") beginRound();
  else if (round.phase === "waiting") finish(falseStart(round.opponentReactionMs!));
  else if (round.phase === "draw") finish(resolveShot(Math.round(performance.now() - round.drawAt!), round.opponentReactionMs!));
}

function finish(result: DuelResult) {
  clearTimers();
  if (result.outcome === "win") { stats.wins++; if (!stats.best || result.reactionMs! < stats.best) stats.best = result.reactionMs!; }
  else stats.losses++;
  saveStats();
  round = { ...round, phase: "result", result } as Round & { result: DuelResult };
  render();
}

document.addEventListener("keydown", event => {
  if (event.code !== "Space" || event.repeat || page !== "game") return;
  event.preventDefault(); takeAction();
});
render();
