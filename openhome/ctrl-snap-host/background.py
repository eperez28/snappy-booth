import json

from src.agent.capability import MatchingCapability
from src.agent.capability_worker import CapabilityWorker
from src.main import AgentWorker


BRIDGE_PORT = "8765"
POLL_SECONDS = "12"
OUTFIT_TIMEOUT = 25
MAX_CONVERSATION_TURNS = 4

EXIT_PHRASES = (
    "bye",
    "goodbye",
    "done",
    "stop",
    "that's all",
    "that is all",
    "no thanks",
    "thank you",
    "thanks",
)

GENERIC_HYPE = (
    "Okay, the outfit understood the assignment. Annoying, but impressive."
)
GOODBYE = (
    "Have a good time or whatever. Thanks for coming to the Control Snap booth."
)
CONVERSATION_OPENING = (
    "You can talk back, by the way. What's the story behind the look?"
)
CONVERSATION_MISSED = "I missed that. Give me the short version."
CONVERSATION_END = (
    "Okay, I'm cutting us off before this turns into a podcast. Go enjoy the party."
)
CONVERSATION_FALLBACK = (
    "Honestly, fair. What are you getting into after this?"
)

HOST_SYSTEM_PROMPT = """
You are Snappy, the live voice host at the CTRL SNAP photo booth for the
CTRL OVERDRIVE event.

You are playful, quick, lightly sarcastic, and always kind. Your job is to make
guests and groups feel confident and included. React to what the guest actually
says and maintain a real back-and-forth conversation. You may refer naturally
to the supplied outfit compliment, but do not repeat it.

Every response is spoken aloud. Return plain spoken English only. Never use
markdown, labels, emojis, URLs, or stage directions. Use one or two short
sentences and no more than 22 words. Ask at most one easy follow-up question.
Do not repeat the same joke or compliment.

Never insult, sexualize, identify, or rank a guest. Never infer or discuss age,
race, ethnicity, nationality, gender identity, sexuality, religion, disability,
health, body shape, weight, attractiveness, wealth, or other sensitive traits.
If someone asks for harmful, hateful, sexual, political, medical, legal, or
otherwise high-stakes content, redirect briefly and playfully to the party,
their photo, music, style, or having a good time.
""".strip()


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
                await self._conversation(compliment)
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

    async def _conversation(self, compliment):
        history = [
            {"role": "assistant", "content": compliment},
            {"role": "assistant", "content": CONVERSATION_OPENING},
        ]
        empty_turns = 0

        try:
            await self._say(CONVERSATION_OPENING)
            for turn in range(MAX_CONVERSATION_TURNS):
                user_input = await self.capability_worker.user_response()
                user_input = self._safe_line(user_input)

                if not user_input:
                    empty_turns += 1
                    if empty_turns >= 2:
                        return
                    await self._say(CONVERSATION_MISSED)
                    history.append(
                        {"role": "assistant", "content": CONVERSATION_MISSED}
                    )
                    continue

                empty_turns = 0
                if self._wants_to_exit(user_input):
                    await self._say(
                        "Fair. Go have a good time before I start charging by the minute."
                    )
                    return

                history.append({"role": "user", "content": user_input})
                reply = self._generate_reply(
                    compliment=compliment,
                    user_input=user_input,
                    history=history,
                    final_turn=turn == MAX_CONVERSATION_TURNS - 1,
                )
                await self._say(reply)
                history.append({"role": "assistant", "content": reply})

            await self._say(CONVERSATION_END)
        except Exception as error:
            self.worker.editor_logging_handler.error(
                f"[CtrlSnapHost] conversation failed: {error!r}"
            )

    def _generate_reply(self, compliment, user_input, history, final_turn):
        turn_instruction = (
            "This is the final reply. End warmly without asking a question."
            if final_turn
            else "Keep the exchange moving with one natural, easy question when useful."
        )
        prompt = (
            f'Visible-style context from the photo: "{compliment}"\n'
            f'The guest just said: "{user_input}"\n'
            f"{turn_instruction}\n"
            "Respond as Snappy now."
        )
        try:
            response = self.capability_worker.text_to_text_response(
                prompt,
                history=history,
                system_prompt=HOST_SYSTEM_PROMPT,
            )
        except TypeError:
            response = self.capability_worker.text_to_text_response(
                HOST_SYSTEM_PROMPT + "\n\n" + prompt,
                history=history,
            )
        return self._safe_line(response) or CONVERSATION_FALLBACK

    @staticmethod
    def _wants_to_exit(value):
        clean = " ".join(value.lower().split())
        return any(phrase in clean for phrase in EXIT_PHRASES)

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
