import { getPhotoStore, prunePhotoStore } from "../../../photoStore";

export async function GET(
  _request: Request,
  context: { params: Promise<{ id: string }> },
) {
  prunePhotoStore();
  const { id } = await context.params;
  const photo = getPhotoStore().get(id);

  if (!photo) {
    return new Response(
      `<!doctype html><meta name="viewport" content="width=device-width"><style>body{background:#050505;color:#fff;font:16px monospace;display:grid;place-items:center;height:100vh;margin:0;text-align:center}b{font-size:32px}</style><div><b>SNAPPY BOOTH</b><p>This print has expired.<br>Head back to the booth.</p></div>`,
      { status: 404, headers: { "content-type": "text/html; charset=utf-8" } },
    );
  }

  const base64 = photo.dataUrl.split(",")[1];
  return new Response(Buffer.from(base64, "base64"), {
    headers: {
      "content-type": "image/jpeg",
      "content-disposition": `inline; filename="ctrl-snap-${id}.jpg"`,
      "cache-control": "no-store",
    },
  });
}
