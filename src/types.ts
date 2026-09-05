export type GameMode = "original-quick-draw" | "word-duel" | "draw-fire";
export type DrawFirePhase = "menu" | "waiting" | "draw" | "aim" | "result";
export type WordDuelPhase = "menu" | "waiting" | "word" | "result";
export type OriginalQuickDrawPhase = "menu" | "waiting" | "draw" | "result";
export type RoundPhase = DrawFirePhase | WordDuelPhase | OriginalQuickDrawPhase;
export type DuelOutcome = "win" | "loss" | "false-start";

export interface Player { id: string; name: string; wins: number; losses: number; }
export interface Room { code: string; players: Player[]; status: "lobby" | "playing"; }
export interface BaseRound { number: number; opponentReactionMs?: number; result?: DuelResult; }
export interface DrawFireRound extends BaseRound { mode: "draw-fire"; phase: DrawFirePhase; drawAt?: number; }
export interface WordDuelRound extends BaseRound { mode: "word-duel"; phase: WordDuelPhase; word?: DuelWord; wordAt?: number; }
export interface OriginalQuickDrawRound extends BaseRound { mode: "original-quick-draw"; phase: OriginalQuickDrawPhase; drawAt?: number; }
export type Round = DrawFireRound | WordDuelRound | OriginalQuickDrawRound;
export interface DuelResult { outcome: DuelOutcome; reactionMs?: number; opponentReactionMs: number; message: string; }
export interface GameSettings { minWaitMs: number; maxWaitMs: number; minOpponentReactionMs: number; maxOpponentReactionMs: number; }
export type DuelWord = "SHOOT" | "DRAW" | "POW";
