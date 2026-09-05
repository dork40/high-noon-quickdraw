import type { AiDifficulty, DuelResult, DuelWord, GameSettings, RpsChoice } from "../types";

export const bottleRoundMs = 30_000;
export const bottleTargetMs = 1_500;
export const bottlesPerWave = 6;
export const bottleMissPenalty = -10;
export const rpsDecisionMs = 7_000;
export type BottleKind = "green" | "blue" | "red";
export interface BottleTarget { id: number; kind: BottleKind; x: number; y: number; }

export const settings: GameSettings = {
  minWaitMs: 2000,
  maxWaitMs: 6000,
  minOpponentReactionMs: 550,
  maxOpponentReactionMs: 1400,
};

export const aiDifficultySettings: Record<AiDifficulty, GameSettings> = {
  easy: { ...settings, minOpponentReactionMs: 1200, maxOpponentReactionMs: 2200 },
  normal: settings,
  hard: { ...settings, minOpponentReactionMs: 250, maxOpponentReactionMs: 650 },
};

export const randomBetween = (minimum: number, maximum: number): number =>
  Math.round(minimum + Math.random() * (maximum - minimum));

export function createRoundTiming(difficulty: AiDifficulty = "normal") {
  const config = aiDifficultySettings[difficulty];
  return {
    waitMs: randomBetween(config.minWaitMs, config.maxWaitMs),
    opponentReactionMs: randomBetween(config.minOpponentReactionMs, config.maxOpponentReactionMs),
  };
}

const duelWords: DuelWord[] = ["SHOOT", "DRAW", "POW"];

export function randomDuelWord(): DuelWord {
  return duelWords[Math.floor(Math.random() * duelWords.length)]!;
}

export function resolveShot(reactionMs: number, opponentReactionMs: number): DuelResult {
  if (reactionMs < opponentReactionMs) {
    return { outcome: "win", reactionMs, opponentReactionMs, message: "You were faster on the draw." };
  }
  return { outcome: "loss", reactionMs, opponentReactionMs, message: "The other gun spoke first." };
}

export function falseStart(opponentReactionMs: number): DuelResult {
  return { outcome: "false-start", opponentReactionMs, message: "False start. No one draws before the bell." };
}

function seededRandom(seed: number) {
  let value = seed >>> 0;
  return () => {
    value = (value * 1664525 + 1013904223) >>> 0;
    return value / 4294967296;
  };
}

export function createBottleSchedule(seed: number, count = Math.ceil(bottleRoundMs / bottleTargetMs) * bottlesPerWave): BottleTarget[] {
  const random = seededRandom(seed);
  const positions = [18, 42, 66, 82].flatMap(x => [22, 50, 78].map(y => ({ x, y })));
  let availablePositions: { x: number; y: number; }[] = [];
  let availableKinds: BottleKind[] = [];
  return Array.from({ length: count }, (_, id) => {
    if (id % bottlesPerWave === 0) {
      availablePositions = [...positions];
      // Every wave has more red hazards than either scoring color, but remains half playable.
      availableKinds = ["green", "green", "blue", "red", "red", "red"];
    }
    const position = availablePositions.splice(Math.floor(random() * availablePositions.length), 1)[0]!;
    const kind = availableKinds.splice(Math.floor(random() * availableKinds.length), 1)[0]!;
    return { id, kind, x: position.x, y: position.y };
  });
}

export function bottleScore(kind: BottleKind) { return kind === "red" ? -10 : 10; }

export function aiBottleScore(difficulty: AiDifficulty) {
  const goodHits = difficulty === "easy" ? randomBetween(24, 34) : difficulty === "normal" ? randomBetween(35, 45) : randomBetween(48, 58);
  const redHits = difficulty === "easy" ? randomBetween(8, 12) : difficulty === "normal" ? randomBetween(5, 8) : randomBetween(2, 4);
  const rangeMisses = difficulty === "easy" ? randomBetween(8, 12) : difficulty === "normal" ? randomBetween(4, 7) : randomBetween(1, 3);
  return goodHits * 10 + (redHits + rangeMisses) * bottleMissPenalty;
}

export function aiRpsChoice(_difficulty: AiDifficulty): RpsChoice {
  return (["rock", "paper", "scissors"] as RpsChoice[])[Math.floor(Math.random() * 3)]!;
}

export function resolveRps(player: RpsChoice, opponent: RpsChoice): DuelResult {
  const beats: Record<RpsChoice, RpsChoice> = { rock: "scissors", paper: "rock", scissors: "paper" };
  if (player === opponent) return { outcome: "tie", opponentReactionMs: 0, message: "Matching signs tie. Start the next round." };
  const playerWins = player !== opponent && beats[player] === opponent;
  return { outcome: playerWins ? "win" : "loss", opponentReactionMs: 0, message: player === opponent ? "A tie. The host deals the next round." : `${player.toUpperCase()} ${playerWins ? "beats" : "loses to"} ${opponent.toUpperCase()}.` };
}
