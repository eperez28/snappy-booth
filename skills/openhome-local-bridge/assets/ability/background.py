import json

from src.agent.capability import MatchingCapability
from src.agent.capability_worker import CapabilityWorker
from src.main import AgentWorker


BRIDGE_PORT = "__BRIDGE_PORT__"
POLL_SECONDS = "12"
PROMPT_SYSTEM = (
    "Respond for spoken playback in plain language. Be concise, helpful, "
    "and safe. Do not use markdown, URLs, or stage directions."
)


class __BRIDGE_CLASS__BridgeBackground(MatchingCapability):
    worker: AgentWorker = None
    capability_worker: CapabilityWorker = None
    background_daemon_mode: bool = False

    #{{register capability}}

    def call(self, worker: AgentWorker, background_daemon_mode: bool):
        self.worker = worker
        self.background_daemon_mode = background_daemon_mode
        self.capability_worker = CapabilityWorker(self)
        self.worker.session_tasks.create(self.watch_events())

    async def watch_events(self):
        started = False
        while True:
            try:
                if not started:
                    result = await self.capability_worker.send_devkit_capability_action(
                        function_name="start_bridge",
                        args=[BRIDGE_PORT],
                        timeout=8,
                    )
                    started = bool(self._payload(result).get("ok"))
                    if not started:
                        await self.worker.session_tasks.sleep(3.0)
                        continue

                result = await self.capability_worker.send_devkit_capability_action(
                    function_name="next_event",
                    args=[POLL_SECONDS],
                    timeout=int(POLL_SECONDS) + 5,
                )
                event = self._payload(result).get("event")
                if isinstance(event, dict):
                    await self.handle_event(event)
            except Exception as error:
                started = False
                self.worker.editor_logging_handler.error(
                    f"[__BRIDGE_CLASS__Bridge] watcher failed: {error!r}"
                )
                await self.worker.session_tasks.sleep(2.0)

    async def handle_event(self, event):
        event_type = str(event.get("type", "")).strip().lower()
        if event_type == "ping":
            return
        if event_type == "speak":
            text = self._safe_line(event.get("text"))
            if text:
                await self._say(text)
            return
        if event_type == "prompt":
            prompt = self._safe_line(event.get("text"), limit=800)
            if prompt:
                try:
                    reply = self.capability_worker.text_to_text_response(
                        prompt,
                        system_prompt=PROMPT_SYSTEM,
                    )
                except TypeError:
                    reply = self.capability_worker.text_to_text_response(
                        PROMPT_SYSTEM + "\n\n" + prompt
                    )
                reply = self._safe_line(reply)
                if reply:
                    await self._say(reply)
            return
        if event_type == "action":
            name = self._safe_line(event.get("name"), limit=80)
            self.worker.editor_logging_handler.info(
                f"[__BRIDGE_CLASS__Bridge] action received: {name}"
            )
            # Add app-specific action handling here. Never execute event text.

    async def _say(self, text):
        try:
            await self.capability_worker.send_interrupt_signal()
        except Exception:
            pass
        await self.capability_worker.speak(text)

    @staticmethod
    def _safe_line(value, limit=320):
        if not isinstance(value, str):
            return ""
        clean = value.replace("*", "").replace("#", "").replace("`", "")
        return " ".join(clean.replace("\n", " ").split()).strip()[:limit]

    @staticmethod
    def _payload(result):
        if not isinstance(result, dict) or not result.get("success"):
            return {}
        try:
            return json.loads((result.get("output") or "").strip())
        except Exception:
            return {}
