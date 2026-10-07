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

describe("동시 수정 보호", () => {
  const storage = () => {
    const values = new Map<string, string>();
    return {
      getItem: (key: string) => values.get(key) ?? null,
      setItem: (key: string, value: string) => void values.set(key, value),
    } satisfies StorageLike;
  };

  it("책갈피는 다른 내용을 건드리지 않고 갱신 시각만 올린다", async () => {
    const repository = createDemoRepository(storage());
    const entry = (await repository.load()).entries[0];
    const stale = { ...entry };
    const edited = await repository.saveEntry(
      { ...entry, body: "다른 탭에서 고친 본문" },
      entry.id,
    );
    const marked = await repository.setFavorite(stale.id, !stale.favorite);
    expect(marked.body).toBe("다른 탭에서 고친 본문");
    expect(marked.favorite).toBe(!stale.favorite);
    expect(marked.updatedAt > edited.updatedAt).toBe(true);
    await expect(
      repository.setFavorite("00000000-0000-4000-8000-00000000dead", true),
    ).rejects.toThrow("찾을 수 없습니다");
  });

  it("예전 상태로 저장하면 충돌을 알리고 최신 기록을 보존한다", async () => {
    const repository = createDemoRepository(storage());
    const entry = (await repository.load()).entries[0];
    const latest = await repository.saveEntry(
      { ...entry, summary: "최신 감상" },
      entry.id,
    );
    await expect(
      repository.saveEntry(
        { ...entry, summary: "예전 화면에서 쓴 감상" },
        entry.id,
        entry.updatedAt,
      ),
    ).rejects.toThrow("다른 곳에서 변경");
    const current = (await repository.load()).entries.find(
      (e) => e.id === entry.id,
    );
    expect(current?.summary).toBe("최신 감상");
    const saved = await repository.saveEntry(
      { ...latest, summary: "최신 상태에서 이어 쓴 감상" },
      entry.id,
      latest.updatedAt,
    );
    expect(saved.summary).toBe("최신 상태에서 이어 쓴 감상");
  });

  it("공개 감상 검색은 제목, 창작자, 본문, 태그를 대상으로 하고 작성자 이름은 제외한다", async () => {
    const repository = createDemoRepository(storage());
    const all = await repository.listPublic();
    expect(all.length).toBeGreaterThan(1);
    const first = all[0];
    const byTitle = await repository.listPublic(undefined, 0, first.work.title);
    expect(byTitle.every((e) => e.work.title === first.work.title)).toBe(true);
    expect(byTitle.length).toBeGreaterThan(0);
    expect(await repository.listPublic(undefined, 0, first.authorName)).toEqual(
      [],
    );
    expect(
      await repository.listPublic(undefined, 0, "없는 검색어 zzz"),
    ).toEqual([]);
    expect(
      await repository.listPublic(
        undefined,
        0,
        `  ${first.work.title.toUpperCase()} `,
      ),
    ).toHaveLength(byTitle.length);
  });
});
