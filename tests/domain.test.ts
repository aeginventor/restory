import { describe, expect, it } from "vitest";
import {
  dateYear,
  exportArchive,
  filterEntries,
  formatExperiencedDate,
  isValidExperiencedDate,
  sortEntries,
  validateArchive,
  validateEntryInput,
  validateWorkInput,
} from "../src/lib/domain";
import { createSeedArchive } from "../src/lib/seed";

describe("감상한 시점", () => {
  it("연도와 연월에 존재하지 않는 날짜를 붙이지 않는다", () => {
    expect(formatExperiencedDate("2025", "year")).toBe("2025년");
    expect(formatExperiencedDate("2025-04", "month")).toBe("2025년 4월");
    expect(formatExperiencedDate("2024-02-29", "day")).toBe("2024년 2월 29일");
    expect(formatExperiencedDate(null, "unknown")).toBe("시점 모름");
    expect(
      dateYear({ experiencedOn: null, datePrecision: "unknown" }),
    ).toBeNull();
  });

  it.each([
    ["2025-02-29", "day"],
    ["2024-02-30", "day"],
    ["2026-13", "month"],
    ["2026-01-01", "year"],
    ["2026", "day"],
    ["0000", "year"],
    ["2026", "unknown"],
    [null, "year"],
  ] as const)("잘못된 시점 %s (%s)을 거부한다", (value, precision) => {
    expect(isValidExperiencedDate(value, precision)).toBe(false);
  });

  it("윤년과 월별 일수를 검증한다", () => {
    expect(isValidExperiencedDate("2000-02-29", "day")).toBe(true);
    expect(isValidExperiencedDate("1900-02-29", "day")).toBe(false);
    expect(isValidExperiencedDate("2026-04-31", "day")).toBe(false);
    expect(isValidExperiencedDate("2026-04-30", "day")).toBe(true);
  });

  it("작성일 대신 감상 시점으로 정렬하고 모름을 마지막에 둔다", () => {
    const { entries } = createSeedArchive();
    const first = { ...entries[0], createdAt: "2020-01-01T00:00:00.000Z" };
    const unknown = { ...entries[6], createdAt: "2099-01-01T00:00:00.000Z" };
    const original = [unknown, entries[4], first, entries[3]];
    expect(sortEntries(original).map((entry) => entry.id)).toEqual([
      first.id,
      entries[3].id,
      entries[4].id,
      unknown.id,
    ]);
    expect(original[0]).toBe(unknown);
  });
});

describe("기록 검증과 탐색", () => {
  it("작품 제목을 정리하고 태그 중복을 제거한다", () => {
    const { entries } = createSeedArchive();
    expect(
      validateEntryInput({
        ...entries[0],
        summary: "  감상  ",
        tags: ["여운", " 여운 "],
      }).tags,
    ).toEqual(["여운"]);
    expect(
      validateWorkInput({
        title: "  같은 제목  ",
        mediaType: "film",
        creator: "",
        releaseYear: null,
      }).title,
    ).toBe("같은 제목");
    expect(() =>
      validateWorkInput({
        title: " ",
        mediaType: "film",
        creator: "",
        releaseYear: null,
      }),
    ).toThrow();
    expect(() =>
      validateEntryInput({ ...entries[0], experiencedOn: "2026-02-31" }),
    ).toThrow("감상한 시점");
  });

  it("제목, 매체, 감상 연도, 태그, 즐겨찾기를 함께 검색한다", () => {
    const archive = createSeedArchive();
    expect(
      filterEntries(archive.entries, archive.works, {
        query: "괴물",
        mediaType: "film",
        year: "2026",
        tag: "여운",
        favoritesOnly: true,
      }).map((entry) => entry.id),
    ).toEqual([archive.entries[2].id]);
    expect(
      filterEntries(archive.entries, archive.works, { year: "unknown" }).map(
        (entry) => entry.id,
      ),
    ).toEqual([archive.entries[6].id]);
    expect(
      filterEntries(archive.entries, archive.works, { query: "outer WILDS" }),
    ).toHaveLength(1);
  });

  it("스키마 버전과 부분 날짜를 포함한 독립적인 JSON을 내보낸다", () => {
    const archive = createSeedArchive();
    const exported = JSON.parse(exportArchive(archive));
    expect(exported.schema).toBe("restory.archive");
    expect(exported.version).toBe(1);
    expect(
      exported.entries.find(
        (entry: { datePrecision: string }) => entry.datePrecision === "year",
      ).experiencedOn,
    ).toBe("2026");
    expect(
      exported.entries.find(
        (entry: { datePrecision: string }) => entry.datePrecision === "unknown",
      ).experiencedOn,
    ).toBeNull();
    expect(exported.works).toHaveLength(6);
    expect(exported.entries).toHaveLength(7);
  });

  it("중복 ID와 연결이 끊어진 기록을 손상된 자료로 취급한다", () => {
    const archive = createSeedArchive();
    expect(() =>
      validateArchive({
        ...archive,
        entries: [...archive.entries, archive.entries[0]],
      }),
    ).toThrow();
    expect(() => validateArchive({ ...archive, works: [] })).toThrow();
  });
});
