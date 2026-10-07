"use client";
import { useCallback, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import {
  BookOpen,
  Plus,
  Search,
  SlidersHorizontal,
  Bookmark,
  History,
  Compass,
  Download,
  Settings,
  LogOut,
  PenLine,
  Trash2,
  Globe2,
  LockKeyhole,
  MessageSquare,
  Flag,
  Check,
  X,
  RotateCcw,
  Shield,
  ExternalLink,
  Upload,
  ArrowLeft,
} from "lucide-react";
import type {
  Archive,
  Entry,
  MediaType,
  PublicEntry,
  RestoryRepository,
  Work,
} from "@/lib/types";
import { MEDIA_LABELS, MEDIA_TYPES } from "@/lib/types";
import {
  createDemoRepository,
  DEMO_DAMAGED_MESSAGE,
  readRawDemoArchive,
  resetDemoArchive,
} from "@/lib/demo-repository";
import { clearDraft, clearUserDrafts, draftKey } from "@/lib/drafts";
import {
  applyImport,
  planImport,
  type ImportPlan,
  type ImportResult,
} from "@/lib/import";
import {
  dateYear,
  exportArchive,
  filterEntries,
  formatExperiencedDate,
  parseArchiveImport,
  sortEntries,
} from "@/lib/domain";
import { getSupabaseBrowserClient, isSupabaseConfigured } from "@/lib/supabase";
import {
  createCloudRepository,
  listPublicEntries,
  isCurrentUserAdmin,
  listModerationReports,
  moderateEntry,
  type ModerationReport,
} from "@/lib/cloud-repository";
import { Modal } from "./modal";
import { EntryForm } from "./entry-form";
import { AuthForm } from "./auth-form";
import { WorkMark } from "./work-mark";
type View = "archive" | "reflect" | "explore";
type Compose = { entry?: Entry; work?: Work };
const message = (e: unknown) =>
  e instanceof Error
    ? e.message
    : "처리하지 못했어요. 잠시 후 다시 시도해 주세요.";
export function RestoryApp({ initialWorkId }: { initialWorkId?: string }) {
  const [identity, setIdentity] = useState<{
    id: string | null;
    ready: boolean;
    recovery: boolean;
  }>({ id: null, ready: false, recovery: false });
  useEffect(() => {
    const client = getSupabaseBrowserClient();
    if (!client) {
      queueMicrotask(() =>
        setIdentity({ id: null, ready: true, recovery: false }),
      );
      return;
    }
    let active = true;
    let observed = false;
    const {
      data: { subscription },
    } = client.auth.onAuthStateChange((event, session) => {
      observed = true;
      if (!active) return;
      setIdentity({
        id: session?.user.id || null,
        ready: true,
        recovery: event === "PASSWORD_RECOVERY",
      });
    });
    client.auth
      .getSession()
      .then(({ data }) => {
        if (active && !observed)
          setIdentity({
            id: data.session?.user.id || null,
            ready: true,
            recovery: false,
          });
      })
      .catch(() => {
        if (active && !observed)
          setIdentity({ id: null, ready: true, recovery: false });
      });
    return () => {
      active = false;
      subscription.unsubscribe();
    };
  }, []);
  if (!identity.ready)
    return (
      <main className="standalone">
        <span className="brand">restory.</span>
        <p role="status">아카이브를 불러오고 있어요.</p>
      </main>
    );
  // Identity is a component boundary. Old private state and open editors are
  // discarded in the same render as an account change, including cross-tab logout.
  return (
    <RestorySession
      key={`${identity.id || "demo"}:${identity.recovery}`}
      userId={identity.id}
      initialWorkId={initialWorkId}
      initialRecovery={identity.recovery}
    />
  );
}
function RestorySession({
  userId,
  initialWorkId,
  initialRecovery,
}: {
  userId: string | null;
  initialWorkId?: string;
  initialRecovery: boolean;
}) {
  const [archive, setArchive] = useState<Archive | null>(null);
  const [error, setError] = useState("");
  const [toast, setToast] = useState("");
  const [view, setView] = useState<View>("archive");
  const [query, setQuery] = useState("");
  const [publicQuery, setPublicQuery] = useState("");
  const [media, setMedia] = useState<MediaType | "all">("all");
  const [year, setYear] = useState("all");
  const [tag, setTag] = useState("");
  const [favorites, setFavorites] = useState(false);
  const [filters, setFilters] = useState(false);
  const [compose, setCompose] = useState<Compose | null>(null);
  const [dirty, setDirty] = useState(false);
  const [detail, setDetail] = useState<Work | null>(null);
  const [settings, setSettings] = useState(false);
  const [auth, setAuth] = useState(initialRecovery);
  const [recovery, setRecovery] = useState(initialRecovery);
  const [publicEntries, setPublicEntries] = useState<PublicEntry[]>([]);
  const [publicError, setPublicError] = useState("");
  const [publicPage, setPublicPage] = useState(0);
  const [hasMore, setHasMore] = useState(false);
  const [publicBusy, setPublicBusy] = useState(false);
  const [publicSearch, setPublicSearch] = useState("");
  const [publicWork, setPublicWork] = useState<string | null>(null);
  const [publish, setPublish] = useState<Entry | null>(null);
  const [report, setReport] = useState<PublicEntry | null>(null);
  const [admin, setAdmin] = useState(false);
  const [moderation, setModeration] = useState(false);
  const repo = useMemo<RestoryRepository>(
    () => (userId ? createCloudRepository(userId) : createDemoRepository()),
    [userId],
  );
  const configured = isSupabaseConfigured();
  useEffect(() => {
    if (new URLSearchParams(location.search).get("recovery") === "1") {
      queueMicrotask(() => {
        setRecovery(true);
        setAuth(true);
      });
      history.replaceState(null, "", "/");
    }
  }, []);
  const reload = useCallback(async () => {
    setError("");
    const result = await repo.load();
    setArchive(result);
    return result;
  }, [repo]);
  useEffect(() => {
    let active = true;
    repo
      .load()
      .then((value) => {
        if (active) {
          setArchive(value);
          setError("");
          if (initialWorkId) {
            const own = value.works.find((w) => w.id === initialWorkId);
            setDetail(own || null);
            // An unknown ID may be a public catalogue work, for example from a shared link.
            if (!own) {
              setPublicWork(initialWorkId);
              setView("explore");
            }
          }
        }
      })
      .catch((e) => {
        if (active) {
          setError(message(e));
          setArchive(null);
        }
      });
    return () => {
      active = false;
    };
  }, [repo, initialWorkId]);
  useEffect(() => {
    let active = true;
    if (!userId) {
      queueMicrotask(() => setAdmin(false));
      return;
    }
    isCurrentUserAdmin()
      .then((value) => {
        if (active) setAdmin(value);
      })
      .catch(() => {
        if (active) setAdmin(false);
      });
    return () => {
      active = false;
    };
  }, [userId]);
  useEffect(() => {
    if (!toast) return;
    const timer = setTimeout(() => setToast(""), 5000);
    return () => clearTimeout(timer);
  }, [toast]);
  const loadPublic = useCallback(
    async (page = 0) => {
      setPublicBusy(true);
      setPublicError("");
      try {
        // Search runs on the server (or the full sample list) so results are not limited
        // to the entries already loaded in this page.
        const items = configured
          ? await listPublicEntries(undefined, page, publicSearch)
          : await repo.listPublic(undefined, page, publicSearch);
        setPublicEntries((prev) => (page === 0 ? items : [...prev, ...items]));
        setPublicPage(page);
        setHasMore(items.length === 20);
      } catch (e) {
        setPublicError(message(e));
      } finally {
        setPublicBusy(false);
      }
    },
    [configured, repo, publicSearch],
  );
  useEffect(() => {
    const timer = setTimeout(() => setPublicSearch(publicQuery.trim()), 300);
    return () => clearTimeout(timer);
  }, [publicQuery]);
  useEffect(() => {
    if (view === "explore" && !publicWork)
      queueMicrotask(() => void loadPublic());
  }, [view, publicWork, loadPublic]);
  function openPublicWork(id: string) {
    setPublicWork(id);
    setView("explore");
    history.pushState(null, "", `/works/${id}`);
  }
  function closePublicWork() {
    setPublicWork(null);
    history.pushState(null, "", "/");
  }
  const entries = archive?.entries || [];
  const works = archive?.works || [];
  const visible = filterEntries(entries, works, {
    query,
    mediaType: media,
    year: year === "all" ? undefined : year,
    tag: tag || undefined,
    favoritesOnly: favorites,
  });
  const years = [
    ...new Set(entries.map(dateYear).filter((y): y is string => !!y)),
  ]
    .sort()
    .reverse();
  const tags = [...new Set(entries.flatMap((e) => e.tags))];
  const uniqueWorks = new Set(entries.map((e) => e.workId)).size;
  const filtered =
    !!query || media !== "all" || year !== "all" || !!tag || favorites;
  const clearFilters = () => {
    setQuery("");
    setMedia("all");
    setYear("all");
    setTag("");
    setFavorites(false);
  };
  const startCompose = (value: Compose = {}) => {
    setDetail(null);
    setDirty(false);
    setCompose(value);
  };
  const composeDraftKey = draftKey(userId, compose?.entry?.id);
  const closeCompose = () => {
    if (
      dirty &&
      !confirm("작성 중인 내용을 닫을까요? 저장하지 않은 내용은 사라져요.")
    )
      return;
    if (dirty) clearDraft(composeDraftKey);
    setCompose(null);
    setDirty(false);
  };
  async function saved() {
    setCompose(null);
    setDirty(false);
    try {
      await reload();
      setToast("기록을 저장했어요.");
    } catch (e) {
      setError(message(e));
      setToast(
        "기록은 저장했지만 목록을 새로 불러오지 못했어요. 다시 불러오기를 눌러주세요.",
      );
    }
  }
  async function remove(entry: Entry) {
    if (!confirm("이 감상 기록을 삭제할까요? 삭제한 기록은 되돌릴 수 없어요."))
      return;
    try {
      await repo.deleteEntry(entry.id);
      await reload();
      setToast("기록을 삭제했어요.");
    } catch (e) {
      setToast(message(e));
    }
  }
  async function favoriteEntry(entry: Entry) {
    try {
      // Only the bookmark changes. Text edited in another tab is never overwritten here.
      await repo.setFavorite(entry.id, !entry.favorite);
      await reload();
    } catch (e) {
      setToast(message(e));
    }
  }
  async function visibility(entry: Entry) {
    if (entry.visibility === "private") {
      if (repo.mode === "demo") {
        setAuth(true);
        return;
      }
      setDetail(null);
      setPublish(entry);
      return;
    }
    try {
      await repo.setVisibility(entry.id, "private");
      await reload();
      setToast("기록을 비공개로 바꿨어요.");
    } catch (e) {
      setToast(message(e));
    }
  }
  function download() {
    if (!archive) return;
    try {
      const blob = new Blob([exportArchive(archive)], {
        type: "application/json;charset=utf-8",
      });
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `restory-${new Date().toISOString().slice(0, 10)}.json`;
      a.click();
      setTimeout(() => URL.revokeObjectURL(url), 1000);
      setToast("기록을 파일로 내보냈어요.");
    } catch (e) {
      setToast(message(e));
    }
  }
  function downloadRawDemo() {
    const raw = readRawDemoArchive();
    if (raw === null) {
      setToast("내려받을 체험 원본이 없어요.");
      return;
    }
    const blob = new Blob([raw], { type: "text/plain;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `restory-demo-original-${new Date().toISOString().slice(0, 10)}.txt`;
    a.click();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
    setToast("읽을 수 없는 원본을 파일로 저장했어요.");
  }
  async function resetDemo() {
    if (
      !confirm(
        "이 브라우저의 체험 기록을 예시 상태로 되돌릴까요? 원본을 아직 내려받지 않았다면 먼저 내려받아 주세요.",
      )
    )
      return;
    try {
      resetDemoArchive();
      await reload();
      setToast("체험 기록을 초기화했어요.");
    } catch (e) {
      setError(message(e));
    }
  }
  async function signOut() {
    const client = getSupabaseBrowserClient();
    if (!client) return;
    const { error } = await client.auth.signOut();
    if (error) {
      setToast("로그아웃하지 못했어요. 다시 시도해 주세요.");
      return;
    }
    clearUserDrafts(userId);
    setArchive(null);
    setSettings(false);
    setToast("로그아웃했어요. 체험 화면으로 돌아갑니다.");
  }
  const workMap = new Map(works.map((w) => [w.id, w]));
  return (
    <div className="app-shell">
      <a className="skip-link" href="#main">
        본문으로 건너뛰기
      </a>
      <aside className="sidebar">
        <Link href="/" className="brand" aria-label="restory 홈">
          restory<span className="brand-period">.</span>
        </Link>
        <div className="sidebar-heading">나의 아카이브</div>
        <nav aria-label="주요 메뉴">
          {(
            [
              { id: "archive", label: "내 기록", icon: BookOpen },
              { id: "reflect", label: "돌아보기", icon: History },
              { id: "explore", label: "다른 사람의 감상", icon: Compass },
            ] as const
          ).map((item) => (
            <button
              key={item.id}
              className={`nav-item ${view === item.id ? "active" : ""}`}
              aria-current={view === item.id ? "page" : undefined}
              onClick={() => setView(item.id)}
            >
              <item.icon size={19} strokeWidth={1.6} />
              <span>{item.label}</span>
              {item.id === "archive" && archive && (
                <small>{entries.length}</small>
              )}
            </button>
          ))}
        </nav>
        <button
          className="sidebar-write button primary"
          onClick={() => startCompose()}
          disabled={!archive}
        >
          <Plus size={18} />
          기록 남기기
        </button>
        <div className="sidebar-note">
          <span className="note-line" />
          <p>
            다시 읽을 수 있도록,
            <br />
            그때의 마음을 남겨두세요.
          </p>
        </div>
        <div className="sidebar-bottom">
          {admin && (
            <button className="nav-item" onClick={() => setModeration(true)}>
              <Shield size={18} />
              신고 관리
            </button>
          )}
          <button className="account-button" onClick={() => setSettings(true)}>
            <span className="avatar">
              {repo.mode === "demo"
                ? "r"
                : (archive?.profile.nickname || "나").slice(0, 1)}
            </span>
            <span>
              <strong>
                {repo.mode === "demo"
                  ? "체험 아카이브"
                  : archive?.profile.nickname || "내 계정"}
              </strong>
              <small>
                {repo.mode === "demo" ? "이 브라우저에 저장" : "계정에 저장"}
              </small>
            </span>
            <Settings size={17} />
          </button>
          {!userId && (
            <button
              className="text-button login-link"
              onClick={() => setAuth(true)}
            >
              계정으로 이용하기
            </button>
          )}
        </div>
      </aside>
      <main id="main" className="main-content">
        <header className="mobile-header">
          <Link href="/" className="brand">
            restory<span className="brand-period">.</span>
          </Link>
          <button
            className="icon-button"
            aria-label="설정"
            onClick={() => setSettings(true)}
          >
            <Settings size={20} />
          </button>
        </header>
        <div className="topline">
          <span>
            {view === "archive"
              ? "나의 기록"
              : view === "reflect"
                ? "지난 감상 돌아보기"
                : "작품으로 이어지는 이야기"}
          </span>
          <span className="topline-right">
            <span className="mode-pill">
              {repo.mode === "demo" ? "체험 모드" : "비공개가 기본이에요"}
            </span>
            <button
              className="icon-button desktop-only"
              onClick={download}
              aria-label="기록 내보내기"
              disabled={!archive}
            >
              <Download size={18} />
            </button>
          </span>
        </div>
        {repo.mode === "demo" && (
          <div className="demo-notice">
            <span>
              예시 기록으로 둘러보고 자유롭게 적어보세요. 기록은 이 브라우저에만
              저장돼요.
            </span>
            <button className="text-button" onClick={() => setAuth(true)}>
              계정 안내
            </button>
          </div>
        )}
        <header className="page-header">
          <div>
            <p className="eyebrow">
              {view === "archive"
                ? "작품과 나 사이의 기록"
                : view === "reflect"
                  ? "시간이 지나며 달라진 마음"
                  : "같은 작품, 서로 다른 마음"}
            </p>
            <h1>
              {view === "archive"
                ? "남겨둔 이야기"
                : view === "reflect"
                  ? "다시 꺼내보기"
                  : "다른 사람의 감상"}
            </h1>
            {view === "archive" ? (
              <p className="page-description">
                {archive ? (
                  <>
                    <strong>{uniqueWorks}</strong>개의 작품에 남긴{" "}
                    <strong>{entries.length}</strong>번의 감상
                  </>
                ) : (
                  "아카이브를 불러오고 있어요."
                )}
              </p>
            ) : view === "reflect" ? (
              <p className="page-description">
                언제 어떤 이야기가 내 마음에 남았는지 살펴보세요.
              </p>
            ) : (
              <p className="page-description">
                작품을 읽고, 보고, 플레이한 사람들의 기록입니다.
              </p>
            )}
          </div>
          <button
            className="button primary header-write"
            onClick={() => startCompose()}
            disabled={!archive}
          >
            <Plus size={18} />
            기록 남기기
          </button>
        </header>
        {error && (
          <div role="alert" className="error-panel">
            <h2>기록을 불러오지 못했어요.</h2>
            <p>{error}</p>
            <button
              className="button secondary"
              onClick={() => reload().catch((e) => setError(message(e)))}
            >
              다시 시도
            </button>
            {repo.mode === "demo" && error === DEMO_DAMAGED_MESSAGE && (
              <div className="recovery-actions">
                <button className="button secondary" onClick={downloadRawDemo}>
                  <Download size={16} />
                  원본 내려받기
                </button>
                <button className="button danger-button" onClick={resetDemo}>
                  체험 데이터 초기화
                </button>
              </div>
            )}
            {userId && (
              <button className="text-button" onClick={signOut}>
                로그아웃하고 체험으로 돌아가기
              </button>
            )}
          </div>
        )}
        {!archive && !error ? (
          <div className="loading-state" role="status">
            <span className="loading-line" />
            기록을 펼치고 있어요.
          </div>
        ) : archive && view === "archive" ? (
          <>
            <section className="archive-toolbar" aria-label="기록 검색과 필터">
              <div className="search-field">
                <Search size={18} />
                <input
                  aria-label="내 기록 검색"
                  placeholder="작품, 감상, 태그 검색"
                  value={query}
                  onChange={(e) => setQuery(e.target.value)}
                />
                {query && (
                  <button
                    className="icon-button"
                    aria-label="검색어 지우기"
                    onClick={() => setQuery("")}
                  >
                    <X size={16} />
                  </button>
                )}
              </div>
              <button
                className={`button filter-toggle ${filters ? "active" : ""}`}
                onClick={() => setFilters(!filters)}
                aria-expanded={filters}
              >
                <SlidersHorizontal size={17} />
                필터{filtered && <span className="filter-dot" />}
              </button>
              <button
                className={`button favorite-filter ${favorites ? "active" : ""}`}
                aria-label="오래 기억할 작품"
                aria-pressed={favorites}
                onClick={() => setFavorites(!favorites)}
              >
                <Bookmark
                  size={17}
                  fill={favorites ? "currentColor" : "none"}
                />
                <span>오래 기억할 작품</span>
              </button>
            </section>
            {filters && (
              <div className="filter-panel">
                <label>
                  매체
                  <select
                    value={media}
                    onChange={(e) =>
                      setMedia(e.target.value as MediaType | "all")
                    }
                    aria-label="매체 필터"
                  >
                    <option value="all">모든 매체</option>
                    {MEDIA_TYPES.map((m) => (
                      <option key={m} value={m}>
                        {MEDIA_LABELS[m]}
                      </option>
                    ))}
                  </select>
                </label>
                <label>
                  감상 연도
                  <select
                    value={year}
                    onChange={(e) => setYear(e.target.value)}
                    aria-label="감상 연도 필터"
                  >
                    <option value="all">모든 시기</option>
                    {years.map((y) => (
                      <option key={y} value={y}>
                        {y}년
                      </option>
                    ))}
                    <option value="unknown">날짜 모름</option>
                  </select>
                </label>
                <label>
                  남은 마음
                  <select
                    value={tag}
                    onChange={(e) => setTag(e.target.value)}
                    aria-label="감정 태그 필터"
                  >
                    <option value="">모든 감정</option>
                    {tags.map((t) => (
                      <option key={t} value={t}>
                        {t}
                      </option>
                    ))}
                  </select>
                </label>
                <button className="text-button" onClick={clearFilters}>
                  초기화
                </button>
              </div>
            )}
            <div className="list-heading">
              <span>
                {filtered ? "찾은 기록" : "최근 감상한 순서"}{" "}
                <b>{visible.length}</b>
              </span>
              <span>감상한 시점 기준</span>
            </div>
            {visible.length ? (
              <div className="entry-list">
                {visible.map((entry, index) => {
                  const work = workMap.get(entry.workId);
                  if (!work) return null;
                  const prevYear =
                    index > 0 ? dateYear(visible[index - 1]) : undefined;
                  const y = dateYear(entry);
                  return (
                    <div key={entry.id}>
                      {(index === 0 || prevYear !== y) && (
                        <div className="year-divider">
                          <span>
                            {y ? `${y}년` : "날짜를 기억하지 못한 이야기"}
                          </span>
                          <span />
                        </div>
                      )}
                      <EntryRow
                        entry={entry}
                        work={work}
                        onOpen={() => setDetail(work)}
                        onEdit={() => startCompose({ entry, work })}
                        onFavorite={() => favoriteEntry(entry)}
                      />
                    </div>
                  );
                })}
              </div>
            ) : (
              <EmptyState
                filtered={filtered}
                onAdd={() => startCompose()}
                onClear={clearFilters}
              />
            )}
          </>
        ) : archive && view === "reflect" ? (
          <Reflection archive={archive} onOpen={setDetail} />
        ) : view === "explore" && publicWork ? (
          <section className="public-section">
            <PublicWorkSection
              workId={publicWork}
              demo={!configured}
              onBack={closePublicWork}
              onReport={(entry) => {
                if (!userId) {
                  setAuth(true);
                  return;
                }
                setReport(entry);
              }}
            />
          </section>
        ) : view === "explore" ? (
          <section className="public-section">
            {!configured && (
              <p className="sample-caption">
                아래 감상은 체험을 위해 작성한 예시입니다. 실제 이용자 게시물이
                아니에요.
              </p>
            )}
            <div className="search-field public-search">
              <Search size={18} />
              <input
                aria-label="공개 감상 검색"
                placeholder="작품, 창작자, 감상 내용으로 찾기"
                value={publicQuery}
                onChange={(e) => setPublicQuery(e.target.value)}
              />
            </div>
            {publicError && (
              <p className="form-error" role="alert">
                {publicError}
              </p>
            )}
            <div className="public-list">
              {publicEntries.map((entry) => (
                <PublicCard
                  key={entry.id}
                  entry={entry}
                  demo={!configured}
                  onOpenWork={() => openPublicWork(entry.work.id)}
                  onReport={() => {
                    if (!userId) {
                      setAuth(true);
                      return;
                    }
                    setReport(entry);
                  }}
                />
              ))}
            </div>
            {publicBusy && (
              <p role="status" className="muted">
                감상을 불러오고 있어요.
              </p>
            )}
            {!publicBusy &&
              !publicEntries.length &&
              !publicError &&
              (publicSearch ? (
                <div className="empty-state" role="status">
                  <Search size={32} />
                  <h2>‘{publicSearch}’에 맞는 공개 감상이 없어요.</h2>
                  <p>작품 제목, 창작자, 감상 내용과 태그에서 찾았어요.</p>
                </div>
              ) : (
                <div className="empty-state">
                  <MessageSquare size={32} />
                  <h2>첫 번째 감상을 기다리고 있어요.</h2>
                  <p>내 기록에서 공유하고 싶은 감상을 골라 공개할 수 있어요.</p>
                </div>
              ))}
            {hasMore && (
              <button
                className="button secondary load-more"
                disabled={publicBusy}
                onClick={() => loadPublic(publicPage + 1)}
              >
                감상 더 보기
              </button>
            )}
          </section>
        ) : null}
        <footer className="page-footer">
          <span>restory</span>
          <span>감상한 순간을, 내 말로.</span>
        </footer>
      </main>
      <nav className="mobile-nav" aria-label="모바일 주요 메뉴">
        <button
          className={view === "archive" ? "active" : ""}
          onClick={() => setView("archive")}
        >
          <BookOpen size={20} />내 기록
        </button>
        <button
          className={view === "reflect" ? "active" : ""}
          onClick={() => setView("reflect")}
        >
          <History size={20} />
          돌아보기
        </button>
        <button
          className="mobile-add"
          aria-label="새 기록 남기기"
          onClick={() => startCompose()}
          disabled={!archive}
        >
          <Plus size={25} />
        </button>
        <button
          className={view === "explore" ? "active" : ""}
          onClick={() => setView("explore")}
        >
          <Compass size={20} />
          감상 둘러보기
        </button>
      </nav>
      {compose && archive && (
        <Modal
          title={
            compose.entry
              ? "감상 수정하기"
              : compose.work
                ? "다시 만난 이야기"
                : "새로운 감상 남기기"
          }
          onClose={closeCompose}
          wide
        >
          <EntryForm
            archive={archive}
            repository={repo}
            entry={compose.entry}
            initialWork={compose.work}
            draftKey={composeDraftKey}
            onSaved={saved}
            onDirty={() => setDirty(true)}
          />
        </Modal>
      )}
      {detail && archive && (
        <Modal title="작품과 나의 기록" onClose={() => setDetail(null)} wide>
          <WorkDetail
            work={detail}
            entries={sortEntries(entries.filter((e) => e.workId === detail.id))}
            onAdd={() => startCompose({ work: detail })}
            onEdit={(e) => startCompose({ entry: e, work: detail })}
            onRemove={remove}
            onVisibility={visibility}
            onFavorite={favoriteEntry}
            cloud={repo.mode === "cloud"}
          />
        </Modal>
      )}
      {settings && archive && (
        <Modal
          title={repo.mode === "demo" ? "체험 아카이브 설정" : "내 계정과 기록"}
          onClose={() => setSettings(false)}
        >
          <SettingsPanel
            archive={archive}
            repo={repo}
            onExport={download}
            onUpdated={async () => {
              await reload();
              setToast("변경 내용을 저장했어요.");
            }}
            onImported={async (result) => {
              await reload();
              setToast(
                `감상 ${result.entries}개를 비공개로 가져왔어요. 같은 내용 ${result.skipped}개는 건너뛰었어요.`,
              );
            }}
            onDelete={async () => {
              await repo.deleteAccount();
              if (repo.mode === "cloud") await signOut();
              else {
                await reload();
                setSettings(false);
              }
              setToast("기록을 삭제했어요.");
            }}
            onSignOut={signOut}
          />
        </Modal>
      )}
      {auth && (
        <Modal
          title={recovery ? "비밀번호 변경" : "내 계정으로 기록하기"}
          onClose={() => {
            setAuth(false);
            setRecovery(false);
          }}
        >
          <AuthForm
            recovery={recovery}
            onDone={() => {
              setAuth(false);
              setRecovery(false);
            }}
          />
        </Modal>
      )}
      {publish && archive && (
        <Modal title="이 감상을 공개할까요?" onClose={() => setPublish(null)}>
          <PublishPanel
            entry={publish}
            work={workMap.get(publish.workId)!}
            nickname={archive.profile.nickname}
            catalogWorks={works.filter((w) => w.isPublic)}
            onPublish={async (catalogId) => {
              await repo.setVisibility(publish.id, "public", catalogId);
              await reload();
              setPublish(null);
              setToast("감상을 공개했어요. 언제든 비공개로 바꿀 수 있어요.");
            }}
          />
        </Modal>
      )}
      {report && (
        <Modal title="감상 신고" onClose={() => setReport(null)}>
          <ReportPanel
            onSubmit={async (reason) => {
              await repo.reportEntry(report.id, reason);
              setReport(null);
              setToast("신고를 접수했어요.");
            }}
          />
        </Modal>
      )}
      {moderation && admin && (
        <Modal title="신고 관리" onClose={() => setModeration(false)} wide>
          <ModerationPanel />
        </Modal>
      )}
      {toast && (
        <div role="status" className="toast">
          <Check size={17} />
          <span>{toast}</span>
          <button
            className="icon-button"
            aria-label="알림 닫기"
            onClick={() => setToast("")}
          >
            <X size={16} />
          </button>
        </div>
      )}
    </div>
  );
}
function EntryRow({
  entry,
  work,
  onOpen,
  onEdit,
  onFavorite,
}: {
  entry: Entry;
  work: Work;
  onOpen: () => void;
  onEdit: () => void;
  onFavorite: () => void;
}) {
  return (
    <article className="entry-row">
      <button
        className="entry-main"
        onClick={onOpen}
        aria-label={`${work.title} 감상 보기`}
      >
        <WorkMark type={work.mediaType} />
        <div className="entry-content">
          <div className="entry-meta">
            <span>{MEDIA_LABELS[work.mediaType]}</span>
            <span>
              {formatExperiencedDate(entry.experiencedOn, entry.datePrecision)}
            </span>
            {entry.visibility === "public" && (
              <span>
                <Globe2 size={12} />
                공개
              </span>
            )}
          </div>
          <h2>{work.title}</h2>
          <p
            className={`entry-summary ${!entry.summary && !entry.body ? "unwritten" : ""}`}
          >
            {entry.summary || entry.body || "감상은 아직 적지 않았어요."}
          </p>
          {entry.tags.length > 0 && (
            <div className="entry-tags">
              {entry.tags.map((tag) => (
                <span key={tag}>{tag}</span>
              ))}
            </div>
          )}
        </div>
      </button>
      <div className="entry-actions">
        <button
          className={`icon-button ${entry.favorite ? "is-favorite" : ""}`}
          aria-label={`${work.title} 오래 기억하기 ${entry.favorite ? "해제" : "추가"}`}
          aria-pressed={entry.favorite}
          onClick={onFavorite}
        >
          <Bookmark
            size={19}
            fill={entry.favorite ? "currentColor" : "none"}
            strokeWidth={1.5}
          />
        </button>
        <button
          className="icon-button edit-action"
          aria-label={`${work.title} 감상 수정`}
          onClick={onEdit}
        >
          <PenLine size={17} />
        </button>
      </div>
    </article>
  );
}
function EmptyState({
  filtered,
  onAdd,
  onClear,
}: {
  filtered: boolean;
  onAdd: () => void;
  onClear: () => void;
}) {
  return (
    <div className="empty-state">
      <BookOpen size={34} strokeWidth={1.2} />
      <h2>
        {filtered ? "조건에 맞는 기록이 없어요." : "첫 이야기를 남겨보세요."}
      </h2>
      <p>
        {filtered
          ? "다른 제목이나 시기로 찾아볼까요?"
          : "작품 제목만 적어도 시작할 수 있어요. 감상은 천천히 덧붙여도 괜찮아요."}
      </p>
      <button className="button secondary" onClick={filtered ? onClear : onAdd}>
        {filtered ? "검색 조건 지우기" : "첫 기록 남기기"}
      </button>
    </div>
  );
}
function Reflection({
  archive,
  onOpen,
}: {
  archive: Archive;
  onOpen: (w: Work) => void;
}) {
  const [year, setYear] = useState("all");
  const years = [
    ...new Set(archive.entries.map(dateYear).filter((y): y is string => !!y)),
  ]
    .sort()
    .reverse();
  const entries = archive.entries.filter(
    (e) => year === "all" || dateYear(e) === year,
  );
  const favorite = sortEntries(entries.filter((e) => e.favorite));
  const revisited = archive.works.filter(
    (w) => entries.filter((e) => e.workId === w.id).length > 1,
  );
  const counts = Object.entries(
    entries
      .flatMap((e) => e.tags)
      .reduce<Record<string, number>>(
        (a, t) => ({ ...a, [t]: (a[t] || 0) + 1 }),
        {},
      ),
  )
    .sort((a, b) => b[1] - a[1])
    .slice(0, 6);
  const max = counts[0]?.[1] || 1;
  return (
    <section className="reflection">
      <div className="reflection-toolbar">
        <label>
          돌아볼 시기
          <select value={year} onChange={(e) => setYear(e.target.value)}>
            <option value="all">모든 시간</option>
            {years.map((y) => (
              <option key={y} value={y}>
                {y}년
              </option>
            ))}
          </select>
        </label>
        <span>
          {entries.length}번의 감상,{" "}
          {new Set(entries.map((e) => e.workId)).size}개의 작품
        </span>
      </div>
      <div className="reflection-grid">
        <section>
          <h2 className="section-title">
            오래 기억하고 싶은 작품 <Bookmark size={18} />
          </h2>
          {favorite.length ? (
            favorite.map((e) => {
              const w = archive.works.find((w) => w.id === e.workId)!;
              return (
                <button
                  className="memory-item"
                  key={e.id}
                  onClick={() => onOpen(w)}
                >
                  <span className="small-meta">
                    {formatExperiencedDate(e.experiencedOn, e.datePrecision)}
                  </span>
                  <h3>{w.title}</h3>
                  <p>{e.summary || e.body || "다시 꺼내보고 싶은 이야기"}</p>
                </button>
              );
            })
          ) : (
            <p className="muted compact-empty">
              기록의 책갈피를 눌러 오래 기억할 작품을 골라보세요.
            </p>
          )}
        </section>
        <section className="emotion-section">
          <h2 className="section-title">기록에 남은 마음</h2>
          {counts.length ? (
            <ul className="emotion-chart">
              {counts.map(([tag, count]) => (
                <li key={tag}>
                  <div>
                    <span>{tag}</span>
                    <b>{count}번</b>
                  </div>
                  <span className="bar-track">
                    <span style={{ width: `${(count / max) * 100}%` }} />
                  </span>
                </li>
              ))}
            </ul>
          ) : (
            <p className="muted compact-empty">
              감정 태그를 남기면 이곳에서 함께 돌아볼 수 있어요.
            </p>
          )}
          <p className="chart-note">직접 붙인 태그를 기준으로 모았어요.</p>
        </section>
      </div>
      <section className="revisit-section">
        <h2 className="section-title">
          다시 만난 작품 <RotateCcw size={18} />
        </h2>
        {revisited.length ? (
          revisited.map((w) => (
            <button
              key={w.id}
              className="revisit-work"
              onClick={() => onOpen(w)}
            >
              <WorkMark type={w.mediaType} />
              <div>
                <h3>{w.title}</h3>
                <p>
                  {sortEntries(entries.filter((e) => e.workId === w.id))
                    .reverse()
                    .map((e) =>
                      formatExperiencedDate(e.experiencedOn, e.datePrecision),
                    )
                    .join(" → ")}
                </p>
              </div>
              <span>
                {entries.filter((e) => e.workId === w.id).length}번의 감상
              </span>
            </button>
          ))
        ) : (
          <p className="muted compact-empty">
            같은 작품에 새 감상을 남기면 지난 기록과 비교할 수 있어요.
          </p>
        )}
      </section>
    </section>
  );
}
function WorkDetail({
  work,
  entries,
  onAdd,
  onEdit,
  onRemove,
  onVisibility,
  onFavorite,
  cloud,
}: {
  work: Work;
  entries: Entry[];
  onAdd: () => void;
  onEdit: (e: Entry) => void;
  onRemove: (e: Entry) => void;
  onVisibility: (e: Entry) => void;
  onFavorite: (e: Entry) => void;
  cloud: boolean;
}) {
  const [others, setOthers] = useState<PublicEntry[]>([]);
  const [publicError, setPublicError] = useState("");
  const [page, setPage] = useState(0);
  const [more, setMore] = useState(false);
  const [busy, setBusy] = useState(false);
  const revision = entries
    .map((e) => `${e.id}:${e.visibility}:${e.updatedAt}`)
    .join("|");
  useEffect(() => {
    let active = true;
    const task = isSupabaseConfigured()
      ? listPublicEntries(work.id)
      : createDemoRepository().listPublic(work.id);
    task
      .then((data) => {
        if (active) {
          setOthers(data);
          setPage(0);
          setMore(data.length === 20);
        }
      })
      .catch(() => {
        if (active) setPublicError("다른 감상을 불러오지 못했어요.");
      });
    return () => {
      active = false;
    };
  }, [work.id, revision]);
  async function nextPage() {
    setBusy(true);
    setPublicError("");
    try {
      const data = isSupabaseConfigured()
        ? await listPublicEntries(work.id, page + 1)
        : await createDemoRepository().listPublic(work.id, page + 1);
      setOthers((v) => [...v, ...data]);
      setPage((p) => p + 1);
      setMore(data.length === 20);
    } catch {
      setPublicError("다른 감상을 불러오지 못했어요.");
    } finally {
      setBusy(false);
    }
  }
  return (
    <div className="work-detail">
      <header className="work-detail-title">
        <WorkMark type={work.mediaType} large />
        <div>
          <span className="eyebrow">{MEDIA_LABELS[work.mediaType]}</span>
          <h3>{work.title}</h3>
          <p>
            {[work.creator, work.releaseYear].filter(Boolean).join(" / ") ||
              "작품 정보 미입력"}
          </p>
        </div>
      </header>
      <div className="detail-subheading">
        <h3>
          나의 감상 <span>{entries.length}</span>
        </h3>
        <button className="button secondary" onClick={onAdd}>
          <Plus size={16} />새 감상 추가
        </button>
      </div>
      {entries.map((e) => (
        <article className="detail-entry" key={e.id}>
          <div className="detail-entry-date">
            <strong>
              {formatExperiencedDate(e.experiencedOn, e.datePrecision)}
            </strong>
            <span>
              {e.visibility === "public" ? (
                <>
                  <Globe2 size={13} />
                  공개
                </>
              ) : (
                <>
                  <LockKeyhole size={13} />
                  나만 보기
                </>
              )}
            </span>
          </div>
          {e.summary && <h4>{e.summary}</h4>}
          {e.body && <p className="long-body">{e.body}</p>}
          {!e.summary && !e.body && (
            <p className="muted">
              남긴 감상이 없어요. 기억나는 순간에 적어보세요.
            </p>
          )}
          <div className="entry-tags">
            {e.tags.map((t) => (
              <span key={t}>{t}</span>
            ))}
            {e.spoiler && <span>스포일러 포함</span>}
          </div>
          <small className="created-date">
            작성일 {new Date(e.createdAt).toLocaleDateString("ko-KR")}
          </small>
          <div className="detail-actions">
            <button className="text-button" onClick={() => onEdit(e)}>
              <PenLine size={15} />
              수정
            </button>
            <button className="text-button" onClick={() => onFavorite(e)}>
              <Bookmark size={15} fill={e.favorite ? "currentColor" : "none"} />
              {e.favorite ? "책갈피 해제" : "오래 기억하기"}
            </button>
            {cloud && (
              <button className="text-button" onClick={() => onVisibility(e)}>
                {e.visibility === "public" ? (
                  <LockKeyhole size={15} />
                ) : (
                  <Globe2 size={15} />
                )}{" "}
                {e.visibility === "public" ? "비공개로 변경" : "공개하기"}
              </button>
            )}
            {e.visibility === "public" && (
              <a
                className="text-button"
                href={`/read/${e.id}`}
                target="_blank"
                rel="noreferrer"
              >
                <ExternalLink size={15} />
                공개 페이지
              </a>
            )}
            <button className="text-button danger" onClick={() => onRemove(e)}>
              <Trash2 size={15} />
              삭제
            </button>
          </div>
        </article>
      ))}
      <section className="work-public">
        <h3>이 작품을 만난 다른 사람들</h3>
        {!isSupabaseConfigured() && (
          <p className="sample-caption">체험용 예시 감상입니다.</p>
        )}
        {publicError ? (
          <p role="alert" className="form-error">
            {publicError}
          </p>
        ) : others.length ? (
          others.map((e) => (
            <PublicCard
              key={e.id}
              entry={e}
              demo={!isSupabaseConfigured()}
              compact
            />
          ))
        ) : (
          <p className="muted">아직 공개된 감상이 없어요.</p>
        )}
        {more && (
          <button
            className="button secondary load-more"
            disabled={busy}
            onClick={nextPage}
          >
            {busy ? "불러오는 중…" : "이 작품의 감상 더 보기"}
          </button>
        )}
      </section>
    </div>
  );
}
function PublicWorkSection({
  workId,
  demo,
  onBack,
  onReport,
}: {
  workId: string;
  demo: boolean;
  onBack: () => void;
  onReport: (entry: PublicEntry) => void;
}) {
  const [items, setItems] = useState<PublicEntry[]>([]);
  const [page, setPage] = useState(0);
  const [more, setMore] = useState(false);
  const [busy, setBusy] = useState(true);
  const [error, setError] = useState("");
  const load = useCallback(
    async (next: number) => {
      setBusy(true);
      setError("");
      try {
        const data = demo
          ? await createDemoRepository().listPublic(workId, next)
          : await listPublicEntries(workId, next);
        setItems((prev) => (next === 0 ? data : [...prev, ...data]));
        setPage(next);
        setMore(data.length === 20);
      } catch (e) {
        setError(message(e));
      } finally {
        setBusy(false);
      }
    },
    [workId, demo],
  );
  useEffect(() => {
    queueMicrotask(() => void load(0));
  }, [load]);
  const work = items[0]?.work;
  return (
    <div className="public-work">
      <button type="button" className="text-button" onClick={onBack}>
        <ArrowLeft size={14} />
        모든 공개 감상
      </button>
      <header className="work-detail-title">
        {work ? (
          <>
            <WorkMark type={work.mediaType} large />
            <div>
              <span className="eyebrow">{MEDIA_LABELS[work.mediaType]}</span>
              <h2>{work.title}</h2>
              <p>
                {[work.creator, work.releaseYear].filter(Boolean).join(" / ") ||
                  "작품 정보 미입력"}
              </p>
            </div>
          </>
        ) : (
          <div>
            <h2>작품의 공개 감상</h2>
          </div>
        )}
      </header>
      {demo && (
        <p className="sample-caption">
          아래 감상은 체험을 위해 작성한 예시입니다. 실제 이용자 게시물이
          아니에요.
        </p>
      )}
      {error && (
        <p className="form-error" role="alert">
          {error}
        </p>
      )}
      <div className="public-list">
        {items.map((entry) => (
          <PublicCard
            key={entry.id}
            entry={entry}
            demo={demo}
            onReport={() => onReport(entry)}
          />
        ))}
      </div>
      {busy && (
        <p role="status" className="muted">
          감상을 불러오고 있어요.
        </p>
      )}
      {!busy && !items.length && !error && (
        <div className="empty-state" role="status">
          <MessageSquare size={32} />
          <h2>이 작품의 공개 감상이 아직 없어요.</h2>
          <p>감상이 비공개로 바뀌었거나 주소가 바뀌었을 수 있어요.</p>
        </div>
      )}
      {more && (
        <button
          className="button secondary load-more"
          disabled={busy}
          onClick={() => load(page + 1)}
        >
          감상 더 보기
        </button>
      )}
    </div>
  );
}
export function PublicCard({
  entry,
  demo,
  onReport,
  onOpenWork,
  compact = false,
}: {
  entry: PublicEntry;
  demo: boolean;
  onReport?: () => void;
  onOpenWork?: () => void;
  compact?: boolean;
}) {
  const [revealed, setRevealed] = useState(false);
  return (
    <article className={`public-card ${compact ? "compact" : ""}`}>
      <header>
        <WorkMark type={entry.work.mediaType} />
        <div>
          <span className="small-meta">
            {MEDIA_LABELS[entry.work.mediaType]}
            {entry.work.releaseYear ? ` / ${entry.work.releaseYear}` : ""}
          </span>
          <h2>
            {onOpenWork ? (
              <button
                type="button"
                className="work-link"
                onClick={onOpenWork}
                title="이 작품의 공개 감상 모아 보기"
              >
                {entry.work.title}
              </button>
            ) : demo ? (
              entry.work.title
            ) : (
              <Link
                className="work-link"
                href={`/works/${entry.work.id}`}
                title="이 작품의 공개 감상 모아 보기"
              >
                {entry.work.title}
              </Link>
            )}
          </h2>
        </div>
        {demo ? (
          <span className="sample-badge">예시</span>
        ) : (
          <a
            className="icon-button"
            href={`/read/${entry.id}`}
            aria-label={`${entry.work.title} 공개 페이지`}
          >
            <ExternalLink size={16} />
          </a>
        )}
      </header>
      {entry.spoiler && !revealed ? (
        <div className="spoiler-cover">
          <p>스포일러가 포함된 감상이에요.</p>
          <button
            className="button secondary"
            onClick={() => setRevealed(true)}
          >
            감상 펼치기
          </button>
        </div>
      ) : (
        <div className="public-body">
          {entry.summary && <h3>{entry.summary}</h3>}
          {entry.body && <p>{entry.body}</p>}
          {!entry.summary && !entry.body && (
            <p className="muted">감상한 기록만 남겼어요.</p>
          )}
          <div className="entry-tags">
            {entry.tags.map((t) => (
              <span key={t}>{t}</span>
            ))}
          </div>
        </div>
      )}
      <footer>
        <span>
          {entry.authorName}{" "}
          <span className="public-date">
            {formatExperiencedDate(entry.experiencedOn, entry.datePrecision)}
          </span>
        </span>
        {onReport && !demo && (
          <button className="text-button" onClick={onReport}>
            <Flag size={13} />
            신고
          </button>
        )}
      </footer>
    </article>
  );
}
function SettingsPanel({
  archive,
  repo,
  onExport,
  onUpdated,
  onImported,
  onDelete,
  onSignOut,
}: {
  archive: Archive;
  repo: RestoryRepository;
  onExport: () => void;
  onUpdated: () => Promise<void>;
  onImported: (result: ImportResult) => Promise<void>;
  onDelete: () => Promise<void>;
  onSignOut: () => Promise<void>;
}) {
  const [nickname, setNickname] = useState(archive.profile.nickname);
  const [confirmation, setConfirmation] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [importing, setImporting] = useState<{
    name: string;
    archive: Archive;
    plan: ImportPlan;
  } | null>(null);
  async function pickImport(file: File | undefined) {
    setError("");
    setImporting(null);
    if (!file) return;
    try {
      if (file.size > 20 * 1024 * 1024)
        throw new Error("20MB 이하의 기록 파일만 가져올 수 있습니다.");
      const imported = parseArchiveImport(await file.text());
      setImporting({
        name: file.name,
        archive: imported,
        plan: planImport(archive, imported),
      });
    } catch (e) {
      setError(message(e));
    }
  }
  async function runImport() {
    if (!importing) return;
    setBusy(true);
    setError("");
    try {
      const result = await applyImport(repo, archive, importing.archive);
      setImporting(null);
      await onImported(result);
    } catch (e) {
      setError(
        `${message(e)} 이미 추가된 감상은 남아 있으며 같은 파일을 다시 가져오면 중복 없이 이어서 처리합니다.`,
      );
    } finally {
      setBusy(false);
    }
  }
  async function update() {
    setBusy(true);
    setError("");
    try {
      await repo.updateNickname(nickname);
      await onUpdated();
    } catch (e) {
      setError(message(e));
    } finally {
      setBusy(false);
    }
  }
  return (
    <div className="settings-panel">
      {repo.mode === "cloud" && (
        <section>
          <h3>공개 닉네임</h3>
          <label className="sr-only" htmlFor="nickname">
            닉네임
          </label>
          <div className="inline-input">
            <input
              id="nickname"
              value={nickname}
              onChange={(e) => setNickname(e.target.value)}
              minLength={2}
              maxLength={40}
            />
            <button
              className="button secondary"
              onClick={update}
              disabled={busy}
            >
              저장
            </button>
          </div>
        </section>
      )}
      <section>
        <h3>내 기록 보관하기</h3>
        <p>작품 정보와 모든 감상을 JSON 파일로 내려받습니다.</p>
        <button className="button secondary" onClick={onExport}>
          <Download size={16} />
          기록 내보내기
        </button>
      </section>
      <section>
        <h3>기록 가져오기</h3>
        <p>
          restory에서 내보낸 JSON 파일의 감상을 비공개로 추가합니다. 작품은
          제목, 매체, 창작자, 연도가 같으면 기존 작품에 연결하고, 같은 내용의
          감상은 건너뜁니다.
        </p>
        <label className="file-picker">
          <Upload size={16} />
          <span>{importing ? importing.name : "가져올 기록 파일 선택"}</span>
          <input
            type="file"
            accept="application/json,.json"
            aria-label="가져올 기록 파일"
            disabled={busy}
            onChange={(e) => {
              void pickImport(e.target.files?.[0]);
              e.target.value = "";
            }}
          />
        </label>
        {importing && (
          <div className="import-preview" role="status">
            <p>
              새 작품 {importing.plan.newWorks.length}개와 감상{" "}
              {importing.plan.entries.length}개를 추가하고, 같은 내용{" "}
              {importing.plan.duplicateEntries}개는 건너뜁니다. 가져온 감상은
              모두 비공개입니다.
            </p>
            <div className="inline-actions">
              <button
                className="button primary"
                onClick={runImport}
                disabled={busy || !importing.plan.entries.length}
              >
                {busy ? "가져오는 중…" : "가져오기"}
              </button>
              <button
                className="text-button"
                onClick={() => setImporting(null)}
                disabled={busy}
              >
                취소
              </button>
            </div>
          </div>
        )}
      </section>
      {repo.mode === "demo" && (
        <section className="notice">
          <p>
            체험 기록은 이 브라우저에만 저장돼요. 브라우저 데이터를 지우면
            기록도 사라질 수 있어요. 계정을 연결해도 체험 기록은 자동으로
            옮겨지지 않습니다.
          </p>
        </section>
      )}
      {repo.mode === "cloud" && (
        <button className="button secondary" onClick={onSignOut}>
          <LogOut size={16} />
          로그아웃
        </button>
      )}
      <section className="danger-zone">
        <h3>
          {repo.mode === "demo" ? "체험 기록 모두 지우기" : "계정과 기록 삭제"}
        </h3>
        <p>
          {repo.mode === "demo"
            ? "이 브라우저의 기록을 모두 지우고 빈 아카이브로 시작합니다."
            : "공개 감상을 포함한 나의 기록과 계정을 영구 삭제합니다."}{" "}
          먼저 필요한 기록을 내보내세요.
        </p>
        <label>
          확인하려면 ‘삭제’를 입력해 주세요.
          <input
            value={confirmation}
            onChange={(e) => setConfirmation(e.target.value)}
            placeholder="삭제"
          />
        </label>
        <button
          className="button danger-button"
          disabled={confirmation !== "삭제" || busy}
          onClick={async () => {
            setBusy(true);
            setError("");
            try {
              await onDelete();
            } catch (e) {
              setError(message(e));
            } finally {
              setBusy(false);
            }
          }}
        >
          {busy
            ? "처리 중…"
            : repo.mode === "demo"
              ? "체험 기록 삭제"
              : "계정 삭제"}
        </button>
      </section>
      {error && (
        <p className="form-error" role="alert">
          {error}
        </p>
      )}
    </div>
  );
}
function PublishPanel({
  entry,
  work,
  nickname,
  catalogWorks,
  onPublish,
}: {
  entry: Entry;
  work: Work;
  nickname: string;
  catalogWorks: Work[];
  onPublish: (catalogId?: string) => Promise<void>;
}) {
  const candidates = catalogWorks.filter(
    (w) =>
      w.mediaType === work.mediaType &&
      w.title.toLocaleLowerCase().includes(work.title.toLocaleLowerCase()),
  );
  const [catalogId, setCatalogId] = useState(
    work.isPublic ? work.id : candidates.length ? "" : "new",
  );
  const publicWork = catalogWorks.find((w) => w.id === catalogId) || work;
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  return (
    <div className="publish-panel">
      <p>
        아래 작품 정보와 감상이 <strong>{nickname}</strong> 이름으로 공개됩니다.
        감상한 시점과 태그도 함께 보이며, 다른 사람은 계정 없이 읽을 수 있어요.
      </p>
      {!work.isPublic && (
        <label className="catalog-select">
          연결할 공개 작품
          <select
            value={catalogId}
            onChange={(e) => setCatalogId(e.target.value)}
          >
            <option value="" disabled>
              같은 작품인지 확인해 주세요
            </option>
            {candidates.map((w) => (
              <option key={w.id} value={w.id}>
                {w.title} / {w.creator || "창작자 미입력"} /{" "}
                {w.releaseYear || "연도 미입력"}
              </option>
            ))}
            <option value="new">내 작품 정보로 공개</option>
          </select>
          <span className="field-hint">
            같은 작품이 있다면 선택해 주세요. 내 작품 정보로 공개하면 이전에
            연결한 페이지가 있을 경우 다시 사용합니다.
          </span>
        </label>
      )}
      <div className="publish-preview">
        <span className="small-meta">
          {MEDIA_LABELS[publicWork.mediaType]} /{" "}
          {formatExperiencedDate(entry.experiencedOn, entry.datePrecision)}
        </span>
        <h3>{publicWork.title}</h3>
        <p className="muted">
          {[publicWork.creator, publicWork.releaseYear]
            .filter(Boolean)
            .join(" / ")}
        </p>
        {entry.summary && <strong>{entry.summary}</strong>}
        <p className="long-body">{entry.body}</p>
        <div className="entry-tags">
          {entry.tags.map((t) => (
            <span key={t}>{t}</span>
          ))}
        </div>
        {entry.spoiler && (
          <p className="field-hint">스포일러 표시로 감상을 가린 뒤 보여줘요.</p>
        )}
      </div>
      <p className="field-hint">
        언제든 비공개로 바꿀 수 있어요. 이미 다른 사람이 별도로 저장한 내용은
        회수할 수 없습니다.
      </p>
      {error && (
        <p className="form-error" role="alert">
          {error}
        </p>
      )}
      <button
        className="button primary full-width"
        disabled={busy || !catalogId}
        onClick={async () => {
          setBusy(true);
          try {
            await onPublish(
              catalogId === "new" || work.isPublic ? undefined : catalogId,
            );
          } catch (e) {
            setError(message(e));
          } finally {
            setBusy(false);
          }
        }}
      >
        {busy ? "공개 중…" : "이 내용으로 공개하기"}
      </button>
    </div>
  );
}
function ReportPanel({
  onSubmit,
}: {
  onSubmit: (reason: string) => Promise<void>;
}) {
  const [reason, setReason] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  return (
    <form
      className="report-panel"
      onSubmit={async (e) => {
        e.preventDefault();
        setBusy(true);
        try {
          await onSubmit(reason);
        } catch (e) {
          setError(message(e));
        } finally {
          setBusy(false);
        }
      }}
    >
      <label>
        신고 사유
        <textarea
          value={reason}
          onChange={(e) => setReason(e.target.value)}
          minLength={5}
          maxLength={1000}
          required
          rows={5}
          placeholder="어떤 문제가 있는지 알려주세요."
        />
      </label>
      <p className="field-hint">신고 내용은 운영자만 확인해요.</p>
      {error && (
        <p role="alert" className="form-error">
          {error}
        </p>
      )}
      <button className="button primary" disabled={busy}>
        {busy ? "접수 중…" : "신고 접수"}
      </button>
    </form>
  );
}
function ModerationPanel() {
  const [reports, setReports] = useState<ModerationReport[]>([]);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState<string | null>(null);
  const load = () =>
    listModerationReports()
      .then(setReports)
      .catch((e) => setError(message(e)));
  useEffect(() => {
    void load();
  }, []);
  return (
    <div className="moderation-panel">
      {error && (
        <p role="alert" className="form-error">
          {error}
        </p>
      )}
      {!reports.length && !error && (
        <p className="muted">접수된 신고가 없어요.</p>
      )}
      {reports.map((r) => (
        <article className="moderation-item" key={r.id}>
          <span className="small-meta">
            {r.authorName} / {r.status === "open" ? "접수" : "처리됨"}
          </span>
          <h3>{r.summary || "제목 없는 감상"}</h3>
          <p className="long-body">{r.body}</p>
          <p className="notice">신고 사유: {r.reason}</p>
          <button
            className="button secondary"
            disabled={busy === r.entryId}
            onClick={async () => {
              setBusy(r.entryId);
              try {
                await moderateEntry(r.entryId, !r.hidden);
                await load();
              } catch (e) {
                setError(message(e));
              } finally {
                setBusy(null);
              }
            }}
          >
            {r.hidden ? "공개 복구" : "공개에서 숨기기"}
          </button>
        </article>
      ))}
    </div>
  );
}
