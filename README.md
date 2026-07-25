# Snappy Booth

Snappy Booth is a local-first party photo booth built for CTRL OVERDRIVE. It
captures a webcam photo, prints it through a Three.js Polaroid animation, offers
six event filters, and hands the finished image to a phone by QR code or direct
download.

The repository is one monorepo with three public pieces:

| Piece | Location | What it provides |
| --- | --- | --- |
| Booth app | repository root, `app/`, `Sources/` | Chrome/LAN web app plus a native macOS wrapper |
| OpenHome ability | `openhome/ctrl-snap-host/` | Local event bridge, countdown, outfit hype, and post-photo conversation |
| Agent setup kit | `AGENTS.md`, `skills/`, `script/` | A repeatable setup and verification path for Codex or another coding harness |

No source from the private Snappy Mac app is included or required.

## Fast setup

Requirements:

- macOS 14 or newer for the native wrapper
- Node.js 22.13 or newer
- Swift 5.10 or newer for the native wrapper
- Python 3 for OpenHome ability checks

```bash
git clone https://github.com/eperez28/snappy-booth.git
cd snappy-booth
./script/setup.sh
```

The setup script installs locked Node dependencies, creates a local Python
environment for validating the OpenHome helper, and runs the quick doctor.
It does not create, request, or store API keys.

## Run in Chrome

For a booth used only on this Mac:

```bash
npm run dev
```

Open `http://localhost:3000`, allow camera access, and use the on-screen
controls, Space, or Command-Shift-B.

For QR downloads on phones connected to the same Wi-Fi:

```bash
npm run dev:lan
```

Open the network URL printed by the development server, such as
`http://192.168.1.50:3000`. Do not open the booth as `localhost` for a
phone-handoff session—the QR code must contain an address the phone can reach.
Guest isolation, VPNs, and some venue networks can block device-to-device
traffic even when both devices show the same Wi-Fi name.

Finished web prints are kept in the running local process and disappear when
that process restarts. Direct download remains available on the booth.

## Run the native Mac app

```bash
./script/build_and_run.sh
```

This builds `dist-mac/Snappy Booth.app`, ad-hoc signs it, and launches it. The
app bundles its web interface and runs a native local photo server, so Node and
a browser are not needed after the build.

The app requests camera and local-network access only. It does not request
microphone access. It is intended for local builds and is not notarized for
general distribution.

## Install the OpenHome ability

Create an upload-ready archive:

```bash
./script/package_openhome.sh
```

Then follow
[`openhome/ctrl-snap-host/README.md`](openhome/ctrl-snap-host/README.md).
The booth works without OpenHome, and the OpenHome countdown/conversation works
without an OpenAI API key. Optional outfit vision requires an API key supplied
to the runtime as `OPENAI_API_KEY`; never put it in tracked source or an
archive.

## Point an agent at the repo

An agent can bootstrap the project by reading `AGENTS.md` and running:

```bash
./script/setup.sh
./script/doctor.sh --full
```

Codex-compatible harnesses can also install or invoke the included
`$snappy-booth-setup` skill from `skills/snappy-booth-setup/`.

A useful setup prompt is:

> Read AGENTS.md, use the snappy-booth-setup skill, install the project, run the
> full doctor, and launch the requested local mode. Do not deploy it or add
> secrets.

## Verify

Quick repository and secret-safety checks:

```bash
./script/doctor.sh
```

Full lint, tests, web build, Swift build, and OpenHome syntax checks:

```bash
./script/doctor.sh --full
```

## Privacy and security

- Camera frames and completed prints stay on the Mac unless a guest downloads
  one or optional outfit vision is enabled.
- QR handoff is a local-network feature; it is not a cloud gallery.
- `.env*`, generated apps, build output, and OpenHome zip archives are ignored.
- Never commit API keys. See [`SECURITY.md`](SECURITY.md) if a secret is exposed.

## License

MIT. See [`LICENSE`](LICENSE).
