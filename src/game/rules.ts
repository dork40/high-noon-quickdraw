import type { AiDifficulty, DuelResult, DuelWord, DustBluffChoice, GameSettings } from "../types";

export const bottleRoundMs = 30_000;
export const bottleTargetMs = 1_500;
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

export function createBottleSchedule(seed: number, count = Math.ceil(bottleRoundMs / bottleTargetMs)): BottleTarget[] {
  const random = seededRandom(seed);
  return Array.from({ length: count }, (_, id) => {
    const roll = random();
    return { id, kind: roll < .42 ? "green" : roll < .84 ? "blue" : "red", x: 15 + random() * 70, y: 14 + random() * 66 };
  });
}

export function bottleScore(kind: BottleKind) { return kind === "red" ? -10 : 10; }

export function aiBottleScore(difficulty: AiDifficulty) {
  const hits = difficulty === "easy" ? randomBetween(7, 11) : difficulty === "normal" ? randomBetween(11, 15) : randomBetween(15, 19);
  const mistakes = difficulty === "easy" ? randomBetween(2, 4) : difficulty === "normal" ? randomBetween(1, 2) : randomBetween(0, 1);
  return hits * 10 - mistakes * 10;
}

export function dustHandLabel(strength: number) {
  return strength >= 8 ? "HIGH TRAIL" : strength >= 5 ? "STEADY DUST" : "THIN DUST";
}

export function aiDustChoice(hand: number, difficulty: AiDifficulty): DustBluffChoice {
  const bluffChance = difficulty === "hard" ? .38 : difficulty === "easy" ? .18 : .28;
  if (hand <= 4 && Math.random() < bluffChance) return "bluff";
  return hand >= 7 ? "draw" : "hold";
}

// Dust Bluff is a three-choice nerve game, not poker: Hold beats Bluff, Bluff beats Draw, Draw beats Hold.
export function resolveDustBluff(playerHand: number, opponentHand: number, player: DustBluffChoice, opponent: DustBluffChoice): DuelResult {
  const beats: Record<DustBluffChoice, DustBluffChoice> = { draw: "hold", hold: "bluff", bluff: "draw" };
  const playerWins = player === opponent ? playerHand >= opponentHand : beats[player] === opponent;
  return { outcome: playerWins ? "win" : "loss", opponentReactionMs: opponentHand, message: player === opponent ? `${playerWins ? "Your stronger hand held." : "Ash's stronger hand held."} Matching choices compare hand strength.` : `${player.toUpperCase()} ${playerWins ? "outread" : "was outread by"} ${opponent.toUpperCase()}. Draw beats Hold, Hold beats Bluff, Bluff beats Draw.` };
}
