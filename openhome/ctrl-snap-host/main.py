import json

from src.agent.capability import MatchingCapability
from src.agent.capability_worker import CapabilityWorker
from src.main import AgentWorker


class CtrlSnapHostCapability(MatchingCapability):
    worker: AgentWorker = None
    capability_worker: CapabilityWorker = None

    #{{register capability}}

    def call(self, worker: AgentWorker):
        self.worker = worker
        self.capability_worker = CapabilityWorker(self)
        self.worker.session_tasks.create(self.run())

    async def run(self):
        try:
            result = await self.capability_worker.send_devkit_capability_action(
                function_name="bridge_status",
                args=[],
                timeout=5,
            )
            payload = self._payload(result)
            if payload.get("ok"):
                await self.capability_worker.speak(
                    "Control Snap is listening. Somehow, we're organized."
                )
            else:
                await self.capability_worker.speak(
                    "Control Snap isn't listening yet. Try syncing the ability."
                )
        except Exception as error:
            self.worker.editor_logging_handler.error(
                f"[CtrlSnapHost] status failed: {error!r}"
            )
            await self.capability_worker.speak(
                "Control Snap isn't listening yet. Try syncing the ability."
            )
        finally:
            self.capability_worker.resume_normal_flow()

    @staticmethod
    def _payload(result):
        if not isinstance(result, dict) or not result.get("success"):
            return {}
        try:
            return json.loads((result.get("output") or "").strip())
        except Exception:
            return {}
