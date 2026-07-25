import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

async function render() {
  const workerUrl = new URL("../dist/server/index.js", import.meta.url);
  workerUrl.searchParams.set("test", `${process.pid}-${Date.now()}`);
  const { default: worker } = await import(workerUrl.href);

  return worker.fetch(
    new Request("http://localhost/", {
      headers: { accept: "text/html" },
    }),
    {
      ASSETS: {
        fetch: async () => new Response("Not found", { status: 404 }),
      },
    },
    {
      waitUntil() {},
      passThroughOnException() {},
    },
  );
}

test("server-renders the Snappy Booth welcome screen", async () => {
  const response = await render();
  assert.equal(response.status, 200);
  assert.match(response.headers.get("content-type") ?? "", /^text\/html\b/i);

  const html = await response.text();
  assert.match(html, /<title>Snappy Booth — CTRL OVERDRIVE<\/title>/i);
  assert.match(html, /SNAPPY BOOTH/);
  assert.match(html, /CTRL OVERDRIVE/);
  assert.match(html, /Take a fun photo!/);
  assert.match(html, /NEXT/);
  assert.doesNotMatch(html, /SNAP<span>\.<\/span>/);
  assert.match(html, /aria-label="Step 1 of 3"/);
  assert.doesNotMatch(html, /Cloud|account|microphone/i);
});

test("keeps capture camera-only and exposes both capture hotkeys", async () => {
  const [booth, buildScript] = await Promise.all([
    readFile(new URL("../app/Booth.tsx", import.meta.url), "utf8"),
    readFile(new URL("../script/build_and_run.sh", import.meta.url), "utf8"),
  ]);

  assert.match(booth, /navigator\.mediaDevices\.getUserMedia/);
  assert.match(booth, /audio:\s*false/);
  assert.match(booth, /event\.code === "Space"/);
  assert.match(booth, /event\.code === "KeyB"/);
  assert.match(booth, /event\.metaKey/);
  assert.match(booth, /event\.shiftKey/);
  assert.match(booth, /SPACE \/ ⌘⇧B \/ TAP/);
  assert.match(booth, /Press Space or Command Shift B to take a photo/);
  assert.match(booth, /fillText\("CTRL OVERDRIVE", 78, 1308\)/);
  assert.match(booth, /700 88px 'Caveat Variable'/);
  assert.doesNotMatch(booth, /getUserMedia\(\{[^}]*audio:\s*true/s);
  assert.doesNotMatch(buildScript, /NSMicrophoneUsageDescription/);
});
