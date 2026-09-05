import "./style.css";
import { createRoundTiming, falseStart, randomBetween, randomDuelWord, resolveShot, settings } from "./game/rules";
import { aiTrailScore, createTrail, scoreTrail, type TrailPoint } from "./game/trail";
import { multiplayer } from "./services/multiplayer";
import type { AiDifficulty, DuelResult, GameMode, MultiplayerRound, Room, Round } from "./types";

type Page = "home" | "mode-select" | "game" | "multiplayer" | "how-to";
const appVersion = "1.9.1";
const root = document.querySelector<HTMLDivElement>("#app")!;
let page: Page = "home";
let mode: GameMode = "original-quick-draw";
let aiDifficulty: AiDifficulty = "normal";
let round: Round = { number: 0, mode: "original-quick-draw", phase: "menu" };
let drawTimer: number | undefined;
let opponentTimer: number | undefined;
let stats = readStats();
let multiplayerRoom: Room | null = null;
let multiplayerUserId: string | null = null;
let multiplayerNotice = "";
let multiplayerBusy = false;
let stopRoomSubscription: (() => void) | undefined;
let quickMatchMode: GameMode = "original-quick-draw";
let quickMatchStatus: "idle" | "searching" | "matched" | "error" = "idle";
let quickMatchNotice = "";
let stopQuickMatchSubscription: (() => void) | undefined;
let multiplayerActionBusy = false;
let sharedStartPending = false;
let multiplayerSession = 0;
let tracePoints: TrailPoint[] = [];
let traceDrawing = false;

function readStats() {
  try { return JSON.parse(localStorage.getItem("high-noon-stats") ?? "{\"wins\":0,\"losses\":0,\"best\":null}") as { wins: number; losses: number; best: number | null }; }
  catch { return { wins: 0, losses: 0, best: null }; }
}
function saveStats() { try { localStorage.setItem("high-noon-stats", JSON.stringify(stats)); } catch { /* Storage is optional. */ } }
function clearTimers() { window.clearTimeout(drawTimer); window.clearTimeout(opponentTimer); drawTimer = undefined; opponentTimer = undefined; }
function nav(next: Page) {
  clearTimers();
  const keepRoom = next === "multiplayer" || (next === "game" && multiplayerRoom?.status === "playing");
  if (!keepRoom) {
    stopRoomSubscription?.(); stopRoomSubscription = undefined;
    stopQuickMatchSubscription?.(); stopQuickMatchSubscription = undefined;
    if (quickMatchStatus === "searching") void multiplayer.cancelQuickMatch();
    quickMatchStatus = "idle";
  }
  page = next;
  if (!keepRoom || next !== "game") round = mode === "word-duel"
    ? { number: round.number, mode: "word-duel", phase: "menu" }
    : mode === "trail-trace" ? { number: round.number, mode: "trail-trace", phase: "menu", pathSeed: 0 }
    : { number: round.number, mode: "original-quick-draw", phase: "menu" };
  render();
  if (next === "multiplayer" && multiplayerRoom) listenToRoom();
}

function layout(content: string) {
  return `<main class="shell">
    <header class="masthead"><button class="brand" data-page="home" aria-label="High Noon Showdown home"><span>HN</span> HIGH NOON SHOWDOWN</button><nav><button data-page="mode-select">PLAY</button><button data-page="multiplayer">MULTIPLAYER</button><button data-page="how-to">HOW TO PLAY</button></nav></header>
    ${content}
    <footer><span>ORIGINAL WESTERN DUEL GAME</span><span>ONE BELL. ONE SHOT.</span><span>VERSION ${appVersion}</span></footer>
  </main>`;
}

function fullscreenButton() {
  const isFullscreen = document.fullscreenElement !== null;
  return `<button id="fullscreen-toggle" class="outline fullscreen-toggle" aria-pressed="${isFullscreen}">${isFullscreen ? "EXIT FULL SCREEN" : "FULL SCREEN"}</button>`;
}

function updateFullscreenToggle() {
  const button = root.querySelector<HTMLButtonElement>("#fullscreen-toggle");
  if (!button) return;
  const isFullscreen = document.fullscreenElement !== null;
  button.textContent = isFullscreen ? "EXIT FULL SCREEN" : "FULL SCREEN";
  button.setAttribute("aria-pressed", String(isFullscreen));
}

function toggleFullscreen() {
  if (document.fullscreenElement) {
    const exit = document.exitFullscreen;
    if (exit) void exit.call(document).catch(() => undefined);
  } else {
    const request = document.documentElement.requestFullscreen;
    if (document.fullscreenEnabled && request) void request.call(document.documentElement).catch(() => undefined);
  }
}

function homeView() {
  return layout(`<section class="hero"><div class="sun"></div><div class="mesa mesa-far"></div><div class="mesa mesa-near"></div><div class="dust"></div><div class="hero-copy"><p class="eyebrow">A QUICK-DRAW DUEL AT SUNSET</p><h1>HIGH NOON<br><i>SHOWDOWN</i></h1><p class="lead">Three ways to face Ash Mercer: quick draw, precision typing, or a steady hand on the trail.</p><div class="hero-actions"><button class="primary" data-page="mode-select">PLAY VS AI</button><button class="outline" data-page="how-to">HOW TO PLAY</button></div></div><p class="corner-note">NO EXTERNAL ASSETS<br>ORIGINAL FRONTIER TALE</p></section>
  <section class="home-cards"><article><b>01</b><h2>Choose your duel.</h2><p>Quick Draw, Word Duel, or Trail Trace: each tests a different skill.</p></article><article><b>02</b><h2>Hold your line.</h2><p>Trail Trace rewards distance travelled and how accurately you follow its course.</p></article><article><b>${stats.best ?? "--"}</b><h2>Local best.</h2><p>Milliseconds from signal to a winning action.</p></article></section>`);
}

function modeSelectView() {
  const selectedMode = (value: GameMode) => mode === value ? " data-selected=\"true\"" : "";
  const selectedDifficulty = (value: AiDifficulty) => aiDifficulty === value ? " data-selected=\"true\" aria-pressed=\"true\"" : " aria-pressed=\"false\"";
  return layout(`<section class="page-header"><p class="eyebrow">PLAY VS AI</p><h1>Choose Your Duel</h1><p>Choose an original duel and Ash Mercer's ability. Quick Draw and Word Duel retain their unpredictable wait.</p></section><section class="mode-cards"><article${selectedMode("original-quick-draw")}><p class="eyebrow">MODE 01</p><h2>Original Quick Draw</h2><p>Wait for DRAW!, then shoot once with a click, tap, or Space. Fastest reaction wins.</p><button class="outline" data-mode="original-quick-draw">${mode === "original-quick-draw" ? "SELECTED" : "SELECT QUICK DRAW"}</button></article><article${selectedMode("word-duel")}><p class="eyebrow">MODE 02</p><h2>Word Duel</h2><p>Wait for the signal, then type the one word shown: SHOOT, DRAW, or POW. Exact spelling wins the draw.</p><button class="outline" data-mode="word-duel">${mode === "word-duel" ? "SELECTED" : "SELECT WORD DUEL"}</button></article><article${selectedMode("trail-trace")}><p class="eyebrow">MODE 03</p><h2>Trail Trace</h2><p>Hold a mouse, finger, or pen on the canvas and follow the winding trail. Progress and line accuracy set your score.</p><button class="outline" data-mode="trail-trace">${mode === "trail-trace" ? "SELECTED" : "SELECT TRAIL TRACE"}</button></article></section><section class="difficulty-select" aria-labelledby="difficulty-title"><p class="eyebrow">ASH MERCER'S ABILITY</p><h2 id="difficulty-title">Choose Difficulty</h2><p>For Trail Trace, difficulty changes Ash's simulated tracing score. For the other duels, it changes reaction time.</p><div class="difficulty-options"><button data-ai-difficulty="easy"${selectedDifficulty("easy")}><b>EASY</b><span>Forgiving trail or slow draw</span></button><button data-ai-difficulty="normal"${selectedDifficulty("normal")}><b>NORMAL</b><span>Town-standard rival</span></button><button data-ai-difficulty="hard"${selectedDifficulty("hard")}><b>HARD</b><span>Precise trail or fast draw</span></button></div><button class="primary start-ai-duel" id="start-ai-duel">PLAY ${mode === "trail-trace" ? "TRAIL TRACE" : mode === "word-duel" ? "WORD DUEL" : "QUICK DRAW"} · ${aiDifficulty.toUpperCase()}</button></section>`);
}

function traceView(seed: number, title: string, prompt: string, result?: string, disabled = false, start = false) {
  return layout(`<section class="trace-game"><div class="trace-heading"><p class="eyebrow">${title}</p><h1>${result ?? "TRACE THE TRAIL"}</h1><p>${prompt}</p></div><canvas id="trail-canvas" class="trail-canvas" aria-label="Trace the glowing winding trail" data-seed="${seed}" ${disabled ? "data-disabled=true" : ""}></canvas><p class="trace-hint">PRESS, HOLD, AND FOLLOW THE GOLD LINE. RELEASE TO SUBMIT.</p>${start ? `<button id="shot-button" class="primary">START TRAIL</button>` : ""}${fullscreenButton()}</section>`);
}

function gameView() {
  if (multiplayerRoom?.status === "playing" && multiplayerRoom.roundState.round) return multiplayerGameView();
  if (round.mode === "trail-trace") {
    const result = round.result;
    const prompt = result ? `${result.message} You ${round.playerScore} points. Ash ${result.opponentReactionMs} points.` : "Start at the left marker, keep your pointer near the trail, and reach its far end.";
    return traceView(round.pathSeed, `TRAIL TRACE · ${aiDifficulty.toUpperCase()} · ROUND ${String(round.number || 1).padStart(2, "0")}`, prompt, result?.outcome === "win" ? "YOU WIN" : result ? "ASH TAKES IT" : undefined, Boolean(result) || round.phase === "menu", round.phase === "menu" || round.phase === "result");
  }
  const result = round.result;
  const phase = round.phase;
  const wordMode = round.mode === "word-duel";
  const quickDrawMode = round.mode === "original-quick-draw";
  const word = round.mode === "word-duel" ? round.word : undefined;
  const label = phase === "waiting" ? "WAIT" : wordMode && phase === "word" ? word! : quickDrawMode && phase === "draw" ? "DRAW!" : result ? result.outcome.toUpperCase().replace("-", " ") : "THE STREET IS QUIET";
  const prompt = phase === "waiting" ? "Wait for the signal. An early action loses the round." : wordMode && phase === "word" ? "Type the word exactly, then press Enter." : quickDrawMode && phase === "draw" ? "DRAW! Shoot once before Ash reacts." : result ? result.message : "Face the challenger when you are ready.";
  const button = phase === "menu" || phase === "result" ? "START DUEL" : quickDrawMode && phase === "draw" ? "SHOOT" : "FIRE";
  const action = phase === "waiting" ? `<p class="waiting-note">SIGNAL INCOMING</p>` : wordMode && phase === "word" ? `<form id="word-form" class="word-entry"><label for="word-input">TYPE THE SIGNAL</label><input id="word-input" autocomplete="off" autocapitalize="off" inputmode="text" spellcheck="false" enterkeyhint="done" aria-label="Type the signal word and press Enter" /></form>` : `<button id="shot-button" class="primary shot-button">${button}</button><p class="key-hint">CLICK / TAP / <kbd>SPACE</kbd></p>`;
  return layout(`<section class="duel" data-phase="${phase}" data-result="${result?.outcome ?? ""}"><div class="duel-sky"><div class="duel-sun"></div><div class="cloud cloud-one"></div><div class="cloud cloud-two"></div></div><div class="horizon"></div><div class="street"></div><div class="opponent" aria-hidden="true"><span class="hat"></span><span class="head"></span><span class="torso"></span><span class="arm"></span></div><div class="gunslinger" aria-hidden="true"><span class="player-hat"></span><span class="player-body"></span><span class="hand"><i class="revolver"><b></b></i></span><span class="holster"></span><span class="flash"></span></div><div class="duel-panel"><p class="eyebrow">${quickDrawMode ? "ORIGINAL QUICK DRAW" : "WORD DUEL"} · ${aiDifficulty.toUpperCase()} · ROUND ${String(round.number || 1).padStart(2, "0")}</p><h1>${label}</h1><p class="duel-prompt" aria-live="assertive">${prompt}</p>${result ? `<div class="scoreline"><span>YOU ${result.reactionMs ? `${result.reactionMs} MS` : "EARLY"}</span><span>RIVAL ${result.opponentReactionMs} MS</span></div>` : ""}<div class="duel-controls">${action}${fullscreenButton()}</div></div></section><section class="scoreboard"><div><span>WINS</span><b>${stats.wins}</b></div><div><span>LOSSES</span><b>${stats.losses}</b></div><div><span>LOCAL BEST</span><b>${stats.best ? `${stats.best} MS` : "--"}</b></div><div><span>DIFFICULTY</span><b>${aiDifficulty.toUpperCase()}</b></div></section>`);
}

function multiplayerGameView() {
  const room = multiplayerRoom!;
  const shared = room.roundState.round!;
  const isHost = room.hostId === multiplayerUserId;
  const mine = isHost ? shared.hostAction : shared.guestAction;
  const opponent = isHost ? shared.guestAction : shared.hostAction;
  const wordMode = room.mode === "word-duel";
  const traceMode = room.mode === "trail-trace";
  const ended = Boolean(shared.winner);
  const won = shared.winner === (isHost ? "host" : "guest");
  if (traceMode) {
    const mineScore = mine?.score;
    const opponentScore = opponent?.score;
    const prompt = ended ? `You scored ${mineScore ?? 0}; your rival scored ${opponentScore ?? 0}. ${isHost ? "Start the next round when ready." : "Wait for the host to start the next round."}` : mine ? "Score submitted. Waiting for your rival's trace." : "Start at the left marker, hold your pointer on the canvas, and release after reaching the far end.";
    const controls = ended ? `<div class="duel-actions">${isHost ? `<button id="next-round" class="primary">NEXT ROUND</button>` : ""}<button id="leave-duel" class="outline">LEAVE ROOM</button></div>` : "";
    return layout(`<section class="trace-game"><div class="trace-heading"><p class="eyebrow">LIVE TRAIL TRACE · ROOM ${room.code}</p><h1>${ended ? (won ? "YOU WIN" : "YOU LOSE") : mine ? "SCORE LOCKED" : "TRACE THE TRAIL"}</h1><p>${prompt}</p></div><canvas id="trail-canvas" class="trail-canvas" aria-label="Trace the shared winding trail" data-seed="${shared.pathSeed}" ${mine || ended ? "data-disabled=true" : ""}></canvas><p class="trace-hint">BOTH PLAYERS TRACE THIS SAME SEEDED TRAIL. HIGHEST SCORE WINS.</p>${controls}${fullscreenButton()}</section><section class="scoreboard"><div><span>YOUR SCORE</span><b>${mineScore ?? "--"}</b></div><div><span>RIVAL SCORE</span><b>${opponentScore ?? "--"}</b></div><div><span>YOUR PROGRESS</span><b>${mine?.progress ?? "--"}${mine ? "%" : ""}</b></div><div><span>YOUR ACCURACY</span><b>${mine?.accuracy ?? "--"}${mine ? "%" : ""}</b></div></section>`);
  }
  const waiting = Date.now() < Date.parse(shared.startAt);
  const label = ended ? (won ? "YOU WIN" : "YOU LOSE") : waiting ? "WAIT" : wordMode ? shared.word! : "DRAW!";
  const prompt = ended ? `${mine?.falseStart ? "False start." : won ? "You were first on the signal." : "Your opponent was first on the signal."} ${isHost ? "Start the next round when ready." : "Wait for the host to start the next round."}` : waiting ? "Shared signal incoming. An early action loses." : wordMode ? "Type the shared word exactly, then press Enter." : "DRAW! Send your one shot.";
  const action = ended
    ? `<div class="duel-actions">${isHost ? `<button id="next-round" class="primary">NEXT ROUND</button>` : "<p class=\"waiting-note\">HOST CHOOSES THE NEXT ROUND</p>"}<button id="leave-duel" class="outline" ${multiplayerBusy ? "disabled" : ""}>LEAVE ROOM</button></div>`
    : waiting ? `<button id="shot-button" class="outline" ${multiplayerActionBusy || mine ? "disabled" : ""}>FALSE START</button><p class="key-hint">EARLY ACTION LOSES</p>`
    : wordMode ? `<form id="word-form" class="word-entry"><label for="word-input">TYPE THE SIGNAL</label><input id="word-input" autocomplete="off" autocapitalize="off" inputmode="text" spellcheck="false" enterkeyhint="done" ${multiplayerActionBusy || mine ? "disabled" : ""} aria-label="Type the shared signal word and press Enter" /></form>`
    : `<button id="shot-button" class="primary shot-button" ${multiplayerActionBusy || mine ? "disabled" : ""}>SHOOT</button><p class="key-hint">CLICK / TAP / <kbd>SPACE</kbd></p>`;
  const resultRows = ended || mine || opponent ? `<div class="scoreline multiplayer-score"><span>YOU ${mine?.falseStart ? "EARLY" : mine ? `${mine.reactionMs} MS` : "--"}</span><span>RIVAL ${opponent?.falseStart ? "EARLY" : opponent ? `${opponent.reactionMs} MS` : "--"}</span></div>` : "";
  return layout(`<section class="duel" data-phase="${waiting ? "waiting" : wordMode ? "word" : "draw"}" data-result="${ended ? (won ? "win" : "loss") : ""}"><div class="duel-sky"><div class="duel-sun"></div><div class="cloud cloud-one"></div><div class="cloud cloud-two"></div></div><div class="horizon"></div><div class="street"></div><div class="opponent" aria-hidden="true"><span class="hat"></span><span class="head"></span><span class="torso"></span><span class="arm"></span></div><div class="gunslinger" aria-hidden="true"><span class="player-hat"></span><span class="player-body"></span><span class="hand"><i class="revolver"><b></b></i></span><span class="holster"></span><span class="flash"></span></div><div class="duel-panel"><p class="eyebrow">LIVE ${wordMode ? "WORD DUEL" : "ORIGINAL QUICK DRAW"} · ROOM ${room.code}</p><h1>${label}</h1><p class="duel-prompt" aria-live="assertive">${prompt}</p>${resultRows}<div class="duel-controls">${action}${fullscreenButton()}</div></div></section><section class="scoreboard"><div><span>YOUR RESULT</span><b>${ended ? (won ? "WIN" : "LOSS") : "LIVE"}</b></div><div><span>YOUR REACTION</span><b>${mine?.falseStart ? "EARLY" : mine ? `${mine.reactionMs} MS` : "--"}</b></div><div><span>RIVAL REACTION</span><b>${opponent?.falseStart ? "EARLY" : opponent ? `${opponent.reactionMs} MS` : "--"}</b></div><div><span>ROOM</span><b>${room.code}</b></div></section>`);
}

function modeOptions(selected: GameMode) {
  return `<option value="original-quick-draw" ${selected === "original-quick-draw" ? "selected" : ""}>QUICK DRAW</option><option value="word-duel" ${selected === "word-duel" ? "selected" : ""}>WORD DUEL</option><option value="trail-trace" ${selected === "trail-trace" ? "selected" : ""}>TRAIL TRACE</option>`;
}

function multiplayerView() {
  if (!multiplayer.isConfigured()) return layout(`<section class="page-header"><p class="eyebrow">TWO GUNSLINGERS. ONE STREET.</p><h1>Multiplayer</h1><p>Invite a friend to a live lobby, then ready up for the next duel.</p></section><section class="lobby"><div class="lobby-error" role="alert">SUPABASE CONFIGURATION REQUIRED</div><p>Add <code>VITE_SUPABASE_URL</code> and <code>VITE_SUPABASE_PUBLISHABLE_KEY</code> to your environment, then redeploy. See <code>.env.example</code> and README.md for setup.</p></section>`);
  const room = multiplayerRoom;
  const isHost = room?.hostId === multiplayerUserId;
  const ownReady = isHost ? room?.roundState.hostReady : room?.roundState.guestReady;
  const disabled = multiplayerBusy ? "disabled" : "";
  const hostLabel = room ? (isHost ? "YOU (HOST)" : "HOST CONNECTED") : "YOUR SEAT";
  const guestLabel = room?.guestId ? (isHost ? "GUEST CONNECTED" : "YOU") : "OPEN SEAT";
  const message = multiplayerNotice || (room ? (room.status === "ready" ? "Both gunslingers are ready. The shared round-state channel is live." : room.guestId ? "Both players must ready up." : "Share this code with your opponent, then wait for them to join.") : "Create a private room or join your friend's code. Anonymous sign-in happens automatically.");
  const quickMessage = quickMatchNotice || (quickMatchStatus === "searching" ? "Searching for a gunslinger who selected this mode..." : quickMatchStatus === "matched" ? "Match found. Your duel room is ready." : "Choose a mode, then search the public Quick Game queue.");
  const roomControls = room
    ? `<div class="lobby-controls"><button class="primary" id="ready-room" ${disabled}>${ownReady ? "NOT READY" : "READY UP"}</button><button class="outline" id="leave-room" ${disabled}>LEAVE ROOM</button></div><p class="lobby-message" aria-live="polite">${message}</p>`
    : `<section class="quick-match"><p class="eyebrow">QUICK GAME</p><div class="quick-match-controls"><label>DUEL MODE<select id="quick-match-mode" ${disabled}>${modeOptions(quickMatchMode)}</select></label><button class="primary" id="quick-game" ${quickMatchStatus === "searching" ? "disabled" : disabled}>QUICK GAME</button><button class="outline" id="cancel-search" ${quickMatchStatus === "idle" ? "disabled" : disabled}>CANCEL SEARCH</button></div><p class="quick-match-status" data-status="${quickMatchStatus}" aria-live="polite">${quickMatchStatus.toUpperCase()} · ${quickMessage}</p></section><div class="lobby-controls"><button class="primary" id="create-room" ${disabled}>CREATE ROOM</button><label>DUEL MODE<select id="room-mode" ${disabled}>${modeOptions("original-quick-draw")}</select></label></div><div class="lobby-controls"><label>ROOM CODE<input id="room-code" maxlength="6" autocomplete="off" placeholder="ABC123" ${disabled} /></label><button class="outline" id="join-room" ${disabled}>JOIN ROOM</button></div><p class="lobby-message" aria-live="polite">${message}</p>`;
  return layout(`<section class="page-header"><p class="eyebrow">TWO GUNSLINGERS. ONE STREET.</p><h1>Multiplayer</h1><p>Private room codes, anonymous seats, and live lobby updates.</p></section><section class="lobby"><div class="lobby-status">${room ? `ROOM ${room.code} · ${room.status.toUpperCase()}` : "LIVE LOBBY"}</div><div class="slots"><div><span>PLAYER ONE</span><b>${hostLabel}</b><small>${room?.roundState.hostReady ? "READY" : "WAITING"}</small></div><div><span>PLAYER TWO</span><b>${guestLabel}</b><small>${room?.roundState.guestReady ? "READY" : "WAITING"}</small></div></div>${roomControls}</section>`);
}

function howToView() {
  return layout(`<section class="page-header"><p class="eyebrow">KNOW THE RULES</p><h1>How to Play</h1><p>Three original versus-AI duels, plus their shared-path multiplayer counterparts.</p></section><section class="rules"><article><b>01</b><h2>Original Quick Draw</h2><p>After <strong>DRAW!</strong>, click, tap, or press Space once to shoot. Your reaction time races Ash's.</p></article><article><b>02</b><h2>Word Duel</h2><p>After a random wait, type the displayed <strong>SHOOT</strong>, <strong>DRAW</strong>, or <strong>POW</strong> exactly and press Enter.</p></article><article><b>03</b><h2>Trail Trace</h2><p>Press and hold on the left marker, follow the glowing path, then release. Score blends how far you travel and how closely you stay on line.</p></article></section>`);
}

function render() {
  root.innerHTML = page === "home" ? homeView() : page === "mode-select" ? modeSelectView() : page === "game" ? gameView() : page === "multiplayer" ? multiplayerView() : howToView();
  root.querySelectorAll<HTMLElement>("[data-page]").forEach(button => button.addEventListener("click", () => nav(button.dataset.page as Page)));
  root.querySelectorAll<HTMLElement>("[data-mode]").forEach(button => button.addEventListener("click", () => { mode = button.dataset.mode as GameMode; render(); }));
  root.querySelectorAll<HTMLElement>("[data-ai-difficulty]").forEach(button => button.addEventListener("click", () => { aiDifficulty = button.dataset.aiDifficulty as AiDifficulty; render(); }));
  root.querySelector("#start-ai-duel")?.addEventListener("click", () => nav("game"));
  root.querySelector("#shot-button")?.addEventListener("click", takeAction);
  root.querySelector<HTMLFormElement>("#word-form")?.addEventListener("submit", event => { event.preventDefault(); submitWord(); });
  root.querySelector("#create-room")?.addEventListener("click", () => void createRoom());
  root.querySelector("#join-room")?.addEventListener("click", () => void joinRoom());
  root.querySelector("#ready-room")?.addEventListener("click", () => void toggleReady());
  root.querySelector("#leave-room")?.addEventListener("click", () => void leaveRoom());
  root.querySelector("#leave-duel")?.addEventListener("click", () => void leaveRoom());
  root.querySelector("#next-round")?.addEventListener("click", () => void startMultiplayerRound());
  root.querySelector("#quick-game")?.addEventListener("click", () => void startQuickMatch());
  root.querySelector("#cancel-search")?.addEventListener("click", () => void cancelQuickMatch());
  root.querySelector("#fullscreen-toggle")?.addEventListener("click", toggleFullscreen);
  const canvas = root.querySelector<HTMLCanvasElement>("#trail-canvas");
  if (canvas) setupTrailCanvas(canvas);
  if ((round.mode === "word-duel" && round.phase === "word") || (multiplayerRoom?.status === "playing" && multiplayerRoom.mode === "word-duel" && Date.now() >= Date.parse(multiplayerRoom.roundState.round?.startAt ?? ""))) window.setTimeout(() => root.querySelector<HTMLInputElement>("#word-input")?.focus(), 0);
}

function setupTrailCanvas(canvas: HTMLCanvasElement) {
  const seed = Number(canvas.dataset.seed ?? 0);
  const trail = createTrail(seed);
  const disabled = canvas.dataset.disabled === "true";
  const context = canvas.getContext("2d");
  if (!context) return;
  const resize = () => {
    const bounds = canvas.getBoundingClientRect();
    const ratio = window.devicePixelRatio || 1;
    canvas.width = Math.max(1, Math.round(bounds.width * ratio));
    canvas.height = Math.max(1, Math.round(bounds.height * ratio));
    context.setTransform(ratio, 0, 0, ratio, 0, 0);
    drawTrailCanvas(context, bounds.width, bounds.height, trail, tracePoints);
  };
  resize();
  const toPoint = (event: PointerEvent): TrailPoint => {
    const bounds = canvas.getBoundingClientRect();
    return { x: Math.max(0, Math.min(1, (event.clientX - bounds.left) / bounds.width)), y: Math.max(0, Math.min(1, (event.clientY - bounds.top) / bounds.height)) };
  };
  canvas.onpointerdown = event => {
    if (disabled) return;
    tracePoints = [toPoint(event)]; traceDrawing = true; canvas.setPointerCapture(event.pointerId);
    drawTrailCanvas(context, canvas.clientWidth, canvas.clientHeight, trail, tracePoints);
  };
  canvas.onpointermove = event => {
    if (!traceDrawing || disabled) return;
    tracePoints.push(toPoint(event));
    drawTrailCanvas(context, canvas.clientWidth, canvas.clientHeight, trail, tracePoints);
  };
  const complete = () => {
    if (!traceDrawing || disabled) return;
    traceDrawing = false;
    const result = scoreTrail(tracePoints, trail);
    if (multiplayerRoom?.status === "playing") void submitTrailScore(result);
    else finishTrail(result);
  };
  canvas.onpointerup = complete;
  canvas.onpointercancel = complete;
  window.addEventListener("resize", resize, { once: true });
}

function drawTrailCanvas(context: CanvasRenderingContext2D, width: number, height: number, trail: TrailPoint[], points: TrailPoint[]) {
  context.clearRect(0, 0, width, height);
  const line = (path: TrailPoint[], color: string, size: number) => {
    if (!path.length) return;
    context.beginPath(); context.moveTo(path[0]!.x * width, path[0]!.y * height);
    path.slice(1).forEach(point => context.lineTo(point.x * width, point.y * height));
    context.strokeStyle = color; context.lineWidth = size; context.lineCap = "round"; context.lineJoin = "round"; context.stroke();
  };
  line(trail, "rgba(255, 201, 92, .24)", 18);
  line(trail, "#ffc95c", 4);
  [trail[0], trail[trail.length - 1]].forEach(point => {
    context.beginPath(); context.arc(point!.x * width, point!.y * height, 9, 0, Math.PI * 2); context.fillStyle = "#f7e4b7"; context.fill();
  });
  line(points, "#df573f", 5);
}

function listenToRoom() {
  stopRoomSubscription?.();
  const session = multiplayerSession;
  stopRoomSubscription = multiplayer.subscribeToRoom(nextRoom => {
    if (session !== multiplayerSession) return;
    multiplayerRoom = nextRoom;
    if (!nextRoom) multiplayerNotice = "The host left the room.";
    if (nextRoom?.status === "ready" && nextRoom.hostId === multiplayerUserId) void startMultiplayerRound();
    if (nextRoom?.status === "playing" && nextRoom.roundState.round) {
      syncMultiplayerRound(nextRoom.roundState.round);
      if (page !== "game") { mode = nextRoom.mode; page = "game"; }
      if (nextRoom.hostId === multiplayerUserId && (nextRoom.roundState.round.hostAction || nextRoom.roundState.round.guestAction) && !nextRoom.roundState.round.winner) void resolveMultiplayerRound(nextRoom.roundState.round.id);
    }
    if (page === "multiplayer" || page === "game") render();
  }, message => { if (session !== multiplayerSession) return; multiplayerNotice = message; if (page === "multiplayer") render(); });
}
async function roomAction(action: () => Promise<void>) {
  multiplayerBusy = true; multiplayerNotice = ""; render();
  try { await action(); } catch (error) { multiplayerNotice = error instanceof Error ? error.message : "Unable to update the room."; }
  finally { multiplayerBusy = false; if (page === "multiplayer" || page === "game") render(); }
}
function createRoom() {
  const selectedMode = root.querySelector<HTMLSelectElement>("#room-mode")?.value as GameMode | undefined;
  return roomAction(async () => { multiplayerUserId = await multiplayer.authenticate(); multiplayerRoom = await multiplayer.createRoom(selectedMode); multiplayerNotice = `Room ${multiplayerRoom.code} created. Share the code with your opponent.`; listenToRoom(); });
}
function joinRoom() {
  const code = root.querySelector<HTMLInputElement>("#room-code")?.value ?? "";
  return roomAction(async () => { multiplayerUserId = await multiplayer.authenticate(); multiplayerRoom = await multiplayer.joinRoom(code); multiplayerNotice = `Joined room ${multiplayerRoom.code}. Ready up when you are set.`; listenToRoom(); });
}
function toggleReady() { return roomAction(async () => {
  multiplayerRoom = await multiplayer.setReady(!(multiplayerRoom?.hostId === multiplayerUserId ? multiplayerRoom?.roundState.hostReady : multiplayerRoom?.roundState.guestReady));
  if (multiplayerRoom.status === "ready" && multiplayerRoom.hostId === multiplayerUserId) void startMultiplayerRound();
}); }
function resetMultiplayerState() {
  multiplayerSession++;
  clearTimers();
  stopRoomSubscription?.(); stopRoomSubscription = undefined;
  stopQuickMatchSubscription?.(); stopQuickMatchSubscription = undefined;
  multiplayerRoom = null;
  multiplayerUserId = null;
  multiplayerActionBusy = false;
  sharedStartPending = false;
  quickMatchStatus = "idle";
  quickMatchNotice = "";
}
function leaveRoom() {
  if (multiplayerBusy) return;
  return roomAction(async () => {
    try { await multiplayer.leaveRoom(); }
    finally {
      // A failed room mutation must not trap either player on the result screen.
      resetMultiplayerState();
      multiplayerNotice = "You left the room.";
      page = "multiplayer";
    }
  });
}
function startQuickMatch() {
  quickMatchMode = root.querySelector<HTMLSelectElement>("#quick-match-mode")?.value as GameMode ?? quickMatchMode;
  return roomAction(async () => {
    try {
      multiplayerUserId = await multiplayer.authenticate();
      quickMatchStatus = "searching"; quickMatchNotice = "";
      stopQuickMatchSubscription?.();
      stopQuickMatchSubscription = multiplayer.subscribeToQuickMatch(nextRoom => {
        multiplayerRoom = nextRoom; quickMatchStatus = "matched"; quickMatchNotice = `Matched in room ${nextRoom.code}. Ready up when you are set.`;
        stopQuickMatchSubscription?.(); stopQuickMatchSubscription = undefined; listenToRoom();
        if (page === "multiplayer") render();
      }, message => { quickMatchStatus = "error"; quickMatchNotice = message; if (page === "multiplayer") render(); });
      const nextRoom = await multiplayer.requestQuickMatch(quickMatchMode);
      if (nextRoom) { multiplayerRoom = nextRoom; quickMatchStatus = "matched"; quickMatchNotice = `Matched in room ${nextRoom.code}. Ready up when you are set.`; stopQuickMatchSubscription?.(); stopQuickMatchSubscription = undefined; listenToRoom(); }
    } catch (error) {
      quickMatchStatus = "error";
      quickMatchNotice = error instanceof Error ? error.message : "Unable to start Quick Game.";
    }
  });
}
function cancelQuickMatch() {
  return roomAction(async () => {
    const nextRoom = await multiplayer.cancelQuickMatch();
    stopQuickMatchSubscription?.(); stopQuickMatchSubscription = undefined;
    if (nextRoom) { multiplayerRoom = nextRoom; quickMatchStatus = "matched"; quickMatchNotice = `Matched in room ${nextRoom.code}. Ready up when you are set.`; listenToRoom(); }
    else { quickMatchStatus = "idle"; quickMatchNotice = "Search cancelled."; }
  });
}

async function startMultiplayerRound() {
  const room = multiplayerRoom;
  if (!room || room.hostId !== multiplayerUserId || !room.guestId || !room.roundState.hostReady || !room.roundState.guestReady || (room.status !== "ready" && !room.roundState.round?.winner) || sharedStartPending) return;
  const session = multiplayerSession;
  sharedStartPending = true;
  multiplayerActionBusy = false;
  tracePoints = [];
  try {
    const startAt = new Date(Date.now() + (room.mode === "trail-trace" ? 0 : randomBetween(settings.minWaitMs, settings.maxWaitMs))).toISOString();
    const shared: MultiplayerRound = {
      id: crypto.randomUUID(),
      startAt,
      ...(room.mode === "word-duel" ? { word: randomDuelWord() } : {}),
      ...(room.mode === "trail-trace" ? { pathSeed: crypto.getRandomValues(new Uint32Array(1))[0]! } : {}),
    };
    const nextRoom = await multiplayer.startRound(shared);
    if (session !== multiplayerSession) return;
    multiplayerRoom = nextRoom;
    syncMultiplayerRound(shared);
    mode = room.mode;
    page = "game";
    render();
  } catch (error) {
    if (session !== multiplayerSession) return;
    multiplayerNotice = error instanceof Error ? error.message : "Unable to start the shared round.";
    if (page === "multiplayer" || page === "game") render();
  } finally { if (session === multiplayerSession) sharedStartPending = false; }
}

function syncMultiplayerRound(shared: MultiplayerRound) {
  clearTimers();
  const delay = Date.parse(shared.startAt) - Date.now();
  if (!shared.winner && delay > 0) drawTimer = window.setTimeout(() => { if (page === "game") render(); }, delay + 5);
}

async function resolveMultiplayerRound(roundId: string) {
  const session = multiplayerSession;
  try {
    const nextRoom = await multiplayer.resolveRound(roundId);
    if (session === multiplayerSession) multiplayerRoom = nextRoom;
  } catch (error) {
    if (session === multiplayerSession) multiplayerNotice = error instanceof Error ? error.message : "Unable to resolve the round.";
  }
}

async function sendMultiplayerAction(falseStartAction = false) {
  const room = multiplayerRoom;
  const shared = room?.roundState.round;
  if (!room || !shared || multiplayerActionBusy || shared.winner) return;
  const session = multiplayerSession;
  const isHost = room.hostId === multiplayerUserId;
  if (isHost ? shared.hostAction : shared.guestAction) return;
  multiplayerActionBusy = true;
  render();
  try {
    const reactionMs = Math.max(0, Math.round(Date.now() - Date.parse(shared.startAt)));
    const nextRoom = await multiplayer.submitRoundAction(shared.id, reactionMs, falseStartAction || reactionMs === 0 && Date.now() < Date.parse(shared.startAt));
    if (session !== multiplayerSession) return;
    multiplayerRoom = nextRoom;
    if (isHost) await resolveMultiplayerRound(shared.id);
  } catch (error) {
    if (session === multiplayerSession) multiplayerNotice = error instanceof Error ? error.message : "Unable to send your action.";
  } finally {
    if (session === multiplayerSession) {
      multiplayerActionBusy = false;
      if (page === "game") render();
    }
  }
}

async function submitTrailScore(result: { score: number; progress: number; accuracy: number }) {
  const room = multiplayerRoom;
  const shared = room?.roundState.round;
  if (!room || !shared || multiplayerActionBusy || shared.winner) return;
  const isHost = room.hostId === multiplayerUserId;
  multiplayerActionBusy = true;
  render();
  try {
    const nextRoom = await multiplayer.submitRoundAction(shared.id, 0, false, result);
    multiplayerRoom = nextRoom;
    // Trail Trace is resolved only after both score payloads are present.
    if (isHost) await resolveMultiplayerRound(shared.id);
  } catch (error) {
    multiplayerNotice = error instanceof Error ? error.message : "Unable to submit your trail score.";
  } finally {
    multiplayerActionBusy = false;
    if (page === "game") render();
  }
}

function beginRound() {
  tracePoints = [];
  if (mode === "trail-trace") {
    round = { number: round.number + 1, mode: "trail-trace", phase: "tracing", pathSeed: crypto.getRandomValues(new Uint32Array(1))[0]! };
    render();
    return;
  }
  const timing = createRoundTiming(aiDifficulty);
  round = mode === "word-duel"
    ? { number: round.number + 1, mode: "word-duel", phase: "waiting", opponentReactionMs: timing.opponentReactionMs }
    : { number: round.number + 1, mode: "original-quick-draw", phase: "waiting", opponentReactionMs: timing.opponentReactionMs };
  render();
  drawTimer = window.setTimeout(() => {
    const signalAt = performance.now();
    if (round.mode === "word-duel") round = { ...round, phase: "word", word: randomDuelWord(), wordAt: signalAt };
    else if (round.mode === "original-quick-draw") round = { ...round, phase: "draw", drawAt: signalAt };
    render();
    opponentTimer = window.setTimeout(() => finish(resolveShot(round.opponentReactionMs!, round.opponentReactionMs!)), round.opponentReactionMs);
  }, timing.waitMs);
}
function finishTrail(result: { score: number; progress: number; accuracy: number }) {
  const opponentScore = aiTrailScore(aiDifficulty);
  const won = result.score >= opponentScore;
  if (won) stats.wins++; else stats.losses++;
  saveStats();
  round = { ...round, phase: "result", playerScore: result.score, playerProgress: result.progress, playerAccuracy: result.accuracy, result: { outcome: won ? "win" : "loss", opponentReactionMs: opponentScore, message: won ? "Your line held closer through the badlands." : "Ash held the steadier line." } } as Round;
  render();
}
function takeAction() {
  if (multiplayerRoom?.status === "playing") {
    const shared = multiplayerRoom.roundState.round;
    if (shared) void sendMultiplayerAction(Date.now() < Date.parse(shared.startAt));
    return;
  }
  if (round.phase === "menu" || round.phase === "result") beginRound();
  else if (round.phase === "waiting") finish(falseStart(round.opponentReactionMs!));
  else if (round.mode === "original-quick-draw" && round.phase === "draw") finish(resolveShot(Math.round(performance.now() - round.drawAt!), round.opponentReactionMs!));
}
function submitWord() {
  if (multiplayerRoom?.status === "playing") {
    const input = root.querySelector<HTMLInputElement>("#word-input");
    if (input?.value.trim().toUpperCase() === multiplayerRoom.roundState.round?.word) void sendMultiplayerAction();
    else input?.focus();
    return;
  }
  if (round.mode !== "word-duel" || round.phase !== "word") return;
  const input = root.querySelector<HTMLInputElement>("#word-input");
  if (!input || input.value.trim().toUpperCase() !== round.word) { input?.focus(); return; }
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
document.addEventListener("fullscreenchange", updateFullscreenToggle);
render();
