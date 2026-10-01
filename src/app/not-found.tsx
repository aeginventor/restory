import Link from "next/link";
export default function NotFound() {
  return (
    <main className="standalone">
      <p className="brand">restory</p>
      <h1>찾을 수 없는 페이지예요.</h1>
      <p>주소가 바뀌었거나 더 이상 공개되지 않는 기록일 수 있어요.</p>
      <Link className="button primary" href="/">
        내 기록으로
      </Link>
    </main>
  );
}
