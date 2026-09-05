export type GameMode = "original-quick-draw" | "word-duel" | "trail-trace";
export type AiDifficulty = "easy" | "normal" | "hard";
export type WordDuelPhase = "menu" | "waiting" | "word" | "result";
export type OriginalQuickDrawPhase = "menu" | "waiting" | "draw" | "result";
export type TrailTracePhase = "menu" | "tracing" | "result";
export type RoundPhase = WordDuelPhase | OriginalQuickDrawPhase | TrailTracePhase;
export type DuelOutcome = "win" | "loss" | "false-start";

export interface Player { id: string; name: string; wins: number; losses: number; }
export type RoomStatus = "lobby" | "ready" | "playing";
export interface RoundAction {
  at: string;
  reactionMs: number;
  falseStart?: boolean;
  score?: number;
  progress?: number;
  accuracy?: number;
}
export interface MultiplayerRound {
  id: string;
  startAt: string;
  word?: DuelWord;
  pathSeed?: number;
  hostAction?: RoundAction;
  guestAction?: RoundAction;
  winner?: "host" | "guest";
  resolvedAt?: string;
}
export interface RoomRoundState {
  hostReady: boolean;
  guestReady: boolean;
  round?: MultiplayerRound;
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
export interface QuickMatchQueueEntry {
  userId: string;
  mode: GameMode;
  roomCode: string | null;
  createdAt: string;
  matchedAt: string | null;
}
export interface BaseRound { number: number; opponentReactionMs?: number; result?: DuelResult; }
export interface WordDuelRound extends BaseRound { mode: "word-duel"; phase: WordDuelPhase; word?: DuelWord; wordAt?: number; }
export interface OriginalQuickDrawRound extends BaseRound { mode: "original-quick-draw"; phase: OriginalQuickDrawPhase; drawAt?: number; }
export interface TrailTraceRound extends BaseRound { mode: "trail-trace"; phase: TrailTracePhase; pathSeed: number; playerScore?: number; playerProgress?: number; playerAccuracy?: number; }
export type Round = WordDuelRound | OriginalQuickDrawRound | TrailTraceRound;
export interface DuelResult { outcome: DuelOutcome; reactionMs?: number; opponentReactionMs: number; message: string; }
export interface GameSettings { minWaitMs: number; maxWaitMs: number; minOpponentReactionMs: number; maxOpponentReactionMs: number; }
export type DuelWord = "SHOOT" | "DRAW" | "POW";
