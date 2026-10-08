export const MEDIA_TYPES = [
  "film",
  "series",
  "animation",
  "book",
  "comic",
  "game",
  "other",
] as const;
export type MediaType = (typeof MEDIA_TYPES)[number];
export const MEDIA_LABELS: Record<MediaType, string> = {
  film: "영화",
  series: "드라마",
  animation: "애니메이션",
  book: "책",
  comic: "웹툰 / 만화",
  game: "게임",
  other: "기타",
};
export type DatePrecision = "day" | "month" | "year" | "unknown";
export type Visibility = "private" | "public";
export interface Work {
  id: string;
  title: string;
  mediaType: MediaType;
  creator: string;
  releaseYear: number | null;
  ownerId: string | null;
  isPublic: boolean;
  createdAt: string;
}
export interface Entry {
  id: string;
  workId: string;
  userId: string;
  experiencedOn: string | null;
  datePrecision: DatePrecision;
  summary: string;
  body: string;
  tags: string[];
  favorite: boolean;
  visibility: Visibility;
  spoiler: boolean;
  createdAt: string;
  updatedAt: string;
}
export interface Profile {
  id: string;
  nickname: string;
}
export interface PublicEntry extends Entry {
  authorName: string;
  work: Work;
}
export interface Archive {
  works: Work[];
  entries: Entry[];
  profile: Profile;
}
export interface EntryInput {
  workId: string;
  experiencedOn: string | null;
  datePrecision: DatePrecision;
  summary: string;
  body: string;
  tags: string[];
  favorite: boolean;
  spoiler: boolean;
}
export interface WorkInput {
  title: string;
  mediaType: MediaType;
  creator: string;
  releaseYear: number | null;
}
export interface RestoryRepository {
  mode: "demo" | "cloud";
  load(): Promise<Archive>;
  saveWork(input: WorkInput): Promise<Work>;
  saveEntry(
    input: EntryInput,
    id?: string,
    expectedUpdatedAt?: string,
  ): Promise<Entry>;
  setFavorite(id: string, favorite: boolean): Promise<Entry>;
  deleteEntry(id: string): Promise<void>;
  setVisibility(
    id: string,
    visibility: Visibility,
    catalogWorkId?: string,
  ): Promise<Entry>;
  listPublic(
    workId?: string,
    page?: number,
    query?: string,
  ): Promise<PublicEntry[]>;
  reportEntry(id: string, reason: string): Promise<void>;
  updateNickname(nickname: string): Promise<Profile>;
  deleteAccount(): Promise<void>;
}
