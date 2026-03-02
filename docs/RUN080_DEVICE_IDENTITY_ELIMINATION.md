# RUN080 — Device identity / disconnect elimination (widgetdc-openclaw)

This repo implements the **platform-side** fixes from WidgeTDC RUN080 so users never see "Disconnected from gateway" or "device identity required".

**Reference:** WidgeTDC `docs/RUN080_OPENCLAW_DISCONNECT_DEVICE_IDENTITY_ELIMINATION.md` (§3 change list).

## What this repo does (§3.4 + token flow)

| Item | Implementation |
|------|----------------|
| **Device auth off for token auth** | `entrypoint.sh`: migration sets `gateway.controlUi.allowInsecureAuth` and `dangerouslyDisableDeviceAuth`, and `gateway.auth.token` from `OPENCLAW_GATEWAY_TOKEN` so the gateway accepts token-based auth. |
| **Token always present** | `src/server.js`: (1) GET to `/openclaw`, `/openclaw/*`, `/chat` without `?token=` → 307 redirect with token; (2) WebSocket upgrade → `Authorization: Bearer <token>` injected in `proxyReqWs`. |
| **HTTPS / wss** | Railway serves HTTPS; wrapper uses `location.protocol` for redirects; WebSocket target is same origin so wss when page is https. |
| **Persistent state** | `OPENCLAW_STATE_DIR` (e.g. `/data/.openclaw`) with Railway volume; config and token persist across restarts. |

## Required Railway env

- **OPENCLAW_GATEWAY_TOKEN** — set in Railway Variables so it is stable across redeploys. If unset, wrapper generates and persists to `STATE_DIR/gateway.token`; for multi-replica or clean redeploys, set it explicitly.
- **OPENCLAW_STATE_DIR** — e.g. `/data/.openclaw` with a persistent volume.
- **RAILWAY_PUBLIC_DOMAIN** — used for `allowedOrigins` (optional; defaults to openclaw-production-9570.up.railway.app).

## Verification (zero user steps)

From **WidgeTDC** run:

```bash
npm run openclaw:verify
# or
make audit
```

This runs `scripts/verify-openclaw-gateway-env.ps1` (HTTPS check, env reminders, optional reachability).

Manual check: open `https://<your-app>.up.railway.app/openclaw/chat?session=main` — URL should gain `&token=...`, chat should connect without "Disconnected from gateway" / "device identity required".
