type PhotoRecord = {
  dataUrl: string;
  createdAt: number;
};

const STORE_KEY = "__ctrlSnapPhotos";

export function getPhotoStore(): Map<string, PhotoRecord> {
  const root = globalThis as typeof globalThis & {
    [STORE_KEY]?: Map<string, PhotoRecord>;
  };
  if (!root[STORE_KEY]) root[STORE_KEY] = new Map();
  return root[STORE_KEY];
}

export function prunePhotoStore() {
  const store = getPhotoStore();
  const cutoff = Date.now() - 1000 * 60 * 60 * 8;
  for (const [id, photo] of store) {
    if (photo.createdAt < cutoff) store.delete(id);
  }
}
