from src.agent.capability import MatchingCapability
from src.agent.capability_worker import CapabilityWorker
from src.main import AgentWorker


MAX_TURNS = 5
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

HOST_SYSTEM_PROMPT = """
You are Snappy, the live voice host at the CTRL SNAP photo booth for the
CTRL OVERDRIVE event.

You are playful, quick, lightly sarcastic, and always kind. Your job is to make
guests and groups feel confident and included. React to what the guest actually
says and maintain a real back-and-forth conversation.

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

OPENING = "Yeah, I can talk back. What's your verdict on the photo?"
MISSED = "I missed that. Give me the short version."
FAREWELL = "Fair. Go have a good time before this turns into a podcast."
FALLBACK = "Honestly, fair. What's the story behind the look?"


class CtrlSnapHostCapability(MatchingCapability):
    worker: AgentWorker = None
    capability_worker: CapabilityWorker = None

    #{{register capability}}

    def call(self, worker: AgentWorker):
        self.worker = worker
        self.capability_worker = CapabilityWorker(self)
        self.worker.session_tasks.create(self.run())

    async def run(self):
        history = []
        empty_turns = 0
        try:
            await self.capability_worker.speak(OPENING)
            history.append({"role": "assistant", "content": OPENING})

            for turn in range(MAX_TURNS):
                user_input = await self.capability_worker.user_response()
                user_input = self._safe_line(user_input)

                if not user_input:
                    empty_turns += 1
                    if empty_turns >= 2:
                        break
                    await self.capability_worker.speak(MISSED)
                    history.append({"role": "assistant", "content": MISSED})
                    continue

                empty_turns = 0
                if self._wants_to_exit(user_input):
                    await self.capability_worker.speak(FAREWELL)
                    break

                history.append({"role": "user", "content": user_input})
                reply = self._generate_reply(
                    user_input=user_input,
                    history=history,
                    final_turn=turn == MAX_TURNS - 1,
                )
                await self.capability_worker.speak(reply)
                history.append({"role": "assistant", "content": reply})
            else:
                await self.capability_worker.speak(FAREWELL)
        except Exception as error:
            self.worker.editor_logging_handler.error(
                f"[CtrlSnapHost] conversation failed: {error!r}"
            )
            await self.capability_worker.speak(
                "My social battery just blinked. Try me again in a second."
            )
        finally:
            self.capability_worker.resume_normal_flow()

    def _generate_reply(self, user_input, history, final_turn):
        turn_instruction = (
            "This is the final reply. End warmly without asking a question."
            if final_turn
            else "Keep the exchange moving with one natural, easy question when useful."
        )
        prompt = (
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
        return self._safe_line(response) or FALLBACK

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
