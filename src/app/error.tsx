"use client";
export default function ErrorPage({ reset }: { reset: () => void }) {
  return (
    <main className="standalone">
      <h1>화면을 불러오지 못했어요.</h1>
      <p>작성 중인 기록이 있다면 창을 닫기 전에 다시 시도해 주세요.</p>
      <button className="button primary" onClick={reset}>
        다시 시도
      </button>
    </main>
  );
}
