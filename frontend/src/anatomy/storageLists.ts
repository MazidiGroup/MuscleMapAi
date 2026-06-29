import { storage } from "@/src/utils/storage";

// storage only persists primitives, so we encode lists as JSON strings.
async function getList(key: string): Promise<string[]> {
  const raw = await storage.getItem<string>(key, "");
  if (!raw) return [];
  try {
    const arr = JSON.parse(raw);
    return Array.isArray(arr) ? arr : [];
  } catch {
    return [];
  }
}

async function setList(key: string, list: string[]) {
  await storage.setItem(key, JSON.stringify(list));
}

const BOOKMARKS = "anat.bookmarks";
const RECENT = "anat.recent";

export async function getBookmarks() {
  return getList(BOOKMARKS);
}

export async function toggleBookmark(name: string): Promise<boolean> {
  const list = await getList(BOOKMARKS);
  const exists = list.includes(name);
  const next = exists ? list.filter((n) => n !== name) : [name, ...list];
  await setList(BOOKMARKS, next);
  return !exists;
}

export async function isBookmarked(name: string) {
  return (await getList(BOOKMARKS)).includes(name);
}

export async function getRecent() {
  return getList(RECENT);
}

export async function addRecent(name: string) {
  const list = await getList(RECENT);
  const next = [name, ...list.filter((n) => n !== name)].slice(0, 12);
  await setList(RECENT, next);
}
