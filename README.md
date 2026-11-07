# dsh-companion

A companion system for [DeepSeek Harness](https://github.com/deepseek-ai/deepseek-harness) (DSH):

- **`packages/dsh-companion`** — a general-purpose DSH *host plugin* that runs inside your `dsh web` profile. It is a notification bus: any DSH event source can push to your phone over **Expo push**, and it can *hold* unanswered questions/permission requests until your phone answers them.
- **`apps/companion-mobile`** — a native **Expo (React Native)** app for iOS/Android: connect to your host over Tailscale, see pending questions and permission requests, approve/reject/answer right from the app or straight from the notification, with spring-physics micro-interactions and haptics.
- **`packages/companion-protocol`** — the shared wire contract (routes, payloads, validators) used by both sides.

No DSH code is modified. The plugin installs into an existing DSH profile with `dsh plugin` and appends to the profile's composition.

## How it works

```
┌─────────────────────── your machine ───────────────────────┐
│  dsh web profile                                          │
│  ┌──────────────────────────────────────────────────────┐  │
│  │ agent asks a question / hits a permission / turn ends│  │
│  │        │ scoped Cordis waterfall                      │  │
│  │        ▼                                              │  │
│  │ dsh-companion plugin (append-only listener)          │  │
│  │  • observes the request, delegates to any open web UI│  │
│  │  • if NO other answerer claims it: holds the request  │  │
│  │    and pushes to your devices via Expo               │  │
│  │  • answers arrive back over HTTP routes on webServer  │  │
│  └──────────────────────────────────────────────────────┘  │
└──────────────┬──────────────────────────────┬──────────────┘
       Expo push relay (data + generic alert)  │ HTTP over Tailscale
               ▼                              ▼
        📱 DSH Companion app  ──── approve / reject / text ───►
```

Key behaviors:

1. **Zero interference while you're at the web UI.** The plugin registers waterfall listeners on `user-questions/request` and `approval/request` and *delegates* (`next()`). When a browser is connected and answers, the plugin never claims anything.
2. **Holds when nobody can answer.** When the chain would fail (`NO_PROVIDER` for questions, fail-closed `'unavailable'` for approvals), the plugin holds the request for `holdTimeoutMs`, pushes it to your devices with tappable actions, and resolves it from the phone. This is exactly the "screen off / Chrome closed" case — today those requests simply fail.
3. **General by design.** The plugin exposes a `ctx.companion` service (`notify(event)`) and a `companion/notify` Cordis event, so *future* plugins can push anything (jobs finished, schedule follow-ups, custom alerts) without touching this codebase. Event kinds are open-ended (`custom`).
4. **Privacy mode.** `contentMode: generic` (default) sends only a generic alert ("A permission request needs your decision") through Expo's relay; the real content stays on your machine and the app fetches it over your authenticated Tailscale connection. `contentMode: detailed` puts titles/bodies in the push.

## Repository layout

```
packages/
  companion-protocol/   shared wire types + validators (no dependencies)
  dsh-companion/        the DSH host plugin ( Cordis function plugin )
apps/
  companion-mobile/     Expo app (Expo SDK 52, expo-notifications, Reanimated)
```

## Setup

### 1. Build the plugin

```bash
pnpm install
pnpm build          # builds protocol + plugin to lib/
pnpm test           # 12 unit tests for the hold registry, device store, Expo sender
```

### 2. Install into your DSH web profile

```bash
dsh plugin --profile web add /path/to/dsh-companion/packages/dsh-companion
```

(Or pack it first: `npm pack` inside `packages/dsh-companion`, then `dsh plugin --profile web add ./dsh-companion-0.1.0.tgz`.)

### 3. Configure it

Add an `insert` row to your web profile's `cordis.patch.yml` (the profile directory `dsh plugin --profile web` manages, e.g. `~/.dsh/profiles/web/cordis.patch.yml`). New plugins must be *inserted* — a bare `id`/`name` row only patches an existing entry and does nothing:

```yaml
- insert:
    - id: dsh-companion
      name: dsh-companion
      config:
    expoProjectId: "xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx"   # your Expo project id
    companionToken: "a long random secret"                  # the app's bearer token
    contentMode: generic          # generic | detailed
    holdUnanswered: true
    holdTimeoutMs: 600000         # 10 minutes
    notifyQuestions: true
    notifyApprovals: true
    notifyTurnComplete: false
```

Secrets can stay out of the file: `expoAccessToken` falls back to the `DSH_COMPANION_EXPO_ACCESS_TOKEN` environment variable, and `companionToken` to `DSH_COMPANION_TOKEN`.

### 4. Expo account credentials

1. Create a project at [expo.dev](https://expo.dev) (or use an existing one) and copy its **project ID** into `expoProjectId`.
2. Create an **access token** (Account Settings → Access Tokens) and provide it via `expoAccessToken` or `DSH_COMPANION_EXPO_ACCESS_TOKEN`. This is the "dsh web acts as its own push backend with my Expo creds" part: the host sends pushes directly to `exp.host/--/api/v2/push/send` with your token — no other backend involved.
3. Build the app against that project (below) so its push tokens belong to it.

### 5. Run the mobile app

```bash
cd apps/companion-mobile
pnpm install
# point EAS at your project, then:
npx expo start          # development
npx expo run:ios        # or run:android
# production:
eas build --platform all
```

In the app: enter the **host URL** (your Tailscale HTTPS/WSS address of `dsh web`), the **companion token**, and the **Expo project ID**. The app checks `/dsh-companion/health`, registers its Expo push token, and you're live.

Test the whole loop without an agent run:

```bash
curl -X POST -H "Authorization: Bearer $DSH_COMPANION_TOKEN" \
  https://your-tailscale-host/dsh-companion/test
```

## HTTP surface (all behind DSH's trust fence, or your bearer token)

| Route | Method | Purpose |
| --- | --- | --- |
| `/dsh-companion/health` | GET | liveness, Expo configured?, device/hold counts |
| `/dsh-companion/devices` | POST | register/refresh a device push token |
| `/dsh-companion/devices/unregister` | POST | remove a device |
| `/dsh-companion/pending` | GET | list held questions/approvals |
| `/dsh-companion/answer` | POST | answer a held request (`{pendingId, actionId, text?}`) |
| `/dsh-companion/test` | POST | send a test push to all devices |

Requests are admitted when either (a) they pass DSH's own `connection.requestRejection` fence (browser session, Host/Origin checks), or (b) they carry `Authorization: Bearer <companionToken>` compared timing-safely. Bodies are JSON-only, hard-capped at 64 KiB, and validated field-by-field — the same wire discipline DSH's own host routes use.

## Notification actions

The app registers a `companion.pending` notification category: **Approve / Reject / Reply…** (with text input). Tapping an action answers the held request *without opening the app*; tapping the notification opens the pending list. Approvals map to `'allowed-once'`/`'rejected'` (the DSH approval seam's closed vocabulary); questions resolve with the chosen option label or free text.

## Extending (the "more stuff later" part)

- Emit from any plugin: `ctx.emit('companion/notify', { kind: 'custom', title, body, data })`
- Or call the service: `ctx.companion.notify({ ... })`
- Add a new *source* by registering one more listener in `packages/dsh-companion/src/sources.ts` — the bus, devices, routes, and app rendering are kind-agnostic (unknown kinds render as generic cards).

## Notes & limitations

- **While a web UI is connected and answers, no push fires** — the request was served. Pushes fire when the request would otherwise fail (web closed, tab suspended, screen off). If you want a push *always*, emit `companion/notify` from your own glue or extend the sources.
- **iOS backgrounding:** iOS will suspend the app; that's fine — the push wakes you, and the answer travels over HTTP. Android can keep the app alive in the background if you later add a foreground service.
- **Multi-question `ask_user_question` batches and multi-select questions** are *delegated, not held* (v1 holds single-question requests; the web UI remains the answerer for complex batches).
- **Held requests keep the host process alive** until answered, aborted (the request's abort signal cancels the hold), or timed out.
- The slow **WebSocket reconnect after Chrome suspend** is a DSH client behavior (`packages/client/connection` only reacts to `online`/`offline`); since this project doesn't modify DSH, the durable fix is a one-line `visibilitychange` → `controller.reconnect()` watcher in DSH's `watchBrowserNetwork`. The native app doesn't have this problem: `AppState` → immediate refresh, and pushes cover the suspended case entirely.

## Verification

```bash
pnpm -r typecheck    # protocol, plugin, and mobile app all typecheck
pnpm test            # plugin unit tests (12)
```
