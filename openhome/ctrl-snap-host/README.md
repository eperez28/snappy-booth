# Snappy Booth Host for OpenHome

This OpenHome Local Ability turns a DevKit into the optional voice host for
Snappy Booth.

It provides:

- spoken countdown events synchronized by the booth
- playful outfit hype, with an optional vision call
- a short post-photo conversation
- a fixed booth goodbye
- a token-protected, local-network event bridge

The booth remains the source of truth for camera timing. The ability listens
for events over the LAN and speaks through the active OpenHome Agent.

## Package

From the repository root:

```bash
./script/package_openhome.sh
```

The generated, ignored archive is `openhome/snappy-booth-host.zip` and contains
one top-level `ctrl-snap-host` directory.

## Configure

The bridge reads:

- `CTRL_SNAP_BRIDGE_TOKEN` for the shared local bridge value
- `OPENAI_API_KEY` only when DevKit-side outfit vision is enabled

Use the same bridge value in the booth:

```js
localStorage.setItem("ctrl-snap-devkit-url", "http://DEVKIT_IP:8765");
localStorage.setItem("ctrl-snap-devkit-token", "YOUR_BRIDGE_TOKEN");
```

Run that in the booth page's browser console, then reload. A deployment harness
may instead define `window.CTRL_SNAP_DEVKIT_URL` and
`window.CTRL_SNAP_DEVKIT_TOKEN` before the booth loads.

The base ability does not require an OpenAI API key. Countdown, generic hype,
goodbye, and conversation still work. Never add a key to these source files or
the upload archive.

## Install

1. In OpenHome Dashboard, create a custom **Local** Ability.
2. Name it `Snappy Booth Host`.
3. Upload `openhome/snappy-booth-host.zip`.
4. Attach it to the Agent used by the DevKit.
5. Supply `CTRL_SNAP_BRIDGE_TOKEN` through the DevKit's private runtime
   configuration.
6. Enable Advanced DevKit Controls, sync abilities, and restart the Agent.
7. Keep the Local Bridge enabled as a System Ability.

`background.py` starts the LAN listener on port `8765`. After a
`photo_captured` event, it gives an outfit line and asks the guest an easy
question. OpenHome's normal live conversation handles the response. The booth
daemon never waits on `user_response()`, so a delayed guest conversation cannot
block a new countdown.

`main.py` also provides an optional on-demand five-turn conversation. OpenHome
currently treats Agent and System scope as mutually exclusive, so use that
entrypoint only from a separate Agent-scoped installation when spoken triggers
are wanted.

## Event protocol

Send JSON to:

`POST http://DEVKIT_IP:8765/event`

Headers:

```text
Content-Type: application/json
X-CTRL-SNAP-TOKEN: YOUR_BRIDGE_TOKEN
```

Start a countdown:

```json
{"type":"countdown_start","session_id":"guest-123"}
```

Send an outfit-photo event:

```json
{
  "type":"photo_captured",
  "image_url":"http://BOOTH_LAN_IP:3000/api/photos/PHOTO_ID",
  "group_size":2,
  "session_id":"guest-123"
}
```

Keep the image out of vision by sending a precomputed line:

```json
{
  "type":"photo_captured",
  "compliment":"That jacket has a better entrance strategy than most people.",
  "session_id":"guest-123"
}
```

Say goodbye:

```json
{"type":"goodbye","session_id":"guest-123"}
```

Health check:

`GET http://DEVKIT_IP:8765/health`

## Timing and privacy

OpenHome speech has network and TTS latency. Post `countdown_start` roughly
500–900 ms before the visual countdown, tune that lead in the venue, and keep
camera capture authoritative in the booth.

With cloud vision, the DevKit fetches the image from the private LAN and sends
that frame to OpenAI. With local vision, send only a `compliment` string. With
no vision, omit both fields and the ability uses generic hype. The active
OpenHome Agent may still use cloud services for its normal voice pipeline.

The vision prompt only comments on visible garments, accessories, colors,
patterns, and styling. It avoids identity, body, health, wealth, religion,
disability, and other sensitive inferences.
