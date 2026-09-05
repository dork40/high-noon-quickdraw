export type SoundName = "click" | "signal" | "shot" | "negative" | "bottle" | "win" | "loss";

let muted = false;
let context: AudioContext | undefined;

export function loadMuted() { try { muted = localStorage.getItem("high-noon-muted") === "true"; } catch { /* Storage is optional. */ } return muted; }
export function isMuted() { return muted; }
export function toggleMuted() { muted = !muted; try { localStorage.setItem("high-noon-muted", String(muted)); } catch { /* Storage is optional. */ } return muted; }

export function playSound(name: SoundName) {
  if (muted || typeof AudioContext === "undefined") return;
  try {
    context ??= new AudioContext();
    if (context.state === "suspended") void context.resume().catch(() => undefined);
    const now = context.currentTime;
    const tones: Record<SoundName, [number, number, number]> = { click: [340, .035, .03], signal: [760, .11, .08], shot: [105, .09, .14], negative: [150, .15, .11], bottle: [980, .12, .08], win: [520, .22, .1], loss: [190, .22, .1] };
    const [frequency, duration, gain] = tones[name];
    const oscillator = context.createOscillator(); const volume = context.createGain();
    oscillator.type = name === "shot" ? "sawtooth" : "triangle";
    oscillator.frequency.setValueAtTime(frequency, now); oscillator.frequency.exponentialRampToValueAtTime(Math.max(35, frequency * (name === "win" ? 1.5 : .55)), now + duration);
    volume.gain.setValueAtTime(gain, now); volume.gain.exponentialRampToValueAtTime(.001, now + duration);
    oscillator.connect(volume).connect(context.destination); oscillator.start(now); oscillator.stop(now + duration);
  } catch { /* Audio is an enhancement and must never interrupt play. */ }
}
