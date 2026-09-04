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
const focusPanel = document.querySelector("#focus-panel");
const chargeFill = document.querySelector("#charge-fill");
const chargeValue = document.querySelector("#charge-value");
const aimPanel = document.querySelector("#aim-panel");
const aimArea = document.querySelector("#aim-area");
const target = document.querySelector("#target");
const reticle = document.querySelector("#reticle");
const focusFill = document.querySelector("#focus-fill");
const focusValue = document.querySelector("#focus-value");
const accuracyValue = document.querySelector("#accuracy-value");
const pressureFill = document.querySelector("#pressure-fill");
const pressureValue = document.querySelector("#pressure-value");

let state = "idle";
let round = 0;
let signalAt = 0;
let aimStartedAt = 0;
let lastFrame = 0;
let waitTimer;
let rivalTimer;
let roundFrame;
let audioContext;
let focusHeld = false;
let focus = 0;
let aimX = 50;
let aimY = 70;
let targetX = 50;
let targetY = 34;
let targetVelocityX = 13;
let targetVelocityY = 8;
let rivalTime = 0;

const rivals = [["Rook Halden", "known for patience"], ["Mara Vail", "never misses a tell"], ["Eli Sorrell", "quiet at the wire"], ["Nell Quill", "quick on the count"]];

function setButton(kicker, main) { buttonKicker.textContent = kicker; buttonMain.textContent = main; }
function setStatus(value, detail) { statusValue.textContent = value; statusDetail.textContent = detail; }
function clearRoundTimers() { clearTimeout(waitTimer); clearTimeout(rivalTimer); }
function resetClasses() { card.classList.remove("waiting", "signal", "drawing", "aiming", "result-hit", "result-miss", "result-lost"); }
function stopRoundFrame() { cancelAnimationFrame(roundFrame); }
function hidePanels() { focusPanel.hidden = true; aimPanel.hidden = true; }

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
  } catch (_) { /* Optional audio must never prevent a round from playing. */ }
}

function loadBest() {
  try {
    const best = Number(localStorage.getItem("sundownSignalBest"));
    bestTime.textContent = best > 0 ? `${best} ms` : "--";
  } catch (_) { bestTime.textContent = "--"; }
}

function updateCharge() {
  chargeFill.style.width = `${focus}%`;
  chargeValue.textContent = `${Math.round(focus)}%`;
}

function updateSight(now = performance.now()) {
  const distance = Math.hypot(aimX - targetX, aimY - targetY);
  const windowSize = 4 + focus * 0.055;
  const confidence = Math.max(0, Math.min(100, Math.round((1 - distance / (windowSize * 2.1)) * 100)));
  const pressure = Math.max(0, Math.min(100, ((now - aimStartedAt) / rivalTime) * 100));
  reticle.style.left = `${aimX}%`;
  reticle.style.top = `${aimY}%`;
  reticle.style.setProperty("--confidence", confidence / 100);
  target.style.left = `${targetX}%`;
  target.style.top = `${targetY}%`;
  focusFill.style.width = `${focus}%`;
  focusFill.style.background = focus < 30 ? "#ed714e" : "#f4c86b";
  focusValue.textContent = `${Math.ceil(focus)}%`;
  pressureFill.style.width = `${pressure}%`;
  pressureValue.textContent = `${Math.round(pressure)}%`;
  accuracyValue.textContent = confidence >= 78 ? "LOCKED" : confidence >= 45 ? "CLOSING" : "SEARCHING";
  accuracyValue.dataset.state = confidence >= 78 ? "locked" : confidence >= 45 ? "closing" : "searching";
}

function startRound() {
  clearRoundTimers();
  stopRoundFrame();
  state = "waiting";
  round += 1;
  focus = 0;
  focusHeld = false;
  resetClasses();
  hidePanels();
  card.classList.add("waiting");
  focusPanel.hidden = false;
  updateCharge();
  roundNumber.textContent = `FIELD ROUND ${String(round).padStart(2, "0")}`;
  title.textContent = "Build focus in the quiet.";
  instruction.textContent = "Hold the action control. The reserve follows you into the draw.";
  readout.textContent = "The wire is quiet.";
  setStatus("STEADYING", "hold to gather focus");
  setButton("Hold Space, Enter, or press", "Gather focus");
  waitTimer = window.setTimeout(showDraw, 1900 + Math.random() * 3300);
  roundFrame = requestAnimationFrame(runWait);
}

function runWait() {
  if (state !== "waiting") return;
  focus = Math.min(100, Math.max(0, focus + (focusHeld ? 0.55 : -0.1)));
  updateCharge();
  roundFrame = requestAnimationFrame(runWait);
}

function showDraw() {
  stopRoundFrame();
  state = "draw";
  focusHeld = false;
  card.classList.remove("waiting");
  card.classList.add("signal", "drawing");
  roundNumber.textContent = "DRAW SIGNAL";
  title.textContent = "The lamp has spoken.";
  instruction.textContent = "Draw now. The far side is listening too.";
  readout.textContent = `${Math.round(focus)}% focus carried forward.`;
  setStatus("DRAW", "make the first motion");
  setButton("Space, Enter, or tap", "Draw");
  playTone(740, 0.13);
}

function drawWeapon() {
  state = "aiming";
  signalAt = performance.now();
  aimStartedAt = signalAt;
  lastFrame = signalAt;
  rivalTime = 2500 + Math.random() * 1600;
  aimX = 50;
  aimY = 72;
  targetX = 28 + Math.random() * 44;
  targetY = 22 + Math.random() * 32;
  targetVelocityX = (Math.random() < 0.5 ? -1 : 1) * (10 + Math.random() * 10);
  targetVelocityY = (Math.random() < 0.5 ? -1 : 1) * (5 + Math.random() * 7);
  card.classList.remove("signal", "drawing");
  card.classList.add("aiming");
  focusPanel.hidden = true;
  aimPanel.hidden = false;
  roundNumber.textContent = "SIGHT LINE";
  title.textContent = "Find a clean line.";
  instruction.textContent = "Pressure rises after the draw. Settle, then fire.";
  setStatus("EXPOSED", "opponent is moving");
  setButton("Space, Enter, or tap", "Fire shot");
  updateSight(signalAt);
  aimArea.focus({ preventScroll: true });
  roundFrame = requestAnimationFrame(runAim);
  rivalTimer = window.setTimeout(() => loseToRival(), rivalTime);
  playTone(480, 0.08);
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
  focus = Math.max(0, focus - delta * 15);
  updateSight(now);
  roundFrame = requestAnimationFrame(runAim);
}

function finishShot() {
  const reaction = Math.round(performance.now() - signalAt);
  const distance = Math.hypot(aimX - targetX, aimY - targetY);
  const windowSize = 4 + focus * 0.055;
  clearRoundTimers();
  stopRoundFrame();
  hidePanels();
  state = "result";
  resetClasses();
  if (distance > windowSize) {
    card.classList.add("result-miss");
    roundNumber.textContent = "SIGHT OFF LINE";
    title.textContent = "The figure kept walking.";
    instruction.textContent = "A fuller reserve gives the reticle more room to settle.";
    readout.textContent = `Off by ${distance.toFixed(1)} units. The line needed ${windowSize.toFixed(1)}.`;
    setStatus("MISSED", "no mark confirmed");
    setButton("Space, Enter, or tap", "Open another round");
    playTone(150, 0.18);
    return;
  }
  card.classList.add("result-hit");
  roundNumber.textContent = "MARK CONFIRMED";
  title.textContent = "A clean line through dusk.";
  instruction.textContent = "The range goes quiet again.";
  readout.textContent = `${reaction} ms after draw · ${Math.ceil(focus)}% reserve remaining`;
  setStatus("CONFIRMED", "one precise shot");
  setButton("Space, Enter, or tap", "Run it again");
  saveBest(reaction);
  playTone(620, 0.16);
}

function loseToRival() {
  if (state !== "aiming") return;
  stopRoundFrame();
  hidePanels();
  state = "result";
  resetClasses();
  card.classList.add("result-lost");
  roundNumber.textContent = "WINDOW CLOSED";
  title.textContent = "The far side moved first.";
  instruction.textContent = "Gather a deeper reserve, then make your line sooner.";
  readout.textContent = "Opposing pressure reached its mark.";
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
  } catch (_) { /* Storage can be unavailable; the current round still works. */ }
}

function handleAction() {
  if (state === "idle" || state === "result") startRound();
  else if (state === "draw") drawWeapon();
  else if (state === "aiming") finishShot();
}

function moveSight(clientX, clientY) {
  if (state !== "aiming") return;
  const bounds = aimArea.getBoundingClientRect();
  aimX = Math.max(0, Math.min(100, ((clientX - bounds.left) / bounds.width) * 100));
  aimY = Math.max(0, Math.min(100, ((clientY - bounds.top) / bounds.height) * 100));
  updateSight();
}

drawButton.addEventListener("pointerdown", (event) => {
  if (state === "waiting") { focusHeld = true; event.preventDefault(); return; }
  handleAction();
});
drawButton.addEventListener("pointerup", () => { focusHeld = false; });
drawButton.addEventListener("pointercancel", () => { focusHeld = false; });
aimArea.addEventListener("pointerdown", (event) => { aimArea.setPointerCapture?.(event.pointerId); moveSight(event.clientX, event.clientY); });
aimArea.addEventListener("pointermove", (event) => moveSight(event.clientX, event.clientY));
document.addEventListener("keydown", (event) => {
  if (event.target.matches("input")) return;
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
  if (state === "waiting") focusHeld = true;
  else handleAction();
});
document.addEventListener("keyup", (event) => { if (["Space", "Enter"].includes(event.code)) focusHeld = false; });

const [rivalName, rivalNote] = rivals[Math.floor(Math.random() * rivals.length)];
document.querySelector("#opponent-name").textContent = rivalName;
document.querySelector("#opponent-detail").textContent = rivalNote;
loadBest();
