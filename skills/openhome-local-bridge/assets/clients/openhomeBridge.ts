export type OpenHomeBridgeEvent =
  | { type: "speak"; text: string }
  | { type: "prompt"; text: string }
  | { type: "action"; name: string; data?: Record<string, unknown> }
  | { type: "ping" };

export type OpenHomeBridgeConfig = {
  baseUrl: string;
  token: string;
  timeoutMs?: number;
};

export async function sendOpenHomeEvent(
  config: OpenHomeBridgeConfig,
  event: OpenHomeBridgeEvent,
): Promise<boolean> {
  const controller = new AbortController();
  const timeout = window.setTimeout(
    () => controller.abort(),
    config.timeoutMs ?? 1200,
  );

  try {
    const response = await fetch(
      `${config.baseUrl.replace(/\/$/, "")}/event`,
      {
        method: "POST",
        headers: {
          "content-type": "application/json",
          "x-openhome-bridge-token": config.token,
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

export async function openHomeBridgeIsReady(
  baseUrl: string,
  timeoutMs = 800,
): Promise<boolean> {
  const controller = new AbortController();
  const timeout = window.setTimeout(() => controller.abort(), timeoutMs);
  try {
    const response = await fetch(
      `${baseUrl.replace(/\/$/, "")}/health`,
      { cache: "no-store", signal: controller.signal },
    );
    return response.ok;
  } catch {
    return false;
  } finally {
    window.clearTimeout(timeout);
  }
}
