import type { AuthorityConfig, TurnCredentials } from "../types";

const rawUrl = import.meta.env.VITE_AUTHORITY_URL?.trim();
const validUrl = (() => {
  if (!rawUrl) return undefined;
  try {
    const url = new URL(rawUrl);
    return url.protocol === "https:" || (url.protocol === "http:" && ["localhost", "127.0.0.1"].includes(url.hostname)) ? url.toString().replace(/\/$/, "") : undefined;
  } catch { return undefined; }
})();

export const authority: AuthorityConfig = { url: validUrl ?? "", rankedAvailable: false };

export async function fetchTurnCredentials(): Promise<TurnCredentials | null> {
  if (!validUrl) return null;
  try {
    const response = await fetch(`${validUrl}/v1/turn-credentials`, { headers: { Accept: "application/json" } });
    if (!response.ok) return null;
    const payload = await response.json() as Partial<TurnCredentials>;
    if (!Array.isArray(payload.iceServers) || typeof payload.expiresAt !== "string") return null;
    return { iceServers: payload.iceServers, expiresAt: payload.expiresAt };
  } catch { return null; }
}
