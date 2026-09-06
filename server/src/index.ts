import crypto from "node:crypto";
import http from "node:http";
import cors from "cors";
import express from "express";
import rateLimit from "express-rate-limit";
import helmet from "helmet";
import { WebSocketServer, type WebSocket } from "ws";
import { z } from "zod";

const port = Number(process.env.PORT ?? 8080);
const origins = (process.env.ALLOWED_ORIGINS ?? "").split(",").map(value => value.trim()).filter(Boolean);
const turnSecret = process.env.TURN_SHARED_SECRET;
const turnTicketSecret = process.env.TURN_TICKET_SECRET;
const turnUrls = (process.env.TURN_URLS ?? "").split(",").map(value => value.trim()).filter(Boolean);
const ttlSeconds = Math.min(3600, Math.max(60, Number(process.env.TURN_TTL_SECONDS ?? 600)));
const validTurnUrls = turnUrls.length > 0 && turnUrls.every(url => /^turns?:\/\//i.test(url));
if (process.env.NODE_ENV === "production" && (!origins.length || !turnSecret || !validTurnUrls || !turnTicketSecret)) throw new Error("Production requires exact allowed origins, a TURN secret, TURN URLs, and a ticket verifier secret.");

const app = express();
app.disable("x-powered-by");
app.use(helmet());
app.use(cors({ origin(origin, callback) { callback(null, Boolean(origin && origins.includes(origin))); }, methods: ["GET"], maxAge: 86400 }));
app.use("/v1/turn-credentials", (request, response, next) => {
  const origin = request.get("origin");
  if (!origin || !origins.includes(origin)) return response.status(403).json({ error: "Untrusted browser origin." });
  return next();
});
app.get("/health", (_request, response) => response.json({ status: "ok" }));
app.use("/v1/turn-credentials", rateLimit({ windowMs: 60_000, limit: 20, standardHeaders: "draft-7", legacyHeaders: false }));
function verifyTurnTicket(ticket: string | undefined) {
  if (!ticket || !turnTicketSecret) return null;
  const [encodedPayload, suppliedSignature, ...extra] = ticket.split(".");
  if (!encodedPayload || !suppliedSignature || extra.length) return null;
  const expectedSignature = crypto.createHmac("sha256", turnTicketSecret).update(encodedPayload).digest("base64url");
  if (suppliedSignature.length !== expectedSignature.length || !crypto.timingSafeEqual(Buffer.from(suppliedSignature), Buffer.from(expectedSignature))) return null;
  try {
    const payload = JSON.parse(Buffer.from(encodedPayload, "base64url").toString("utf8")) as { sub?: unknown; exp?: unknown };
    const now = Math.floor(Date.now() / 1000);
    if (typeof payload.sub !== "string" || !payload.sub || payload.sub.length > 128 || typeof payload.exp !== "number" || !Number.isInteger(payload.exp) || payload.exp <= now || payload.exp > now + 900) return null;
    return { sub: payload.sub, exp: payload.exp };
  } catch { return null; }
}
app.get("/v1/turn-credentials", (request, response) => {
  const supplied = request.get("authorization")?.replace(/^Bearer\s+/i, "");
  response.set({ "Cache-Control": "no-store", Vary: "Origin, Authorization" });
  if (!turnSecret || !validTurnUrls || !turnTicketSecret) return response.status(503).json({ error: "TURN issuer is not configured." });
  const ticket = verifyTurnTicket(supplied);
  if (!ticket) return response.status(401).json({ error: "A valid short-lived TURN ticket is required." });
  const now = Math.floor(Date.now() / 1000);
  // Never mint a relay credential that outlives the authenticated ticket.
  const expires = now + Math.min(ttlSeconds, ticket.exp - now);
  const username = `${expires}:hn-${crypto.createHash("sha256").update(ticket.sub).digest("hex").slice(0, 20)}`;
  const credential = crypto.createHmac("sha1", turnSecret).update(username).digest("base64");
  return response.json({ iceServers: [{ urls: turnUrls, username, credential }], expiresAt: new Date(expires * 1000).toISOString() });
});

type Client = { socket: WebSocket; room?: string; seat?: "host" | "guest" };
type Match = { startedAt: number; actions: Partial<Record<"host" | "guest", { receivedAt: number }>> };
const rooms = new Map<string, Set<Client>>();
const matches = new Map<string, Match>();
const joinMessage = z.object({ type: z.literal("join"), room: z.string().regex(/^[A-Z0-9]{6}$/), seat: z.enum(["host", "guest"]) });
const actionMessage = z.object({ type: z.literal("action"), reactionMs: z.number().finite().min(0).max(10_000) });

const server = http.createServer(app);
const wss = new WebSocketServer({ server, path: "/v1/rounds" });
function send(socket: WebSocket, payload: object) { if (socket.readyState === socket.OPEN) socket.send(JSON.stringify(payload)); }
function broadcast(room: string, payload: object) { rooms.get(room)?.forEach(client => send(client.socket, payload)); }
wss.on("connection", socket => {
  const client: Client = { socket };
  socket.on("message", raw => {
    try {
      const message = JSON.parse(raw.toString()) as unknown;
      const join = joinMessage.safeParse(message);
      if (join.success) {
        client.room = join.data.room; client.seat = join.data.seat;
        const occupants = rooms.get(client.room) ?? new Set<Client>();
        if ([...occupants].some(item => item.seat === client.seat)) return send(socket, { type: "error", message: "Seat is already occupied." });
        occupants.add(client); rooms.set(client.room, occupants);
        if (occupants.size === 2) { const startedAt = Date.now() + 3000; matches.set(client.room, { startedAt, actions: {} }); broadcast(client.room, { type: "round-start", startedAt }); }
        return;
      }
      const action = actionMessage.safeParse(message);
      const match = client.room ? matches.get(client.room) : undefined;
      if (!action.success || !match || !client.seat || Date.now() < match.startedAt) return send(socket, { type: "error", message: "Invalid or premature action." });
      if (match.actions[client.seat]) return send(socket, { type: "error", message: "Action already recorded." });
      // Ignore client-reported timing: receipt time is the authority's clock for this foundation.
      match.actions[client.seat] = { receivedAt: Date.now() };
      if (match.actions.host && match.actions.guest) { const winner = match.actions.host.receivedAt === match.actions.guest.receivedAt ? "tie" : match.actions.host.receivedAt < match.actions.guest.receivedAt ? "host" : "guest"; broadcast(client.room!, { type: "round-result", winner }); matches.delete(client.room!); }
    } catch { send(socket, { type: "error", message: "Malformed message." }); }
  });
  socket.on("close", () => { if (!client.room) return; const occupants = rooms.get(client.room); occupants?.delete(client); if (!occupants?.size) { rooms.delete(client.room); matches.delete(client.room); } });
});
server.listen(port, "0.0.0.0", () => console.log(`Authority service listening on ${port}`));
