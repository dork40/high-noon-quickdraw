import "./style.css";
import { aiBottleScore, aiRpsChoice, bottleMissPenalty, bottleRoundMs, bottleScore, bottleTargetMs, bottlesPerWave, createBottleSchedule, createRoundTiming, falseStart, randomBetween, randomDuelWord, resolveRps, resolveShot, rpsDecisionMs, settings } from "./game/rules";
import { isMuted, loadMuted, playSound, toggleMuted } from "./game/audio";
import { aiTrailScore, createTrail, isValidTrailScore, scoreTrail, type TrailPoint } from "./game/trail";
import { multiplayer } from "./services/multiplayer";
import type { AiDifficulty, DuelResult, DirectGameMode, GameMode, MultiplayerRound, Room, Round, RpsChoice } from "./types";

type Page = "home" | "mode-select" | "game" | "multiplayer" | "how-to";
const appVersion = "2.3.0";
const root = document.querySelector<HTMLDivElement>("#app")!;
const mobileViewport = window.matchMedia("(max-width: 700px)");
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
let bottleScoreTotal = 0;
let bottleHitIds = new Set<number>();
let bottleRoundId = "";
let seriesPlayerWins = 0;
let seriesOpponentWins = 0;
const seriesModes: DirectGameMode[] = ["original-quick-draw", "word-duel", "trail-trace", "bottle-shot"];
loadMuted();

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
    : mode === "bottle-shot" ? { number: round.number, mode: "bottle-shot", phase: "menu", targetSeed: 0 }
    : mode === "rock-paper-scissors" ? { number: round.number, mode: "rock-paper-scissors", phase: "menu" }
    : { number: round.number, mode: "original-quick-draw", phase: "menu" };
  render();
  if (next === "multiplayer" && multiplayerRoom) listenToRoom();
}

function layout(content: string) {
  return `<main class="shell">
    <header class="masthead"><button class="brand" data-page="home" aria-label="High Noon Showdown home"><span>HN</span> HIGH NOON SHOWDOWN</button><nav><button id="sound-toggle" aria-pressed="${isMuted()}">${isMuted() ? "UNMUTE" : "MUTE"}</button><button data-page="mode-select">PLAY</button><button data-page="multiplayer">MULTIPLAYER</button><button data-page="how-to">HOW TO PLAY</button></nav></header>
    ${content}
    <footer><span>ORIGINAL WESTERN DUEL GAME</span><span>ONE BELL. ONE SHOT.</span><span>VERSION ${appVersion}</span></footer>
  </main>`;
}

function fullscreenButton() {
  const isFullscreen = document.fullscreenElement !== null;
  return `<button id="fullscreen-toggle" class="outline fullscreen-toggle" aria-pressed="${isFullscreen}">${isFullscreen ? "EXIT FULL SCREEN" : "FULL SCREEN"}</button>`;
}

function mobileQuickDrawWait() { return mobileViewport.matches; }

function mobileQuickDrawWaiting() {
  if (!mobileViewport.matches) return false;
  const shared = multiplayerRoom?.status === "playing" ? multiplayerRoom.roundState.round : undefined;
  if (shared) return (shared.gameMode ?? multiplayerRoom!.mode) === "original-quick-draw" && Date.now() < Date.parse(shared.startAt);
  return round.mode === "original-quick-draw" && round.phase === "waiting";
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
  return layout(`<section class="hero"><div class="sun"></div><div class="mesa mesa-far"></div><div class="mesa mesa-near"></div><div class="dust"></div><div class="hero-copy"><p class="eyebrow">A QUICK-DRAW DUEL AT SUNSET</p><h1>HIGH NOON<br><i>SHOWDOWN</i></h1><p class="lead">Face Ash in reflex, precision, nerve, or a best-of-five showdown.</p><div class="hero-actions"><button class="primary" data-page="mode-select">PLAY VS AI</button><button class="outline" data-page="how-to">HOW TO PLAY</button></div></div><p class="corner-note">NO EXTERNAL ASSETS<br>ORIGINAL FRONTIER TALE</p></section>
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

function bottleShotView(seed: number, startAt: number | undefined, endAt: number | undefined, title: string, score: number, opponentScore?: number, result?: string, submitted = false) {
  const now = Date.now();
  const waiting = startAt !== undefined && now < startAt;
  const ended = endAt !== undefined && now >= endAt;
  const waveIndex = startAt === undefined ? -1 : Math.floor((now - startAt) / bottleTargetMs);
  const bottles = !waiting && !ended && waveIndex >= 0 ? createBottleSchedule(seed).slice(waveIndex * bottlesPerWave, (waveIndex + 1) * bottlesPerWave) : [];
  const seconds = endAt ? Math.max(0, Math.ceil((endAt - now) / 1000)) : 30;
  const prompt = result ? `You scored ${score}; ${opponentScore === undefined ? "Ash" : "your rival"} scored ${opponentScore ?? 0}.` : waiting ? "Get set. The shared bottle run starts together." : ended ? (submitted ? "Score sent. Waiting for the host to settle the round." : "Time is up. Sending your score.") : "Shoot green and blue bottles for +10. Red bottles and empty-range shots cost 10. Each bottle breaks after one hit.";
  const bottleButtons = bottles.filter(target => !bottleHitIds.has(target.id)).map(target => `<button class="bottle bottle-${target.kind}" data-bottle-id="${target.id}" style="left:${target.x}%;top:${target.y}%" aria-label="Shoot ${target.kind} bottle">${target.kind === "red" ? "-10" : "+10"}</button>`).join("");
  return layout(`<section class="bottle-game"><div class="bottle-heading"><p class="eyebrow">${title}</p><h1>${result ?? (waiting ? "GET READY" : ended ? "TIME" : "BOTTLE SHOT")}</h1><p>${prompt}</p></div><div class="bottle-stats"><span><b>${seconds}</b> SEC</span><span><b>${score}</b> SCORE</span><span>GREEN / BLUE <b>+10</b></span><span>RED / MISS <b>-10</b></span></div><div class="bottle-range" aria-live="polite">${bottleButtons}</div><p class="trace-hint">${waiting ? "SIX TARGETS APPEAR ON THE BELL." : "TAP OR CLICK A BOTTLE ONCE. EMPTY-RANGE SHOTS COST 10. SIX TARGETS CHANGE EVERY 1.5 SECONDS."}</p>${startAt === undefined ? `<button id="shot-button" class="primary">START BOTTLE SHOT</button>` : result ? `<div class="duel-actions">${title.startsWith("LIVE") && multiplayerRoom?.hostId === multiplayerUserId ? `<button id="next-round" class="primary">NEXT ROUND</button>` : ""}${title.startsWith("LIVE") ? `<button id="leave-duel" class="outline">LEAVE ROOM</button>` : ""}</div>` : ""}${fullscreenButton()}</section><section class="scoreboard"><div><span>YOUR SCORE</span><b>${score}</b></div><div><span>${opponentScore === undefined ? "TARGET" : "RIVAL SCORE"}</span><b>${opponentScore ?? "--"}</b></div><div><span>ROUND TIME</span><b>30 SEC</b></div><div><span>MODE</span><b>BOTTLE SHOT</b></div></section>`);
}

function gameView() {
  if (multiplayerRoom?.status === "playing" && multiplayerRoom.roundState.round) return multiplayerGameView();
  if (round.mode === "rock-paper-scissors") return rpsView(round.playerChoice, round.opponentChoice, round.result, `ROCK PAPER SCISSORS · ${aiDifficulty.toUpperCase()}`, [seriesPlayerWins, seriesOpponentWins], round.decisionEndsAt, round.number, seriesPlayerWins === 3 || seriesOpponentWins === 3);
  if (round.mode === "trail-trace") {
    const result = round.result;
    const prompt = result ? `${result.message} You ${round.playerScore} points. Ash ${result.opponentReactionMs} points.` : "Start at the left marker, keep your pointer near the trail, and reach its far end.";
    return traceView(round.pathSeed, `TRAIL TRACE · ${aiDifficulty.toUpperCase()} · ROUND ${String(round.number || 1).padStart(2, "0")}`, prompt, result?.outcome === "win" ? "YOU WIN" : result ? "ASH TAKES IT" : undefined, Boolean(result) || round.phase === "menu", round.phase === "menu" || round.phase === "result");
  }
  if (round.mode === "bottle-shot") {
    const result = round.result;
    return bottleShotView(round.targetSeed, round.startAt, round.endAt, `BOTTLE SHOT · ${aiDifficulty.toUpperCase()} · ROUND ${String(round.number || 1).padStart(2, "0")}`, round.playerScore ?? bottleScoreTotal, result?.opponentReactionMs, result?.outcome === "win" ? "YOU WIN" : result ? "ASH TAKES IT" : undefined);
  }
  const result = round.result;
  const phase = round.phase;
  const wordMode = round.mode === "word-duel";
  const quickDrawMode = round.mode === "original-quick-draw";
  const word = round.mode === "word-duel" ? round.word : undefined;
  const label = phase === "waiting" ? "WAIT" : wordMode && phase === "word" ? word! : quickDrawMode && phase === "draw" ? "DRAW!" : result ? result.outcome.toUpperCase().replace("-", " ") : "THE STREET IS QUIET";
  const prompt = phase === "waiting" ? "Wait for the signal. An early action loses the round." : wordMode && phase === "word" ? "Type the word exactly, then press Enter." : quickDrawMode && phase === "draw" ? "DRAW! Shoot once before Ash reacts." : result ? result.message : "Face the challenger when you are ready.";
  const button = phase === "menu" || phase === "result" ? "START DUEL" : quickDrawMode && phase === "draw" ? "SHOOT" : "FIRE";
  const action = phase === "waiting" ? `<p class="waiting-note">${quickDrawMode && mobileQuickDrawWait() ? "WAIT FOR DRAW!" : "SIGNAL INCOMING"}</p>` : wordMode && phase === "word" ? `<form id="word-form" class="word-entry"><label for="word-input">TYPE THE SIGNAL</label><input id="word-input" autocomplete="off" autocapitalize="off" inputmode="text" spellcheck="false" enterkeyhint="done" aria-label="Type the signal word and press Enter" /></form>` : `<button id="shot-button" class="primary shot-button">${button}</button><p class="key-hint">CLICK / TAP / <kbd>SPACE</kbd></p>`;
  return layout(`<section class="duel" data-phase="${phase}" data-result="${result?.outcome ?? ""}"><div class="duel-sky"><div class="duel-sun"></div><div class="cloud cloud-one"></div><div class="cloud cloud-two"></div></div><div class="horizon"></div><div class="street"></div><div class="opponent" aria-hidden="true"><span class="hat"></span><span class="head"></span><span class="torso"></span><span class="arm"></span></div><div class="gunslinger" aria-hidden="true"><span class="player-hat"></span><span class="player-body"></span><span class="hand"><i class="revolver"><b></b></i></span><span class="holster"></span><span class="flash"></span></div><div class="duel-panel"><p class="eyebrow">${quickDrawMode ? "ORIGINAL QUICK DRAW" : "WORD DUEL"} · ${aiDifficulty.toUpperCase()} · ROUND ${String(round.number || 1).padStart(2, "0")}</p><h1>${label}</h1><p class="duel-prompt" aria-live="assertive">${prompt}</p>${result ? `<div class="scoreline"><span>YOU ${result.reactionMs ? `${result.reactionMs} MS` : "EARLY"}</span><span>RIVAL ${result.opponentReactionMs} MS</span></div>` : ""}<div class="duel-controls">${action}${fullscreenButton()}</div></div></section><section class="scoreboard"><div><span>WINS</span><b>${stats.wins}</b></div><div><span>LOSSES</span><b>${stats.losses}</b></div><div><span>LOCAL BEST</span><b>${stats.best ? `${stats.best} MS` : "--"}</b></div><div><span>DIFFICULTY</span><b>${aiDifficulty.toUpperCase()}</b></div></section>`);
}

function rpsView(playerChoice?: RpsChoice, opponentChoice?: RpsChoice, result?: DuelResult, title = "ROCK PAPER SCISSORS", seriesScore = [seriesPlayerWins, seriesOpponentWins], decisionEndsAt?: number, roundNumber = round.number, matchWinner?: boolean, hostCanDeal = true) {
  const seconds = decisionEndsAt ? Math.max(0, Math.ceil((decisionEndsAt - Date.now()) / 1000)) : 0;
  const prompt = result ? (matchWinner ? `${result.message} ${result.outcome === "win" ? "You take the match." : "Your rival takes the match."}` : `${result.message} ${title.startsWith("LIVE") || title.startsWith("SHOWDOWN") ? "The host starts the next round." : "Start the next round."}`) : playerChoice ? "Choice locked. Waiting for your rival to reveal." : "Choose simultaneously: Rock beats Scissors, Scissors beats Paper, Paper beats Rock.";
  const live = title.startsWith("LIVE") || title.startsWith("SHOWDOWN");
  const actions = result ? (matchWinner && live ? `<button id="leave-duel" class="outline">LEAVE ROOM</button>` : live && !hostCanDeal ? `<p class="waiting-note">HOST STARTS THE NEXT ROUND</p>` : `<button id="shot-button" class="primary">${matchWinner ? "PLAY NEW MATCH" : "NEXT ROUND"}</button>`) : !decisionEndsAt ? `<button id="shot-button" class="primary">START MATCH</button>` : `<div class="rps-actions">${(["rock", "paper", "scissors"] as RpsChoice[]).map(choice => `<button class="primary" data-rps-choice="${choice}" ${playerChoice || seconds === 0 ? "disabled" : ""}>${choice.toUpperCase()}</button>`).join("")}</div>`;
  return layout(`<section class="rps-game"><p class="eyebrow">${title} · ROUND ${String(roundNumber).padStart(2, "0")}</p><h1>${result ? (result.outcome === "tie" ? "TIE" : matchWinner ? (result.outcome === "win" ? "MATCH WON" : "MATCH LOST") : result.outcome === "win" ? "ROUND WON" : "ROUND LOST") : "MAKE YOUR SIGN"}</h1><div class="rps-choices"><div><span>YOUR CHOICE</span><b>${playerChoice?.toUpperCase() ?? "HIDDEN"}</b></div><div><span>RIVAL'S CHOICE</span><b>${result ? opponentChoice?.toUpperCase() : "HIDDEN"}</b></div></div><p class="duel-prompt">${prompt}</p>${!result ? `<p class="waiting-note">DECISION TIME: ${seconds} SEC</p>` : ""}${actions}${fullscreenButton()}</section><section class="scoreboard"><div><span>MATCH YOU</span><b>${seriesScore[0]}</b></div><div><span>MATCH RIVAL</span><b>${seriesScore[1]}</b></div><div><span>FIRST TO</span><b>3</b></div><div><span>ROUND</span><b>${roundNumber}</b></div></section>`);
}

function multiplayerGameView() {
  const room = multiplayerRoom!;
  const shared = room.roundState.round!;
  const isHost = room.hostId === multiplayerUserId;
  const mine = isHost ? shared.hostAction : shared.guestAction;
  const opponent = isHost ? shared.guestAction : shared.hostAction;
  const wordMode = room.mode === "word-duel";
  const traceMode = room.mode === "trail-trace";
  const bottleMode = room.mode === "bottle-shot";
  const activeMode = shared.gameMode ?? room.mode;
  const ended = Boolean(shared.winner);
  const won = shared.winner === (isHost ? "host" : "guest");
  if (activeMode === "rock-paper-scissors") {
    const title = `${room.mode === "showdown-series" ? "SHOWDOWN SERIES" : "LIVE ROCK PAPER SCISSORS"} · ROOM ${room.code}`;
    const result = ended ? { outcome: won ? "win" : "loss", opponentReactionMs: 0, message: shared.hostAction?.choice === shared.guestAction?.choice ? "Matching signs tie; the host starts the next round." : "Rock beats Scissors, Scissors beats Paper, Paper beats Rock." } as DuelResult : undefined;
    return rpsView(mine?.choice, opponent?.choice, result, title, [isHost ? shared.seriesHostWins ?? 0 : shared.seriesGuestWins ?? 0, isHost ? shared.seriesGuestWins ?? 0 : shared.seriesHostWins ?? 0], shared.decisionEndsAt ? Date.parse(shared.decisionEndsAt) : undefined, shared.seriesRound ?? 1, Boolean(shared.matchWinner), isHost).replace("id=\"shot-button\"", `id="next-round"`);
  }
  if (activeMode === "bottle-shot") {
    const mineScore = mine?.score ?? bottleScoreTotal;
    return bottleShotView(shared.targetSeed!, Date.parse(shared.startAt), Date.parse(shared.endAt!), `LIVE BOTTLE SHOT · ROOM ${room.code}`, mineScore, opponent?.score, ended ? (won ? "YOU WIN" : "YOU LOSE") : undefined, Boolean(mine));
  }
  if (activeMode === "trail-trace") {
    const mineScore = mine?.score;
    const opponentScore = opponent?.score;
    const prompt = ended ? `You scored ${mineScore ?? 0}; your rival scored ${opponentScore ?? 0}. ${isHost ? "Start the next round when ready." : "Wait for the host to start the next round."}` : mine ? "Score submitted. Waiting for your rival's trace." : "Start at the left marker, hold your pointer on the canvas, and release after reaching the far end.";
    const controls = ended ? `<div class="duel-actions">${isHost ? `<button id="next-round" class="primary">NEXT ROUND</button>` : ""}<button id="leave-duel" class="outline">LEAVE ROOM</button></div>` : "";
    return layout(`<section class="trace-game"><div class="trace-heading"><p class="eyebrow">LIVE TRAIL TRACE · ROOM ${room.code}</p><h1>${ended ? (won ? "YOU WIN" : "YOU LOSE") : mine ? "SCORE LOCKED" : "TRACE THE TRAIL"}</h1><p>${prompt}</p></div><canvas id="trail-canvas" class="trail-canvas" aria-label="Trace the shared winding trail" data-seed="${shared.pathSeed}" ${mine || ended ? "data-disabled=true" : ""}></canvas><p class="trace-hint">BOTH PLAYERS TRACE THIS SAME SEEDED TRAIL. HIGHEST SCORE WINS.</p>${controls}${fullscreenButton()}</section><section class="scoreboard"><div><span>YOUR SCORE</span><b>${mineScore ?? "--"}</b></div><div><span>RIVAL SCORE</span><b>${opponentScore ?? "--"}</b></div><div><span>YOUR PROGRESS</span><b>${mine?.progress ?? "--"}${mine ? "%" : ""}</b></div><div><span>YOUR ACCURACY</span><b>${mine?.accuracy ?? "--"}${mine ? "%" : ""}</b></div></section>`);
  }
  const waiting = Date.now() < Date.parse(shared.startAt);
  const label = ended ? (shared.winner === "tie" ? "TIE" : won ? "YOU WIN" : "YOU LOSE") : waiting ? "WAIT" : activeMode === "word-duel" ? shared.word! : "DRAW!";
  const prompt = ended ? `${mine?.falseStart ? "False start." : won ? "You were first on the signal." : "Your opponent was first on the signal."} ${shared.matchWinner ? "Series complete." : isHost ? "Start the next round when ready." : "Wait for the host to start the next round."}` : waiting ? "Shared signal incoming. An early action loses." : activeMode === "word-duel" ? "Type the shared word exactly, then press Enter." : "DRAW! Send your one shot.";
  const action = ended
    ? `<div class="duel-actions">${isHost ? `<button id="next-round" class="primary">NEXT ROUND</button>` : "<p class=\"waiting-note\">HOST CHOOSES THE NEXT ROUND</p>"}<button id="leave-duel" class="outline" ${multiplayerBusy ? "disabled" : ""}>LEAVE ROOM</button></div>`
    : waiting ? activeMode === "original-quick-draw" && mobileQuickDrawWait()
      ? `<p class="waiting-note">WAIT FOR DRAW!</p>`
      : `<button id="shot-button" class="outline mobile-wait-control" ${multiplayerActionBusy || mine ? "disabled" : ""}>FALSE START</button><p class="key-hint">EARLY ACTION LOSES</p>`
    : activeMode === "word-duel" ? `<form id="word-form" class="word-entry"><label for="word-input">TYPE THE SIGNAL</label><input id="word-input" autocomplete="off" autocapitalize="off" inputmode="text" spellcheck="false" enterkeyhint="done" ${multiplayerActionBusy || mine ? "disabled" : ""} aria-label="Type the shared signal word and press Enter" /></form>`
    : `<button id="shot-button" class="primary shot-button" ${multiplayerActionBusy || mine ? "disabled" : ""}>SHOOT</button><p class="key-hint">CLICK / TAP / <kbd>SPACE</kbd></p>`;
  const resultRows = ended || mine || opponent ? `<div class="scoreline multiplayer-score"><span>YOU ${mine?.falseStart ? "EARLY" : mine ? `${mine.reactionMs} MS` : "--"}</span><span>RIVAL ${opponent?.falseStart ? "EARLY" : opponent ? `${opponent.reactionMs} MS` : "--"}</span></div>` : "";
  return layout(`<section class="duel" data-phase="${waiting ? "waiting" : activeMode === "word-duel" ? "word" : "draw"}" data-result="${ended ? (won ? "win" : "loss") : ""}"><div class="duel-sky"><div class="duel-sun"></div><div class="cloud cloud-one"></div><div class="cloud cloud-two"></div></div><div class="horizon"></div><div class="street"></div><div class="opponent" aria-hidden="true"><span class="hat"></span><span class="head"></span><span class="torso"></span><span class="arm"></span></div><div class="gunslinger" aria-hidden="true"><span class="player-hat"></span><span class="player-body"></span><span class="hand"><i class="revolver"><b></b></i></span><span class="holster"></span><span class="flash"></span></div><div class="duel-panel"><p class="eyebrow">LIVE ${activeMode === "word-duel" ? "WORD DUEL" : "ORIGINAL QUICK DRAW"} · ROOM ${room.code}</p><h1>${label}</h1><p class="duel-prompt" aria-live="assertive">${prompt}</p>${resultRows}<div class="duel-controls">${action}${fullscreenButton()}</div></div></section><section class="scoreboard"><div><span>SERIES</span><b>${room.mode === "showdown-series" ? `${shared.seriesHostWins ?? 0} - ${shared.seriesGuestWins ?? 0}` : ended ? (won ? "WIN" : "LOSS") : "LIVE"}</b></div><div><span>YOUR REACTION</span><b>${mine?.falseStart ? "EARLY" : mine ? `${mine.reactionMs} MS` : "--"}</b></div><div><span>RIVAL REACTION</span><b>${opponent?.falseStart ? "EARLY" : opponent ? `${opponent.reactionMs} MS` : "--"}</b></div><div><span>ROOM</span><b>${room.code}</b></div></section>`);
}

function modeOptions(selected: GameMode) {
  return `<option value="original-quick-draw" ${selected === "original-quick-draw" ? "selected" : ""}>QUICK DRAW</option><option value="word-duel" ${selected === "word-duel" ? "selected" : ""}>WORD DUEL</option><option value="trail-trace" ${selected === "trail-trace" ? "selected" : ""}>TRAIL TRACE</option><option value="bottle-shot" ${selected === "bottle-shot" ? "selected" : ""}>BOTTLE SHOT</option><option value="rock-paper-scissors" ${selected === "rock-paper-scissors" ? "selected" : ""}>ROCK PAPER SCISSORS</option><option value="showdown-series" ${selected === "showdown-series" ? "selected" : ""}>SHOWDOWN SERIES</option>`;
}

function multiplayerView() {
  if (!multiplayer.isConfigured()) return layout(`<section class="page-header"><p class="eyebrow">TWO GUNSLINGERS. ONE STREET.</p><h1>Multiplayer</h1><p>Invite a friend to a live lobby, then ready up for the next duel.</p></section><section class="lobby"><div class="lobby-error" role="alert">SUPABASE CONFIGURATION REQUIRED</div><p>Add <code>VITE_SUPABASE_URL</code> and <code>VITE_SUPABASE_PUBLISHABLE_KEY</code> to your environment, then redeploy. See <code>.env.example</code> and README.md for setup.</p></section>`);
  const room = multiplayerRoom;
  const isHost = room?.hostId === multiplayerUserId;
  const ownReady = isHost ? room?.roundState.hostReady : room?.roundState.guestReady;
  const disabled = multiplayerBusy ? "disabled" : "";
  const hostLabel = room ? (isHost ? "YOU (HOST)" : "HOST CONNECTED") : "YOUR SEAT";
  const guestLabel = room?.guestId ? (isHost ? "GUEST CONNECTED" : "YOU") : "OPEN SEAT";
  const transportLabel = multiplayer.transportStatus() === "connected" ? "PEER LINK CONNECTED" : multiplayer.transportStatus() === "connecting" ? "PEER LINK CONNECTING" : multiplayer.transportStatus() === "unavailable" ? "PEER LINK UNAVAILABLE: DATABASE FALLBACK" : "DATABASE FALLBACK";
  const message = multiplayerNotice || (room ? (room.status === "ready" ? `Both gunslingers are ready. ${transportLabel}.` : room.guestId ? `Both players must ready up. ${transportLabel}.` : "Share this code with your opponent, then wait for them to join.") : "Create a private room or join your friend's code. Anonymous sign-in happens automatically.");
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
  if (page === "game" && (mode === "showdown-series" || multiplayerRoom?.mode === "showdown-series")) {
    const shared = multiplayerRoom?.roundState.round;
    const hostView = multiplayerRoom?.hostId === multiplayerUserId;
    const mine = shared ? hostView ? shared.seriesHostWins ?? 0 : shared.seriesGuestWins ?? 0 : seriesPlayerWins;
    const rival = shared ? hostView ? shared.seriesGuestWins ?? 0 : shared.seriesHostWins ?? 0 : seriesOpponentWins;
    root.querySelector(".scoreboard")?.insertAdjacentHTML("afterbegin", `<div><span>SHOWDOWN SERIES</span><b>${mine} - ${rival} / FIRST TO 3</b></div>`);
  }
  if (page === "mode-select") {
    root.querySelector(".mode-cards")?.insertAdjacentHTML("beforeend", `<article${mode === "bottle-shot" ? " data-selected=\"true\"" : ""}><p class="eyebrow">MODE 04</p><h2>Bottle Shot</h2><p>Thirty seconds of six-bottle waves. Green and blue add points; red bottles and empty-range shots subtract them.</p><button class="outline" data-mode="bottle-shot">${mode === "bottle-shot" ? "SELECTED" : "SELECT BOTTLE SHOT"}</button></article>`);
    root.querySelector(".mode-cards")?.insertAdjacentHTML("beforeend", `<article${mode === "rock-paper-scissors" ? " data-selected=\"true\"" : ""}><p class="eyebrow">MODE 05</p><h2>Rock Paper Scissors</h2><p>A simultaneous best-of-five showdown. First gunslinger to three round wins takes the match.</p><button class="outline" data-mode="rock-paper-scissors">${mode === "rock-paper-scissors" ? "SELECTED" : "SELECT ROCK PAPER SCISSORS"}</button></article>`);
    const difficultyNote = root.querySelector(".difficulty-select > p:not(.eyebrow)");
    if (difficultyNote) difficultyNote.textContent = "Trail Trace and Bottle Shot change Ash's simulated score; Quick Draw and Word Duel change reaction time.";
  }
  if (page === "how-to") {
    const intro = root.querySelector(".page-header > p:last-child");
    if (intro) intro.textContent = "Four original versus-AI duels, plus their shared multiplayer counterparts.";
    root.querySelector(".rules")?.insertAdjacentHTML("beforeend", `<article><b>04</b><h2>Bottle Shot</h2><p>For 30 seconds, six bottles appear every 1.5 seconds. Green and blue are <strong>+10</strong>; red bottles and shots that miss an active bottle are <strong>-10</strong>.</p></article>`);
    root.querySelector(".rules")?.insertAdjacentHTML("beforeend", `<article><b>05</b><h2>Rock Paper Scissors</h2><p>Choose simultaneously. Rock beats Scissors, Scissors beats Paper, and Paper beats Rock. First to three round wins takes the match.</p></article>`);
  }
  root.querySelectorAll<HTMLElement>("[data-page]").forEach(button => button.addEventListener("click", () => nav(button.dataset.page as Page)));
  root.querySelectorAll<HTMLElement>("[data-mode]").forEach(button => button.addEventListener("click", () => { mode = button.dataset.mode as GameMode; render(); }));
  root.querySelector("#sound-toggle")?.addEventListener("click", () => { toggleMuted(); render(); });
  root.querySelectorAll<HTMLButtonElement>("[data-rps-choice]").forEach(button => button.addEventListener("click", () => chooseRps(button.dataset.rpsChoice as RpsChoice)));
  root.querySelectorAll<HTMLElement>("[data-ai-difficulty]").forEach(button => button.addEventListener("click", () => { aiDifficulty = button.dataset.aiDifficulty as AiDifficulty; render(); }));
  root.querySelector("#start-ai-duel")?.addEventListener("click", () => nav("game"));
  root.querySelector("#shot-button")?.addEventListener("click", () => takeAction(!mobileQuickDrawWaiting()));
  root.querySelector(".bottle-range")?.addEventListener("click", event => {
    if (!(event.target instanceof Element) || !event.target.closest("[data-bottle-id]")) shootBottleMiss();
  });
  root.querySelectorAll<HTMLButtonElement>("[data-bottle-id]").forEach(button => button.addEventListener("click", event => { event.stopPropagation(); shootBottle(Number(button.dataset.bottleId)); }));
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
  // A mounted canvas always represents a fresh round, never the prior trace.
  tracePoints = [];
  traceDrawing = false;
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
    if (!isValidTrailScore(result)) { multiplayerNotice = "Trace must reach the end with at least 55% accuracy. Try again."; tracePoints = []; drawTrailCanvas(context, canvas.clientWidth, canvas.clientHeight, trail, tracePoints); if (page === "game") render(); return; }
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
  multiplayer.onLiveEvent(({ roundId }) => {
    const current = multiplayerRoom?.roundState.round;
    // Peer delivery prompts the host to resolve from its local hint without waiting for a DB subscription.
    if (current?.id === roundId && multiplayerRoom?.hostId === multiplayerUserId && !current.winner) void resolveMultiplayerRound(roundId);
  });
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
    if (room.roundState.round?.matchWinner) return;
    const gameMode: DirectGameMode = room.mode === "showdown-series" ? seriesModes[Math.floor(Math.random() * seriesModes.length)]! : room.mode as DirectGameMode;
    const startAt = new Date(Date.now() + (gameMode === "trail-trace" ? 0 : gameMode === "bottle-shot" || gameMode === "rock-paper-scissors" ? 1500 : randomBetween(settings.minWaitMs, settings.maxWaitMs))).toISOString();
    const shared: MultiplayerRound = {
      id: crypto.randomUUID(),
      startAt,
      ...(room.mode === "showdown-series" || gameMode === "rock-paper-scissors" ? { ...(room.mode === "showdown-series" ? { gameMode } : {}), seriesHostWins: room.roundState.round?.seriesHostWins ?? 0, seriesGuestWins: room.roundState.round?.seriesGuestWins ?? 0, seriesRound: (room.roundState.round?.seriesRound ?? 0) + 1 } : {}),
      ...(gameMode === "word-duel" ? { word: randomDuelWord() } : {}),
      ...(gameMode === "trail-trace" ? { pathSeed: crypto.getRandomValues(new Uint32Array(1))[0]! } : {}),
      ...(gameMode === "bottle-shot" ? { targetSeed: crypto.getRandomValues(new Uint32Array(1))[0]!, endAt: new Date(Date.parse(startAt) + bottleRoundMs).toISOString() } : {}),
      ...(gameMode === "rock-paper-scissors" ? { decisionEndsAt: new Date(Date.parse(startAt) + rpsDecisionMs).toISOString() } : {}),
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
  if ((shared.gameMode ?? multiplayerRoom?.mode) === "rock-paper-scissors" && shared.decisionEndsAt) {
    const decisionEndsAt = Date.parse(shared.decisionEndsAt);
    const refresh = () => {
      const current = multiplayerRoom?.roundState.round;
      if (!current || current.id !== shared.id || current.winner) return;
      if (Date.now() >= decisionEndsAt) {
        const mine = multiplayerRoom?.hostId === multiplayerUserId ? current.hostAction : current.guestAction;
        if (!mine) void sendRpsChoice("rock");
        return;
      }
      if (page === "game") render();
      drawTimer = window.setTimeout(refresh, 250);
    };
    refresh();
    return;
  }
  if ((shared.gameMode ?? multiplayerRoom?.mode) === "bottle-shot" && shared.endAt) {
    if (bottleRoundId !== shared.id) { bottleRoundId = shared.id; bottleScoreTotal = 0; bottleHitIds = new Set(); }
    const refresh = () => {
      if (page === "game" && !shared.winner) render();
      if (Date.now() >= Date.parse(shared.endAt!)) { void submitBottleScore(); return; }
      drawTimer = window.setTimeout(refresh, 250);
    };
    drawTimer = window.setTimeout(refresh, Math.max(0, Date.parse(shared.startAt) - Date.now()));
    return;
  }
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
    const falseStart = falseStartAction || reactionMs === 0 && Date.now() < Date.parse(shared.startAt);
    multiplayer.sendLiveAction({ roundId: shared.id, reactionMs, falseStart });
    const nextRoom = await multiplayer.submitRoundAction(shared.id, reactionMs, falseStart);
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

async function submitTrailScore(result: { score: number; progress: number; accuracy: number; reachedEnd?: boolean }) {
  const room = multiplayerRoom;
  const shared = room?.roundState.round;
  if (!room || !shared || multiplayerActionBusy || shared.winner) return;
  const isHost = room.hostId === multiplayerUserId;
  multiplayerActionBusy = true;
  render();
  try {
    if (!isValidTrailScore(result)) throw new Error("Finish the trail with a steady line before submitting.");
    multiplayer.sendLiveAction({ roundId: shared.id, reactionMs: 0, falseStart: false, payload: result });
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

function shootBottle(id: number) {
  const live = multiplayerRoom?.status === "playing";
  const seed = live ? multiplayerRoom!.roundState.round!.targetSeed! : round.mode === "bottle-shot" ? round.targetSeed : 0;
  const startAt = live ? Date.parse(multiplayerRoom!.roundState.round!.startAt) : round.mode === "bottle-shot" ? round.startAt! : 0;
  const endAt = live ? Date.parse(multiplayerRoom!.roundState.round!.endAt!) : round.mode === "bottle-shot" ? round.endAt! : 0;
  const activeWave = Math.floor((Date.now() - startAt) / bottleTargetMs);
  const firstActiveId = activeWave * bottlesPerWave;
  if (Date.now() < startAt || Date.now() >= endAt || id < firstActiveId || id >= firstActiveId + bottlesPerWave || bottleHitIds.has(id)) return;
  const target = createBottleSchedule(seed)[id];
  if (!target) return;
  bottleHitIds.add(id);
  bottleScoreTotal += bottleScore(target.kind);
  if (live) multiplayer.sendLiveAction({ roundId: multiplayerRoom!.roundState.round!.id, reactionMs: 0, falseStart: false, payload: { score: bottleScoreTotal } });
  playSound(target.kind === "red" ? "negative" : "bottle");
  if (!live && round.mode === "bottle-shot") round = { ...round, playerScore: bottleScoreTotal };
  render();
}

function shootBottleMiss() {
  const live = multiplayerRoom?.status === "playing";
  const startAt = live ? Date.parse(multiplayerRoom!.roundState.round!.startAt) : round.mode === "bottle-shot" ? round.startAt! : 0;
  const endAt = live ? Date.parse(multiplayerRoom!.roundState.round!.endAt!) : round.mode === "bottle-shot" ? round.endAt! : 0;
  if (Date.now() < startAt || Date.now() >= endAt) return;
  bottleScoreTotal += bottleMissPenalty;
  if (live) multiplayer.sendLiveAction({ roundId: multiplayerRoom!.roundState.round!.id, reactionMs: 0, falseStart: false, payload: { score: bottleScoreTotal } });
  playSound("negative");
  if (!live && round.mode === "bottle-shot") round = { ...round, playerScore: bottleScoreTotal };
  render();
}

async function submitBottleScore() {
  const room = multiplayerRoom;
  const shared = room?.roundState.round;
  if (!room || !shared || multiplayerActionBusy || shared.winner || !shared.endAt || Date.now() < Date.parse(shared.endAt)) return;
  const isHost = room.hostId === multiplayerUserId;
  if (isHost ? shared.hostAction : shared.guestAction) return;
  multiplayerActionBusy = true;
  try {
    multiplayer.sendLiveAction({ roundId: shared.id, reactionMs: 0, falseStart: false, payload: { score: bottleScoreTotal } });
    const nextRoom = await multiplayer.submitRoundAction(shared.id, 0, false, { score: bottleScoreTotal });
    multiplayerRoom = nextRoom;
    if (isHost) await resolveMultiplayerRound(shared.id);
  } catch (error) { multiplayerNotice = error instanceof Error ? error.message : "Unable to submit your Bottle Shot score."; }
  finally { multiplayerActionBusy = false; if (page === "game") render(); }
}

function beginRound() {
  tracePoints = [];
  if ((mode === "showdown-series" || mode === "rock-paper-scissors") && (seriesPlayerWins === 3 || seriesOpponentWins === 3)) {
    seriesPlayerWins = 0; seriesOpponentWins = 0;
    if (mode === "rock-paper-scissors") round = { number: 0, mode: "rock-paper-scissors", phase: "menu" };
  }
  const selectedMode: DirectGameMode = mode === "showdown-series" ? seriesModes[Math.floor(Math.random() * seriesModes.length)]! : mode as DirectGameMode;
  if (selectedMode === "rock-paper-scissors") {
    const decisionEndsAt = Date.now() + rpsDecisionMs;
    round = { number: round.number + 1, mode: "rock-paper-scissors", phase: "choosing", decisionEndsAt };
    const refresh = () => {
      if (round.mode !== "rock-paper-scissors" || round.phase !== "choosing") return;
      if (Date.now() >= decisionEndsAt) { chooseRps("rock"); return; }
      render(); drawTimer = window.setTimeout(refresh, 250);
    };
    render(); drawTimer = window.setTimeout(refresh, 250); return;
  }
  if (selectedMode === "bottle-shot") {
    const startAt = Date.now();
    bottleScoreTotal = 0; bottleHitIds = new Set();
    round = { number: round.number + 1, mode: "bottle-shot", phase: "playing", targetSeed: crypto.getRandomValues(new Uint32Array(1))[0]!, startAt, endAt: startAt + bottleRoundMs, playerScore: 0 };
    const refresh = () => {
      if (round.mode !== "bottle-shot" || round.phase !== "playing") return;
      if (Date.now() >= round.endAt!) { finishBottleRound(); return; }
      render(); drawTimer = window.setTimeout(refresh, 250);
    };
    render(); drawTimer = window.setTimeout(refresh, 250);
    return;
  }
  if (selectedMode === "trail-trace") {
    round = { number: round.number + 1, mode: "trail-trace", phase: "tracing", pathSeed: crypto.getRandomValues(new Uint32Array(1))[0]! };
    render();
    return;
  }
  const timing = createRoundTiming(aiDifficulty);
  round = selectedMode === "word-duel"
    ? { number: round.number + 1, mode: "word-duel", phase: "waiting", opponentReactionMs: timing.opponentReactionMs }
    : { number: round.number + 1, mode: "original-quick-draw", phase: "waiting", opponentReactionMs: timing.opponentReactionMs };
  render();
  drawTimer = window.setTimeout(() => {
    const signalAt = performance.now();
    if (round.mode === "word-duel") round = { ...round, phase: "word", word: randomDuelWord(), wordAt: signalAt };
    else if (round.mode === "original-quick-draw") round = { ...round, phase: "draw", drawAt: signalAt };
    playSound("signal");
    render();
    opponentTimer = window.setTimeout(() => finish(resolveShot(round.opponentReactionMs!, round.opponentReactionMs!)), round.opponentReactionMs);
  }, timing.waitMs);
}
function chooseRps(choice: RpsChoice) {
  playSound("click");
  if (multiplayerRoom?.status === "playing") { void sendRpsChoice(choice); return; }
  if (round.mode !== "rock-paper-scissors" || round.phase !== "choosing") return;
  const opponentChoice = aiRpsChoice(aiDifficulty);
  round = { ...round, playerChoice: choice, opponentChoice, phase: "result" };
  finishRps(resolveRps(choice, opponentChoice));
}
function finishRps(result: DuelResult) {
  clearTimers();
  if (result.outcome === "win") { stats.wins++; seriesPlayerWins++; } else if (result.outcome === "loss") { stats.losses++; seriesOpponentWins++; }
  saveStats();
  round = { ...round, phase: "result", result } as Round;
  playSound(result.outcome === "win" ? "win" : result.outcome === "loss" ? "loss" : "click"); render();
}
async function sendRpsChoice(choice: RpsChoice) {
  const room = multiplayerRoom; const shared = room?.roundState.round;
  if (!room || !shared || multiplayerActionBusy || shared.winner) return;
  multiplayerActionBusy = true;
  try { multiplayer.sendLiveAction({ roundId: shared.id, reactionMs: 0, falseStart: false, payload: { choice } }); multiplayerRoom = await multiplayer.submitRoundAction(shared.id, 0, false, { choice }); if (room.hostId === multiplayerUserId) await resolveMultiplayerRound(shared.id); }
  catch (error) { multiplayerNotice = error instanceof Error ? error.message : "Unable to lock your choice."; }
  finally { multiplayerActionBusy = false; render(); }
}
function finishTrail(result: { score: number; progress: number; accuracy: number }) {
  const opponentScore = aiTrailScore(aiDifficulty);
  const won = result.score >= opponentScore;
  if (won) stats.wins++; else stats.losses++;
  if (mode === "showdown-series") { if (won) seriesPlayerWins++; else seriesOpponentWins++; }
  saveStats();
  round = { ...round, phase: "result", playerScore: result.score, playerProgress: result.progress, playerAccuracy: result.accuracy, result: { outcome: won ? "win" : "loss", opponentReactionMs: opponentScore, message: won ? "Your line held closer through the badlands." : "Ash held the steadier line." } } as Round;
  playSound(won ? "win" : "loss");
  render();
}
function finishBottleRound() {
  if (round.mode !== "bottle-shot") return;
  const opponentScore = aiBottleScore(aiDifficulty);
  const won = bottleScoreTotal >= opponentScore;
  if (won) stats.wins++; else stats.losses++;
  if (mode === "showdown-series") { if (won) seriesPlayerWins++; else seriesOpponentWins++; }
  saveStats();
  round = { ...round, phase: "result", playerScore: bottleScoreTotal, result: { outcome: won ? "win" : "loss", opponentReactionMs: opponentScore, message: won ? "You cleared the range." : "Ash cleared more bottles." } };
  playSound(won ? "win" : "loss");
  render();
}
function takeAction(allowFalseStart = false) {
  playSound("click");
  if (multiplayerRoom?.status === "playing") {
    const shared = multiplayerRoom.roundState.round;
    const early = shared && Date.now() < Date.parse(shared.startAt);
    if (shared && (!early || allowFalseStart)) void sendMultiplayerAction(early);
    return;
  }
  if (round.phase === "menu" || round.phase === "result") beginRound();
  else if (round.phase === "waiting" && allowFalseStart) finish(falseStart(round.opponentReactionMs!));
  else if (round.mode === "original-quick-draw" && round.phase === "draw") { playSound("shot"); finish(resolveShot(Math.round(performance.now() - round.drawAt!), round.opponentReactionMs!)); }
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
  if (mode === "showdown-series") { if (result.outcome === "win") seriesPlayerWins++; else seriesOpponentWins++; }
  saveStats();
  round = { ...round, phase: "result", result } as Round;
  playSound(result.outcome === "win" ? "win" : result.outcome === "false-start" ? "negative" : "loss");
  render();
}

document.addEventListener("keydown", event => {
  if (event.code !== "Space" || event.repeat || page !== "game" || document.activeElement?.tagName === "INPUT") return;
  event.preventDefault(); takeAction();
});
mobileViewport.addEventListener("change", () => { if (page === "game") render(); });
document.addEventListener("fullscreenchange", updateFullscreenToggle);
render();
