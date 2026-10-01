import { describe, expect, it } from "vitest";
import {
  createDemoRepository,
  DEMO_STORAGE_KEY,
  resetDemoArchive,
  type StorageLike,
} from "../src/lib/demo-repository";
import { createSeedArchive } from "../src/lib/seed";

function memoryStorage() {
  const values = new Map<string, string>();
  let failWrite = false;
  return {
    getItem: (key: string) => values.get(key) ?? null,
    setItem(key: string, value: string) {
      if (failWrite) throw new Error("quota exceeded");
      values.set(key, value);
    },
    failWrites() {
      failWrite = true;
    },
  } satisfies StorageLike & { failWrites(): void };
}

describe("브라우저 체험 기록", () => {
  it("재감상을 새 기록으로 저장하고 새 저장소 인스턴스에서 다시 불러온다", async () => {
    const storage = memoryStorage();
    const repository = createDemoRepository(storage);
    const archive = await repository.load();
    const original = archive.entries[0];
    const revisited = await repository.saveEntry({
      ...original,
      summary: "다시 보니 달랐다.",
      experiencedOn: "2026-09-30",
    });
    expect(revisited.id).not.toBe(original.id);
    expect(revisited.visibility).toBe("private");
    const loaded = await createDemoRepository(storage).load();
    expect(loaded.entries).toHaveLength(archive.entries.length + 1);
    expect(loaded.entries.find((entry) => entry.id === original.id)).toEqual(
      original,
    );
    expect(
      loaded.entries.find((entry) => entry.id === revisited.id)?.summary,
    ).toBe("다시 보니 달랐다.");
  });

  it("기존 기록 수정은 ID와 작성일을 보존한다", async () => {
    const repository = createDemoRepository(memoryStorage());
    const archive = await repository.load();
    const original = archive.entries[0];
    const changed = await repository.saveEntry(
      { ...original, summary: "수정한 감상" },
      original.id,
    );
    expect(changed.id).toBe(original.id);
    expect(changed.createdAt).toBe(original.createdAt);
    expect((await repository.load()).entries).toHaveLength(
      archive.entries.length,
    );
  });

  it("저장 실패 후 성공한 것처럼 기존 자료를 바꾸지 않는다", async () => {
    const storage = memoryStorage();
    const repository = createDemoRepository(storage);
    const archive = await repository.load();
    const before = storage.getItem(DEMO_STORAGE_KEY);
    storage.failWrites();
    await expect(
      repository.saveEntry(
        { ...archive.entries[0], summary: "저장되지 않은 감상" },
        archive.entries[0].id,
      ),
    ).rejects.toThrow("저장하지 못했습니다");
    await expect(repository.deleteEntry(archive.entries[0].id)).rejects.toThrow(
      "저장하지 못했습니다",
    );
    await expect(
      repository.updateNickname("저장되지 않은 이름"),
    ).rejects.toThrow("저장하지 못했습니다");
    expect(storage.getItem(DEMO_STORAGE_KEY)).toBe(before);
    expect(await repository.load()).toEqual(archive);
  });

  it.each([
    "{broken",
    JSON.stringify({ version: 99, archive: createSeedArchive() }),
    JSON.stringify({ version: 1, archive: { works: [], entries: [] } }),
  ])("손상되거나 지원하지 않는 저장 데이터를 덮어쓰지 않는다", async (raw) => {
    const storage = memoryStorage();
    storage.setItem(DEMO_STORAGE_KEY, raw);
    const repository = createDemoRepository(storage);
    await expect(repository.load()).rejects.toThrow("덮어쓰지 않았습니다");
    await expect(
      repository.saveWork({
        title: "새 작품",
        creator: "",
        mediaType: "book",
        releaseYear: null,
      }),
    ).rejects.toThrow("덮어쓰지 않았습니다");
    expect(storage.getItem(DEMO_STORAGE_KEY)).toBe(raw);
  });

  it("불러온 객체를 외부에서 수정해도 저장된 자료는 바뀌지 않는다", async () => {
    const repository = createDemoRepository(memoryStorage());
    const archive = await repository.load();
    archive.entries[0].summary = "외부 수정";
    archive.works.pop();
    expect(await repository.load()).toEqual(createSeedArchive());
  });

  it("같은 제목의 다른 작품을 자동으로 합치지 않는다", async () => {
    const repository = createDemoRepository(memoryStorage());
    const input = {
      title: "같은 제목",
      creator: "",
      mediaType: "film" as const,
      releaseYear: null,
    };
    const a = await repository.saveWork(input);
    const b = await repository.saveWork(input);
    expect(a.id).not.toBe(b.id);
    expect(a.isPublic).toBe(false);
  });

  it("체험 기록을 공개하지 않고 공개 목록은 표시된 가상 예시만 반환한다", async () => {
    const repository = createDemoRepository(memoryStorage());
    const archive = await repository.load();
    await expect(
      repository.setVisibility(archive.entries[0].id, "public"),
    ).rejects.toThrow("계정 저장");
    await expect(repository.reportEntry("sample", "신고")).rejects.toThrow(
      "가상의 체험용 예시",
    );
    const samples = await repository.listPublic();
    expect(samples.length).toBeGreaterThan(0);
    expect(
      samples.every((entry) => entry.authorName.startsWith("가상 사용자")),
    ).toBe(true);
    expect(
      samples.every((entry) =>
        archive.entries.every((own) => own.id !== entry.id),
      ),
    ).toBe(true);
    expect(await repository.listPublic(undefined, 1)).toEqual([]);
    expect(await repository.load()).toEqual(archive);
  });

  it("삭제한 체험 기록은 다시 방문해도 자동 복구되지 않는다", async () => {
    const storage = memoryStorage();
    const repository = createDemoRepository(storage);
    await repository.load();
    await repository.deleteAccount();
    const empty = await createDemoRepository(storage).load();
    expect(empty.entries).toEqual([]);
    expect(empty.works).toEqual([]);
    resetDemoArchive(storage);
    expect((await repository.load()).entries).toHaveLength(7);
  });
});
