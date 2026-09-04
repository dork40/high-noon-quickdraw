const card = document.querySelector("#duel-card");
const drawButton = document.querySelector("#draw-button");
const buttonMain = document.querySelector("#button-main");
const buttonKicker = document.querySelector("#button-kicker");
const title = document.querySelector("#round-title");
const instruction = document.querySelector("#instruction");
const roundNumber = document.querySelector("#round-number");
const readout = document.querySelector("#reaction-readout");
const bestTime = document.querySelector("#best-time");
const soundToggle = document.querySelector("#sound-toggle");
const aimPanel = document.querySelector("#aim-panel");
const aimArea = document.querySelector("#aim-area");
const target = document.querySelector("#target");
const reticle = document.querySelector("#reticle");
const nerveFill = document.querySelector("#nerve-fill");
const nerveValue = document.querySelector("#nerve-value");
const aimHelp = document.querySelector("#aim-help");

let state = "idle";
let drawStartedAt = 0;
let waitTimer;
let opponentTimer;
let aimFrame;
let round = 0;
let audioContext;
let aimStartedAt = 0;
let lastAimFrame = 0;
let aimX = 50;
let aimY = 68;
let targetX = 50;
let targetY = 32;
let targetVelocityX = 18;
let targetVelocityY = 12;
let nerve = 100;

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
  card.classList.remove("waiting", "draw", "aiming", "result-win", "result-loss", "false-start");
}

function stopAim() {
  cancelAnimationFrame(aimFrame);
  aimPanel.hidden = true;
}

function setButton(kicker, main) {
  buttonKicker.textContent = kicker;
  buttonMain.textContent = main;
}

function startDuel() {
  clearTimeout(waitTimer);
  clearTimeout(opponentTimer);
  stopAim();
  state = "waiting";
  round += 1;
  resetClasses();
  card.classList.add("waiting");
  roundNumber.textContent = `DUEL #${String(round).padStart(2, "0")}`;
  title.textContent = "Hold steady...";
  instruction.textContent = "Do not draw until the signal.";
  readout.textContent = "";
  setButton("Wait for the signal", "Holstered");
  drawButton.disabled = false;
  const delay = 1600 + Math.random() * 3800;
  waitTimer = window.setTimeout(showDraw, delay);
}

function showDraw() {
  state = "aiming";
  card.classList.remove("waiting");
  card.classList.add("draw", "aiming");
  drawStartedAt = performance.now();
  title.textContent = "DRAW!";
  instruction.textContent = "Find the mark and make one clean shot.";
  setButton("Space, Enter, or tap", "Fire");
  aimPanel.hidden = false;
  aimX = 50;
  aimY = 68;
  targetX = 28 + Math.random() * 44;
  targetY = 24 + Math.random() * 26;
  targetVelocityX = (Math.random() > 0.5 ? 1 : -1) * (14 + Math.random() * 12);
  targetVelocityY = (Math.random() > 0.5 ? 1 : -1) * (8 + Math.random() * 9);
  nerve = 100;
  aimStartedAt = performance.now();
  lastAimFrame = aimStartedAt;
  updateAimVisuals();
  aimArea.focus({ preventScroll: true });
  aimFrame = requestAnimationFrame(runAim);
  playTone(880, 0.12);
  const opponentTime = 2600 + Math.random() * 1800;
  opponentTimer = window.setTimeout(() => loseToOpponent(Math.round(opponentTime)), opponentTime);
}

function updateAimVisuals() {
  reticle.style.left = `${aimX}%`;
  reticle.style.top = `${aimY}%`;
  target.style.left = `${targetX}%`;
  target.style.top = `${targetY}%`;
  nerveFill.style.width = `${nerve}%`;
  nerveValue.textContent = `Nerve ${Math.ceil(nerve)}%`;
}

function runAim(now) {
  if (state !== "aiming") return;
  const elapsed = Math.min((now - lastAimFrame) / 1000, 0.05);
  lastAimFrame = now;
  targetX += targetVelocityX * elapsed;
  targetY += targetVelocityY * elapsed;
  if (targetX < 12 || targetX > 88) targetVelocityX *= -1;
  if (targetY < 16 || targetY > 72) targetVelocityY *= -1;
  targetX = Math.max(12, Math.min(88, targetX));
  targetY = Math.max(16, Math.min(72, targetY));
  nerve = Math.max(0, 100 - (now - aimStartedAt) / 42);
  updateAimVisuals();
  aimFrame = requestAnimationFrame(runAim);
}

function falseStart() {
  clearTimeout(waitTimer);
  stopAim();
  state = "result";
  resetClasses();
  card.classList.add("false-start");
  roundNumber.textContent = "FOUL PLAY";
  title.textContent = "False start.";
  instruction.textContent = "You drew before the bell.";
  readout.textContent = "The sheriff calls this one for the outlaw.";
  setButton("Press space or tap", "Try again");
  playTone(160, 0.18);
}

function fireShot() {
  const shotTime = Math.round(performance.now() - drawStartedAt);
  const distance = Math.hypot(aimX - targetX, aimY - targetY);
  const hitRadius = 5 + nerve * 0.035;
  clearTimeout(opponentTimer);
  stopAim();
  state = "result";
  resetClasses();
  if (distance > hitRadius) {
    card.classList.add("result-loss");
    roundNumber.textContent = "SHOT WIDE";
    title.textContent = "The mark slipped away.";
    instruction.textContent = "A rushed shot finds only dust.";
    readout.textContent = `Missed by ${distance.toFixed(1)} marks. Steady your aim.`;
    setButton("Press space or tap", "Try again");
    playTone(140, 0.18);
    return;
  }
  card.classList.add("result-win");
  roundNumber.textContent = "CLEAN DRAW";
  title.textContent = "You got the drop.";
  instruction.textContent = "The territory has a new fastest hand.";
  readout.textContent = `Clean shot: ${shotTime} ms · ${Math.ceil(nerve)}% nerve`;
  setButton("Press space or tap", "Ride again");
  saveBest(shotTime);
  playTone(660, 0.15);
}

function loseToOpponent(opponentTime) {
  if (state !== "aiming") return;
  stopAim();
  state = "result";
  resetClasses();
  card.classList.add("result-loss");
  roundNumber.textContent = "OUTDRAWN";
  title.textContent = "Too slow, stranger.";
  instruction.textContent = "The outlaw fired while you were lining up.";
  readout.textContent = `Opponent fired after ${opponentTime} ms.`;
  setButton("Press space or tap", "Settle the score");
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
  else if (state === "aiming") fireShot();
}

function moveAim(clientX, clientY) {
  if (state !== "aiming") return;
  const bounds = aimArea.getBoundingClientRect();
  aimX = Math.max(0, Math.min(100, ((clientX - bounds.left) / bounds.width) * 100));
  aimY = Math.max(0, Math.min(100, ((clientY - bounds.top) / bounds.height) * 100));
  updateAimVisuals();
}

drawButton.addEventListener("click", handleDraw);
aimArea.addEventListener("pointerdown", (event) => {
  aimArea.setPointerCapture?.(event.pointerId);
  moveAim(event.clientX, event.clientY);
});
aimArea.addEventListener("pointermove", (event) => moveAim(event.clientX, event.clientY));
document.addEventListener("keydown", (event) => {
  if (event.target.matches("input")) return;
  if (event.target === drawButton) return;
  if (state === "aiming" && ["ArrowUp", "ArrowDown", "ArrowLeft", "ArrowRight", "KeyW", "KeyA", "KeyS", "KeyD"].includes(event.code)) {
    event.preventDefault();
    const step = event.shiftKey ? 6 : 3;
    if (event.code === "ArrowUp" || event.code === "KeyW") aimY = Math.max(0, aimY - step);
    if (event.code === "ArrowDown" || event.code === "KeyS") aimY = Math.min(100, aimY + step);
    if (event.code === "ArrowLeft" || event.code === "KeyA") aimX = Math.max(0, aimX - step);
    if (event.code === "ArrowRight" || event.code === "KeyD") aimX = Math.min(100, aimX + step);
    updateAimVisuals();
    return;
  }
  if (!["Space", "Enter"].includes(event.code) || event.repeat) return;
  event.preventDefault();
  handleDraw();
});

document.querySelector("#opponent-name").textContent = opponents[Math.floor(Math.random() * opponents.length)];
loadBest();
