import { createClient, type RealtimeChannel, type SupabaseClient } from "@supabase/supabase-js";
import type { GameMode, Room, RoomRoundState, RoomStatus } from "../types";

type RoomRow = {
  code: string;
  host_id: string;
  guest_id: string | null;
  mode: GameMode;
  status: RoomStatus;
  round_state: RoomRoundState | null;
  created_at: string;
};

export class MultiplayerError extends Error {}

export interface MultiplayerService {
  isConfigured(): boolean;
  authenticate(): Promise<string>;
  createRoom(mode?: GameMode): Promise<Room>;
  joinRoom(code: string): Promise<Room>;
  setReady(ready: boolean): Promise<Room>;
  leaveRoom(): Promise<void>;
  subscribeToRoom(onRoom: (room: Room | null) => void, onError: (message: string) => void): () => void;
  publishRoundState(event: NonNullable<RoomRoundState["event"]>): Promise<Room>;
}

const url = import.meta.env.VITE_SUPABASE_URL;
const key = import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY;
const client: SupabaseClient | null = url && key ? createClient(url, key) : null;
let room: Room | null = null;
let channel: RealtimeChannel | null = null;

function requireClient(): SupabaseClient {
  if (!client) throw new MultiplayerError("Multiplayer is not configured. Add VITE_SUPABASE_URL and VITE_SUPABASE_PUBLISHABLE_KEY.");
  return client;
}

function mapRoom(row: RoomRow): Room {
  return {
    code: row.code,
    hostId: row.host_id,
    guestId: row.guest_id,
    mode: row.mode,
    status: row.status,
    roundState: { hostReady: false, guestReady: false, ...(row.round_state ?? {}) },
    createdAt: row.created_at,
  };
}

function explain(error: { message: string; code?: string }): MultiplayerError {
  if (error.code === "42P01" || /duel_rooms.*does not exist/i.test(error.message)) return new MultiplayerError("The duel_rooms table is missing. Run the SQL setup in README.md.");
  if (error.code === "42501" || /row-level security|permission denied/i.test(error.message)) return new MultiplayerError("Supabase denied this room action. Check the duel_rooms RLS policies in README.md.");
  return new MultiplayerError(error.message);
}

async function userId() {
  const supabase = requireClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (user) return user.id;
  const { data, error } = await supabase.auth.signInAnonymously();
  if (error || !data.user) throw explain(error ?? { message: "Anonymous sign-in did not return a user." });
  return data.user.id;
}

function roomCode() {
  const alphabet = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
  const values = crypto.getRandomValues(new Uint32Array(6));
  return Array.from(values, value => alphabet[value % alphabet.length]).join("");
}

async function updateRoom(values: Partial<RoomRow>) {
  if (!room) throw new MultiplayerError("Create or join a room first.");
  const { data, error } = await requireClient().from("duel_rooms").update(values).eq("code", room.code).select().single<RoomRow>();
  if (error) throw explain(error);
  room = mapRoom(data);
  return room;
}

export const multiplayer: MultiplayerService = {
  isConfigured: () => Boolean(client),
  authenticate: userId,

  async createRoom(mode = "original-quick-draw") {
    const hostId = await userId();
    const supabase = requireClient();
    for (let attempt = 0; attempt < 5; attempt++) {
      const { data, error } = await supabase.from("duel_rooms").insert({
        code: roomCode(), host_id: hostId, mode, status: "lobby", round_state: { hostReady: false, guestReady: false },
      }).select().single<RoomRow>();
      if (data) return room = mapRoom(data);
      if (error?.code !== "23505") throw explain(error!);
    }
    throw new MultiplayerError("Could not find an unused room code. Please try again.");
  },

  async joinRoom(rawCode) {
    const guestId = await userId();
    const code = rawCode.trim().toUpperCase().replace(/[^A-Z0-9]/g, "");
    if (code.length !== 6) throw new MultiplayerError("Enter the six-character room code.");
    const { data, error } = await requireClient().from("duel_rooms").update({ guest_id: guestId }).eq("code", code).is("guest_id", null).neq("host_id", guestId).select().maybeSingle<RoomRow>();
    if (error) throw explain(error);
    if (!data) throw new MultiplayerError("Room not found, already full, or you are its host.");
    return room = mapRoom(data);
  },

  async setReady(ready) {
    const id = await userId();
    if (!room || (room.hostId !== id && room.guestId !== id)) throw new MultiplayerError("You are not seated in this room.");
    const state = { ...room.roundState, [room.hostId === id ? "hostReady" : "guestReady"]: ready };
    const status: RoomStatus = room.guestId && state.hostReady && state.guestReady ? "ready" : "lobby";
    return updateRoom({ round_state: state, status });
  },

  async leaveRoom() {
    const id = await userId();
    if (!room) return;
    const supabase = requireClient();
    if (room.hostId === id) {
      const { error } = await supabase.from("duel_rooms").delete().eq("code", room.code);
      if (error) throw explain(error);
    } else if (room.guestId === id) {
      const { error } = await supabase.from("duel_rooms").update({ guest_id: null, status: "lobby", round_state: { ...room.roundState, guestReady: false } }).eq("code", room.code).eq("guest_id", id);
      if (error) throw explain(error);
    }
    room = null;
  },

  subscribeToRoom(onRoom, onError) {
    if (!room || !client) return () => undefined;
    channel?.unsubscribe();
    const code = room.code;
    channel = client.channel(`duel-room-${code}`).on("postgres_changes", { event: "*", schema: "public", table: "duel_rooms", filter: `code=eq.${code}` }, payload => {
      if (payload.eventType === "DELETE") { room = null; onRoom(null); return; }
      room = mapRoom(payload.new as RoomRow);
      onRoom(room);
    }).subscribe(status => {
      if (status === "CHANNEL_ERROR" || status === "TIMED_OUT") onError("Realtime connection failed. Confirm Realtime is enabled for public.duel_rooms.");
    });
    return () => { channel?.unsubscribe(); channel = null; };
  },

  async publishRoundState(event) {
    if (!room) throw new MultiplayerError("Create or join a room first.");
    return updateRoom({ round_state: { ...room.roundState, event } });
  },
};
