const card = document.querySelector("#duel-card");
const drawButton = document.querySelector("#draw-button");
const buttonMain = document.querySelector("#button-main");
const title = document.querySelector("#round-title");
const instruction = document.querySelector("#instruction");
const roundNumber = document.querySelector("#round-number");
const readout = document.querySelector("#reaction-readout");
const bestTime = document.querySelector("#best-time");
const soundToggle = document.querySelector("#sound-toggle");

let state = "idle";
let drawStartedAt = 0;
let waitTimer;
let opponentTimer;
let round = 0;
let audioContext;

const opponents = ["The Iron Jack", "Calico Mae", "Dusty Vance", "Blackbird Cole"];

function loadBest() {
  try {
    const best = Number(localStorage.getItem("highNoonBest"));
    bestTime.textContent = best > 0 ? `${best} ms` : "--";
  } catch (_) {
    bestTime.textContent = "--";
  }
}

function playTone(frequency, duration) {
  if (!soundToggle.checked) return;
  try {
    audioContext ||= new AudioContext();
    const oscillator = audioContext.createOscillator();
    const gain = audioContext.createGain();
    oscillator.frequency.value = frequency;
    gain.gain.setValueAtTime(0.06, audioContext.currentTime);
    gain.gain.exponentialRampToValueAtTime(0.001, audioContext.currentTime + duration);
    oscillator.connect(gain).connect(audioContext.destination);
    oscillator.start();
    oscillator.stop(audioContext.currentTime + duration);
  } catch (_) {
    // Sound is an enhancement; the duel continues if audio is unavailable.
  }
}

function resetClasses() {
  card.classList.remove("waiting", "draw", "result-win", "result-loss", "false-start");
}

function startDuel() {
  clearTimeout(waitTimer);
  clearTimeout(opponentTimer);
  state = "waiting";
  round += 1;
  resetClasses();
  card.classList.add("waiting");
  roundNumber.textContent = `DUEL #${String(round).padStart(2, "0")}`;
  title.textContent = "Hold steady...";
  instruction.textContent = "Do not draw until the signal.";
  readout.textContent = "";
  buttonMain.textContent = "Holstered";
  drawButton.disabled = false;
  const delay = 1600 + Math.random() * 3800;
  waitTimer = window.setTimeout(showDraw, delay);
}

function showDraw() {
  state = "draw";
  card.classList.remove("waiting");
  card.classList.add("draw");
  drawStartedAt = performance.now();
  title.textContent = "DRAW!";
  instruction.textContent = "Now!";
  buttonMain.textContent = "Draw!";
  playTone(880, 0.12);
  const opponentTime = 230 + Math.random() * 390;
  opponentTimer = window.setTimeout(() => loseToOpponent(Math.round(opponentTime)), opponentTime);
}

function falseStart() {
  clearTimeout(waitTimer);
  state = "result";
  resetClasses();
  card.classList.add("false-start");
  roundNumber.textContent = "FOUL PLAY";
  title.textContent = "False start.";
  instruction.textContent = "You drew before the bell.";
  readout.textContent = "The sheriff calls this one for the outlaw.";
  buttonMain.textContent = "Try again";
  playTone(160, 0.18);
}

function playerDraw() {
  const reaction = Math.round(performance.now() - drawStartedAt);
  clearTimeout(opponentTimer);
  state = "result";
  resetClasses();
  card.classList.add("result-win");
  roundNumber.textContent = "CLEAN DRAW";
  title.textContent = "You got the drop.";
  instruction.textContent = "The territory has a new fastest hand.";
  readout.textContent = `Your draw: ${reaction} ms`;
  buttonMain.textContent = "Ride again";
  saveBest(reaction);
  playTone(660, 0.15);
}

function loseToOpponent(opponentTime) {
  if (state !== "draw") return;
  state = "result";
  resetClasses();
  card.classList.add("result-loss");
  roundNumber.textContent = "OUTDRAWN";
  title.textContent = "Too slow, stranger.";
  instruction.textContent = "The outlaw's steel flashed first.";
  readout.textContent = `Opponent draw: ${opponentTime} ms`;
  buttonMain.textContent = "Settle the score";
  playTone(180, 0.2);
}

function saveBest(reaction) {
  try {
    const oldBest = Number(localStorage.getItem("highNoonBest"));
    if (!oldBest || reaction < oldBest) {
      localStorage.setItem("highNoonBest", String(reaction));
      bestTime.textContent = `${reaction} ms`;
      instruction.textContent = oldBest ? "New personal best. Legendary." : "First blood. A fine time.";
    }
  } catch (_) {
    // Private browsing may block storage; scores still work for this round.
  }
}

function handleDraw() {
  if (state === "idle" || state === "result") startDuel();
  else if (state === "waiting") falseStart();
  else if (state === "draw") playerDraw();
}

card.addEventListener("click", handleDraw);
document.addEventListener("keydown", (event) => {
  if (event.code !== "Space" || event.repeat) return;
  event.preventDefault();
  handleDraw();
});

document.querySelector("#opponent-name").textContent = opponents[Math.floor(Math.random() * opponents.length)];
loadBest();
