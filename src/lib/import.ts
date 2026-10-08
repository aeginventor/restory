import type {
  Archive,
  Entry,
  EntryInput,
  RestoryRepository,
  WorkInput,
} from "./types";

export interface ImportPlan {
  newWorks: WorkInput[];
  entries: { workKey: string; input: Omit<EntryInput, "workId"> }[];
  duplicateEntries: number;
  matchedWorks: number;
}

export interface ImportResult {
  works: number;
  entries: number;
  skipped: number;
}

export function workKey(work: WorkInput): string {
  return [
    work.mediaType,
    work.title.trim().toLocaleLowerCase("ko-KR"),
    work.creator.trim().toLocaleLowerCase("ko-KR"),
    work.releaseYear ?? "",
  ].join("|");
}

function entryKey(key: string, entry: Omit<EntryInput, "workId">): string {
  return [
    key,
    entry.experiencedOn ?? "",
    entry.datePrecision,
    entry.summary.trim(),
    entry.body.trim(),
  ].join("\u0000");
}

function toInput(entry: Entry): Omit<EntryInput, "workId"> {
  return {
    experiencedOn: entry.experiencedOn,
    datePrecision: entry.datePrecision,
    summary: entry.summary,
    body: entry.body,
    tags: entry.tags,
    favorite: entry.favorite,
    spoiler: entry.spoiler,
  };
}

// Imported records are compared by content, not by ID, because an export may come from a
// different account or browser. Everything imported stays private until the user publishes it.
export function planImport(current: Archive, imported: Archive): ImportPlan {
  const currentWorks = new Map(current.works.map((w) => [workKey(w), w]));
  const importedWorks = new Map(imported.works.map((w) => [w.id, w]));
  const existingEntries = new Set(
    current.entries.flatMap((entry) => {
      const work = current.works.find((w) => w.id === entry.workId);
      return work ? [entryKey(workKey(work), toInput(entry))] : [];
    }),
  );
  const plan: ImportPlan = {
    newWorks: [],
    entries: [],
    duplicateEntries: 0,
    matchedWorks: 0,
  };
  const plannedWorks = new Set<string>();
  const matched = new Set<string>();
  for (const entry of imported.entries) {
    const work = importedWorks.get(entry.workId);
    if (!work) continue;
    const key = workKey(work);
    const input = toInput(entry);
    const signature = entryKey(key, input);
    if (existingEntries.has(signature)) {
      plan.duplicateEntries += 1;
      continue;
    }
    existingEntries.add(signature);
    if (currentWorks.has(key)) matched.add(key);
    else if (!plannedWorks.has(key)) {
      plannedWorks.add(key);
      plan.newWorks.push({
        title: work.title,
        mediaType: work.mediaType,
        creator: work.creator,
        releaseYear: work.releaseYear,
      });
    }
    plan.entries.push({ workKey: key, input });
  }
  plan.matchedWorks = matched.size;
  return plan;
}

export async function applyImport(
  repository: RestoryRepository,
  current: Archive,
  imported: Archive,
): Promise<ImportResult> {
  const plan = planImport(current, imported);
  const ids = new Map(current.works.map((w) => [workKey(w), w.id]));
  for (const work of plan.newWorks) {
    const saved = await repository.saveWork(work);
    ids.set(workKey(work), saved.id);
  }
  let entries = 0;
  for (const item of plan.entries) {
    const workId = ids.get(item.workKey);
    if (!workId) continue;
    await repository.saveEntry({ ...item.input, workId });
    entries += 1;
  }
  return {
    works: plan.newWorks.length,
    entries,
    skipped: plan.duplicateEntries,
  };
}
