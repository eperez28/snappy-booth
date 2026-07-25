# Snappy Booth Host for OpenHome

A combined Background + Local OpenHome Ability that turns an OpenHome DevKit
into the voice host for Snappy Booth.

It supports:

- A spoken countdown synchronized from Snappy Booth events
- Outfit-aware, playful hype before or after a photo
- A short, real back-and-forth conversation after each captured photo
- An on-demand conversation entry using a trigger such as `talk to Snappy`
- A fixed booth goodbye
- Optional LED or sound extensions through other Local Abilities
- A token-protected, local-network-only event bridge

The booth remains the source of truth for camera timing. The DevKit listens for
events over the LAN and speaks through the active OpenHome Agent.

## Before upload

Edit `devkit_functions.py`:

1. Optionally replace `BRIDGE_TOKEN` in both `devkit_functions.py` and
   `app/openhome.ts`.
2. Replace `OPENAI_API_KEY` if outfit vision should run on the DevKit.

Without the OpenAI key, countdown and goodbye still work. `photo_captured`
events can also include a precomputed `compliment`, which keeps the image out of
the vision call.

## Install

1. Zip this folder so the archive contains one top-level `ctrl-snap-host`
   directory.
2. In OpenHome Dashboard, create a custom **Local** Ability.
3. Name it `Snappy Booth Host`.
4. Upload the zip and attach it to the Agent used by the DevKit.
5. Enable Advanced DevKit Controls, sync abilities, and restart the Agent.
6. Keep the installed Local Bridge enabled as a System Ability. The automatic
   conversation starts after each `photo_captured` event and does not need a
   spoken trigger.

`background.py` starts automatically with the Agent and starts the LAN listener
on port `8765`. After a `photo_captured` event, it gives the outfit line and
asks the guest an easy question. OpenHome's normal live conversation handles
the guest's response and follow-ups. The booth daemon never waits on
`user_response()`, so a new `countdown_start` cannot get stuck behind a guest
conversation.

`main.py` also provides an optional on-demand five-turn conversation. OpenHome
currently treats Agent and System scope as mutually exclusive, so use that
entrypoint only from a separate Agent-scoped installation if you want spoken
triggers such as `talk to Snappy`. The booth's automatic post-photo
conversation should remain System-scoped.

## Event protocol

Send JSON to:

`POST http://DEVKIT_IP:8765/event`

Headers:

```text
Content-Type: application/json
X-CTRL-SNAP-TOKEN: YOUR_BRIDGE_TOKEN
```

Start the countdown with one speech call:

```json
{"type":"countdown_start","session_id":"guest-123"}
```

Or send each number separately:

```json
{"type":"countdown","value":3,"session_id":"guest-123"}
```

Ask for outfit analysis after capture:

```json
{
  "type":"photo_captured",
  "image_url":"http://BOOTH_LAN_IP:3000/api/photos/PHOTO_ID",
  "group_size":2,
  "session_id":"guest-123"
}
```

Use a precomputed line instead of sending an image to vision:

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

## Timing

OpenHome speech has network and TTS latency. For a synchronized countdown,
Snappy Booth should post `countdown_start` roughly 500–900 ms before its visual
countdown. Make the lead configurable and calibrate once in the venue.

For the tightest timing, send the three individual `countdown` events and tune
the app's interval around the observed DevKit voice. Keep the camera capture
authoritative in Snappy Booth; never let a delayed voice event block the shutter.

## Outfit safety

The vision prompt only comments on visible garments, accessories, colors,
patterns, and styling. It explicitly avoids identity, body, health, wealth,
religion, disability, and other sensitive inferences. If the image is unclear,
the ability falls back to a group-safe hype line.

## Privacy modes

- **Cloud vision:** `image_url` is fetched over the LAN, then that frame is sent
  to OpenAI for the outfit line.
- **Local vision:** run vision in Snappy Booth or a local model and send only the
  `compliment` string.
- **No vision:** omit both fields and the DevKit uses a generic hype line.

The OpenHome voice pipeline itself may still use cloud services according to
the active Agent configuration.
