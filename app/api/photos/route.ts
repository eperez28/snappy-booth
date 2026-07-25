import { getPhotoStore, prunePhotoStore } from "../../photoStore";

export async function POST(request: Request) {
  prunePhotoStore();
  const body = (await request.json()) as { dataUrl?: string };
  if (!body.dataUrl?.startsWith("data:image/jpeg;base64,")) {
    return Response.json({ error: "Invalid photo" }, { status: 400 });
  }

  const id = crypto.randomUUID().replaceAll("-", "").slice(0, 10);
  getPhotoStore().set(id, { dataUrl: body.dataUrl, createdAt: Date.now() });
  return Response.json({ id });
}
