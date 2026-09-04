import type { Room } from "../types";

/** Transport boundary for a future server-authoritative WebSocket client. */
export interface MultiplayerService {
  createRoom(): Promise<Room>;
  joinRoom(code: string): Promise<Room>;
  leaveRoom(): Promise<void>;
  startMatch(): Promise<void>;
  sendShot(reactionMs: number): Promise<void>;
  syncGameState(): Promise<void>;
}

const unavailable = <T>(): Promise<T> => Promise.reject(new Error("Multiplayer is coming soon."));
export const multiplayer: MultiplayerService = {
  createRoom: unavailable, joinRoom: unavailable, leaveRoom: async () => undefined,
  startMatch: unavailable, sendShot: async () => undefined, syncGameState: async () => undefined,
};
