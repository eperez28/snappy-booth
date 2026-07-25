import base64
import fcntl
import ipaddress
import json
import os
import socket
import subprocess
import sys
import time
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
from urllib.parse import urlparse

import requests

try:
    from devkit_utils.devkit_logging import web_logger as log
except Exception:
    import logging

    logging.basicConfig(level=logging.INFO)
    log = logging.getLogger("ctrl_snap")


# This local-only event token must match app/openhome.ts. An environment
# variable can override it for managed setups.
BRIDGE_TOKEN = os.environ.get(
    "CTRL_SNAP_BRIDGE_TOKEN",
    "ctrl-snap-local-64f2b731e5c947b8a2db09c1",
)
OPENAI_API_KEY = os.environ.get(
    "OPENAI_API_KEY",
    "",
)

OPENAI_URL = "https://api.openai.com/v1/chat/completions"
OPENAI_MODEL = "gpt-4o"
DEFAULT_PORT = 8765
MAX_EVENT_BYTES = 16_384
MAX_IMAGE_BYTES = 8 * 1024 * 1024

QUEUE_FILE = "/tmp/ctrl_snap_events.jsonl"
PID_FILE = "/tmp/ctrl_snap_bridge.pid"
LOG_FILE = "/tmp/ctrl_snap_bridge.log"

OUTFIT_PROMPT = """
You are the voice host at the Snappy Booth party photo booth.
Look only at clothing, accessories, colors, patterns, styling, or a clearly
visible statement piece. Pick one concrete detail and give one short hype line.

Tone: upbeat, goofy, lightly sarcastic, confident. The joke must compliment the
guest, never insult them. Maximum 18 words. Plain spoken English only. No
markdown, labels, quotation marks, emojis, or preamble.

Never mention or infer age, race, ethnicity, nationality, gender identity,
sexuality, religion, disability, health, body shape, weight, attractiveness,
wealth, or any other sensitive trait. Never sexualize anyone. Don't identify
people. If the image is unclear, crowded, or has no visible outfit detail, give
a generic group-safe hype line.

Examples of tone, not scripts:
That jacket is doing most of the hosting tonight. Respect.
Okay, those boots clearly have their own publicist.
Somehow all of you understood the assignment. Suspicious.
""".strip()


def _emit(payload):
    print(json.dumps(payload, separators=(",", ":")))


def _locked_queue(mode):
    os.makedirs(os.path.dirname(QUEUE_FILE), exist_ok=True)
    handle = open(QUEUE_FILE, mode)
    fcntl.flock(handle.fileno(), fcntl.LOCK_EX)
    return handle


def _enqueue(event):
    with _locked_queue("a+") as handle:
        handle.write(json.dumps(event, separators=(",", ":")) + "\n")
        handle.flush()


def _dequeue():
    with _locked_queue("a+") as handle:
        handle.seek(0)
        lines = handle.readlines()
        if not lines:
            return None
        try:
            event = json.loads(lines[0])
        except Exception:
            event = None
        handle.seek(0)
        handle.truncate()
        handle.writelines(lines[1:])
        handle.flush()
        return event if isinstance(event, dict) else None


def _pid_is_alive(pid):
    try:
        os.kill(int(pid), 0)
        return True
    except Exception:
        return False


def _read_pid():
    try:
        with open(PID_FILE, "r") as handle:
            pid = int(handle.read().strip())
        return pid if _pid_is_alive(pid) else None
    except Exception:
        return None


def _local_ip():
    probe = socket.socket(socket.AF_INET, socket.SOCK_DGRAM)
    try:
        probe.connect(("8.8.8.8", 80))
        return probe.getsockname()[0]
    except Exception:
        return "127.0.0.1"
    finally:
        probe.close()


def _server_ready(port):
    try:
        with socket.create_connection(("127.0.0.1", int(port)), timeout=0.5):
            return True
    except Exception:
        return False


class CtrlSnapHandler(BaseHTTPRequestHandler):
    server_version = "CtrlSnapBridge/1.0"

    def _cors(self):
        self.send_header("Access-Control-Allow-Origin", "*")
        self.send_header("Access-Control-Allow-Headers", "content-type,x-ctrl-snap-token")
        self.send_header("Access-Control-Allow-Methods", "GET,POST,OPTIONS")

    def _json(self, status, payload):
        body = json.dumps(payload, separators=(",", ":")).encode("utf-8")
        self.send_response(status)
        self._cors()
        self.send_header("Content-Type", "application/json")
        self.send_header("Content-Length", str(len(body)))
        self.end_headers()
        self.wfile.write(body)

    def _authorized(self):
        return (
            self.headers.get("X-CTRL-SNAP-TOKEN", "") == BRIDGE_TOKEN
        )

    def do_OPTIONS(self):
        self.send_response(204)
        self._cors()
        self.end_headers()

    def do_GET(self):
        if self.path == "/health":
            self._json(200, {"ok": True, "service": "ctrl-snap-host"})
        else:
            self._json(404, {"ok": False, "error": "not_found"})

    def do_POST(self):
        if self.path != "/event":
            self._json(404, {"ok": False, "error": "not_found"})
            return
        if not self._authorized():
            self._json(401, {"ok": False, "error": "unauthorized"})
            return
        try:
            length = int(self.headers.get("Content-Length", "0"))
        except ValueError:
            length = 0
        if length < 2 or length > MAX_EVENT_BYTES:
            self._json(413, {"ok": False, "error": "invalid_size"})
            return
        try:
            event = json.loads(self.rfile.read(length))
        except Exception:
            self._json(400, {"ok": False, "error": "invalid_json"})
            return
        if not isinstance(event, dict) or event.get("type") not in {
            "countdown_start",
            "countdown",
            "hype",
            "photo_captured",
            "goodbye",
        }:
            self._json(400, {"ok": False, "error": "invalid_event"})
            return
        event["received_at"] = time.time()
        _enqueue(event)
        self._json(202, {"ok": True})

    def log_message(self, format_string, *args):
        log.info("bridge: " + format_string, *args)


def _serve(port):
    server = ThreadingHTTPServer(("0.0.0.0", int(port)), CtrlSnapHandler)
    log.info("Snappy Booth bridge listening on %s:%s", _local_ip(), port)
    server.serve_forever(poll_interval=0.2)


def start_bridge(port=DEFAULT_PORT):
    port = int(port)
    pid = _read_pid()
    if pid and _server_ready(port):
        _emit({"ok": True, "already_running": True, "pid": pid, "port": port})
        return

    with open(LOG_FILE, "ab", buffering=0) as output:
        process = subprocess.Popen(
            [sys.executable, os.path.abspath(__file__), "__serve__", str(port)],
            stdin=subprocess.DEVNULL,
            stdout=output,
            stderr=output,
            start_new_session=True,
            cwd=os.path.dirname(os.path.abspath(__file__)),
        )
    with open(PID_FILE, "w") as handle:
        handle.write(str(process.pid))

    deadline = time.monotonic() + 4
    while time.monotonic() < deadline:
        if _server_ready(port):
            _emit(
                {
                    "ok": True,
                    "already_running": False,
                    "pid": process.pid,
                    "host": _local_ip(),
                    "port": port,
                }
            )
            return
        time.sleep(0.1)
    _emit({"ok": False, "error": "bridge_start_timeout"})


def bridge_status(port=DEFAULT_PORT):
    port = int(port)
    pid = _read_pid()
    _emit(
        {
            "ok": bool(pid and _server_ready(port)),
            "pid": pid,
            "host": _local_ip(),
            "port": port,
        }
    )


def next_event(wait_seconds="12"):
    deadline = time.monotonic() + max(0.1, min(float(wait_seconds), 20.0))
    while time.monotonic() < deadline:
        event = _dequeue()
        if event:
            _emit({"ok": True, "event": event})
            return
        time.sleep(0.1)
    _emit({"ok": True, "event": None})


def _private_image_url(image_url):
    parsed = urlparse(image_url)
    if parsed.scheme not in {"http", "https"} or not parsed.hostname:
        raise ValueError("image_url must be HTTP or HTTPS")
    addresses = socket.getaddrinfo(parsed.hostname, parsed.port or 80)
    for entry in addresses:
        address = ipaddress.ip_address(entry[4][0])
        if not (address.is_private or address.is_loopback or address.is_link_local):
            raise ValueError("image_url must resolve to the local network")
    return image_url


def _download_image(image_url):
    response = requests.get(
        _private_image_url(image_url),
        timeout=8,
        stream=True,
        headers={"User-Agent": "Snappy-Booth-OpenHome/1.0"},
    )
    response.raise_for_status()
    content_type = response.headers.get("Content-Type", "").split(";")[0].lower()
    if content_type not in {"image/jpeg", "image/png", "image/webp"}:
        raise ValueError("image_url did not return a supported image")
    chunks = []
    size = 0
    for chunk in response.iter_content(64 * 1024):
        size += len(chunk)
        if size > MAX_IMAGE_BYTES:
            raise ValueError("image exceeds size limit")
        chunks.append(chunk)
    return b"".join(chunks), content_type


def analyze_outfit(image_url, group_size="1"):
    if not image_url:
        _emit({"ok": False, "error": "missing_image_url"})
        return
    if (
        not OPENAI_API_KEY
        or OPENAI_API_KEY == ""
    ):
        _emit({"ok": False, "error": "openai_key_not_configured"})
        return

    try:
        image, mime_type = _download_image(image_url)
        data_url = (
            f"data:{mime_type};base64,"
            + base64.b64encode(image).decode("ascii")
        )
        prompt = (
            OUTFIT_PROMPT
            + f"\nThere are approximately {str(group_size)[:3]} guests in frame."
        )
        response = requests.post(
            OPENAI_URL,
            headers={"Authorization": f"Bearer {OPENAI_API_KEY}"},
            json={
                "model": OPENAI_MODEL,
                "temperature": 0.8,
                "max_tokens": 80,
                "messages": [
                    {"role": "system", "content": prompt},
                    {
                        "role": "user",
                        "content": [
                            {
                                "type": "text",
                                "text": "Give the guest one outfit hype line.",
                            },
                            {
                                "type": "image_url",
                                "image_url": {
                                    "url": data_url,
                                    "detail": "low",
                                },
                            },
                        ],
                    },
                ],
            },
            timeout=15,
        )
        response.raise_for_status()
        line = response.json()["choices"][0]["message"]["content"]
        line = " ".join(str(line).replace("\n", " ").split()).strip()
        _emit({"ok": bool(line), "line": line[:240]})
    except Exception as error:
        log.exception("analyze_outfit failed")
        _emit({"ok": False, "error": str(error)[:180]})


FUNCTION_REGISTRY = {
    "start_bridge": start_bridge,
    "bridge_status": bridge_status,
    "next_event": next_event,
    "analyze_outfit": analyze_outfit,
}


if __name__ == "__main__":
    if len(sys.argv) > 1 and sys.argv[1] == "__serve__":
        _serve(int(sys.argv[2]) if len(sys.argv) > 2 else DEFAULT_PORT)
    else:
        FUNCTION_REGISTRY[sys.argv[1]](*sys.argv[2:])
