# High Noon Authority Service

This is a deployable TURN credential issuer and authority-round foundation. It is not a complete ranked platform: round state is in memory, WebSocket clients are not authenticated, and it needs durable storage, identity verification, abuse controls, and observability before ranked matchmaking could exist.

## Deploy

1. Create a separate Node/Docker service on Render, Fly.io, Railway, or another container host. Do not deploy this WebSocket service to a static host or Vercel function runtime.
2. Copy `.env.example` values into the host secret settings. Generate `TURN_SHARED_SECRET` and `TURN_TICKET_SECRET` independently with a password manager. Configure `TURN_SHARED_SECRET` as coturn's `static-auth-secret`; never place either secret in `VITE_` variables or browser storage.
3. Set `ALLOWED_ORIGINS` to exact browser origins, for example `https://game.example`. Wildcards, paths, and trailing slashes are not accepted. Set `TURN_URLS` to public `turn:`/`turns:` coturn URLs and open the corresponding UDP/TCP relay ports in the coturn host firewall.
4. Publish this service behind HTTPS. Build with `npm install && npm run build`, or run `docker build -t high-noon-authority .` followed by `docker run --env-file .env -p 8080:8080 high-noon-authority`. The image has a `/health` health check.
5. Set `VITE_AUTHORITY_URL=https://authority.example` only in the browser build environment. It enables optional relay retrieval, not ranked play.

## TURN Credential API

`GET /v1/turn-credentials` is browser-origin restricted, rate-limited, and sends `Cache-Control: no-store`. It requires an exact allowed `Origin` and `Authorization: Bearer <ticket>`.

The ticket is `base64url(JSON payload).base64url(HMAC-SHA256(payload, TURN_TICKET_SECRET))`. The payload must contain a non-empty `sub` string and an integer Unix `exp` no more than 15 minutes in the future. A trusted identity service must authenticate the player, create this ticket server-side, and place only the short-lived ticket into the current browser session. This scaffold deliberately does not include identity issuance.

Successful responses are `{ "iceServers": [{ "urls": [...], "username": "...", "credential": "..." }], "expiresAt": "..." }`. Credentials use coturn's REST shared-secret scheme and expire at the earlier of `TURN_TTL_SECONDS` and the ticket expiry. Invalid tickets return `401`; unknown browser origins return `403`; missing TURN configuration returns `503`. Do not log tickets or responses.

The game reads the ephemeral ticket from `sessionStorage["high-noon-turn-ticket"]` and sends it only to the configured HTTPS authority. If the URL, ticket, response, relay, or browser WebRTC support is unavailable, the client clearly reports that state and continues with public STUN and Supabase database fallback.

`/v1/rounds` demonstrates a server-timed, validated WebSocket message shape. Its volatile memory is deliberately unsuitable for production ranking. Authenticate the WebSocket upgrade, issue room-scoped signed tickets, persist match state, and measure/validate actions server-side before connecting it to a ranked UI.
