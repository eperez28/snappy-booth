# Architecture and event contract

## Topology

```text
Native Mac app ─┐
                ├─ authenticated HTTP on private LAN ─> OpenHome DevKit
Local web app ──┘                                   Local Ability listener
                                                            │
                                                            ▼
                                                   active OpenHome Agent
                                                   speech / LLM / actions
```

The local application is authoritative for its own timing and state. OpenHome
handles voice and agent behavior asynchronously. Never block a camera shutter,
button press, or critical local action while waiting for speech.

## Addresses

- `127.0.0.1` and `localhost` always mean the device making the request.
- A browser on the Mac can open `localhost`, but the DevKit cannot use that URL
  to fetch something from the Mac.
- Bind a Mac-hosted server to `0.0.0.0` when another device must reach it.
- Advertise the Mac's private LAN address to the DevKit.
- Use the DevKit's private LAN address in the local client.

## Default event contract

All events are JSON sent to `POST /event` with:

```text
Content-Type: application/json
X-OPENHOME-BRIDGE-TOKEN: runtime-secret
```

Speak a deterministic line:

```json
{"type":"speak","text":"The local app is connected."}
```

Ask the active OpenHome agent to generate and speak a short response:

```json
{"type":"prompt","text":"Welcome the guest in one short sentence."}
```

Send an app-specific action:

```json
{
  "type":"action",
  "name":"capture_complete",
  "data":{"session_id":"guest-123"}
}
```

Keep the allowed event names explicit. Add app-specific event types only when
their validation and handler are implemented on both sides.

## Authentication and exposure

The bridge token protects against accidental or unauthorized commands from
other LAN clients. Generate it outside source control and compare it using a
constant-time function.

The bridge is not an internet-facing API:

- bind only where the DevKit runtime requires
- do not port-forward it
- do not expose it through a public tunnel by default
- rate-limit or bound queues and request sizes
- never accept arbitrary code, file paths, or shell commands as events

Browser CORS is not authentication. Allow only the local origins the app uses,
then require the token as well.

## Runtime variants

### Browser to DevKit

The browser sends events directly to the DevKit. The ability must answer CORS
preflight requests. This works best from an HTTP localhost or LAN origin.

### Local web server relay

When browser security blocks direct LAN access, send the event to a local server
route and let the server call the DevKit. Keep that relay bound locally and
never return the bridge token to the browser.

### Native Mac to DevKit

Use `URLSession` from Swift. Add local-network purpose text to the app bundle.
App Sandbox or hardened-runtime configurations may require outgoing network
client entitlement.

## Timing

OpenHome speech includes agent and TTS latency. Trigger voice early when it must
lead a visual countdown, calibrate on the actual venue network, and keep the
local action authoritative if speech arrives late.
