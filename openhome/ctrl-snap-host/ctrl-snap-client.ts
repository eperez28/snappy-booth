export type CtrlSnapHostEvent =
  | { type: "countdown_start"; session_id?: string }
  | { type: "countdown"; value: 1 | 2 | 3 | 4 | 5; session_id?: string }
  | {
      type: "hype" | "photo_captured";
      image_url?: string;
      compliment?: string;
      group_size?: number;
      session_id?: string;
    }
  | { type: "goodbye"; session_id?: string };

export type CtrlSnapHostConfig = {
  baseUrl: string;
  token: string;
  timeoutMs?: number;
};

export async function sendCtrlSnapHostEvent(
  config: CtrlSnapHostConfig,
  event: CtrlSnapHostEvent,
): Promise<boolean> {
  const controller = new AbortController();
  const timeout = window.setTimeout(
    () => controller.abort(),
    config.timeoutMs ?? 800,
  );

  try {
    const response = await fetch(
      `${config.baseUrl.replace(/\/$/, "")}/event`,
      {
        method: "POST",
        headers: {
          "content-type": "application/json",
          "x-ctrl-snap-token": config.token,
        },
        body: JSON.stringify(event),
        signal: controller.signal,
      },
    );
    return response.ok;
  } catch {
    return false;
  } finally {
    window.clearTimeout(timeout);
  }
}
