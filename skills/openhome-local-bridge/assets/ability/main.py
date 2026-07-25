import json

from src.agent.capability import MatchingCapability
from src.agent.capability_worker import CapabilityWorker
from src.main import AgentWorker


BRIDGE_PORT = "__BRIDGE_PORT__"


class __BRIDGE_CLASS__BridgeStatus(MatchingCapability):
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
                args=[BRIDGE_PORT],
                timeout=5,
            )
            payload = self._payload(result)
            line = (
                "__BRIDGE_NAME__ local bridge is ready."
                if payload.get("ok")
                else "__BRIDGE_NAME__ local bridge is not running."
            )
            await self.capability_worker.speak(line)
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
