"use client";
import { useEffect, useState } from "react";
import Link from "next/link";
import { getPublicEntry } from "@/lib/cloud-repository";
import { isSupabaseConfigured } from "@/lib/supabase";
import type { PublicEntry } from "@/lib/types";
import { PublicCard } from "./restory-app";
export function ReadEntry({ id }: { id: string }) {
  const [entry, setEntry] = useState<PublicEntry | null>(null);
  const [ready, setReady] = useState(false);
  const [error, setError] = useState("");
  useEffect(() => {
    let active = true;
    if (!isSupabaseConfigured()) {
      queueMicrotask(() => {
        setReady(true);
        setError("이 주소는 계정 저장이 연결된 서비스에서 사용할 수 있어요.");
      });
      return;
    }
    getPublicEntry(id)
      .then((value) => {
        if (active) {
          setEntry(value);
          setReady(true);
        }
      })
      .catch(() => {
        if (active) {
          setError("감상을 불러오지 못했어요. 잠시 후 다시 시도해 주세요.");
          setReady(true);
        }
      });
    return () => {
      active = false;
    };
  }, [id]);
  return (
    <main className="read-page">
      <Link className="brand" href="/">
        restory<span className="brand-period">.</span>
      </Link>
      {!ready ? (
        <p className="loading-state" role="status">
          감상을 불러오고 있어요.
        </p>
      ) : entry ? (
        <PublicCard entry={entry} demo={false} />
      ) : (
        <section className="empty-state">
          <h1>공개된 감상을 찾을 수 없어요.</h1>
          <p>{error || "기록이 삭제되었거나 비공개로 바뀌었을 수 있어요."}</p>
          <Link className="button secondary" href="/">
            restory 둘러보기
          </Link>
        </section>
      )}
      <p className="read-footer">
        작품을 만난 시간과 그때의 감상을 남겨두는 곳.{" "}
        <Link className="text-button" href="/">
          내 기록 시작하기
        </Link>
      </p>
    </main>
  );
}
