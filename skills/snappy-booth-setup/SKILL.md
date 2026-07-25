---
name: snappy-booth-setup
description: Install, validate, run, or package the public Snappy Booth monorepo. Use when an agent needs to set up the Chrome or native macOS photo booth, prepare the OpenHome local ability, diagnose QR handoff, or confirm that the repository is safe to publish.
---

# Snappy Booth Setup

Set up the complete local booth without reaching into any private Snappy
product or requiring a secret for the base experience.

## Guardrails

- Read the repository root `AGENTS.md` before changing files.
- Never inspect or modify `/Users/emanuel/Documents/snappy`.
- Never commit an API key, `.env` file, personal IP address, or generated photo.
- Do not deploy or publish unless the user explicitly asks.
- Keep photo capture camera-only. Do not add microphone permission.

## Install

From the repository root, run:

```bash
./script/setup.sh
```

If setup fails, report the exact failed prerequisite or command. Do not replace
locked dependency versions merely to bypass an environment problem.

## Choose a runtime

- Local Chrome: `npm run dev`
- Chrome with same-network QR handoff: `npm run dev:lan`
- Native macOS wrapper: `./script/build_and_run.sh`
- OpenHome upload archive: `./script/package_openhome.sh`

For LAN mode, use the network URL printed by the server. Explain that phones
must be on the same reachable network and that venue client isolation can block
the QR target.

## Configure OpenHome only when requested

Follow `openhome/ctrl-snap-host/README.md`. Keep the booth authoritative for
camera timing. OpenHome countdown, generic hype, and conversation work without
an OpenAI API key.

Optional outfit vision reads `OPENAI_API_KEY` only from the runtime
environment. Use the user's secure secret-management flow; never paste a key
into source, documentation, output, or an upload archive.

## Validate

Before handing off a setup or code change, run:

```bash
./script/doctor.sh --full
```

For a fast security or structure check, run `./script/doctor.sh`.

Report the mode launched, local URL or app bundle path, doctor result, and any
unverified physical-device step.
