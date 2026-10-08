import { z } from "zod";
import {
  MEDIA_TYPES,
  type Archive,
  type DatePrecision,
  type Entry,
  type EntryInput,
  type MediaType,
  type Work,
  type WorkInput,
} from "./types";

const precisionSchema = z.enum(["day", "month", "year", "unknown"]);
const uuid = z.string().uuid();

export function isValidExperiencedDate(
  value: string | null,
  precision: DatePrecision,
): boolean {
  if (precision === "unknown") return value === null;
  if (!value) return false;
  const pattern =
    precision === "year"
      ? /^\d{4}$/
      : precision === "month"
        ? /^\d{4}-\d{2}$/
        : /^\d{4}-\d{2}-\d{2}$/;
  if (!pattern.test(value)) return false;
  const [year, month, day] = value.split("-").map(Number);
  if (year < 1 || year > 9999) return false;
  if (precision === "year") return true;
  if (month < 1 || month > 12) return false;
  if (precision === "month") return true;
  const leap = year % 4 === 0 && (year % 100 !== 0 || year % 400 === 0);
  const days = [31, leap ? 29 : 28, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31];
  return day >= 1 && day <= days[month - 1];
}

const workInputSchema = z.object({
  title: z.string().trim().min(1).max(200),
  mediaType: z.enum(MEDIA_TYPES),
  creator: z.string().trim().max(150),
  releaseYear: z.number().int().min(1).max(9999).nullable(),
});
const entryInputSchema = z
  .object({
    workId: uuid,
    experiencedOn: z.string().nullable(),
    datePrecision: precisionSchema,
    summary: z.string().trim().max(240),
    body: z.string().max(20000),
    tags: z.array(z.string().trim().min(1).max(20)).max(5),
    favorite: z.boolean(),
    spoiler: z.boolean(),
  })
  .refine(
    (entry) => isValidExperiencedDate(entry.experiencedOn, entry.datePrecision),
    { message: "감상한 시점의 형식을 확인해 주세요.", path: ["experiencedOn"] },
  );

export function validateWorkInput(input: unknown): WorkInput {
  const result = workInputSchema.safeParse(input);
  if (!result.success)
    throw new Error(
      "작품 제목(1~200자), 매체, 창작자(150자 이하), 발표 연도를 확인해 주세요.",
    );
  return result.data;
}

export function validateEntryInput(input: unknown): EntryInput {
  const result = entryInputSchema.safeParse(input);
  if (!result.success) {
    if (
      result.error.issues.some((issue) => issue.path[0] === "experiencedOn")
    ) {
      throw new Error(
        "감상한 시점을 확인해 주세요. 날짜는 YYYY-MM-DD, 연월은 YYYY-MM, 연도는 YYYY로 입력하고, 모름은 비워 두세요.",
      );
    }
    throw new Error(
      "감상 내용을 확인해 주세요. 한 줄 감상은 240자, 본문은 20,000자, 태그는 각각 20자 이하로 5개까지 입력할 수 있습니다.",
    );
  }
  return { ...result.data, tags: [...new Set(result.data.tags)] };
}

export function validateNickname(input: unknown): string {
  const result = z.string().trim().min(1).max(40).safeParse(input);
  if (!result.success) throw new Error("닉네임을 1~40자로 입력해 주세요.");
  return result.data;
}

const timestamp = z.string().datetime({ offset: true });
const workSchema = workInputSchema.extend({
  id: uuid,
  ownerId: uuid.nullable(),
  isPublic: z.boolean(),
  createdAt: timestamp,
});
const entrySchema = z
  .object({
    id: uuid,
    workId: uuid,
    userId: uuid,
    experiencedOn: z.string().nullable(),
    datePrecision: precisionSchema,
    summary: z.string().max(240),
    body: z.string().max(20000),
    tags: z.array(z.string().min(1).max(20)).max(5),
    favorite: z.boolean(),
    spoiler: z.boolean(),
    visibility: z.enum(["private", "public"]),
    createdAt: timestamp,
    updatedAt: timestamp,
  })
  .refine((entry) =>
    isValidExperiencedDate(entry.experiencedOn, entry.datePrecision),
  );
const archiveSchema = z.object({
  works: z.array(workSchema),
  entries: z.array(entrySchema),
  profile: z.object({ id: uuid, nickname: z.string().trim().min(1).max(40) }),
});

export function validateArchive(input: unknown): Archive {
  const result = archiveSchema.safeParse(input);
  if (!result.success)
    throw new Error("저장된 기록의 형식이 올바르지 않습니다.");
  const archive = result.data;
  const workIds = new Set(archive.works.map((work) => work.id));
  const entryIds = new Set(archive.entries.map((entry) => entry.id));
  if (
    workIds.size !== archive.works.length ||
    entryIds.size !== archive.entries.length ||
    archive.entries.some(
      (entry) =>
        !workIds.has(entry.workId) || entry.userId !== archive.profile.id,
    ) ||
    archive.works.some(
      (work) =>
        work.ownerId !== archive.profile.id &&
        !(work.ownerId === null && work.isPublic),
    )
  ) {
    throw new Error("저장된 작품과 감상 기록의 연결을 확인할 수 없습니다.");
  }
  return archive;
}

export function parseArchiveImport(text: string): Archive {
  let parsed: unknown;
  try {
    parsed = JSON.parse(text);
  } catch {
    throw new Error(
      "JSON 파일을 읽을 수 없습니다. restory에서 내보낸 파일인지 확인해 주세요.",
    );
  }
  if (
    !parsed ||
    typeof parsed !== "object" ||
    (parsed as { schema?: unknown }).schema !== "restory.archive" ||
    (parsed as { version?: unknown }).version !== 1
  )
    throw new Error(
      "restory에서 내보낸 기록 파일만 가져올 수 있습니다. 파일의 schema와 version을 확인해 주세요.",
    );
  return validateArchive(parsed);
}

export function formatExperiencedDate(
  value: string | null,
  precision: DatePrecision,
): string {
  if (precision === "unknown" || !value) return "시점 모름";
  if (!isValidExperiencedDate(value, precision)) return "날짜 확인 필요";
  const [year, month, day] = value.split("-").map(Number);
  if (precision === "year") return `${year}년`;
  if (precision === "month") return `${year}년 ${month}월`;
  return `${year}년 ${month}월 ${day}일`;
}

export function dateYear(
  entry: Pick<Entry, "experiencedOn" | "datePrecision">,
): string | null {
  return entry.datePrecision === "unknown" || !entry.experiencedOn
    ? null
    : entry.experiencedOn.slice(0, 4);
}

export function sortEntries(entries: Entry[]): Entry[] {
  return [...entries].sort((left, right) => {
    const a = left.datePrecision === "unknown" ? null : left.experiencedOn;
    const b = right.datePrecision === "unknown" ? null : right.experiencedOn;
    if (a === null && b !== null) return 1;
    if (a !== null && b === null) return -1;
    // Lexical sorting preserves partial precision. No invented month/day is stored or displayed.
    if (a !== b) return (b ?? "").localeCompare(a ?? "");
    return right.createdAt.localeCompare(left.createdAt);
  });
}

export interface EntryFilters {
  query?: string;
  mediaType?: MediaType | "all" | "";
  year?: string | number;
  tag?: string;
  favoritesOnly?: boolean;
}

export function filterEntries(
  entries: Entry[],
  works: Work[],
  filters: EntryFilters = {},
): Entry[] {
  const lookup = new Map(works.map((work) => [work.id, work]));
  const query = filters.query?.trim().toLocaleLowerCase("ko-KR");
  return sortEntries(
    entries.filter((entry) => {
      const work = lookup.get(entry.workId);
      if (!work) return false;
      if (
        filters.mediaType &&
        filters.mediaType !== "all" &&
        work.mediaType !== filters.mediaType
      )
        return false;
      if (
        filters.year &&
        filters.year !== "all" &&
        (filters.year === "unknown"
          ? entry.datePrecision !== "unknown"
          : dateYear(entry) !== String(filters.year))
      )
        return false;
      if (filters.tag && !entry.tags.includes(filters.tag)) return false;
      if (filters.favoritesOnly && !entry.favorite) return false;
      return (
        !query ||
        [work.title, work.creator, entry.summary, entry.body, ...entry.tags]
          .join(" ")
          .toLocaleLowerCase("ko-KR")
          .includes(query)
      );
    }),
  );
}

export function exportArchive(archive: Archive): string {
  return JSON.stringify(
    {
      schema: "restory.archive",
      version: 1,
      exportedAt: new Date().toISOString(),
      ...validateArchive(archive),
    },
    null,
    2,
  );
}
