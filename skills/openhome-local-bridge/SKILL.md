---
name: openhome-local-bridge
description: Build, install, debug, and package an authenticated LAN bridge between an OpenHome device and a local application. Use when an agent needs to connect an OpenHome DevKit to a native macOS app, a localhost web app, or a LAN-hosted browser app; send speech, prompt, status, or custom events; scaffold Swift or TypeScript clients; package a Local Ability; or diagnose CORS, loopback, network isolation, timing, and local-secret problems.
---

# OpenHome Local Bridge

Build the bridge as two cooperating pieces:

1. The local Mac or web app sends a small authenticated event to the DevKit.
2. An OpenHome Local Ability listens on the LAN, queues the event, and handles
   it through the active OpenHome Agent.

Do not make cloud hosting or a public callback a prerequisite.

## Start with discovery

Inspect the target project before editing:

- Determine whether it is native macOS, local web, or both.
- Find its existing build/run command and local server.
- Identify the OpenHome DevKit's reachable LAN address.
- Define the smallest event contract needed.
- Locate the project's secret-management convention and ignore rules.

Read [references/architecture.md](references/architecture.md) for the proven
topology, runtime variants, and event contract. Read
[references/troubleshooting.md](references/troubleshooting.md) when the app and
device cannot reach each other.

## Scaffold

Run the bundled generator from this skill directory:

```bash
python3 scripts/scaffold_bridge.py \
  --project /absolute/path/to/project \
  --name "My Local App" \
  --client both
```

Choose `web`, `mac`, or `both`. The generator creates:

- `openhome/<app-slug>-bridge/` for the OpenHome Local Ability
- `integrations/openhome/openhomeBridge.ts` for web clients
- `integrations/openhome/OpenHomeBridgeClient.swift` for macOS clients

It never overwrites an existing path. Adapt the generated `handle_event`
function to the app instead of replacing unrelated project structure.

## Configure securely

Require `OPENHOME_BRIDGE_TOKEN` in the DevKit runtime. Supply the same value to
the local client through the target app's ignored local configuration.

Do not:

- hardcode the token or an API key
- commit `.env` files
- print a credential in logs or final output
- treat a public default string as authentication
- expose the listener to the internet

Configure `OPENHOME_BRIDGE_ALLOWED_ORIGINS` for browser clients. Native clients
do not send a browser Origin header. Keep request bodies small and validate
event types at the bridge.

## Integrate by runtime

### Local web app

Instantiate the generated TypeScript client with the DevKit LAN URL and runtime
token. Use an HTTP localhost or LAN page. A public HTTPS page cannot reliably
call an HTTP LAN device because browsers block mixed content.

For a phone or another computer to open the app, bind the local server to
`0.0.0.0` and use the Mac's LAN address—not `localhost`.

### Native macOS app

Add the generated Swift client to the app target. Add
`NSLocalNetworkUsageDescription` to the app bundle. Keep DevKit requests off the
main thread and publish UI state back on the main actor.

If the native app also hosts photos or assets that the DevKit must fetch, serve
them on a LAN-reachable interface and advertise the Mac's LAN URL. A DevKit
cannot fetch `127.0.0.1` from the Mac.

## Package and install

Package the generated ability with:

```bash
python3 scripts/package_ability.py \
  /absolute/path/to/project/openhome/my-local-app-bridge
```

The packager rejects key-shaped values, `.env` files, unresolved placeholders,
and missing required files.

In OpenHome Dashboard:

1. Create a custom Local Ability.
2. Upload the generated ZIP.
3. Attach it to the intended Agent.
4. Supply the token and allowed origins through private runtime configuration.
5. Enable advanced DevKit controls, sync abilities, and restart the Agent.
6. Keep the background bridge System-scoped for automatic events.

Do not claim success until the DevKit health endpoint responds from the Mac and
one real event produces the intended OpenHome behavior.

## Verify

Verify in this order:

1. Run the local app's existing tests and build.
2. Compile the generated Python sources with `python3 -m py_compile`.
3. Package the ability with the bundled packager.
4. Check `GET http://DEVKIT_IP:PORT/health` from the Mac.
5. Send one `speak` event with a harmless test sentence.
6. Test the actual app trigger.
7. If applicable, test from the same browser/runtime used in production.

Report the app URL or bundle path, DevKit health result, event result, package
path, and any physical-device step that remains unverified.
