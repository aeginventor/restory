"use client";
import { useEffect, useState, useRef } from "react";
import Link from "next/link";
import { getSupabaseBrowserClient } from "@/lib/supabase";
export default function AuthCallback() {
  const [error, setError] = useState("");
  const started = useRef(false);
  useEffect(() => {
    if (started.current) return;
    started.current = true;
    async function complete() {
      const client = getSupabaseBrowserClient();
      if (!client) {
        setError("계정 연결이 설정되지 않았어요.");
        return;
      }
      const url = new URL(location.href);
      const code = url.searchParams.get("code");
      if (url.searchParams.has("error")) {
        setError(
          "인증 링크가 만료되었거나 사용할 수 없어요. 새 링크를 요청해 주세요.",
        );
        return;
      }
      if (code) {
        const { error } = await client.auth.exchangeCodeForSession(code);
        if (error) {
          setError(
            "인증을 마치지 못했어요. 같은 브라우저에서 새 링크로 다시 시도해 주세요.",
          );
          return;
        }
      }
      const {
        data: { session },
      } = await client.auth.getSession();
      if (!session) {
        setError("로그인 정보를 확인하지 못했어요. 다시 로그인해 주세요.");
        return;
      }
      location.replace(
        url.searchParams.get("recovery") === "1" ? "/?recovery=1" : "/",
      );
    }
    void complete();
  }, []);
  return (
    <main className="standalone">
      <Link href="/" className="brand">
        restory
      </Link>
      <h1>{error ? "다시 확인해 주세요." : "계정을 연결하고 있어요."}</h1>
      <p role={error ? "alert" : "status"}>
        {error || "잠시 후 내 아카이브로 이동합니다."}
      </p>
      {error && (
        <Link href="/" className="button primary">
          내 아카이브로
        </Link>
      )}
    </main>
  );
}
