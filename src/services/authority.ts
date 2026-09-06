import type { AuthorityConfig, TurnCredentials } from "../types";

const rawUrl = import.meta.env.VITE_AUTHORITY_URL?.trim();
const validUrl = (() => {
  if (!rawUrl) return undefined;
  try {
    const url = new URL(rawUrl);
    return url.protocol === "https:" || (url.protocol === "http:" && ["localhost", "127.0.0.1"].includes(url.hostname)) ? url.toString().replace(/\/$/, "") : undefined;
  } catch { return undefined; }
})();

// A trusted identity/bootstrap flow may place an ephemeral ticket here. It is never
// a Vite variable, so a deploy cannot accidentally bake a TURN credential into JS.
const turnTicketStorageKey = "high-noon-turn-ticket";
export const authority: AuthorityConfig = {
  url: validUrl ?? "",
  rankedAvailable: false,
  turnStatus: !rawUrl ? "not-configured" : validUrl ? "ticket-required" : "invalid-url",
};

function turnTicket() {
  try { return sessionStorage.getItem(turnTicketStorageKey)?.trim(); }
  catch { return undefined; }
}

export async function fetchTurnCredentials(): Promise<TurnCredentials | null> {
  if (!validUrl) return null;
  const ticket = turnTicket();
  if (!ticket) { authority.turnStatus = "ticket-required"; return null; }
  authority.turnStatus = "requesting";
  try {
    const response = await fetch(`${validUrl}/v1/turn-credentials`, {
      headers: { Accept: "application/json", Authorization: `Bearer ${ticket}` },
      cache: "no-store",
    });
    if (!response.ok) { authority.turnStatus = response.status === 401 || response.status === 403 ? "ticket-rejected" : "unavailable"; return null; }
    const payload = await response.json() as Partial<TurnCredentials>;
    if (!Array.isArray(payload.iceServers) || !payload.iceServers.length || typeof payload.expiresAt !== "string" || Number.isNaN(Date.parse(payload.expiresAt))) { authority.turnStatus = "invalid-response"; return null; }
    authority.turnStatus = "relay-ready";
    return { iceServers: payload.iceServers, expiresAt: payload.expiresAt };
  } catch { authority.turnStatus = "unavailable"; return null; }
}
