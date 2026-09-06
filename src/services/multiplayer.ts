import { createClient, type RealtimeChannel, type SupabaseClient } from "@supabase/supabase-js";
import type { GameMode, MultiplayerRound, QuickMatchQueueEntry, Room, RoomRoundState, RoomStatus, RpsChoice } from "../types";
import { minimumTrailAccuracy, minimumTrailProgress } from "../game/trail";

type RoomRow = {
  code: string;
  host_id: string;
  guest_id: string | null;
  mode: GameMode;
  status: RoomStatus;
  round_state: RoomRoundState | null;
  created_at: string;
};
type QuickMatchQueueRow = {
  user_id: string;
  mode: GameMode;
  room_code: string | null;
  created_at: string;
  matched_at: string | null;
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
  requestQuickMatch(mode: GameMode): Promise<Room | null>;
  restoreQuickMatch(): Promise<{ mode: GameMode; room: Room | null } | null>;
  cancelQuickMatch(): Promise<Room | null>;
  subscribeToQuickMatch(onMatch: (room: Room) => void, onError: (message: string) => void): () => void;
  startRound(round: MultiplayerRound): Promise<Room>;
  submitRoundAction(roundId: string, reactionMs: number, falseStart: boolean, payload?: Partial<{ score: number; progress: number; accuracy: number; reachedEnd: boolean; choice: RpsChoice }>): Promise<Room>;
  resolveRound(roundId: string, allowSingleReaction?: boolean): Promise<Room>;
  sendLiveAction(event: { roundId: string; reactionMs: number; falseStart: boolean; payload?: Partial<{ score: number; progress: number; accuracy: number; reachedEnd: boolean; choice: RpsChoice }> }): boolean;
  onLiveEvent(listener: (event: { roundId: string }) => void): () => void;
  transportStatus(): "connecting" | "connected" | "fallback" | "unavailable";
  localStartAt(hostStartAt: string): number;
}

const url = import.meta.env.VITE_SUPABASE_URL;
const key = import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY;
const client: SupabaseClient | null = url && key ? createClient(url, key) : null;
let room: Room | null = null;
let channel: RealtimeChannel | null = null;
let quickMatchChannel: RealtimeChannel | null = null;
let localUserId: string | null = null;
let peer: RTCPeerConnection | null = null;
let dataChannel: RTCDataChannel | null = null;
let transport: "connecting" | "connected" | "fallback" | "unavailable" = typeof RTCPeerConnection === "undefined" ? "unavailable" : "fallback";
let liveListener: ((event: { roundId: string }) => void) | undefined;
const peerActions = new Map<string, { hostAction?: MultiplayerRound["hostAction"]; guestAction?: MultiplayerRound["guestAction"] }>();
let hostClockOffsetMs = 0;
let bestClockRoundTripMs = Infinity;
let clockPingTimer: number | undefined;

function closePeer() {
  dataChannel?.close(); dataChannel = null;
  peer?.close(); peer = null;
  peerActions.clear();
  window.clearTimeout(clockPingTimer);
  clockPingTimer = undefined;
  hostClockOffsetMs = 0;
  bestClockRoundTripMs = Infinity;
  transport = typeof RTCPeerConnection === "undefined" ? "unavailable" : "fallback";
}

function attachDataChannel(next: RTCDataChannel) {
  dataChannel = next;
  next.onopen = () => {
    transport = "connected";
    if (room && localUserId === room.guestId) sendClockPing(0);
  };
  next.onclose = () => { if (transport === "connected") transport = "fallback"; };
  next.onerror = () => { transport = "fallback"; };
  next.onmessage = event => {
    try {
      const message = JSON.parse(event.data) as { type: string; event?: { roundId: string; reactionMs: number; falseStart: boolean; payload?: MultiplayerRound["hostAction"] }; pingId?: string; sentAt?: number; hostNow?: number };
      if (message.type === "clock-ping" && room && localUserId === room.hostId && message.pingId && Number.isFinite(message.sentAt)) {
        dataChannel?.send(JSON.stringify({ type: "clock-pong", pingId: message.pingId, sentAt: message.sentAt, hostNow: Date.now() }));
        return;
      }
      const sentAt = message.sentAt;
      const hostNow = message.hostNow;
      if (message.type === "clock-pong" && room && localUserId === room.guestId && message.pingId && typeof sentAt === "number" && Number.isFinite(sentAt) && typeof hostNow === "number" && Number.isFinite(hostNow)) {
        const receivedAt = Date.now();
        const roundTrip = receivedAt - sentAt;
        // The lowest-RTT sample is least distorted by queueing on either peer.
        if (roundTrip >= 0 && roundTrip < bestClockRoundTripMs) {
          bestClockRoundTripMs = roundTrip;
          hostClockOffsetMs = hostNow - (sentAt + roundTrip / 2);
        }
        return;
      }
      if (message.type !== "action" || !message.event || !room || message.event.roundId !== room.roundState.round?.id) return;
      const mode = room.roundState.round.gameMode ?? room.mode;
      const payload = message.event.payload;
      if (mode === "trail-trace" && (!Number.isFinite(payload?.score) || !Number.isFinite(payload?.progress) || !Number.isFinite(payload?.accuracy) || payload?.reachedEnd !== true || payload.score! < 0 || payload.score! > 108 || payload.progress! < minimumTrailProgress || payload.progress! > 100 || payload.accuracy! < minimumTrailAccuracy || payload.accuracy! > 100)) return;
      if (mode === "rock-paper-scissors" && !["rock", "paper", "scissors"].includes(payload?.choice ?? "")) return;
      const actions = peerActions.get(message.event.roundId) ?? {};
      // The receiver is the other seat. Database state remains the durable fallback record.
      const action = { at: new Date().toISOString(), reactionMs: message.event.reactionMs, ...(message.event.falseStart ? { falseStart: true } : {}), ...message.event.payload };
      if (localUserId === room.hostId) actions.guestAction = action;
      else actions.hostAction = action;
      peerActions.set(message.event.roundId, actions);
      liveListener?.({ roundId: message.event.roundId });
    } catch { /* Ignore malformed peer data. */ }
  };
}

function sendClockPing(attempt: number) {
  if (!room || localUserId !== room.guestId || dataChannel?.readyState !== "open") return;
  const sentAt = Date.now();
  try { dataChannel.send(JSON.stringify({ type: "clock-ping", pingId: crypto.randomUUID(), sentAt })); } catch { transport = "fallback"; return; }
  if (attempt < 4) clockPingTimer = window.setTimeout(() => sendClockPing(attempt + 1), 100);
}

async function sendSignal(payload: Record<string, unknown>) {
  if (channel) await channel.send({ type: "broadcast", event: "webrtc", payload });
}

async function ensurePeer(initiator: boolean) {
  if (!room?.guestId || peer || typeof RTCPeerConnection === "undefined") return;
  transport = "connecting";
  peer = new RTCPeerConnection({ iceServers: [{ urls: "stun:stun.l.google.com:19302" }, { urls: "stun:global.stun.twilio.com:3478" }] });
  peer.onicecandidate = event => { if (event.candidate) void sendSignal({ type: "ice", candidate: event.candidate.toJSON() }); };
  peer.onconnectionstatechange = () => { if (!peer || ["failed", "disconnected", "closed"].includes(peer.connectionState)) transport = "fallback"; };
  peer.ondatachannel = event => attachDataChannel(event.channel);
  if (initiator) {
    attachDataChannel(peer.createDataChannel("high-noon-actions", { ordered: true }));
    const offer = await peer.createOffer(); await peer.setLocalDescription(offer);
    await sendSignal({ type: "offer", sdp: offer });
  }
}

async function handleSignal(payload: { type?: string; sdp?: RTCSessionDescriptionInit; candidate?: RTCIceCandidateInit }) {
  if (!room || !payload.type || typeof RTCPeerConnection === "undefined") return;
  const id = await userId();
  const initiator = room.hostId === id;
  if (payload.type === "offer" && !initiator && payload.sdp) {
    await ensurePeer(false); if (!peer) return;
    await peer.setRemoteDescription(payload.sdp); const answer = await peer.createAnswer(); await peer.setLocalDescription(answer); await sendSignal({ type: "answer", sdp: answer });
  } else if (payload.type === "answer" && initiator && payload.sdp && peer) await peer.setRemoteDescription(payload.sdp);
  else if (payload.type === "ice" && payload.candidate && peer) await peer.addIceCandidate(payload.candidate).catch(() => undefined);
}

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
function mapQueueEntry(row: QuickMatchQueueRow): QuickMatchQueueEntry {
  return { userId: row.user_id, mode: row.mode, roomCode: row.room_code, createdAt: row.created_at, matchedAt: row.matched_at };
}

function explain(error: { message: string; code?: string }): MultiplayerError {
  if (error.code === "42P01" || /duel_rooms.*does not exist/i.test(error.message)) return new MultiplayerError("The duel_rooms table is missing. Run the SQL setup in README.md.");
  if (error.code === "42883" || /quick_match_queue|quick_match/i.test(error.message)) return new MultiplayerError("Quick Game is not set up. Run the matchmaking SQL in README.md.");
  if (error.code === "42501" || /row-level security|permission denied/i.test(error.message)) return new MultiplayerError("Supabase denied this room action. Check the duel_rooms RLS policies in README.md.");
  return new MultiplayerError(error.message);
}

async function userId() {
  const supabase = requireClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (user) return localUserId = user.id;
  const { data, error } = await supabase.auth.signInAnonymously();
  if (error || !data.user) throw explain(error ?? { message: "Anonymous sign-in did not return a user." });
  return localUserId = data.user.id;
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
    const departingRoom = room;
    try {
      const id = await userId();
      if (!departingRoom) return;
      const supabase = requireClient();
      if (departingRoom.hostId === id) {
        const { error } = await supabase.from("duel_rooms").delete().eq("code", departingRoom.code);
        if (error) throw explain(error);
      } else if (departingRoom.guestId === id) {
        const { error } = await supabase.from("duel_rooms").update({ guest_id: null, status: "lobby", round_state: { ...departingRoom.roundState, guestReady: false } }).eq("code", departingRoom.code).eq("guest_id", id);
        if (error) throw explain(error);
      }
    } finally {
      // Local state must not retain a departed room when the remote cleanup fails.
      room = null;
      closePeer();
    }
  },

  subscribeToRoom(onRoom, onError) {
    if (!room || !client) return () => undefined;
    channel?.unsubscribe();
    const code = room.code;
    channel = client.channel(`duel-room-${code}`).on("broadcast", { event: "webrtc" }, payload => { void handleSignal(payload.payload as { type?: string; sdp?: RTCSessionDescriptionInit; candidate?: RTCIceCandidateInit }); }).on("postgres_changes", { event: "*", schema: "public", table: "duel_rooms", filter: `code=eq.${code}` }, payload => {
      if (payload.eventType === "DELETE") { room = null; onRoom(null); return; }
       room = mapRoom(payload.new as RoomRow);
       onRoom(room);
       void userId().then(id => { if (room?.guestId && room.hostId === id) void ensurePeer(true); });
    }).subscribe(status => {
      if (status === "CHANNEL_ERROR" || status === "TIMED_OUT") onError("Realtime connection failed. Confirm Realtime is enabled for public.duel_rooms.");
      if (status === "SUBSCRIBED") void userId().then(id => { if (room?.guestId && room.hostId === id) window.setTimeout(() => { void ensurePeer(true); }, 300); });
    });
    return () => { channel?.unsubscribe(); channel = null; closePeer(); };
  },

  async requestQuickMatch(mode) {
    await userId();
    const { data, error } = await requireClient().rpc("request_quick_match", { p_mode: mode }).maybeSingle<RoomRow>();
    if (error) throw explain(error);
    return data ? room = mapRoom(data) : null;
  },

  async restoreQuickMatch() {
    const id = await userId();
    const { data, error } = await requireClient().from("quick_match_queue").select().eq("user_id", id).maybeSingle<QuickMatchQueueRow>();
    if (error) throw explain(error);
    if (!data) return null;
    const entry = mapQueueEntry(data);
    if (!entry.roomCode) return { mode: entry.mode, room: null };
    const { data: roomRow, error: roomError } = await requireClient().from("duel_rooms").select().eq("code", entry.roomCode).maybeSingle<RoomRow>();
    if (roomError) throw explain(roomError);
    return { mode: entry.mode, room: roomRow ? room = mapRoom(roomRow) : null };
  },

  async cancelQuickMatch() {
    await userId();
    const { data, error } = await requireClient().rpc("cancel_quick_match").maybeSingle<RoomRow>();
    if (error) throw explain(error);
    return data ? room = mapRoom(data) : null;
  },

  subscribeToQuickMatch(onMatch, onError) {
    if (!client) return () => undefined;
    quickMatchChannel?.unsubscribe();
    let active = true;
    let pollTimer: number | undefined;
    let ownChannel: RealtimeChannel | null = null;
    let checking = false;
    const checkForMatch = async () => {
      if (!active || checking) return;
      checking = true;
      try {
        const restored = await multiplayer.restoreQuickMatch();
        if (active && restored?.room) onMatch(restored.room);
      } catch (error) {
        if (active) onError(error instanceof Error ? error.message : "Could not check Quick Game status.");
      } finally {
        checking = false;
        if (active) pollTimer = window.setTimeout(checkForMatch, 2_500);
      }
    };
    void userId().then(id => {
      if (!active) return;
      ownChannel = client.channel(`quick-match-${id}`).on("postgres_changes", { event: "*", schema: "public", table: "quick_match_queue", filter: `user_id=eq.${id}` }, async payload => {
        if (!active) return;
        if (payload.eventType === "DELETE") return;
        const entry = mapQueueEntry(payload.new as QuickMatchQueueRow);
        if (!entry.roomCode) return;
        const { data, error } = await client.from("duel_rooms").select().eq("code", entry.roomCode).maybeSingle<RoomRow>();
        if (error) { onError(explain(error).message); return; }
        if (active && data) { room = mapRoom(data); onMatch(room); }
      }).subscribe(status => {
        if (active && (status === "CHANNEL_ERROR" || status === "TIMED_OUT")) onError("Quick Game updates failed. Confirm Realtime is enabled for public.quick_match_queue.");
      });
      quickMatchChannel = ownChannel;
      void checkForMatch();
    }).catch(error => { if (active) onError(error instanceof Error ? error.message : "Could not listen for Quick Game matches."); });
    return () => {
      active = false;
      window.clearTimeout(pollTimer);
      ownChannel?.unsubscribe();
      if (quickMatchChannel === ownChannel) quickMatchChannel = null;
    };
  },

  async startRound(round) {
    const id = await userId();
    const prior = room?.roundState.round;
    const controller = room?.mode === "showdown-series" && prior?.winner ? prior.nextRoundHost ?? room.hostId : room?.hostId;
    if (!room || controller !== id || !room.guestId || !room.roundState.hostReady || !room.roundState.guestReady || (room.status !== "ready" && !prior?.winner) || prior?.matchWinner) throw new MultiplayerError("Both players must be ready before the designated round controller starts a round.");
    return updateRoom({ round_state: { ...room.roundState, round }, status: "playing" });
  },

  async submitRoundAction(roundId, reactionMs, falseStart, payload) {
    const id = await userId();
    if (!room || (room.hostId !== id && room.guestId !== id)) throw new MultiplayerError("You are not seated in this room.");
    // Read immediately before writing so a received opponent action is retained.
    const { data, error } = await requireClient().from("duel_rooms").select().eq("code", room.code).single<RoomRow>();
    if (error) throw explain(error);
    room = mapRoom(data);
    const current = room.roundState.round;
    if (room.status !== "playing" || !current || current.id !== roundId || current.winner) throw new MultiplayerError("That round has already ended.");
    const gameMode = current.gameMode ?? room.mode;
    if (gameMode === "trail-trace" && (!Number.isFinite(payload?.score) || !Number.isFinite(payload?.progress) || !Number.isFinite(payload?.accuracy) || payload?.reachedEnd !== true || payload!.score! < 0 || payload!.score! > 108 || payload!.progress! < minimumTrailProgress || payload!.progress! > 100 || payload!.accuracy! < minimumTrailAccuracy || payload!.accuracy! > 100)) throw new MultiplayerError("Finish the trail with a steady line before submitting.");
    if (gameMode === "rock-paper-scissors" && !["rock", "paper", "scissors"].includes(payload?.choice ?? "")) throw new MultiplayerError("Choose rock, paper, or scissors.");
    if (gameMode === "bottle-shot" && (!current.endAt || Date.now() < Date.parse(current.endAt))) throw new MultiplayerError("Bottle Shot scores unlock when the 30-second round ends.");
    const actionKey = room.hostId === id ? "hostAction" : "guestAction";
    if (current[actionKey]) throw new MultiplayerError("You already acted this round.");
    return updateRoom({ round_state: { ...room.roundState, round: { ...current, [actionKey]: { at: new Date().toISOString(), reactionMs, ...(falseStart ? { falseStart: true } : {}), ...payload } } } });
  },

  async resolveRound(roundId, allowSingleReaction = false) {
    const id = await userId();
    if (!room || room.hostId !== id) throw new MultiplayerError("Only the host can resolve a round.");
    const { data, error } = await requireClient().from("duel_rooms").select().eq("code", room.code).single<RoomRow>();
    if (error) throw explain(error);
    room = mapRoom(data);
    const current = room.roundState.round;
    if (!current || current.id !== roundId || current.winner) return room;
    const gameMode = current.gameMode ?? room.mode;
    if (gameMode === "bottle-shot" && (!current.endAt || Date.now() < Date.parse(current.endAt))) return room;
    const host = current.hostAction;
    const guest = current.guestAction;
    if (!host && !guest) return room;
    const hinted = peerActions.get(roundId);
    const hostAction = host ?? hinted?.hostAction;
    const guestAction = guest ?? hinted?.guestAction;
    if ((gameMode === "trail-trace" || gameMode === "bottle-shot" || gameMode === "rock-paper-scissors") && (!hostAction || !guestAction)) return room;
    const reactionRace = gameMode === "original-quick-draw" || gameMode === "word-duel";
    if (reactionRace && (!hostAction || !guestAction) && !allowSingleReaction) return room;
    const tieToleranceMs = 3;
    const winner = gameMode === "trail-trace" || gameMode === "bottle-shot"
      ? (hostAction!.score ?? 0) === (guestAction!.score ?? 0) ? "tie" : (hostAction!.score ?? 0) > (guestAction!.score ?? 0) ? "host" : "guest"
      : gameMode === "rock-paper-scissors"
        ? resolveRpsWinner(hostAction!.choice!, guestAction!.choice!)
        : hostAction?.falseStart && guestAction?.falseStart ? "tie"
          : hostAction?.falseStart ? "guest"
          : guestAction?.falseStart ? "host"
          : !guestAction ? "host"
          : !hostAction ? "guest"
          : Math.abs(hostAction.reactionMs - guestAction.reactionMs) <= tieToleranceMs ? "tie"
          : hostAction.reactionMs < guestAction.reactionMs ? "host" : "guest";
    const hostWins = (current.seriesHostWins ?? 0) + (winner === "host" ? 1 : 0);
    const guestWins = (current.seriesGuestWins ?? 0) + (winner === "guest" ? 1 : 0);
    const isSeries = room.mode === "showdown-series" || gameMode === "rock-paper-scissors";
    const nextRoundHost = room.mode === "showdown-series" ? winner === "tie" ? "host" : winner : undefined;
    return updateRoom({ round_state: { ...room.roundState, round: { ...current, hostAction, guestAction, winner, resolvedAt: new Date().toISOString(), ...(isSeries ? { seriesHostWins: hostWins, seriesGuestWins: guestWins, matchWinner: hostWins === 3 ? "host" : guestWins === 3 ? "guest" : undefined } : {}), ...(nextRoundHost ? { nextRoundHost } : {}) } } });
  },
  sendLiveAction(event) { if (transport !== "connected" || !dataChannel) return false; try { dataChannel.send(JSON.stringify({ type: "action", event })); return true; } catch { transport = "fallback"; return false; } },
  onLiveEvent(listener) { liveListener = listener; return () => { if (liveListener === listener) liveListener = undefined; }; },
  transportStatus: () => transport,
  localStartAt: hostStartAt => Date.parse(hostStartAt) - (room?.guestId === localUserId ? hostClockOffsetMs : 0),
};

function resolveRpsWinner(host: RpsChoice, guest: RpsChoice) {
  const beats: Record<RpsChoice, RpsChoice> = { rock: "scissors", paper: "rock", scissors: "paper" };
  return host === guest ? "tie" : beats[host] === guest ? "host" : "guest";
}
