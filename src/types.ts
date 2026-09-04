export type RoundPhase = "menu" | "waiting" | "draw" | "result";
export type DuelOutcome = "win" | "loss" | "false-start";

export interface Player { id: string; name: string; wins: number; losses: number; }
export interface Room { code: string; players: Player[]; status: "lobby" | "playing"; }
export interface Round { number: number; phase: RoundPhase; drawAt?: number; opponentReactionMs?: number; }
export interface DuelResult { outcome: DuelOutcome; reactionMs?: number; opponentReactionMs: number; message: string; }
export interface GameSettings { minWaitMs: number; maxWaitMs: number; minOpponentReactionMs: number; maxOpponentReactionMs: number; }
