export type GameMode = "original-quick-draw" | "word-duel" | "draw-fire";
export type DrawFirePhase = "menu" | "waiting" | "draw" | "aim" | "result";
export type WordDuelPhase = "menu" | "waiting" | "word" | "result";
export type OriginalQuickDrawPhase = "menu" | "waiting" | "draw" | "result";
export type RoundPhase = DrawFirePhase | WordDuelPhase | OriginalQuickDrawPhase;
export type DuelOutcome = "win" | "loss" | "false-start";

export interface Player { id: string; name: string; wins: number; losses: number; }
export type RoomStatus = "lobby" | "ready" | "playing";
export interface RoomRoundState {
  hostReady: boolean;
  guestReady: boolean;
  event?: { type: string; at: string; payload?: Record<string, unknown> };
}
export interface Room {
  code: string;
  hostId: string;
  guestId: string | null;
  mode: GameMode;
  status: RoomStatus;
  roundState: RoomRoundState;
  createdAt: string;
}
export interface BaseRound { number: number; opponentReactionMs?: number; result?: DuelResult; }
export interface DrawFireRound extends BaseRound { mode: "draw-fire"; phase: DrawFirePhase; drawAt?: number; }
export interface WordDuelRound extends BaseRound { mode: "word-duel"; phase: WordDuelPhase; word?: DuelWord; wordAt?: number; }
export interface OriginalQuickDrawRound extends BaseRound { mode: "original-quick-draw"; phase: OriginalQuickDrawPhase; drawAt?: number; }
export type Round = DrawFireRound | WordDuelRound | OriginalQuickDrawRound;
export interface DuelResult { outcome: DuelOutcome; reactionMs?: number; opponentReactionMs: number; message: string; }
export interface GameSettings { minWaitMs: number; maxWaitMs: number; minOpponentReactionMs: number; maxOpponentReactionMs: number; }
export type DuelWord = "SHOOT" | "DRAW" | "POW";
