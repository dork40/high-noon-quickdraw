import type { DuelResult, DuelWord, GameSettings } from "../types";

export const settings: GameSettings = {
  minWaitMs: 2000,
  maxWaitMs: 6000,
  minOpponentReactionMs: 550,
  maxOpponentReactionMs: 1400,
};

export const randomBetween = (minimum: number, maximum: number): number =>
  Math.round(minimum + Math.random() * (maximum - minimum));

export function createRoundTiming(config = settings) {
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
