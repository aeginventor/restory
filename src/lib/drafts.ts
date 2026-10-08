import { z } from "zod";
import { MEDIA_TYPES, type DatePrecision, type MediaType } from "./types";

export const DRAFT_PREFIX = "restory.draft.";

export interface EntryDraft {
  savedAt: string;
  workId?: string;
  query: string;
  adding: boolean;
  mediaType: MediaType;
  creator: string;
  releaseYear: string;
  precision: DatePrecision;
  date: string;
  summary: string;
  body: string;
  tags: string[];
  favorite: boolean;
  spoiler: boolean;
}

const draftSchema = z.object({
  savedAt: z.string(),
  workId: z.string().optional(),
  query: z.string().max(200),
  adding: z.boolean(),
  mediaType: z.enum(MEDIA_TYPES),
  creator: z.string().max(150),
  releaseYear: z.string().max(4),
  precision: z.enum(["day", "month", "year", "unknown"]),
  date: z.string().max(10),
  summary: z.string().max(240),
  body: z.string().max(20000),
  tags: z.array(z.string().max(20)).max(5),
  favorite: z.boolean(),
  spoiler: z.boolean(),
});

export function draftKey(userId: string | null, entryId?: string): string {
  return `${DRAFT_PREFIX}${userId ?? "demo"}.${entryId ?? "new"}`;
}

function storage(): Storage | null {
  try {
    return typeof window === "undefined" ? null : window.localStorage;
  } catch {
    return null;
  }
}

export function readDraft(key: string): EntryDraft | null {
  try {
    const raw = storage()?.getItem(key);
    if (!raw) return null;
    const result = draftSchema.safeParse(JSON.parse(raw));
    return result.success ? result.data : null;
  } catch {
    return null;
  }
}

export function hasDraftContent(draft: Omit<EntryDraft, "savedAt">): boolean {
  return (
    !!draft.summary.trim() ||
    !!draft.body.trim() ||
    draft.tags.length > 0 ||
    (!draft.workId && (!!draft.query.trim() || !!draft.creator.trim()))
  );
}

export function writeDraft(key: string, draft: EntryDraft): void {
  try {
    storage()?.setItem(key, JSON.stringify(draft));
  } catch {
    // A failed draft write must never interrupt typing. The real save path reports errors.
  }
}

export function clearDraft(key: string): void {
  try {
    storage()?.removeItem(key);
  } catch {
    // Nothing to recover from here.
  }
}

export function clearUserDrafts(userId: string | null): void {
  const target = storage();
  if (!target) return;
  try {
    const prefix = `${DRAFT_PREFIX}${userId ?? "demo"}.`;
    const keys: string[] = [];
    for (let index = 0; index < target.length; index += 1) {
      const key = target.key(index);
      if (key && key.startsWith(prefix)) keys.push(key);
    }
    keys.forEach((key) => target.removeItem(key));
  } catch {
    // Ignore storage access failures during sign-out.
  }
}
