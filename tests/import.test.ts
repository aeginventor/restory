import { describe, expect, it } from "vitest";
import {
  createDemoRepository,
  type StorageLike,
} from "../src/lib/demo-repository";
import { exportArchive, parseArchiveImport } from "../src/lib/domain";
import { applyImport, planImport } from "../src/lib/import";

function memoryStorage(): StorageLike {
  const values = new Map<string, string>();
  return {
    getItem: (key) => values.get(key) ?? null,
    setItem: (key, value) => void values.set(key, value),
  };
}

describe("기록 파일 가져오기", () => {
  it("restory에서 내보낸 파일만 받아들인다", async () => {
    const repository = createDemoRepository(memoryStorage());
    const archive = await repository.load();
    const exported = exportArchive(archive);
    expect(parseArchiveImport(exported).entries).toHaveLength(
      archive.entries.length,
    );
    expect(() => parseArchiveImport("{not json")).toThrow("JSON");
    expect(() =>
      parseArchiveImport(JSON.stringify({ schema: "other", version: 1 })),
    ).toThrow("restory에서 내보낸");
    expect(() =>
      parseArchiveImport(
        JSON.stringify({ schema: "restory.archive", version: 1, works: [] }),
      ),
    ).toThrow("형식");
  });

  it("삭제한 기록을 내보낸 파일에서 비공개로 복원하고 같은 파일을 두 번 넣어도 늘지 않는다", async () => {
    const repository = createDemoRepository(memoryStorage());
    const original = await repository.load();
    const exported = parseArchiveImport(exportArchive(original));
    await repository.deleteAccount();
    const empty = await repository.load();
    expect(empty.entries).toHaveLength(0);

    const plan = planImport(empty, exported);
    expect(plan.entries).toHaveLength(original.entries.length);
    expect(plan.duplicateEntries).toBe(0);

    const result = await applyImport(repository, empty, exported);
    expect(result.entries).toBe(original.entries.length);
    const restored = await repository.load();
    expect(restored.entries).toHaveLength(original.entries.length);
    expect(restored.entries.every((e) => e.visibility === "private")).toBe(
      true,
    );
    expect(
      restored.entries.map((e) => [
        e.summary,
        e.experiencedOn,
        e.datePrecision,
      ]),
    ).toEqual(
      expect.arrayContaining(
        original.entries.map((e) => [
          e.summary,
          e.experiencedOn,
          e.datePrecision,
        ]),
      ),
    );
    const titles = (a: typeof restored) => a.works.map((w) => w.title).sort();
    expect(titles(restored)).toEqual(
      titles({
        ...original,
        works: original.works.filter((w) =>
          original.entries.some((e) => e.workId === w.id),
        ),
      }),
    );

    const second = await applyImport(repository, restored, exported);
    expect(second).toEqual({
      works: 0,
      entries: 0,
      skipped: original.entries.length,
    });
    expect((await repository.load()).entries).toHaveLength(
      original.entries.length,
    );
  });

  it("같은 작품은 제목, 매체, 창작자, 연도로 맞추고 새 감상만 추가한다", async () => {
    const repository = createDemoRepository(memoryStorage());
    const current = await repository.load();
    const work = current.works[0];
    const imported = parseArchiveImport(
      exportArchive({
        ...current,
        works: [{ ...work, id: "99999999-0000-4000-8000-000000000001" }],
        entries: [
          {
            ...current.entries.find((e) => e.workId === work.id)!,
            id: "99999999-0000-4000-8000-000000000002",
            workId: "99999999-0000-4000-8000-000000000001",
            summary: "다른 기기에서 남긴 새 감상",
            favorite: true,
          },
        ],
      }),
    );
    const plan = planImport(current, imported);
    expect(plan.newWorks).toHaveLength(0);
    expect(plan.matchedWorks).toBe(1);
    const result = await applyImport(repository, current, imported);
    expect(result).toEqual({ works: 0, entries: 1, skipped: 0 });
    const after = await repository.load();
    expect(after.works).toHaveLength(current.works.length);
    const added = after.entries.find(
      (e) => e.summary === "다른 기기에서 남긴 새 감상",
    );
    expect(added?.workId).toBe(work.id);
    expect(added?.favorite).toBe(true);
    expect(added?.visibility).toBe("private");
  });
});
