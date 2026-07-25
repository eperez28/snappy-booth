import json

from src.agent.capability import MatchingCapability
from src.agent.capability_worker import CapabilityWorker
from src.main import AgentWorker


BRIDGE_PORT = "8765"
POLL_SECONDS = "12"
OUTFIT_TIMEOUT = 25

GENERIC_HYPE = (
    "Okay, the outfit understood the assignment. Annoying, but impressive."
)
GOODBYE = (
    "Have a good time or whatever. Thanks for coming to the Control Snap booth."
)
CONVERSATION_OPENING = (
    "You can talk back, by the way. What's the story behind the look?"
)


class CtrlSnapLocalBridgeCapabilityBackground(MatchingCapability):
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
                payload = self._payload(result)
                event = payload.get("event")
                if isinstance(event, dict):
                    await self.handle_event(event)
            except Exception as error:
                started = False
                self.worker.editor_logging_handler.error(
                    f"[CtrlSnapHost] watcher failed: {error!r}"
                )
                await self.worker.session_tasks.sleep(2.0)

    async def handle_event(self, event):
        event_type = str(event.get("type", "")).strip().lower()

        if event_type == "countdown_start":
            await self._say("Three. Two. One.")
            return

        if event_type == "countdown":
            value = str(event.get("value", "")).strip()
            if value in {"1", "2", "3", "4", "5"}:
                await self._say(value)
            return

        if event_type in {"hype", "photo_captured"}:
            compliment = self._safe_line(event.get("compliment"))
            if not compliment and event.get("image_url"):
                compliment = await self._analyze_outfit(event)
            compliment = compliment or GENERIC_HYPE
            await self._say(compliment)
            if event_type == "photo_captured":
                await self._say(CONVERSATION_OPENING)
            return

        if event_type == "goodbye":
            await self._say(GOODBYE)

    async def _analyze_outfit(self, event):
        result = await self.capability_worker.send_devkit_capability_action(
            function_name="analyze_outfit",
            args=[
                str(event.get("image_url", "")),
                str(event.get("group_size", "1")),
            ],
            timeout=OUTFIT_TIMEOUT,
        )
        return self._safe_line(self._payload(result).get("line"))

    async def _say(self, text):
        try:
            await self.capability_worker.send_interrupt_signal()
        except Exception:
            pass
        await self.capability_worker.speak(text)

    @staticmethod
    def _safe_line(value):
        if not isinstance(value, str):
            return ""
        clean = value.replace("*", "").replace("#", "").replace("`", "")
        clean = " ".join(clean.replace("\n", " ").split()).strip()
        return " ".join(clean.split()[:30])[:260]

    @staticmethod
    def _payload(result):
        if not isinstance(result, dict) or not result.get("success"):
            return {}
        try:
            return json.loads((result.get("output") or "").strip())
        except Exception:
            return {}
