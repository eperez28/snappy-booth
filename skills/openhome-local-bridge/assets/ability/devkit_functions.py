import fcntl
import hmac
import json
import os
import socket
import subprocess
import sys
import time
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer

try:
    from devkit_utils.devkit_logging import web_logger as log
except Exception:
    import logging

    logging.basicConfig(level=logging.INFO)
    log = logging.getLogger("__BRIDGE_SLUG__")


BRIDGE_NAME = "__BRIDGE_NAME__"
DEFAULT_PORT = __BRIDGE_PORT__
MAX_EVENT_BYTES = 16_384
QUEUE_LIMIT = 200
QUEUE_FILE = "/tmp/__BRIDGE_SLUG___events.jsonl"
PID_FILE = "/tmp/__BRIDGE_SLUG___bridge.pid"
LOG_FILE = "/tmp/__BRIDGE_SLUG___bridge.log"


def _emit(payload):
    print(json.dumps(payload, separators=(",", ":")))


def _token():
    return os.environ.get("OPENHOME_BRIDGE_TOKEN", "").strip()


def _allowed_origins():
    value = os.environ.get(
        "OPENHOME_BRIDGE_ALLOWED_ORIGINS",
        "http://localhost:3000,http://127.0.0.1:3000",
    )
    return {origin.strip() for origin in value.split(",") if origin.strip()}


def _locked_queue(mode):
    os.makedirs(os.path.dirname(QUEUE_FILE), exist_ok=True)
    handle = open(QUEUE_FILE, mode)
    fcntl.flock(handle.fileno(), fcntl.LOCK_EX)
    return handle


def _enqueue(event):
    with _locked_queue("a+") as handle:
        handle.seek(0)
        lines = handle.readlines()[-(QUEUE_LIMIT - 1):]
        lines.append(json.dumps(event, separators=(",", ":")) + "\n")
        handle.seek(0)
        handle.truncate()
        handle.writelines(lines)
        handle.flush()


def _dequeue():
    with _locked_queue("a+") as handle:
        handle.seek(0)
        lines = handle.readlines()
        if not lines:
            return None
        handle.seek(0)
        handle.truncate()
        handle.writelines(lines[1:])
        handle.flush()
    try:
        event = json.loads(lines[0])
        return event if isinstance(event, dict) else None
    except Exception:
        return None


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


def _server_ready(port):
    try:
        with socket.create_connection(("127.0.0.1", int(port)), timeout=0.5):
            return True
    except Exception:
        return False


class BridgeHandler(BaseHTTPRequestHandler):
    server_version = "__BRIDGE_CLASS__Bridge/1.0"

    def _cors(self):
        origin = self.headers.get("Origin", "")
        allowed = _allowed_origins()
        if origin and (origin in allowed or "*" in allowed):
            self.send_header("Access-Control-Allow-Origin", origin)
            self.send_header("Vary", "Origin")
        self.send_header(
            "Access-Control-Allow-Headers",
            "content-type,x-openhome-bridge-token",
        )
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
        expected = _token()
        provided = self.headers.get("X-OPENHOME-BRIDGE-TOKEN", "")
        return bool(expected) and hmac.compare_digest(provided, expected)

    def do_OPTIONS(self):
        self.send_response(204)
        self._cors()
        self.end_headers()

    def do_GET(self):
        if self.path == "/health":
            self._json(200, {"ok": True, "service": "__BRIDGE_SLUG__"})
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
            "speak",
            "prompt",
            "action",
            "ping",
        }:
            self._json(400, {"ok": False, "error": "invalid_event"})
            return
        event["received_at"] = time.time()
        _enqueue(event)
        self._json(202, {"ok": True})

    def log_message(self, format_string, *args):
        log.info("bridge: " + format_string, *args)


def _serve(port):
    if not _token():
        raise RuntimeError("OPENHOME_BRIDGE_TOKEN is required")
    server = ThreadingHTTPServer(("0.0.0.0", int(port)), BridgeHandler)
    log.info("%s bridge listening on port %s", BRIDGE_NAME, port)
    server.serve_forever(poll_interval=0.2)


def start_bridge(port=DEFAULT_PORT):
    port = int(port)
    if not _token():
        _emit({"ok": False, "error": "missing_bridge_token"})
        return
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
            _emit({"ok": True, "pid": process.pid, "port": port})
            return
        time.sleep(0.1)
    _emit({"ok": False, "error": "bridge_start_timeout"})


def bridge_status(port=DEFAULT_PORT):
    port = int(port)
    pid = _read_pid()
    _emit({"ok": bool(pid and _server_ready(port)), "pid": pid, "port": port})


def next_event(wait_seconds="12"):
    deadline = time.monotonic() + max(0.1, min(float(wait_seconds), 20.0))
    while time.monotonic() < deadline:
        event = _dequeue()
        if event:
            _emit({"ok": True, "event": event})
            return
        time.sleep(0.1)
    _emit({"ok": True, "event": None})


FUNCTION_REGISTRY = {
    "start_bridge": start_bridge,
    "bridge_status": bridge_status,
    "next_event": next_event,
}


if __name__ == "__main__":
    if len(sys.argv) > 1 and sys.argv[1] == "__serve__":
        _serve(int(sys.argv[2]) if len(sys.argv) > 2 else DEFAULT_PORT)
    else:
        FUNCTION_REGISTRY[sys.argv[1]](*sys.argv[2:])
