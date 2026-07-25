# Snappy Booth agent guide

## Outcome

Keep this repository a local-first, production-polished party photo booth that
can run in Chrome or as the native macOS wrapper, with an optional OpenHome
voice-host ability.

## Public boundary

- This repository is public-safe.
- Never inspect, copy, import, or modify `/Users/emanuel/Documents/snappy` or
  any private Snappy Mac app source. It is a separate product.
- Never commit API keys, credentials, `.env` files, venue IP addresses, or
  personal configuration.
- Do not deploy, publish a package, or send messages unless the user explicitly
  requests it.
- Preserve local-only photo storage and the no-microphone camera flow.

## Repository map

1. Booth app: `app/`, `public/`, `mac-web/`, `Sources/CTRLSnap/`, and root
   JavaScript/Swift configuration.
2. OpenHome ability: `openhome/ctrl-snap-host/`.
3. Agent setup kit: this file, `skills/snappy-booth-setup/`,
   `skills/openhome-local-bridge/`, and `script/`.

## Setup

From the repository root:

```bash
./script/setup.sh
```

Run the requested mode:

- Chrome on this Mac: `npm run dev`
- Chrome plus same-network phone QR handoff: `npm run dev:lan`
- Native macOS wrapper: `./script/build_and_run.sh`
- OpenHome upload archive: `./script/package_openhome.sh`

Do not add an API key to make the base booth work. OpenHome outfit vision is
optional; if requested, use a secure secret-provisioning flow and supply
`OPENAI_API_KEY` only at runtime.

## Completion evidence

For implementation work, run:

```bash
./script/doctor.sh --full
```

Report which mode was launched, the local URL or app path, validation results,
and any LAN limitation. A QR code is only verified when another device on the
same reachable network can open its target.
