import "./style.css";
import { createRoundTiming, falseStart, randomDuelWord, resolveShot } from "./game/rules";
import type { DuelResult, GameMode, Round } from "./types";

type Page = "home" | "mode-select" | "game" | "multiplayer" | "how-to";
const root = document.querySelector<HTMLDivElement>("#app")!;
let page: Page = "home";
let mode: GameMode = "draw-fire";
let round: Round = { number: 0, mode: "draw-fire", phase: "menu" };
let drawTimer: number | undefined;
let opponentTimer: number | undefined;
let stats = readStats();

function readStats() {
  try { return JSON.parse(localStorage.getItem("high-noon-stats") ?? "{\"wins\":0,\"losses\":0,\"best\":null}") as { wins: number; losses: number; best: number | null }; }
  catch { return { wins: 0, losses: 0, best: null }; }
}
function saveStats() { try { localStorage.setItem("high-noon-stats", JSON.stringify(stats)); } catch { /* Storage is optional. */ } }
function clearTimers() { window.clearTimeout(drawTimer); window.clearTimeout(opponentTimer); }
function nav(next: Page) {
  clearTimers();
  page = next;
  round = mode === "word-duel"
    ? { number: round.number, mode: "word-duel", phase: "menu" }
    : { number: round.number, mode: "draw-fire", phase: "menu" };
  render();
}

function layout(content: string) {
  return `<main class="shell">
    <header class="masthead"><button class="brand" data-page="home" aria-label="High Noon Showdown home"><span>HN</span> HIGH NOON SHOWDOWN</button><nav><button data-page="mode-select">PLAY</button><button data-page="multiplayer">MULTIPLAYER</button><button data-page="how-to">HOW TO PLAY</button></nav></header>
    ${content}
    <footer>ORIGINAL WESTERN DUEL GAME <span>ONE BELL. ONE SHOT.</span></footer>
  </main>`;
}

function homeView() {
  return layout(`<section class="hero"><div class="sun"></div><div class="mesa mesa-far"></div><div class="mesa mesa-near"></div><div class="dust"></div><div class="hero-copy"><p class="eyebrow">A QUICK-DRAW DUEL AT SUNSET</p><h1>HIGH NOON<br><i>SHOWDOWN</i></h1><p class="lead">Two ways to face Ash Mercer: type the signal in Word Duel or draw and fire on the street.</p><div class="hero-actions"><button class="primary" data-page="mode-select">PLAY VS AI</button><button class="outline" data-page="how-to">HOW TO PLAY</button></div></div><p class="corner-note">NO EXTERNAL ASSETS<br>ORIGINAL FRONTIER TALE</p></section>
  <section class="home-cards"><article><b>01</b><h2>Choose your duel.</h2><p>Word Duel tests precision; Draw & Fire tests your hand.</p></article><article><b>02</b><h2>Wait for it.</h2><p>The signal arrives at an unpredictable moment. Move early and lose.</p></article><article><b>${stats.best ?? "--"}</b><h2>Local best.</h2><p>Milliseconds from signal to a winning action.</p></article></section>`);
}

function modeSelectView() {
  return layout(`<section class="page-header"><p class="eyebrow">PLAY VS AI</p><h1>Choose Your Duel</h1><p>Each duel has its own rules. Ash Mercer reacts at a random speed every round.</p></section><section class="mode-cards"><article><p class="eyebrow">MODE 01</p><h2>Word Duel</h2><p>Wait for the signal, then type the one word shown: SHOOT, DRAW, or POW. Exact spelling wins the draw.</p><button class="primary" data-mode="word-duel">PLAY WORD DUEL</button></article><article><p class="eyebrow">MODE 02</p><h2>Draw &amp; Fire</h2><p>Wait for DRAW, deliberately clear leather with a click, tap, or Space, then fire before Ash does.</p><button class="primary" data-mode="draw-fire">PLAY DRAW &amp; FIRE</button></article></section>`);
}

function gameView() {
  const result = round.result;
  const phase = round.phase;
  const wordMode = round.mode === "word-duel";
  const word = round.mode === "word-duel" ? round.word : undefined;
  const label = phase === "waiting" ? "WAIT" : wordMode && phase === "word" ? word! : !wordMode && phase === "draw" ? "DRAW!" : !wordMode && phase === "aim" ? "FIRE!" : result ? result.outcome.toUpperCase().replace("-", " ") : "THE STREET IS QUIET";
  const prompt = phase === "waiting" ? "Keep still. Any early action loses the round." : wordMode && phase === "word" ? "Type the word exactly, then strike Enter." : !wordMode && phase === "draw" ? "Clear leather now. Then fire." : !wordMode && phase === "aim" ? "Your gun is drawn. Fire before Ash does." : result ? result.message : "Face the challenger when you are ready.";
  const button = phase === "menu" || phase === "result" ? "START DUEL" : phase === "waiting" ? "HOLD" : !wordMode && phase === "draw" ? "DRAW GUN" : "FIRE";
  const action = wordMode && phase === "word" ? `<form id="word-form" class="word-entry"><label for="word-input">TYPE THE SIGNAL</label><input id="word-input" autocomplete="off" autocapitalize="characters" spellcheck="false" enterkeyhint="done" aria-label="Type the signal word" /><button class="primary" type="submit">FIRE WORD</button></form>` : `<button id="shot-button" class="primary shot-button">${button}</button><p class="key-hint">CLICK / TAP / <kbd>SPACE</kbd></p>`;
  return layout(`<section class="duel" data-phase="${phase}" data-result="${result?.outcome ?? ""}"><div class="duel-sky"><div class="duel-sun"></div><div class="cloud cloud-one"></div><div class="cloud cloud-two"></div></div><div class="horizon"></div><div class="street"></div><div class="opponent" aria-hidden="true"><span class="hat"></span><span class="head"></span><span class="torso"></span><span class="arm"></span></div><div class="gunslinger" aria-hidden="true"><span class="player-hat"></span><span class="player-body"></span><span class="hand"><i></i></span><span class="holster"></span><span class="flash"></span></div><div class="duel-panel"><p class="eyebrow">${wordMode ? "WORD DUEL" : "DRAW & FIRE"} · ROUND ${String(round.number || 1).padStart(2, "0")}</p><h1>${label}</h1><p class="duel-prompt" aria-live="assertive">${prompt}</p>${result ? `<div class="scoreline"><span>YOU ${result.reactionMs ? `${result.reactionMs} MS` : "EARLY"}</span><span>RIVAL ${result.opponentReactionMs} MS</span></div>` : ""}${action}</div></section><section class="scoreboard"><div><span>WINS</span><b>${stats.wins}</b></div><div><span>LOSSES</span><b>${stats.losses}</b></div><div><span>LOCAL BEST</span><b>${stats.best ? `${stats.best} MS` : "--"}</b></div><div><span>OPPONENT</span><b>ASH MERCER</b></div></section>`);
}

function multiplayerView() {
  return layout(`<section class="page-header"><p class="eyebrow">TWO GUNSLINGERS. ONE STREET.</p><h1>Multiplayer</h1><p>Ride with a friend soon. Online duels are being prepared for the next frontier.</p></section><section class="lobby"><div class="coming">COMING SOON</div><div class="slots"><div><span>PLAYER ONE</span><b>YOUR SEAT</b></div><div><span>PLAYER TWO</span><b>OPEN SEAT</b></div></div><div class="lobby-controls"><button class="primary" disabled>CREATE ROOM</button><label>ROOM CODE<input disabled placeholder="ABC-123"></label><button class="outline" disabled>JOIN ROOM</button></div><p>Room codes and live matches will appear here when the service rides in.</p></section>`);
}

function howToView() {
  return layout(`<section class="page-header"><p class="eyebrow">KNOW THE RULES</p><h1>How to Play</h1><p>Choose one of two versus-AI duels. Both punish false starts.</p></section><section class="rules"><article><b>01</b><h2>Word Duel</h2><p>After a random wait, type the displayed <strong>SHOOT</strong>, <strong>DRAW</strong>, or <strong>POW</strong> exactly and press Enter. A wrong word does not fire; Ash still reacts.</p></article><article><b>02</b><h2>Draw &amp; Fire</h2><p>After <strong>DRAW!</strong>, click, tap, or press Space to draw your gun, then fire with a second action before Ash reacts.</p></article><article><b>03</b><h2>Hold steady</h2><p>Any action before the signal is a false start and a loss. The signal appears after two to six seconds.</p></article></section>`);
}

function render() {
  root.innerHTML = page === "home" ? homeView() : page === "mode-select" ? modeSelectView() : page === "game" ? gameView() : page === "multiplayer" ? multiplayerView() : howToView();
  root.querySelectorAll<HTMLElement>("[data-page]").forEach(button => button.addEventListener("click", () => nav(button.dataset.page as Page)));
  root.querySelectorAll<HTMLElement>("[data-mode]").forEach(button => button.addEventListener("click", () => { mode = button.dataset.mode as GameMode; nav("game"); }));
  root.querySelector("#shot-button")?.addEventListener("click", takeAction);
  root.querySelector<HTMLFormElement>("#word-form")?.addEventListener("submit", event => { event.preventDefault(); submitWord(); });
  if (round.mode === "word-duel" && round.phase === "word") window.setTimeout(() => root.querySelector<HTMLInputElement>("#word-input")?.focus(), 0);
}

function beginRound() {
  const timing = createRoundTiming();
  if (mode === "word-duel") {
    round = { number: round.number + 1, mode: "word-duel", phase: "waiting", opponentReactionMs: timing.opponentReactionMs };
  } else {
    round = { number: round.number + 1, mode: "draw-fire", phase: "waiting", opponentReactionMs: timing.opponentReactionMs };
  }
  render();
  drawTimer = window.setTimeout(() => {
    const signalAt = performance.now();
    if (round.mode === "word-duel") {
      round = { ...round, phase: "word", word: randomDuelWord(), wordAt: signalAt };
    } else {
      round = { ...round, phase: "draw", drawAt: signalAt };
    }
    render();
    opponentTimer = window.setTimeout(() => finish(resolveShot(round.opponentReactionMs!, round.opponentReactionMs!)), round.opponentReactionMs);
  }, timing.waitMs);
}

function takeAction() {
  if (round.phase === "menu" || round.phase === "result") beginRound();
  else if (round.phase === "waiting") finish(falseStart(round.opponentReactionMs!));
  else if (round.mode === "draw-fire" && round.phase === "draw") { round = { ...round, phase: "aim" }; render(); }
  else if (round.mode === "draw-fire" && round.phase === "aim") finish(resolveShot(Math.round(performance.now() - round.drawAt!), round.opponentReactionMs!));
}

function submitWord() {
  if (round.mode !== "word-duel" || round.phase !== "word") return;
  const input = root.querySelector<HTMLInputElement>("#word-input");
  if (!input || input.value !== round.word) { input?.focus(); return; }
  finish(resolveShot(Math.round(performance.now() - round.wordAt!), round.opponentReactionMs!));
}

function finish(result: DuelResult) {
  clearTimers();
  if (result.outcome === "win") { stats.wins++; if (!stats.best || result.reactionMs! < stats.best) stats.best = result.reactionMs!; }
  else stats.losses++;
  saveStats();
  round = { ...round, phase: "result", result } as Round;
  render();
}

document.addEventListener("keydown", event => {
  if (event.code !== "Space" || event.repeat || page !== "game" || document.activeElement?.tagName === "INPUT") return;
  event.preventDefault(); takeAction();
});
render();
