export type CtrlSnapHostEvent =
  | { type: "countdown_start"; session_id?: string }
  | {
      type: "hype" | "photo_captured";
      image_url?: string;
      compliment?: string;
      group_size?: number;
      session_id?: string;
    }
  | { type: "goodbye"; session_id?: string };

const DEFAULT_DEVKIT_URL = "http://127.0.0.1:8765";
const DEFAULT_BRIDGE_TOKEN = "snappy-booth-local-bridge";

function connection() {
  const runtime = window as typeof window & {
    CTRL_SNAP_DEVKIT_URL?: string;
    CTRL_SNAP_DEVKIT_TOKEN?: string;
  };

  return {
    baseUrl: (
      runtime.CTRL_SNAP_DEVKIT_URL ||
      window.localStorage.getItem("ctrl-snap-devkit-url") ||
      DEFAULT_DEVKIT_URL
    ).replace(/\/$/, ""),
    token:
      runtime.CTRL_SNAP_DEVKIT_TOKEN ||
      window.localStorage.getItem("ctrl-snap-devkit-token") ||
      DEFAULT_BRIDGE_TOKEN,
  };
}

export async function sendCtrlSnapHostEvent(
  event: CtrlSnapHostEvent,
): Promise<boolean> {
  const { baseUrl, token } = connection();
  const controller = new AbortController();
  const timeout = window.setTimeout(() => controller.abort(), 900);

  try {
    const response = await fetch(`${baseUrl}/event`, {
      method: "POST",
      headers: {
        "content-type": "application/json",
        "x-ctrl-snap-token": token,
      },
      body: JSON.stringify(event),
      signal: controller.signal,
    });
    return response.ok;
  } catch {
    return false;
  } finally {
    window.clearTimeout(timeout);
  }
}

export async function ctrlSnapHostIsReady(): Promise<boolean> {
  const { baseUrl } = connection();
  const controller = new AbortController();
  const timeout = window.setTimeout(() => controller.abort(), 650);

  try {
    const response = await fetch(`${baseUrl}/health`, {
      cache: "no-store",
      signal: controller.signal,
    });
    return response.ok;
  } catch {
    return false;
  } finally {
    window.clearTimeout(timeout);
  }
}
