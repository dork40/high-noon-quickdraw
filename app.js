const card = document.querySelector("#duel-card");
const drawButton = document.querySelector("#draw-button");
const buttonMain = document.querySelector("#button-main");
const buttonKicker = document.querySelector("#button-kicker");
const title = document.querySelector("#round-title");
const instruction = document.querySelector("#instruction");
const roundNumber = document.querySelector("#round-number");
const readout = document.querySelector("#reaction-readout");
const bestTime = document.querySelector("#best-time");
const statusValue = document.querySelector("#status-value");
const statusDetail = document.querySelector("#status-detail");
const soundToggle = document.querySelector("#sound-toggle");
const aimPanel = document.querySelector("#aim-panel");
const aimArea = document.querySelector("#aim-area");
const target = document.querySelector("#target");
const reticle = document.querySelector("#reticle");
const focusFill = document.querySelector("#focus-fill");
const focusValue = document.querySelector("#focus-value");

let state = "idle";
let round = 0;
let signalAt = 0;
let aimStartedAt = 0;
let lastFrame = 0;
let waitTimer;
let rivalTimer;
let aimFrame;
let audioContext;
let aimX = 50;
let aimY = 70;
let targetX = 50;
let targetY = 34;
let targetVelocityX = 13;
let targetVelocityY = 8;
let focus = 100;

const rivals = [
  ["Rook Halden", "known for patience"],
  ["Mara Vail", "never misses a tell"],
  ["Eli Sorrell", "quiet at the wire"],
  ["Nell Quill", "quick on the count"],
];

function setButton(kicker, main) {
  buttonKicker.textContent = kicker;
  buttonMain.textContent = main;
}

function setStatus(value, detail) {
  statusValue.textContent = value;
  statusDetail.textContent = detail;
}

function clearRoundTimers() {
  clearTimeout(waitTimer);
  clearTimeout(rivalTimer);
}

function resetClasses() {
  card.classList.remove("waiting", "signal", "aiming", "result-hit", "result-miss", "result-lost", "false-start");
}

function stopAim() {
  cancelAnimationFrame(aimFrame);
  aimPanel.hidden = true;
}

function playTone(frequency, duration) {
  if (!soundToggle.checked) return;
  try {
    audioContext ||= new AudioContext();
    const oscillator = audioContext.createOscillator();
    const gain = audioContext.createGain();
    oscillator.type = "triangle";
    oscillator.frequency.value = frequency;
    gain.gain.setValueAtTime(0.05, audioContext.currentTime);
    gain.gain.exponentialRampToValueAtTime(0.001, audioContext.currentTime + duration);
    oscillator.connect(gain).connect(audioContext.destination);
    oscillator.start();
    oscillator.stop(audioContext.currentTime + duration);
  } catch (_) {
    // Optional audio must never prevent a round from playing.
  }
}

function loadBest() {
  try {
    const best = Number(localStorage.getItem("sundownSignalBest"));
    bestTime.textContent = best > 0 ? `${best} ms` : "--";
  } catch (_) {
    bestTime.textContent = "--";
  }
}

function updateSight() {
  reticle.style.left = `${aimX}%`;
  reticle.style.top = `${aimY}%`;
  target.style.left = `${targetX}%`;
  target.style.top = `${targetY}%`;
  focusFill.style.width = `${focus}%`;
  focusFill.style.background = focus < 35 ? "#ed714e" : "#f4c86b";
  focusValue.textContent = `${Math.ceil(focus)}%`;
}

function startRound() {
  clearRoundTimers();
  stopAim();
  state = "waiting";
  round += 1;
  resetClasses();
  card.classList.add("waiting");
  roundNumber.textContent = `FIELD ROUND ${String(round).padStart(2, "0")}`;
  title.textContent = "Listen for the lamp.";
  instruction.textContent = "Moving before the signal gives the field away.";
  readout.textContent = "Hold position.";
  setStatus("LISTENING", "signal has not come");
  setButton("Do not confirm early", "Hold your ground");
  waitTimer = window.setTimeout(showSignal, 1500 + Math.random() * 3500);
}

function showSignal() {
  state = "aiming";
  card.classList.remove("waiting");
  card.classList.add("signal", "aiming");
  signalAt = performance.now();
  aimStartedAt = signalAt;
  lastFrame = signalAt;
  aimX = 50;
  aimY = 72;
  targetX = 28 + Math.random() * 44;
  targetY = 22 + Math.random() * 32;
  targetVelocityX = (Math.random() < 0.5 ? -1 : 1) * (10 + Math.random() * 10);
  targetVelocityY = (Math.random() < 0.5 ? -1 : 1) * (5 + Math.random() * 7);
  focus = 100;
  title.textContent = "The line is live.";
  instruction.textContent = "Settle the sight, then confirm one shot.";
  setStatus("LIVE", "focus is draining");
  setButton("Space, Enter, or tap", "Confirm shot");
  aimPanel.hidden = false;
  updateSight();
  aimArea.focus({ preventScroll: true });
  aimFrame = requestAnimationFrame(runAim);
  playTone(740, 0.13);
  const rivalTime = 2900 + Math.random() * 1800;
  rivalTimer = window.setTimeout(() => loseToRival(Math.round(rivalTime)), rivalTime);
}

function runAim(now) {
  if (state !== "aiming") return;
  const delta = Math.min((now - lastFrame) / 1000, 0.05);
  lastFrame = now;
  targetX += targetVelocityX * delta;
  targetY += targetVelocityY * delta;
  if (targetX < 10 || targetX > 90) targetVelocityX *= -1;
  if (targetY < 17 || targetY > 74) targetVelocityY *= -1;
  targetX = Math.max(10, Math.min(90, targetX));
  targetY = Math.max(17, Math.min(74, targetY));
  focus = Math.max(0, 100 - (now - aimStartedAt) / 46);
  updateSight();
  aimFrame = requestAnimationFrame(runAim);
}

function falseStart() {
  clearRoundTimers();
  stopAim();
  state = "result";
  resetClasses();
  card.classList.add("false-start");
  roundNumber.textContent = "FIELD FAULT";
  title.textContent = "You broke the silence.";
  instruction.textContent = "The round ends before a sight can settle.";
  readout.textContent = "Early confirmation recorded.";
  setStatus("VOID", "action before signal");
  setButton("Space, Enter, or tap", "Reset the field");
  playTone(150, 0.18);
}

function finishShot() {
  const reaction = Math.round(performance.now() - signalAt);
  const distance = Math.hypot(aimX - targetX, aimY - targetY);
  const accuracyWindow = 5 + focus * 0.04;
  clearTimeout(rivalTimer);
  stopAim();
  state = "result";
  resetClasses();

  if (distance > accuracyWindow) {
    card.classList.add("result-miss");
    roundNumber.textContent = "SIGHT OFF LINE";
    title.textContent = "The figure kept walking.";
    instruction.textContent = "A clean decision needs a settled sight.";
    readout.textContent = `Off by ${distance.toFixed(1)} units · window ${accuracyWindow.toFixed(1)}`;
    setStatus("MISSED", "no mark confirmed");
    setButton("Space, Enter, or tap", "Open another round");
    playTone(150, 0.18);
    return;
  }

  card.classList.add("result-hit");
  roundNumber.textContent = "MARK CONFIRMED";
  title.textContent = "A clean line through dusk.";
  instruction.textContent = "The range goes quiet again.";
  readout.textContent = `${reaction} ms reaction · ${Math.ceil(focus)}% focus remaining`;
  setStatus("CONFIRMED", "one precise shot");
  setButton("Space, Enter, or tap", "Run it again");
  saveBest(reaction);
  playTone(620, 0.16);
}

function loseToRival(rivalTime) {
  if (state !== "aiming") return;
  stopAim();
  state = "result";
  resetClasses();
  card.classList.add("result-lost");
  roundNumber.textContent = "WINDOW CLOSED";
  title.textContent = "The far side moved first.";
  instruction.textContent = "The next signal will not wait for you.";
  readout.textContent = `Opposing shot confirmed at ${rivalTime} ms.`;
  setStatus("LATE", "the window is closed");
  setButton("Space, Enter, or tap", "Return to position");
  playTone(170, 0.2);
}

function saveBest(reaction) {
  try {
    const oldBest = Number(localStorage.getItem("sundownSignalBest"));
    if (!oldBest || reaction < oldBest) {
      localStorage.setItem("sundownSignalBest", String(reaction));
      bestTime.textContent = `${reaction} ms`;
      instruction.textContent = oldBest ? "New record entered in the ledger." : "First record entered in the ledger.";
    }
  } catch (_) {
    // Storage can be unavailable in private contexts; the current round still works.
  }
}

function handleAction() {
  if (state === "idle" || state === "result") startRound();
  else if (state === "waiting") falseStart();
  else if (state === "aiming") finishShot();
}

function moveSight(clientX, clientY) {
  if (state !== "aiming") return;
  const bounds = aimArea.getBoundingClientRect();
  aimX = Math.max(0, Math.min(100, ((clientX - bounds.left) / bounds.width) * 100));
  aimY = Math.max(0, Math.min(100, ((clientY - bounds.top) / bounds.height) * 100));
  updateSight();
}

drawButton.addEventListener("click", handleAction);
aimArea.addEventListener("pointerdown", (event) => {
  aimArea.setPointerCapture?.(event.pointerId);
  moveSight(event.clientX, event.clientY);
});
aimArea.addEventListener("pointermove", (event) => moveSight(event.clientX, event.clientY));
document.addEventListener("keydown", (event) => {
  if (event.target.matches("input, button")) return;
  if (state === "aiming" && ["ArrowUp", "ArrowDown", "ArrowLeft", "ArrowRight", "KeyW", "KeyA", "KeyS", "KeyD"].includes(event.code)) {
    event.preventDefault();
    const step = event.shiftKey ? 6 : 3;
    if (event.code === "ArrowUp" || event.code === "KeyW") aimY = Math.max(0, aimY - step);
    if (event.code === "ArrowDown" || event.code === "KeyS") aimY = Math.min(100, aimY + step);
    if (event.code === "ArrowLeft" || event.code === "KeyA") aimX = Math.max(0, aimX - step);
    if (event.code === "ArrowRight" || event.code === "KeyD") aimX = Math.min(100, aimX + step);
    updateSight();
    return;
  }
  if (!["Space", "Enter"].includes(event.code) || event.repeat) return;
  event.preventDefault();
  handleAction();
});

const [rivalName, rivalNote] = rivals[Math.floor(Math.random() * rivals.length)];
document.querySelector("#opponent-name").textContent = rivalName;
document.querySelector("#opponent-detail").textContent = rivalNote;
loadBest();
