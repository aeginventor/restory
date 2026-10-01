import {
  validateArchive,
  validateEntryInput,
  validateNickname,
  validateWorkInput,
} from "./domain";
import { createPublicSamples, createSeedArchive, DEMO_USER_ID } from "./seed";
import type { Archive, Entry, RestoryRepository, Work } from "./types";

export const DEMO_STORAGE_KEY = "restory.demo.v1";
export interface StorageLike {
  getItem(key: string): string | null;
  setItem(key: string, value: string): void;
}
const damagedMessage =
  "이 브라우저의 체험 기록을 읽을 수 없습니다. 기존 데이터는 덮어쓰지 않았습니다. 브라우저 개발자 도구의 로컬 저장소에서 restory.demo.v1 값을 복사해 보관한 뒤 체험 데이터를 초기화해 주세요.";

function browserStorage(): StorageLike {
  if (typeof window === "undefined")
    throw new Error("체험 기록은 브라우저에서 사용할 수 있습니다.");
  try {
    return window.localStorage;
  } catch {
    throw new Error(
      "브라우저의 로컬 저장소에 접근할 수 없습니다. 사이트의 저장소 사용을 허용한 뒤 다시 시도해 주세요.",
    );
  }
}

function writeArchive(storage: StorageLike, archive: Archive): void {
  const serialized = JSON.stringify({
    version: 1,
    archive: validateArchive(archive),
  });
  try {
    storage.setItem(DEMO_STORAGE_KEY, serialized);
  } catch {
    throw new Error(
      "브라우저에 저장하지 못했습니다. 저장 공간과 사이트 저장 권한을 확인한 뒤 다시 시도해 주세요. 입력한 내용은 아직 저장되지 않았습니다.",
    );
  }
}

function readArchive(storage: StorageLike): Archive {
  let raw: string | null;
  try {
    raw = storage.getItem(DEMO_STORAGE_KEY);
  } catch {
    throw new Error(
      "브라우저의 체험 기록에 접근하지 못했습니다. 사이트 저장 권한을 확인한 뒤 다시 시도해 주세요.",
    );
  }
  if (raw === null) {
    const seed = createSeedArchive();
    writeArchive(storage, seed);
    return seed;
  }
  try {
    const saved: unknown = JSON.parse(raw);
    if (
      !saved ||
      typeof saved !== "object" ||
      !("version" in saved) ||
      saved.version !== 1 ||
      !("archive" in saved)
    )
      throw new Error("version");
    const archive = validateArchive(saved.archive);
    if (
      archive.profile.id !== DEMO_USER_ID ||
      archive.entries.some((entry) => entry.visibility !== "private")
    )
      throw new Error("demo account");
    return archive;
  } catch {
    throw new Error(damagedMessage);
  }
}

export function resetDemoArchive(storage?: StorageLike): void {
  writeArchive(storage ?? browserStorage(), createSeedArchive());
}

export function createDemoRepository(
  providedStorage?: StorageLike,
): RestoryRepository {
  const storage = () => providedStorage ?? browserStorage();
  return {
    mode: "demo",
    async load() {
      return readArchive(storage());
    },
    async saveWork(input) {
      const validated = validateWorkInput(input);
      const target = storage();
      const archive = readArchive(target);
      const work: Work = {
        ...validated,
        id: crypto.randomUUID(),
        ownerId: archive.profile.id,
        isPublic: false,
        createdAt: new Date().toISOString(),
      };
      writeArchive(target, { ...archive, works: [...archive.works, work] });
      return work;
    },
    async saveEntry(input, id) {
      const validated = validateEntryInput(input);
      const target = storage();
      const archive = readArchive(target);
      if (!archive.works.some((work) => work.id === validated.workId))
        throw new Error(
          "선택한 작품을 찾을 수 없습니다. 작품을 다시 선택해 주세요.",
        );
      const existing = id
        ? archive.entries.find((entry) => entry.id === id)
        : undefined;
      if (id && !existing)
        throw new Error(
          "수정할 감상 기록을 찾을 수 없습니다. 목록을 새로고침해 주세요.",
        );
      const now = new Date().toISOString();
      const entry: Entry = {
        ...validated,
        id: existing?.id ?? crypto.randomUUID(),
        userId: archive.profile.id,
        visibility: "private",
        createdAt: existing?.createdAt ?? now,
        updatedAt: now,
      };
      const entries = existing
        ? archive.entries.map((item) => (item.id === id ? entry : item))
        : [...archive.entries, entry];
      writeArchive(target, { ...archive, entries });
      return entry;
    },
    async deleteEntry(id) {
      const target = storage();
      const archive = readArchive(target);
      if (!archive.entries.some((entry) => entry.id === id))
        throw new Error("삭제할 감상 기록을 찾을 수 없습니다.");
      writeArchive(target, {
        ...archive,
        entries: archive.entries.filter((entry) => entry.id !== id),
      });
    },
    async setVisibility(id, visibility) {
      if (visibility === "public")
        throw new Error(
          "체험 기록은 이 브라우저에만 저장됩니다. 감상을 공개하려면 계정 저장을 연결하고 로그인해 주세요.",
        );
      const entry = readArchive(storage()).entries.find(
        (entry) => entry.id === id,
      );
      if (!entry) throw new Error("감상 기록을 찾을 수 없습니다.");
      return entry;
    },
    async listPublic(workId, page = 0) {
      if (!Number.isInteger(page) || page < 0)
        throw new Error("페이지 번호가 올바르지 않습니다.");
      return createPublicSamples()
        .filter((entry) => !workId || entry.workId === workId)
        .slice(page * 20, (page + 1) * 20);
    },
    async reportEntry() {
      throw new Error(
        "이 목록은 가상의 체험용 예시입니다. 실제 감상 신고는 계정 저장을 연결한 뒤 사용할 수 있습니다.",
      );
    },
    async updateNickname(nickname) {
      const normalized = validateNickname(nickname);
      const target = storage();
      const archive = readArchive(target);
      const profile = { ...archive.profile, nickname: normalized };
      writeArchive(target, { ...archive, profile });
      return profile;
    },
    async deleteAccount() {
      // An explicit empty archive prevents a later visit from unexpectedly restoring samples.
      writeArchive(storage(), {
        works: [],
        entries: [],
        profile: { id: DEMO_USER_ID, nickname: "체험 사용자" },
      });
    },
  };
}
