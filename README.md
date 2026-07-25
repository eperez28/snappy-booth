# Snappy Booth

A local-first party photo booth for CTRL OVERDRIVE.

## Launch the Mac app

The packaged local app is at `dist-mac/Snappy Booth.app`. It contains its own
static booth build and native local photo server, so it does not need Node,
npm, a browser tab, or internet access at runtime.

Build and launch it with:

```bash
./script/build_and_run.sh
```

For OpenHome outfit hype, keep the local vision credential in the ignored
workspace file:

```text
.env.local
OPENAI_API_KEY=your-project-key
```

The native Mac server reads that value locally and sends OpenHome only the
finished compliment. The key is never bundled into the app or exposed to the
booth web view.

The Codex Run button uses that same command. The app is ad-hoc signed for local
use. It is not notarized for public distribution.

## Start the booth

Requires Node.js 22 or newer.

```bash
npm install
npm run dev
```

Open `http://localhost:3000` in Chrome, Safari, or Edge and allow camera
access. Tap the shutter, press Space, or press Command-Shift-B to take the
photo.

The booth flow is:

1. Press Space, Command-Shift-B, or tap
2. Watch the Polaroid print
3. Pick a filter, then save or scan the QR code

## Phone QR handoff

For guests to scan prints on the same Wi-Fi network:

```bash
npm run dev:lan
```

Open the booth using the Mac's network address shown in the terminal (for
example, `http://192.168.1.50:3000`) rather than `localhost`. The QR code will
then use that reachable address. Prints live only in the running local booth
process and expire when it restarts.

## Production check

```bash
npm run build
npm start
```

No internet connection is needed after dependencies are installed. The Space
and Command-Shift-B hotkeys, on-screen shutter, and photo upload are all
available. Print sound can be disabled from the camera screen.
