import { getSupabaseBrowserClient } from "./supabase";
import {
  validateEntryInput,
  validateNickname,
  validateWorkInput,
} from "./domain";
import type {
  Archive,
  Entry,
  EntryInput,
  Profile,
  PublicEntry,
  RestoryRepository,
  Work,
  WorkInput,
} from "./types";

type WorkRow = {
  id: string;
  title: string;
  media_type: Work["mediaType"];
  creator: string;
  release_year: number | null;
  owner_id: string | null;
  is_public: boolean;
  created_at: string;
};
type EntryRow = {
  id: string;
  work_id: string;
  user_id: string;
  experienced_on: string | null;
  date_precision: Entry["datePrecision"];
  summary: string;
  body: string;
  tags: string[];
  favorite: boolean;
  visibility: Entry["visibility"];
  spoiler: boolean;
  created_at: string;
  updated_at: string;
};
type PublicRow = Omit<EntryRow, "user_id"> & {
  author_name: string;
  work: WorkRow;
};

function client() {
  const supabase = getSupabaseBrowserClient();
  if (!supabase) throw new Error("아직 온라인 저장소가 연결되지 않았습니다.");
  return supabase;
}

function fail(error: { code?: string; message: string } | null) {
  if (!error) return;
  if (error.code === "42501" || error.code === "PGRST301")
    throw new Error(
      "접근 권한이 없거나 로그인이 만료되었습니다. 다시 로그인해 주세요.",
    );
  if (error.code === "23514" || error.code === "22023")
    throw new Error("입력 형식과 글자 수를 확인해 주세요.");
  if (error.code === "PGRST116" || error.code === "P0002")
    throw new Error("기록을 찾을 수 없거나 접근할 수 없습니다.");
  throw new Error(
    "요청을 처리하지 못했습니다. 연결 상태를 확인하고 다시 시도해 주세요.",
  );
}

function workFromRow(row: WorkRow): Work {
  return {
    id: row.id,
    title: row.title,
    mediaType: row.media_type,
    creator: row.creator,
    releaseYear: row.release_year,
    ownerId: row.owner_id,
    isPublic: row.is_public,
    createdAt: row.created_at,
  };
}
function entryFromRow(row: EntryRow): Entry {
  return {
    id: row.id,
    workId: row.work_id,
    userId: row.user_id,
    experiencedOn: row.experienced_on,
    datePrecision: row.date_precision,
    summary: row.summary,
    body: row.body,
    tags: row.tags,
    favorite: row.favorite,
    visibility: row.visibility,
    spoiler: row.spoiler,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}
function entryPayload(input: EntryInput) {
  return {
    work_id: input.workId,
    experienced_on: input.experiencedOn,
    date_precision: input.datePrecision,
    summary: input.summary.trim(),
    body: input.body,
    tags: [...new Set(input.tags.map((tag) => tag.trim()).filter(Boolean))],
    favorite: input.favorite,
    spoiler: input.spoiler,
  };
}

// Supabase caps each response. Page through personal archives so exports do not
// silently lose older records once someone has logged more than 1,000 entries.
async function archiveRows(table: "works" | "entries", userId?: string) {
  const rows: Record<string, unknown>[] = [];
  for (let offset = 0; ; offset += 500) {
    let query = client()
      .from(table)
      .select("*")
      .order("created_at", { ascending: false })
      .order("id")
      .range(offset, offset + 499);
    if (userId) query = query.eq("user_id", userId);
    const { data, error } = await query;
    fail(error);
    rows.push(...(data ?? []));
    if (!data || data.length < 500) return rows;
  }
}

export function createCloudRepository(userId: string): RestoryRepository {
  return {
    mode: "cloud",
    async load(): Promise<Archive> {
      const db = client();
      const [works, entries, profile] = await Promise.all([
        // RLS includes the current user's private works and the published catalogue.
        archiveRows("works"),
        archiveRows("entries", userId),
        db.from("profiles").select("id,nickname").eq("id", userId).single(),
      ]);
      fail(profile.error);
      return {
        works: (works as WorkRow[]).map(workFromRow),
        entries: (entries as EntryRow[]).map(entryFromRow),
        profile: profile.data as Profile,
      };
    },
    async saveWork(input: WorkInput) {
      input = validateWorkInput(input);
      const { data, error } = await client()
        .from("works")
        .insert({
          title: input.title.trim(),
          media_type: input.mediaType,
          creator: input.creator.trim(),
          release_year: input.releaseYear,
          owner_id: userId,
        })
        .select()
        .single();
      fail(error);
      return workFromRow(data as WorkRow);
    },
    async saveEntry(input, id, expectedUpdatedAt) {
      input = validateEntryInput(input);
      const db = client();
      if (id) {
        let query = db
          .from("entries")
          .update(entryPayload(input))
          .eq("id", id)
          .eq("user_id", userId);
        if (expectedUpdatedAt)
          query = query.eq("updated_at", expectedUpdatedAt);
        const { data, error } = await query.select().maybeSingle();
        fail(error);
        if (!data)
          throw new Error(
            expectedUpdatedAt
              ? "기록이 다른 곳에서 변경되었거나 삭제되었습니다. 입력한 내용을 복사해 보관한 뒤 최신 기록을 다시 열어 주세요."
              : "기록을 찾을 수 없거나 접근할 수 없습니다.",
          );
        return entryFromRow(data as EntryRow);
      }
      const result = await db
        .from("entries")
        .insert({ ...entryPayload(input), user_id: userId })
        .select()
        .single();
      fail(result.error);
      return entryFromRow(result.data as EntryRow);
    },
    async setFavorite(id, favorite) {
      if (typeof favorite !== "boolean")
        throw new Error("책갈피 설정을 확인해 주세요.");
      const { data, error } = await client()
        .from("entries")
        .update({ favorite })
        .eq("id", id)
        .eq("user_id", userId)
        .select()
        .single();
      fail(error);
      return entryFromRow(data as EntryRow);
    },
    async deleteEntry(id) {
      const { data, error } = await client()
        .from("entries")
        .delete()
        .eq("id", id)
        .eq("user_id", userId)
        .select("id")
        .single();
      fail(error);
      if (!data) throw new Error("기록을 찾을 수 없습니다.");
    },
    async setVisibility(id, visibility, catalogWorkId) {
      const { data, error } = await client().rpc("set_entry_visibility", {
        p_entry_id: id,
        p_visibility: visibility,
        p_catalog_work_id: catalogWorkId ?? null,
      });
      fail(error);
      return entryFromRow(data as EntryRow);
    },
    async listPublic(workId, page = 0, query = "") {
      return listPublicEntries(workId, page, query);
    },
    async reportEntry(id, reason) {
      const { error } = await client().rpc("report_entry", {
        p_entry_id: id,
        p_reason: reason.trim(),
      });
      fail(error);
    },
    async updateNickname(nickname) {
      const { data, error } = await client()
        .from("profiles")
        .update({ nickname: validateNickname(nickname) })
        .eq("id", userId)
        .select("id,nickname")
        .single();
      fail(error);
      return data as Profile;
    },
    async deleteAccount() {
      const db = client();
      const { error } = await db.rpc("delete_my_account");
      fail(error);
      // Clear the local refresh token after the database has removed the account.
      await db.auth.signOut({ scope: "local" });
    },
  };
}

/** Does not require a session; the RPC returns only explicitly published fields. */
export async function listPublicEntries(
  workId?: string,
  page = 0,
  query = "",
): Promise<PublicEntry[]> {
  const { data, error } = await client().rpc("list_public_entries", {
    p_work_id: workId ?? null,
    p_page: Math.max(0, Math.trunc(page)),
    p_query: query.trim().slice(0, 200),
  });
  fail(error);
  return ((data ?? []) as PublicRow[]).map((row) => ({
    ...entryFromRow({ ...row, user_id: "" }),
    authorName: row.author_name,
    work: workFromRow(row.work),
  }));
}

export async function getPublicEntry(id: string): Promise<PublicEntry | null> {
  const { data, error } = await client().rpc("get_public_entry", {
    p_entry_id: id,
  });
  fail(error);
  if (!data) return null;
  const row = data as PublicRow;
  return {
    ...entryFromRow({ ...row, user_id: "" }),
    authorName: row.author_name,
    work: workFromRow(row.work),
  };
}

export interface ModerationReport {
  id: string;
  entryId: string;
  reason: string;
  createdAt: string;
  status: "open" | "resolved";
  summary: string;
  body: string;
  authorName: string;
  hidden: boolean;
}

export async function isCurrentUserAdmin(): Promise<boolean> {
  const { data, error } = await client().rpc("is_current_user_admin");
  fail(error);
  return data === true;
}
export async function listModerationReports(): Promise<ModerationReport[]> {
  const { data, error } = await client().rpc("list_moderation_reports");
  fail(error);
  return (data ?? []) as ModerationReport[];
}
export async function moderateEntry(
  entryId: string,
  hidden: boolean,
): Promise<void> {
  const { error } = await client().rpc("moderate_entry", {
    p_entry_id: entryId,
    p_hidden: hidden,
  });
  fail(error);
}
