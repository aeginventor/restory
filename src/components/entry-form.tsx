"use client";
import { useEffect, useRef, useState, type FormEvent } from "react";
import { Check, Plus, RotateCcw, Search, Star, X } from "lucide-react";
import {
  MEDIA_LABELS,
  MEDIA_TYPES,
  type Archive,
  type DatePrecision,
  type Entry,
  type RestoryRepository,
  type Work,
} from "@/lib/types";
import {
  clearDraft,
  hasDraftContent,
  readDraft,
  writeDraft,
  type EntryDraft,
} from "@/lib/drafts";
import { WorkMark } from "./work-mark";
const EMOTIONS = ["여운", "위로", "설렘", "생각할 거리", "몰입", "아쉬움"];
const today = () => {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
};
export function EntryForm({
  archive,
  repository,
  entry,
  initialWork,
  draftKey,
  onSaved,
  onDirty,
}: {
  archive: Archive;
  repository: RestoryRepository;
  entry?: Entry;
  initialWork?: Work;
  draftKey: string;
  onSaved: () => Promise<void>;
  onDirty: () => void;
}) {
  const [selected, setSelected] = useState<Work | undefined>(
    initialWork || archive.works.find((w) => w.id === entry?.workId),
  );
  const [query, setQuery] = useState("");
  const [adding, setAdding] = useState(false);
  const [mediaType, setMediaType] = useState<Work["mediaType"]>("film");
  const [creator, setCreator] = useState("");
  const [releaseYear, setReleaseYear] = useState("");
  const [precision, setPrecision] = useState<DatePrecision>(
    entry?.datePrecision || "day",
  );
  const [date, setDate] = useState(entry?.experiencedOn || today());
  const [summary, setSummary] = useState(entry?.summary || "");
  const [body, setBody] = useState(entry?.body || "");
  const [tags, setTags] = useState<string[]>(entry?.tags || []);
  const [customTag, setCustomTag] = useState("");
  const [favorite, setFavorite] = useState(entry?.favorite || false);
  const [spoiler, setSpoiler] = useState(entry?.spoiler || false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [touched, setTouched] = useState(false);
  const [pendingDraft, setPendingDraft] = useState<EntryDraft | null>(null);
  const skipAutosave = useRef(false);
  // A draft from a previous visit is offered, never applied silently, so the current
  // record is not replaced by stale text without the user noticing.
  useEffect(() => {
    const saved = readDraft(draftKey);
    if (saved && hasDraftContent(saved)) {
      queueMicrotask(() => setPendingDraft(saved));
    } else if (saved) clearDraft(draftKey);
  }, [draftKey]);
  const snapshot: Omit<EntryDraft, "savedAt"> = {
    workId: selected?.id,
    query,
    adding,
    mediaType,
    creator,
    releaseYear,
    precision,
    date,
    summary,
    body,
    tags,
    favorite,
    spoiler,
  };
  const serialized = JSON.stringify(snapshot);
  useEffect(() => {
    if (!touched || busy) return;
    if (skipAutosave.current) {
      skipAutosave.current = false;
      return;
    }
    const parsed = JSON.parse(serialized) as Omit<EntryDraft, "savedAt">;
    const timer = setTimeout(() => {
      if (hasDraftContent(parsed))
        writeDraft(draftKey, { ...parsed, savedAt: new Date().toISOString() });
      else clearDraft(draftKey);
    }, 400);
    return () => clearTimeout(timer);
  }, [serialized, touched, busy, draftKey]);
  useEffect(() => {
    if (!touched) return;
    const warn = (event: BeforeUnloadEvent) => {
      event.preventDefault();
    };
    window.addEventListener("beforeunload", warn);
    return () => window.removeEventListener("beforeunload", warn);
  }, [touched]);
  function markDirty() {
    setTouched(true);
    onDirty();
  }
  function restoreDraft() {
    if (!pendingDraft) return;
    const work = pendingDraft.workId
      ? archive.works.find((w) => w.id === pendingDraft.workId)
      : undefined;
    if (!entry) {
      setSelected(work);
      setQuery(work ? "" : pendingDraft.query);
      setAdding(!work && pendingDraft.adding);
      setMediaType(pendingDraft.mediaType);
      setCreator(pendingDraft.creator);
      setReleaseYear(pendingDraft.releaseYear);
    }
    setPrecision(pendingDraft.precision);
    setDate(pendingDraft.date);
    setSummary(pendingDraft.summary);
    setBody(pendingDraft.body);
    setTags(pendingDraft.tags);
    setFavorite(pendingDraft.favorite);
    setSpoiler(pendingDraft.spoiler);
    setPendingDraft(null);
    markDirty();
  }
  function discardDraft() {
    clearDraft(draftKey);
    setPendingDraft(null);
  }
  const matching = archive.works
    .filter((w) =>
      w.title.toLocaleLowerCase().includes(query.toLocaleLowerCase()),
    )
    .slice(0, 6);
  function changePrecision(value: DatePrecision) {
    const previous = precision;
    setPrecision(value);
    if (value === "unknown") {
      setDate("");
      return;
    }
    const lengths = { day: 10, month: 7, year: 4, unknown: 0 };
    // Never invent a month or day when a user increases the date's precision.
    setDate(
      lengths[value] > lengths[previous] ? "" : date.slice(0, lengths[value]),
    );
  }
  function toggleTag(tag: string) {
    setTags((v) =>
      v.includes(tag)
        ? v.filter((t) => t !== tag)
        : v.length < 5
          ? [...v, tag]
          : v,
    );
    markDirty();
  }
  async function submit(event: FormEvent) {
    event.preventDefault();
    setError("");
    setBusy(true);
    try {
      let work = selected;
      if (!work) {
        if (!adding || !query.trim())
          throw new Error("작품을 선택하거나 제목을 입력해 주세요.");
        work = await repository.saveWork({
          title: query.trim(),
          mediaType,
          creator: creator.trim(),
          releaseYear: releaseYear ? Number(releaseYear) : null,
        });
        setSelected(work);
      }
      await repository.saveEntry(
        {
          workId: work.id,
          experiencedOn: precision === "unknown" ? null : date,
          datePrecision: precision,
          summary,
          body,
          tags,
          favorite,
          spoiler,
        },
        entry?.id,
        entry?.updatedAt,
      );
      skipAutosave.current = true;
      clearDraft(draftKey);
      await onSaved();
    } catch (e) {
      setError(
        e instanceof Error
          ? e.message
          : "저장하지 못했어요. 입력한 내용은 남아 있어요.",
      );
    } finally {
      setBusy(false);
    }
  }
  return (
    <form onSubmit={submit} onChange={markDirty} className="entry-form">
      {pendingDraft && (
        <div className="draft-notice" role="status">
          <p>
            저장하지 않은 글이 있어요.{" "}
            <time dateTime={pendingDraft.savedAt}>
              {new Date(pendingDraft.savedAt).toLocaleString("ko-KR", {
                month: "long",
                day: "numeric",
                hour: "numeric",
                minute: "2-digit",
              })}
            </time>
            에 쓰던 내용입니다.
          </p>
          <div>
            <button
              type="button"
              className="button secondary"
              onClick={restoreDraft}
            >
              <RotateCcw size={14} />
              이어서 쓰기
            </button>
            <button
              type="button"
              className="text-button"
              onClick={discardDraft}
            >
              <X size={14} />
              버리기
            </button>
          </div>
        </div>
      )}
      <fieldset className="form-fields" disabled={busy}>
        <div className="form-section">
          <label className="field-label" htmlFor="work-search">
            어떤 작품을 만났나요?
          </label>
          {selected ? (
            <div className="selected-work">
              <WorkMark type={selected.mediaType} />
              <div>
                <strong>{selected.title}</strong>
                <span>
                  {MEDIA_LABELS[selected.mediaType]}
                  {selected.creator ? ` / ${selected.creator}` : ""}
                </span>
              </div>
              {!entry && (
                <button
                  type="button"
                  className="text-button"
                  onClick={() => {
                    setSelected(undefined);
                    setAdding(false);
                  }}
                >
                  다른 작품
                </button>
              )}
            </div>
          ) : (
            <>
              <div className="search-field">
                <Search size={18} />
                <input
                  id="work-search"
                  autoFocus
                  placeholder="작품 제목 검색"
                  value={query}
                  onChange={(e) => {
                    setQuery(e.target.value);
                    setAdding(false);
                  }}
                  maxLength={200}
                />
              </div>
              {!adding && (
                <div className="work-options">
                  {matching.map((w) => (
                    <button
                      key={w.id}
                      type="button"
                      onClick={() => {
                        setSelected(w);
                        markDirty();
                      }}
                    >
                      <WorkMark type={w.mediaType} />
                      <span>
                        <strong>{w.title}</strong>
                        <small>
                          {MEDIA_LABELS[w.mediaType]}
                          {w.creator ? ` / ${w.creator}` : ""}
                          {w.releaseYear ? ` / ${w.releaseYear}` : ""}
                        </small>
                      </span>
                      <Plus size={16} />
                    </button>
                  ))}
                  <button
                    type="button"
                    className="add-work"
                    onClick={() => setAdding(true)}
                  >
                    <Plus size={18} />
                    {query ? `“${query}” 직접 등록` : "새 작품 직접 등록"}
                  </button>
                </div>
              )}
              {adding && (
                <div className="new-work-fields">
                  <p className="field-hint">
                    새 작품은 내 아카이브에만 등록돼요.
                  </p>
                  <div className="form-grid">
                    <label>
                      매체
                      <select
                        value={mediaType}
                        onChange={(e) =>
                          setMediaType(e.target.value as Work["mediaType"])
                        }
                      >
                        {MEDIA_TYPES.map((m) => (
                          <option key={m} value={m}>
                            {MEDIA_LABELS[m]}
                          </option>
                        ))}
                      </select>
                    </label>
                    <label>
                      발표 연도 <span className="optional">선택</span>
                      <input
                        aria-label="발표 연도"
                        type="number"
                        min="1"
                        max="9999"
                        value={releaseYear}
                        onChange={(e) => setReleaseYear(e.target.value)}
                        placeholder="예: 2024"
                      />
                    </label>
                  </div>
                  <label>
                    작가 / 감독 <span className="optional">선택</span>
                    <input
                      value={creator}
                      onChange={(e) => setCreator(e.target.value)}
                      maxLength={150}
                      placeholder="동명 작품을 구분할 수 있어요"
                    />
                  </label>
                </div>
              )}
            </>
          )}
        </div>
        <div className="form-section">
          <label className="field-label" htmlFor="date-precision">
            언제 감상했나요?
          </label>
          <div className="date-inputs">
            <select
              id="date-precision"
              value={precision}
              onChange={(e) => changePrecision(e.target.value as DatePrecision)}
            >
              <option value="day">정확한 날짜</option>
              <option value="month">연월만 기억해요</option>
              <option value="year">연도만 기억해요</option>
              <option value="unknown">기억나지 않아요</option>
            </select>
            {precision !== "unknown" && (
              <input
                aria-label="감상한 시점"
                type={
                  precision === "day"
                    ? "date"
                    : precision === "month"
                      ? "month"
                      : "number"
                }
                min={precision === "year" ? "1" : undefined}
                max={precision === "year" ? "9999" : undefined}
                required
                value={date}
                onChange={(e) => setDate(e.target.value)}
              />
            )}
          </div>
        </div>
        <div className="form-section">
          <label className="field-label" htmlFor="summary">
            그때의 감상을 남겨보세요. <span className="optional">선택</span>
          </label>
          <input
            id="summary"
            placeholder="지금 떠오르는 한 문장"
            value={summary}
            onChange={(e) => setSummary(e.target.value)}
            maxLength={240}
          />
          <label className="sr-only" htmlFor="body">
            긴 감상
          </label>
          <textarea
            id="body"
            placeholder="기억하고 싶은 장면이나 생각이 있다면 조금 더 적어보세요."
            value={body}
            onChange={(e) => setBody(e.target.value)}
            maxLength={20000}
            rows={5}
          />
          <span className="field-hint">감상은 나중에 적어도 괜찮아요.</span>
        </div>
        <div className="form-section">
          <p className="field-label">
            남은 마음 <span className="optional">최대 5개</span>
          </p>
          <div className="emotion-options">
            {[...new Set([...EMOTIONS, ...tags])].map((tag) => (
              <button
                key={tag}
                type="button"
                className={`chip ${tags.includes(tag) ? "selected" : ""}`}
                aria-pressed={tags.includes(tag)}
                onClick={() => toggleTag(tag)}
              >
                {tags.includes(tag) && <Check size={13} />} {tag}
              </button>
            ))}
          </div>
          <div className="custom-tag">
            <input
              aria-label="새 감정 태그"
              value={customTag}
              onChange={(e) => setCustomTag(e.target.value)}
              maxLength={20}
              placeholder="직접 적기"
            />
            <button
              type="button"
              className="text-button"
              disabled={!customTag.trim() || tags.length >= 5}
              onClick={() => {
                toggleTag(customTag.trim());
                setCustomTag("");
              }}
            >
              추가
            </button>
          </div>
        </div>
        <div className="form-checks">
          <label>
            <input
              type="checkbox"
              checked={favorite}
              onChange={(e) => setFavorite(e.target.checked)}
            />
            <Star size={16} /> 오래 기억하고 싶어요
          </label>
          <label>
            <input
              type="checkbox"
              checked={spoiler}
              onChange={(e) => setSpoiler(e.target.checked)}
            />{" "}
            스포일러가 있어요
          </label>
        </div>
        {entry?.visibility === "public" && (
          <p className="notice">
            이 기록은 공개 중이에요. 저장하면 공개된 내용도 수정됩니다.
          </p>
        )}
      </fieldset>
      {error && (
        <p className="form-error" role="alert">
          {error}
        </p>
      )}
      <footer className="form-footer">
        <span>
          {entry?.visibility === "public"
            ? "공개된 기록 수정"
            : "나만 볼 수 있는 기록으로 저장돼요."}
        </span>
        <button className="button primary" type="submit" disabled={busy}>
          {busy ? "저장 중…" : entry ? "수정 저장" : "기록 저장"}
        </button>
      </footer>
    </form>
  );
}
