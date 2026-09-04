export type GameMode = "word-duel" | "draw-fire";
export type DrawFirePhase = "menu" | "waiting" | "draw" | "aim" | "result";
export type WordDuelPhase = "menu" | "waiting" | "word" | "result";
export type RoundPhase = DrawFirePhase | WordDuelPhase;
export type DuelOutcome = "win" | "loss" | "false-start";

export interface Player { id: string; name: string; wins: number; losses: number; }
export interface Room { code: string; players: Player[]; status: "lobby" | "playing"; }
export interface BaseRound { number: number; opponentReactionMs?: number; result?: DuelResult; }
export interface DrawFireRound extends BaseRound { mode: "draw-fire"; phase: DrawFirePhase; drawAt?: number; }
export interface WordDuelRound extends BaseRound { mode: "word-duel"; phase: WordDuelPhase; word?: DuelWord; wordAt?: number; }
export type Round = DrawFireRound | WordDuelRound;
export interface DuelResult { outcome: DuelOutcome; reactionMs?: number; opponentReactionMs: number; message: string; }
export interface GameSettings { minWaitMs: number; maxWaitMs: number; minOpponentReactionMs: number; maxOpponentReactionMs: number; }
export type DuelWord = "SHOOT" | "DRAW" | "POW";
