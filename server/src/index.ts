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
const turnIssuerToken = process.env.TURN_ISSUER_TOKEN;
const turnUrls = (process.env.TURN_URLS ?? "").split(",").map(value => value.trim()).filter(Boolean);
const ttlSeconds = Math.min(3600, Math.max(60, Number(process.env.TURN_TTL_SECONDS ?? 600)));
if (process.env.NODE_ENV === "production" && (!origins.length || !turnSecret || !turnUrls.length || !turnIssuerToken)) throw new Error("Production requires allowed origins and TURN credentials configuration.");

const app = express();
app.disable("x-powered-by");
app.use(helmet());
app.use(cors({ origin(origin, callback) { callback(null, !origin || origins.includes(origin)); }, methods: ["GET"], maxAge: 86400 }));
app.use(rateLimit({ windowMs: 60_000, limit: 60, standardHeaders: "draft-7", legacyHeaders: false }));
app.get("/health", (_request, response) => response.json({ status: "ok" }));
app.get("/v1/turn-credentials", (request, response) => {
  const supplied = request.get("authorization")?.replace(/^Bearer\s+/i, "");
  if (!turnSecret || !turnUrls.length || !turnIssuerToken) return response.status(503).json({ error: "TURN issuer is not configured." });
  const valid = supplied && supplied.length === turnIssuerToken.length && crypto.timingSafeEqual(Buffer.from(supplied), Buffer.from(turnIssuerToken));
  if (!valid) return response.status(401).json({ error: "Authenticated TURN ticket required." });
  const expires = Math.floor(Date.now() / 1000) + ttlSeconds;
  const username = `${expires}:high-noon`;
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
