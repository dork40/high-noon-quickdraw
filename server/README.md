# High Noon Authority Service

This is a deployable foundation for authoritative rounds and coturn REST TURN credentials. It is not a complete ranked platform: its room state is in memory, WebSocket clients are not authenticated, and it must be paired with durable storage, identity verification, abuse controls, and observability before enabling ranked matchmaking.

## Deploy

1. Create a separate Node/Docker service on Render, Fly.io, Railway, or another container host. Do not deploy this WebSocket service to a static host or Vercel function runtime.
2. Copy `.env.example` values into the host's secret environment settings. Generate `TURN_SHARED_SECRET` and `TURN_ISSUER_TOKEN` with a password manager; configure the former in coturn's `static-auth-secret` setting. Never place either value in `VITE_` variables. The endpoint rejects unauthenticated requests by default; replace the opaque issuer-token check with verified player JWT/ticket validation before production use.
3. Set `ALLOWED_ORIGINS` to the exact HTTPS game origin and `TURN_URLS` to your coturn public URLs.
4. Build with `npm install && npm run build`, or use `docker build -t high-noon-authority .`. The health check is `GET /health`.
5. Only after TLS is configured, set the browser's `VITE_AUTHORITY_URL=https://authority.example`. The current browser requests credentials without a ticket and safely falls back when rejected. Wire a verified, short-lived player ticket into that request only after adding an identity service; it does not enable ranked play.

`/v1/rounds` demonstrates a server-timed, validated WebSocket message shape. Its volatile memory is deliberately unsuitable for production ranking. Authenticate the WebSocket upgrade, issue room-scoped signed tickets, persist match state, and measure/validate actions server-side before connecting it to a ranked UI.
