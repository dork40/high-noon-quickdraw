export type DirectGameMode = "original-quick-draw" | "word-duel" | "trail-trace" | "bottle-shot" | "dust-bluff";
export type GameMode = DirectGameMode | "showdown-series";
export type AiDifficulty = "easy" | "normal" | "hard";
export type WordDuelPhase = "menu" | "waiting" | "word" | "result";
export type OriginalQuickDrawPhase = "menu" | "waiting" | "draw" | "result";
export type TrailTracePhase = "menu" | "tracing" | "result";
export type BottleShotPhase = "menu" | "playing" | "result";
export type DustBluffPhase = "menu" | "choosing" | "result";
export type RoundPhase = WordDuelPhase | OriginalQuickDrawPhase | TrailTracePhase | BottleShotPhase | DustBluffPhase;
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
  choice?: DustBluffChoice;
}
export interface MultiplayerRound {
  id: string;
  startAt: string;
  word?: DuelWord;
  pathSeed?: number;
  targetSeed?: number;
  endAt?: string;
  gameMode?: DirectGameMode;
  hostHand?: number;
  guestHand?: number;
  decisionEndsAt?: string;
  seriesHostWins?: number;
  seriesGuestWins?: number;
  seriesRound?: number;
  matchWinner?: "host" | "guest";
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
export interface BottleShotRound extends BaseRound { mode: "bottle-shot"; phase: BottleShotPhase; targetSeed: number; startAt?: number; endAt?: number; playerScore?: number; }
export type DustBluffChoice = "draw" | "hold" | "bluff";
export interface DustBluffRound extends BaseRound { mode: "dust-bluff"; phase: DustBluffPhase; playerHand: number; opponentHand: number; decisionEndsAt?: number; playerChoice?: DustBluffChoice; opponentChoice?: DustBluffChoice; }
export type Round = WordDuelRound | OriginalQuickDrawRound | TrailTraceRound | BottleShotRound | DustBluffRound;
export interface DuelResult { outcome: DuelOutcome; reactionMs?: number; opponentReactionMs: number; message: string; }
export interface GameSettings { minWaitMs: number; maxWaitMs: number; minOpponentReactionMs: number; maxOpponentReactionMs: number; }
export type DuelWord = "SHOOT" | "DRAW" | "POW";
