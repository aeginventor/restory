"use client";
import { useState, type FormEvent } from "react";
import { Mail, LockKeyhole } from "lucide-react";
import { getSupabaseBrowserClient } from "@/lib/supabase";
export function AuthForm({
  onDone,
  recovery = false,
}: {
  onDone: () => void;
  recovery?: boolean;
}) {
  const [mode, setMode] = useState<"login" | "signup" | "reset" | "update">(
    recovery ? "update" : "login",
  );
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [nickname, setNickname] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const client = getSupabaseBrowserClient();
  if (!client)
    return (
      <div className="auth-form">
        <div className="empty-icon">
          <LockKeyhole size={28} />
        </div>
        <h3>계정 저장을 준비하고 있어요.</h3>
        <p className="muted">
          지금은 이 브라우저에 기록을 저장하는 체험 버전입니다. 기록을
          보관하려면 내보내기를 이용해 주세요.
        </p>
        <button className="button primary" onClick={onDone}>
          계속 체험하기
        </button>
      </div>
    );
  async function submit(e: FormEvent) {
    e.preventDefault();
    if (!client) return;
    setBusy(true);
    setError("");
    setNotice("");
    try {
      if (mode === "login") {
        const { error } = await client.auth.signInWithPassword({
          email,
          password,
        });
        if (error) throw error;
        onDone();
      } else if (mode === "signup") {
        const { data, error } = await client.auth.signUp({
          email,
          password,
          options: {
            data: { nickname: nickname.trim() },
            emailRedirectTo: `${location.origin}/auth/callback`,
          },
        });
        if (error) throw error;
        if (data.session) onDone();
        else
          setNotice(
            "확인 메일을 보냈어요. 메일의 링크를 열어 가입을 마쳐주세요.",
          );
      } else if (mode === "reset") {
        const { error } = await client.auth.resetPasswordForEmail(email, {
          redirectTo: `${location.origin}/auth/callback?recovery=1`,
        });
        if (error) throw error;
        setNotice("등록된 주소라면 비밀번호 변경 메일을 보내드려요.");
      } else {
        const { error } = await client.auth.updateUser({ password });
        if (error) throw error;
        onDone();
      }
    } catch (e) {
      const raw = e instanceof Error ? e.message : "";
      setError(
        raw.includes("Invalid login")
          ? "이메일이나 비밀번호를 확인해 주세요."
          : raw.includes("rate limit")
            ? "요청이 많아요. 잠시 뒤 다시 시도해 주세요."
            : raw.includes("Email not confirmed")
              ? "이메일의 확인 링크를 먼저 열어주세요."
              : "처리하지 못했어요. 입력한 정보와 연결 상태를 확인해 주세요.",
      );
    } finally {
      setBusy(false);
    }
  }
  return (
    <form className="auth-form" onSubmit={submit}>
      <p className="auth-intro">
        {mode === "signup"
          ? "나의 기록을 여러 기기에서 이어보세요."
          : mode === "reset"
            ? "가입한 이메일로 변경 링크를 보내드려요."
            : mode === "update"
              ? "새로운 비밀번호를 입력해 주세요."
              : "남겨둔 이야기를 이어가세요."}
      </p>
      {mode !== "update" && (
        <label>
          이메일
          <input
            type="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            autoComplete="email"
            required
            placeholder="you@example.com"
          />
        </label>
      )}
      {mode === "signup" && (
        <label>
          닉네임
          <input
            value={nickname}
            onChange={(e) => setNickname(e.target.value)}
            minLength={2}
            maxLength={40}
            required
            placeholder="공개 감상에 표시되는 이름"
            autoComplete="nickname"
          />
        </label>
      )}
      {mode !== "reset" && (
        <label>
          비밀번호
          <input
            type="password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            minLength={8}
            maxLength={128}
            required
            autoComplete={
              mode === "login" ? "current-password" : "new-password"
            }
            placeholder="8자 이상"
          />
        </label>
      )}
      {error && (
        <p className="form-error" role="alert">
          {error}
        </p>
      )}
      {notice && (
        <p className="notice" role="status">
          <Mail size={18} />
          {notice}
        </p>
      )}
      <button className="button primary full-width" disabled={busy}>
        {busy
          ? "처리 중…"
          : mode === "login"
            ? "로그인"
            : mode === "signup"
              ? "계정 만들기"
              : mode === "reset"
                ? "변경 메일 받기"
                : "새 비밀번호 저장"}
      </button>
      <div className="auth-links">
        {mode === "login" ? (
          <>
            <button
              type="button"
              className="text-button"
              onClick={() => {
                setMode("signup");
                setNotice("");
                setError("");
              }}
            >
              처음이에요
            </button>
            <button
              type="button"
              className="text-button"
              onClick={() => {
                setMode("reset");
                setNotice("");
                setError("");
              }}
            >
              비밀번호를 잊었어요
            </button>
          </>
        ) : (
          mode !== "update" && (
            <button
              type="button"
              className="text-button"
              onClick={() => {
                setMode("login");
                setNotice("");
                setError("");
              }}
            >
              로그인으로 돌아가기
            </button>
          )
        )}
      </div>
      <p className="field-hint">체험 기록은 계정으로 자동 이동하지 않아요.</p>
    </form>
  );
}
